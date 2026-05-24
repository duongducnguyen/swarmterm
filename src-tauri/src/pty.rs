use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use portable_pty::{ChildKiller, MasterPty};
use serde::{Deserialize, Serialize};

/// Output streamed to the renderer over a per-terminal channel.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "payload")]
pub enum PtyOut {
    Data(String),
    Exit { exit_code: i32 },
}

/// Options the renderer passes when asking the backend to spawn a pty.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalOptions {
    pub cwd: Option<String>,
    pub shell: Option<String>,
    pub initial_command: Option<String>,
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
        Self { ok: false, pid: None, shell: None, error: Some(msg.into()) }
    }
}

/// A live pty the manager owns. `master` is kept for resize; `writer` for input;
/// `killer` to terminate the child from the command thread.
pub struct ManagedTerminal {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub killer: Box<dyn ChildKiller + Send + Sync>,
}

/// Global backend state managed by Tauri.
pub struct AppState {
    pub terminals: Mutex<HashMap<String, ManagedTerminal>>,
    /// Set when the user picks Quit from the tray, so close-to-tray is bypassed.
    pub quitting: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self { terminals: Mutex::new(HashMap::new()), quitting: AtomicBool::new(false) }
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
        (shell, vec![])
    }
}

/// Drain the largest valid-UTF-8 prefix from `buf`, leaving any incomplete
/// trailing multibyte sequence behind for the next read. If the leftover is too
/// long to be a single incomplete char, it is genuinely invalid, so decode the
/// whole thing lossily to avoid stalling.
pub fn take_valid_utf8(buf: &mut Vec<u8>) -> Option<String> {
    if buf.is_empty() {
        return None;
    }
    let valid_up_to = match std::str::from_utf8(buf) {
        Ok(s) => s.len(),
        Err(e) => e.valid_up_to(),
    };
    let remaining = buf.len() - valid_up_to;
    if remaining >= 4 {
        // Not an incomplete char (max 4 bytes) -> invalid bytes present; flush all.
        let s = String::from_utf8_lossy(buf).into_owned();
        buf.clear();
        return Some(s);
    }
    if valid_up_to == 0 {
        return None;
    }
    let valid: Vec<u8> = buf.drain(..valid_up_to).collect();
    Some(String::from_utf8(valid).expect("valid_up_to guarantees valid utf8"))
}
