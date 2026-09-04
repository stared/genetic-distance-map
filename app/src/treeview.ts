import type { Tree } from './tree'

export interface DendroOpts {
  tree: Tree; open: Set<number>; focus: number; colors: Map<number, string>
  name: (node: number) => string; hasMembers: (node: number) => boolean
  onLeaf: (node: number) => void; onJunction: (node: number) => void; onCrumb: (node: number) => void
}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const NS = 'http://www.w3.org/2000/svg'
const svgEl = (tag: string, attrs: Record<string, string | number>) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e }

/** Dendrogram of the branch in focus down to the current cut: x is Ward distance (focus height on the left, 0 on
 *  the right), every cut cluster is a labelled row, junctions are clickable. Breadcrumbs above lead back up. */
export function renderDendro(el: HTMLElement, o: DendroOpts) {
  const t = o.tree
  el.innerHTML = ''
  // breadcrumbs: root … focus
  const crumbs = document.createElement('div'); crumbs.className = 'crumbs'
  const anc = t.ancestors(o.focus), label = (n: number) => n === t.root ? 'World' : o.name(n)
  anc.forEach((n, i) => {
    if (i < anc.length - 1 && label(n) === label(anc[i + 1])) return   // skip a step that keeps the same name
    const s = document.createElement('span'); s.textContent = label(n)
    if (i < anc.length - 1) s.onclick = () => o.onCrumb(n)
    crumbs.appendChild(s)
  })
  el.appendChild(crumbs)
  // scale caption above the diagram: focus height on the left, 0 on the right
  const h0 = t.nodes[o.focus].height || 1
  const axis = document.createElement('div'); axis.className = 'axis'
  axis.innerHTML = `<span>${h0.toFixed(1)}</span><span>distance</span><span>0</span>`
  el.appendChild(axis)
  // rows for the cut clusters under focus, in tree order (larger child first)
  const wrap = document.createElement('div'); wrap.className = 'dendro'
  const svg = svgEl('svg', { class: 'lines' }) as SVGSVGElement
  const rows = document.createElement('div'); rows.className = 'rows'
  wrap.appendChild(svg); wrap.appendChild(rows); el.appendChild(wrap)
  const rowOf = new Map<number, HTMLElement>(), leaves: number[] = []
  const collect = (n: number) => {
    if (o.open.has(n) && !t.isLeaf(n)) { const nd = t.nodes[n]; for (const c of [nd.left, nd.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size)) if (o.hasMembers(c)) collect(c); return }
    leaves.push(n)
    const row = document.createElement('div'); row.className = 'row' + (t.isLeaf(n) ? ' single' : '')
    row.innerHTML = `<span class="sw" style="background:${o.colors.get(n) ?? '#999'}"></span><span class="name">${esc(o.name(n))}</span>`
    if (!t.isLeaf(n)) row.onclick = () => o.onLeaf(n)
    rows.appendChild(row); rowOf.set(n, row)
  }
  collect(o.focus)
  // geometry after layout
  const W = 120, H = rows.offsetHeight
  svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H)); svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  const x = (h: number) => 6 + (W - 12) * (1 - Math.max(0, h) / h0)
  const yOf = new Map<number, number>()
  const place = (n: number): number => {
    const r = rowOf.get(n); if (r) { const y = r.offsetTop + r.offsetHeight / 2; yOf.set(n, y); return y }
    const nd = t.nodes[n], kids = [nd.left, nd.right].filter(c => o.hasMembers(c))
    const ys = kids.map(place), y = ys.reduce((a, b) => a + b, 0) / ys.length; yOf.set(n, y); return y
  }
  place(o.focus)
  const draw = (n: number) => {
    if (rowOf.has(n)) { svg.appendChild(svgEl('line', { x1: x(t.nodes[n].height), x2: W, y1: yOf.get(n)!, y2: yOf.get(n)!, class: 'stub' })); return }
    const nd = t.nodes[n], kids = [nd.left, nd.right].filter(c => o.hasMembers(c)), xn = x(nd.height)
    const ys = kids.map(c => yOf.get(c)!)
    svg.appendChild(svgEl('line', { x1: xn, x2: xn, y1: Math.min(...ys), y2: Math.max(...ys), class: 'edge' }))
    for (const c of kids) { svg.appendChild(svgEl('line', { x1: xn, x2: x(t.nodes[c].height), y1: yOf.get(c)!, y2: yOf.get(c)!, class: 'edge' })); draw(c) }
    const dot = svgEl('circle', { cx: xn, cy: yOf.get(n)!, r: 4.5, fill: o.colors.get(n) ?? '#999', class: 'junction' + (n === o.focus ? ' focus' : '') })
    dot.addEventListener('click', () => o.onJunction(n)); svg.appendChild(dot)
  }
  draw(o.focus)
}
