import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { MapPicker } from '@/components/MapPicker';
import { AppBar, Btn, Card, Chip, Eyebrow, Note, Screen, Tiny } from '@/components/ui';
import { saveAddress } from '@/lib/api';
import { useServiceArea } from '@/lib/areas';
import { useAuth } from '@/lib/auth';
import type { LatLng } from '@/lib/geo';
import { HOME } from '@/lib/mock';
import { useTheme } from '@/theme';
import { AreaStatus, useWaitlistJoin } from '@/components/NotServed';

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
  const { served, loading: areasLoading } = useServiceArea();
  // Outside every live area: the main button becomes "Join the waitlist"; saving is still possible for later.
  const outside = !areasLoading && !served(at);
  const wl = useWaitlistJoin(at, [line1.trim(), line2.trim()].filter(Boolean).join(', '), line2.split(',').pop()?.trim());
  // An address we serve needs the flat number (the expert rides there). One we don't serve yet only needs the area.
  const hasArea = line2.trim().length > 2;
  const hasFlat = line1.trim().length > 1;
  const ok = hasArea && (outside || hasFlat);
  const [tried, setTried] = useState(false);

  const save = async () => {
    setTried(true);
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      const id = existing?.id ?? `a${Date.now().toString(36)}`;
      // A new address becomes the one the app uses, so Home shows the right thing (bookings, or "coming soon").
      await saveAddress({ id, label, line1: line1.trim(), line2: line2.trim(), directions: directions.trim(), at }, !existing);
      // Not served yet: show the full coming-soon page for this address instead of dropping her back home.
      if (outside) router.replace({ pathname: '/customer/coming-soon', params: { id } });
      else router.back();
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
      <Screen footer={(
        <>
          {tried && !ok ? (
            <Text className="font-jkm text-center text-[12.5px] text-crit dark:text-crit-dark">
              {!hasArea ? 'Add the building and area to save' : 'Add your flat / house number to save'}
            </Text>
          ) : null}
          <Btn title={existing || outside ? 'Save address' : 'Save and use this address'} busy={busy} onPress={save} />
        </>
      )}>
        <MapPicker value={at} onChange={(p, place) => { setAt(p);  if (place && !existing) setLine2(place); }} height={300} />
        <AreaStatus at={at} />
        {/* Not served yet: saving still works; the waitlist is one tap away here and on the home screen. */}
        {outside ? (wl.onList
          ? <Note tone="ok">You are on the waitlist for this address. We will message you when we start here.</Note>
          : <Btn title="Join the waitlist" size="sm" tone="secondary" busy={wl.busy} onPress={wl.join} />) : null}
        <Tiny>Move the map until the pin sits on your building. The expert rides to this exact point.</Tiny>

        <Card>
          <Eyebrow>Save as</Eyebrow>
          <View className="flex-row flex-wrap gap-2">{LABELS.map((l) => <Chip key={l} label={l} on={label === l} onPress={() => setLabel(l)} />)}</View>
          <Eyebrow>{outside ? 'Flat / house number (optional for now)' : 'Flat / house number'}</Eyebrow>
          {field({ value: line1, onChangeText: setLine1, placeholder: 'B-1204, Tower B', accessibilityLabel: 'Flat or house number' })}
          <Eyebrow>Building and area</Eyebrow>
          {field({ value: line2, onChangeText: setLine2, placeholder: 'Palm Grove Residency, Sector 52', accessibilityLabel: 'Building and area' })}
          <Eyebrow>Directions for the expert (optional)</Eyebrow>
          {field({ value: directions, onChangeText: setDirections, placeholder: 'Gate 2, tell the guard "Sahayak". Lift on the right.', accessibilityLabel: 'Directions', multiline: true })}
        </Card>
        {err ? <Note tone="crit">{err}</Note> : null}
        {outside && wl.err ? <Note tone="crit">{wl.err}</Note> : null}
        <Text className="font-jk text-center text-[11px] text-ink3 dark:text-ink3-dark">Your address is shown to the expert only after she accepts the job.</Text>
      </Screen>
    </View>
  );
}
