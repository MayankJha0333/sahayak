import { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Home, Navigation } from './icons';
import { WebMap, webMaps } from './WebMap';
import type { LatLng } from '@/lib/geo';
import { distanceM, routePoints } from '@/lib/geo';
import { useTheme } from '@/theme';

type Props = {
  origin: LatLng; dest: LatLng; at?: LatLng; height?: number; label?: string; hideExpert?: boolean;
  /** Road line from the routing service; without it a dashed estimate is drawn. */
  route?: LatLng[] | null;
  /** Bottom strip: distance · ride time · arrival. */
  footer?: string;
};

const toRN = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/**
 * Live map for customers (expert riding to them) and partners (the way to the door).
 * react-native-maps ships inside Expo Go, so this works with no native build: Apple Maps
 * on iOS, Google Maps on Android. The camera keeps both pins in view as the expert moves.
 */
export function TrackingMap({ origin, dest, at, height = 240, label, hideExpert, route, footer }: Props) {
  const { c } = useTheme();
  const map = useRef<MapView>(null);
  const expert = at ?? origin;
  const estimate = useMemo(() => routePoints(expert, dest, 16).map(toRN), [expert, dest]);
  const road = useMemo(() => (route && route.length > 1 ? route.map(toRN) : null), [route]);

  const close = hideExpert || distanceM(expert, dest) < 250;

  // Keep both pins in view; when they are on top of each other, hold a street-level zoom instead of diving in.
  useEffect(() => {
    if (close) map.current?.animateToRegion({ ...toRN(dest), latitudeDelta: 0.006, longitudeDelta: 0.006 }, 500);
    else map.current?.fitToCoordinates(road ?? [toRN(expert), toRN(dest)], { edgePadding: { top: 64, right: 56, bottom: footer ? 76 : 56, left: 56 }, animated: true });
  }, [expert.lat, expert.lng, dest.lat, dest.lng, close, road?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ height, borderRadius: 28, overflow: 'hidden' }}>
      {webMaps ? (
        <WebMap view={close ? { center: dest, zoom: 16 } : { fit: road ? road.map((p) => ({ lat: p.latitude, lng: p.longitude })) : [expert, dest], pad: 56 }} lines={close ? [] : [{ points: (road ?? estimate).map((p) => ({ lat: p.latitude, lng: p.longitude })), color: c.brand, width: road ? 5 : 4, dashed: !road }]} markers={[{ id: 'dest', at: dest, bg: c.hero, border: '#FFFFFF', icon: 'home', size: 34, title: 'Your address' }, ...(!hideExpert ? [{ id: 'expert', at: close ? { lat: dest.lat + 0.00022, lng: dest.lng + 0.00032 } : expert, bg: c.brand, border: '#FFFFFF', icon: 'go' as const, size: 34, title: 'Expert' }] : [])]} />
      ) : (
        <MapView
          ref={map}
          style={{ flex: 1 }}
          initialRegion={{ ...toRN(dest), latitudeDelta: 0.03, longitudeDelta: 0.03 }}
          showsCompass={false}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}>
          {!close && road ? <Polyline coordinates={road} strokeColor={c.brand} strokeWidth={5} /> : null}
          {!close && !road ? <Polyline coordinates={estimate} strokeColor={c.brand} strokeWidth={4} lineDashPattern={[1, 8]} /> : null}
          <Marker coordinate={toRN(dest)} anchor={{ x: 0.5, y: 0.5 }} title="Your address">
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.hero, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
              <Home size={15} color="#FFFFFF" />
            </View>
          </Marker>
          {!hideExpert ? <Marker key={close ? 'expert-close' : 'expert'} coordinate={close ? { latitude: dest.lat + 0.00022, longitude: dest.lng + 0.00032 } : toRN(expert)} anchor={{ x: 0.5, y: 0.5 }} title="Expert">
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
              <Navigation size={15} color="#FFFFFF" />
            </View>
          </Marker> : null}
        </MapView>
      )}
      {label ? (
        <View style={{ position: 'absolute', left: 12, top: 12, backgroundColor: c.hero, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
          <Text className="font-jkb text-[12px] text-white">{label}</Text>
        </View>
      ) : null}
      {footer ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: 'rgba(255,255,255,0.96)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16 }}>
          <Text className="font-jkb text-[12.5px] text-ink" numberOfLines={1}>{footer}</Text>
        </View>
      ) : null}
    </View>
  );
}
