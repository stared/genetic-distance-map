import type { Tree } from './tree'
import type { Pop } from './types'

export interface TreeViewOpts {
  tree: Tree; root: number; cutRoots: Set<number>; colors: Map<number, string>
  byId: Map<number, Pop>; expanded: Set<number>; current?: number; showRoot?: boolean; flat?: boolean; visible?: (id: number) => boolean
  onSelect: (node: number) => void; onToggle: () => void
}
const counts = (mem: Pop[]) => { const c = new Map<string, number>(); mem.forEach(p => { const k = p.region ?? p.first; c.set(k, (c.get(k) ?? 0) + 1) }); return c }
/** name a branch by the groups that are concentrated in it (count × share of the group inside the branch) */
export function nameOf(tree: Tree, node: number, byId: Map<number, Pop>, k = 3): string {
  const mem = tree.members(node).map(id => byId.get(id)!)
  const parent = tree.nodes[node].parent
  const cn = counts(mem), cp = parent >= 0 ? counts(tree.members(parent).map(id => byId.get(id)!)) : cn
  const scored = [...cn.entries()].map(([t, c]) => [t, c * c / (cp.get(t) ?? c)] as [string, number]).sort((a, b) => b[1] - a[1])
  const names = scored.slice(0, k).map(([t]) => t.replace(/_/g, ' '))
  return names.join(', ') + (scored.length > k ? ', …' : '')
}
export function longName(mem: Pop[]): string {
  return [...counts(mem).entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, c]) => `${t.replace(/_/g, ' ')} ${c}`).join(' · ')
}
/** collapsible tree of the cluster hierarchy down to the cut roots */
export function renderTree(el: HTMLElement, o: TreeViewOpts) {
  el.innerHTML = ''
  if (o.flat) {   // plain list of the cut roots, largest first
    const t = o.tree
    for (const node of [...o.cutRoots].sort((a, b) => t.nodes[b].size - t.nodes[a].size)) {
      const mem = t.members(node).filter(id => !o.visible || o.visible(id)).map(id => o.byId.get(id)!)
      if (!mem.length) continue
      const row = document.createElement('div'); row.className = 'tn'
      row.innerHTML = `<span class="sw" style="background:${o.colors.get(node) ?? '#999'}"></span><span class="name" title="${longName(mem)}">${nameOf(t, node, o.byId)}</span><span class="num">${mem.length}</span>`
      row.addEventListener('click', () => o.onSelect(node)); el.appendChild(row)
    }
    return
  }
  const rec = (node: number, parent: HTMLElement, show: boolean) => {
    const t = o.tree, isCut = o.cutRoots.has(node) || t.isLeaf(node)
    const open = o.expanded.has(node)
    let kidsHost = parent
    if (show) {
      const mem = t.members(node).filter(id => !o.visible || o.visible(id)).map(id => o.byId.get(id)!)
      const row = document.createElement('div'); row.className = 'tn' + (o.current === node ? ' on' : '')
      row.innerHTML = `<span class="tw ${open ? 'open' : ''}">${isCut ? '' : '▶'}</span><span class="sw" style="background:${o.colors.get(node) ?? '#999'}"></span><span class="name" title="${longName(mem)}">${nameOf(t, node, o.byId)}</span><span class="num">${mem.length}</span>`
      row.querySelector('.tw')!.addEventListener('click', e => { e.stopPropagation(); if (isCut) return; open ? o.expanded.delete(node) : o.expanded.add(node); o.onToggle() })
      row.addEventListener('click', () => o.onSelect(node))
      parent.appendChild(row)
      if (!isCut && open) { kidsHost = document.createElement('div'); kidsHost.className = 'tk'; parent.appendChild(kidsHost) }
    }
    if (!isCut && (open || !show)) { const n = t.nodes[node]; [n.left, n.right].sort((a, b) => t.nodes[b].size - t.nodes[a].size).forEach(c => rec(c, kidsHost, true)) }
  }
  rec(o.root, el, o.showRoot !== false)
}
