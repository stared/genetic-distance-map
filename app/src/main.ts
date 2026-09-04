import { rgb } from 'd3-color'
import { dist, type Pop, type TreeData } from './types'
import { Tree } from './tree'
import { HeatGrid, ramp } from './heat'
import { loadWorld } from './world'
import { FlatMap, type PointStyle } from './flatmap'
import { renderTree } from './treeview'
import { regionOf } from './regions'

type Mode = 'sim' | 'clu'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const disp = (s: string) => s.replace(/_/g, ' ')
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const DEFAULT_QUERY = 'Polish'

async function main() {
  const [pops, treesRaw, world] = await Promise.all([
    fetch('./data/pops.json').then(r => r.json()) as Promise<Pop[]>,
    fetch('./data/trees.json').then(r => r.json()) as Promise<Record<'m' | 'a' | 'all', TreeData>>,
    loadWorld()])
  const ERA: Record<string, string> = { pre: 'Prehistoric', anc: 'Ancient', med: 'Medieval', mod: 'Early modern' }
  const searchText = new Map(pops.map(p => [p.id, (p.label + (p.kind === 'a' ? '_' + ERA[p.era] : '_present-day')).toLowerCase().replace(/ /g, '_')]))
  for (const p of pops) p.region = regionOf(p.lat, p.lon)
  const byId = new Map(pops.map(p => [p.id, p]))
  const tree = new Tree(treesRaw.m)   // the map always shows present-day populations; ancient samples are queries only
  const heat = new HeatGrid(pops, world.landGeo)
  const map = new FlatMap($('map'), pops, world.landGeo, world.borders, heat)
  ;(window as any).__dbg = { map, pops, heat, tree, world }
  const R_M = 3.2, R_A = 2.6
  const setPoints = (color: (p: Pop) => string | null, alpha: (p: Pop) => number) => {
    map.state.styles = pops.map(p => { const c = color(p); return c ? { color: c, alpha: alpha(p), r: p.kind === 'm' ? R_M : R_A } as PointStyle : null }); map.request() }
  const fitTo = (mem: Pop[]) => map.fitTo(mem.filter(p => p.lat != null).map(p => [p.lon!, p.lat!]))

  // ---------- shared state
  let mode: Mode = 'sim'
  const visible = new Uint8Array(pops.length)
  const isVisible = (p: Pop) => p.kind === 'm' && !(p.o || p.low || p.cont)
  pops.forEach(p => visible[p.id] = isVisible(p) ? 1 : 0)
  const flags = (p: Pop) => [p.o ? 'outlier' : '', p.low ? 'low-res' : '', p.cont ? 'contaminated' : ''].filter(Boolean).join(', ')
  const subOf = (p: Pop) => { const s = disp(p.core.startsWith(p.first + '_') ? p.core.slice(p.first.length + 1) : p.core === p.first ? '' : p.core); return p.profile ? `${s}${s ? ' ' : ''}(${p.profile.replace(/ Profile$/, '')})` : s }
  const tags = (p: Pop) => [`n=${p.n}`, p.kind === 'a' ? ERA[p.era].toLowerCase() : '', p.profile ? esc(p.profile.replace(/ Profile$/, ' profile')) : '', flags(p)].filter(Boolean)
  const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22z"/><circle cx="12" cy="9.5" r="2.5"/></svg>'
  const meta = (p: Pop) => `<span class="loc">${PIN}${esc(p.place ?? 'no location')}</span>` + tags(p).map(t => `<span>${t}</span>`).join('')

  // ---------- similarity
  let query: { name: string; core: string; meta: string; c: number[] } | null = null
  const d = new Float32Array(pops.length), raw = new Float32Array(pops.length)
  let d0 = 0                                   // colour scale runs from d0 (nearest shown population) to dmax
  const dminEl = $('dmin'), dmaxV = $('dmaxv'), legend = $('legend')
  let rangeQ = 0.25                            // upper end of the colour scale: this quantile of distances to the query
  $('ramp').style.background = `linear-gradient(to right, ${[0, .1, .2, .35, .5, .7, 1].map(t => ramp(Math.sqrt(t))).join(',')})`
  function renderSim() {
    if (!query) { heat.clear(); map.setRaster(0); setPoints(p => visible[p.id] ? '#a1a1aa' : null, () => 1); $('nearest').innerHTML = ''; $('query').innerHTML = ''; legend.hidden = true; return }
    for (const p of pops) raw[p.id] = 100 * dist(query.c, p.c)
    const sorted = pops.filter(p => visible[p.id]).sort((a, b) => raw[a.id] - raw[b.id])
    d0 = raw[sorted[0].id]                    // the nearest shown population is always the red end
    const dmax = Math.max(d0 + 3, Math.round(raw[sorted[Math.floor(rangeQ * (sorted.length - 1))].id])), span = dmax - d0
    dminEl.textContent = Number.isInteger(d0) ? String(d0) : d0.toFixed(1); dmaxV.textContent = String(dmax); $('lname').textContent = query.name; legend.hidden = false
    for (const p of pops) d[p.id] = Math.max(0, raw[p.id] - d0)
    heat.renderHeat(field, d, visible, span); map.setRaster(0.7)
    setPoints(p => visible[p.id] ? HeatGrid.colorFor(d[p.id], span) : null, () => 1)
    $('query').innerHTML = `<div class="name">${esc(query.name)}</div><div class="meta">${query.meta}</div>`
    const top = sorted.slice(0, 80)
    const groups = new Map<string, Pop[]>(); top.forEach(p => { const g = groups.get(p.first); g ? g.push(p) : groups.set(p.first, [p]) })
    const list = $('nearest'); list.innerHTML = ''
    for (const [first, mem] of groups) {
      const best = mem[0]
      const g = document.createElement('div'); g.className = 'grp'
      const all = mem.filter(p => subOf(p)), cap = all.length > 8 ? 6 : all.length   // long groups fold after 6; "+N more" unfolds in place
      const subs = all.map((p, i) => `<span data-id="${p.id}" title="${esc(p.label)}"${i >= cap ? ' hidden' : ''}>${esc(subOf(p))} <i>${raw[p.id].toFixed(2)}</i></span>`).join('') + (cap < all.length ? `<button class="more">+${all.length - cap} more</button>` : '')
      g.innerHTML = `<div class="head"><span class="sw ${best.kind}" style="background:${HeatGrid.colorFor(d[best.id], span)}"></span><span class="name">${esc(disp(first))}</span><span class="num">${raw[best.id].toFixed(2)}</span></div>` + (subs ? `<div class="subs">${subs}</div>` : '')
      g.addEventListener('click', e => {
        const el = e.target as HTMLElement
        if (el.classList.contains('more')) { g.querySelectorAll<HTMLElement>('.subs [hidden]').forEach(s => s.hidden = false); el.remove(); return }
        const t = el.closest('[data-id]') as HTMLElement | null; selectPop(byId.get(t ? +t.dataset.id! : best.id)!, true) })
      list.appendChild(g)
    }
    syncUrl()
  }
  function selectPop(p: Pop, fly: boolean) {
    query = { name: disp(p.core), core: p.core, meta: meta(p), c: p.c }
    if (mode !== 'sim') setMode('sim'); else renderSim()
    if (fly && p.dlat != null) map.flyTo(p.dlon!, p.dlat, Math.max(map.k, 700))
  }
  // ---------- categorical colouring of the map by cluster
  /** neighbour field over the locations that have at least one shown population */
  const field = heat.field('m', li => heat.locPops[li].some(id => visible[id]))
  function paintCategories(assign: Map<number, number>, colors: string[], inScope: (p: Pop) => boolean) {
    const locCat = new Int32Array(heat.locPops.length).fill(-1)
    heat.locPops.forEach((ids, li) => { const cnt = new Map<number, number>(); for (const id of ids) { if (!visible[id]) continue; const c = assign.get(id); if (c !== undefined) cnt.set(c, (cnt.get(c) ?? 0) + 1) } let best = -1, bc = 0; cnt.forEach((v, k) => { if (v > bc) { bc = v; best = k } }); locCat[li] = best })
    const pal = new Uint8ClampedArray(colors.length * 3); colors.forEach((c, i) => { const r = rgb(c); pal[i * 3] = r.r; pal[i * 3 + 1] = r.g; pal[i * 3 + 2] = r.b })
    heat.renderCategories(field, locCat, pal); map.setRaster(0.75)
    setPoints(p => { if (!visible[p.id]) return null; const c = assign.get(p.id); return c !== undefined ? colors[c] : inScope(p) ? '#71717a' : null }, p => assign.has(p.id) ? 1 : 0.5)
  }

  // ---------- clusters: the map shows the current cut of the tree; open nodes are split into their two children
  const kEl = $<HTMLInputElement>('k')
  const kSteps = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 45, 50, 55, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300, 400, 500, 600, 800, 1000]
  kEl.max = String(kSteps.length - 1)
  const K_DEFAULT = 8
  const open = new Set<number>()
  const cutTo = (k: number) => { open.clear(); open.add(tree.root); for (const r of tree.split(tree.root, k)) for (const a of tree.ancestors(r)) if (a !== r) open.add(a) }
  const cutLeaves = () => { const out: number[] = []; const rec = (n: number) => { const nd = tree.nodes[n]; for (const c of [nd.left, nd.right]) (open.has(c) && !tree.isLeaf(c)) ? rec(c) : out.push(c) }; rec(tree.root); return out.sort((a, b) => tree.nodes[b].size - tree.nodes[a].size) }
  // a branch is named by the areas it holds most of (at least half of the parent's populations there): whole
  // continents when it owns them, else subregions; ranked by count, kept until 75% of the branch is covered, max 3
  const CONTINENTS: Record<string, string[]> = {
    'Europe': ['Northern Europe', 'British Isles', 'Western Europe', 'Iberia', 'Italy', 'Balkans', 'Greece', 'Central Europe', 'Eastern Europe'],
    'Middle East & North Africa': ['Caucasus', 'Anatolia', 'Levant', 'Arabia', 'Iran & Iraq', 'North Africa'],
    'Sub-Saharan Africa': ['Sudan & Horn of Africa', 'West Africa', 'Central Africa', 'East Africa', 'Southern Africa'],
    'East & Southeast Asia': ['East Asia', 'Southeast Asia'],
    'Americas': ['North America', 'Mesoamerica & Caribbean', 'South America'] }
  const nameCache = new Map<number, string>()
  const regionCounts = (node: number) => { const c = new Map<string, number>(); for (const id of tree.members(node)) if (visible[id]) { const r = byId.get(id)!.region!; c.set(r, (c.get(r) ?? 0) + 1) } return c }
  const nameOfNode = (node: number) => {
    let s = nameCache.get(node); if (s) return s
    const mem = tree.members(node).filter(id => visible[id]).map(id => byId.get(id)!)
    if (mem.length <= 3) s = mem.map(p => disp(p.first)).filter((v, i, a) => a.indexOf(v) === i).join(', ')
    else {
      const cn = regionCounts(node), parent = tree.nodes[node].parent, cp = parent >= 0 ? regionCounts(parent) : cn
      const sum = (c: Map<string, number>, rs: string[]) => rs.reduce((t, r) => t + (c.get(r) ?? 0), 0)
      const cand: [string, number][] = [], used = new Set<string>()
      for (const [cont, rs] of Object.entries(CONTINENTS)) { const n = sum(cn, rs), np = sum(cp, rs); if (n >= 0.1 * mem.length && n / np >= 0.5) { cand.push([cont, n]); rs.forEach(r => used.add(r)) } }
      for (const [r, c] of cn) if (!used.has(r) && r !== 'other' && r !== 'unplaced' && c / (cp.get(r) ?? c) >= 0.5) cand.push([r, c])
      cand.sort((a, b) => b[1] - a[1])
      const names: string[] = []; let covered = 0
      for (const [r, c] of cand) { names.push(r); covered += c; if (names.length >= 3 || covered >= 0.75 * mem.length) break }
      if (!names.length) { const c = new Map<string, number>(); mem.forEach(p => c.set(p.first, (c.get(p.first) ?? 0) + 1)); names.push(...[...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => disp(f))) }
      s = names.join(', ')
    }
    nameCache.set(node, s); return s
  }
  let clu: { roots: number[]; assign: Map<number, number>; colors: Map<number, string> } | null = null
  cutTo(K_DEFAULT)
  const splitAndZoom = (n: number) => { if (!tree.isLeaf(n)) open.add(n); renderClusters(); fitTo(tree.members(n).filter(id => visible[id]).map(id => byId.get(id)!)) }
  function renderClusters() {
    const roots = cutLeaves(), assign = tree.assign(roots), colors = tree.colorMap(roots)
    clu = { roots, assign, colors }
    $('kVal').textContent = String(roots.length); kEl.value = String(Math.max(0, kSteps.filter(k => k <= roots.length).length - 1))
    paintCategories(assign, roots.map(r => colors.get(r)!), () => false)
    renderTree($('clutree'), { tree, open, colors, byId, visible: id => !!visible[id], name: nameOfNode, onRow: splitAndZoom, onToggle: n => { open.has(n) ? open.delete(n) : open.add(n); renderClusters() } })
    syncUrl()
  }
  kEl.oninput = () => { cutTo(kSteps[+kEl.value]); renderClusters() }
  $('creset').onclick = () => { cutTo(K_DEFAULT); renderClusters() }

  // ---------- modes & controls
  function render() { if (mode === 'sim') renderSim(); else renderClusters() }
  // ---------- shareable URL: ?q=Polish&scale=regional&map=lon,lat,zoom | ?view=clusters&open=…
  const SCALE_NAME: Record<string, string> = { '0.05': 'close', '0.25': 'regional', '1': 'global' }
  let urlTimer = 0
  function syncUrl() {
    const u = new URLSearchParams()
    if (mode === 'sim') { if (query) u.set('q', query.core); if (rangeQ !== 0.25) u.set('scale', SCALE_NAME[String(rangeQ)]) }
    else { u.set('view', 'clusters'); u.set('open', [...open].filter(n => n !== tree.root).join(',')) }
    const v = map.view(); u.set('map', `${v.lon.toFixed(2)},${v.lat.toFixed(2)},${Math.round(v.k)}`)
    history.replaceState(null, '', '?' + u.toString().replace(/%2C/g, ','))
  }
  map.onMove = () => { clearTimeout(urlTimer); urlTimer = window.setTimeout(syncUrl, 250) }
  function setMode(m: Mode) {
    mode = m; legend.hidden = m !== 'sim' || !query
    document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === m))
    document.querySelectorAll<HTMLElement>('.mode').forEach(s => s.hidden = s.id !== 'mode-' + m)
    render()
  }
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode as Mode))
  const rangeEl = $<HTMLSelectElement>('range'); rangeEl.onchange = () => { rangeQ = +rangeEl.value; renderSim() }

  // search
  const search = $<HTMLInputElement>('search'), suggest = $<HTMLUListElement>('suggest')
  const clean = (p: Pop) => !(p.o || p.low || p.cont)
  const byN = (a: Pop, b: Pop) => b.n - a.n
  const uniq = (list: Pop[]) => { const seen = new Set<string>(); return list.filter(p => !seen.has(p.core) && seen.add(p.core)) }
  // most-sampled present-day groups (all their subpopulations counted), represented by their main entry
  const groupN = new Map<string, number>(); pops.filter(p => p.kind === 'm' && clean(p)).forEach(p => groupN.set(p.first, (groupN.get(p.first) ?? 0) + p.n))
  // a group's representative: the member closest to the group's sample-weighted mean (medoid)
  const rep = (first: string) => {
    const mem = pops.filter(p => p.kind === 'm' && clean(p) && p.first === first), tot = mem.reduce((s, p) => s + p.n, 0)
    const mean = mem[0].c.map((_, i) => mem.reduce((s, p) => s + p.n * p.c[i], 0) / tot)
    return mem.sort((x, y) => dist(x.c, mean) - dist(y.c, mean))[0]
  }
  type Row = { p: Pop; name: string; n: number }
  type Groups = Partial<Record<'pick' | 'm' | 'pre' | 'anc' | 'med' | 'mod', Row[]>>
  const rowOf = (p: Pop): Row => ({ p, name: disp(p.core), n: p.n })
  const ERAS = ['pre', 'anc', 'med', 'mod'] as const
  const ancientBy = (era: string) => uniq(pops.filter(p => p.kind === 'a' && clean(p) && p.era === era).sort(byN))
  // curated picks people ask about first: well-known ancient groups with a decent sample
  const PICKS: [string, string][] = [
    ['Mycenaean Greece', 'Greece_LBA_Mycenaean_Messenia'], ['Imperial Rome', 'Italy_Lazio_Roman_Empire_Rome'], ['Canaanites, Megiddo', 'Israel_LBA_Megiddo'],
    ['Vikings, Sweden', 'Sweden_Early-High_Medieval_Viking_Age_Skara'], ['Anglo-Saxons', 'England_Late_Antiquity-Early_Medieval_Anglo-Saxon_Dover_Buckland'],
    ['Celts, La Tène', 'Czechia_IA_La_Tene'], ['Yamnaya steppe herders', 'Russia_Samara_EBA_Yamnaya'], ['Anatolian Neolithic farmers', 'Anatolia_N_Ceramic_Barcin'],
    ['Classic Maya', 'Mexico_Classic_Maya_Chichen_Itza'], ['Xiongnu', 'Mongolia_IA_Xiongnu_Late']]
  const byCore = (core: string) => pops.filter(p => p.core === core && clean(p)).sort(byN)[0]
  const starters: Groups = { pick: PICKS.map(([name, core]) => byCore(core)).filter(Boolean).map((p, i) => ({ p, name: PICKS[i][0], n: p.n })),
    m: [...groupN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, n]) => ({ p: rep(f), name: disp(f), n })) }
  for (const e of ERAS) starters[e] = ancientBy(e).slice(0, 4).map(rowOf)
  const HEAD: Record<string, string> = { pick: 'Top picks', m: 'Present-day', ...ERA }
  // while searching, the suggestions take over the panel below the box
  const searching = (on: boolean) => { suggest.hidden = !on; $('query').hidden = on; $('nearest').hidden = on }
  function showSuggest(groups: Groups) {
    suggest.innerHTML = ''; let any = false
    for (const key of ['pick', 'm', 'pre', 'anc', 'med', 'mod'] as const) {
      const list = groups[key]; if (!list?.length) continue; any = true
      const hd = document.createElement('li'); hd.className = 'hd'; hd.textContent = HEAD[key]; suggest.appendChild(hd)
      for (const r of list) { const li = document.createElement('li'); li.innerHTML = `<span>${esc(r.name)}</span><span class="sub">n=${r.n}</span>`; li.onmousedown = () => { search.value = ''; searching(false); selectPop(r.p, true) }; suggest.appendChild(li) }
    }
    if (!any) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No population matches'; suggest.appendChild(li) }
    searching(true)
  }
  search.oninput = search.onfocus = () => {
    const q = search.value.trim().toLowerCase().replace(/ /g, '_')
    if (!q.length) { showSuggest(starters); return }
    const words = q.split('_').filter(Boolean)
    const atWord = (p: Pop) => { const s = searchText.get(p.id)!, i = s.indexOf(words[0]); return i === 0 || s[i - 1] === '_' ? 0 : 1 }
    const rank = (a: Pop, b: Pop) => atWord(a) - atWord(b) || b.n - a.n
    const hits = pops.filter(p => { const s = searchText.get(p.id)!; return words.every(w => s.includes(w)) }).sort(rank)
    const g: Groups = { m: uniq(hits.filter(p => p.kind === 'm')).slice(0, 20).map(rowOf) }
    for (const e of ERAS) g[e] = uniq(hits.filter(p => p.kind === 'a' && p.era === e)).slice(0, 12).map(rowOf)
    showSuggest(g)
  }
  search.onblur = () => setTimeout(() => searching(false), 150)
  search.onkeydown = e => { if (e.key === 'Escape') { search.value = ''; search.blur() } }

  // map interactions
  const tip = $('tooltip')
  map.onHover = (p, x, y) => {
    if (!p) { tip.hidden = true; return }
    let extra = ''
    if (mode === 'sim' && query) extra = `<br>distance ${raw[p.id].toFixed(2)}`
    if (mode === 'clu' && clu) { const c = clu.assign.get(p.id); if (c !== undefined) extra = '<br>cluster: ' + esc(nameOfNode(clu.roots[c])) }
    tip.innerHTML = `<b>${esc(disp(p.core))}</b><br><span class="sub">${esc(p.place ?? 'no location')}<br>${tags(p).join(', ')}${extra}</span>`
    tip.hidden = false; tip.style.left = x + 14 + 'px'; tip.style.top = y + 14 + 'px'
  }
  map.onClick = (lng, lat, p) => {
    if (mode === 'clu') {
      if (!clu) return
      let c = p ? clu.assign.get(p.id) : undefined
      if (c === undefined) {
        const near = pops.filter(q => q.lat != null && visible[q.id] && clu!.assign.has(q.id)).map(q => ({ q, km: haversine(lat, lng, q.lat!, q.lon!) })).sort((a, b) => a.km - b.km)[0]
        if (near && near.km < 800) c = clu.assign.get(near.q.id)
      }
      if (c !== undefined) splitAndZoom(clu.roots[c]); return
    }
    if (p) selectPop(p, false)
  }
  // initial state from the URL, else the default query
  const u = new URLSearchParams(location.search)
  const mapParam = (u.get('map') ?? '').split(',').map(Number)
  const hasMap = mapParam.length === 3 && mapParam.every(Number.isFinite)
  const scaleQ = Object.entries(SCALE_NAME).find(([, n]) => n === u.get('scale'))?.[0]
  if (scaleQ) { rangeQ = +scaleQ; rangeEl.value = scaleQ }
  if (u.get('view') === 'clusters') {
    const ids = (u.get('open') ?? '').split(',').filter(Boolean).map(Number).filter(n => tree.nodes[n] && !tree.isLeaf(n))
    if (ids.length) { open.clear(); open.add(tree.root); ids.forEach(n => open.add(n)) }
    setMode('clu')
  }
  else { const p = pops.find(p => p.core === (u.get('q') || DEFAULT_QUERY)) ?? pops[0]; selectPop(p, false); if (!hasMap) map.flyTo(p.lon ?? 20, p.lat ?? 50, 450, 0) }
  if (hasMap) map.flyTo(mapParam[0], mapParam[1], mapParam[2], 0)
}
function haversine(a: number, b: number, c: number, dd: number) {
  const r = Math.PI / 180; const h = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((dd - b) * r / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}
main().catch(e => { console.error(e); document.body.insertAdjacentHTML('afterbegin', `<pre style="color:red">${String(e)}</pre>`) })
