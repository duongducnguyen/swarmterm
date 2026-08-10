// src-tauri/src/preview.rs
//
// Native child-webview previews: one webview per terminal, label
// "preview-<terminalId>", parented to the main window. The renderer owns
// bounds and visibility (the webview is glued to a placeholder div and shown
// only while that div is mounted with no overlay above it); this module owns
// creation, navigation, and turning wry callbacks into `preview:state` /
// `preview:popup` events. State flows one way: commands drive the webview,
// events update the store — the store never echoes a url back (that loop was
// the old iframe model's bug class).
use serde::{Deserialize, Serialize};
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

pub fn preview_label(terminal_id: &str) -> String {
    format!("preview-{terminal_id}")
}

/// The preview renders the open web; anything that isn't http(s) (file:,
/// javascript:, custom schemes) is refused at the navigation gate.
fn is_http(url: &url::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

/// Logical px relative to the main window — same convention the renderer's
/// getBoundingClientRect produces. camelCase to match the TS caller.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Wire shape consumed by `onPreviewState` in src/tauri/preview.ts — renames
/// break the browser column. Absent fields are omitted (not null) so the TS
/// side can use plain optional properties.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewStateEvent {
    pub terminal_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loading: Option<bool>,
}

/// Wire shape consumed by `onPreviewPopup` in src/tauri/preview.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPopupEvent {
    pub terminal_id: String,
    pub url: String,
}

/// Wire shape consumed by `onPreviewClosed` in src/tauri/preview.ts. Emitted
/// whenever Rust closes a webview outside the renderer's own `closePreview`
/// call (pane killed, shell exited on its own) — the renderer's visibility
/// effects assume a webview's lifetime is bounded by their own setup/cleanup,
/// so a Rust-side close must tell the store or the next `preview_open`
/// recreates the webview hidden with nothing left to show it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewClosedEvent {
    pub terminal_id: String,
}

fn emit_state(app: &AppHandle, ev: PreviewStateEvent) {
    let _ = app.emit("preview:state", &ev);
}

