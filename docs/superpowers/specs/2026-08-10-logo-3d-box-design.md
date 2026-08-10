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

### The compact mark

At a 16px icon the art canvas spans 11.5px and the 9.5-unit stroke lands at
0.91px — below one pixel. The full mark fuses into a smudge, and neither a
heavier stroke nor a shallower extrusion recovers it: five strokes do not fit.

So rasters at or below **32 physical pixels** carry a reduced mark instead — the
prompt alone, no extrusion, stroke 12, with the tile itself standing in for the
front face. The glyph is redrawn rather than scaled up, because Lucide's chevron
is as wide as its own stroke and reads as a blob once that stroke is 1.6px.

The threshold follows physical pixels, not logical ones, so a 2x asset for a
small slot still gets the detail its pixels can hold: `ic11` (16pt @2x, 32px) is
compact while `ic12` (32pt @2x, 64px) is full.

`tray.rs` reached the same conclusion by hand for its 16x16 pixel art, which is
the strongest evidence the threshold is real and not a tuning failure.

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
| `src-tauri/icons/*` | every platform raster, via `tauri icon` |

Tile radius is 22.5% of the square — Apple's squircle approximation, and
Notion's. The mark sits at 72% of the tile.

`Logo.tsx` has to be a TSX component, not an imported `.svg`: Vite resolves SVG
imports to a URL, and a URL cannot inherit `currentColor`. It exports the
**compact** art and nothing else — the title bar at 16px is the only surface in
the app that renders the logo, and shipping an unused full-mark component would
be dead code.

The favicon likewise carries the compact mark: an SVG cannot swap art by
rendered size, and a favicon is only ever drawn at 16-32px.

`npm run logo` writes the sources, shells out to `tauri icon`, then overwrites
the three outputs where small sizes matter. `tauri icon` scales one source to
every size, so `icon.ico`, `icon.icns` and `32x32.png` come out of it as smudge
at the low end; they are rebuilt from mixed art by encoders in the same script.
Both container formats are a header plus PNG payloads, so this is a few dozen
lines and stays cross-platform — no `iconutil`, which is macOS-only.

The `.icns` is emitted with PNG chunk types only (`icp4` … `ic10`). The legacy
RLE types (`is32`/`il32` and their masks) have not been needed since 10.7 and
`iconutil` itself no longer writes them.

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

Done:

- Rasterised 16 / 20 / 24 / 32 / 48 / 64 px on both tiles and inspected at
  nearest-neighbour zoom. The full mark failed at and below 32px, which is what
  produced the compact mark above.
- Re-checked by reading the **shipped** containers back rather than re-rendering:
  every `.ico` and `.icns` entry carries the art its size calls for.
- `iconutil --convert iconset` round-trips the hand-built `.icns` and recovers
  all ten slots, so macOS accepts it.
- `npm test` (651 passing), `npx tsc --noEmit` clean.

Still to do by hand:

- `npm run tauri dev` — title bar mark and the real window and tray icons.

## Known limit

`npx tauri icon` scales full-bleed and leaves no macOS-style padding, so the
Dock icon renders slightly larger than a native app's. This is the repo's
existing behaviour, not a regression. Fixing it means hand-building the `.icns`
with `iconutil`; out of scope here.
