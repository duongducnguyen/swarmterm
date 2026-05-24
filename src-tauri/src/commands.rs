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
pub fn write_terminal(_state: State<'_, AppState>, _id: String, _data: String) {}

#[tauri::command]
pub fn resize_terminal(_state: State<'_, AppState>, _id: String, _cols: u16, _rows: u16) {}

#[tauri::command]
pub fn kill_terminal(_state: State<'_, AppState>, _id: String) {}
