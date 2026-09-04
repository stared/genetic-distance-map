import type { Tree } from './tree'

export interface TreeListOpts {
  tree: Tree; open: Set<number>; focus: number; colors: Map<number, string>
  name: (node: number) => string; hasMembers: (node: number) => boolean
  onSelect: (node: number) => void; onToggle: (node: number) => void; onHover: (node: number | null) => void
}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const NS = 'http://www.w3.org/2000/svg'
const line = (x1: number, y1: number, x2: number, y2: number) => { const e = document.createElementNS(NS, 'line'); e.setAttribute('x1', String(x1)); e.setAttribute('y1', String(y1)); e.setAttribute('x2', String(x2)); e.setAttribute('y2', String(y2)); return e }

/** The cluster tree, pruned to what matters: the path down to the selected branch, the selected branch (lit),
 *  and its clusters. Rows are indented in proportion to the square root of Ward distance and joined by
 *  connector lines. + splits a cluster, − merges it back, clicking a name selects it (again: back to world). */
export function renderTreeList(el: HTMLElement, o: TreeListOpts) {
  const t = o.tree
  el.innerHTML = ''
  const box = document.createElement('div'); box.className = 'tlist'
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'links')
  box.appendChild(svg); el.appendChild(box)
  const IND = 120, STEP = 14
  // indentation: square root of Ward distance, scaled to the selected branch so its splits fill the width
  const hTop = t.nodes[o.focus].height || 1
  const path = o.focus === t.root ? [] : t.ancestors(o.focus).slice(1, -1).filter((n, i, a) => o.name(n) !== o.name(i === a.length - 1 ? o.focus : a[i + 1]))
  const base = path.length * STEP
  const x = (n: number) => base + Math.round(IND * (1 - Math.sqrt(Math.max(0, t.nodes[n].height) / hTop)))
  const xOf = new Map<number, number>()
  const rowOf = new Map<number, HTMLElement>(), kidsOf = new Map<number, number[]>()
  const kids = (n: number) => { const nd = t.nodes[n]; return [nd.left, nd.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size).filter(c => o.hasMembers(c)) }
  const row = (n: number, vparent: number, cls: string, xp = x(n)) => {
    const leaf = t.isLeaf(n), isOpen = o.open.has(n) && !leaf, cut = !isOpen
    if (vparent >= 0) kidsOf.get(vparent)!.push(n)
    kidsOf.set(n, []); xOf.set(n, xp)
    const e = document.createElement('div'); e.className = 'trow ' + cls + (cut ? ' cut' : '')
    e.style.paddingLeft = xp + 'px'
    e.innerHTML = (leaf ? '<span class="tg none"></span>' : `<span class="tg" title="${isOpen ? 'Merge back' : 'Split in two'}">${isOpen ? '−' : '+'}</span>`)
      + (cut ? `<span class="sw" style="background:${o.colors.get(n) ?? '#999'}"></span>` : '')
      + `<span class="name">${esc(o.name(n))}</span>`
    if (!leaf) e.querySelector<HTMLElement>('.tg')!.onclick = ev => { ev.stopPropagation(); o.onToggle(n) }
    e.onclick = () => o.onSelect(n)
    e.onmouseenter = () => o.onHover(n); e.onmouseleave = () => o.onHover(null)
    box.appendChild(e); rowOf.set(n, e)
    return isOpen
  }
  // the subtree of n; an open branch that just repeats its parent's name is folded into it
  const sub = (n: number, vparent: number) => {
    if (o.open.has(n) && !t.isLeaf(n) && vparent >= 0 && o.name(n) === o.name(vparent)) { for (const c of kids(n)) sub(c, vparent); return }
    if (row(n, vparent, '')) for (const c of kids(n)) sub(c, n)
  }
  if (o.focus === t.root) for (const c of kids(t.root)) sub(c, -1)
  else {
    // path from the top to the selected branch as a short stair, then the branch itself, lit
    let vp = -1
    path.forEach((n, i) => { row(n, vp, 'anc', i * STEP); vp = n })
    if (row(o.focus, vp, 'on')) for (const c of kids(o.focus)) sub(c, o.focus)
  }
  // connector lines after layout, attached to the circles: down from the parent's circle, into each child's circle
  svg.setAttribute('width', String(box.clientWidth)); svg.setAttribute('height', String(box.scrollHeight))
  const glyph = (n: number) => { const e = rowOf.get(n)!, g = e.querySelector<HTMLElement>('.tg')!; return { x: e.offsetLeft + g.offsetLeft + g.offsetWidth / 2, y: e.offsetTop + g.offsetTop + g.offsetHeight / 2, r: g.offsetHeight / 2 } }
  for (const [n] of rowOf) {
    const ks = kidsOf.get(n)!; if (!ks.length) continue
    const p = glyph(n), cs = ks.map(glyph)
    svg.appendChild(line(p.x, p.y + p.r, p.x, Math.max(...cs.map(c => c.y))))
    for (const c of cs) svg.appendChild(line(p.x, c.y, c.x - c.r, c.y))
  }
}
