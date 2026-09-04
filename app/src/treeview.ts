import type { Tree } from './tree'

export interface TreeListOpts {
  tree: Tree; open: Set<number>; focus: number; colors: Map<number, string>
  name: (node: number) => string; hasMembers: (node: number) => boolean
  onSelect: (node: number) => void; onToggle: (node: number) => void; onHover: (node: number | null) => void
}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const NS = 'http://www.w3.org/2000/svg'
const line = (x1: number, y1: number, x2: number, y2: number) => { const e = document.createElementNS(NS, 'line'); e.setAttribute('x1', String(x1)); e.setAttribute('y1', String(y1)); e.setAttribute('x2', String(x2)); e.setAttribute('y2', String(y2)); return e }

/** The cluster tree as rows: every branch down to the current cut is a row, indented in proportion to the
 *  square root of its Ward distance and joined to its parent by connector lines. [+] splits a cluster, [−] merges
 *  a split back, clicking a name selects that branch (the map zooms to it, its clusters get the colours, the rest
 *  is grey; rows outside it are dimmed the same way). Clicking the selected name again returns to the world. */
export function renderTreeList(el: HTMLElement, o: TreeListOpts) {
  const t = o.tree
  el.innerHTML = ''
  const box = document.createElement('div'); box.className = 'tlist'
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'links')
  box.appendChild(svg); el.appendChild(box)
  const IND = 130, h0 = t.nodes[t.root].height || 1
  const x = (h: number) => Math.round(IND * (1 - Math.sqrt(Math.max(0, h) / h0)))
  const rowOf = new Map<number, HTMLElement>(), kidsOf = new Map<number, number[]>()   // visible children per visible row
  const inFocus = (n: number) => { let m = n; while (m >= 0 && m !== o.focus) m = t.nodes[m].parent; return m === o.focus }
  const add = (n: number, vparent: number) => {
    const leaf = t.isLeaf(n), isOpen = o.open.has(n) && !leaf, cut = !isOpen
    // an open branch that just repeats its parent's name adds nothing: its children attach to the parent directly
    if (isOpen && vparent >= 0 && o.name(n) === o.name(vparent)) { const nd = t.nodes[n]; for (const c of [nd.left, nd.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size)) if (o.hasMembers(c)) add(c, vparent); return }
    if (vparent >= 0) kidsOf.get(vparent)!.push(n)
    kidsOf.set(n, [])
    const row = document.createElement('div')
    row.className = 'trow' + (n === o.focus ? ' on' : '') + (inFocus(n) ? '' : ' out') + (cut ? ' cut' : '')
    row.style.paddingLeft = x(t.nodes[n].height) + 'px'
    row.innerHTML = (leaf ? '<span class="tg none"></span>' : `<span class="tg" title="${isOpen ? 'Merge back' : 'Split in two'}">${isOpen ? '−' : '+'}</span>`)
      + (cut ? `<span class="sw" style="background:${o.colors.get(n) ?? '#999'}"></span>` : '')
      + `<span class="name">${esc(o.name(n))}</span>`
    if (!leaf) row.querySelector<HTMLElement>('.tg')!.onclick = e => { e.stopPropagation(); o.onToggle(n) }
    row.onclick = () => o.onSelect(n)
    row.onmouseenter = () => o.onHover(n); row.onmouseleave = () => o.onHover(null)
    box.appendChild(row); rowOf.set(n, row)
    if (isOpen) { const nd = t.nodes[n]; for (const c of [nd.left, nd.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size)) if (o.hasMembers(c)) add(c, n) }
  }
  const r = t.nodes[t.root]; for (const c of [r.left, r.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size)) if (o.hasMembers(c)) add(c, -1)
  // connector lines after layout: from a parent's toggle down to each child's row
  svg.setAttribute('width', String(box.clientWidth)); svg.setAttribute('height', String(box.scrollHeight))
  const cx = (n: number) => x(t.nodes[n].height) + 13, cy = (n: number) => { const e = rowOf.get(n)!; return e.offsetTop + e.offsetHeight / 2 }
  for (const [n, e] of rowOf) {
    const kids = kidsOf.get(n)!; if (!kids.length) continue
    const px = cx(n), y0 = e.offsetTop + e.offsetHeight - 2, y1 = Math.max(...kids.map(cy))
    svg.appendChild(line(px, y0, px, y1))
    for (const c of kids) svg.appendChild(line(px, cy(c), x(t.nodes[c].height) + 4, cy(c)))
  }
}
