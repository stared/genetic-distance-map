import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, CanvasSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
maplibregl.setWorkerUrl(workerUrl)
import { feature, mesh } from 'topojson-client'
import type { Pop } from './types'
import { LAT_MAX } from './heat'

export async function loadWorld() {
  const [land, countries] = await Promise.all([
    import('world-atlas/land-110m.json'), import('world-atlas/countries-110m.json')])
  const landGeo = feature(land.default as any, (land.default as any).objects.land) as any
  const borders = mesh(countries.default as any, (countries.default as any).objects.countries, (a: any, b: any) => a !== b) as any
  return { landGeo, borders }
}

export function createMap(landGeo: any, borders: any, heatCanvas: HTMLCanvasElement): MLMap {
  const map = new maplibregl.Map({
    container: 'map', center: [30, 35], zoom: 1.6, minZoom: 0.8, maxZoom: 9, attributionControl: false,
    style: {
      version: 8, sources: {
        land: { type: 'geojson', data: landGeo },
        borders: { type: 'geojson', data: borders },
        pops: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        sel: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#dfe9f3' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f5f3ee' } },
        { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#bbb', 'line-width': 0.6 } },
        { id: 'pops-a', type: 'circle', source: 'pops', filter: ['==', ['get', 'kind'], 'a'], paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 6, 6], 'circle-color': ['get', 'color'],
          'circle-stroke-color': '#333', 'circle-stroke-width': 0.8, 'circle-opacity': ['get', 'op'], 'circle-stroke-opacity': ['get', 'op'] } },
        { id: 'pops-m', type: 'circle', source: 'pops', filter: ['==', ['get', 'kind'], 'm'], paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3.5, 6, 8], 'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': ['get', 'op'], 'circle-stroke-opacity': ['get', 'op'] } },
        { id: 'sel', type: 'circle', source: 'sel', paint: { 'circle-radius': 11, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e0202e', 'circle-stroke-width': 3 } },
      ],
    },
  })
  map.on('error', e => console.error('maplibre error:', e.error?.message ?? e))
  map.on('load', () => {
    map.addSource('heat', { type: 'canvas', canvas: heatCanvas, animate: true, coordinates: [[-180, LAT_MAX], [180, LAT_MAX], [180, -LAT_MAX], [-180, -LAT_MAX]] } as any)
    map.addLayer({ id: 'heat', type: 'raster', source: 'heat', paint: { 'raster-opacity': 0.85, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'borders')
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  return map
}

export function setPoints(map: MLMap, pops: Pop[], color: (p: Pop) => string | null, opacity: (p: Pop) => number) {
  const features: GeoJSON.Feature[] = []
  for (const p of pops) {
    if (p.dlat == null) continue
    const c = color(p); if (!c) continue
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.dlon!, p.dlat] }, properties: { id: p.id, kind: p.kind, color: c, op: opacity(p) } })
  }
  ;(map.getSource('pops') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features })
}
export function setSelection(map: MLMap, pts: [number, number][]) {
  ;(map.getSource('sel') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: pts.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })) })
}
export function fitTo(map: MLMap, pops: Pop[]) {
  const pl = pops.filter(p => p.dlat != null); if (!pl.length) return
  // fit the central 90% so a few far-flung members (colonial-era profiles, diaspora) do not zoom out to the world
  const q = (v: number[], f: number) => { const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(f * (a.length - 1)))] }
  const lons = pl.map(p => p.dlon!), lats = pl.map(p => p.dlat!)
  map.fitBounds([[q(lons, 0.05), q(lats, 0.05)], [q(lons, 0.95), q(lats, 0.95)]], { padding: 60, maxZoom: 6, duration: 700 })
}
export function repaintHeat(map: MLMap) { const s = map.getSource('heat') as CanvasSource; s?.play?.(); map.triggerRepaint() }
