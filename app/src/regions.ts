/** World subregion from coordinates: a small ordered list of lon/lat boxes, first match wins. */
type Box = [name: string, lon0: number, lon1: number, lat0: number, lat1: number]
const BOXES: Box[] = [
  ['Caucasus', 38, 50.5, 38.5, 45],
  ['Greece', 19.5, 28.5, 34.5, 41.8],
  ['Levant', 32, 42.5, 29, 37.5],
  ['Anatolia', 26, 45, 36, 42.3],
  ['Arabia', 34, 60, 12, 32],
  ['Iran & Iraq', 38.8, 63.5, 25, 40],
  ['British Isles', -11, 2, 49.5, 61],
  ['Northern Europe', -25, 32, 54.5, 72],
  ['Iberia', -10, 4.6, 35.5, 44],
  ['Iberia', -18.5, -13, 27, 29.5],     // Canaries
  ['Balkans', 13.6, 30, 39, 48.3],       // checked before Italy so the Adriatic's east coast is Balkan
  ['Italy', 6.5, 19, 35.5, 47],
  ['Central Europe', 14, 24.5, 45.7, 55],
  ['Western Europe', -5, 14, 42, 54.5],
  ['Eastern Europe', 22, 60, 44, 72],
  ['Siberia & Mongolia', 60, 180, 50, 82],
  ['Siberia & Mongolia', 87, 120, 41.5, 52],
  ['Siberia & Mongolia', -180, -168, 60, 72],   // Chukotka east of the antimeridian
  ['Central Asia', 46, 88, 29, 56],
  ['South Asia', 60.9, 97.5, 5, 37],
  ['Southeast Asia', 92, 141, -11, 23.5],
  ['East Asia', 73, 146, 18, 50],
  ['Oceania', 110, 180, -50, 0],
  ['Oceania', -180, -100, -50, 5],
  ['Oceania', -180, -150, 15, 25],   // Hawaii
  ['Oceania', 130, 180, 0, 21],      // Micronesia
  ['North Africa', -18, 35, 20, 38],
  ['Sudan & Horn of Africa', 22, 52, -2, 22],
  ['Southern Africa', 10, 36, -35, -16.5],
  ['East Africa', 28, 58, -27, 5],
  ['West Africa', -18, 8, 4, 25],
  ['West Africa', 8, 16, 7, 25],
  ['Central Africa', 8, 31, -16.5, 23],
  ['North America', -170, -20, 23.5, 84],
  ['Mesoamerica & Caribbean', -118, -59, 12.5, 23.5],
  ['South America', -92, -34, -56, 12.5],
]
export function regionOf(lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat == null || lon == null) return 'unplaced'
  for (const [name, x0, x1, y0, y1] of BOXES) if (lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1) return name
  return 'other'
}
