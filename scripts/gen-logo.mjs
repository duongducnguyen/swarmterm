/**
 * Single source of truth for the Swarmterm logo.
 *
 * The mark is a monoline box extruded up-and-left at 45 degrees, carrying a
 * terminal prompt on its front face. Every shipped asset — app icon source,
 * favicon, the in-app React component, the README rasters — is a projection of
 * the geometry below, so a weight or depth tweak is one number here rather than
 * five hand-edits drifting out of sync.
 *
 * Run with `npm run logo`.
 */
import { Resvg } from '@resvg/resvg-js'
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// --- Geometry -------------------------------------------------------------

/** Art canvas. Every coordinate below lives in this box. */
const CANVAS = 120
/** Front face edge. */
const S = 64
/** Extrusion depth, applied equally on x and y for a 45-degree recession. */
const DEPTH = 14
/** Corner radius, 28% of the face — same family as macOS/Windows 11 tiles. */
const RADIUS = 18
/** Stroke weight, thick enough to survive a 16px raster. */
const STROKE = 9.5

const INK = '#09090b'
const PAPER = '#ffffff'

/** Fraction of a tile the art canvas spans. */
const TILE_FILL = 0.72
/** Tile corner radius as a fraction of its edge — Apple's squircle approximation. */
const TILE_RADIUS = 0.225

const trim = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s)
const f = (n) => trim(n.toFixed(2))
/** Transforms need more digits than path data: the scale multiplies out. */
const f4 = (n) => trim(n.toFixed(4))
const p = ([x, y]) => `${f(x)} ${f(y)}`

/** Closed rounded rect, quadratic fillets. */
function facePath(x, y, r) {
  const [x1, y1] = [x + S, y + S]
  if (r <= 0) return `M${p([x, y])} L${p([x1, y])} L${p([x1, y1])} L${p([x, y1])} Z`
  return (
    `M${p([x + r, y])} L${p([x1 - r, y])} Q${p([x1, y])} ${p([x1, y + r])} ` +
    `L${p([x1, y1 - r])} Q${p([x1, y1])} ${p([x1 - r, y1])} ` +
    `L${p([x + r, y1])} Q${p([x, y1])} ${p([x, y1 - r])} ` +
    `L${p([x, y + r])} Q${p([x, y])} ${p([x + r, y])} Z`
  )
}

/**
 * The 45-degree point of a quadratic fillet, where a real extrusion runs
 * tangent to the corner. Anchoring the depth lines at the raw corner instead is
 * what makes an extruded icon read as two shapes pasted on top of each other.
 * For Q(P0, C, P2) the midpoint is 0.25*P0 + 0.5*C + 0.25*P2, which on a
 * 90-degree corner collapses to `corner + 0.25r` along each inward axis.
 */
const fillet = ([cx, cy], sx, sy, r) => [cx + sx * 0.25 * r, cy + sy * 0.25 * r]

/** The back box contributes only its left and top edges; the rest is occluded. */
function backPath(bx, by, r) {
  const bl = [bx, by + S]
  const tl = [bx, by]
  const tr = [bx + S, by]
  if (r <= 0) return { d: `M${p(bl)} L${p(tl)} L${p(tr)}`, bl, tl, tr }
  const mBL = fillet(bl, +1, -1, r)
  const mTR = fillet(tr, -1, +1, r)
  const d =
    // second half of the bottom-left fillet, starting at its 45-degree point
    `M${p(mBL)} Q${p([bx, by + S - 0.5 * r])} ${p([bx, by + S - r])} ` +
    `L${p([bx, by + r])} Q${p(tl)} ${p([bx + r, by])} ` +
    `L${p([bx + S - r, by])} Q${p([bx + S - 0.5 * r, by])} ${p(mTR)}`
  return { d, bl: mBL, tl: fillet(tl, +1, +1, r), tr: mTR }
}

/**
 * Terminal prompt, optically centred on the front face. Lucide's own
 * `square-terminal` sits deliberately high and left — text starting at the top
 * of a screen — which reads as a mistake once the glyph is the only thing on a
 * logo's face.
 */
function glyphPaths(fx, fy) {
  const k = S / 64
  const at = (x, y) => [fx + x * k, fy + y * k]
  return [
    `M${p(at(17.78, 35.55))} L${p(at(24.89, 28.44))} L${p(at(17.78, 21.33))}`,
    `M${p(at(32, 42.67))} L${p(at(46.22, 42.67))}`,
  ]
}

/** Every path of the mark, in draw order. */
function markPaths({ depth = DEPTH, r = RADIUS } = {}) {
  const fx = (CANVAS - (S + depth)) / 2 + depth
  const back = backPath(fx - depth, fx - depth, r)
  const connector = (a) => `M${p(a)} L${p([a[0] + depth, a[1] + depth])}`
  return [
    facePath(fx, fx, r),
    back.d,
    connector(back.bl),
    connector(back.tl),
    connector(back.tr),
    ...glyphPaths(fx, fx),
  ]
}

