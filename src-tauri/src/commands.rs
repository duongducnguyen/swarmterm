use portable_pty::PtySize;
use std::io::Write;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::pty::{AppState, CreateTerminalOptions, CreateTerminalResult, PtyOut};

#[tauri::command]
pub fn create_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    options: CreateTerminalOptions,
    on_data: Channel<PtyOut>,
) -> CreateTerminalResult {
    crate::pty::spawn_terminal(&app, &state, id, options, on_data)
}

#[tauri::command]
pub fn write_terminal(state: State<'_, AppState>, id: String, data: String) {
    if let Some(t) = state.terminals.lock().unwrap().get_mut(&id) {
        let _ = t.writer.write_all(data.as_bytes());
        let _ = t.writer.flush();
    }
}

#[tauri::command]
pub fn resize_terminal(state: State<'_, AppState>, id: String, cols: u16, rows: u16) {
    if let Some(t) = state.terminals.lock().unwrap().get(&id) {
        let _ = t.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
    }
}

#[tauri::command]
pub fn kill_terminal(app: AppHandle, state: State<'_, AppState>, id: String) {
    // Take the terminal OUT of the map so its master PTY handle is dropped here,
    // rather than lingering until the reader thread cleans up. This makes the
    // reader observe EOF promptly on every platform:
    //   - Windows (ConPTY): killing the child does NOT close the output pipe while
    //     the master handle lives, so the reader would park on read() forever.
    //     Dropping the master runs ClosePseudoConsole, which closes the pipe.
    //   - Unix (macOS/Linux): the child's death already closes the slave, so the
    //     reader's own dup'd fd sees EOF regardless; dropping this master fd early
    //     is harmless.
    // Either way the reader then breaks, read_loop emits Exit and frees the id —
    // which a same-id respawn (agent/cwd/shell switch) waits for before spawning.
    //
    // The `let` binding releases the map lock BEFORE the kill/drop, so the reader
    // thread can re-lock the map to clear the id without deadlocking.
    let removed = state.terminals.lock().unwrap().remove(&id);
    if let Some(mut t) = removed {
        t.kill();
        // Dropping `t` (and its master PTY) at end of scope forces the reader's EOF.
    }
    // A dead pane must not linger as a War Room ghost: peers would still see
    // it in list_peers and queue messages for a terminal that can never read
    // them. leave_everywhere() is idempotent, so racing read_loop's cleanup
    // is harmless.
    let left = state.war_rooms.lock().unwrap().leave_everywhere(&id, crate::warroom::now_ms());
    if let Some((room_id, event)) = left {
        let _ = app.emit("warroom:event", &crate::warroom::scoped(&room_id, event));
    }
}

#[tauri::command]
pub fn list_available_shells() -> Vec<crate::shell::ShellEntry> {
    crate::shell::list_shells().to_vec()
}

#[tauri::command]
pub fn list_available_agents() -> Vec<crate::agents::AgentEntry> {
    crate::agents::list_agents()
}

#[tauri::command]
pub async fn git_list_worktrees(
    app: AppHandle,
    cwd: String,
) -> Result<Vec<crate::git::WorktreeInfo>, String> {
    let home = app.path().home_dir().map_err(|e| format!("no home dir: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::list_worktrees(std::path::Path::new(&cwd), &home)
    })
    .await
    .map_err(|e| format!("git task failed: {e}"))?
}

#[tauri::command]
pub async fn git_get_changed_files(
    worktree_path: String,
) -> Result<Vec<crate::git::ChangedFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::get_changed_files(std::path::Path::new(&worktree_path))
    })
    .await
    .map_err(|e| format!("git task failed: {e}"))?
}

#[tauri::command]
pub async fn git_get_file_diff(
    worktree_path: String,
    file: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::get_file_diff(std::path::Path::new(&worktree_path), &file)
    })
    .await
    .map_err(|e| format!("git task failed: {e}"))?
}

#[tauri::command]
pub async fn git_get_commit_info(
    worktree_path: String,
) -> Result<crate::git::CommitInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::get_commit_info(std::path::Path::new(&worktree_path))
    })
    .await
    .map_err(|e| format!("git task failed: {e}"))?
}

