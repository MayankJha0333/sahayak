import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { MapPin, Navigation } from './icons';
import type { LatLng } from '@/lib/geo';
import { inServiceArea } from '@/lib/useLiveLocation';
import { useTheme } from '@/theme';

type Props = { value: LatLng; onChange: (at: LatLng, place?: string) => void; height?: number };

/** Drop-the-pin address picker: the pin stays centred, the map moves underneath, like every delivery app. */
export function MapPicker({ value, onChange, height = 300 }: Props) {
  const { c } = useTheme();
  const map = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [outside, setOutside] = useState(false);

  const settle = async (r: Region) => {
    const at = { lat: r.latitude, lng: r.longitude };
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

  const locate = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setDenied(true); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // Outside the service area (or a simulator parked in California): stay on the city instead of flying away.
      if (!inServiceArea({ lat: pos.coords.latitude, lng: pos.coords.longitude })) { setOutside(true); return; }
      setOutside(false);
      map.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 500);
    } catch { setDenied(true); }
    finally { setLocating(false); }
  };

  useEffect(() => {
    void locate();
    void settle({ latitude: value.lat, longitude: value.lng, latitudeDelta: 0, longitudeDelta: 0 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ height, borderRadius: 28, overflow: 'hidden' }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={{ latitude: value.lat, longitude: value.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        onRegionChangeComplete={settle}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      />
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
      {denied || outside ? (
        <View style={{ position: 'absolute', left: 12, right: 64, top: 12, alignItems: 'flex-start' }}>
          <View style={{ backgroundColor: c.hero, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
            <Text className="font-jkm text-[11.5px] text-white">{outside ? 'You seem to be outside Gurugram — drag the map to your door' : 'Location is off — drag the map to your door'}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
