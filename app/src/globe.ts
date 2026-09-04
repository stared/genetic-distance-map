import { geoOrthographic, geoPath, geoGraticule10, type GeoProjection } from 'd3-geo'
import type { Pop } from './types'
import { HeatGrid } from './heat'

export interface PointStyle { color: string; alpha: number; r: number }
export interface GlobeState {
  styles: (PointStyle | null)[]        // per pop id; null = hidden
  selection: [number, number] | null    // lon, lat
  rasterAlpha: number
}
const DEG = Math.PI / 180

/** Canvas-drawn orthographic globe: land, raster overlay (reprojected per pixel), points. */
export class Globe {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D
  rot: [number, number] = [-20, -40]   // d3 rotate: [-lon0, -lat0]
  scale = 1
  w = 0; h = 0; R = 0; dpr = 1
  proj: GeoProjection
  raster = document.createElement('canvas')
  state: GlobeState = { styles: [], selection: null, rasterAlpha: 0.85 }
  onClick: (lon: number, lat: number, pop: Pop | null) => void = () => {}
  onHover: (pop: Pop | null, x: number, y: number) => void = () => {}
  private pops: Pop[]; private land: any; private borders: any; private heat: HeatGrid
  private screen = new Float32Array(0)   // projected x,y per pop (NaN if hidden/back)
  private dragging = false; private moved = false; private lowRes = false; private raf = 0
  private anim: { t0: number; dur: number; r0: [number, number]; r1: [number, number]; s0: number; s1: number } | null = null
  colors = { ocean: '#0b0c0f', land: '#1c1d22', border: '#33353c', graticule: '#16171b' }

