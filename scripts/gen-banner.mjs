/**
 * Single source of truth for the README hero banner (docs/images/hero.png).
 *
 * Same philosophy as gen-logo.mjs: the banner is code, not a binary blob —
 * a copy tweak or accent change is one edit here, re-run with
 * `node scripts/gen-banner.mjs`. The logo mark below is the exact geometry
 * from icon-source.svg (120-unit canvas, ink spans 21..99, center (60,60));
 * if the mark ever changes in gen-logo.mjs, update MARK_PATHS to match.
 */
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const W = 1600
const H = 900
const BG = '#09090b'
const FG = '#fafafa'
const GRAY = '#a1a1aa'
// VS Code Dark Modern accents, used only as glows — the brand stays monoline.
const TEAL = '#4ec9b0'
const BLUE = '#569cd6'

const MARK_PATHS = `
  <path d="M53 35 L81 35 Q99 35 99 53 L99 81 Q99 99 81 99 L53 99 Q35 99 35 81 L35 53 Q35 35 53 35 Z"/>
  <path d="M25.5 80.5 Q21 76 21 67 L21 39 Q21 21 39 21 L67 21 Q76 21 80.5 25.5"/>
  <path d="M25.5 80.5 L39.5 94.5"/>
  <path d="M25.5 25.5 L39.5 39.5"/>
  <path d="M80.5 25.5 L94.5 39.5"/>
  <path d="M52.78 70.55 L59.89 63.44 L52.78 56.33"/>
  <path d="M67 77.67 L81.22 77.67"/>`
const mark = (x, y, k) =>
  `<g stroke="${FG}" fill="none" stroke-width="9.5" stroke-linecap="round"
      stroke-linejoin="round" transform="translate(${x - 60 * k} ${y - 60 * k}) scale(${k})">${MARK_PATHS}</g>`

const dot = (x, y, color) =>
  `<circle cx="${x}" cy="${y}" r="9" fill="${color}" opacity="0.55" filter="url(#glow)"/>
   <circle cx="${x}" cy="${y}" r="4.5" fill="${color}"/>`

/** Abstract "code" — dashes, deliberately unreadable so the shot never dates. */
function codeLines(x, y, w, rows, seedWidths) {
  let out = ''
  let yy = y
  for (let i = 0; i < rows; i++) {
    let xx = x
    for (const frac of seedWidths[i % seedWidths.length]) {
      const len = w * frac
      out += `<line x1="${xx}" y1="${yy}" x2="${xx + len}" y2="${yy}"
                stroke="rgba(255,255,255,0.14)" stroke-width="6" stroke-linecap="round"/>`
      xx += len + 14
    }
    yy += 24
  }
  return out
}
const SEEDS = [[0.32, 0.18], [0.5], [0.22, 0.3], [0.42, 0.12], [0.26]]

/** Prompt glyph echoing the logo's front face. */
const chevron = (x, y, k = 1, color = FG) =>
  `<g stroke="${color}" fill="none" stroke-width="${6 * k}" stroke-linecap="round" stroke-linejoin="round">
     <path d="M${x} ${y} l${11 * k} ${11 * k} l${-11 * k} ${11 * k}"/>
     <line x1="${x + 20 * k}" y1="${y + 22 * k}" x2="${x + 42 * k}" y2="${y + 22 * k}"/>
   </g>`

