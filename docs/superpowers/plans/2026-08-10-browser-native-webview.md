# Browser Native Webview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preview column's `<iframe>` with one native Tauri child webview per terminal, so sites that refuse framing render, and the address bar tracks real navigation.

**Architecture:** Rust `preview.rs` owns child webviews (label `preview-<terminalId>`), created via `Window::add_child` (requires the `unstable` cargo feature). Navigation state flows one way: explicit invoke commands drive the webview; builder handlers (`on_page_load`, `on_document_title_changed`, `on_navigation`, `on_new_window`) emit `preview:state` / `preview:popup` events that update `browser-store`. The renderer keeps the webview glued to a placeholder div (bounds), and visible only while that div is mounted with no overlay open.

**Tech Stack:** Tauri 2 (`unstable` feature), React 19 + TypeScript strict, zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-10-browser-native-webview-design.md`

## Global Constraints

- TypeScript is strict incl. `noUnusedLocals` / `noUnusedParameters` — dead code fails `npx tsc --noEmit`.
- TDD for `src/lib/`: write the failing test first, run it, then implement.
- `src/tauri/*` is the ONLY IPC surface — components never call `invoke` directly.
- Comments explain *why*, not *what*; match the density of `pty.rs` / `terminal-registry.ts`.
- nodeterm (BUSL) was studied for ideas only — never copy its code.
- Cross-platform: no hard-coded platform assumptions; preview commands fail soft (log + no-op) so Linux rough edges never crash the app.
- Before claiming any task done: `npm test` and `npx tsc --noEmit` from repo root; `cargo test` from `src-tauri/` if Rust was touched. Paste the output.
- Work on branch `feat/browser-native-preview`.

---

### Task 1: Omnibox `searchOrUrl` in `web-url.ts`

**Files:**
- Modify: `src/lib/web-url.ts`
- Test: `src/lib/web-url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `searchOrUrl(input: string): string | null` — Task 8's AddressBar calls this. Keep the existing `normalizeUrl` untouched for now (AddressBar still imports it until Task 8). Delete `isPreviewableUrl` (zero production callers).

Rules for `searchOrUrl` (the human omnibox — permissive on purpose; the agent/MCP path stays strict in Rust):
- empty/whitespace → `null`
- explicit `http(s)://` → parsed href; unparseable → Google search
- any other scheme (`javascript:`, `file:`, `mailto:`…) → Google search. A port is not a scheme: the regex needs a `(?!\d)` lookahead so `localhost:3000` is not treated as scheme `localhost:`.
- no whitespace AND (contains a dot OR is `localhost`/`127.0.0.1` with optional port/path) → URL; `localhost`/`127.0.0.1` get `http://` (dev servers), other hosts get `https://`
- everything else → `https://www.google.com/search?q=<encoded>`

- [ ] **Step 1: Write the failing tests** — replace the `isPreviewableUrl` describe block in `src/lib/web-url.test.ts` with:

```ts
describe('searchOrUrl', () => {
  it('passes through explicit http/https urls', () => {
    expect(searchOrUrl('http://localhost:5173')).toBe('http://localhost:5173/')
    expect(searchOrUrl('https://example.com/x')).toBe('https://example.com/x')
  })
  it('defaults localhost and loopback to http', () => {
    expect(searchOrUrl('localhost:3000')).toBe('http://localhost:3000/')
    expect(searchOrUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080/')
  })
  it('defaults dotted bare hosts to https', () => {
    expect(searchOrUrl('example.com/docs')).toBe('https://example.com/docs')
  })
  it('turns free text into a Google search', () => {
    expect(searchOrUrl('hello world')).toBe('https://www.google.com/search?q=hello%20world')
  })
  it('never navigates non-http schemes — they become searches', () => {
    expect(searchOrUrl('javascript:alert(1)')).toBe(
      'https://www.google.com/search?q=javascript%3Aalert(1)'
    )
    expect(searchOrUrl('file:///etc/passwd')).toBe(
      'https://www.google.com/search?q=file%3A%2F%2F%2Fetc%2Fpasswd'
    )
  })
  it('returns null for empty input', () => {
    expect(searchOrUrl('')).toBeNull()
    expect(searchOrUrl('   ')).toBeNull()
  })
})
```

Update the import line to `import { normalizeUrl, searchOrUrl } from './web-url'`.

- [ ] **Step 2: Run to verify failure** — `npm test -- web-url` → FAIL (`searchOrUrl` not exported).
- [ ] **Step 3: Implement** — in `src/lib/web-url.ts`, delete `isPreviewableUrl`, add:

```ts
/** `:3000` is a port, not a scheme — hence the digit lookahead. */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i
const LOOPBACK_RE = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i
const GOOGLE = 'https://www.google.com/search?q='

/**
 * The human omnibox: URL-ish input navigates, everything else searches.
 * Deliberately permissive — the strict gate for agent-supplied URLs lives in
 * Rust (`validate_preview_url`) and in the webview's on_navigation handler.
 */
