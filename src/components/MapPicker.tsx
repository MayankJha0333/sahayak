import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { MapPin, Navigation } from './icons';
import { WebMap, webMaps, type WebMapHandle } from './WebMap';
import type { LatLng } from '@/lib/geo';
import { inIndia } from '@/lib/areas';
import { useTheme } from '@/theme';

type Props = { value: LatLng; onChange: (at: LatLng, place?: string) => void; height?: number; /** Jump to her location on open (off when editing a saved point). */ autoLocate?: boolean };

/** Why "use my location" did not work, so the pill can say what to do about it. */
type Issue = 'denied' | 'blocked' | 'gps' | 'slow' | 'outside';
const ISSUE: Record<Issue, string> = {
  denied: 'Allow location to find you — tap to try again',
  blocked: 'Location permission is off — tap to open Settings',
  gps: 'Turn on location (GPS) on your phone, then tap here',
  slow: 'Could not find you — drag the map to your door',
  outside: 'You seem to be outside India — drag the map to your door',
};

const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]).catch(() => null);

/** Drop-the-pin address picker: the pin stays centred, the map moves underneath, like every delivery app. */
export function MapPicker({ value, onChange, height = 300, autoLocate = true }: Props) {
  const { c } = useTheme();
  const map = useRef<MapView>(null);
  const web = useRef<WebMapHandle>(null);
  const [locating, setLocating] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [start] = useState(value);

  const settle = async (at: LatLng) => {
    let place: string | undefined;
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude: at.lat, longitude: at.lng });
      if (g) {
        // Geocoders often repeat the area ("56, Sector 52" + "Sector 52"); keep each part once.
        const parts: string[] = [];
        for (const p of [g.name || g.street, g.district || g.subregion, g.city]) {
          if (p && !parts.some((q) => q.toLowerCase().includes(p.toLowerCase()))) parts.push(p);
        }
        place = parts.join(', ');
      }
    } catch { /* geocoder unavailable: keep the coordinates */ }
    onChange(at, place);
  };

  const jump = (coords: { latitude: number; longitude: number }) => {
    const at = { lat: coords.latitude, lng: coords.longitude };
    // Outside India (a simulator parked in California, say): stay put instead of flying away.
    if (!inIndia(at)) { setIssue('outside'); return false; }
    setIssue(null);
    setMe(at);
    if (webMaps) web.current?.flyTo(at, 17);
    else map.current?.animateToRegion({ latitude: at.lat, longitude: at.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 500);
    return true;
  };

  const locate = async () => {
    setLocating(true);
    try {
      // Phone location switched off: Android can show its own "turn on location" box.
      if (!(await Location.hasServicesEnabledAsync())) {
        if (Platform.OS === 'android') { try { await Location.enableNetworkProviderAsync(); } catch { setIssue('gps'); return; } }
        else { setIssue('gps'); return; }
      }
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setIssue(perm.canAskAgain ? 'denied' : 'blocked'); return; }
      // A recent fix shows up instantly; the fresh one follows (and can take a while indoors).
      const quick = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
      const jumped = quick ? jump(quick.coords) : false;
      const fresh = await within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 15_000);
      if (fresh) jump(fresh.coords);
      else if (!jumped) setIssue('slow');
    } catch { setIssue('slow'); }
    finally { setLocating(false); }
  };

  useEffect(() => {
    // Next tick, so the screen paints before the permission box shows.
    const t = autoLocate ? setTimeout(() => void locate(), 0) : undefined;
    void settle(value);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onIssue = () => {
    if (issue === 'blocked') void Linking.openSettings();
    else if (issue !== 'outside' && issue !== 'slow') void locate();
    else setIssue(null);
  };

  return (
    <View style={{ height, borderRadius: 28, overflow: 'hidden' }}>
      {webMaps ? (
        <WebMap ref={web} view={{ center: start, zoom: 16 }} onMoveEnd={(at) => void settle(at)}
          markers={me ? [{ id: 'me', at: me, bg: '#2F7BF6', border: '#FFFFFF', icon: 'dot', size: 18 }] : []} />
      ) : (
        <MapView
          ref={map}
          style={{ flex: 1 }}
          initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          onRegionChangeComplete={(r: Region) => void settle({ lat: r.latitude, lng: r.longitude })}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        />
      )}
      {/* Centre pin: offset up by half its height so the tip marks the point. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ marginTop: -34, alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
            <MapPin size={18} color="#FFFFFF" />
          </View>
          <View style={{ width: 3, height: 14, backgroundColor: c.brand, borderRadius: 2 }} />
          <View style={{ width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.25)', marginTop: 2 }} />
        </View>
      </View>
      <Pressable onPress={locate} accessibilityRole="button" accessibilityLabel="Use my location"
        style={{ position: 'absolute', right: 12, bottom: 12, width: 42, height: 42, borderRadius: 21, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line }}>
        {locating ? <ActivityIndicator size="small" color={c.brand} /> : <Navigation size={18} color={c.ink} />}
      </Pressable>
      {issue ? (
        <View style={{ position: 'absolute', left: 12, right: 64, top: 12, alignItems: 'flex-start' }}>
          <Pressable onPress={onIssue} accessibilityRole="button" style={{ backgroundColor: c.hero, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
            <Text className="font-jkm text-[11.5px] text-white">{ISSUE[issue]}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
