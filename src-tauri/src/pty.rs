use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

/// Windows Job Object helper. Killing a pty's shell with `TerminateProcess`
/// leaves its child/grandchild processes running (Windows does not cascade a
/// kill down the tree). Putting the shell in a job created with
/// `KILL_ON_JOB_CLOSE` means terminating — or merely dropping — the job tears
/// down every descendant, so closing a pane/workspace actually frees the CPU+RAM.
#[cfg(windows)]
mod job {
    use std::ffi::c_void;
    use std::mem;
    use std::ptr;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    /// Owns a kill-on-close job handle. On drop the last handle closes, which
    /// terminates any process still in the job — a safety net against orphans.
    pub struct JobHandle(HANDLE);

    // A job handle is an opaque kernel handle; it is sound to move/share across
    // threads (it lives in the Mutex-guarded terminal map).
    unsafe impl Send for JobHandle {}
    unsafe impl Sync for JobHandle {}

    impl JobHandle {
        /// Create a kill-on-close job and place process `pid` in it. Every process
        /// the shell spawns afterwards inherits the job, so the whole tree is
        /// captured. Returns `None` if any Win32 step fails (caller degrades to
        /// the plain single-process kill).
        pub fn capturing(pid: u32) -> Option<Self> {
            unsafe {
                let job = CreateJobObjectW(ptr::null(), ptr::null());
                if job.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let set = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const c_void,
                    mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if set == 0 {
                    CloseHandle(job);
                    return None;
                }
                let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
                if proc.is_null() {
                    CloseHandle(job);
                    return None;
                }
                let assigned = AssignProcessToJobObject(job, proc);
                CloseHandle(proc);
                if assigned == 0 {
                    CloseHandle(job);
                    return None;
                }
                Some(JobHandle(job))
            }
        }

        /// Immediately terminate the shell and all of its descendants.
        pub fn terminate(&self) {
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for JobHandle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

/// Output streamed to the renderer over a per-terminal channel.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "payload")]
pub enum PtyOut {
    Data(String),
    Exit {
        #[serde(rename = "exitCode")]
        exit_code: i32,
    },
}

/// Options the renderer passes when asking the backend to spawn a pty.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalOptions {
    pub cwd: Option<String>,
    pub shell_id: Option<String>,
    pub initial_command: Option<String>,
    /// Whether the owning workspace enables MCP worktree tools for this pty.
    pub worktree_mode: Option<bool>,
    /// The workspace's repo folder, recorded so worktree tools can resolve the
    /// main root even when this pane's own cwd is a linked worktree.
    pub repo_root: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

/// Flat result mirroring the original TS discriminated union (`ok` / `error`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalResult {
    pub ok: bool,
    pub pid: Option<u32>,
    pub shell: Option<String>,
    pub error: Option<String>,
}

impl CreateTerminalResult {
    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            pid: None,
            shell: None,
            error: Some(msg.into()),
        }
    }
}

/// A live pty the manager owns. `master` is kept for resize; `writer` for input;
/// `killer` to terminate the child from the command thread. On Windows `job`
/// (when set) owns the shell's whole process tree so closing the terminal frees
/// every descendant, not just the shell.
pub struct ManagedTerminal {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub killer: Box<dyn ChildKiller + Send + Sync>,
    #[cfg(windows)]
    pub job: Option<job::JobHandle>,
    pub worktree_mode: bool,
    pub repo_root: Option<String>,
}

impl ManagedTerminal {
    /// Terminate the terminal's whole process tree. On Windows this nukes the job
    /// (shell + every descendant); the `killer` call is a fallback for when the
    /// job could not be created and on non-Windows platforms.
    pub fn kill(&mut self) {
        #[cfg(windows)]
        if let Some(job) = &self.job {
            job.terminate();
        }
        let _ = self.killer.kill();
    }
}