export function searchOrUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).href
    } catch {
      return GOOGLE + encodeURIComponent(trimmed)
    }
  }
  // Non-http schemes (javascript:, file:, mailto:) are searched, not navigated.
  if (SCHEME_RE.test(trimmed)) return GOOGLE + encodeURIComponent(trimmed)
  const hostLike = !/\s/.test(trimmed) && (trimmed.includes('.') || LOOPBACK_RE.test(trimmed))
  if (hostLike) {
    // Dev servers are http; the public web defaults to https.
    const scheme = LOOPBACK_RE.test(trimmed) ? 'http://' : 'https://'
    try {
      return new URL(scheme + trimmed).href
    } catch {
      // fall through to search
    }
  }
  return GOOGLE + encodeURIComponent(trimmed)
}
```

- [ ] **Step 4: Run tests** — `npm test -- web-url` → PASS. Then `npm test` and `npx tsc --noEmit` (both must be clean — `isPreviewableUrl` had no callers, so nothing else breaks).
- [ ] **Step 5: Commit** — `git add src/lib/web-url.ts src/lib/web-url.test.ts && git commit -m "feat(browser): searchOrUrl omnibox parsing; drop dead isPreviewableUrl"`

---

### Task 2: `browser-store` — navigation events model

**Files:**
- Modify: `src/store/browser-store.ts`
- Test: `src/store/browser-store.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Preview` gains `loading?: boolean`; new action `applyNavState(terminalId: string, ev: { url?: string; title?: string; loading?: boolean }): void`. Task 7's registry calls it with `preview:state` payloads. Do NOT remove `goBack`/`goForward`/`navigate`/`setTitle` yet — AddressBar still uses the first two until Task 8.

History reconciliation: real navigations arrive as events (including the ones our own back/forward buttons triggered via `history.back()`), so `applyNavState` must recognise a back/forward step instead of blindly pushing:
- incoming url == current entry → url refresh only (no history change)
- incoming url == previous entry → step back (index−1)
- incoming url == next entry → step forward (index+1)
- otherwise → push (existing `pushUrl`)
- event for an unknown terminalId → no-op (a late event must never resurrect a closed preview)

- [ ] **Step 1: Write the failing tests** — append to `src/store/browser-store.test.ts`:

```ts
describe('applyNavState', () => {
  it('pushes a new url into history', () => {
    const { openPreview, applyNavState } = useBrowserStore.getState()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { url: 'http://b/' })
    const p = useBrowserStore.getState().previews['t1']
    expect(p.url).toBe('http://b/')
    expect(p.history).toEqual(['http://a/', 'http://b/'])
    expect(p.historyIndex).toBe(1)
  })
  it('recognises a back navigation instead of pushing', () => {
    const { openPreview, applyNavState } = useBrowserStore.getState()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { url: 'http://b/' })
    applyNavState('t1', { url: 'http://a/' })
    const p = useBrowserStore.getState().previews['t1']
    expect(p.history).toEqual(['http://a/', 'http://b/'])
    expect(p.historyIndex).toBe(0)
  })
  it('recognises a forward navigation', () => {
    const { openPreview, applyNavState } = useBrowserStore.getState()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { url: 'http://b/' })
    applyNavState('t1', { url: 'http://a/' })
    applyNavState('t1', { url: 'http://b/' })
    const p = useBrowserStore.getState().previews['t1']
    expect(p.history).toEqual(['http://a/', 'http://b/'])
    expect(p.historyIndex).toBe(1)
  })
  it('applies title and loading', () => {
    const { openPreview, applyNavState } = useBrowserStore.getState()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { title: 'Docs', loading: true })
    const p = useBrowserStore.getState().previews['t1']
    expect(p.title).toBe('Docs')
    expect(p.loading).toBe(true)
  })
  it('ignores events for unknown terminals — never resurrects a closed preview', () => {
    useBrowserStore.getState().applyNavState('ghost', { url: 'http://a/' })
    expect(useBrowserStore.getState().previews['ghost']).toBeUndefined()
  })
})
```

Check the file's existing beforeEach/reset pattern and follow it so previews don't leak between tests (if there is none, add `beforeEach(() => useBrowserStore.setState({ previews: {} }))` at the top of this describe).

- [ ] **Step 2: Run to verify failure** — `npm test -- browser-store` → FAIL (`applyNavState` missing).
- [ ] **Step 3: Implement** — in `src/store/browser-store.ts`: add `loading?: boolean` to `Preview`; add to `BrowserStore`:

```ts
/** Fold a `preview:state` event (real navigation/title/loading) into the store. */
applyNavState: (terminalId: string, ev: { url?: string; title?: string; loading?: boolean }) => void
```

Below `pushUrl`, add the reconciliation helper and action:

```ts
/**
 * Real navigations come back as events — including the ones our own Back/
 * Forward buttons caused via history.back() — so a url that matches the
 * neighbouring history entry moves the index instead of pushing a duplicate.
 */
function applyUrl(p: Preview, url: string): Preview {
  if (p.history[p.historyIndex] === url) return { ...p, url }
  if (p.history[p.historyIndex - 1] === url)
    return { ...p, url, historyIndex: p.historyIndex - 1 }
  if (p.history[p.historyIndex + 1] === url)
    return { ...p, url, historyIndex: p.historyIndex + 1 }
  return pushUrl(p, url)
}
```

```ts
applyNavState: (terminalId, ev) =>
  set((s) => {
    const p = s.previews[terminalId]
    if (!p) return s // late event after closePreview — must not resurrect
    let next = p
    if (ev.url !== undefined) next = applyUrl(next, ev.url)
    if (ev.title !== undefined) next = { ...next, title: ev.title }
    if (ev.loading !== undefined) next = { ...next, loading: ev.loading }
    return { previews: { ...s.previews, [terminalId]: next } }
  }),
