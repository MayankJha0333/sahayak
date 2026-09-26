import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Home, User } from './icons';
import { WebMap, webMaps } from './WebMap';
import type { LatLng } from '@/lib/geo';
import { useTheme } from '@/theme';

export type OpsPartner = { id: string; name: string; at: LatLng; state: 'free' | 'busy' | 'offline' };
export type OpsJob = { id: string; at: LatLng; partnerAt?: LatLng; state: 'matching' | 'riding' | 'on_site' };
type Props = { partners: OpsPartner[]; jobs: OpsJob[]; center: LatLng; height?: number };

const toRN = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/** The whole city at a glance: every expert and every live job, on a real map. */
export function OpsMap({ partners, jobs, center, height = 300 }: Props) {
  const { c } = useTheme();
  const map = useRef<MapView>(null);
  const tone = { free: c.ok, busy: c.brand, offline: c.ink3 } as const;
  const points = [...partners.filter((p) => p.state !== 'offline').map((p) => p.at), ...jobs.map((j) => j.at)];
  const key = points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|');

  useEffect(() => {
    if (points.length > 1) map.current?.fitToCoordinates(points.map(toRN), { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ gap: 8 }}>
      <View style={{ height, borderRadius: 20, overflow: 'hidden' }}>
        {webMaps ? (
          <WebMap view={points.length > 1 ? { fit: points, pad: 40, maxZoom: 15 } : { center, zoom: 12 }} lines={jobs.filter((j) => j.partnerAt && j.state === 'riding').map((j) => ({ points: [j.partnerAt!, j.at], color: c.brand, width: 3, dashed: true }))} markers={[...jobs.map((j) => ({ id: `j-${j.id}`, at: j.at, bg: j.state === 'matching' ? c.warn : c.hero, border: '#FFFFFF', icon: 'home' as const, size: 30, title: j.id, sub: j.state === 'matching' ? 'Looking for an expert' : j.state === 'riding' ? 'Expert on the way' : 'Expert at work' })), ...partners.map((p) => ({ id: `p-${p.id}`, at: p.at, bg: '#FFFFFF', border: tone[p.state], icon: 'user' as const, fg: tone[p.state], size: 24, title: p.name, sub: p.state === 'free' ? 'Online, free' : p.state === 'busy' ? 'On a job' : 'Offline' }))]} />
        ) : (
          <MapView ref={map} style={{ flex: 1 }} initialRegion={{ ...toRN(center), latitudeDelta: 0.08, longitudeDelta: 0.08 }}
            showsCompass={false} toolbarEnabled={false} pitchEnabled={false} rotateEnabled={false}>
            {jobs.map((j) => (j.partnerAt && j.state === 'riding' ? (
              <Polyline key={`r-${j.id}`} coordinates={[toRN(j.partnerAt), toRN(j.at)]} strokeColor={c.brand} strokeWidth={3} lineDashPattern={[6, 6]} />
            ) : null))}
            {jobs.map((j) => (
              <Marker key={`j-${j.id}`} coordinate={toRN(j.at)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title={j.id}
                description={j.state === 'matching' ? 'Looking for an expert' : j.state === 'riding' ? 'Expert on the way' : 'Expert at work'}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: j.state === 'matching' ? c.warn : c.hero, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
                  <Home size={13} color="#FFFFFF" />
                </View>
              </Marker>
            ))}
            {partners.map((p) => (
              <Marker key={`p-${p.id}`} coordinate={toRN(p.at)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title={p.name}
                description={p.state === 'free' ? 'Online, free' : p.state === 'busy' ? 'On a job' : 'Offline'}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: tone[p.state] }}>
                  <User size={12} color={tone[p.state]} />
                </View>
              </Marker>
            ))}
          </MapView>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[
          { label: 'Free expert', color: c.ok },
          { label: 'On a job', color: c.brand },
          { label: 'Offline', color: c.ink3 },
          { label: 'Job being matched', color: c.warn },
          { label: 'Live job', color: c.hero },
        ].map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.color }} />
            <Text className="font-jk text-[11.5px] text-ink2 dark:text-ink2-dark">{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
