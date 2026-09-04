import { hcl } from 'd3-color'
import type { TreeData } from './types'

export interface Node { id: number; left: number; right: number; height: number; size: number; parent: number; pop: number }

/** Hierarchical cluster tree built from a scipy linkage matrix. */
export class Tree {
  nodes: Node[] = []
  root: number
  L: number
  attach: Map<number, number>          // any pop id (in this set) -> clean leaf pop id
  leafOfPop = new Map<number, number>()
  private memberCache = new Map<number, number[]>()

  constructor(t: TreeData) {
    this.L = t.leaves.length
    t.leaves.forEach((pop, i) => { this.nodes.push({ id: i, left: -1, right: -1, height: 0, size: 1, parent: -1, pop }); this.leafOfPop.set(pop, i) })
    t.merges.forEach(([a, b, h, c], i) => {
      const id = this.L + i
      this.nodes.push({ id, left: a, right: b, height: h, size: c, parent: -1, pop: -1 })
      this.nodes[a].parent = id; this.nodes[b].parent = id
    })
    this.root = this.nodes.length - 1
    this.attach = new Map(Object.entries(t.attach).map(([k, v]) => [Number(k), v]))
  }
  isLeaf(node: number) { return this.nodes[node].pop >= 0 }
  members(node: number): number[] {
    const hit = this.memberCache.get(node); if (hit) return hit
    const out: number[] = []; const stack = [node]
    while (stack.length) { const n = this.nodes[stack.pop()!]; if (n.pop >= 0) out.push(n.pop); else stack.push(n.left, n.right) }
    this.memberCache.set(node, out); return out
  }
  /** split the subtree at `node` into `k` clusters by repeatedly opening the highest merge */
  split(node: number, k: number): number[] {
    const open = [node]
    while (open.length < k) {
      let bi = -1, bh = -1
      open.forEach((n, i) => { const nd = this.nodes[n]; if (nd.pop < 0 && nd.height > bh) { bh = nd.height; bi = i } })
      if (bi < 0) break
      const nd = this.nodes[open[bi]]; open.splice(bi, 1, nd.left, nd.right)
    }
    return open.sort((a, b) => this.nodes[b].size - this.nodes[a].size)
  }
  /** map every pop id (clean or attached) to its cluster index given cluster root nodes */
  assign(roots: number[]): Map<number, number> {
    const leafCluster = new Map<number, number>()
    roots.forEach((r, ci) => this.members(r).forEach(p => leafCluster.set(p, ci)))
    const out = new Map<number, number>()
    this.attach.forEach((leaf, pop) => { const c = leafCluster.get(leaf); if (c !== undefined) out.set(pop, c) })
    return out
  }
  /** hierarchical hues for the cluster roots and all their ancestors: hue circle divided proportionally to subtree size */
  colorMap(roots: number[], top = this.root): Map<number, string> {
    const isRoot = new Set(roots), out = new Map<number, string>()
    const rec = (node: number, a: number, b: number, depth: number) => {
      out.set(node, hcl((a + b) / 2, 62, 62).formatHex())
      if (isRoot.has(node)) return
      const n = this.nodes[node]; if (n.pop >= 0) return
      const gap = (b - a) * 0.06, fl = this.nodes[n.left].size / n.size, mid = a + (b - a - gap) * fl
      rec(n.left, a, mid, depth + 1); rec(n.right, mid + gap, b, depth + 1)
    }
    rec(top, 0, 360, 0)
    return out
  }
  ancestors(node: number): number[] { const out = []; let n = node; while (n >= 0) { out.push(n); n = this.nodes[n].parent } return out.reverse() }
}