```

- [ ] **Step 4: Run tests** — `npm test -- browser-store` → PASS; `npm test`; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add src/store/browser-store.ts src/store/browser-store.test.ts && git commit -m "feat(browser): applyNavState folds real navigation events into the store"`

---

### Task 3: Rust `preview.rs` — child webviews, commands, events

**Files:**
- Modify: `src-tauri/Cargo.toml` (line 23)
- Create: `src-tauri/src/preview.rs`
- Modify: `src-tauri/src/lib.rs` (module list + `invoke_handler`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Task 5 mirrors these exactly):
  - Commands: `preview_open(terminal_id, url, bounds)`, `preview_navigate(terminal_id, url)`, `preview_reload(terminal_id)`, `preview_back(terminal_id)`, `preview_forward(terminal_id)`, `preview_set_bounds(terminal_id, bounds)`, `preview_set_visible(terminal_id, visible)`, `preview_close(terminal_id)`; `bounds` is `{ x, y, width, height }` camelCase, logical px relative to the main window.
  - Events: `preview:state` → `{ terminalId, url?, title?, loading? }`; `preview:popup` → `{ terminalId, url }` (camelCase; omitted fields absent, not null).
  - `pub fn preview_label(terminal_id: &str) -> String` → `"preview-<id>"` (Task 4 uses it).

- [ ] **Step 1: Enable the unstable feature** — `src-tauri/Cargo.toml` line 23:

```toml
tauri = { version = "2", features = ["tray-icon", "unstable"] }
```

(`unstable` gates `Window::add_child` — the multiwebview API. This is the feature the old iframe retreat removed; the spec accepts the risk.)

- [ ] **Step 2: Write `src-tauri/src/preview.rs`** with unit tests first at the bottom:

```rust
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
        .on_navigation(|url| matches!(url.scheme(), "http" | "https"))
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
            if matches!(url.scheme(), "http" | "https") {
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
        let _ = if visible { webview.show() } else { webview.hide() };
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
    fn http_gate_rejects_other_schemes() {
        assert!(is_http(&"http://a/".parse().unwrap()));
        assert!(is_http(&"https://a/".parse().unwrap()));
        assert!(!is_http(&"file:///etc/passwd".parse().unwrap()));
        assert!(!is_http(&"javascript:alert(1)".parse().unwrap()));
    }
}
```

Exact handler signatures (`on_document_title_changed`, `on_new_window`, `NewWindowResponse` variants) may differ slightly by tauri minor version — the compiler is the source of truth; keep the behaviour (emit + Deny), adjust the signature.

- [ ] **Step 3: Register** — in `src-tauri/src/lib.rs`: add `mod preview;` to the module list (alphabetical, after `mcp`); add to `invoke_handler`:

```rust
preview::preview_open,
preview::preview_navigate,
preview::preview_reload,
preview::preview_back,
preview::preview_forward,
preview::preview_set_bounds,
preview::preview_set_visible,
preview::preview_close,
```

- [ ] **Step 4: Run** — from `src-tauri/`: `cargo test` → all pass (new tests included), `cargo build` → compiles with the `unstable` feature.
- [ ] **Step 5: Commit** — `git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/preview.rs src-tauri/src/lib.rs && git commit -m "feat(browser): native per-terminal preview webviews (unstable add_child)"`

---

### Task 4: Close the preview webview when its terminal dies

**Files:**
- Modify: `src-tauri/src/commands.rs` (`kill_terminal`, ~line 40–75)
- Modify: `src-tauri/src/pty.rs` (`read_loop`, ~line 465–483)

**Interfaces:**
- Consumes: `crate::preview::preview_label` (Task 3).
- Produces: nothing new — behaviour only. The renderer's GC sweep also calls `preview_close` (Task 8); both paths are idempotent (`get_webview` → `None` on the second call), mirroring how War-Room leave is done belt-and-braces in both places.

- [ ] **Step 1: `kill_terminal`** — in `src-tauri/src/commands.rs`, after the War-Room leave block (the `if let Some((room_id, event)) = left { … }` ending ~line 71), add:

```rust
// A dead pane's preview must not linger as an orphaned native webview
// painting over nothing. Idempotent with the renderer's GC sweep and with
// read_loop below — whoever runs second finds the label gone.
if let Some(webview) = app.get_webview(&crate::preview::preview_label(&id)) {
    let _ = webview.close();
}
```

Add `use tauri::Manager;` to the imports if `get_webview` doesn't resolve.

- [ ] **Step 2: `read_loop`** — in `src-tauri/src/pty.rs`, inside the `if let Some(state) = app.try_state::<AppState>()` cleanup block (after the war-room leave, before the closing brace ~line 481), add:

```rust
// Same preview cleanup as kill_terminal: read_loop is the path a shell
// takes when it exits on its own (typed `exit`, crashed), where no one
// called kill_terminal.
{
    use tauri::Manager;
    if let Some(webview) = app.get_webview(&crate::preview::preview_label(&id)) {
        let _ = webview.close();
    }
}
```

