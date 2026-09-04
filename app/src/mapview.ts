import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, CanvasSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { feature, mesh } from 'topojson-client'
import type { Pop } from './types'
import { LAT_MAX } from './heat'
maplibregl.setWorkerUrl(workerUrl)

export async function loadWorld() {
  const [land, countries] = await Promise.all([import('world-atlas/land-110m.json'), import('world-atlas/countries-110m.json')])
  const landGeo = feature(land.default as any, (land.default as any).objects.land) as any
  const borders = mesh(countries.default as any, (countries.default as any).objects.countries, (a: any, b: any) => a !== b) as any
  return { landGeo, borders }
}

export function createMap(landGeo: any, borders: any, heatCanvas: HTMLCanvasElement): MLMap {
  const map = new maplibregl.Map({
    container: 'map', center: [30, 35], zoom: 1.6, minZoom: 0.8, maxZoom: 9, attributionControl: false, canvasContextAttributes: { antialias: true },
    style: {
      version: 8, sources: {
        land: { type: 'geojson', data: landGeo },
        borders: { type: 'geojson', data: borders },
        pops: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        sel: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#eef0f3' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#fafaf8' } },
        { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#c9c9ce', 'line-width': 0.5 } },
        { id: 'pops-a', type: 'circle', source: 'pops', filter: ['==', ['get', 'kind'], 'a'], paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2, 4, 3.5, 7, 6], 'circle-color': ['get', 'color'],
          'circle-stroke-color': '#3f3f46', 'circle-stroke-width': 0.7, 'circle-opacity': ['get', 'op'], 'circle-stroke-opacity': ['get', 'op'] } },
        { id: 'pops-m', type: 'circle', source: 'pops', filter: ['==', ['get', 'kind'], 'm'], paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 4, 5, 7, 8], 'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2, 'circle-opacity': ['get', 'op'], 'circle-stroke-opacity': ['get', 'op'] } },
        { id: 'sel-halo', type: 'circle', source: 'sel', paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#18181b', 'circle-stroke-width': 4 } },
        { id: 'sel', type: 'circle', source: 'sel', paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
      ],
    },
  })
  map.on('error', e => console.error('maplibre error:', e.error?.message ?? e))
  map.on('load', () => {
    map.addSource('heat', { type: 'canvas', canvas: heatCanvas, animate: true, coordinates: [[-180, LAT_MAX], [180, LAT_MAX], [180, -LAT_MAX], [-180, -LAT_MAX]] } as any)
    map.addLayer({ id: 'heat', type: 'raster', source: 'heat', paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'borders')
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  return map
}
export function setResampling(map: MLMap, mode: 'linear' | 'nearest') { if (map.getLayer('heat')) map.setPaintProperty('heat', 'raster-resampling', mode) }

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
  const q = (v: number[], f: number) => { const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(f * (a.length - 1)))] }
  const lons = pl.map(p => p.dlon!), lats = pl.map(p => p.dlat!)
  map.fitBounds([[q(lons, 0.05), q(lats, 0.05)], [q(lons, 0.95), q(lats, 0.95)]], { padding: 60, maxZoom: 6, duration: 700 })
}
export function repaintHeat(map: MLMap) { const s = map.getSource('heat') as CanvasSource; s?.play?.(); map.triggerRepaint() }
