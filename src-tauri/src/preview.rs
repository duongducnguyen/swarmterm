// src-tauri/src/preview.rs
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl};

const LABEL: &str = "preview";

/// Bounds (logical px, relative to the main window) for the preview webview.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Create the preview webview if absent, otherwise navigate it, and position it.
#[tauri::command]
pub fn preview_show(app: AppHandle, url: String, bounds: Bounds) -> Result<(), String> {
    let window = app.get_window("main").ok_or("no main window")?;
    let pos = LogicalPosition::new(bounds.x, bounds.y);
    let size = LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0));
    let target: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    if let Some(webview) = app.get_webview(LABEL) {
        webview.navigate(target).map_err(|e| e.to_string())?;
        webview.set_position(pos).map_err(|e| e.to_string())?;
        webview.set_size(size).map_err(|e| e.to_string())?;
        let _ = webview.show();
        return Ok(());
    }

    let builder = tauri::webview::WebviewBuilder::new(LABEL, WebviewUrl::External(target));
    window.add_child(builder, pos, size).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn preview_set_bounds(app: AppHandle, bounds: Bounds) {
    if let Some(webview) = app.get_webview(LABEL) {
        let _ = webview.set_position(LogicalPosition::new(bounds.x, bounds.y));
        let _ = webview.set_size(LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)));
    }
}

#[tauri::command]
pub fn preview_navigate(app: AppHandle, url: String) -> Result<(), String> {
    let webview = app.get_webview(LABEL).ok_or("no preview webview")?;
    let target: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    webview.navigate(target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_reload(app: AppHandle) {
    if let Some(webview) = app.get_webview(LABEL) {
        let _ = webview.eval("location.reload()");
    }
}

#[tauri::command]
pub fn preview_back(app: AppHandle) {
    if let Some(webview) = app.get_webview(LABEL) {
        let _ = webview.eval("history.back()");
    }
}

#[tauri::command]
pub fn preview_forward(app: AppHandle) {
    if let Some(webview) = app.get_webview(LABEL) {
        let _ = webview.eval("history.forward()");
    }
}

#[tauri::command]
pub fn preview_set_visible(app: AppHandle, visible: bool) {
    if let Some(webview) = app.get_webview(LABEL) {
        let _ = if visible { webview.show() } else { webview.hide() };
    }
}

#[tauri::command]
pub fn preview_close(app: AppHandle) {
    if let Some(webview) = app.get_webview(LABEL) {
        let _ = webview.close();
    }
}
