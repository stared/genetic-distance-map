import { rgb } from 'd3-color'
import { dist, type Pop, type TreeData, type TreeSet } from './types'
import { Tree } from './tree'
import { HeatGrid, ramp } from './heat'
import { loadWorld } from './world'
import { FlatMap, type PointStyle } from './flatmap'
import { renderTree, nameOf } from './treeview'

type Mode = 'sim' | 'clu' | 'drill'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const disp = (s: string) => s.replace(/_/g, ' ')
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const DEFAULT_QUERY = 'Polish'

async function main() {
  const [pops, treesRaw, world] = await Promise.all([
    fetch('./data/pops.json').then(r => r.json()) as Promise<Pop[]>,
    fetch('./data/trees.json').then(r => r.json()) as Promise<Record<TreeSet, TreeData>>,
    loadWorld()])
  for (const p of pops) { const parts = (p.place ?? '').split(',').map(x => x.replace(/\(.*?\)/g, '').trim()).filter(Boolean); p.region = parts.length ? parts[parts.length - 1] : p.first }
  const byId = new Map(pops.map(p => [p.id, p]))
  const trees: Record<TreeSet, Tree> = { m: new Tree(treesRaw.m), a: new Tree(treesRaw.a), all: new Tree(treesRaw.all) }
  const heat = new HeatGrid(pops, world.landGeo)
  const map = new FlatMap($('map'), pops, world.landGeo, world.borders, heat)
  ;(window as any).__dbg = { map, pops, heat, trees, world }
  const R_M = 3.2, R_A = 2.6
  const setPoints = (color: (p: Pop) => string | null, alpha: (p: Pop) => number) => {
    map.state.styles = pops.map(p => { const c = color(p); return c ? { color: c, alpha: alpha(p), r: p.kind === 'm' ? R_M : R_A } as PointStyle : null }); map.request() }
  const fitTo = (mem: Pop[]) => map.fitTo(mem.filter(p => p.lat != null).map(p => [p.lon!, p.lat!]))

  // ---------- shared state
  let mode: Mode = 'sim'
  const chips = { m: $<HTMLButtonElement>('showM'), a: $<HTMLButtonElement>('showA'), o: $<HTMLButtonElement>('showO') }
  const on = (b: HTMLButtonElement) => b.classList.contains('on')
  const visible = new Uint8Array(pops.length)
  const isVisible = (p: Pop) => (p.kind === 'm' ? on(chips.m) : on(chips.a)) && (on(chips.o) || !(p.o || p.low || p.cont))
  const refreshVisible = () => pops.forEach(p => visible[p.id] = isVisible(p) ? 1 : 0)
  const flags = (p: Pop) => [p.o ? 'outlier' : '', p.low ? 'low-res' : '', p.cont ? 'contaminated' : ''].filter(Boolean).join(', ')
  const kindName = (p: Pop) => p.kind === 'm' ? 'modern' : 'ancient'
  const subOf = (p: Pop) => { const s = disp(p.core.startsWith(p.first + '_') ? p.core.slice(p.first.length + 1) : p.core === p.first ? '' : p.core); return p.profile ? `${s}${s ? ' ' : ''}(${p.profile.replace(/ Profile$/, '')})` : s }
  const describe = (p: Pop) => `${kindName(p)} · n ${p.n}${p.profile ? ' · ' + esc(p.profile) : ''}${flags(p) ? ' · ' + flags(p) : ''}<br>${esc(p.place ?? 'no location')}`

  // ---------- similarity
  let query: { name: string; sub: string; c: number[] } | null = null
  const d = new Float32Array(pops.length)
  const dmaxEl = $<HTMLInputElement>('dmax')
  $('ramp').style.background = `linear-gradient(to right, ${[0, .1, .2, .35, .5, .7, 1].map(t => ramp(Math.sqrt(t))).join(',')})`
  function renderSim() {
    refreshVisible()
    if (!query) { heat.clear(); map.setRaster(0); setPoints(p => visible[p.id] ? '#a1a1aa' : null, () => 1); $('nearest').innerHTML = ''; $('query').innerHTML = ''; return }
    const dmax = Math.max(1, +dmaxEl.value || 20)
    for (const p of pops) d[p.id] = 100 * dist(query.c, p.c)
    heat.renderHeat(d, visible, dmax); map.setRaster(0.7)
    setPoints(p => visible[p.id] ? HeatGrid.colorFor(d[p.id], dmax) : null, () => 1)
    $('query').innerHTML = `<div class="name">${esc(query.name)}</div><div class="sub">${query.sub}</div>`
    const top = pops.filter(p => visible[p.id]).sort((a, b) => d[a.id] - d[b.id]).slice(0, 80)
    const groups = new Map<string, Pop[]>(); top.forEach(p => { const g = groups.get(p.first); g ? g.push(p) : groups.set(p.first, [p]) })
    const list = $('nearest'); list.innerHTML = ''
    for (const [first, mem] of groups) {
      const best = mem[0]
      const g = document.createElement('div'); g.className = 'grp'
      const all = mem.filter(p => subOf(p)), shown = all.slice(0, 8)
      const subs = shown.map(p => `<span data-id="${p.id}" title="${esc(p.label)}">${esc(subOf(p))} <i>${d[p.id].toFixed(2)}</i></span>`).join(' · ') + (all.length > shown.length ? ` · <span class="n">+${all.length - shown.length} more</span>` : '')
      g.innerHTML = `<div class="head"><span class="sw ${best.kind}" style="background:${HeatGrid.colorFor(d[best.id], dmax)}"></span><span class="name">${esc(disp(first))}</span><span class="num">${d[best.id].toFixed(2)}</span></div>` + (subs ? `<div class="subs">${subs}</div>` : '')
      g.addEventListener('click', e => { const t = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null; selectPop(byId.get(t ? +t.dataset.id! : best.id)!, true) })
      list.appendChild(g)
    }
  }
  function selectPop(p: Pop, fly: boolean) {
    query = { name: disp(p.core), sub: describe(p), c: p.c }
    if (mode !== 'sim') setMode('sim'); else renderSim()
    if (fly && p.dlat != null) map.flyTo(p.dlon!, p.dlat, Math.max(map.k, 700))
  }
  // ---------- categorical colouring shared by clusters / drill-down
  const nearestCache = new Map<string, Int32Array>()
  function nearestFor(set: TreeSet) {
    let g = nearestCache.get(set)
    if (!g) { const inSet = (p: Pop) => set === 'all' || p.kind === set; g = heat.nearestGrid(li => heat.locPops[li].some(id => inSet(byId.get(id)!))); nearestCache.set(set, g) }
    return g
  }
  function paintCategories(set: TreeSet, assign: Map<number, number>, colors: string[], inScope: (p: Pop) => boolean) {
    const locCat = new Int32Array(heat.locPops.length).fill(-1)
    heat.locPops.forEach((ids, li) => { const cnt = new Map<number, number>(); for (const id of ids) { if (!visible[id]) continue; const c = assign.get(id); if (c !== undefined) cnt.set(c, (cnt.get(c) ?? 0) + 1) } let best = -1, bc = 0; cnt.forEach((v, k) => { if (v > bc) { bc = v; best = k } }); locCat[li] = best })
    const pal = new Uint8ClampedArray(colors.length * 3); colors.forEach((c, i) => { const r = rgb(c); pal[i * 3] = r.r; pal[i * 3 + 1] = r.g; pal[i * 3 + 2] = r.b })
    heat.renderCategories(locCat, pal, nearestFor(set)); map.setRaster(0.75)
    setPoints(p => { if (!visible[p.id]) return null; const c = assign.get(p.id); return c !== undefined ? colors[c] : inScope(p) ? '#71717a' : null }, p => assign.has(p.id) ? 1 : 0.5)
  }

  // ---------- clusters
  const treeSet = $<HTMLSelectElement>('treeSet'), kEl = $<HTMLInputElement>('k')
  const kSteps = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 45, 50, 55, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300, 400, 500, 600, 800, 1000]
  kEl.max = String(kSteps.length - 1); kEl.value = '6'
  const expanded = new Set<number>()
  let clu: { tree: Tree; roots: number[]; assign: Map<number, number>; colors: Map<number, string> } | null = null
  function renderClusters() {
    refreshVisible()
    const tree = trees[treeSet.value as TreeSet]; const k = kSteps[+kEl.value]; $('kVal').textContent = String(k)
    const roots = tree.split(tree.root, k), assign = tree.assign(roots), colors = tree.colorMap(roots)
    if (!clu || clu.tree !== tree) { expanded.clear(); expanded.add(tree.root); const r = tree.nodes[tree.root]; expanded.add(r.left); expanded.add(r.right) }
    clu = { tree, roots, assign, colors }
    paintCategories(treeSet.value as TreeSet, assign, roots.map(r => colors.get(r)!), () => false)
    const opts: Parameters<typeof renderTree>[1] = { tree, root: tree.root, cutRoots: new Set(roots), colors, byId, expanded, showRoot: false, visible: id => !!visible[id], onSelect: n => fitTo(tree.members(n).filter(id => visible[id]).map(id => byId.get(id)!)), onToggle: () => renderTree($('clutree'), opts) }
    renderTree($('clutree'), opts)
  }

  // ---------- drill-down
  const treeSet2 = $<HTMLSelectElement>('treeSet2'), splitM = $<HTMLSelectElement>('splitM')
  let path: number[] = []
  let drill: { tree: Tree; children: number[]; assign: Map<number, number> } | null = null
  function renderDrill(zoom: boolean) {
    refreshVisible()
    const tree = trees[treeSet2.value as TreeSet]
    if (!path.length || path[0] !== tree.root) path = [tree.root]
    const node = path[path.length - 1]
    const children = tree.split(node, +splitM.value), assign = tree.assign(children), colors = tree.colorMap(children, node)
    drill = { tree, children, assign }
    const scope = tree.assign([node])
    paintCategories(treeSet2.value as TreeSet, assign, children.map(c => colors.get(c)!), p => scope.has(p.id))
    const crumbs = $('crumbs'); crumbs.innerHTML = ''
    path.forEach((n, i) => { const s = document.createElement('span'); s.textContent = i === 0 ? 'All' : nameOf(tree, n, byId, 2); s.onclick = () => { path = path.slice(0, i + 1); renderDrill(true) }; crumbs.appendChild(s) })
    renderTree($('children'), { tree, root: node, cutRoots: new Set(children), colors, byId, expanded: new Set([node]), showRoot: false, flat: true, visible: id => !!visible[id], onSelect: n => descend(n), onToggle: () => {} })
    if (zoom) fitTo(tree.members(node).map(id => byId.get(id)!))
  }
  function descend(node: number) { if (!drill || drill.tree.isLeaf(node)) return; path.push(node); renderDrill(true) }

  // ---------- modes & controls
  function render() { if (mode === 'sim') renderSim(); else if (mode === 'clu') renderClusters(); else renderDrill(false) }
  function setMode(m: Mode) {
    mode = m
    document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m))
    document.querySelectorAll<HTMLElement>('.mode').forEach(s => s.hidden = s.id !== 'mode-' + m)
    render()
  }
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode as Mode))
  Object.values(chips).forEach(b => b.onclick = () => { b.classList.toggle('on'); b.setAttribute('aria-pressed', String(on(b))); render() })
  dmaxEl.onchange = dmaxEl.oninput = () => { if (mode === 'sim') renderSim() }
  treeSet.onchange = renderClusters; kEl.oninput = renderClusters
  treeSet2.onchange = () => { path = []; renderDrill(true) }; splitM.onchange = () => renderDrill(false)
  $('up').onclick = () => { if (path.length > 1) { path.pop(); renderDrill(true) } }

  // search
  const search = $<HTMLInputElement>('search'), suggest = $<HTMLUListElement>('suggest')
  search.oninput = () => {
    const q = search.value.trim().toLowerCase().replace(/ /g, '_'); suggest.innerHTML = ''
    if (q.length < 2) { suggest.hidden = true; return }
    const hits = pops.filter(p => p.label.toLowerCase().includes(q)).sort((a, b) => (a.label.toLowerCase().indexOf(q) - b.label.toLowerCase().indexOf(q)) || b.n - a.n).slice(0, 40)
    for (const p of hits) { const li = document.createElement('li'); li.innerHTML = `<span class="sw ${p.kind}" style="background:${p.kind === 'm' ? '#f4f4f5' : '#a1a1aa'}"></span><span>${esc(disp(p.core))}</span><span class="sub">n ${p.n}</span>`; li.onmousedown = () => { search.value = ''; suggest.hidden = true; selectPop(p, true) }; suggest.appendChild(li) }
    suggest.hidden = hits.length === 0
  }
  search.onblur = () => setTimeout(() => suggest.hidden = true, 150)

  // map interactions
  const tip = $('tooltip')
  map.onHover = (p, x, y) => {
    if (!p) { tip.hidden = true; return }
    let extra = ''
    if (mode === 'sim' && query) extra = `<br>distance ${d[p.id].toFixed(2)}`
    const cl = mode === 'clu' ? clu : mode === 'drill' ? drill : null
    if (cl) { const c = cl.assign.get(p.id); const roots = mode === 'clu' ? clu!.roots : drill!.children; if (c !== undefined) extra = '<br>branch: ' + esc(nameOf(cl.tree, roots[c], byId)) }
    tip.innerHTML = `<b>${esc(disp(p.core))}</b><br><span class="sub">${describe(p)}${extra}</span>`
    tip.hidden = false; tip.style.left = x + 14 + 'px'; tip.style.top = y + 14 + 'px'
  }
  map.onClick = (lng, lat, p) => {
    if (mode === 'drill') {
      if (!drill) return
      let c = p ? drill.assign.get(p.id) : undefined
      if (c === undefined) {
        const near = pops.filter(q => q.lat != null && visible[q.id] && drill!.assign.has(q.id)).map(q => ({ q, km: haversine(lat, lng, q.lat!, q.lon!) })).sort((a, b) => a.km - b.km)[0]
        if (near && near.km < 800) c = drill.assign.get(near.q.id)
      }
      if (c !== undefined) descend(drill.children[c]); return
    }
    if (p) selectPop(p, false)
  }
  // initial state from the URL hash, else the default query
  refreshVisible()
  const h = decodeURIComponent(location.hash.slice(1)).split('/')
  if (h[0] === 'clu') { treeSet.value = h[1] || 'm'; const ki = kSteps.indexOf(+h[2]); if (ki >= 0) kEl.value = String(ki); setMode('clu') }
  else if (h[0] === 'drill') { treeSet2.value = h[1] || 'm'; if (h[2]) splitM.value = h[2]; setMode('drill'); renderDrill(true) }
  else { const p = pops.find(p => p.core === (h[0] === 'sim' && h[1] ? h[1] : DEFAULT_QUERY)) ?? pops[0]; selectPop(p, false); map.flyTo(p.lon ?? 20, p.lat ?? 50, 450, 0) }
}
function haversine(a: number, b: number, c: number, dd: number) {
  const r = Math.PI / 180; const h = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((dd - b) * r / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
main().catch(e => { console.error(e); document.body.insertAdjacentHTML('afterbegin', `<pre style="color:red">${String(e)}</pre>`) })