/**
 * Reduced-detail mark for small rasters.
 *
 * At a 16px icon the art canvas spans 11.5px and the 9.5-unit stroke lands at
 * 0.91px — below one pixel, so the full mark fuses into a smudge. Neither a
 * heavier stroke nor a shallower extrusion fixes that; there is simply no room
 * for five strokes. So the extrusion is dropped and the tile itself becomes the
 * front face, carrying only the prompt. `tray.rs` already reached the same
 * answer by hand for its 16x16 pixel art.
 *
 * The glyph is redrawn rather than scaled up: Lucide's chevron is as wide as
 * its own stroke, which reads as a blob once the stroke is 1.6px.
 */
const COMPACT_STROKE = 12
function compactPaths() {
  return [
    `M${p([24, 84])} L${p([48, 60])} L${p([24, 36])}`,
    `M${p([60, 84])} L${p([96, 84])}`,
  ]
}

/** Rasters at or below this many physical pixels use the compact mark. */
const COMPACT_MAX_PX = 32

// --- Emitters -------------------------------------------------------------

const GENERATED = 'Generated by scripts/gen-logo.mjs — run `npm run logo`, do not edit by hand.'

/** The two art sets. `fill` is how much of a tile the canvas spans. */
const FULL = { paths: markPaths(), stroke: STROKE, fill: TILE_FILL }
// The compact mark treats the tile as its front face, so it spans the whole tile.
const COMPACT = { paths: compactPaths(), stroke: COMPACT_STROKE, fill: 1 }

const strokeAttrs = (art) =>
  `fill="none" stroke-width="${f(art.stroke)}" stroke-linecap="round" stroke-linejoin="round"`

/** Places an art canvas inside a tile of `size`. */
function markGroup(art, size, indent) {
  const scale = (size * art.fill) / CANVAS
  const offset = (size - CANVAS * scale) / 2
  const body = art.paths.map((d) => `${indent}  <path d="${d}"/>`).join('\n')
  if (!offset) return `${indent}<g transform="scale(${f4(scale)})">\n${body}\n${indent}</g>`
  return `${indent}<g transform="translate(${f4(offset)} ${f4(offset)}) scale(${f4(scale)})">\n${body}\n${indent}</g>`
}

function tileSvg({ size = 1024, tile, mark, art = FULL }) {
  const r = f(size * TILE_RADIUS)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- ${GENERATED} -->
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${tile}"/>
  <g stroke="${mark}" ${strokeAttrs(art)}>
${markGroup(art, size, '    ')}
  </g>
</svg>
`
}

/**
 * Media queries inside an SVG referenced as a favicon are honoured by Chrome,
 * Firefox and Safari, so one file covers both themes.
 *
 * A favicon is only ever drawn at 16-32px, so it carries the compact mark: an
 * SVG cannot swap art by rendered size, and the size it actually gets is small.
 */
function faviconSvg(size = 1024) {
  const r = f(size * TILE_RADIUS)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- ${GENERATED} -->
  <style>
    .tile { fill: ${PAPER} }
    .mark { stroke: ${INK} }
    @media (prefers-color-scheme: dark) {
      .tile { fill: ${INK} }
      .mark { stroke: ${PAPER} }
    }
  </style>
  <rect class="tile" width="${size}" height="${size}" rx="${r}" ry="${r}"/>
  <g class="mark" ${strokeAttrs(COMPACT)}>
${markGroup(COMPACT, size, '    ')}
  </g>
</svg>
`
}

/**
 * Menu-bar (tray) mark: a rounded-square outline carrying the compact prompt.
 * The filled tile the other assets use cannot work here — macOS draws the
 * tray icon as a template (alpha only), so a filled square would be a solid
 * blob. Line work instead, inset half a stroke so the outline isn't clipped.
 * Exported so the preview step of the asset pipeline can render it any color.
 */
