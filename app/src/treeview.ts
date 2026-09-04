import type { Tree } from './tree'

export interface TreeViewOpts {
  tree: Tree; open: Set<number>; focus: number; colors: Map<number, string>
  name: (node: number) => string; hasMembers: (node: number) => boolean
  onSelect: (node: number) => void; onSplit: (node: number) => void; onMerge: (node: number) => void; onHover: (node: number | null) => void
}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const NS = 'http://www.w3.org/2000/svg'
const svgEl = (tag: string, attrs: Record<string, string | number>) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e }
const X0 = 8, DX = 96, R = 8   // selected node's circle x, cluster column x, circle radius

/** Two rows, then a dendrogram.  Row 1 (muted): the branch one level up, click to go there.  Row 2 (bold): the
 *  selected branch.  Below it its clusters, one aligned row each with ⊕ (split), swatch and name; junctions between
 *  them are ⊖ circles (merge) placed left in proportion to the square root of Ward distance. */
export function renderTree(el: HTMLElement, o: TreeViewOpts) {
  const t = o.tree
  el.innerHTML = ''
  const box = document.createElement('div'); box.className = 'tlist'
  const svg = svgEl('svg', { class: 'links' }); box.appendChild(svg); el.appendChild(box)
  const circle = (sign: string, title: string) => `<span class="tg" title="${esc(title)}">${sign}</span>`
  const mkRow = (cls: string, html: string, left: number) => { const e = document.createElement('div'); e.className = 'trow ' + cls; e.style.paddingLeft = left + 'px'; e.innerHTML = html; box.appendChild(e); return e }
  const sel = o.focus, atRoot = sel === t.root
  let selRow: HTMLElement | null = null, upRow: HTMLElement | null = null
  if (!atRoot) {
    let parent = t.nodes[sel].parent   // one level up, skipping ancestors that only repeat this branch's name
    while (parent !== t.root && o.name(parent) === o.name(sel)) parent = t.nodes[parent].parent
    const up = upRow = mkRow('anc', `<span class="tg dot"></span><span class="name">${esc(parent === t.root ? 'World' : o.name(parent))}</span>`, X0 - R)
    up.onclick = () => o.onSelect(parent)
    const isOpen = o.open.has(sel) && !t.isLeaf(sel)
    selRow = mkRow('on', (t.isLeaf(sel) ? '<span class="tg none"></span>' : circle(isOpen ? '−' : '+', isOpen ? 'Merge into one cluster' : 'Split in two'))
      + (isOpen ? '' : `<span class="sw" style="background:${o.colors.get(sel) ?? '#999'}"></span>`) + `<span class="name">${esc(o.name(sel))}</span>`, X0 - R)
    if (!t.isLeaf(sel)) selRow.querySelector<HTMLElement>('.tg')!.onclick = e => { e.stopPropagation(); isOpen ? o.onMerge(sel) : o.onSplit(sel) }
    selRow.onclick = () => o.onSelect(sel)
    selRow.onmouseenter = () => o.onHover(sel); selRow.onmouseleave = () => o.onHover(null)
  }
  // cluster rows in tree order
  const rowOf = new Map<number, HTMLElement>()
  const kids = (n: number) => { const nd = t.nodes[n]; return [nd.left, nd.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size).filter(c => o.hasMembers(c)) }
  const walk = (n: number) => {
    if (o.open.has(n) && !t.isLeaf(n)) { kids(n).forEach(walk); return }
    const row = mkRow('cut', (t.isLeaf(n) ? '<span class="tg none"></span>' : circle('+', 'Split in two')) + `<span class="sw" style="background:${o.colors.get(n) ?? '#999'}"></span><span class="name">${esc(o.name(n))}</span>`, DX - R)
    if (!t.isLeaf(n)) row.querySelector<HTMLElement>('.tg')!.onclick = e => { e.stopPropagation(); o.onSplit(n) }
    row.onclick = () => o.onSelect(n)
    row.onmouseenter = () => o.onHover(n); row.onmouseleave = () => o.onHover(null)
    rowOf.set(n, row)
  }
  if (o.open.has(sel) && !t.isLeaf(sel)) kids(sel).forEach(walk)
  // geometry after layout
  svg.setAttribute('width', String(box.clientWidth)); svg.setAttribute('height', String(box.scrollHeight))
  const center = (e: HTMLElement) => { const g = e.querySelector<HTMLElement>('.tg')!; return { x: e.offsetLeft + g.offsetLeft + g.offsetWidth / 2, y: e.offsetTop + g.offsetTop + g.offsetHeight / 2 } }
  const h0 = t.nodes[sel].height || 1, xj = (h: number) => X0 + (DX - X0) * (1 - Math.sqrt(Math.max(0, h) / h0))
  const pos = new Map<number, { x: number; y: number }>()
  const place = (n: number): { x: number; y: number } => {
    const r = rowOf.get(n); if (r) { const p = center(r); pos.set(n, p); return p }
    const ks = kids(n).map(place), y = ks.reduce((s, p) => s + p.y, 0) / ks.length, p = { x: n === sel ? X0 : xj(t.nodes[n].height), y }
    pos.set(n, p); return p
  }
  const line = (x1: number, y1: number, x2: number, y2: number) => svg.appendChild(svgEl('line', { x1, y1, x2, y2 }))
  if (!atRoot) { const a = center(upRow!), b = center(selRow!); line(a.x, a.y + R, b.x, b.y - R) }
  if (rowOf.size) {
    if (!atRoot) { place(sel); pos.set(sel, { x: center(selRow!).x, y: center(selRow!).y }) } else place(sel)
    const draw = (n: number) => {
      if (rowOf.has(n)) return
      const p = pos.get(n)!, ks = kids(n), cs = ks.map(c => pos.get(c)!)
      if (n === sel && !atRoot) { const sp = center(selRow!); line(sp.x, sp.y + R, sp.x, Math.max(...cs.map(c => c.y))) }
      else if (n === sel) line(p.x, Math.min(...cs.map(c => c.y)), p.x, Math.max(...cs.map(c => c.y)))
      else line(p.x, Math.min(...cs.map(c => c.y)), p.x, Math.max(...cs.map(c => c.y)))
      const px = n === sel && !atRoot ? center(selRow!).x : p.x
      for (const c of cs) line(px, c.y, c.x - R, c.y)
      if (n !== sel && n !== t.root) {   // merge handle at the junction (none on the world root)
        const g = svgEl('g', { class: 'junction', transform: `translate(${p.x},${p.y})` })
        g.appendChild(svgEl('circle', { r: R }))
        const tx = svgEl('text', { y: 1 }); tx.textContent = '−'; g.appendChild(tx)
        const tip = svgEl('title', {}); tip.textContent = 'Merge into one cluster: ' + o.name(n); g.appendChild(tip)
        g.addEventListener('click', () => o.onMerge(n)); svg.appendChild(g)
      }
      ks.forEach(draw)
    }
    draw(sel)
  }
}
