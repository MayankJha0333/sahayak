import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { Home, Navigation, User } from './icons';
import { WebMap, webMaps } from './WebMap';
import type { LatLng } from '@/lib/geo';
import { useTheme } from '@/theme';

type Props = { at: LatLng; radiusM: number; experts: { id: string; at: LatLng }[]; height?: number; label?: string; center?: 'home' | 'you' };

const toRN = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });
/** Corners of the box around the search ring, so the web map frames the whole ring. */
const ringBox = (p: LatLng, m: number) => {
  const dLat = m / 111_000, dLng = dLat / Math.cos((p.lat * Math.PI) / 180);
  return [{ lat: p.lat - dLat, lng: p.lng - dLng }, { lat: p.lat + dLat, lng: p.lng + dLng }];
};

/** The customer's pin with the current search ring and every expert online around it. */
export function SearchMap({ at, radiusM, experts, height = 220, label, center = 'home' }: Props) {
  const { c } = useTheme();
  const map = useRef<MapView>(null);
  const span = Math.max(0.012, (radiusM / 111_000) * 2.6);

  useEffect(() => {
    map.current?.animateToRegion({ ...toRN(at), latitudeDelta: span, longitudeDelta: span }, 500);
  }, [at.lat, at.lng, span]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ height, borderRadius: 28, overflow: 'hidden' }}>
      {webMaps ? (
        <WebMap interactive={false} view={{ fit: ringBox(at, radiusM), pad: 12 }} circles={[{ center: at, radiusM, color: c.brand }]} markers={[...experts.map((e) => ({ id: e.id, at: e.at, bg: '#FFFFFF', border: c.brand, icon: 'user' as const, fg: c.brand, size: 26 })), { id: 'center', at, bg: center === 'you' ? c.brand : c.hero, border: '#FFFFFF', icon: center === 'you' ? 'go' as const : 'home' as const, size: 34 }]} />
      ) : (
        <MapView ref={map} style={{ flex: 1 }} initialRegion={{ ...toRN(at), latitudeDelta: span, longitudeDelta: span }}
          showsCompass={false} toolbarEnabled={false} pitchEnabled={false} rotateEnabled={false} scrollEnabled={false} zoomEnabled={false}>
          <Circle center={toRN(at)} radius={radiusM} strokeColor={c.brand} strokeWidth={1.5} fillColor="rgba(238,90,64,0.12)" />
          {experts.map((e) => (
            <Marker key={e.id} coordinate={toRN(e.at)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.brand }}>
                <User size={13} color={c.brand} />
              </View>
            </Marker>
          ))}
          <Marker coordinate={toRN(at)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: center === 'you' ? c.brand : c.hero, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
              {center === 'you' ? <Navigation size={15} color="#FFFFFF" /> : <Home size={15} color="#FFFFFF" />}
            </View>
          </Marker>
        </MapView>
      )}
      {label ? (
        <View style={{ position: 'absolute', left: 12, top: 12, backgroundColor: c.hero, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
          <Text className="font-jkb text-[12px] text-white">{label}</Text>
        </View>
      ) : null}
    </View>
  );
}
