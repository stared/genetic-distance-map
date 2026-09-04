import type { Tree } from './tree'
import type { Pop } from './types'

export interface TreeViewOpts {
  tree: Tree; open: Set<number>; colors: Map<number, string>; byId: Map<number, Pop>
  visible: (id: number) => boolean; name: (node: number) => string
  onRow: (node: number) => void; onToggle: (node: number) => void
}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
/** "Region 12, Region 8, …" summary of a branch for the hover title */
export function longName(mem: Pop[]): string {
  const c = new Map<string, number>(); mem.forEach(p => { const k = p.region ?? p.first; c.set(k, (c.get(k) ?? 0) + 1) })
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t.replace(/_/g, ' ')} ${n}`).join(', ')
}
/** the cluster tree as nested rows: every child of an open node is a row; open rows show their children beneath */
export function renderTree(el: HTMLElement, o: TreeViewOpts) {
  el.innerHTML = ''
  const t = o.tree
  const rec = (node: number, host: HTMLElement) => {
    const n = t.nodes[node]
    for (const c of [n.left, n.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size)) {
      const mem = t.members(c).filter(id => o.visible(id)).map(id => o.byId.get(id)!)
      if (!mem.length) continue
      const leaf = t.isLeaf(c), isOpen = o.open.has(c) && !leaf
      const row = document.createElement('div'); row.className = 'tn' + (isOpen ? ' branch' : '')
      row.innerHTML = `<span class="tw ${isOpen ? 'open' : ''}">${leaf ? '' : '▶'}</span>${isOpen ? '' : `<span class="sw" style="background:${o.colors.get(c) ?? '#999'}"></span>`}<span class="name" title="${esc(longName(mem))}">${esc(o.name(c))}</span><span class="num">${mem.length}</span>`
      row.querySelector('.tw')!.addEventListener('click', e => { e.stopPropagation(); if (!leaf) o.onToggle(c) })
      row.addEventListener('click', () => o.onRow(c))
      host.appendChild(row)
      if (isOpen) { const kids = document.createElement('div'); kids.className = 'tk'; host.appendChild(kids); rec(c, kids) }
    }
  }
  rec(t.root, el)
}
