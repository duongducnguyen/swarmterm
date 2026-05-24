use std::sync::atomic::Ordering;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, Manager};

use crate::pty::AppState;

/// Build a 16x16 RGBA tray icon at runtime: a light rounded square with a dark
/// ">" chevron (mirrors the Electron original, no shipped asset).
fn tray_image() -> Image<'static> {
    const SIZE: usize = 16;
    let mut buf = vec![0u8; SIZE * SIZE * 4]; // RGBA, zero = transparent
    let mut set = |x: i32, y: i32, r: u8, g: u8, b: u8| {
        if x < 0 || y < 0 || x >= SIZE as i32 || y >= SIZE as i32 {
            return;
        }
        let i = (y as usize * SIZE + x as usize) * 4;
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = 255;
    };
    for y in 1..15 {
        for x in 1..15 {
            let corner = (x == 1 || x == 14) && (y == 1 || y == 14);
            if corner {
                continue;
            }
            set(x, y, 0xe4, 0xe4, 0xe7);
        }
    }
    for k in 0..4 {
        set(5 + k, 4 + k, 0x18, 0x18, 0x1b);
        set(6 + k, 4 + k, 0x18, 0x18, 0x1b);
        set(5 + k, 11 - k, 0x18, 0x18, 0x1b);
        set(6 + k, 11 - k, 0x18, 0x18, 0x1b);
    }
    Image::new_owned(buf, SIZE as u32, SIZE as u32)
}

fn show_main(app: &tauri::AppHandle) {
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
        for (_id, t) in map.iter_mut() {
            let _ = t.killer.kill();
        }
    }
    app.exit(0);
}

pub fn setup_tray(app: &App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show Command Center").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit_item]).build()?;

    TrayIconBuilder::with_id("main")
        .icon(tray_image())
        .tooltip("Command Center")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
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
