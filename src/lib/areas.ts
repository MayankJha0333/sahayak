import { useMemo } from 'react';
import { coverageAt, isServing, pickArea } from './areaGeo';
import { useAreas } from './db';
import type { LatLng } from './geo';
import type { Area } from './types';

/** Until ops adds an area the server serves Gurugram (40 km). Mirrors functions/src/growth.ts. */
const DEFAULT: Area & { id: string } = { id: 'default-gurugram', name: 'Gurugram', city: 'Gurugram', center: { lat: 28.4419, lng: 77.0723 }, radiusKm: 40, active: true, createdAt: 0 };

/**
 * Where we serve. `served(at)` says yes/no; `coverage(at)` also says which "coming soon" area the point is in
 * (with its launch date) or how far the nearest live area is. The server checks again when booking.
 */
export function useServiceArea() {
  const { rows, loading } = useAreas();
  return useMemo(() => {
    const all = rows.length ? rows : [DEFAULT];
    const areas = all.filter((a) => isServing(a));
    const areaAt = (at: LatLng) => pickArea(areas, at);
    const coverage = (at: LatLng) => coverageAt(all, at);
    return { loading, areas, areaAt, coverage, served: (at: LatLng) => Boolean(areaAt(at)) };
  }, [rows, loading]);
}

/** Rough box around India: outside it (a simulator parked in California, say) the map stays put. */
export const inIndia = (at: LatLng) => at.lat > 6 && at.lat < 37.5 && at.lng > 68 && at.lng < 97.5;
