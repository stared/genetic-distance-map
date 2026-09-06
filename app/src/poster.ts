// A still image of the current query: one header line (title, colour scale), the map with direct labels, one source band.
// Drawn entirely on a canvas so that the download button and the ?share= page produce the very same pixels.
import { FlatMap, type MapState } from './flatmap'
import { HeatGrid, ramp } from './heat'
import type { Pop } from './types'
import { NAMES, TITLES } from './names'

export interface PosterInput {
  pops: Pop[]; land: any; borders: any; heat: HeatGrid; state: MapState
  p: Pop; raw: Float32Array; visible: Uint8Array; era: string   // the query row, distances to it, which rows are on the map, 'present-day' | 'ancient' | …
  dmin: string; dmax: string                                     // the ends of the colour scale as shown in the legend
  view: { lon: number; lat: number; k: number }
  labels?: { q: Pop; side: string }[]                            // hand-picked (?labels=); else chosen automatically
  w?: number; h?: number; dpr?: number
}
const FONT = 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif', MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const BG = '#000', FG = '#f4f4f5', MUTED = '#a1a1aa', LINE = '#232326'
export const TOP = 62, BOT = 66                                  // the header and source bands (css px), as the map's frame
export const nameOf = (q: Pop) => NAMES[q.core] ?? q.core.replace(/_\([^)]*\)/g, '').replace(/_/g, ' ')   // no table entry: the core without its parenthetical

/** which dots to label: the closest first, but never two within R px of each other, so that every bright spot with room
    around it gets a name and a crowded region gets its best one; the same people at most M times and further apart */
export function autoLabels(pops: Pop[], visible: Uint8Array, raw: Float32Array, p: Pop, project: (lon: number, lat: number) => [number, number], w: number, h: number) {
  const R = 60, N = 28, THR = 10, G = 1.5, M = 5, MARGIN = 60
  const best = new Map<string, Pop>()                            // one row per core: the largest
  for (const q of pops) { if (!visible[q.id] || q.dlat == null) continue; const b = best.get(q.core); if (!b || b.n < q.n) best.set(q.core, q) }
  const cands = [...best.values()].map(q => { const [x, y] = project(q.dlon!, q.dlat!); return { q, x, y, s: q.id === p.id ? 0 : raw[q.id] } })
    .filter(c => c.x >= MARGIN && c.x <= w - MARGIN && c.y >= TOP + 30 && c.y <= h - BOT - 30 && (c.q.id === p.id || c.s <= THR))
    .sort((a, b) => a.s - b.s)
  const out: typeof cands = []
  for (const c of cands) {
    if (out.filter(o => o.q.first === c.q.first).length >= M) continue
    if (out.every(o => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 >= (o.q.first === c.q.first ? R * G : R) ** 2)) out.push(c)
    if (out.length >= N) break
  }
  return out.map(c => ({ q: c.q, side: '' }))
}

/** render the poster; returns the canvas (w×h css px at dpr) */
export function makePoster(i: PosterInput): HTMLCanvasElement {
  const w = i.w ?? 1600, h = i.h ?? 1000, dpr = i.dpr ?? 2
  // the map: an offscreen FlatMap of the frame's size sharing the heat raster and point styles of the live one
  const box = document.createElement('div')
  box.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;overflow:hidden`
  document.body.appendChild(box)
  const m = new FlatMap(box, i.pops, i.land, i.borders, i.heat, dpr)
  m.state = i.state
  m.flyTo(i.view.lon, i.view.lat, i.view.k, 0); m.render()
  const labels = i.labels?.length ? i.labels : autoLabels(i.pops, i.visible, i.raw, i.p, (lon, lat) => m.project(lon, lat), w, h)
  m.labels = labels.map(({ q, side }) => ({ lon: q.dlon!, lat: q.dlat!, text: nameOf(q), num: q.id === i.p.id || i.raw[q.id] === 0 ? '' : i.raw[q.id].toFixed(1), side }))
  m.render()
  const out = document.createElement('canvas'); out.width = w * dpr; out.height = h * dpr
  const ctx = out.getContext('2d')!; ctx.scale(dpr, dpr)
  ctx.drawImage(m.canvas, 0, 0, w, h)
  box.remove()
  ctx.textBaseline = 'middle'
  /** a line of text in runs of (text, colour, weight), left-aligned at x or right-aligned when right */
  const line = (x: number, y: number, size: number, family: string, runs: [string, string, number?][], right = false) => {
    const widths = runs.map(([t, , wt]) => { ctx.font = `${wt ?? 400} ${size}px ${family}`; return ctx.measureText(t).width })
    let cx = right ? x - widths.reduce((a, b) => a + b, 0) : x
    runs.forEach(([t, c, wt], j) => { ctx.font = `${wt ?? 400} ${size}px ${family}`; ctx.fillStyle = c; ctx.fillText(t, cx, y); cx += widths[j] })
  }
  // header: title sentence left, colour scale right
  ctx.fillStyle = BG; ctx.fillRect(0, 0, w, TOP); ctx.fillStyle = LINE; ctx.fillRect(0, TOP - 1, w, 1)
  const facts = `, the average of ${i.p.n} ${i.era} individual${i.p.n === 1 ? '' : 's'}`
  line(28, 16 + 15.4, 22, FONT, [['Genetic distance to ', MUTED], [TITLES[i.p.core] ?? nameOf(i.p), FG, 600], [facts, MUTED]])
  const lx1 = w - 28, lx0 = lx1 - 320, ly = (TOP - 1) / 2
  ctx.font = `400 14px ${MONO}`
  const dminW = Math.max(28, ctx.measureText(i.dmin).width), dmaxW = Math.max(28, ctx.measureText(i.dmax + '+').width)
  ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.fillText(i.dmin, lx0 + dminW, ly); ctx.textAlign = 'left'; ctx.fillText(i.dmax + '+', lx1 - dmaxW, ly)
  const g = ctx.createLinearGradient(lx0 + dminW + 8, 0, lx1 - dmaxW - 8, 0)
  const stops = [0, .1, .2, .35, .5, .7, 1]; stops.forEach((t, j) => g.addColorStop(j / (stops.length - 1), ramp(Math.sqrt(t))))
  ctx.fillStyle = g; ctx.fillRect(lx0 + dminW + 8, ly - 4, lx1 - dmaxW - 8 - (lx0 + dminW + 8), 8)
  // source band: data and method left, credit right; both two lines, bottom-aligned
  const y0 = h - BOT
  ctx.fillStyle = BG; ctx.fillRect(0, y0, w, BOT); ctx.fillStyle = LINE; ctx.fillRect(0, y0, w, 1)
  const l2 = h - 14 - 9.75, l1 = l2 - 19.5
  line(28, l1, 13, FONT, [['Data source: ', MUTED], ['Moriopoulos Collection 2025', FG], [', population averages on ', MUTED], ['Global25', FG], [', a 25-dimensional PCA of genotypes.', MUTED]])
  line(28, l2, 13, FONT, [['Distances are Euclidean between those averages, multiplied by 100. Locations are approximate and the interpolation is decorative.', MUTED]])
  line(w - 28, l1, 13, FONT, [['Data viz by ', MUTED], ['Piotr Migdał', FG], [', 2026', MUTED]], true)
  line(w - 28, l2, 13, FONT, [['Interactive exploration: ', MUTED], ['p.migdal.pl/genetic-distance-map', FG]], true)
  return out
}

/** offer the canvas as a PNG file */
export function download(c: HTMLCanvasElement, name: string) {
  c.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000) }, 'image/png')
}
