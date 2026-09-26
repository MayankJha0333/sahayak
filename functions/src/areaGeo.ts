/**
 * Service-area shapes. The SAME file lives in three places — keep them identical:
 *   functions/src/areaGeo.ts · src/lib/areaGeo.ts · admin-web/src/areaGeo.ts
 *
 * An area is either
 *   - a circle (centre + radius), the old kind, or
 *   - a real border from OpenStreetMap (a state, district or city), stored as encoded polylines.
 * Firestore can't hold arrays inside arrays, so each outer ring of the border is one encoded string.
 */
export type LatLng = { lat: number; lng: number };
export type BBox = { s: number; w: number; n: number; e: number };
export type AreaShape = {
  center: LatLng;
  /** Circle: the radius. Border: the distance from the centre to its farthest point (used to rank and zoom). */
  radiusKm: number;
  shape?: 'circle' | 'border';
  /** Outer rings of the border, each a Google encoded polyline (precision 5). */
  border?: string[];
  bbox?: BBox;
};

const R = 6371000;
const rad = Math.PI / 180;

export function distanceM(a: LatLng, b: LatLng) {
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- encoded polylines (the format Google Maps uses: ~4 bytes a point) ---------- */

export function encodePolyline(points: LatLng[]): string {
  let out = '', pLat = 0, pLng = 0;
  const put = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5), lng = Math.round(p.lng * 1e5);
    put(lat - pLat); put(lng - pLng); pLat = lat; pLng = lng;
  }
  return out;
}

export function decodePolyline(s: string): LatLng[] {
  const pts: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  const next = () => {
    let shift = 0, result = 0, b: number;
    do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < s.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) { lat += next(); lng += next(); pts.push({ lat: lat / 1e5, lng: lng / 1e5 }); }
  return pts;
}

const decoded = new WeakMap<string[], LatLng[][]>();
/** The border's rings as points (decoded once per loaded area). */
export function ringsOf(a: AreaShape): LatLng[][] {
  if (!a.border?.length) return [];
  let r = decoded.get(a.border);
  if (!r) { r = a.border.map(decodePolyline); decoded.set(a.border, r); }
  return r;
}

export const isBorder = (a: AreaShape) => a.shape === 'border' && Boolean(a.border?.length);

/* ---------- is a point inside? ---------- */

function inRing(ring: LatLng[], p: LatLng) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

export function insideArea(a: AreaShape, p: LatLng): boolean {
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return false;
  if (!isBorder(a)) return distanceM(a.center, p) <= a.radiusKm * 1000;
  const b = a.bbox;
  if (b && (p.lat < b.s || p.lat > b.n || p.lng < b.w || p.lng > b.e)) return false;
  return ringsOf(a).some((ring) => inRing(ring, p));
}

/** Metres from a point to the area's edge; 0 when inside. */
export function distanceToArea(a: AreaShape, p: LatLng): number {
  if (!isBorder(a)) return Math.max(0, distanceM(a.center, p) - a.radiusKm * 1000);
  if (insideArea(a, p)) return 0;
  // Flat projection around the point is accurate enough at city scale.
  const kx = Math.cos(p.lat * rad) * R * rad, ky = R * rad;
  let best = Infinity;
  for (const ring of ringsOf(a)) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i].lng - p.lng) * kx, ay = (ring[i].lat - p.lat) * ky;
      const bx = (ring[i + 1].lng - p.lng) * kx, by = (ring[i + 1].lat - p.lat) * ky;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/* ---------- launch status ---------- */

/** On/off plus an optional launch date. A date in the future = "coming soon"; once it passes, the area serves by itself. */
export type Launch = { active: boolean; opensAt?: number | null };
export type AreaStatus = 'live' | 'soon' | 'paused';

export const isServing = (a: Launch, now = Date.now()) => a.active || (typeof a.opensAt === 'number' && a.opensAt <= now);
export const areaStatus = (a: Launch, now = Date.now()): AreaStatus =>
  isServing(a, now) ? 'live' : typeof a.opensAt === 'number' ? 'soon' : 'paused';