/// Global backend state managed by Tauri.
pub struct AppState {
    pub terminals: Mutex<HashMap<String, ManagedTerminal>>,
    /// Set when the user picks Quit from the tray, so close-to-tray is bypassed.
    pub quitting: AtomicBool,
    /// The MCP server's Streamable-HTTP endpoint URL. Set once by `mcp::start`
    /// at app boot; read by `spawn_terminal` to seed each shell's env, and by
    /// nothing else. `OnceLock` is used so the read side needs no lock; if the
    /// server failed to bind the cell stays empty and `spawn_terminal` skips
    /// the env injection (browser preview via MCP just won't work).
    pub mcp_url: OnceLock<Arc<str>>,
    /// War Room membership + inboxes, now multiple independent rooms. Its own
    /// lock (never nested with `terminals`) so MCP tools keep the
    /// lock-read-drop-before-await rule.
    pub war_rooms: Mutex<crate::warroom::WarRooms>,
    /// Panes an MCP client has actually spoken to us from. Its own lock, never
    /// nested with `terminals` or `war_rooms`, because the `/mcp` middleware
    /// touches it on every inbound request and must not contend with pty I/O.
    pub mcp_clients: Mutex<crate::mcp::clients::McpClients>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
            quitting: AtomicBool::new(false),
            mcp_url: OnceLock::new(),
            war_rooms: Mutex::new(crate::warroom::WarRooms::default()),
            mcp_clients: Mutex::new(crate::mcp::clients::McpClients::default()),
        }
    }
}

/// The platform default shell and its launch args.
pub fn default_shell() -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        // -NoLogo drops PowerShell's startup banner so panes open clean.
        ("powershell.exe".to_string(), vec!["-NoLogo".to_string()])
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let args = login_args(&shell);
        (shell, args)
    }
}

/// Args that make `shell` start as a *login* shell, or empty if we don't
/// recognise it.
///
/// This matters far more than it looks: a non-login zsh reads neither
/// `/etc/zprofile` (where macOS runs `path_helper`, the source of
/// `/usr/local/bin`) nor `~/.zprofile` (where Homebrew's installer writes
/// `brew shellenv`, the source of `/opt/homebrew/bin`). Panes would inherit
/// only the stub PATH the GUI process was launched with, so `brew`, `gh`,
/// `node`, `docker`… all come back "command not found" while Terminal.app on
/// the same machine works. Every mainstream emulator (Terminal.app, iTerm2,
/// Ghostty, WezTerm, Alacritty) starts a login shell for this reason.
///
/// Unknown shells get no args on purpose: an exotic shell that rejects `-l`
/// would exit immediately and leave a dead pane, which is a worse failure than
/// a short PATH.
#[cfg(not(windows))]
pub fn login_args(shell: &str) -> Vec<String> {
    // Compare on the file name only — `$SHELL` is an absolute path, and some
    // installs carry a version suffix (`bash-5.2`).
    let name = std::path::Path::new(shell)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| shell.to_string());
    let stem = name.split('-').next().unwrap_or(&name);
    match stem {
        // `-l` is the login flag for all of these (fish and csh included).
        "sh" | "bash" | "zsh" | "fish" | "ksh" | "mksh" | "dash" | "csh" | "tcsh" => {
            vec!["-l".to_string()]
        }
        _ => vec![],
    }
}

/// Drain the largest valid-UTF-8 prefix from `buf`, leaving any incomplete
/// trailing multibyte sequence behind for the next read. Bytes that cannot begin
/// or continue a valid sequence are genuinely invalid, so they are flushed
/// lossily immediately rather than stalling the stream waiting for a completion
/// that will never come.
pub fn take_valid_utf8(buf: &mut Vec<u8>) -> Option<String> {
    if buf.is_empty() {
        return None;
    }
    let valid_up_to = match std::str::from_utf8(buf) {
        Ok(s) => s.len(),
        Err(e) => e.valid_up_to(),
    };
    if valid_up_to == 0 {
        // Nothing decodes yet. Wait for more bytes only if the leading byte could
        // plausibly start a multibyte sequence and we haven't already buffered a
        // full char's worth (max 4 bytes). Otherwise the bytes are invalid —
        // flush lossily so the stream never stalls.
        // The three ranges are the 2-, 3- and 4-byte UTF-8 lead classes. They
        // happen to be contiguous, but they are kept split so the classes stay
        // legible next to the UTF-8 spec.
        #[allow(clippy::manual_range_patterns)]
        let leads_multibyte = matches!(buf[0], 0xC2..=0xDF | 0xE0..=0xEF | 0xF0..=0xF4);
        if leads_multibyte && buf.len() < 4 {
            return None;
        }
        let s = String::from_utf8_lossy(buf).into_owned();
        buf.clear();
        return Some(s);
    }
    let s = std::str::from_utf8(&buf[..valid_up_to])
        .expect("valid_up_to guarantees valid utf8")
        .to_owned();
    buf.drain(..valid_up_to);
    Some(s)
}

const READ_BUF_BYTES: usize = 64 * 1024;

