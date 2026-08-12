use std::sync::atomic::Ordering;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Emitter, Manager};

use crate::pty::AppState;

/// Tray marks are rendered by `scripts/gen-logo.mjs` (`npm run logo`) as raw
/// straight-alpha RGBA: this crate is built without tauri's `image-png`
/// feature, so a PNG asset would need a decoder the runtime doesn't have —
/// raw bytes feed `Image::new` directly.
const TRAY_PX: u32 = 32;
/// macOS shows the icon as a template image (alpha only, black ink), so the
/// mark follows the menu bar's light/dark appearance like the system icons.
#[cfg(target_os = "macos")]
const TRAY_MARK: &[u8] = include_bytes!("../icons/tray-template-32.rgba");
/// Windows/Linux trays keep color: the same compact tile as the app icon.
#[cfg(not(target_os = "macos"))]
const TRAY_MARK: &[u8] = include_bytes!("../icons/tray-color-32.rgba");

fn tray_image() -> Image<'static> {
    Image::new(TRAY_MARK, TRAY_PX, TRAY_PX)
}

pub fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Kill every pty, then exit the process for good.
fn quit(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    state.quitting.store(true, Ordering::SeqCst);
    // Use `if let Ok` rather than `unwrap` so the process still exits even if the
    // terminals lock was somehow poisoned.
    if let Ok(mut map) = state.terminals.lock() {
        for t in map.values_mut() {
            let _ = t.killer.kill();
        }
    }
    app.exit(0);
}

pub fn setup_tray(app: &App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show Swarmterm").build(app)?;
    let check_updates =
        MenuItemBuilder::with_id("check-updates", "Check for Updates…").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &check_updates, &quit_item])
        .build()?;

    TrayIconBuilder::with_id("main")
        .icon(tray_image())
        // No-op off macOS, so `cfg!` beats a second attribute-gated builder
        // statement for readability.
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Swarmterm")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "check-updates" => {
                // Surface the window first: the result renders as an in-app
                // toast, and a toast inside a hidden window is a check that
                // never happened.
                show_main(app);
                let _ = app.emit("updater:check-requested", ());
            }
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `Image::new` trusts the declared dimensions — a regenerated blob of
    /// the wrong size would render as sheared garbage rather than fail, so
    /// pin the byte count to the declared 32×32 RGBA.
    #[test]
    fn tray_blob_matches_declared_size() {
        assert_eq!(TRAY_MARK.len(), (TRAY_PX * TRAY_PX * 4) as usize);
    }
}
