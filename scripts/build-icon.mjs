import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = resolve(root, 'src-tauri/icon-source.svg')
const pngPath = resolve(root, 'src-tauri/icon-source.png')

const svg = readFileSync(svgPath, 'utf8')
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } })
writeFileSync(pngPath, resvg.render().asPng())
console.log(`Wrote ${pngPath}`)