/// Spawn a pty, register it in state, and start a reader thread that streams
/// decoded output (and finally the exit code) over `on_data`.
pub fn spawn_terminal(
    app: &AppHandle,
    state: &AppState,
    id: String,
    options: CreateTerminalOptions,
    on_data: Channel<PtyOut>,
) -> CreateTerminalResult {
    if state.terminals.lock().unwrap().contains_key(&id) {
        return CreateTerminalResult::err(format!("Terminal \"{id}\" already exists"));
    }

    let resolved = options
        .shell_id
        .as_deref()
        .and_then(crate::shell::resolve_shell);
    let (shell, args) = resolved.clone().unwrap_or_else(default_shell);

    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: options.rows,
        cols: options.cols,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(e) => return CreateTerminalResult::err(e.to_string()),
    };

    let mut cmd = CommandBuilder::new(&shell);
    for a in &args {
        cmd.arg(a);
    }
    // Inherit the parent environment, then advertise truecolor so CLIs emit
    // 24-bit color sequences that ConPTY forwards and xterm renders verbatim.
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM", "xterm-256color");
    // Ask the shell to report its working directory on every prompt (OSC 7), so
    // relative path links stay resolvable after a `cd`. bash is the only shell we
    // have to arrange this for via the environment: macOS zsh already emits OSC 7
    // from /etc/zshrc and fish does it natively. PowerShell has no environment
    // hook — it falls back to the spawn cwd, so relative links there stop
    // resolving once the user cds away. Prepend rather than replace so a
    // user-configured PROMPT_COMMAND still runs.
    if shell.to_lowercase().contains("bash") {
        let osc7 = r#"printf '\033]7;file://%s%s\033\\' "${HOSTNAME:-}" "$PWD""#;
        let existing = std::env::var("PROMPT_COMMAND").unwrap_or_default();
        let combined = if existing.is_empty() {
            osc7.to_string()
        } else {
            format!("{osc7}; {existing}")
        };
        cmd.env("PROMPT_COMMAND", combined);
    }
    // Identify this session to in-terminal processes so an in-terminal agent
    // can call Swarmterm's MCP server. `id` is the terminalId — a random UUID
    // that only this shell's env sees — and doubles as the unguessable bearer
    // token authorising the MCP call. `SWARMTERM_MCP_URL` points at the
    // Streamable-HTTP endpoint bound at app boot; if the server failed to
    // bind, we skip the URL var (agents just won't have the swarmterm server
    // available) but still set the session so future subsystems can use it.
    cmd.env("SWARMTERM_SESSION", &id);
    if let Some(url) = state.mcp_url.get() {
        cmd.env("SWARMTERM_MCP_URL", url.as_ref());
    }
    let cwd = options.cwd.clone().unwrap_or_else(|| {
        app.path()
            .home_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| ".".to_string())
    });
    cmd.cwd(cwd);

    // Clone worktree options to locals so they're available at the insert point.
    let worktree_mode = options.worktree_mode.unwrap_or(false);
    let repo_root = options.repo_root.clone();

    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => return CreateTerminalResult::err(e.to_string()),
    };
    let pid = child.process_id();
    let killer = child.clone_killer();

    let mut writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            // The child already spawned; don't leave it orphaned.
            let _ = child.clone_killer().kill();
            return CreateTerminalResult::err(e.to_string());
        }
    };
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            let _ = child.clone_killer().kill();
            return CreateTerminalResult::err(e.to_string());
        }
    };

    // Capture the shell in a job BEFORE running any command, so every process the
    // command tree spawns is born inside the job and dies with it.
    #[cfg(windows)]
    let job = pid.and_then(job::JobHandle::capturing);

    // Run the template's first command (clearing the screen first for the
    // platform default shell so the prompt/echo don't linger above the program).
    if let Some(ic) = &options.initial_command {
        let line = if resolved.is_some() {
            format!("{ic}\r")
        } else {
            let clear = if cfg!(windows) { "Clear-Host" } else { "clear" };
            format!("{clear}; {ic}\r")
        };
        let _ = writer.write_all(line.as_bytes());
        let _ = writer.flush();
    }

    state.terminals.lock().unwrap().insert(
        id.clone(),
        ManagedTerminal {
            writer,
            master: pair.master,
            killer,
            #[cfg(windows)]
            job,
            worktree_mode,
            repo_root,
        },
    );

    let app = app.clone();
    std::thread::spawn(move || {
        read_loop(app, id, reader, child, on_data);
    });

    CreateTerminalResult {
        ok: true,
        pid,
        shell: Some(shell),
        error: None,
    }
}

