# Logo: 3D perspective box, Notion-style

Date: 2026-08-10
Status: approved

## Problem

The app icon is Lucide's `square-terminal` glyph on a rounded black square —
a borrowed icon, not a logo. It says "terminal" and nothing else: no volume, no
ownership, nothing that survives next to Notion, Linear or Raycast in a dock.

## Goal

A logo in the Notion register — a 3D box drawn in monoline, wearing a mark on
its front face — that reads as a terminal. Black and white only. Full size
range, both themes, production assets for every platform the app ships to.

## The mark

Drawn on a `120x120` canvas. A front face extruded up-and-left at 45 degrees,
carrying a terminal prompt.

| Parameter | Value | Rationale |
|---|---|---|
| Front face edge `S` | 64 | mark bbox is 78/120 = 65% of canvas — Notion's proportion |
| Extrusion depth `D` | 14 | enough volume; wide enough gap that 16px does not fuse |
| Corner radius `r` | 18 (28% of `S`) | same family as the rounded tiles of macOS and Windows 11 |
| Stroke width | 9.5 | thick enough to survive 16px |
| Colour | `#09090b` / `#ffffff` | matches the app background token |

Construction, in draw order:

1. The front face — a closed rounded rect, all four corners filleted.
2. The back box's two visible edges — left and top — as one open path.
3. Three depth connectors, each leaving the **45-degree point of a corner
   fillet**. That point is where a real extrusion runs tangent to the fillet;
   anchoring the connectors at the raw corner instead is what makes an extruded
   icon look like two shapes pasted on top of each other.
4. The prompt `>_` — chevron plus cursor bar, optically centred on the front
   face rather than inheriting Lucide's deliberate top-left offset.

Corners are quadratic Béziers, so a fillet's 45-degree point sits at
`corner ± 0.25r` — cheaper than arc math and visually identical at this weight.

No fills, no gradients, no colour. The mark is defined once and every asset is
a projection of it.

### Rejected

- **True isometric cube.** The most convincing volume, but the prompt has to lie
  skewed on a face — it reads as stencilling on a shipping crate, and the
  hexagonal silhouette needs nine strokes that fuse well before 16px.
- **Extruded card / stacked panes.** Lightest and best at 16px, and it tells the
  multi-pane story, but it lands closer to a duplicate icon than to a box.
- **A letter on the face**, Notion-literally. Scales best of all, and throws away
  the one thing the icon currently gets right: you can see it is a terminal.

## Assets

Geometry lives in `scripts/gen-logo.mjs` (`npm run logo`) and is committed as
static files. One number changes the stroke weight everywhere instead of five
hand-edits drifting apart.

| File | Content |
|---|---|
| `src-tauri/icon-source.svg` | `#09090b` tile + white mark — the **default**, feeds `npx tauri icon` |
| `src-tauri/icon-source-light.svg` | white tile + `#09090b` mark — docs, and macOS 26 light variants later |
| `public/favicon.svg` | adaptive: a `prefers-color-scheme` block inside the SVG flips the tile |
| `src/components/Logo.tsx` | bare mark, inline, `currentColor` |
| `docs/images/logo-dark.png`, `logo-light.png` | 256×256, for the README |

Tile radius is 22.5% of the square — Apple's squircle approximation, and
Notion's. The mark sits at 72% of the tile.

`Logo.tsx` has to be a TSX component, not an imported `.svg`: Vite resolves SVG
imports to a URL, and a URL cannot inherit `currentColor`. Its viewBox stays
`0 0 120 120`, which puts ink at 73% of the box — within a point of Lucide's
75%, so it sits correctly beside the Lucide icons already in the title bar.

## Theme

Adaptive where the platform allows it, dark by default where it does not.

- **Web surfaces** (favicon, in-app mark, README) flip with the theme.
- **Windows `.ico`, Linux, `.icns`** take exactly one icon: the dark tile. It
  keeps the identity the app already ships, and it is the right register for a
  developer tool.

## Integration

- **App icons** — `npx tauri icon src-tauri/icon-source.svg` regenerates all of
  `src-tauri/icons/`. `tauri.conf.json` is unchanged.
- **Title bar** — `TitleBar.tsx` swaps `SquareTerminal` for `<Logo />`.
- **Favicon** — `index.html` currently points at `/vite.svg` and its title is
  still "Tauri + React + Typescript". Both are fixed here. `public/vite.svg` and
  `public/tauri.svg` become dead and are deleted.
- **README** — the placehold.co tag becomes a `<picture>` with both themes;
  `docs/images/README.md` drops `logo.png` from the shot list.

Deliberately untouched:

- **`tray.rs`.** The tray icon is hand-drawn 16×16 pixel art. At that size the
  extrusion is one or two pixels and cannot be drawn; the existing art — rounded
  square, chevron, bar, no depth — is already the correct reduction of the new
  mark. Redrawing it would only make it worse.
- **`src/assets/agents/*.svg`.** Third-party brand logos, unrelated.

## Verification

- Render 16 / 24 / 32 / 48 / 128 / 512 px on both tiles and inspect. If 16px
  muddies, lower `D` or raise the stroke; the fallback is hand-authoring the
  16 and 32 px entries of the `.ico`.
- `npm test`, `npx tsc --noEmit`.
- `npm run tauri dev` — title bar mark and real window icon.

## Known limit

`npx tauri icon` scales full-bleed and leaves no macOS-style padding, so the
Dock icon renders slightly larger than a native app's. This is the repo's
existing behaviour, not a regression. Fixing it means hand-building the `.icns`
with `iconutil`; out of scope here.
