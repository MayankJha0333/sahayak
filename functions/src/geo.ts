export type LatLng = { lat: number; lng: number };

export function distanceM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function along(a: LatLng, b: LatLng, t: number): LatLng {
  const k = Math.max(0, Math.min(1, t));
  const bend = Math.sin(k * Math.PI) * 0.0016;
  return { lat: a.lat + (b.lat - a.lat) * k + bend, lng: a.lng + (b.lng - a.lng) * k - bend * 0.6 };
}

/**
 * Travel on a two-wheeler through city traffic. Roads are not straight lines, so the straight-line distance
 * is stretched by ~1.35; then ~18 km/h average plus 2 minutes to park and reach the door.
 * The same numbers run on the phone and the server, so both apps show the same arrival time.
 */
export const ROAD_FACTOR = 1.35;
export const RIDE_KMH = 18;
export const DOOR_MIN = 2;
/** Minutes from the gate to the clock starting: ID check, start code, a word about the list. */
export const HANDOVER_MIN = 3;
export const roadMetres = (a: LatLng, b: LatLng) => distanceM(a, b) * ROAD_FACTOR;
export const rideMinutes = (roadM: number) => (roadM < 60 ? 0 : Math.max(2, Math.ceil((roadM / 1000 / RIDE_KMH) * 60) + DOOR_MIN));
/** Minutes to cover a straight-line distance (converted to road distance first). */
export const etaMinutes = (straightM: number) => rideMinutes(straightM * ROAD_FACTOR);
export function travelEstimate(from: LatLng, to: LatLng) {
  const road = roadMetres(from, to);
  return { roadM: Math.round(road), minutes: rideMinutes(road) };
}
