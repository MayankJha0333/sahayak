import { useEffect, useState } from 'react';
import { type LatLng, rideMinutes, roadMetres } from './geo';

/**
 * Real road routes from OSRM (OpenStreetMap). The public demo server is fine while testing;
 * set EXPO_PUBLIC_ROUTING_URL to your own OSRM (or a hosted one) before launch.
 * If routing is unreachable the app falls back to the same straight-line estimate the server uses.
 */
const BASE = (process.env.EXPO_PUBLIC_ROUTING_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '');

export type RouteInfo = {
  /** Points along the road, for drawing. Null when we only have the estimate. */
  points: LatLng[] | null;
  roadM: number;
  /** Two-wheeler minutes incl. parking — same model as the server's arrival time. */
  minutes: number;
  source: 'road' | 'estimate';
};

const cache = new Map<string, RouteInfo>();
// ~100 m grid, so a rider moving along does not refetch every few metres.
const key = (a: LatLng, b: LatLng) => [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(3)).join(',');

export const estimateRoute = (a: LatLng, b: LatLng): RouteInfo => {
  const roadM = roadMetres(a, b);
  return { points: null, roadM, minutes: rideMinutes(roadM), source: 'estimate' };
};

async function fetchRoute(a: LatLng, b: LatLng): Promise<RouteInfo> {
  const url = `${BASE}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const json = (await res.json()) as { code?: string; routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    const r = json.routes?.[0];
    if (json.code !== 'Ok' || !r) throw new Error('no route');
    return { points: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), roadM: r.distance, minutes: rideMinutes(r.distance), source: 'road' };
  } finally { clearTimeout(t); }
}

/** Road route between two points, estimate first and the real road line as soon as it arrives. */
export function useRoute(from?: LatLng | null, to?: LatLng | null): RouteInfo | null {
  const k = from && to ? key(from, to) : '';
  const [info, setInfo] = useState<{ k: string; r: RouteInfo } | null>(null);
  useEffect(() => {
    if (!from || !to) return;
    const hit = cache.get(k);
    if (hit) return;
    let alive = true;
    fetchRoute(from, to)
      .then((r) => { cache.set(k, r); if (alive) setInfo({ k, r }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!from || !to) return null;
  return cache.get(k) ?? (info?.k === k ? info.r : estimateRoute(from, to));
}