const text = (x, y, s, size, opts = {}) => {
  const { fill = FG, weight = 400, ls = 0, family = 'Helvetica Neue' } = opts
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}"
     font-weight="${weight}" letter-spacing="${ls}" fill="${fill}">${s}</text>`
}

// Left: lockup. Right: a split window whose panes branch into worktrees below
// and project a web preview above — the three README ideas in one frame.
const win = { x: 820, y: 170, w: 640, h: 430, r: 16 }
const midX = win.x + win.w / 2
const midY = win.y + 52 + (win.h - 52) / 2
const b1x = win.x + 160
const b2x = midX + 160

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="vign" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#111116"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
    <filter id="glow" x="-200%" y="-200%" width="500%" height="500%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#vign)"/>
  ${mark(196, 268, 1.25)}
  ${text(120, 448, 'Swarmterm', 92, { weight: 700, ls: -2.5 })}
  ${text(122, 505, 'One window for a whole swarm', 30, { fill: GRAY })}
  ${text(122, 545, 'of AI coding agents.', 30, { fill: GRAY })}
  ${chevron(124, 610, 1.1, TEAL)}
  ${text(186, 634, 'five agents, five worktrees, one window', 24, { fill: TEAL, family: 'Menlo' })}
  ${text(122, 795, 'macOS   ·   Windows   ·   swarmterm.dev', 21, { fill: '#71717a', ls: 1 })}

  <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="${win.r}"
        fill="#0d0d12" stroke="rgba(255,255,255,0.28)" stroke-width="2.5"/>
  <line x1="${win.x}" y1="${win.y + 52}" x2="${win.x + win.w}" y2="${win.y + 52}" stroke="rgba(255,255,255,0.2)" stroke-width="2.5"/>
  <circle cx="${win.x + 28}" cy="${win.y + 26}" r="6.5" fill="rgba(255,255,255,0.25)"/>
  <circle cx="${win.x + 52}" cy="${win.y + 26}" r="6.5" fill="rgba(255,255,255,0.16)"/>
  <circle cx="${win.x + 76}" cy="${win.y + 26}" r="6.5" fill="rgba(255,255,255,0.09)"/>
  <line x1="${midX}" y1="${win.y + 52}" x2="${midX}" y2="${win.y + win.h}" stroke="rgba(255,255,255,0.2)" stroke-width="2.5"/>
  <line x1="${win.x}" y1="${midY}" x2="${win.x + win.w}" y2="${midY}" stroke="rgba(255,255,255,0.2)" stroke-width="2.5"/>
  ${chevron(win.x + 30, win.y + 78, 0.85)}
  ${codeLines(win.x + 30, win.y + 132, 200, 2, SEEDS)}
  ${chevron(midX + 30, win.y + 78, 0.85)}
  ${codeLines(midX + 30, win.y + 132, 200, 2, SEEDS.slice(2))}
  ${codeLines(win.x + 30, midY + 40, 200, 3, SEEDS.slice(1))}
  ${codeLines(midX + 30, midY + 40, 130, 3, SEEDS.slice(3))}
  ${dot(midX - 36, win.y + 84, TEAL)}
  ${dot(win.x + win.w - 36, midY + 36, BLUE)}

  <g stroke="${BLUE}" stroke-width="3" fill="none" opacity="0.8">
    <path d="M${b1x} ${win.y + win.h} C ${b1x} ${win.y + win.h + 60}, ${b1x - 70} ${win.y + win.h + 60}, ${b1x - 70} ${win.y + win.h + 105}"/>
    <path d="M${b2x} ${win.y + win.h} C ${b2x} ${win.y + win.h + 60}, ${b2x + 70} ${win.y + win.h + 60}, ${b2x + 70} ${win.y + win.h + 105}"/>
  </g>
  <circle cx="${b1x - 70}" cy="${win.y + win.h + 118}" r="9" fill="none" stroke="${BLUE}" stroke-width="3"/>
  <circle cx="${b2x + 70}" cy="${win.y + win.h + 118}" r="9" fill="none" stroke="${BLUE}" stroke-width="3"/>
  ${text(b1x - 48, win.y + win.h + 126, 'swarm/agent-1', 19, { fill: '#8b8b96', family: 'Menlo' })}
  ${text(b2x + 92, win.y + win.h + 126, 'swarm/agent-2', 19, { fill: '#8b8b96', family: 'Menlo' })}

  <g transform="translate(${win.x + win.w - 150} ${win.y - 62})">
    <rect width="210" height="140" rx="12" fill="#0d0d12" stroke="rgba(255,255,255,0.35)" stroke-width="2.5"/>
    <line x1="0" y1="36" x2="210" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="2.5"/>
    <rect x="14" y="12" width="120" height="13" rx="6.5" fill="rgba(255,255,255,0.14)"/>
    <rect x="16" y="52" width="80" height="46" rx="6" fill="${TEAL}" opacity="0.28"/>
    <rect x="106" y="52" width="88" height="10" rx="5" fill="rgba(255,255,255,0.16)"/>
    <rect x="106" y="70" width="70" height="10" rx="5" fill="rgba(255,255,255,0.12)"/>
    <rect x="16" y="108" width="178" height="10" rx="5" fill="rgba(255,255,255,0.10)"/>
  </g>
</svg>`

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' },
  background: BG
}).render().asPng()
const out = resolve(root, 'docs/images/hero.png')
writeFileSync(out, png)
console.log(`hero.png  ${(png.length / 1024).toFixed(0)} KB  →  ${out}`)
