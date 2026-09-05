import { geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import type { Pop } from './types'
import { HeatGrid, LAT_MAX } from './heat'

export interface PointStyle { color: string; alpha: number; r: number }
export interface MapState { styles: (PointStyle | null)[]; rasterAlpha: number }

/** Flat Web-Mercator map on a 2D canvas: pan by drag, wheel zoom to cursor. */
export class FlatMap {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D
  w = 0; h = 0; dpr = 1
  k = 100; tx = 0; ty = 0                       // mercator scale and translate (css px)
  proj: GeoProjection = geoMercator()
  state: MapState = { styles: [], rasterAlpha: 0.85 }
  onClick: (lon: number, lat: number, pop: Pop | null) => void = () => {}
  onHover: (pop: Pop | null, x: number, y: number) => void = () => {}
  onMove: () => void = () => {}                 // called after every render (pan, zoom, animation frame)
  colors = { ocean: '#000000', land: '#17181c', border: '#2e3037', graticule: '#111216' }
  private pops: Pop[]; private land: any; private borders: any; private heat: HeatGrid
  private screen = new Float32Array(0)
  private dragging = false; private moved = false; private raf = 0; private last: [number, number] = [0, 0]
  private anim: { t0: number; dur: number; from: [number, number, number]; to: [number, number, number] } | null = null

  constructor(container: HTMLElement, pops: Pop[], land: any, borders: any, heat: HeatGrid) {
    this.pops = pops; this.land = land; this.borders = borders; this.heat = heat
    this.canvas = document.createElement('canvas'); container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.screen = new Float32Array(pops.length * 2)
    new ResizeObserver(() => this.resize()).observe(container)
    this.resize(); this.k = this.minK(); this.tx = this.w / 2; this.ty = this.h / 2
    // pointer events: mouse and touch share one path; two touch pointers pinch-zoom
    const ptrs = new Map<number, [number, number]>()
    let pinch: { d: number; mid: [number, number] } | null = null
    const c = this.canvas; c.style.touchAction = 'none'
    c.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]); try { c.setPointerCapture(e.pointerId) } catch {} ; this.anim = null
      if (ptrs.size === 1) { this.dragging = true; this.moved = false; this.last = [e.clientX, e.clientY] }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; this.moved = true }
    })
    c.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse') this.hover(e); return }
      ptrs.set(e.pointerId, [e.clientX, e.clientY])
      if (ptrs.size >= 2 && pinch) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const r = c.getBoundingClientRect()
        this.tx += mid[0] - pinch.mid[0]; this.ty += mid[1] - pinch.mid[1]
        if (pinch.d > 0) this.zoomAt(mid[0] - r.left, mid[1] - r.top, d / pinch.d); else { this.clamp(); this.request() }
        pinch = { d, mid }
      } else if (this.dragging) {
        const dx = e.clientX - this.last[0], dy = e.clientY - this.last[1]; this.last = [e.clientX, e.clientY]
        if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true
        this.tx += dx; this.ty += dy; this.clamp(); this.request()
      }
    })
    const up = (e: PointerEvent) => {
      if (!ptrs.delete(e.pointerId)) return
      if (ptrs.size === 1) { pinch = null; const [rest] = [...ptrs.values()]; this.last = rest; this.moved = true }
      if (ptrs.size === 0) { const tap = this.dragging && !this.moved; this.dragging = false; pinch = null; if (tap && e.type === 'pointerup') this.click(e) }
    }
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up)
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)) }, { passive: false })
    c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.onHover(null, 0, 0) })
  }
  private minK() { return Math.max(this.w, this.h * 0.6) / (2 * Math.PI) }
  /** clamp a scale to [world fits, 200× that]; before the container has a size nothing is known, so leave it alone */
  private clampK(k: number) { return this.w < 2 ? k : Math.max(this.minK(), Math.min(this.minK() * 200, k)) }
  resize() {
    const box = this.canvas.parentElement!.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) return                        // hidden (display: none): keep the view for when it comes back
    this.w = Math.max(1, Math.floor(box.width)); this.h = Math.max(1, Math.floor(box.height)); this.dpr = window.devicePixelRatio || 1
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr; this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px'
    this.clamp(); this.request()
  }
  private clamp() {
    this.k = this.clampK(this.k)
    if (this.w < 2) return
    const half = Math.PI * this.k
    // wrap horizontally (continuous panning), clamp vertically to the poles
    const ww = 2 * half, c = this.w / 2
    this.tx = c + (((this.tx - c + half) % ww + ww) % ww) - half     // tx normalised to [c-half, c+half)
    if (2 * half <= this.h) this.ty = this.h / 2; else this.ty = Math.min(half, Math.max(this.h - half, this.ty))
  }
  setRaster(alpha: number) { this.state.rasterAlpha = alpha; this.request() }
  request() { this.onMove(); if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.render() }) }
  project(lon: number, lat: number): [number, number] { const p = this.proj([lon, lat])!; return [p[0], p[1]] }
  /** current view: centre lon/lat and scale */
  view(): { lon: number; lat: number; k: number } { const g = geoMercator().scale(this.k).translate([this.tx, this.ty]).invert!([this.w / 2, this.h / 2])!; return { lon: ((g[0] + 540) % 360) - 180, lat: g[1], k: this.k } }
  invert(x: number, y: number): [number, number] | null { const g = this.proj.invert!([x, y]); return g && Math.abs(g[1]) <= LAT_MAX ? [((g[0] + 540) % 360) - 180, g[1]] : null }
  zoomAt(x: number, y: number, f: number) {
    const k0 = this.k; this.k = this.clampK(this.k * f); f = this.k / k0
    this.tx = x - (x - this.tx) * f; this.ty = y - (y - this.ty) * f; this.clamp(); this.request()
  }
  /** animate so that (lon,lat) is centred at scale k (css px per radian) */
  flyTo(lon: number, lat: number, k: number, dur = 600) {
    k = this.clampK(k)
    const p = geoMercator().scale(k).translate([0, 0])([lon, lat])!
    if (dur <= 0) { this.anim = null; this.k = k; this.tx = this.w / 2 - p[0]; this.ty = this.h / 2 - p[1]; this.clamp(); this.request(); return }
    this.anim = { t0: performance.now(), dur, from: [this.k, this.tx, this.ty], to: [k, this.w / 2 - p[0], this.h / 2 - p[1]] }
    this.request()
  }
  fitTo(pts: [number, number][]) {
    if (!pts.length) return
    const m = geoMercator().scale(1).translate([0, 0])
    const xs = pts.map(p => m(p)![0]).sort((a, b) => a - b), ys = pts.map(p => m(p)![1]).sort((a, b) => a - b)
    const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(f * (a.length - 1)))]
    const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .05), y1 = q(ys, .95)
    const k = Math.min(this.minK() * 60, 0.8 * Math.min(this.w / Math.max(1e-3, x1 - x0), this.h / Math.max(1e-3, y1 - y0)))
    const c = m.invert!([(x0 + x1) / 2, (y0 + y1) / 2])!
    this.flyTo(c[0], c[1], k)
  }
  private popAt(x: number, y: number, radius = 8): Pop | null {
    let best: Pop | null = null, bd = radius * radius
    for (const p of this.pops) { const sx = this.screen[p.id * 2]; if (sx !== sx) continue; const sy = this.screen[p.id * 2 + 1]; const dd = (sx - x) ** 2 + (sy - y) ** 2; if (dd < bd) { bd = dd; best = p } }
    return best
  }
  private hover(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const p = this.popAt(x, y); this.canvas.style.cursor = p ? 'pointer' : 'grab'; this.onHover(p, x, y) }
  private click(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const p = this.popAt(x, y, e.pointerType === 'touch' ? 22 : 8) /* a fingertip needs a bigger target */; const g = this.invert(x, y); if (p) this.onClick(p.lon!, p.lat!, p); else if (g) this.onClick(g[0], g[1], null) }

  render() {
    if (this.anim) {
      const a = this.anim, t = Math.min(1, (performance.now() - a.t0) / a.dur), e = 1 - Math.pow(1 - t, 3)
      this.k = a.from[0] + (a.to[0] - a.from[0]) * e; this.tx = a.from[1] + (a.to[1] - a.from[1]) * e; this.ty = a.from[2] + (a.to[2] - a.from[2]) * e
      if (t >= 1) this.anim = null; else this.request()
      this.clamp()
    }
    const ctx = this.ctx, w = this.w, h = this.h, half = Math.PI * this.k, ww = 2 * half
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = this.colors.ocean; ctx.fillRect(0, 0, w, h)
    this.screen.fill(NaN)
    // draw every world copy that intersects the viewport (continuous horizontal panning)
    const offsets: number[] = []
    for (let i = -2; i <= 2; i++) { const x0 = this.tx + i * ww - half; if (x0 < w && x0 + ww > 0) offsets.push(i * ww) }
    this.proj = geoMercator().scale(this.k).translate([this.tx, this.ty]).precision(0.3)
    for (const off of offsets) {
      const proj = geoMercator().scale(this.k).translate([this.tx + off, this.ty]).precision(0.3), path = geoPath(proj, ctx)
      ctx.beginPath(); path(this.land); ctx.fillStyle = this.colors.land; ctx.fill()
      if (this.state.rasterAlpha > 0) {
        ctx.save(); ctx.clip(); ctx.globalAlpha = this.state.rasterAlpha; ctx.imageSmoothingEnabled = true
        ctx.drawImage(this.heat.canvas, this.tx + off - half, this.ty - half, ww, ww)
        ctx.restore(); ctx.globalAlpha = 1
      }
      ctx.beginPath(); path(this.borders); ctx.strokeStyle = this.colors.border; ctx.lineWidth = 0.8; ctx.stroke()
      const st = this.state.styles
      for (const p of this.pops) {
        const s = st[p.id]; if (!s || p.dlat == null) continue
        const q = proj([p.dlon!, p.dlat])!
        if (q[0] < -10 || q[0] > w + 10 || q[1] < -10 || q[1] > h + 10) continue
        this.screen[p.id * 2] = q[0]; this.screen[p.id * 2 + 1] = q[1]
        this.dot(ctx, p, q[0], q[1], s.r, s.color, s.alpha)
      }
    }
    ctx.globalAlpha = 1
    if (this.anim) this.onMove()
  }
  private dot(ctx: CanvasRenderingContext2D, p: Pop, x: number, y: number, r: number, color: string, alpha: number) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath()
    if (p.kind === 'm') ctx.arc(x, y, r, 0, 2 * Math.PI)
    else { const rr = r * 1.2; ctx.moveTo(x, y - rr); ctx.lineTo(x + rr, y); ctx.lineTo(x, y + rr); ctx.lineTo(x - rr, y); ctx.closePath() }
    ctx.fill()
  }
}