#[tauri::command]
pub async fn git_branch_unmerged_count(repo_root: String, branch: String) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::branch_unmerged_count(std::path::Path::new(&repo_root), &branch)
    })
    .await
    .map_err(|e| format!("git task failed: {e}"))?
}

#[tauri::command]
pub async fn git_create_worktree(
    repo_root: String,
    branch: String,
) -> Result<crate::git::CreatedWorktree, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::create_worktree(std::path::Path::new(&repo_root), &branch)
    })
    .await
    .map_err(|e| format!("git task failed: {e}"))?
}

#[tauri::command]
pub async fn git_clear_worktree(
    repo_root: String,
    worktree_path: String,
    branch: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::clear_worktree(
            std::path::Path::new(&repo_root),
            std::path::Path::new(&worktree_path),
            &branch,
        )
    })
    .await
    .map_err(|e| format!("git task failed: {e}"))?
}

/// Ensure a directory is a git repository with at least one commit.
/// Frontend calls this during workspace creation when isolate=true and the
/// folder is not yet a git repo. `home` is resolved here (like git_list_worktrees)
/// so the backend can ignore a repo that merely contains the folder.
#[tauri::command]
pub async fn ensure_repo_with_commit(app: AppHandle, path: String) -> Result<(), String> {
    let home = app.path().home_dir().map_err(|e| format!("no home dir: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::ensure_repo_with_commit(std::path::Path::new(&path), &home)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Resolve a path candidate the renderer found in terminal output. Returns the
/// canonical path as a string, or `None` when it does not name an existing file
/// — in which case the renderer does not draw a link.
#[tauri::command]
pub fn resolve_path_link(cwd: String, candidate: String) -> Option<String> {
    crate::links::resolve_candidate(std::path::Path::new(&cwd), &candidate)
        .map(|p| p.to_string_lossy().into_owned())
}

/// First of `candidates` (an allowlisted editor id) found on PATH. The renderer
/// asks once and caches; `None` means fall back to revealing in the file manager.
#[tauri::command]
pub fn find_available_editor(candidates: Vec<String>) -> Option<String> {
    let allowed: Vec<String> = candidates
        .into_iter()
        .filter(|c| crate::links::is_allowed_editor(c))
        .collect();
    let path_var = std::env::var("PATH").unwrap_or_default();
    crate::links::find_editor(&path_var, &allowed)
}

/// Launch an editor by argv. Never goes through a shell, so nothing in `args`
/// can be reinterpreted as shell syntax, and `bin` is re-checked against the
/// allowlist because the renderer is not a trust boundary.
#[tauri::command]
pub fn open_in_editor(bin: String, args: Vec<String>) -> Result<(), String> {
    if !crate::links::is_allowed_editor(&bin) {
        return Err(format!("editor not allowed: {bin}"));
    }
    std::process::Command::new(&bin)
        .args(&args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Show the file in the OS file manager. Used when no allowlisted editor is on
/// PATH. Reveal-only: the file is selected, never opened, so this can't execute
/// anything.
#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg("-R").arg(&path);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("explorer");
        c.arg(format!("/select,{path}"));
        c
    };
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut cmd = {
        // No portable "reveal" on Linux; open the containing directory instead.
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| ".".to_string());
        let mut c = std::process::Command::new("xdg-open");
        c.arg(parent);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Frontend drags a pane into one room's drop zone. Metadata is a frontend
/// snapshot: the leaf's explicit agentId and the registry's live cwd — the
/// Rust terminal map deliberately stores neither. Joining room X while
/// already a member of room Y moves it: `WarRooms::join` leaves Y first.
#[tauri::command]
pub fn war_room_join(
    app: AppHandle,
    state: State<'_, AppState>,
    room_id: String,
    terminal_id: String,
    agent_id: Option<String>,
    cwd: String,
    display_name: String,
) -> Result<(), String> {
    // TOCTOU: this liveness check and the `war_rooms.join` insert below take
    // two separate mutexes with no lock held across both, so a pane that dies
    // in the gap between them still gets inserted as a member. Accepted: it's
    // recoverable via the chip's ✕ / leave, and the alternative (a single
    // lock spanning both maps) isn't worth the coupling for a rare, low-cost
    // race — leaves a ghost member, not a stuck or corrupted state.
    if !state.terminals.lock().unwrap().contains_key(&terminal_id) {
        return Err(format!("terminal \"{terminal_id}\" is not live"));
    }
    // Without the MCP server the room's tools are unreachable — joining would
    // look successful while nothing works. Fail loudly instead (spec §failure
    // modes); the renderer logs it and the pane simply doesn't join.
    if state.mcp_url.get().is_none() {
        return Err("MCP server failed to start this run — War Room is unavailable".into());
    }
    let outcome = state.war_rooms.lock().unwrap().join(
        &room_id,
        terminal_id,
        agent_id,
        cwd,
        display_name,
        crate::warroom::now_ms(),
    )?;
    // Old room's Leave first, then the Join — the renderer's queue cleanup
    // must run before the new membership appears.
    if let Some((old_room, ev)) = outcome.left {
        let _ = app.emit("warroom:event", &crate::warroom::scoped(&old_room, ev));
    }
    let _ = app.emit("warroom:event", &crate::warroom::scoped(&room_id, outcome.joined));
    Ok(())
}

/// Full rooms snapshot for renderer hydration (boot / dev reload).
#[tauri::command]
pub fn war_room_rooms(state: State<'_, AppState>) -> Vec<crate::warroom::RoomInfo> {
    state.war_rooms.lock().unwrap().rooms_info()
}

#[tauri::command]
pub fn war_room_leave(app: AppHandle, state: State<'_, AppState>, terminal_id: String) {
    let left = state.war_rooms.lock().unwrap().leave_everywhere(&terminal_id, crate::warroom::now_ms());
    if let Some((room_id, event)) = left {
        let _ = app.emit("warroom:event", &crate::warroom::scoped(&room_id, event));
    }
}

#[tauri::command]
pub fn war_room_create(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<crate::warroom::RoomMeta, String> {
    let (meta, rooms) = {
        let mut reg = state.war_rooms.lock().unwrap();
        let meta = reg.create(&name)?;
        (meta, reg.rooms_meta())
    };
    let _ = app.emit("warroom:rooms", &rooms);
    Ok(meta)
}

#[tauri::command]
pub fn war_room_rename(
    app: AppHandle,
    state: State<'_, AppState>,
    room_id: String,
    name: String,
) -> Result<(), String> {
    let rooms = {
        let mut reg = state.war_rooms.lock().unwrap();
        reg.rename(&room_id, &name)?;
        reg.rooms_meta()
    };
    let _ = app.emit("warroom:rooms", &rooms);
    Ok(())
}

#[tauri::command]
pub fn war_room_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    room_id: String,
) -> Result<(), String> {
    let (leaves, rooms) = {
        let mut reg = state.war_rooms.lock().unwrap();
        let leaves = reg.delete(&room_id, crate::warroom::now_ms())?;
        (leaves, reg.rooms_meta())
    };
    // Leaves first (queue/held cleanup per member), snapshot last (tab strip).
    for ev in leaves {
        let _ = app.emit("warroom:event", &crate::warroom::scoped(&room_id, ev));
    }
    let _ = app.emit("warroom:rooms", &rooms);
    Ok(())
}

/// The user speaking as the Moderator of ONE room, from that room's composer.
/// Same lock-then-emit discipline; error strings surface inline in the composer.
#[tauri::command]
pub fn war_room_moderator_send(
    app: AppHandle,
    state: State<'_, AppState>,
    room_id: String,
    to: Option<String>,
    content: String,
    mode: Option<String>,
) -> Result<usize, String> {
    let mode = crate::warroom::MessageMode::parse(mode.as_deref())?;
    let (event, deliveries) = {
        let mut reg = state.war_rooms.lock().unwrap();
        let entry = reg.get(&room_id).ok_or_else(|| format!("no such room \"{room_id}\""))?;
        let out = entry.room.send(
            crate::warroom::MODERATOR_ID,
            to.as_deref(),
            &content,
            mode,
            crate::warroom::now_ms(),
        )?;
        (out.event, out.deliveries)
    };
    let delivered = deliveries.len();
    let _ = app.emit("warroom:event", &crate::warroom::scoped(&room_id, event));
    for d in deliveries {
        let _ = app.emit("warroom:deliver", &d);
    }
    Ok(delivered)
}