  constructor(container: HTMLElement, pops: Pop[], land: any, borders: any, heat: HeatGrid) {
    this.pops = pops; this.land = land; this.borders = borders; this.heat = heat
    this.canvas = document.createElement('canvas'); container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.proj = geoOrthographic().clipAngle(90)
    this.screen = new Float32Array(pops.length * 2)
    new ResizeObserver(() => this.resize()).observe(container)
    this.resize()
    this.canvas.addEventListener('mousedown', e => { this.dragging = true; this.moved = false; this.anim = null; this.last = [e.clientX, e.clientY] })
    window.addEventListener('mouseup', e => { if (!this.dragging) return; this.dragging = false; this.lowRes = false; this.request(); if (!this.moved) this.click(e) })
    window.addEventListener('mousemove', e => {
      if (this.dragging) {
        const dx = e.clientX - this.last[0], dy = e.clientY - this.last[1]; this.last = [e.clientX, e.clientY]
        if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true
        const k = 180 / Math.PI / this.R
        this.rot = [this.rot[0] + dx * k / Math.max(0.35, Math.cos(this.rot[1] * DEG)), Math.max(-90, Math.min(90, this.rot[1] - dy * k))]
        this.lowRes = true; this.request()
      } else this.hover(e)
    })
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)) }, { passive: false })
    this.canvas.addEventListener('mouseleave', () => this.onHover(null, 0, 0))
  }
  private last: [number, number] = [0, 0]
  resize() {
    const box = this.canvas.parentElement!.getBoundingClientRect()
    this.w = Math.max(1, Math.floor(box.width)); this.h = Math.max(1, Math.floor(box.height)); this.dpr = window.devicePixelRatio || 1
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr; this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px'
    this.request()
  }
  setRaster(alpha: number) { this.state.rasterAlpha = alpha; this.request() }
  request() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.render() }) }

  /** geo -> screen (css px) or null when on the far side */
  project(lon: number, lat: number): [number, number] | null {
    const lon0 = -this.rot[0], lat0 = -this.rot[1]
    const cosc = Math.sin(lat0 * DEG) * Math.sin(lat * DEG) + Math.cos(lat0 * DEG) * Math.cos(lat * DEG) * Math.cos((lon - lon0) * DEG)
    if (cosc < 0) return null
    const p = this.proj([lon, lat]); return p ? [p[0], p[1]] : null
  }
  invert(x: number, y: number): [number, number] | null {
    const nx = (x - this.w / 2) / this.R, ny = (this.h / 2 - y) / this.R, rho = Math.hypot(nx, ny)
    if (rho > 1) return null
    const c = Math.asin(rho), lon0 = -this.rot[0] * DEG, lat0 = -this.rot[1] * DEG
    const lat = rho === 0 ? lat0 : Math.asin(Math.cos(c) * Math.sin(lat0) + ny * Math.sin(c) * Math.cos(lat0) / rho)
    const lon = lon0 + Math.atan2(nx * Math.sin(c), rho * Math.cos(c) * Math.cos(lat0) - ny * Math.sin(c) * Math.sin(lat0))
    return [((lon / DEG + 540) % 360) - 180, lat / DEG]
  }
  zoomAt(x: number, y: number, f: number) {
    const before = this.invert(x, y)
    this.scale = Math.max(0.6, Math.min(40, this.scale * f)); this.updateProj()
    if (before) for (let i = 0; i < 3; i++) { const after = this.invert(x, y); if (!after) break; this.rot = [this.rot[0] - (after[0] - before[0]), Math.max(-90, Math.min(90, this.rot[1] - (after[1] - before[1])))]; this.updateProj() }
    this.request()
  }
  /** animate to centre (lon,lat) at scale */
  flyTo(lon: number, lat: number, scale: number, dur = 700) {
    let dl = -lon - this.rot[0]; dl = ((dl + 540) % 360) - 180
    this.anim = { t0: performance.now(), dur, r0: [...this.rot] as [number, number], r1: [this.rot[0] + dl, -lat], s0: this.scale, s1: Math.max(0.6, Math.min(40, scale)) }
    this.request()
  }
  fitTo(pts: [number, number][]) {
    if (!pts.length) return
    // centre = mean unit vector; extent = max angular distance (5–95th pct)
    let X = 0, Y = 0, Z = 0
    for (const [lo, la] of pts) { X += Math.cos(la * DEG) * Math.cos(lo * DEG); Y += Math.cos(la * DEG) * Math.sin(lo * DEG); Z += Math.sin(la * DEG) }
    const lon = Math.atan2(Y, X) / DEG, lat = Math.atan2(Z, Math.hypot(X, Y)) / DEG
    const ang = pts.map(([lo, la]) => Math.acos(Math.max(-1, Math.min(1, Math.sin(la * DEG) * Math.sin(lat * DEG) + Math.cos(la * DEG) * Math.cos(lat * DEG) * Math.cos((lo - lon) * DEG))))).sort((a, b) => a - b)
    const a = ang[Math.min(ang.length - 1, Math.floor(0.92 * (ang.length - 1)))] + 3 * DEG
    const scale = Math.min(12, 0.85 / Math.sin(Math.min(a, 80 * DEG)))
    this.flyTo(lon, lat, scale)
  }
  private updateProj() {
    this.R = Math.min(this.w, this.h) * 0.47 * this.scale
    this.proj.rotate(this.rot).scale(this.R).translate([this.w / 2, this.h / 2])
  }
  private popAt(x: number, y: number): Pop | null {
    let best: Pop | null = null, bd = 64
    for (const p of this.pops) { const sx = this.screen[p.id * 2]; if (sx !== sx) continue; const sy = this.screen[p.id * 2 + 1]; const dd = (sx - x) ** 2 + (sy - y) ** 2; if (dd < bd) { bd = dd; best = p } }
    return best
  }
  private hover(e: MouseEvent) { const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const p = this.popAt(x, y); this.canvas.style.cursor = p ? 'pointer' : 'grab'; this.onHover(p, x, y) }
  private click(e: MouseEvent) { const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const p = this.popAt(x, y); const g = this.invert(x, y); if (p) this.onClick(p.lon!, p.lat!, p); else if (g) this.onClick(g[0], g[1], null) }

  render() {
    if (this.anim) {
      const a = this.anim, t = Math.min(1, (performance.now() - a.t0) / a.dur), e = 1 - Math.pow(1 - t, 3)
      this.rot = [a.r0[0] + (a.r1[0] - a.r0[0]) * e, a.r0[1] + (a.r1[1] - a.r0[1]) * e]; this.scale = a.s0 + (a.s1 - a.s0) * e
      if (t >= 1) this.anim = null; else this.request()
      this.lowRes = !!this.anim
    }
    this.updateProj()
    const ctx = this.ctx, w = this.w, h = this.h
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const path = geoPath(this.proj, ctx)
    // sphere
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = this.colors.ocean; ctx.fill()
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = this.colors.graticule; ctx.lineWidth = 0.6; ctx.stroke()
    ctx.beginPath(); path(this.land); ctx.fillStyle = this.colors.land; ctx.fill()
    // raster overlay, clipped to the vector land polygon for crisp coastlines
    if (this.state.rasterAlpha > 0) { ctx.save(); ctx.beginPath(); path(this.land); ctx.clip(); this.drawRaster(); ctx.restore() }
    ctx.beginPath(); path(this.borders); ctx.strokeStyle = this.colors.border; ctx.lineWidth = 0.7; ctx.stroke()
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = '#2a2b31'; ctx.lineWidth = 1; ctx.stroke()
    // points (ancients as diamonds, moderns as circles)
    this.screen.fill(NaN)
    const st = this.state.styles
    for (const p of this.pops) {
      const s = st[p.id]; if (!s || p.dlat == null) continue
      const q = this.project(p.dlon!, p.dlat); if (!q) continue
      this.screen[p.id * 2] = q[0]; this.screen[p.id * 2 + 1] = q[1]
      ctx.globalAlpha = s.alpha; ctx.fillStyle = s.color; ctx.beginPath()
      if (p.kind === 'm') ctx.arc(q[0], q[1], s.r, 0, 2 * Math.PI)
      else { const r = s.r * 1.15; ctx.moveTo(q[0], q[1] - r); ctx.lineTo(q[0] + r, q[1]); ctx.lineTo(q[0], q[1] + r); ctx.lineTo(q[0] - r, q[1]); ctx.closePath() }
      ctx.fill()
    }
    ctx.globalAlpha = 1
    if (this.state.selection) { const q = this.project(...this.state.selection); if (q) { ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 2 * Math.PI); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.arc(q[0], q[1], 13, 0, 2 * Math.PI); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke() } }
  }
  /** reproject the Mercator raster (heat.img) onto the visible disc, pixel by pixel */
  private drawRaster() {
    const q = this.lowRes ? 0.5 : Math.min(this.dpr, 1.5)
    const rw = Math.ceil(this.w * q), rh = Math.ceil(this.h * q)
    if (this.raster.width !== rw || this.raster.height !== rh) { this.raster.width = rw; this.raster.height = rh }
    const rctx = this.raster.getContext('2d')!
    const out = rctx.createImageData(rw, rh), o = out.data, src = this.heat.img.data
    const W = this.heat.canvas.width, H = this.heat.canvas.height, S = W / (2 * Math.PI)
    const lon0 = -this.rot[0] * DEG, lat0 = -this.rot[1] * DEG, sl0 = Math.sin(lat0), cl0 = Math.cos(lat0)
    const cx = this.w / 2, cy = this.h / 2, R = this.R, alpha = this.state.rasterAlpha
    const x0 = Math.max(0, Math.floor((cx - R) * q)), x1 = Math.min(rw, Math.ceil((cx + R) * q)), y0 = Math.max(0, Math.floor((cy - R) * q)), y1 = Math.min(rh, Math.ceil((cy + R) * q))
    for (let py = y0; py < y1; py++) {
      const ny = (cy - (py + 0.5) / q) / R
      for (let px = x0; px < x1; px++) {
        const nx = ((px + 0.5) / q - cx) / R, rho2 = nx * nx + ny * ny
        if (rho2 > 1) continue
        const rho = Math.sqrt(rho2), c = Math.asin(rho), sc = Math.sin(c), cc = Math.cos(c)
        const lat = rho === 0 ? lat0 : Math.asin(cc * sl0 + ny * sc * cl0 / rho)
        const lon = lon0 + Math.atan2(nx * sc, rho * cc * cl0 - ny * sc * sl0)
        const t = Math.tan(Math.PI / 4 + lat / 2); if (t <= 0) continue
        const gy = H / 2 - S * Math.log(t); if (gy < 0 || gy >= H - 1) continue
        let gx = ((lon / (2 * Math.PI)) + 0.5) * W; gx = ((gx % W) + W) % W
        // bilinear, alpha-weighted
        const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, ix1 = (ix + 1) % W, iy1 = iy + 1
        let r = 0, g = 0, b = 0, a = 0
        const acc = (i: number, wgt: number) => { const al = src[i + 3] * wgt; r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al }
        acc((iy * W + ix) * 4, (1 - fx) * (1 - fy)); acc((iy * W + ix1) * 4, fx * (1 - fy)); acc((iy1 * W + ix) * 4, (1 - fx) * fy); acc((iy1 * W + ix1) * 4, fx * fy)
        if (a === 0) continue
        const oi = (py * rw + px) * 4
        o[oi] = r / a; o[oi + 1] = g / a; o[oi + 2] = b / a; o[oi + 3] = a * alpha
      }
    }
    rctx.putImageData(out, 0, 0)
    this.ctx.drawImage(this.raster, 0, 0, rw, rh, 0, 0, this.w, this.h)
  }
}
