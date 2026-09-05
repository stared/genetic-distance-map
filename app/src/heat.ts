import { interpolateTurbo } from 'd3-scale-chromatic'
import { rgb } from 'd3-color'
import type { Pop } from './types'

export const W = 1024, H = 1024
const SCALE = W / (2 * Math.PI)
export const LAT_MAX = (2 * Math.atan(Math.exp((H / 2) / SCALE)) - Math.PI / 2) * 180 / Math.PI // ≈85.05°
const K = 6, LAND_MAX_KM = 6000, BUCKET_KM = 4
/** colour ramp: t=0 close (red) … t=1 far (blue), fully saturated, no grey */
export const ramp = (t: number) => interpolateTurbo(0.93 - 0.85 * t)

/** lon/lat -> grid pixel (plain Mercator) */
export function project(lon: number, lat: number): [number, number] {
  const la = Math.max(-89, Math.min(89, lat)) * Math.PI / 180
  return [(lon + 180) / 360 * W, H / 2 - SCALE * Math.log(Math.tan(Math.PI / 4 + la / 2))]
}

/** static 3-D k-d tree over unit-sphere points; chord distance is monotonic in great-circle distance */
class KD {
  order: Int32Array; x: Float64Array; y: Float64Array; z: Float64Array
  constructor(x: Float64Array, y: Float64Array, z: Float64Array) {
    this.x = x; this.y = y; this.z = z; this.order = new Int32Array(x.length).map((_, i) => i)
    this.build(0, x.length, 0)
  }
  private build(lo: number, hi: number, depth: number) {
    if (hi - lo <= 1) return
    const ax = depth % 3, v = ax === 0 ? this.x : ax === 1 ? this.y : this.z
    const sub = Array.from(this.order.subarray(lo, hi)).sort((a, b) => v[a] - v[b]); this.order.set(sub, lo)
    const mid = (lo + hi) >> 1; this.build(lo, mid, depth + 1); this.build(mid + 1, hi, depth + 1)
  }
  /** k nearest indices and chord² distances into out arrays (sorted ascending) */
  query(px: number, py: number, pz: number, k: number, outI: Int32Array, outD: Float64Array): number {
    let n = 0
    const visit = (lo: number, hi: number, depth: number) => {
      if (hi <= lo) return
      const mid = (lo + hi) >> 1, i = this.order[mid]
      const dx = this.x[i] - px, dy = this.y[i] - py, dz = this.z[i] - pz, d = dx * dx + dy * dy + dz * dz
      if (n < k || d < outD[n - 1]) { let j = Math.min(n, k - 1); while (j > 0 && outD[j - 1] > d) { outD[j] = outD[j - 1]; outI[j] = outI[j - 1]; j-- } outD[j] = d; outI[j] = i; if (n < k) n++ }
      const ax = depth % 3, v = ax === 0 ? this.x : ax === 1 ? this.y : this.z, p = ax === 0 ? px : ax === 1 ? py : pz
      const diff = p - v[i]
      if (diff < 0) { visit(lo, mid, depth + 1); if (n < k || diff * diff < outD[n - 1]) visit(mid + 1, hi, depth + 1) }
      else { visit(mid + 1, hi, depth + 1); if (n < k || diff * diff < outD[n - 1]) visit(lo, mid, depth + 1) }
    }
    visit(0, this.order.length, 0)
    return n
  }
}

/** neighbour field for one subset of locations: K nearest per land cell, IDW weights, distance fade */
export interface Field { idx: Int32Array; wgt: Float32Array; fade: Uint8Array }

/** Land raster + unique sample locations; neighbour fields are built lazily per subset (present-day / ancient). */
export class HeatGrid {
  land = new Uint8Array(W * H)          // painted land (coast dilated by 2 cells)
  core = new Uint8Array(W * H)          // land proper, used for over-land distances
  private locXYZ!: { X: Float64Array; Y: Float64Array; Z: Float64Array }
  locPops: number[][] = []              // location -> pop ids
  private locVal: Float32Array
  private locOk: Uint8Array
  private fields = new Map<string, Field>()
  lut: Uint8ClampedArray
  canvas: HTMLCanvasElement
  img: ImageData

