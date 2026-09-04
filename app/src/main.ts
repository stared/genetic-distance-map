import { schemeTableau10 } from 'd3-scale-chromatic'
import { dist, type Pop, type TreeData, type TreeSet } from './types'
import { Tree } from './tree'
import { HeatGrid } from './heat'
import { createMap, loadWorld, setPoints, setSelection, fitTo, repaintHeat } from './mapview'

type Mode = 'sim' | 'clu' | 'drill'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

async function main() {
  const [pops, treesRaw, world] = await Promise.all([
    fetch('./data/pops.json').then(r => r.json()) as Promise<Pop[]>,
    fetch('./data/trees.json').then(r => r.json()) as Promise<Record<TreeSet, TreeData>>,
    loadWorld()])
  const byId = new Map(pops.map(p => [p.id, p]))
  const trees: Record<TreeSet, Tree> = { m: new Tree(treesRaw.m), a: new Tree(treesRaw.a), all: new Tree(treesRaw.all) }
  const heat = new HeatGrid(pops, world.landGeo)
  const map = createMap(world.landGeo, world.borders, heat.canvas)
  ;(window as any).__dbg = { map, pops, heat, trees }

  // ---------- state
  let mode: Mode = 'sim'
  const showM = $<HTMLInputElement>('showM'), showA = $<HTMLInputElement>('showA'), showO = $<HTMLInputElement>('showO')
  const visible = new Uint8Array(pops.length)
  const isVisible = (p: Pop) => (p.kind === 'm' ? showM.checked : showA.checked) && (showO.checked || !(p.o || p.low || p.cont))
  const refreshVisible = () => pops.forEach(p => visible[p.id] = isVisible(p) ? 1 : 0)
  const fmtFlags = (p: Pop) => [p.o ? 'outlier' : '', p.low ? 'low_res' : '', p.cont ? 'contaminated' : ''].filter(Boolean).join(', ')
  const kindName = (p: Pop) => p.kind === 'm' ? 'modern' : 'ancient'

  // ---------- similarity mode
  let query: { name: string; sub: string; c: number[]; pt: [number, number] | null } | null = null
  const d = new Float32Array(pops.length)
  const dmaxEl = $<HTMLInputElement>('dmax')
  function renderSim() {
    refreshVisible()
    if (!query) { heat.clear(); setPoints(map, pops, p => visible[p.id] ? '#999' : null, () => 0.8); repaintHeat(map); $('nearest').innerHTML = ''; return }
    const dmax = +dmaxEl.value
    for (const p of pops) d[p.id] = 100 * dist(query.c, p.c)
    heat.render(d, visible, dmax); repaintHeat(map)
    setPoints(map, pops, p => visible[p.id] ? HeatGrid.colorFor(d[p.id], dmax) : null, () => 1)
    setSelection(map, query.pt ? [query.pt] : [])
    $('query').innerHTML = `<b>${esc(query.name)}</b><div class="sub">${esc(query.sub)}</div>`
    const order = pops.filter(p => visible[p.id]).sort((a, b) => d[a.id] - d[b.id]).slice(0, 40)
    const ol = $('nearest'); ol.innerHTML = ''
    for (const p of order) {
      const li = document.createElement('li'); li.className = 'item'
      li.innerHTML = `<span class="sw ${p.kind}" style="background:${HeatGrid.colorFor(d[p.id], dmax)}"></span><span class="lab" title="${esc(p.label)}\n${esc(p.place ?? '')}">${esc(p.core)}</span><span class="sub">n=${p.n}</span><span class="dist">${d[p.id].toFixed(2)}</span>`
      li.onclick = () => selectPop(p, true)
      ol.appendChild(li)
    }
  }
  function selectPop(p: Pop, fly: boolean) {
    query = { name: p.core, sub: `${kindName(p)}, n=${p.n}${p.profile ? ', ' + p.profile : ''}${fmtFlags(p) ? ', ' + fmtFlags(p) : ''} · ${p.place ?? 'no location'}`, c: p.c, pt: p.dlat != null ? [p.dlon!, p.dlat] : null }
    if (mode !== 'sim') setMode('sim'); else renderSim()
    if (fly && p.dlat != null) map.flyTo({ center: [p.dlon!, p.dlat], zoom: Math.max(map.getZoom(), 3.5), duration: 800 })
  }
  function selectPlace(lng: number, lat: number) {
    refreshVisible()
    const near = pops.filter(p => p.lat != null && visible[p.id]).map(p => ({ p, km: haversine(lat, lng, p.lat!, p.lon!) })).filter(x => x.km < 500).sort((a, b) => a.km - b.km).slice(0, 6)
    if (!near.length) return
    const c = new Array(25).fill(0); let sw = 0
    for (const { p, km } of near) { const w = 1 / ((km + 30) ** 2); sw += w; for (let i = 0; i < 25; i++) c[i] += w * p.c[i] }
    for (let i = 0; i < 25; i++) c[i] /= sw
    query = { name: `Location ${lat.toFixed(1)}°, ${lng.toFixed(1)}°`, sub: 'interpolated from: ' + near.map(x => `${x.p.core} (${Math.round(x.km)} km)`).join(', '), c, pt: [lng, lat] }
    renderSim()
  }

  // ---------- cluster mode
  const treeSet = $<HTMLSelectElement>('treeSet'), kEl = $<HTMLInputElement>('k')
  const kSteps = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 45, 50, 55, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300, 400, 500, 600, 800, 1000]
  kEl.max = String(kSteps.length - 1); kEl.value = '6'
  let clusterCache: { roots: number[]; assign: Map<number, number>; colors: string[] } | null = null
  function renderClusters() {
    refreshVisible(); heat.clear(); repaintHeat(map); setSelection(map, [])
    const tree = trees[treeSet.value as TreeSet]; const k = kSteps[+kEl.value]; $('kVal').textContent = String(k)
    const roots = tree.split(tree.root, k); const assign = tree.assign(roots); const colors = tree.hierarchicalColors(roots)
    clusterCache = { roots, assign, colors }
    setPoints(map, pops, p => { const c = assign.get(p.id); return c === undefined || !visible[p.id] ? null : colors[c] }, () => 0.9)
    const ul = $('legend'); ul.innerHTML = ''
    roots.forEach((r, ci) => {
      const mem = tree.members(r).map(id => byId.get(id)!)
      const li = document.createElement('li'); li.className = 'item'
      li.innerHTML = `<span class="sw" style="background:${colors[ci]}"></span><span class="lab" title="${esc(topTokens(mem, 8))}">${esc(topTokens(mem, 3))}</span><span class="dist">${mem.length}</span>`
      li.onclick = () => fitTo(map, mem)
      ul.appendChild(li)
    })
  }

  // ---------- drill-down mode
  const treeSet2 = $<HTMLSelectElement>('treeSet2'), splitM = $<HTMLSelectElement>('splitM')
  let path: number[] = []
  let drillCache: { children: number[]; assign: Map<number, number> } | null = null
  function renderDrill(zoom: boolean) {
    refreshVisible(); heat.clear(); repaintHeat(map); setSelection(map, [])
    const tree = trees[treeSet2.value as TreeSet]
    if (!path.length || path[0] !== tree.root) path = [tree.root]
    const node = path[path.length - 1]
    const children = tree.split(node, +splitM.value); const assign = tree.assign(children)
    drillCache = { children, assign }
    const inScope = tree.assign([node])
    setPoints(map, pops, p => { if (!visible[p.id]) return null; const c = assign.get(p.id); if (c !== undefined) return schemeTableau10[c % 10]; return inScope.has(p.id) ? '#999' : '#ddd' }, p => assign.has(p.id) ? 0.95 : 0.35)
    const crumbs = $('crumbs'); crumbs.innerHTML = ''
    path.forEach((n, i) => { const s = document.createElement('span'); s.textContent = i === 0 ? 'root' : topTokens(tree.members(n).map(id => byId.get(id)!), 2); s.onclick = () => { path = path.slice(0, i + 1); renderDrill(true) }; crumbs.appendChild(s) })
    const ul = $('children'); ul.innerHTML = ''
    children.forEach((c, ci) => {
      const mem = tree.members(c).map(id => byId.get(id)!)
      const li = document.createElement('li'); li.className = 'item'
      li.innerHTML = `<span class="sw" style="background:${schemeTableau10[ci % 10]}"></span><span class="lab" title="${esc(topTokens(mem, 10))}">${esc(topTokens(mem, 4))}</span><span class="dist">${mem.length}</span>`
      li.onclick = () => descend(c)
      ul.appendChild(li)
    })
    if (zoom) fitTo(map, tree.members(node).map(id => byId.get(id)!))
  }
  function descend(node: number) { const tree = trees[treeSet2.value as TreeSet]; if (tree.nodes[node].pop >= 0) return; path.push(node); renderDrill(true) }

  // ---------- shared
  function topTokens(mem: Pop[], k: number): string {
    const cnt = new Map<string, number>(); mem.forEach(p => cnt.set(p.first, (cnt.get(p.first) ?? 0) + 1))
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([t, c]) => c > 1 ? `${t} ×${c}` : t)
    return top.join(', ') + (cnt.size > k ? ` +${cnt.size - k}` : '')
  }
  function render() { if (mode === 'sim') renderSim(); else if (mode === 'clu') renderClusters(); else renderDrill(false) }
  function setMode(m: Mode) {
    mode = m
    document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m))
    document.querySelectorAll<HTMLElement>('.mode').forEach(s => s.hidden = s.id !== 'mode-' + m)
    render()
  }
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode as Mode))
  ;[showM, showA, showO].forEach(el => el.onchange = render)
  dmaxEl.oninput = () => { $('dmaxVal').textContent = dmaxEl.value; if (mode === 'sim') renderSim() }
  treeSet.onchange = renderClusters; kEl.oninput = renderClusters
  treeSet2.onchange = () => { path = []; renderDrill(true) }; splitM.onchange = () => renderDrill(false)
  $('up').onclick = () => { if (path.length > 1) { path.pop(); renderDrill(true) } }

  // search
  const search = $<HTMLInputElement>('search'), suggest = $<HTMLUListElement>('suggest')
  search.oninput = () => {
    const q = search.value.trim().toLowerCase(); suggest.innerHTML = ''
    if (q.length < 2) { suggest.hidden = true; return }
    const hits = pops.filter(p => p.label.toLowerCase().includes(q)).sort((a, b) => (a.label.toLowerCase().indexOf(q) - b.label.toLowerCase().indexOf(q)) || b.n - a.n).slice(0, 40)
    for (const p of hits) { const li = document.createElement('li'); li.innerHTML = `<span class="sw ${p.kind}" style="background:${p.kind === 'm' ? '#2a6fdb' : '#c77'}"></span> ${esc(p.core)} <span class="sub">n=${p.n} · ${esc(p.place ?? '')}</span>`; li.onmousedown = () => { search.value = p.core; suggest.hidden = true; selectPop(p, true) }; suggest.appendChild(li) }
    suggest.hidden = hits.length === 0
  }
  search.onblur = () => setTimeout(() => suggest.hidden = true, 150)

  // map interactions
  const tip = $('tooltip')
  map.on('mousemove', e => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['pops-m', 'pops-a'] })[0]
    map.getCanvas().style.cursor = f ? 'pointer' : 'crosshair'
    if (!f) { tip.hidden = true; return }
    const p = byId.get(f.properties.id as number)!
    let extra = ''
    if (mode === 'sim' && query) extra = ` · dist ${d[p.id].toFixed(2)}`
    if (mode === 'clu' && clusterCache) { const c = clusterCache.assign.get(p.id); if (c !== undefined) extra = ' · cluster: ' + topTokens(trees[treeSet.value as TreeSet].members(clusterCache.roots[c]).map(id => byId.get(id)!), 3) }
    tip.innerHTML = `<b>${esc(p.core)}</b><br><span class="sub">${kindName(p)}, n=${p.n}${p.profile ? ', ' + esc(p.profile) : ''}${fmtFlags(p) ? ', ' + fmtFlags(p) : ''}<br>${esc(p.place ?? '')} (${p.prec ?? ''})${extra}</span>`
    tip.hidden = false; tip.style.left = e.point.x + 14 + 'px'; tip.style.top = e.point.y + 14 + 'px'
  })
  map.on('click', e => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['pops-m', 'pops-a'] })[0]
    if (mode === 'drill') {
      if (!f || !drillCache) return
      const c = drillCache.assign.get(f.properties.id as number); if (c !== undefined) descend(drillCache.children[c]); return
    }
    if (f) selectPop(byId.get(f.properties.id as number)!, false)
    else if (mode === 'sim') selectPlace(e.lngLat.lng, e.lngLat.lat)
  })
  // URL hash: #sim/<core> | #clu/<set>/<k> | #drill/<set>/<m>
  map.on('load', () => {
    refreshVisible()
    const h = decodeURIComponent(location.hash.slice(1)).split('/')
    if (h[0] === 'clu') { treeSet.value = h[1] || 'm'; const ki = kSteps.indexOf(+h[2]); if (ki >= 0) kEl.value = String(ki); setMode('clu') }
    else if (h[0] === 'drill') { treeSet2.value = h[1] || 'm'; if (h[2]) splitM.value = h[2]; setMode('drill'); renderDrill(true) }
    else if (h[0] === 'sim' && h[1]) { const p = pops.find(p => p.core === h[1]); if (p) { selectPop(p, true); return } render() }
    else render()
  })
}
function haversine(a: number, b: number, c: number, dd: number) {
  const r = Math.PI / 180; const h = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((dd - b) * r / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
function esc(s: string) { return s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!)) }
main().catch(e => { console.error(e); document.body.insertAdjacentHTML('afterbegin', `<pre style="color:red">${String(e)}</pre>`) })
