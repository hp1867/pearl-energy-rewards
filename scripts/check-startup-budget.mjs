import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

// Count the production entry and all statically preloaded JS, not just main.js.
// This is a download-size regression check, not a browser timing benchmark.
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const paths = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => match[1]))]
if (!paths.length) throw new Error('No initial JavaScript assets found; check the build output')
const files = await Promise.all(paths.map(async path => {
  const bytes = await readFile(new URL(`../dist${path}`, import.meta.url))
  return { file: path, bytes: bytes.length, gzip: gzipSync(bytes).length }
}))
const report = { files, bytes: files.reduce((sum, row) => sum + row.bytes, 0), gzip: files.reduce((sum, row) => sum + row.gzip, 0) }
console.log(JSON.stringify(report, null, 2))
if (report.gzip > 180000) throw new Error(`Initial JavaScript exceeds the 180,000-byte gzip budget (${report.gzip})`)
if (paths.some(path => /\/(?:Overlays|OffersScreen|MenuScreen|ProfileScreen|RewardsScreen|NightDealsScreen)-/.test(path))) throw new Error('A secondary screen was eagerly included in the initial page')
