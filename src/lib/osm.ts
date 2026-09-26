/**
 * Looking up Indian states, districts and cities — and their real borders — from OpenStreetMap.
 * The SAME file lives in admin-web/src/osm.ts and src/lib/osm.ts — keep them identical.
 *
 *   Districts in a state                               → bundled list (indiaDistricts.ts)
 *   Towns inside a district                            → Overpass API (two public servers, second is a backup)
 *   Borders and free-text search                       → Nominatim
 * Both are free public services with fair-use limits. Ops clicks a few times a day, which is well inside them.
 */
import { borderFromGeoJson, type LatLng } from './areaGeo';
import { bundledDistricts } from './indiaDistricts';

export type Level = 'state' | 'district' | 'subdistrict' | 'city' | 'place';
export type Place = {
  osmId: number; name: string; level: Level; center?: LatLng; hint?: string;
  /** Only relations have a border we can use. Roads (ways) and points (nodes) become a pin + range. */
  osmType?: 'relation' | 'way' | 'node';
  /** Plain-words kind for the search list: "Road", "Colony", "Locality"… */
  kind?: string;
  /** A sensible starting range for a pin on this kind of place, in km. */
  suggestKm?: number;
  /** The state it is in, when the map service says. */
  state?: string;
};

export const LEVEL_LABEL: Record<Level, string> = {
  state: 'Whole state', district: 'District', subdistrict: 'Tehsil / sub-district', city: 'City / town', place: 'Place',
};

/** OpenStreetMap relation ids of India's states and union territories (these don't change). */
export const INDIA_STATES: Place[] = ([
  [2025855, 'Andaman and Nicobar Islands'], [2022095, 'Andhra Pradesh'], [2027346, 'Arunachal Pradesh'], [2025886, 'Assam'],
  [1958982, 'Bihar'], [1942809, 'Chandigarh'], [1972004, 'Chhattisgarh'], [1952530, 'Dadra and Nagar Haveli and Daman and Diu'],
  [1942586, 'Delhi'], [11251493, 'Goa'], [1949080, 'Gujarat'], [1942601, 'Haryana'], [364186, 'Himachal Pradesh'],
  [1943188, 'Jammu and Kashmir'], [1960191, 'Jharkhand'], [2019939, 'Karnataka'], [2018151, 'Kerala'], [5515045, 'Ladakh'],
  [2027460, 'Lakshadweep'], [1950071, 'Madhya Pradesh'], [1950884, 'Maharashtra'], [2027869, 'Manipur'], [2027521, 'Meghalaya'],
  [2029046, 'Mizoram'], [2027973, 'Nagaland'], [1984022, 'Odisha'], [107001, 'Puducherry'], [1942686, 'Punjab'],
  [1942920, 'Rajasthan'], [1791324, 'Sikkim'], [96905, 'Tamil Nadu'], [3250963, 'Telangana'], [2026458, 'Tripura'],
  [1942587, 'Uttar Pradesh'], [9987086, 'Uttarakhand'], [1960177, 'West Bengal'],
] as const).map(([osmId, name]) => ({ osmId, name, level: 'state' as const }));

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const BUSY = 'The map service is busy right now. Wait a few seconds and try again.';

async function withTimeout(url: string, init: RequestInit, ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

type OverpassEl = { id: number; tags?: Record<string, string>; center?: { lat: number; lon: number }; bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number } };
async function overpass(query: string): Promise<OverpassEl[]> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // The main server allows a couple of queries at a time per person and answers 429 when busy: wait and ask again.
  // The backup is slower but rarely busy.
  const tries: [string, number][] = [[OVERPASS[0], 25_000], [OVERPASS[0], 25_000], [OVERPASS[1], 45_000]];
  for (const [i, [url, ms]] of tries.entries()) {
    try {
      const r = await withTimeout(url, { method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, ms);
      if (r.ok) {
        const j = (await r.json()) as { elements?: OverpassEl[] };
        if (j.elements) return j.elements;
      }
    } catch { /* timed out or offline: try again */ }
    if (i === 0) await wait(3000);
  }
  throw new Error(BUSY);
}

