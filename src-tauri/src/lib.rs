mod agents;
mod auth;
mod commands;
mod deeplink;
mod mcp;
mod git;
mod pty;
mod shell;
mod tray;
mod window_fit;

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
            // The configured 1280×820 overflows small displays (on a MacBook
            // the Dock covers the bottom edge), so clamp the window to the
            // monitor's work area and center it. The window is created with
            // `visible: false` and shown later by the renderer, so resizing
            // here never flashes.
            if let Some(win) = app.get_webview_window("main") {
                let monitor = win
                    .current_monitor()
                    .ok()
                    .flatten()
                    .or_else(|| win.primary_monitor().ok().flatten());
                if let Some(monitor) = monitor {
                    let wa = monitor.work_area();
                    let desired = win.outer_size().unwrap_or(wa.size);
                    let fit = window_fit::fit_to_work_area(
                        (wa.position.x, wa.position.y),
                        (wa.size.width, wa.size.height),
                        (desired.width, desired.height),
                    );
                    let _ = win.set_size(tauri::PhysicalSize::new(fit.width, fit.height));
                    let _ = win.set_position(tauri::PhysicalPosition::new(fit.x, fit.y));
                }
            }
            tray::setup_tray(app)?;
            // Boot the MCP server. Any failure is logged and swallowed: browser
            // preview via MCP just won't work for this run, but Swarmterm as a
            // whole still functions.
            let handle_for_mcp = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match crate::mcp::start(handle_for_mcp).await {
                    Ok(url) => eprintln!("mcp: listening on {url}"),
                    Err(e) => eprintln!("mcp: {e}"),
                }
            });
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
            commands::list_available_agents,
            commands::git_list_worktrees,
            commands::git_get_changed_files,
            commands::git_get_file_diff,
            commands::git_get_commit_info,
            commands::git_create_worktree,
            commands::git_clear_worktree,
            auth::save_auth_session,
            auth::load_auth_session,
            auth::clear_auth_session,
            mcp::commands::write_mcp_config,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS: clicking the Dock icon while the window is hidden
            // (close-to-tray) fires Reopen — re-show like the tray's "Show".
            // Other platforms get here via the single-instance plugin instead.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                crate::tray::show_main(_app);
            }
        });
}
