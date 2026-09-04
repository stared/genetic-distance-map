import type { Tree } from './tree'
import type { Pop } from './types'

export interface TreeViewOpts {
  tree: Tree; root: number; cutRoots: Set<number>; colors: Map<number, string>
  byId: Map<number, Pop>; expanded: Set<number>; current?: number
  onSelect: (node: number) => void; onToggle: () => void
}
export function nameOf(mem: Pop[], k = 3): string {
  const cnt = new Map<string, number>(); mem.forEach(p => cnt.set(p.first, (cnt.get(p.first) ?? 0) + 1))
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])
  const names = top.slice(0, k).map(([t]) => t.replace(/_/g, ' ')).join(', ')
  return top.length > k ? `${names}…` : names
}
export function longName(mem: Pop[]): string {
  const cnt = new Map<string, number>(); mem.forEach(p => cnt.set(p.first, (cnt.get(p.first) ?? 0) + 1))
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, c]) => `${t.replace(/_/g, ' ')} ${c}`).join(' · ')
}
/** collapsible tree of the cluster hierarchy down to the cut roots */
export function renderTree(el: HTMLElement, o: TreeViewOpts) {
  el.innerHTML = ''
  const rec = (node: number, depth: number, parent: HTMLElement) => {
    const t = o.tree, isCut = o.cutRoots.has(node) || t.isLeaf(node)
    const mem = t.members(node).map(id => o.byId.get(id)!)
    const row = document.createElement('div'); row.className = 'tn' + (isCut ? ' leafc' : '') + (o.current === node ? ' on' : '')
    const open = o.expanded.has(node)
    row.innerHTML = `<span class="tw ${open ? 'open' : ''}">${isCut ? '' : '▶'}</span><span class="sw" style="background:${o.colors.get(node) ?? '#999'}"></span><span class="name" title="${longName(mem)}">${nameOf(mem)}</span><span class="num">${mem.length}</span>`
    row.querySelector('.tw')!.addEventListener('click', e => { e.stopPropagation(); if (isCut) return; open ? o.expanded.delete(node) : o.expanded.add(node); o.onToggle() })
    row.addEventListener('click', () => o.onSelect(node))
    parent.appendChild(row)
    if (!isCut && open) { const kids = document.createElement('div'); kids.className = 'tk'; parent.appendChild(kids); const n = t.nodes[node]; [n.left, n.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size).forEach(c => rec(c, depth + 1, kids)) }
  }
  rec(o.root, 0, el)
}
