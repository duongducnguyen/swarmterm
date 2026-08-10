# Tray logo refresh + Recents dialog — design

**Date:** 2026-08-10
**Status:** approved (approach picked with user; see decisions below)

Two independent fixes shipped together:

1. The tray/menu-bar icon still shows the old Electron-era mark — `tray.rs`
   hand-draws a 16×16 light tile + chevron at runtime and never picked up the
   new 3D-box logo from `scripts/gen-logo.mjs`.
2. Welcome's Recent section's "Show all" remote-controls the title-bar search
   dropdown (`searchRequest` nonce in `recents-store`). It should open a
   dialog like the Resume-sessions `SessionsDialog` instead.

## Decisions (made with user)

- **Tray icon style:** macOS gets a **template monochrome** icon
  (`icon_as_template`, black + alpha, auto-adapts to menu-bar theme) drawn as
  a rounded-square outline carrying the compact prompt glyph — the monoline
  brand mark, menu-bar-native. Windows/Linux get the **color compact tile**
  (same art as `icons/32x32.png`).
- **Assets, not hand-drawn pixels:** `gen-logo.mjs` stays the single source of
  truth. It emits tray assets; `tray.rs` embeds them. The runtime pixel-art
  function is deleted.
- **Title-bar search stays as-is.** Only the "Show all" destination changes;
  the focus-to-dropdown quick-pick behavior of `HeaderRecentSearch` is kept.
- **RecentsDialog is its own component**, modeled on `SessionsDialog` but not
  shared with it (different selection model: pick-one vs tick-many; no agent
  rail). No generic dialog abstraction (YAGNI).

## Part 1 — Tray icon

### gen-logo.mjs

- Add a **tray art variant**: rounded-square *outline* (stroke, not filled
  tile, inset so the stroke isn't clipped) + the existing `COMPACT` prompt
  paths, all ink on transparent. This is the template mark.
- Emit two **raw RGBA** blobs (not PNG — the tauri crate is built without the
  `image-png` feature, and `tauri::image::Image::new` takes raw RGBA, so raw
  blobs avoid a new runtime decoder entirely). resvg-js exposes the rendered
  pixel buffer (`RenderedImage.pixels`), verify exact API at implementation:
  - `src-tauri/icons/tray-template-32.rgba` — tray outline art, **pure black**
    ink + alpha (macOS template images use alpha only; black is Apple's
    recommendation), 32×32.
  - `src-tauri/icons/tray-color-32.rgba` — `DARK_COMPACT` tile art
    (same as the shipped `32x32.png`), 32×32.
- 32 px = 16 pt @2x, sharp on retina. The tray-icon crate scales to the menu
  bar; verify actual scaling behavior against the vendored crate source during
  implementation and adjust raster size if it renders wrong.

### tray.rs

- Delete `tray_image()` (the hand-drawn pixel art).
- `include_bytes!` both blobs; pick per platform:
  - `#[cfg(target_os = "macos")]`: template blob + `.icon_as_template(true)`.
  - other platforms: color blob.
- Add a `#[cfg(test)]` guard test: each embedded blob's length is exactly
  `32 * 32 * 4`, so a regenerated asset with the wrong size fails `cargo test`
  instead of drawing garbage.

## Part 2 — RecentsDialog

### New component `src/components/Welcome/RecentsDialog.tsx`

Modeled on `SessionsDialog`'s hand-rolled overlay (same `role="dialog"` +
`aria-modal` so `overlay-watch` and `terminal-focus` cover it for free):

- **Layout:** single column (no rail) — search input on top (auto-focused on
  open, cleared on every open), scrollable list, footer with folder count and
  a Done button. Panel ~520px wide, same height/backdrop/border treatment as
  `SessionsDialog`.
- **Rows:** reuse the Recent row anatomy from Welcome — bold `folderName`,
  truncated full path, hover/active ✕ that calls `remove` from
  `recents-store`. Row click = **pick one**: `setWelcomeFolder(path)` then
  close the dialog.
- **Filtering:** `filterRecents` from `lib/recent-folders.ts` (already
  unit-tested; no new lib logic).
- **Dismiss:** Escape, backdrop click, Done. No arrow-key navigation in v1
  (mirrors `SessionsDialog`).
- **Empty search result:** centered "No matching folders" hint, like the
  dropdown has.

### Wiring changes

- `Welcome.tsx`: "Show all (N)" opens the dialog (`useState` local open flag,
  like `sessionsDialogOpen`); render `<RecentsDialog>` beside
  `<SessionsDialog>`. Recents are global (not per-folder), so the open flag
  is *not* reset when the folder changes.
- `recents-store.ts`: **delete** `searchRequest` + `requestSearch` (the nonce
  existed only for this remote-control).
- `HeaderRecentSearch.tsx`: delete the `searchRequest` effect. Everything
  else (focus → dropdown, filter-as-you-type, ✕ removal) stays.

## Error handling

- Tray: none at runtime — assets are compile-time embedded; the size guard
  test catches bad regeneration.
- Dialog: recents live in localStorage via the store; no async, no failure
  modes beyond an empty list (dialog is only reachable when > 5 recents
  exist, and rows removed down to zero just show the empty list until
  closed).

## Testing

- **JS:** no new `lib/` logic → no new unit tests required; existing
  `recent-folders.test.ts` covers filtering. Type-check enforces the
  dead-code removal (`searchRequest` consumers).
- **Rust:** the two blob-size tests in `tray.rs`.
- **Manual:** update `docs/manual-smoke-tests.md` — menu-bar icon shows the
  box mark and adapts to light/dark menu bar (macOS); Recent "Show all" opens
  the dialog, search/pick/remove work, Esc/backdrop/Done close it.
- **Docs:** README's Recent-folders "Show all" sentence updated to describe
  the dialog.
