# Browser preview rework: native child webview

**Date:** 2026-08-10
**Status:** Approved
**Goal:** The preview column must render sites that refuse framing
(`X-Frame-Options` / CSP `frame-ancestors`) — GitHub, Google, most SaaS —
which the current in-DOM `<iframe>` cannot. Real navigation tracking comes
with the switch.

## Background

The preview column today is a plain `<iframe>` (`BrowserColumn.tsx`). A
native-webview path existed and was removed in `530a497` ("z-order/paint
bugs, focus steal"). That implementation was a **single shared webview**
driven blind: no navigation events existed in Tauri then, so the address
bar could never sync, and every pane switch renavigated the one webview.

Tauri 2.9 now exposes what was missing: `on_page_load`, `on_navigation`,
`on_document_title_changed`, `on_new_window`, and a real
`Webview::reload()`. Child webviews (`Window::add_child`) still require the
`unstable` cargo feature.

Ideas (not code — BUSL) are borrowed from nodeterm's browser: the
"URL owned by app state, events only flow upward" contract, the
strict-vs-permissive URL parsing split, and popup handling.

## Non-goals

- Tabs, bookmarks, find-in-page, per-terminal cookie isolation, downloads
  UI, devtools chrome. The "one preview per terminal, follows the focused
  pane" model stays.
- OAuth popup windows (popups navigate in place; see below).
- Load-failure error strip: Tauri has no `did-fail-load` equivalent.
  WebView2 shows its own error page; WKWebView goes blank. Documented
  limitation, backlog.

## Design

### Model: one child webview per terminal

Each terminal with a preview gets its own child webview, label
`preview-<terminalId>`, so switching panes never loses page state
(each agent may run its own dev server). Only the focused pane's webview
is visible; focus switch = hide old, show + set bounds on new. Terminal
death closes the webview — hook the existing GC sweep in `App.tsx` and
the Rust kill/exit paths.

### Rust: `preview.rs` (reborn)

Commands: `preview_open`, `preview_navigate`, `preview_reload`,
`preview_back`, `preview_forward`, `preview_set_bounds`,
`preview_set_visible`, `preview_close`. Bounds arrive as logical px
relative to the main window (same convention as the removed version).
Back/forward remain `eval("history.back()/forward()")` — no native API.

Builder handlers, all funneled into one renderer event
`preview:state` `{ terminalId, url?, title?, loading? }`:

- `on_page_load` Started/Finished → loading flag + the real post-click URL
- `on_document_title_changed` → title (revives the dead `setTitle` path)
- `on_navigation` → allow http/https only (reuse `validate_preview_url`)
- `on_new_window` → `Deny`, emit the URL; the renderer navigates the same
  preview there (mobile-browser style; session history makes Back work)

Cargo: re-enable the `unstable` tauri feature.

### Navigation contract

`browser-store` owns the URL. The webview is only ever driven by explicit
commands; `preview:state` events flow **upward only** to update the store
and never re-drive navigation (guard: incoming url ≠ stored url → update
store; store never echoes back). App-side history is now recorded from
real navigation events, so it is accurate; back/forward enabled-state is
computed from that stack (harmless drift — back on empty history is a
no-op).

### Defenses for the three old bug classes

1. **Bounds/paint:** `BrowserColumn` renders a placeholder div;
   `ResizeObserver` + `getBoundingClientRect`, rAF-throttled, →
   `preview_set_bounds`. Separator drags track frame-by-frame.
2. **Z-order** (native view paints above all DOM): invariant — *the
   webview is visible iff the placeholder is mounted AND no overlay is
   open*. Placeholder unmount (panel tab switch, panel close, pane drag —
   which already flips the panel to War Room) → hide. A small `lib/`
   overlay detector (same spirit as `terminal-focus.ts`'s menu/dialog
   awareness) suppresses the webview while any Radix menu/dialog is open;
   while suppressed the placeholder shows a dimmed surface with the URL.
3. **Focus steal:** never call `set_focus` on a preview webview. After
   open/show/navigate, re-run the existing focus-return path
   (`selectFocusedTerminalId`). Clicking into the page is legitimate
   focus; the `data-focus-return` machinery already restores terminal
   focus on the way back.

### Omnibox (`web-url.ts` rewrite, own implementation)

Two deliberately different rules:

- **Agent/MCP path — strict** (unchanged): http/https URLs only,
  `validate_preview_url` in Rust stays the gate.
- **Human path — permissive** (`searchOrUrl`): URL-ish input navigates
  (`localhost:3000` → `http://`, bare host with a dot → `https://`),
  anything else becomes a Google search. Enter on the identical URL calls
  real reload.

### Unchanged surfaces

`AddressBar`/`RightPanel` UI structure, the MCP `browser.open_preview`
tool and `preview:open` event, the pop-out button (escape hatch for pages
that need a real window), terminal link clicks → OS browser.

### Cleanup riding along

- Delete the iframe path and the `reloadNonce` remount hack.
- Remove now-dead `isPreviewableUrl` or wire it where it belongs.
- **Restore app CSP** (`csp: null` existed only for the iframe). Final,
  separately-tested step — xterm needs inline styles, so the policy must
  be written carefully.

### Accepted risks

- Tauri `unstable` feature — the name is honest; track upstream.
- Linux/webkitgtk child webviews are rough; all preview commands fail
  soft (log + no-op) and the pop-out button remains the fallback.
- No load-failure event (see Non-goals).

## Testing

- TDD in `lib/`: omnibox parsing (`searchOrUrl`), `preview:state` →
  store transform, bounds computation.
- Rust: keep `validate_preview_url` tests; `preview.rs` is glue —
  covered by smoke tests.
- `docs/manual-smoke-tests.md`: framing-hostile site loads (github.com),
  overlays never render under the webview, agent-opened preview does not
  steal keyboard focus, separator resize stays glued.
