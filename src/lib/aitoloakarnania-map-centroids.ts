import { MUNICIPALITIES } from "./aitoloakarnania-data";

/**
 * Map centroids (lat, lng) for Aitoloakarnania Kallikratis municipalities, roughly town centers.
 * Used to place CircleMarker / heat on the map.
 */
export const MUNI_CENTROIDS: Record<string, { lat: number; lng: number; r: number }> = {
  "Δήμος Αγρινίου": { lat: 38.621, lng: 21.409, r: 5200 },
  "Δήμος Αμφιλοχίας": { lat: 38.864, lng: 21.168, r: 5000 },
  "Δήμος Ακτίου-Βόνιτσας": { lat: 38.9, lng: 20.888, r: 5500 },
  "Δήμος Αλυζίας": { lat: 38.55, lng: 21.15, r: 4200 },
  "Δήμος Μεσολογγίου": { lat: 38.364, lng: 21.428, r: 6000 },
  "Δήμος Ναυπακτίας": { lat: 38.393, lng: 21.828, r: 5200 },
  "Δήμος Θέρμου": { lat: 38.57, lng: 21.667, r: 4800 },
  "Δήμος Ξηρομέρου": { lat: 38.5, lng: 21.25, r: 6500 },
};

/** Center: Αιτωλοακαρνανία (ευρύτερη περιοχή) */
export const MAP_REGION: { center: [number, number]; zoom: number; maxBounds: [[number, number], [number, number]] } = {
  center: [38.7, 21.5],
  zoom: 9,
  maxBounds: [
    [38.0, 20.55],
    [39.05, 22.1],
  ],
};

export const KNOWN_MUNICIPALITY_NAMES: string[] = MUNICIPALITIES.map((m) => m.name);

export function getCentroid(muniName: string | null | undefined) {
  if (!muniName) return null;
  return MUNI_CENTROIDS[muniName] ?? null;
}

export function findCanonicalMuni(dbValue: string | null | undefined): string | null {
  if (!dbValue?.trim()) return null;
  const t = dbValue.trim();
  for (const name of KNOWN_MUNICIPALITY_NAMES) {
    if (name === t) return name;
  }
  const nt = t.toLowerCase();
  for (const name of KNOWN_MUNICIPALITY_NAMES) {
    if (name.toLowerCase() === nt) return name;
  }
  for (const name of KNOWN_MUNICIPALITY_NAMES) {
    if (t.includes("Αγρίν") && name.includes("Αγριν")) return "Δήμος Αγρινίου";
  }
  return null;
}