/// Create the terminal's preview webview, or navigate the existing one.
/// Created hidden: the renderer decides visibility (focused pane, no overlay)
/// via preview_set_visible, so a background agent opening a preview never
/// paints over whatever the user is looking at.
#[tauri::command]
pub fn preview_open(
    app: AppHandle,
    terminal_id: String,
    url: String,
    bounds: Bounds,
) -> Result<(), String> {
    let target: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    if !is_http(&target) {
        return Err(format!("scheme {} not allowed", target.scheme()));
    }
    let label = preview_label(&terminal_id);
    if let Some(webview) = app.get_webview(&label) {
        webview.navigate(target).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let window = app.get_window("main").ok_or("no main window")?;

    let tid_load = terminal_id.clone();
    let tid_title = terminal_id.clone();
    let tid_popup = terminal_id.clone();
    let app_popup = app.clone();
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target))
        // The gate agent-supplied and in-page navigations share; the omnibox
        // is looser (it turns junk into searches) but only ever submits http(s).
        .on_navigation(is_http)
        .on_page_load(move |webview, payload| {
            emit_state(
                webview.app_handle(),
                PreviewStateEvent {
                    terminal_id: tid_load.clone(),
                    url: Some(payload.url().to_string()),
                    title: None,
                    loading: Some(matches!(payload.event(), PageLoadEvent::Started)),
                },
            );
        })
        .on_document_title_changed(move |webview, title| {
            emit_state(
                webview.app_handle(),
                PreviewStateEvent {
                    terminal_id: tid_title.clone(),
                    url: None,
                    title: Some(title),
                    loading: None,
                },
            );
        })
        // Popups become an in-place navigation (mobile-browser style): Deny
        // the OS window, hand the URL to the renderer, which navigates this
        // same preview — session history keeps Back working.
        .on_new_window(move |url, _features| {
            if is_http(&url) {
                let _ = app_popup.emit(
                    "preview:popup",
                    &PreviewPopupEvent {
                        terminal_id: tid_popup.clone(),
                        url: url.to_string(),
                    },
                );
            }
            NewWindowResponse::Deny
        });

    // Webview creation must happen on the main thread (macOS AppKit
    // requirement; harmless elsewhere). Errors inside are logged, not
    // returned — the preview failing must never take the app down, and the
    // pop-out button remains the escape hatch (spec: fail soft).
    let pos = LogicalPosition::new(bounds.x, bounds.y);
    let size = LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0));
    let win = window.clone();
    window
        .run_on_main_thread(move || match win.add_child(builder, pos, size) {
            Ok(webview) => {
                let _ = webview.hide();
            }
            Err(e) => eprintln!("preview: add_child failed: {e}"),
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_navigate(app: AppHandle, terminal_id: String, url: String) -> Result<(), String> {
    let target: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    if !is_http(&target) {
        return Err(format!("scheme {} not allowed", target.scheme()));
    }
    if let Some(webview) = app.get_webview(&preview_label(&terminal_id)) {
        webview.navigate(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn preview_reload(app: AppHandle, terminal_id: String) {
    if let Some(webview) = app.get_webview(&preview_label(&terminal_id)) {
        let _ = webview.reload();
    }
}

// No cross-platform back/forward on tauri::Webview — driving the page's own
// session history via eval is the supported route. A back on an empty history
// is a silent no-op, which is exactly the behaviour the store's approximated
// enabled-state expects.
#[tauri::command]
pub fn preview_back(app: AppHandle, terminal_id: String) {
    if let Some(webview) = app.get_webview(&preview_label(&terminal_id)) {
        let _ = webview.eval("history.back()");
    }
}

#[tauri::command]
pub fn preview_forward(app: AppHandle, terminal_id: String) {
    if let Some(webview) = app.get_webview(&preview_label(&terminal_id)) {
        let _ = webview.eval("history.forward()");
    }
}

#[tauri::command]
pub fn preview_set_bounds(app: AppHandle, terminal_id: String, bounds: Bounds) {
    if let Some(webview) = app.get_webview(&preview_label(&terminal_id)) {
        let _ = webview.set_position(LogicalPosition::new(bounds.x, bounds.y));
        let _ = webview.set_size(LogicalSize::new(
            bounds.width.max(1.0),
            bounds.height.max(1.0),
        ));
    }
}

#[tauri::command]
pub fn preview_set_visible(app: AppHandle, terminal_id: String, visible: bool) {
    if let Some(webview) = app.get_webview(&preview_label(&terminal_id)) {
        let _ = if visible {
            webview.show()
        } else {
            webview.hide()
        };
    }
}

#[tauri::command]
pub fn preview_close(app: AppHandle, terminal_id: String) {
    if let Some(webview) = app.get_webview(&preview_label(&terminal_id)) {
        let _ = webview.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_is_prefixed_terminal_id() {
        assert_eq!(preview_label("abc-123"), "preview-abc-123");
    }

    #[test]
    fn state_event_serializes_camelcase_and_omits_absent_fields() {
        let ev = PreviewStateEvent {
            terminal_id: "t1".into(),
            url: Some("https://a/".into()),
            title: None,
            loading: Some(true),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["terminalId"], "t1");
        assert_eq!(json["url"], "https://a/");
        assert_eq!(json["loading"], true);
        assert!(json.get("title").is_none());
    }

    #[test]
    fn popup_event_serializes_camelcase() {
        let ev = PreviewPopupEvent {
            terminal_id: "t1".into(),
            url: "https://a/".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["terminalId"], "t1");
        assert_eq!(json["url"], "https://a/");
    }

    #[test]
    fn closed_event_serializes_camelcase() {
        let ev = PreviewClosedEvent {
            terminal_id: "t1".into(),
        };
        let json = serde_json::to_value(&ev).unwrap();
        assert_eq!(json["terminalId"], "t1");
    }

    #[test]
    fn http_gate_rejects_other_schemes() {
        assert!(is_http(&"http://a/".parse().unwrap()));
        assert!(is_http(&"https://a/".parse().unwrap()));
        assert!(!is_http(&"file:///etc/passwd".parse().unwrap()));
        assert!(!is_http(&"javascript:alert(1)".parse().unwrap()));
    }
}
