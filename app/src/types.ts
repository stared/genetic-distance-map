export interface Pop {
  id: number; label: string; core: string; kind: 'm' | 'a'; n: number;
  o: boolean; low: boolean; cont: boolean; profile: string; first: string;
  lat: number | null; lon: number | null; dlat: number | null; dlon: number | null;
  prec: string | null; place: string | null; c: number[];
  region?: string;   // country-level name derived from place (set at load)
}
export interface TreeData { leaves: number[]; merges: [number, number, number, number][]; attach: Record<string, number> }
export type TreeSet = 'm' | 'a' | 'all'
export function dist(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < 25; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s)
}
