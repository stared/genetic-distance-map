import { feature, mesh } from 'topojson-client'
export async function loadWorld() {
  const [land, countries] = await Promise.all([import('world-atlas/land-50m.json'), import('world-atlas/countries-110m.json')])
  const landGeo = feature(land.default as any, (land.default as any).objects.land) as any
  const borders = mesh(countries.default as any, (countries.default as any).objects.countries, (a: any, b: any) => a !== b) as any
  return { landGeo, borders }
}