(If `tauri::Manager` is already imported at the top of `pty.rs`, drop the inner `use`.)

- [ ] **Step 3: Run** — from `src-tauri/`: `cargo test` → pass; `cargo build` → clean.
- [ ] **Step 4: Commit** — `git add src-tauri/src/commands.rs src-tauri/src/pty.rs && git commit -m "feat(browser): close preview webview on terminal death (both exit paths)"`

---

### Task 5: TS bridge — expand `src/tauri/preview.ts`

**Files:**
- Modify: `src/tauri/preview.ts`

**Interfaces:**
- Consumes: Task 3's commands/events (names and payload shapes must match exactly).
- Produces (Task 7's registry consumes): `previewOpen(terminalId, url, bounds)`, `previewNavigate(terminalId, url)`, `previewReload(terminalId)`, `previewBack(terminalId)`, `previewForward(terminalId)`, `previewSetBounds(terminalId, bounds)`, `previewSetVisible(terminalId, visible)`, `previewClose(terminalId)` — all `Promise<void>`; `onPreviewState(handler)`, `onPreviewPopup(handler)` returning `Promise<UnlistenFn>`; types `PreviewBoundsPayload { x: number; y: number; width: number; height: number }`, `PreviewStateEvent { terminalId: string; url?: string; title?: string; loading?: boolean }`, `PreviewPopupEvent { terminalId: string; url: string }`. `onPreviewOpen` / `PreviewOpenEvent` stay unchanged.

- [ ] **Step 1: Extend the file** — keep the existing content, add:

```ts
import { invoke } from '@tauri-apps/api/core'

/** Logical px relative to the main window — what getBoundingClientRect yields. */
export interface PreviewBoundsPayload {
  x: number
  y: number
  width: number
  height: number
}

/** Wire shape of `preview:state` — must stay in lockstep with PreviewStateEvent in preview.rs. */
export interface PreviewStateEvent {
  terminalId: string
  url?: string
  title?: string
  loading?: boolean
}

/** Wire shape of `preview:popup` — must stay in lockstep with PreviewPopupEvent in preview.rs. */
export interface PreviewPopupEvent {
  terminalId: string
  url: string
}

export function previewOpen(
  terminalId: string,
  url: string,
  bounds: PreviewBoundsPayload
): Promise<void> {
  return invoke('preview_open', { terminalId, url, bounds })
}

export function previewNavigate(terminalId: string, url: string): Promise<void> {
  return invoke('preview_navigate', { terminalId, url })
}

export function previewReload(terminalId: string): Promise<void> {
  return invoke('preview_reload', { terminalId })
}

export function previewBack(terminalId: string): Promise<void> {
  return invoke('preview_back', { terminalId })
}

export function previewForward(terminalId: string): Promise<void> {
  return invoke('preview_forward', { terminalId })
}

export function previewSetBounds(
  terminalId: string,
  bounds: PreviewBoundsPayload
): Promise<void> {
  return invoke('preview_set_bounds', { terminalId, bounds })
}

export function previewSetVisible(terminalId: string, visible: boolean): Promise<void> {
  return invoke('preview_set_visible', { terminalId, visible })
}

export function previewClose(terminalId: string): Promise<void> {
  return invoke('preview_close', { terminalId })
}

/** Subscribe to per-webview navigation/title/loading updates. */
export function onPreviewState(handler: (e: PreviewStateEvent) => void): Promise<UnlistenFn> {
  return listen<PreviewStateEvent>('preview:state', (event) => handler(event.payload))
}

/** Subscribe to denied window.open requests (popups navigate in place). */
export function onPreviewPopup(handler: (e: PreviewPopupEvent) => void): Promise<UnlistenFn> {
  return listen<PreviewPopupEvent>('preview:popup', (event) => handler(event.payload))
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → clean (new exports are allowed to be unused only if tsconfig doesn't flag unused *exports* — it doesn't; `noUnusedLocals` is about locals). `npm test` → clean.
- [ ] **Step 3: Commit** — `git add src/tauri/preview.ts && git commit -m "feat(browser): typed IPC bridge for native preview webviews"`

---

### Task 6: `preview-bounds` + `overlay-watch` lib modules

**Files:**
- Create: `src/lib/preview-bounds.ts`, Test: `src/lib/preview-bounds.test.ts`
- Create: `src/lib/overlay-watch.ts`, Test: `src/lib/overlay-watch.test.ts`

**Interfaces:**
- Consumes: `OVERLAY_SELECTOR` from `src/lib/terminal-focus.ts`.
- Produces (Tasks 7–8 consume): `toLogicalBounds(rect: { x: number; y: number; width: number; height: number }): PreviewBounds` (ints, x/y clamped ≥ 0, sizes ≥ 1); `boundsEqual(a: PreviewBounds, b: PreviewBounds | undefined): boolean`; `hasOpenOverlay(root: OverlayRoot): boolean`; `watchOverlays(cb: (open: boolean) => void): () => void` (fires immediately with the current state, then on changes).

- [ ] **Step 1: Failing tests, bounds** — `src/lib/preview-bounds.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toLogicalBounds, boundsEqual } from './preview-bounds'

