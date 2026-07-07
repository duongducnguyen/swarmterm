use portable_pty::PtySize;
use std::io::Write;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

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
pub fn kill_terminal(state: State<'_, AppState>, id: String) {
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
/// Frontend calls this during workspace creation when isolate=true and folder is not a git repo.
#[tauri::command]
pub async fn ensure_repo_with_commit(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::git::ensure_repo_with_commit(std::path::Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}
