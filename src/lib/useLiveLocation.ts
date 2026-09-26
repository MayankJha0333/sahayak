import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { updatePartnerLocation } from './api';
import { distanceM } from './geo';
import { inIndia } from './areas';


/**
 * While a partner is online, her phone's position is written to partners/{uid}.at so
 * dispatch can rank her by distance and the customer's map can watch her ride over.
 * Throttled to ~20 m / 5 s so Firestore is not written every frame.
 */
export function useLiveLocation(enabled: boolean) {
  const last = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
        (pos) => {
          const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // Outside India (a simulator's default spot, say) is never a real position for dispatch.
          if (!inIndia(at)) return;
          if (last.current && distanceM(last.current, at) < 15) return;
          last.current = at;
          void updatePartnerLocation(at);
        },
      );
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [enabled]);
}

/** Opens the phone's maps app with turn-by-turn directions — no routing to build ourselves. */
export function directionsUrl(to: { lat: number; lng: number }, label = 'Customer') {
  const q = `${to.lat},${to.lng}`;
  return {
    ios: `maps://?daddr=${q}&dirflg=d`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
    label,
  };
}
