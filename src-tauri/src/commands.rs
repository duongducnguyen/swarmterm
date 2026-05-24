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
    if let Some(t) = state.terminals.lock().unwrap().get_mut(&id) {
        let _ = t.killer.kill();
    }
    // The reader thread observes EOF, sends Exit, and removes the entry.
}
