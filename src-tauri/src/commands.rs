use portable_pty::PtySize;
use std::io::Write;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

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