const cache = new Map<string, Place[]>();
const nameOf = (t: Record<string, string> = {}) => t['name:en'] || t.name || '';

/** Boundaries one level down, inside the given one. */
async function children(parentId: number, levels: string, level: (adminLevel: string) => Level): Promise<Place[]> {
  const key = `${parentId}:${levels}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Also fetch the parent's box: OpenStreetMap sometimes files a neighbour's town under the wrong parent, and its centre gives it away.
  const els = await overpass(`[out:json][timeout:25];rel(${parentId});out ids bb;area(${3_600_000_000 + parentId})->.p;rel(area.p)["boundary"="administrative"]["admin_level"~"^(${levels})$"];out tags center;`);
  const box = els.find((e) => e.id === parentId && e.bounds)?.bounds;
  const within = (e: OverpassEl) => !box || !e.center || (e.center.lat >= box.minlat && e.center.lat <= box.maxlat && e.center.lon >= box.minlon && e.center.lon <= box.maxlon);
  const seen = new Set<string>();
  const list = els
    .filter((e) => e.tags && within(e))
    .map((e) => ({ osmId: e.id, name: nameOf(e.tags), level: level(e.tags?.admin_level ?? ''), center: e.center ? { lat: e.center.lat, lng: e.center.lon } : undefined }))
    .filter((p) => p.name && !seen.has(`${p.level}:${p.name}`) && seen.add(`${p.level}:${p.name}`))
    .sort((a, b) => a.name.localeCompare(b.name));
  cache.set(key, list);
  return list;
}

/** Districts come bundled (instant, works offline); only a state we have no list for asks the map server. */
export async function districtsOf(stateId: number): Promise<Place[]> {
  const bundled = bundledDistricts(stateId);
  if (bundled.length) return bundled.map((d) => ({ ...d, level: 'district' as const }));
  return children(stateId, '5', () => 'district');
}
export const placesIn = (districtId: number) => children(districtId, '6|7|8', (l) => (l === '6' ? 'subdistrict' : 'city'));

type NominatimHit = {
  osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string; addresstype?: string; type?: string; category?: string;
  geojson?: { type: string; coordinates: unknown };
  address?: Record<string, string>;
};
const NOMINATIM = 'https://nominatim.openstreetmap.org';

const levelFromNominatim = (t = ''): Level =>
  t === 'state' ? 'state' : ['state_district', 'district', 'county'].includes(t) ? 'district' : ['city', 'town', 'municipality', 'village'].includes(t) ? 'city' : 'place';

/** What a search hit is, in words ops use, and how big a pin on it should start. */
function kindOf(h: NominatimHit): { kind: string; km: number } {
  const t = h.addresstype || h.type || '';
  if (h.category === 'highway' || ['road', 'street'].includes(t)) return { kind: 'Road', km: 1.5 };
  if (['residential', 'allotments', 'housing_estate'].includes(t) || /colony|enclave|society|apartments/i.test(h.name ?? '')) return { kind: 'Colony', km: 1.5 };
  if (['neighbourhood', 'quarter', 'suburb', 'city_block', 'borough', 'hamlet'].includes(t)) return { kind: 'Locality', km: 2.5 };
  if (['city', 'town', 'municipality'].includes(t)) return { kind: 'City / town', km: 8 };
  if (t === 'village') return { kind: 'Village', km: 2 };
  if (['state_district', 'district', 'county'].includes(t)) return { kind: 'District', km: 15 };
  if (t === 'state') return { kind: 'State', km: 30 };
  if (t === 'postcode') return { kind: 'PIN code', km: 3 };
  return { kind: 'Place', km: 1 };
}

const toPlace = (h: NominatimHit): Place => {
  const k = kindOf(h);
  const a = h.address ?? {};
  // "Karol Bagh, Central Delhi, Delhi": the nearest bigger places, always ending with the state.
  const parts = [a.suburb || a.neighbourhood, a.state_district, a.city || a.town || a.village || a.county, a.state]
    .filter((x, i, all): x is string => Boolean(x) && x !== h.name && all.indexOf(x) === i);
  return {
    osmId: h.osm_id, osmType: h.osm_type as Place['osmType'], name: h.name || h.display_name.split(',')[0], level: levelFromNominatim(h.addresstype),
    center: { lat: Number(h.lat), lng: Number(h.lon) }, hint: parts.length ? parts.join(', ') : h.display_name.split(',').slice(1, 4).join(',').trim(),
    state: a.state, kind: k.kind, suggestKm: k.km,
  };
};

/**
 * Free-text search for any place in India: a colony ("Patel Nagar"), a road ("MG Road"), a sector, a market, a city.
 * `near` (the part of the map ops is looking at) ranks nearby matches first without hiding the rest.
 */
export async function searchPlaces(q: string, near?: { s: number; w: number; n: number; e: number }): Promise<Place[]> {
  if (q.trim().length < 3) return [];
  const url = (box: string) => `${NOMINATIM}/search?q=${encodeURIComponent(q.trim())}&countrycodes=in&format=jsonv2&addressdetails=1&limit=10&accept-language=en${box}`;
  const get = async (u: string) => {
    const r = await withTimeout(u, {}, 15_000).catch(() => null);
    if (!r?.ok) throw new Error(BUSY);
    return (await r.json()) as NominatimHit[];
  };
  // Two searches: matches in the part of the map ops is looking at (listed first), and matches anywhere in India.
  const [nearby, all] = await Promise.all([
    near ? get(url(`&viewbox=${near.w},${near.n},${near.e},${near.s}&bounded=1`)).catch(() => []) : Promise.resolve([]),
    get(url('')),
  ]);
  const seen = new Set<string>();
  return [...nearby, ...all].map(toPlace).filter((p) => {
    const k = `${p.osmType}${p.osmId}`, k2 = `${p.name}|${p.hint}`;
    if (seen.has(k) || seen.has(k2)) return false;
    seen.add(k); seen.add(k2);
    return true;
  }).slice(0, 12);
}

/** "Patel Nagar, West Delhi" for a point on the map — used to name an area dropped by clicking. */
export async function nameAt(at: LatLng): Promise<{ name: string; hint: string; state: string }> {
  const r = await withTimeout(`${NOMINATIM}/reverse?lat=${at.lat}&lon=${at.lng}&zoom=16&format=jsonv2&accept-language=en`, {}, 10_000).catch(() => null);
  if (!r?.ok) return { name: 'New area', hint: '', state: '' };
  const h = (await r.json()) as NominatimHit & { address?: Record<string, string> };
  const a = h.address ?? {};
  const name = a.neighbourhood || a.suburb || a.quarter || a.residential || a.road || a.village || a.town || a.city || h.name || 'New area';
  const hint = [a.city_district || a.city || a.town || a.state_district, a.state].filter(Boolean).join(', ');
  return { name, hint, state: a.state ?? '' };
}

/** Border detail: whole states are drawn coarser (±200 m) than cities (±20 m) so both stay small. */
const DETAIL: Record<Level, number> = { state: 0.002, district: 0.0005, subdistrict: 0.0002, city: 0.0002, place: 0.0002 };

/** The real border of a place, ready to save on an area. */
export async function borderOf(p: Place) {
  const r = await withTimeout(`${NOMINATIM}/lookup?osm_ids=R${p.osmId}&format=jsonv2&polygon_geojson=1&polygon_threshold=${DETAIL[p.level]}&accept-language=en`, {}, 20_000).catch(() => null);
  if (!r?.ok) throw new Error(BUSY);
  const [hit] = (await r.json()) as NominatimHit[];
  if (!hit?.geojson) throw new Error(`OpenStreetMap has no border for ${p.name}. Pick a bigger or nearby place.`);
  const shape = borderFromGeoJson(hit.geojson, { lat: Number(hit.lat), lng: Number(hit.lon) });
  if (!shape) throw new Error(`OpenStreetMap has no usable border for ${p.name}.`);
  return shape;
}
