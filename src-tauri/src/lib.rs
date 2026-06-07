mod auth;
mod commands;
mod deeplink;
mod pty;
mod shell;
mod tray;

use pty::AppState;
use std::sync::atomic::Ordering;
use tauri::Manager;
use tauri::WindowEvent;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            // On Windows/Linux a deep link to a running instance arrives as a CLI arg.
            let uris: Vec<String> = args
                .into_iter()
                .filter(|a| a.starts_with("swarmterm://"))
                .collect();
            if !uris.is_empty() {
                crate::deeplink::handle_uris(app, &uris);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            tray::setup_tray(app)?;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let uris: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                crate::deeplink::handle_uris(&handle, &uris);
            });
            #[cfg(any(windows, target_os = "linux"))]
            {
                let _ = app.deep_link().register("swarmterm");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                if !state.quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::kill_terminal,
            commands::list_available_shells,
            auth::save_auth_session,
            auth::load_auth_session,
            auth::clear_auth_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
