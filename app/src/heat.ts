import { interpolateYlGnBu } from 'd3-scale-chromatic'
import { rgb } from 'd3-color'
import type { Pop } from './types'

export const W = 720, H = 540
const SCALE = W / (2 * Math.PI)
export const LAT_MAX = (2 * Math.atan(Math.exp((H / 2) / SCALE)) - Math.PI / 2) * 180 / Math.PI // ≈79.2°
const K = 6, MAX_KM = 1500, B = 2, BW = 360 / B, BH = 180 / B
/** lon/lat -> grid pixel (plain Mercator, no spherical clipping) */
export function project(lon: number, lat: number): [number, number] {
  const la = Math.max(-89, Math.min(89, lat)) * Math.PI / 180
  return [(lon + 180) / 360 * W, H / 2 - SCALE * Math.log(Math.tan(Math.PI / 4 + la / 2))]
}

/** Precomputed k geographically nearest *locations* (unique lat/lon) per raster cell on a Mercator grid. */
export class HeatGrid {
  idx = new Int32Array(W * H * K).fill(-1)
  wgt = new Float32Array(W * H * K)
  land = new Uint8Array(W * H)
  locPops: number[][] = []      // location -> pop ids
  private locVal: Float32Array
  private locOk: Uint8Array
  lut: Uint8ClampedArray
  canvas: HTMLCanvasElement
  img: ImageData

  constructor(pops: Pop[], landGeo: GeoJSON.GeoJSON) {
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H
    const ctx = this.canvas.getContext('2d')!
    this.img = ctx.createImageData(W, H)
    this.lut = new Uint8ClampedArray(256 * 3)
    for (let i = 0; i < 256; i++) { const c = rgb(interpolateYlGnBu(1 - i / 255)); this.lut[i * 3] = c.r; this.lut[i * 3 + 1] = c.g; this.lut[i * 3 + 2] = c.b }
    // land mask: rasterise land polygons in the same projection as the grid
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'
    ctx.beginPath()
    const rings: number[][][] = []
    const collect = (g: GeoJSON.Geometry) => { if (g.type === 'Polygon') rings.push(...g.coordinates); else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => rings.push(...p)); else if (g.type === 'GeometryCollection') g.geometries.forEach(collect) }
    if (landGeo.type === 'FeatureCollection') landGeo.features.forEach(f => collect(f.geometry)); else if (landGeo.type === 'Feature') collect(landGeo.geometry); else collect(landGeo as GeoJSON.Geometry)
    for (const ring of rings) { ring.forEach(([lo, la], i) => { const [x, y] = project(lo, la); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }); ctx.closePath() }
    ctx.fill('evenodd')
    const px = ctx.getImageData(0, 0, W, H).data
    for (let i = 0; i < W * H; i++) this.land[i] = px[i * 4] > 128 ? 1 : 0
    ctx.clearRect(0, 0, W, H)
    // unique locations
    const locOf = new Map<string, number>(); const lat: number[] = [], lon: number[] = []
    for (const p of pops) {
      if (p.lat == null) continue
      const key = p.lat.toFixed(2) + ',' + p.lon!.toFixed(2)
      let li = locOf.get(key)
      if (li === undefined) { li = lat.length; locOf.set(key, li); lat.push(p.lat * Math.PI / 180); lon.push(p.lon! * Math.PI / 180); this.locPops.push([]) }
      this.locPops[li].push(p.id)
    }
    this.locVal = new Float32Array(lat.length); this.locOk = new Uint8Array(lat.length)
    const buckets: number[][] = Array.from({ length: BW * BH }, () => [])
    lat.forEach((la, li) => buckets[Math.min(BH - 1, Math.floor((la * 180 / Math.PI + 90) / B)) * BW + Math.min(BW - 1, Math.floor((lon[li] * 180 / Math.PI + 180) / B))].push(li))
    const cand: { li: number; d: number }[] = []
    for (let r = 0; r < H; r++) {
      const clatDeg = (2 * Math.atan(Math.exp((H / 2 - (r + 0.5)) / SCALE)) - Math.PI / 2) * 180 / Math.PI
      const cl = clatDeg * Math.PI / 180, cosl = Math.cos(cl)
      const kmPerRing = B * 111 * Math.max(0.05, cosl)        // east-west reach of one bucket ring
      const maxRing = Math.min(BW / 2, Math.ceil(MAX_KM / kmPerRing))
      const by = Math.floor((clatDeg + 90) / B)
      for (let cix = 0; cix < W; cix++) {
        const cell = r * W + cix; if (!this.land[cell]) continue
        const clonDeg = -180 + (cix + 0.5) * 360 / W, clon = clonDeg * Math.PI / 180
        const bx = Math.floor((clonDeg + 180) / B)
        cand.length = 0
        for (let ring = 0; ring <= maxRing; ring++) {
          for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
            if (Math.abs(dy) !== ring && Math.abs(dx) !== ring) continue
            const yy = by + dy; if (yy < 0 || yy >= BH) continue
            const xx = ((bx + dx) % BW + BW) % BW
            for (const li of buckets[yy * BW + xx]) {
              const h = Math.sin((lat[li] - cl) / 2) ** 2 + cosl * Math.cos(lat[li]) * Math.sin((lon[li] - clon) / 2) ** 2
              cand.push({ li, d: 6371 * 2 * Math.asin(Math.sqrt(h)) })
            }
          }
          if (cand.length >= K) { cand.sort((a, b) => a.d - b.d); if (ring * kmPerRing > cand[K - 1].d) break }
          if (ring * kmPerRing > MAX_KM) break
        }
        cand.sort((a, b) => a.d - b.d)
        for (let j = 0; j < K && j < cand.length; j++) {
          if (cand[j].d > MAX_KM) break
          this.idx[cell * K + j] = cand[j].li; this.wgt[cell * K + j] = 1 / ((cand[j].d + 60) ** 2)
        }
      }
    }
  }
  /** paint per-pop distances (×100), averaging visible pops at each location; dmax = colour range */
  render(d: Float32Array, visible: Uint8Array, dmax: number, alpha = 190) {
    this.locPops.forEach((ids, li) => { let s = 0, c = 0; for (const id of ids) if (visible[id]) { s += d[id]; c++ } this.locOk[li] = c ? 1 : 0; this.locVal[li] = c ? s / c : 0 })
    const px = this.img.data
    for (let cell = 0; cell < W * H; cell++) {
      const o = cell * 4
      if (!this.land[cell]) { px[o + 3] = 0; continue }
      let s = 0, sw = 0
      for (let j = 0; j < K; j++) { const li = this.idx[cell * K + j]; if (li < 0) break; if (!this.locOk[li]) continue; const w = this.wgt[cell * K + j]; s += w * this.locVal[li]; sw += w }
      if (sw === 0) { px[o + 3] = 0; continue }
      const li = Math.round(Math.sqrt(Math.min(1, (s / sw) / dmax)) * 255) * 3
      px[o] = this.lut[li]; px[o + 1] = this.lut[li + 1]; px[o + 2] = this.lut[li + 2]; px[o + 3] = alpha
    }
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0)
  }
  clear() { this.canvas.getContext('2d')!.clearRect(0, 0, W, H) }
  static colorFor(dd: number, dmax: number): string { return interpolateYlGnBu(1 - Math.sqrt(Math.min(1, dd / dmax))) }
}