/** Everything the app needs to tell a customer about one address. */
export function coverageAt<T extends AreaShape & Launch>(areas: T[], p: LatLng, now = Date.now()) {
  const serving = pickArea(areas.filter((a) => isServing(a, now)), p);
  const soon = serving ? null : areas
    .filter((a) => areaStatus(a, now) === 'soon' && insideArea(a, p))
    .sort((x, y) => (x.opensAt ?? 0) - (y.opensAt ?? 0))[0] ?? null;
  const nearest = serving ? null : nearestArea(areas.filter((a) => isServing(a, now)), p);
  return { serving, soon, nearest };
}

/** The area a point falls in. When areas overlap, the smallest (most specific) one wins. */
export function pickArea<T extends AreaShape>(areas: T[], p: LatLng): T | null {
  return areas.filter((a) => insideArea(a, p)).sort((x, y) => x.radiusKm - y.radiusKm)[0] ?? null;
}

/** The closest area to a point outside all of them, and how far away its edge is. */
export function nearestArea<T extends AreaShape>(areas: T[], p: LatLng): { area: T; metres: number } | null {
  return areas.map((area) => ({ area, metres: distanceToArea(area, p) })).sort((x, y) => x.metres - y.metres)[0] ?? null;
}

/* ---------- turning an OpenStreetMap border into what we store ---------- */

type GeoJson = { type: string; coordinates: unknown };

/** Douglas–Peucker: drop points that bend the line by less than `tol` degrees. */
function simplify(ring: LatLng[], tol: number): LatLng[] {
  if (ring.length < 5 || tol <= 0) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let far = -1, idx = -1;
    const ax = ring[s].lng, ay = ring[s].lat, dx = ring[e].lng - ax, dy = ring[e].lat - ay, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * (ring[i].lng - ax) - dx * (ring[i].lat - ay)) / len;
      if (d > far) { far = d; idx = i; }
    }
    if (far > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return ring.filter((_, i) => keep[i]);
}

/**
 * Polygon or MultiPolygon GeoJSON → encoded outer rings + box + centre + reach.
 * Holes are ignored. Tiny islands are dropped. The result is kept under ~150 KB so a Firestore doc stays small.
 */
export function borderFromGeoJson(g: GeoJson, center?: LatLng): Pick<AreaShape, 'shape' | 'border' | 'bbox' | 'center' | 'radiusKm'> | null {
  const polys = g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [];
  let rings = polys.map((poly) => (poly[0] ?? []).map(([lng, lat]) => ({ lat, lng }))).filter((r) => r.length >= 4);
  if (!rings.length) return null;
  const box = (r: LatLng[]) => r.reduce((b, p) => ({ s: Math.min(b.s, p.lat), w: Math.min(b.w, p.lng), n: Math.max(b.n, p.lat), e: Math.max(b.e, p.lng) }), { s: 90, w: 180, n: -90, e: -180 });
  const span = (b: BBox) => (b.n - b.s) * (b.e - b.w);
  const biggest = Math.max(...rings.map((r) => span(box(r))));
  rings = rings.filter((r) => span(box(r)) >= biggest * 0.0005);
  let tol = 0, border: string[] = [];
  for (let tries = 0; tries < 8; tries++) {
    border = rings.map((r) => encodePolyline(simplify(r, tol)));
    if (border.reduce((n, s) => n + s.length, 0) < 150_000) break;
    tol = tol ? tol * 2 : 0.0002;
  }
  const bbox = box(rings.flat());
  const c = center ?? { lat: (bbox.s + bbox.n) / 2, lng: (bbox.w + bbox.e) / 2 };
  const reach = Math.max(...rings.flat().map((p) => distanceM(c, p)));
  const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
  return {
    shape: 'border', border,
    bbox: { s: r5(bbox.s), w: r5(bbox.w), n: r5(bbox.n), e: r5(bbox.e) },
    center: { lat: r5(c.lat), lng: r5(c.lng) },
    radiusKm: Math.round(reach / 100) / 10,
  };
}
