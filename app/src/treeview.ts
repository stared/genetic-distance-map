import type { Tree } from './tree'

export interface DendroOpts {
  tree: Tree; open: Set<number>; focus: number; colors: Map<number, string>
  name: (node: number) => string; hasMembers: (node: number) => boolean
  onSelect: (node: number) => void; onSplit: (node: number) => void; onMerge: (node: number) => void; onHover: (node: number | null) => void
}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const NS = 'http://www.w3.org/2000/svg'
const svgEl = (tag: string, attrs: Record<string, string | number>) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e }

/** Dendrogram of the branch in focus down to the current cut. x is Ward distance on a square-root scale.
 *  Each cut cluster is a row: its swatch splits it, its name selects it (focus + zoom); a junction merges its split. */
export function renderDendro(el: HTMLElement, o: DendroOpts) {
  const t = o.tree
  el.innerHTML = ''
  if (o.focus !== t.root) {   // zoomed into a branch: a link up, then the branch name as the diagram's title
    const parent = t.nodes[o.focus].parent
    const up = document.createElement('div'); up.className = 'up'; up.textContent = '‹ ' + (parent === t.root ? 'World' : o.name(parent)); up.onclick = () => o.onSelect(parent)
    const head = document.createElement('div'); head.className = 'head'; head.textContent = o.name(o.focus)
    el.appendChild(up); el.appendChild(head)
  }
  const wrap = document.createElement('div'); wrap.className = 'dendro'
  const svg = svgEl('svg', { class: 'lines' }) as SVGSVGElement
  const rows = document.createElement('div'); rows.className = 'rows'
  wrap.appendChild(svg); wrap.appendChild(rows); el.appendChild(wrap)
  const rowOf = new Map<number, HTMLElement>()
  const collect = (n: number) => {
    if (o.open.has(n) && !t.isLeaf(n)) { const nd = t.nodes[n]; for (const c of [nd.left, nd.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size)) if (o.hasMembers(c)) collect(c); return }
    const row = document.createElement('div'); row.className = 'row'
    row.innerHTML = `<span class="sw" style="background:${o.colors.get(n) ?? '#999'}"${t.isLeaf(n) ? '' : ' title="Split in two"'}></span><span class="name" title="Zoom to this cluster">${esc(o.name(n))}</span>`
    const sw = row.querySelector<HTMLElement>('.sw')!, name = row.querySelector<HTMLElement>('.name')!
    if (!t.isLeaf(n)) { sw.classList.add('act'); sw.onclick = e => { e.stopPropagation(); o.onSplit(n) } }
    name.onclick = () => o.onSelect(n)
    row.onmouseenter = () => o.onHover(n); row.onmouseleave = () => o.onHover(null)
    rows.appendChild(row); rowOf.set(n, row)
  }
  collect(o.focus)
  // geometry after layout
  const W = 150, H = rows.offsetHeight, h0 = t.nodes[o.focus].height || 1
  svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H)); svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  const x = (h: number) => 6 + (W - 10) * (1 - Math.sqrt(Math.max(0, h) / h0))   // square-root scale: small splits stay visible
  const yOf = new Map<number, number>()
  const place = (n: number): number => {
    const r = rowOf.get(n); if (r) { const y = r.offsetTop + r.offsetHeight / 2; yOf.set(n, y); return y }
    const nd = t.nodes[n], kids = [nd.left, nd.right].filter(c => o.hasMembers(c))
    const ys = kids.map(place), y = ys.reduce((a, b) => a + b, 0) / ys.length; yOf.set(n, y); return y
  }
  place(o.focus)
  const draw = (n: number) => {
    const y = yOf.get(n)!
    if (rowOf.has(n)) { svg.appendChild(svgEl('line', { x1: x(t.nodes[n].height), x2: W, y1: y, y2: y, class: 'stub' })); return }
    const nd = t.nodes[n], kids = [nd.left, nd.right].filter(c => o.hasMembers(c)), xn = x(nd.height)
    const ys = kids.map(c => yOf.get(c)!)
    svg.appendChild(svgEl('line', { x1: xn, x2: xn, y1: Math.min(...ys), y2: Math.max(...ys), class: 'edge' }))
    for (const c of kids) { svg.appendChild(svgEl('line', { x1: xn, x2: x(t.nodes[c].height), y1: yOf.get(c)!, y2: yOf.get(c)!, class: 'edge' })); draw(c) }
    // the junction is a merge handle: a small neutral mark, no colour (it is not a region on the map)
    const j = svgEl('rect', { x: xn - 4, y: y - 4, width: 8, height: 8, rx: 1, class: 'junction' })
    const tip = svgEl('title', {}); tip.textContent = 'Merge back'; j.appendChild(tip)
    j.addEventListener('click', () => o.onMerge(n)); svg.appendChild(j)
  }
  draw(o.focus)
}