describe('toLogicalBounds', () => {
  it('rounds to integers', () => {
    expect(toLogicalBounds({ x: 10.4, y: 20.6, width: 300.5, height: 199.4 })).toEqual({
      x: 10,
      y: 21,
      width: 301,
      height: 199
    })
  })
  it('clamps position to >= 0 and size to >= 1', () => {
    expect(toLogicalBounds({ x: -5, y: -0.4, width: 0, height: -10 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1
    })
  })
})

describe('boundsEqual', () => {
  it('compares by value and treats undefined as unequal', () => {
    const b = { x: 1, y: 2, width: 3, height: 4 }
    expect(boundsEqual(b, { ...b })).toBe(true)
    expect(boundsEqual(b, { ...b, width: 5 })).toBe(false)
    expect(boundsEqual(b, undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Failing tests, overlay** — `src/lib/overlay-watch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hasOpenOverlay } from './overlay-watch'

function rootWith(match: boolean): { querySelector: (s: string) => unknown } {
  return { querySelector: () => (match ? {} : null) }
}

describe('hasOpenOverlay', () => {
  it('is true when an overlay element exists', () => {
    expect(hasOpenOverlay(rootWith(true))).toBe(true)
  })
  it('is false when none exists', () => {
    expect(hasOpenOverlay(rootWith(false))).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify failure** — `npm test -- preview-bounds overlay-watch` → FAIL (modules missing).
- [ ] **Step 4: Implement `src/lib/preview-bounds.ts`:**

```ts
/**
 * Native webview bounds are set in whole logical pixels; fractional CSS rects
 * (zoomed displays, percentage panels) would drift the webview off its
 * placeholder by a pixel per update. Rounding once, here, keeps every caller
 * consistent — and a 0-sized rect (mid-layout) must never reach the OS view,
 * hence the 1px floor.
 */
export interface PreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

export function toLogicalBounds(rect: {
  x: number
  y: number
  width: number
  height: number
}): PreviewBounds {
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  }
}

/** Skip redundant IPC: bounds updates fire per animation frame while resizing. */
export function boundsEqual(a: PreviewBounds, b: PreviewBounds | undefined): boolean {
  return (
    b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}
```

- [ ] **Step 5: Implement `src/lib/overlay-watch.ts`:**

```ts
import { OVERLAY_SELECTOR } from './terminal-focus'

/**
 * A native child webview paints ABOVE every DOM element — a Radix menu or
 * dialog opened over the preview column would render underneath it. The fix is
 * to hide the webview while any overlay is open; this module is the "any
 * overlay is open" signal. Selector shared with terminal-focus.ts, which
 * already encodes which floating chrome owns the screen.
 */
export interface OverlayRoot {
  querySelector(selectors: string): unknown
}

export function hasOpenOverlay(root: OverlayRoot): boolean {
  return root.querySelector(OVERLAY_SELECTOR) !== null
}

/**
 * DOM adapter: report overlay open/close transitions. Fires the callback
 * immediately with the current state so subscribers need no separate read.
 * Radix mounts portals as direct children of body, so a subtree childList
 * observer catches every open/close; the querySelector per mutation batch is
 * microseconds.
 */
export function watchOverlays(cb: (open: boolean) => void): () => void {
  let last = hasOpenOverlay(document)
  cb(last)
  const observer = new MutationObserver(() => {
    const now = hasOpenOverlay(document)
    if (now !== last) {
      last = now
      cb(now)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
```

- [ ] **Step 6: Run tests** — `npm test -- preview-bounds overlay-watch` → PASS; `npm test`; `npx tsc --noEmit`.
- [ ] **Step 7: Commit** — `git add src/lib/preview-bounds.ts src/lib/preview-bounds.test.ts src/lib/overlay-watch.ts src/lib/overlay-watch.test.ts && git commit -m "feat(browser): bounds normalisation + overlay-open detector for the native preview"`

---

### Task 7: `preview-registry` coordinator

**Files:**
- Create: `src/lib/preview-registry.ts`

**Interfaces:**
- Consumes: Task 2's `applyNavState`, Task 5's bridge, Task 6's `toLogicalBounds`/`boundsEqual`.
- Produces (Task 8 consumes): `openPreview(terminalId, url)`, `closePreview(terminalId)`, `reloadPreview(terminalId)`, `previewGoBack(terminalId)`, `previewGoForward(terminalId)`, `syncPreviewBounds(terminalId, rect)`, `setPreviewVisible(terminalId, visible)`, `wirePreviewEvents(): () => void`.

This is the terminal-registry pattern: a side-effectful lib module that pairs store mutation with IPC, so components never sequence the two themselves. No unit test file — like `terminal-registry.ts`, its logic lives in the pure modules it composes; it is exercised by the app.

- [ ] **Step 1: Write `src/lib/preview-registry.ts`:**

```ts
import { useBrowserStore } from '@/store/browser-store'
import {
  onPreviewPopup,
  onPreviewState,
  previewBack,
  previewClose,
  previewForward,
  previewNavigate,
  previewOpen,
  previewReload,
  previewSetBounds,
  previewSetVisible
} from '@/tauri/preview'
import { boundsEqual, toLogicalBounds, type PreviewBounds } from '@/lib/preview-bounds'

/**
 * Pairs browser-store mutations with the native webview IPC so callers can't
 * get the two out of step (the terminal-registry pattern). Every IPC call
 * fails soft: on platforms where child webviews misbehave (Linux/webkitgtk)
 * the store still tracks state and the pop-out button remains the escape
 * hatch — a preview must never take the app down.
 */
const logSoft = (e: unknown): void => console.warn('preview:', e)

/**
 * Creation needs bounds before the placeholder has ever reported any (an MCP
 * open for a background pane): fall back to a hidden 1×1 — the webview is
 * created invisible and BrowserColumn syncs real bounds when it shows it.
 */
const lastBounds = new Map<string, PreviewBounds>()
const FALLBACK_BOUNDS: PreviewBounds = { x: 0, y: 0, width: 1, height: 1 }

export function openPreview(terminalId: string, url: string): void {
  useBrowserStore.getState().openPreview(terminalId, url)
  void previewOpen(terminalId, url, lastBounds.get(terminalId) ?? FALLBACK_BOUNDS).catch(logSoft)
}

export function closePreview(terminalId: string): void {
  useBrowserStore.getState().closePreview(terminalId)
  lastBounds.delete(terminalId)
  void previewClose(terminalId).catch(logSoft)
}

export function reloadPreview(terminalId: string): void {
  void previewReload(terminalId).catch(logSoft)
}

// Store updates arrive via the resulting preview:state event, not here —
// history.back() on an empty session history produces no event and no change.
export function previewGoBack(terminalId: string): void {
  void previewBack(terminalId).catch(logSoft)
}

export function previewGoForward(terminalId: string): void {
  void previewForward(terminalId).catch(logSoft)
}

export function syncPreviewBounds(
  terminalId: string,
  rect: { x: number; y: number; width: number; height: number }
): void {
  const bounds = toLogicalBounds(rect)
  if (boundsEqual(bounds, lastBounds.get(terminalId))) return
  lastBounds.set(terminalId, bounds)
  void previewSetBounds(terminalId, bounds).catch(logSoft)
}

export function setPreviewVisible(terminalId: string, visible: boolean): void {
  void previewSetVisible(terminalId, visible).catch(logSoft)
}

/** Wire native webview events into the store. Call once at app mount. */
export function wirePreviewEvents(): () => void {
  const unState = onPreviewState((e) =>
    useBrowserStore.getState().applyNavState(e.terminalId, e)
  )
  // A denied window.open navigates the same preview in place (mobile-browser
  // style): session history keeps Back working, and no native OS window can
  // pop over the terminal grid.
  const unPopup = onPreviewPopup((e) => {
    void previewNavigate(e.terminalId, e.url).catch(logSoft)
  })
  return () => {
    void unState.then((f) => f())
    void unPopup.then((f) => f())
  }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → clean; `npm test` → clean.
- [ ] **Step 3: Commit** — `git add src/lib/preview-registry.ts && git commit -m "feat(browser): preview-registry pairs store state with native webview IPC"`

---

### Task 8: UI rewiring — BrowserColumn, AddressBar, App.tsx

**Files:**
- Modify: `src/components/Browser/BrowserColumn.tsx` (full rewrite of the body)
- Modify: `src/components/Browser/AddressBar.tsx`
- Modify: `src/App.tsx` (three spots: GC sweep ~line 415, `onPreviewOpen` effect ~line 444, new `wirePreviewEvents` effect)
- Modify: `src/store/browser-store.ts` + `src/store/browser-store.test.ts` (delete now-dead actions)
- Modify: `src/lib/web-url.ts` + `src/lib/web-url.test.ts` (delete `normalizeUrl`)

**Interfaces:**
- Consumes: everything from Tasks 1–2 and 5–7.
- Produces: final UI. After this task the iframe is gone and strict TS must pass with `normalizeUrl`, `navigate`, `setTitle`, `goBack`, `goForward` removed from their modules (they are dead once the UI stops calling them; `noUnusedLocals` doesn't flag exports, so delete them explicitly — dead exports are still dead code).

- [ ] **Step 1: Rewrite `BrowserColumn.tsx`:**

```tsx
import { useEffect, useRef, type ReactElement } from 'react'
import { useAppStore } from '@/store/app-store'
import { useBrowserStore } from '@/store/browser-store'
import { findLeaf } from '@/lib/layout-tree'
import { watchOverlays } from '@/lib/overlay-watch'
import { setPreviewVisible, syncPreviewBounds } from '@/lib/preview-registry'
import { AddressBar } from './AddressBar'

/**
 * The 3rd column, scoped to the focused terminal: each terminal owns at most
 * one preview URL, so "switching tabs" is just focusing another pane. The page
 * renders in a NATIVE child webview glued to the placeholder div below —
 * that's what lets sites that refuse framing (X-Frame-Options) render at all.
 * The invariant that keeps the native view honest: it is visible iff this
 * placeholder is mounted AND no overlay (menu/dialog) is open above it.
 */
export function BrowserColumn(): ReactElement {
  const focusedTerminalId = useAppStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
    if (!ws) return null
    return findLeaf(ws.layout, ws.focusedLeafId)?.terminalId ?? null
  })
  const preview = useBrowserStore((s) =>
    focusedTerminalId ? (s.previews[focusedTerminalId] ?? null) : null
  )
  const placeholderRef = useRef<HTMLDivElement | null>(null)
  const previewTerminalId = preview && focusedTerminalId ? focusedTerminalId : null

  // Bounds: keep the native webview glued to the placeholder. ResizeObserver
  // misses position-only shifts (e.g. the macOS fullscreen chrome dodge
  // translates the whole app), so a slow interval backstops it — the registry
  // dedupes identical bounds, making the idle cost one getBoundingClientRect.
  useEffect(() => {
    if (!previewTerminalId) return
    const el = placeholderRef.current
    if (!el) return
    let raf = 0
    const sync = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        syncPreviewBounds(previewTerminalId, rect)
      })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    const backstop = window.setInterval(sync, 500)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', sync)
      window.clearInterval(backstop)
    }
  }, [previewTerminalId])

  // Visibility invariant: shown while mounted with no overlay open; hidden the
  // moment this effect tears down (panel tab switch, pane drag flipping the
  // panel to War Room, focus moving to a pane without a preview, unmount).
  useEffect(() => {
    if (!previewTerminalId) return
    const unwatch = watchOverlays((open) => setPreviewVisible(previewTerminalId, !open))
    return () => {
      unwatch()
      setPreviewVisible(previewTerminalId, false)
    }
  }, [previewTerminalId])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <AddressBar terminalId={focusedTerminalId} preview={preview} />
      <div className="flex min-h-0 flex-1 flex-col">
        {preview && focusedTerminalId ? (
          /* The native webview paints over this div; the dimmed URL beneath is
             what shows whenever the webview is suppressed (overlay open) or
             still loading its first paint — never a bare white flash. */
          <div
            ref={placeholderRef}
            className="flex min-h-0 w-full flex-1 items-center justify-center bg-muted/30"
          >
            <span className="max-w-[80%] truncate text-xs text-muted-foreground">
              {preview.title ?? preview.url}
            </span>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            No preview for this terminal
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewire `AddressBar.tsx`** — changes only (structure/styling stays):
  - Drop the `onReload` prop (update `AddressBarProps`); import `searchOrUrl` instead of `normalizeUrl`; import `openPreview`, `reloadPreview`, `previewGoBack`, `previewGoForward`, `closePreview` from `@/lib/preview-registry` instead of taking `openPreview`/`closePreview`/`goBack`/`goForward` from the store (the store hooks for those four go away).
  - `submit`: `const url = searchOrUrl(draft); if (url) openPreview(terminalId, url)`.
  - Back button `onClick`: `terminalId && previewGoBack(terminalId)`; Forward: `previewGoForward(terminalId)`; disabled logic unchanged (still reads `preview.historyIndex` / `preview.history.length`).
  - Reload button: `onClick={() => terminalId && reloadPreview(terminalId)}`, and spin while loading: `<RotateCw aria-hidden className={'h-3.5 w-3.5' + (preview?.loading ? ' animate-spin' : '')} />`.
  - Close button: `closePreview(terminalId)` (registry version).
- [ ] **Step 3: Rewire `App.tsx`:**
  - Import `{ closePreview, openPreview, wirePreviewEvents }` from `@/lib/preview-registry'` (alias if names collide: `openPreview as openPreviewNative` etc.). Remove the now-unused `useBrowserStore` import if nothing else in the file uses it.
  - GC sweep (~line 415): replace the `useBrowserStore.getState()` destructure + loop with the registry version — same shape, but `closePreview(terminalId)` now also closes the native webview:

```ts
const { previews } = useBrowserStore.getState()
for (const terminalId of Object.keys(previews)) {
  if (!live.has(terminalId)) closePreview(terminalId)
}
```

  (keep reading `previews` from the store; only the close call moves to the registry.)
  - `onPreviewOpen` effect (~line 444): `useBrowserStore.getState().openPreview(...)` → registry `openPreview(e.terminalId, e.url)`; after the `setMode('browser')` reveal, add `deferReturnFocusToTerminal()` — creating a native webview may grab OS focus, and this is the same landing-after-everyone defence the drag/menu paths use. Add `deferReturnFocusToTerminal` to the effect's dependency array (it's a stable useCallback).
  - New effect next to the other wiring effects: `useEffect(() => wirePreviewEvents(), [])`.
- [ ] **Step 4: Delete dead code** — now nothing calls them:
  - `src/store/browser-store.ts`: remove `navigate`, `setTitle`, `goBack`, `goForward` (actions + interface entries); remove their tests in `browser-store.test.ts` (keep `openPreview`/`closePreview`/`applyNavState` tests; port any history-truncation assertions worth keeping onto `applyNavState`).
  - `src/lib/web-url.ts`: remove `normalizeUrl` + its describe block in `web-url.test.ts`.
- [ ] **Step 5: Run everything** — `npm test` → all pass; `npx tsc --noEmit` → clean (this is the step that proves the dead code is really dead).
- [ ] **Step 6: Manual sanity (best effort, macOS dev machine):** `npm run tauri dev`, then: open a preview via the address bar (`github.com` — the canonical framing-refuser — must render); click a link in the page → address bar follows; Back returns; open a titlebar menu over the column → webview hides, placeholder shows; switch panel tab to Git → webview hides; kill the pane → webview closes. If dev-run isn't possible in the execution environment, state so explicitly — do not claim this step done.
- [ ] **Step 7: Commit** — `git add -A src/ && git commit -m "feat(browser): native preview webview replaces the iframe end-to-end"`

---

### Task 9: Docs — README, smoke tests, CLAUDE.md

**Files:**
- Modify: `README.md` (preview/browser feature section — grep for "preview" / "X-Frame-Options" / "pop-out")
- Modify: `docs/manual-smoke-tests.md` (browser block, ~lines 88–97)
- Modify: `CLAUDE.md` (Gotchas)

- [ ] **Step 1: README** — update the preview section: pages render in a native webview, so sites that refuse embedding (GitHub, Google, most SaaS) now work in-app; the address bar tracks in-page navigation (URL + title + real Back/Forward/Reload); page popups (`window.open` / `target=_blank`) open in place — use Back to return, or the pop-out button for a real window. Remove any wording that says such sites need the pop-out window. Keep the English user-guide voice; no architecture talk.
- [ ] **Step 2: Smoke checklist** — replace the browser items with (keep the existing checklist formatting):

```markdown
- Preview a framing-hostile site: type `github.com` in the address bar — the page must render (not a blank frame).
- Click links inside the page: the address bar URL and tab title follow; Back returns and Forward re-advances.
- Popup handling: on a page that calls `window.open` (e.g. an OAuth "sign in" link), the preview navigates in place — no OS window appears; Back returns to the opener page.
- Overlay z-order: with a preview showing, open the workspace-tab context menu and the Settings dialog — both must render ABOVE the page (the preview hides while they're open, showing the dimmed placeholder).
- Focus: have an agent call `browser.open_preview` while you type in a terminal — keystrokes keep landing in the shell.
- Resize: drag the panel separator — the page stays glued to the column with no white gaps or smearing.
- Pane switch keeps page state: two panes with previews — switching between them must not reload either page.
- Kill a pane with an open preview: the webview disappears with it; other panes' previews are untouched.
```

- [ ] **Step 3: CLAUDE.md** — in Gotchas, add a "Native preview webviews" entry (and delete any sentence claiming previews render in an iframe, if present):

```markdown
- **Native preview webviews.** The preview column is a per-terminal native
  child webview (`preview.rs`, label `preview-<terminalId>`, Tauri `unstable`
  feature for `add_child`). Invariant: a preview webview is visible iff
  BrowserColumn's placeholder div is mounted AND no overlay is open
  (`lib/overlay-watch.ts`) — native views paint over ALL DOM, so anything less
  puts a web page on top of your menus. State flows one way: commands drive
  the webview, `preview:state` events update `browser-store` (serde camelCase
  in lockstep with `src/tauri/preview.ts`); never navigate from an event.
  Back/forward are `eval("history.back()")` — there is no native API. Popups
  are denied and navigate the same preview in place. Webviews close on
  terminal death in `kill_terminal` AND `read_loop` (belt-and-braces, like the
  War Room auto-leave).
```

- [ ] **Step 4: Verify + commit** — `npm test` (docs shouldn't break it, but prove it) — then `git add README.md docs/manual-smoke-tests.md CLAUDE.md && git commit -m "docs: native preview webview — README, smoke checklist, gotchas"`

---

### Task 10: Restore the app CSP

**Files:**
- Modify: `src-tauri/tauri.conf.json` (line 27–29)

`"csp": null` existed only so the iframe could load arbitrary origins. The iframe is gone; the app webview now loads only its own assets. Native child webviews are separate documents — the app CSP does not constrain them.

- [ ] **Step 1: Set the policy:**

```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost ws://localhost:1420"
}
```

Why each piece: `style-src 'unsafe-inline'` — xterm.js and Tailwind inject inline styles; `img-src data: blob:` — icon data URIs; `connect-src ipc: http://ipc.localhost` — Tauri IPC transport on Windows/Linux; `ws://localhost:1420` — Vite HMR if the CSP is applied in dev.

- [ ] **Step 2: Verify dev** — `npm run tauri dev`: terminals spawn and render, fonts/colors intact, git panel loads, preview opens. Watch the devtools console for CSP violation reports; if a legitimate resource is blocked, widen ONLY that directive and note it in the commit message.
- [ ] **Step 3: Verify build** — `npm run build` (tsc + vite) passes; if feasible, `npm run tauri build -- --no-bundle` and launch the binary for the same sanity pass. If the prod binary can't be exercised in this environment, say so — the user smoke-tests it.
- [ ] **Step 4: Commit** — `git add src-tauri/tauri.conf.json && git commit -m "feat(security): restore app CSP now the preview iframe is gone"`

This commit is deliberately last and standalone — if anything regresses, `git revert` it without touching the feature.

---

## Self-review notes

- Spec coverage: model (T3/T7/T8), events contract (T3/T5/T2), bounds/z-order/focus defenses (T6/T8), omnibox split (T1, strict path untouched in `browser.rs`), popups (T3/T7), terminal-death cleanup (T4 + T8 sweep), iframe/dead-code removal (T8), CSP (T10), docs/smoke (T9). Pop-out button and MCP tool intentionally untouched.
- Known judgment call: `goBack`/`goForward`/`navigate`/`setTitle`/`normalizeUrl` removal is deferred to Task 8 so every intermediate task type-checks.
- Tauri handler signatures in Task 3 may need minor adjustment against the installed tauri version; behaviour (emit + Deny, http-only gate) is the contract.
