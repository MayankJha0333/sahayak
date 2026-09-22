import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { MapPicker } from '@/components/MapPicker';
import { AppBar, Btn, Card, Chip, Eyebrow, Note, Screen, Tiny } from '@/components/ui';
import { saveAddress } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { LatLng } from '@/lib/geo';
import { HOME } from '@/lib/mock';
import { inServiceArea } from '@/lib/useLiveLocation';
import { useTheme } from '@/theme';

const LABELS = ['Home', 'Parents', 'Office', 'Other'];

/** Add or edit an address: pin on the map, flat number, gate directions. Saved on the profile. */
export default function AddressScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const { profile } = useAuth();
  const existing = profile?.addresses.find((a) => a.id === id);

  const [at, setAt] = useState<LatLng>(existing?.at ?? profile?.addresses[0]?.at ?? HOME);
  const [label, setLabel] = useState(existing?.label ?? (profile?.addresses.length ? 'Other' : 'Home'));
  const [line1, setLine1] = useState(existing?.line1 ?? '');
  const [line2, setLine2] = useState(existing?.line2 ?? '');
  const [directions, setDirections] = useState(existing?.directions ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = line1.trim().length > 1 && line2.trim().length > 2;

  const save = async () => {
    if (!inServiceArea(at)) { setErr('We only serve Gurugram for now. Move the pin to an address in the city.'); return; }
    setBusy(true); setErr('');
    try {
      await saveAddress({ id: existing?.id ?? `a${Date.now().toString(36)}`, label, line1: line1.trim(), line2: line2.trim(), directions: directions.trim(), at }, !existing && !profile?.addresses.length);
      router.back();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const field = (props: React.ComponentProps<typeof TextInput>) => (
    <TextInput placeholderTextColor={c.ink3} {...props}
      className="font-jk rounded-2xl bg-sunk px-4 py-3.5 text-[15px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
  );

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title={existing ? 'Edit address' : 'Where should she come?'} subtitle="Drop the pin on your gate" back />
      <Screen footer={<Btn title={existing ? 'Save address' : 'Save and use this address'} busy={busy} disabled={!ok} onPress={save} />}>
        <MapPicker value={at} onChange={(p, place) => { setAt(p); if (place && !existing) setLine2(place); }} height={300} />
        <Tiny>Move the map until the pin sits on your building. The expert rides to this exact point.</Tiny>

        <Card>
          <Eyebrow>Save as</Eyebrow>
          <View className="flex-row flex-wrap gap-2">{LABELS.map((l) => <Chip key={l} label={l} on={label === l} onPress={() => setLabel(l)} />)}</View>
          <Eyebrow>Flat / house number</Eyebrow>
          {field({ value: line1, onChangeText: setLine1, placeholder: 'B-1204, Tower B', accessibilityLabel: 'Flat or house number' })}
          <Eyebrow>Building and area</Eyebrow>
          {field({ value: line2, onChangeText: setLine2, placeholder: 'Palm Grove Residency, Sector 52', accessibilityLabel: 'Building and area' })}
          <Eyebrow>Directions for the expert (optional)</Eyebrow>
          {field({ value: directions, onChangeText: setDirections, placeholder: 'Gate 2, tell the guard "Sahayak". Lift on the right.', accessibilityLabel: 'Directions', multiline: true })}
        </Card>
        {err ? <Note tone="crit">{err}</Note> : null}
        <Text className="font-jk text-center text-[11px] text-ink3 dark:text-ink3-dark">Your address is shown to the expert only after she accepts the job.</Text>
      </Screen>
    </View>
  );
}