export function traySvg(ink = '#000000') {
  const inset = COMPACT_STROKE / 2
  const edge = CANVAS - COMPACT_STROKE
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <!-- ${GENERATED} -->
  <g stroke="${ink}" ${strokeAttrs(COMPACT)}>
    <rect x="${f(inset)}" y="${f(inset)}" width="${f(edge)}" height="${f(edge)}" rx="24" ry="24"/>
${markGroup(COMPACT, CANVAS, '    ')}
  </g>
</svg>
`
}

/**
 * The in-app mark has to be inline TSX, not an imported `.svg`: Vite resolves
 * SVG imports to a URL, and a URL cannot inherit `currentColor`. The viewBox
 * puts ink at 73% of the box, within a point of Lucide's 75%, so it sits
 * correctly beside the Lucide icons already in the title bar.
 */
function component(name, art, doc) {
  const body = art.paths.map((d) => `      <path d="${d}" />`).join('\n')
  return `${doc}
export function ${name}({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 ${CANVAS} ${CANVAS}"
      fill="none"
      stroke="currentColor"
      strokeWidth={${art.stroke}}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
${body}
    </svg>
  )
}
`
}

function logoTsx() {
  return `// ${GENERATED}

${component(
  'Logo',
  FULL,
  `/**
 * The Swarmterm mark: a terminal prompt on the front face of an extruded box.
 * Strokes inherit \`currentColor\`, so it themes with whatever chrome hosts it.
 *
 * Render it at **24px or larger**. Below that the extrusion collapses — at 16px
 * its strokes land under one pixel — and the mark also stops out-weighing the
 * icon buttons beside it, so a toolbar button reads as the brand instead.
 * Small rasters use the compact art in this script rather than this component.
 */`,
)}`
}

// --- Container formats ----------------------------------------------------

/** Windows .ico: a directory of PNG entries. Vista and later read PNG directly. */
function ico(entries) {
  const dir = Buffer.alloc(6 + 16 * entries.length)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2) // 1 = icon
  dir.writeUInt16LE(entries.length, 4)
  let offset = dir.length
  entries.forEach(({ size, data }, i) => {
    const o = 6 + i * 16
    // 0 stands for 256 in a single byte.
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt16LE(1, o + 4) // colour planes
    dir.writeUInt16LE(32, o + 6) // bits per pixel
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([dir, ...entries.map((e) => e.data)])
}

/**
 * macOS .icns: typed chunks after an 'icns' header. Only the PNG-based types
 * are emitted — the legacy RLE ones (is32/il32 and their masks) have not been
 * needed since 10.7, and `iconutil` itself stopped writing them.
 */
function icns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([head, data])
  })
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

// --- Write ----------------------------------------------------------------

const DARK = tileSvg({ tile: INK, mark: PAPER })
const LIGHT = tileSvg({ tile: PAPER, mark: INK })
const DARK_COMPACT = tileSvg({ tile: INK, mark: PAPER, art: COMPACT })
const LIGHT_COMPACT = tileSvg({ tile: PAPER, mark: INK, art: COMPACT })

export const svgs = {
  dark: DARK,
  light: LIGHT,
  darkCompact: DARK_COMPACT,
  lightCompact: LIGHT_COMPACT,
  favicon: faviconSvg(),
}
export const components = { full: FULL, compact: COMPACT, canvas: CANVAS }

export const png = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

/**
 * Raw straight-alpha RGBA for `tray.rs`. The tauri crate ships without its
 * PNG decoder feature, so the tray assets are raw bytes for `Image::new` —
 * and tiny-skia's buffer is premultiplied, which `Image::new` does not
 * expect, so alpha is divided back out here.
 */
export function rgba(svg, size) {
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render()
  const px = Buffer.from(img.pixels)
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]
    if (a > 0 && a < 255) {
      px[i] = Math.round((px[i] * 255) / a)
      px[i + 1] = Math.round((px[i + 1] * 255) / a)
      px[i + 2] = Math.round((px[i + 2] * 255) / a)
    }
  }
  return px
}

/** Art follows physical pixels, so a 2x asset for a small slot still gets detail. */
const iconPng = (size) => png(size <= COMPACT_MAX_PX ? DARK_COMPACT : DARK, size)

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32], // 16pt @2x
  ['ic12', 64], // 32pt @2x
  ['ic07', 128],
  ['ic13', 256], // 128pt @2x
  ['ic08', 256],
  ['ic09', 512],
  ['ic14', 512], // 256pt @2x
  ['ic10', 1024],
]

function write(rel, data) {
  const path = resolve(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  console.log(`wrote ${rel}`)
}

export function build({ icons = true } = {}) {
  write('src-tauri/icon-source.svg', DARK)
  write('src-tauri/icon-source-light.svg', LIGHT)
  write('public/favicon.svg', svgs.favicon)
  write('src/components/Logo.tsx', logoTsx())
  // `tauri icon` reads the raster, so it is regenerated alongside the source.
  write('src-tauri/icon-source.png', png(DARK, 1024))
  write('docs/images/logo-dark.png', png(DARK, 256))
  write('docs/images/logo-light.png', png(LIGHT, 256))
  // Tray marks — see traySvg/rgba above. 32px = 16pt @2x; the tray-icon
  // crate scales to the menu bar's 18pt itself.
  write('src-tauri/icons/tray-template-32.rgba', rgba(traySvg(), 32))
  write('src-tauri/icons/tray-color-32.rgba', rgba(DARK_COMPACT, 32))

  if (!icons) return
  console.log('running `tauri icon`…')
  execSync('npx tauri icon src-tauri/icon-source.png -o src-tauri/icons', {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  // `tauri icon` scales one source to every size, so the small rasters come out
  // of it as smudge. Overwrite exactly those with the compact mark.
  write('src-tauri/icons/32x32.png', iconPng(32))
  write(
    'src-tauri/icons/icon.ico',
    ico(ICO_SIZES.map((size) => ({ size, data: iconPng(size) }))),
  )
  write(
    'src-tauri/icons/icon.icns',
    icns(ICNS_TYPES.map(([type, size]) => ({ type, data: iconPng(size) }))),
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ icons: !process.argv.includes('--no-icons') })
}