  constructor(pops: Pop[], landGeo: GeoJSON.GeoJSON) {
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H
    const ctx = this.canvas.getContext('2d')!
    this.img = ctx.createImageData(W, H)
    this.lut = new Uint8ClampedArray(256 * 3)
    for (let i = 0; i < 256; i++) { const c = rgb(ramp(i / 255)); this.lut[i * 3] = c.r; this.lut[i * 3 + 1] = c.g; this.lut[i * 3 + 2] = c.b }
    // land mask
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.beginPath()
    const rings: number[][][] = []
    const collect = (g: GeoJSON.Geometry) => { if (g.type === 'Polygon') rings.push(...g.coordinates); else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => rings.push(...p)); else if (g.type === 'GeometryCollection') g.geometries.forEach(collect) }
    if (landGeo.type === 'FeatureCollection') landGeo.features.forEach(f => collect(f.geometry)); else if (landGeo.type === 'Feature') collect(landGeo.geometry); else collect(landGeo as GeoJSON.Geometry)
    // unwrap longitudes so rings crossing the antimeridian stay continuous, draw three copies (±360°), nonzero fill
    for (const ring of rings) {
      let prev = ring[0][0], off = 0; const pts: [number, number][] = []
      for (const [lo, la] of ring) { if (lo - prev > 180) off -= 360; else if (prev - lo > 180) off += 360; prev = lo; pts.push(project(lo + off, la)) }
      for (const dx of [-W, 0, W]) { pts.forEach(([x, y], i) => i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y)); ctx.closePath() }
    }
    ctx.fill('nonzero')
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke()   // islands smaller than a cell still register as land
    const land0 = ctx.getImageData(0, 0, W, H).data
    ctx.clearRect(0, 0, W, H)
    const land = this.land, core = this.core
    for (let i = 0; i < W * H; i++) if (land0[i * 4] >= 128) { core[i] = 1; const r = (i / W) | 0, c = i % W; for (let dy = -2; dy <= 2; dy++) { const rr = r + dy; if (rr < 0 || rr >= H) continue; for (let dx = -2; dx <= 2; dx++) land[rr * W + ((c + dx + W) % W)] = 1 } }
    // unique locations
    const locOf = new Map<string, number>(); const lat: number[] = [], lon: number[] = []
    for (const p of pops) {
      if (p.lat == null) continue
      const key = p.lat.toFixed(2) + ',' + p.lon!.toFixed(2)
      let li = locOf.get(key)
      if (li === undefined) { li = lat.length; locOf.set(key, li); lat.push(p.lat * Math.PI / 180); lon.push(p.lon! * Math.PI / 180); this.locPops.push([]) }
      this.locPops[li].push(p.id)
    }
    const n = lat.length
    this.locVal = new Float32Array(n); this.locOk = new Uint8Array(n)
    const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n)
    for (let i = 0; i < n; i++) { X[i] = Math.cos(lat[i]) * Math.cos(lon[i]); Y[i] = Math.cos(lat[i]) * Math.sin(lon[i]); Z[i] = Math.sin(lat[i]) }
    this.locXYZ = { X, Y, Z }
  }
  /** neighbour field over the locations passing `keep` (cached by key): for every land cell its K nearest
   *  locations by distance OVER LAND (multi-source shortest path on the land raster, so influence follows coasts
   *  and never crosses water); cells with no land route to any location fall back to great-circle distance. */
  field(key: string, keep: (li: number) => boolean): Field {
    const cached = this.fields.get(key); if (cached) return cached
    const { X, Y, Z } = this.locXYZ
    const sel: number[] = []; for (let li = 0; li < X.length; li++) if (keep(li)) sel.push(li)
    const f: Field = { idx: new Int32Array(W * H * K).fill(-1), wgt: new Float32Array(W * H * K), fade: new Uint8Array(W * H) }
    this.fields.set(key, f)
    if (!sel.length) return f
    const cnt = new Uint8Array(W * H), dist = new Float32Array(W * H * K)
    // km per cell at each row (Mercator: same in x and y)
    const kmRow = new Float32Array(H)
    for (let r = 0; r < H; r++) { const cl = 2 * Math.atan(Math.exp((H / 2 - (r + 0.5)) / SCALE)) - Math.PI / 2; kmRow[r] = 2 * Math.PI * 6371 / W * Math.cos(cl) }
    // Dial's algorithm: buckets of BUCKET_KM; entries (cell, source) with the distance implied by the bucket
    const NB = Math.ceil(LAND_MAX_KM / BUCKET_KM) + 1
    const bCell: number[][] = Array.from({ length: NB }, () => []), bSrc: number[][] = Array.from({ length: NB }, () => [])
    const push = (d: number, cell: number, src: number) => { const b = Math.round(d / BUCKET_KM); if (b < NB) { bCell[b].push(cell); bSrc[b].push(src) } }
    // seed: each location at its land cell (snapped to the nearest land cell within 3 cells if it falls in water)
    for (let s = 0; s < sel.length; s++) {
      const li = sel[s], lat = Math.asin(Z[li]) * 180 / Math.PI, lon = Math.atan2(Y[li], X[li]) * 180 / Math.PI
      const [px, py] = project(lon, lat); let c = Math.floor(px) % W, r = Math.max(0, Math.min(H - 1, Math.floor(py)))
      if (!this.core[r * W + c]) { let best = -1, bd = 99; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const rr = r + dy, cc = (c + dx + W) % W; if (rr < 0 || rr >= H || !this.core[rr * W + cc]) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = rr * W + cc } } if (best < 0) continue; r = (best / W) | 0; c = best % W }
      push(0, r * W + c, li)
    }
    const has = (cell: number, src: number) => { for (let j = 0; j < cnt[cell]; j++) if (f.idx[cell * K + j] === src) return true; return false }
    for (let b = 0; b < NB; b++) {
      const cells = bCell[b], srcs = bSrc[b], d = b * BUCKET_KM
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i], src = srcs[i]
        if (cnt[cell] >= K || has(cell, src)) continue
        const j = cnt[cell]++; f.idx[cell * K + j] = src; dist[cell * K + j] = d
        const r = (cell / W) | 0, c = cell % W, step = kmRow[r]
        for (let dy = -1; dy <= 1; dy++) { const rr = r + dy; if (rr < 0 || rr >= H) continue
          for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const n = rr * W + ((c + dx + W) % W); if (this.core[n] && cnt[n] < K) push(d + (dx && dy ? step * Math.SQRT2 : step), n, src) } }
      }
      bCell[b] = []; bSrc[b] = []
    }
    // dilated coast cells take their nearest core neighbour's entries
    for (let pass = 0; pass < 2; pass++) for (let cell = 0; cell < W * H; cell++) {
      if (!this.land[cell] || cnt[cell]) continue
      const r = (cell / W) | 0, c = cell % W
      for (let dy = -1; dy <= 1 && !cnt[cell]; dy++) for (let dx = -1; dx <= 1; dx++) { const rr = r + dy; if (rr < 0 || rr >= H) continue; const n = rr * W + ((c + dx + W) % W); if (cnt[n]) { cnt[cell] = cnt[n]; for (let j = 0; j < K; j++) { f.idx[cell * K + j] = f.idx[n * K + j]; dist[cell * K + j] = dist[n * K + j] + kmRow[r] } break } }
    }
    // no land route: spill from the nearest locations by great-circle distance
    const kd = new KD(Float64Array.from(sel, i => X[i]), Float64Array.from(sel, i => Y[i]), Float64Array.from(sel, i => Z[i]))
    const outI = new Int32Array(K), outD = new Float64Array(K)
    const chordToKm = (c2: number) => 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(c2) / 2))
    for (let r = 0; r < H; r++) {
      const cl = 2 * Math.atan(Math.exp((H / 2 - (r + 0.5)) / SCALE)) - Math.PI / 2, cosl = Math.cos(cl), sinl = Math.sin(cl)
      for (let cix = 0; cix < W; cix++) {
        const cell = r * W + cix; if (!this.land[cell] || cnt[cell]) continue
        const clon = (-180 + (cix + 0.5) * 360 / W) * Math.PI / 180
        const m = kd.query(cosl * Math.cos(clon), cosl * Math.sin(clon), sinl, K, outI, outD)
        for (let j = 0; j < m; j++) { f.idx[cell * K + j] = sel[outI[j]]; dist[cell * K + j] = chordToKm(outD[j]) }
        cnt[cell] = m
      }
    }
    const rowAntarctica = project(0, -60)[1]   // nobody lives there: leave it unpainted rather than spill onto it
    for (let cell = 0; cell < W * H; cell++) { if (!cnt[cell] || cell / W >= rowAntarctica) continue; f.fade[cell] = 255; for (let j = 0; j < cnt[cell]; j++) f.wgt[cell * K + j] = 1 / ((dist[cell * K + j] + 40) ** 2) }
    return f
  }
  /** similarity: per-pop distances (×100), averaged over visible pops at each location, IDW-blended over K neighbours */
  renderHeat(f: Field, d: Float32Array, visible: Uint8Array, dmax: number, alpha = 1) {
    this.locPops.forEach((ids, li) => { let s = 0, c = 0; for (const id of ids) if (visible[id]) { s += d[id]; c++ } this.locOk[li] = c ? 1 : 0; this.locVal[li] = c ? s / c : 0 })
    const px = this.img.data
    for (let cell = 0; cell < W * H; cell++) {
      const o = cell * 4, fd = f.fade[cell]
      if (!fd) { px[o + 3] = 0; continue }
      let s = 0, sw = 0
      for (let j = 0; j < K; j++) { const li = f.idx[cell * K + j]; if (li < 0) break; if (!this.locOk[li]) continue; const w = f.wgt[cell * K + j]; s += w * this.locVal[li]; sw += w }
      if (sw === 0) { px[o + 3] = 0; continue }
      const li = Math.round(Math.sqrt(Math.min(1, (s / sw) / dmax)) * 255) * 3
      px[o] = this.lut[li]; px[o + 1] = this.lut[li + 1]; px[o + 2] = this.lut[li + 2]; px[o + 3] = fd * alpha
    }
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0)
  }
  /** categorical (Voronoi-style): each cell takes the category of its nearest location; -1 = leave unpainted */
  renderCategories(f: Field, locCat: Int32Array, palette: Uint8ClampedArray) {
    const px = this.img.data
    for (let cell = 0; cell < W * H; cell++) {
      const o = cell * 4, fd = f.fade[cell], li = f.idx[cell * K]
      const cat = fd && li >= 0 ? locCat[li] : -1
      if (cat < 0) { px[o + 3] = 0; continue }
      px[o] = palette[cat * 3]; px[o + 1] = palette[cat * 3 + 1]; px[o + 2] = palette[cat * 3 + 2]; px[o + 3] = fd
    }
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0)
  }
  clear() { this.img.data.fill(0); this.canvas.getContext('2d')!.clearRect(0, 0, W, H) }
  static colorFor(dd: number, dmax: number): string { return ramp(Math.sqrt(Math.min(1, dd / dmax))) }
}