/// Blocking read loop: stream decoded output, then wait for exit and clean up.
fn read_loop(
    app: AppHandle,
    id: String,
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn portable_pty::Child + Send + Sync>,
    on_data: Channel<PtyOut>,
) {
    let mut pending: Vec<u8> = Vec::new();
    let mut chunk = vec![0u8; READ_BUF_BYTES];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
            Ok(n) => {
                pending.extend_from_slice(&chunk[..n]);
                if let Some(text) = take_valid_utf8(&mut pending) {
                    let _ = on_data.send(PtyOut::Data(text));
                }
            }
        }
    }
    // Flush any trailing bytes (lossily) so nothing is lost.
    if !pending.is_empty() {
        let _ = on_data.send(PtyOut::Data(String::from_utf8_lossy(&pending).into_owned()));
    }
    let exit_code = child.wait().map(|s| s.exit_code() as i32).unwrap_or(-1);

    // Remove from the registry BEFORE notifying the renderer: a retry triggered by
    // the exit event must find the id free, since create rejects a duplicate live id.
    if let Some(state) = app.try_state::<AppState>() {
        state.terminals.lock().unwrap().remove(&id);
        state.mcp_clients.lock().unwrap().forget(&id);
        let left = state
            .war_rooms
            .lock()
            .unwrap()
            .leave_everywhere(&id, crate::warroom::now_ms());
        if let Some((room_id, event)) = left {
            use tauri::Emitter;
            let _ = app.emit("warroom:event", &crate::warroom::scoped(&room_id, event));
        }
        // Same preview cleanup as kill_terminal: read_loop is the path a shell
        // takes when it exits on its own (typed `exit`, crashed), where no one
        // called kill_terminal.
        {
            use tauri::Manager;
            if let Some(webview) = app.get_webview(&crate::preview::preview_label(&id)) {
                let _ = webview.close();
            }
        }
    }
    let _ = on_data.send(PtyOut::Exit { exit_code });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shell_is_nonempty() {
        let (cmd, _args) = default_shell();
        assert!(!cmd.is_empty());
    }

    #[cfg(not(windows))]
    #[test]
    fn default_shell_is_a_login_shell() {
        let (_cmd, args) = default_shell();
        assert!(
            args.iter().any(|a| a == "-l"),
            "unix panes must spawn a login shell, got args {args:?}"
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn login_args_cover_the_common_posix_shells() {
        for shell in [
            "/bin/zsh",
            "/bin/bash",
            "/bin/sh",
            "/opt/homebrew/bin/fish",
            "/bin/ksh",
        ] {
            assert_eq!(login_args(shell), vec!["-l".to_string()], "{shell}");
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn login_args_are_empty_for_unknown_shells() {
        // An unrecognised shell may reject `-l` and leave the pane dead on
        // arrival; no args is the safe fallback.
        assert!(login_args("/usr/local/bin/nu").is_empty());
        assert!(login_args("/usr/bin/xonsh").is_empty());
    }

    #[cfg(not(windows))]
    #[test]
    fn login_args_ignore_the_directory_and_version_suffix() {
        assert_eq!(login_args("zsh"), vec!["-l".to_string()]);
        assert_eq!(
            login_args("/usr/local/bin/bash-5.2"),
            vec!["-l".to_string()]
        );
    }

    #[test]
    fn take_valid_utf8_returns_complete_prefix_and_holds_partial_tail() {
        // "é" is 0xC3 0xA9; feed only the first byte after an ascii char.
        let mut buf = vec![b'h', b'i', 0xC3];
        let out = take_valid_utf8(&mut buf).unwrap();
        assert_eq!(out, "hi");
        assert_eq!(buf, vec![0xC3]); // incomplete tail retained
    }

    #[test]
    fn take_valid_utf8_completes_across_chunks() {
        let mut buf = vec![0xC3, 0xA9]; // full "é"
        let out = take_valid_utf8(&mut buf).unwrap();
        assert_eq!(out, "é");
        assert!(buf.is_empty());
    }

    #[test]
    fn take_valid_utf8_flushes_long_invalid_runs() {
        let mut buf = vec![0xFF, 0xFE, 0xFD, 0xFC, 0xFB];
        let out = take_valid_utf8(&mut buf).unwrap();
        assert!(!out.is_empty()); // lossy, but does not stall
        assert!(buf.is_empty());
    }

    #[test]
    fn take_valid_utf8_flushes_short_invalid_runs() {
        let mut buf = vec![0xFF, 0xFE, 0xFD]; // 3 invalid bytes, not a multibyte lead
        let out = take_valid_utf8(&mut buf).unwrap();
        assert!(!out.is_empty());
        assert!(buf.is_empty()); // flushed immediately, not stalled
    }
}
