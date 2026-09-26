import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { Panel } from '@/components/admin';
import { MapPicker } from '@/components/MapPicker';
import { Badge, Btn, Chip, Note, Tiny, Title } from '@/components/ui';
import { deleteArea, saveArea } from '@/lib/api';
import { areaStatus, insideArea, isBorder, type AreaShape, type AreaStatus } from '@/lib/areaGeo';
import { useAllBookings, useAllPartners, useAllWaitlist, useAreas } from '@/lib/db';
import type { LatLng } from '@/lib/geo';
import { INDIA_STATES, LEVEL_LABEL, borderOf, districtsOf, placesIn, searchPlaces, type Place } from '@/lib/osm';
import type { Area, WithId } from '@/lib/types';
import { useTheme } from '@/theme';

type Load<T> = { loading: boolean; data: T | null; error: string };
const IDLE = { loading: false, data: null, error: '' };

/** Loads `fn()` whenever `key` changes (null = nothing), keeping only the latest answer. */
function useLoad<T>(key: string | null, fn: () => Promise<T>): Load<T> {
  const [s, setS] = useState<{ key: string | null; data: T | null; error: string }>({ key: null, data: null, error: '' });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    fn().then((data) => { if (live) setS({ key, data, error: '' }); }, (e: Error) => { if (live) setS({ key, data: null, error: e.message }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === null) return IDLE;
  if (s.key !== key) return { loading: true, data: null, error: '' };
  return { loading: false, data: s.data, error: s.error };
}

const DAY = 86_400_000;
/** Launch dates start at 8 AM, when experts start work. */
const at8 = (ms: number) => { const d = new Date(ms); d.setHours(8, 0, 0, 0); return d.getTime(); };
const niceDay = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const SOON_OPTIONS = [{ label: 'In 1 week', ms: 7 * DAY }, { label: 'In 2 weeks', ms: 14 * DAY }, { label: 'In 1 month', ms: 30 * DAY }];
type Launch = { status: AreaStatus; opensAt: number };
const launchFields = (l: Launch) => ({ active: l.status === 'live', opensAt: l.status === 'soon' ? l.opensAt : null });

/** Live now / Coming soon (+ date) / Paused. */
function StatusChips({ value, onChange }: { value: Launch; onChange: (l: Launch) => void }) {
  const [now] = useState(() => Date.now());
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <Chip label="Live now" on={value.status === 'live'} onPress={() => onChange({ ...value, status: 'live' })} />
        <Chip label={value.status === 'soon' ? `Coming soon · ${niceDay(value.opensAt)}` : 'Coming soon'} on={value.status === 'soon'} onPress={() => onChange({ ...value, status: 'soon' })} />
        <Chip label="Paused" on={value.status === 'paused'} onPress={() => onChange({ ...value, status: 'paused' })} />
      </View>
      {value.status === 'soon' ? (
        <View className="flex-row flex-wrap gap-2">
          {SOON_OPTIONS.map((o) => <Chip key={o.label} label={o.label} on={niceDay(value.opensAt) === niceDay(at8(now + o.ms))} onPress={() => onChange({ status: 'soon', opensAt: at8(now + o.ms) })} />)}
        </View>
      ) : null}
    </View>
  );
}

type Draft = { id: string | null; name: string; place: string; state: string; center: LatLng; radiusKm: number; border: Place | null; useBorder: boolean; savedBorder?: AreaShape; launch: Launch; createdAt?: number };
const RADII = [0.5, 1, 2, 3, 5, 8, 12, 20];

/** Where customers can book: search a colony, road or city and set a pin with a range, or pick a district's real border. */
export default function AdminAreas() {
  const { c } = useTheme();
  const { rows: areas } = useAreas();
  const { rows: partners } = useAllPartners();
  const { rows: bookings } = useAllBookings();
  const { rows: waitlist } = useAllWaitlist();
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'search' | 'browse'>('search');
  const [stateId, setStateId] = useState<number | null>(null);
  const [district, setDistrict] = useState<Place | null>(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [retry, setRetry] = useState(0);
  const [now] = useState(() => Date.now());
  const nextWeek = at8(now + 7 * DAY);
  const state = INDIA_STATES.find((s) => s.osmId === stateId) ?? null;

  const districts = useLoad(stateId === null ? null : `d${stateId}:${retry}`, () => districtsOf(stateId!));
  const subs = useLoad(district ? `s${district.osmId}:${retry}` : null, () => placesIn(district!.osmId));
  const results = useLoad(query.length >= 3 ? `${query}:${retry}` : null, () => searchPlaces(query));
  const needBorder = draft?.useBorder && draft.border && !draft.savedBorder ? draft.border : null;
  const border = useLoad(needBorder ? `b${needBorder.osmId}:${retry}` : null, () => borderOf(needBorder!));
  const shape: AreaShape | null = !draft ? null : draft.useBorder ? draft.savedBorder ?? border.data : { center: draft.center, radiusKm: draft.radiusKm, shape: 'circle' };

  const count = (a: AreaShape) => ({
    experts: partners.filter((p) => !p.bot && insideArea(a, p.at)).length,
    waiting: waitlist.filter((w) => w.status === 'waiting' && insideArea(a, w.at)).length,
    booked: bookings.filter((b) => b.address?.at && insideArea(a, b.address.at)).length,
  });
  const counts = useMemo(() => new Map(areas.map((a) => [a.id, count(a)])), [areas, partners, waitlist, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

  const blankLaunch = (): Launch => ({ status: 'live', opensAt: nextWeek });
  const stateOf = (hint = '') => INDIA_STATES.find((s) => hint.includes(s.name))?.name ?? '';
  const fromSearch = (p: Place) => setDraft({ id: null, name: p.name, place: p.hint ?? '', state: p.state ?? stateOf(p.hint), center: p.center!, radiusKm: p.suggestKm ?? 2, border: p.osmType === 'relation' ? p : null, useBorder: false, launch: blankLaunch() });
  const fromBorder = (p: Place, stateName: string) => setDraft({ id: null, name: p.name, place: stateName, state: stateName, center: p.center ?? { lat: 28.44, lng: 77.07 }, radiusKm: 5, border: p, useBorder: true, launch: blankLaunch() });
  const edit = (a: WithId<Area>) => {
    setAdding(true); setMsg('');
    setDraft({
      id: a.id, name: a.name, place: a.place ?? a.state ?? '', state: a.state ?? '', center: a.center, radiusKm: a.radiusKm,
      border: a.osmId ? { osmId: a.osmId, name: a.name, level: a.level ?? 'place', osmType: 'relation' } : null, useBorder: isBorder(a),
      savedBorder: isBorder(a) ? { shape: 'border', border: a.border, bbox: a.bbox, center: a.center, radiusKm: a.radiusKm } : undefined,
      launch: { status: areaStatus(a), opensAt: a.opensAt ?? nextWeek }, createdAt: a.createdAt,
    });
  };
  const close = () => { setDraft(null); setAdding(false); setStateId(null); setDistrict(null); setQ(''); setQuery(''); setErr(''); };

  const save = async () => {
    if (!draft || !shape) return;
    if (draft.name.trim().length < 2) { setErr('Give the area a name customers will recognise.'); return; }
    setBusy(true); setErr('');
    try {
      const id = draft.id ?? (draft.useBorder && draft.border ? `osm-${draft.border.osmId}` : `pin-${Date.now().toString(36)}`);
      const geo = draft.useBorder
        ? { shape: 'border' as const, border: shape.border, bbox: shape.bbox, center: shape.center, radiusKm: shape.radiusKm }
        : { shape: 'circle' as const, center: draft.center, radiusKm: draft.radiusKm };
      await saveArea(id, {
        name: draft.name.trim(), city: draft.place.split(',')[0]?.trim() || draft.name.trim(), state: draft.state, place: draft.place,
        level: draft.useBorder ? draft.border?.level ?? 'place' : 'place', ...(draft.useBorder && draft.border ? { osmId: draft.border.osmId } : {}),
        ...geo, ...launchFields(draft.launch), createdAt: draft.createdAt,
      });
      const l = draft.launch;
      setMsg(`${draft.name.trim()} ${l.status === 'live' ? 'is live.' : l.status === 'soon' ? `opens on ${niceDay(l.opensAt)}.` : 'is saved, paused.'}`);
      close();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const input = (value: string, onChangeText: (t: string) => void, placeholder: string, onSubmit?: () => void) => (
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.ink3} onSubmitEditing={onSubmit} returnKeyType={onSubmit ? 'search' : 'done'}
      className="font-jk rounded-xl bg-sunk px-3 py-2.5 text-[13px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
  );
  const loading = <View className="flex-row items-center gap-2 py-2"><ActivityIndicator color={c.brand} /><Tiny>Loading from OpenStreetMap…</Tiny></View>;
  const failed = (e: string) => (
    <View className="gap-2"><Text className="font-jkm text-[12.5px] text-crit dark:text-crit-dark">{e}</Text><Btn title="Try again" size="sm" tone="secondary" onPress={() => setRetry((r) => r + 1)} /></View>
  );
  const districtList = (districts.data ?? []).filter((d) => !filter || d.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View className="flex-row items-center justify-between">
        <Title>Service areas</Title>
        <Btn title={adding ? 'Close' : 'Add area'} size="sm" tone={adding ? 'secondary' : 'primary'} onPress={() => { if (adding) close(); else { setAdding(true); setMsg(''); } }} />
      </View>
      {msg ? <Note tone="ok">{msg}</Note> : null}
      {areas.length === 0 ? <Note>No areas yet, so the app serves all of Gurugram (40 km). Add a colony, city or district to control exactly where bookings are allowed.</Note> : null}

      {adding && draft ? (
        <Panel title={draft.id ? 'Edit area' : 'New area'} wide>
          {input(draft.name, (t) => setDraft({ ...draft, name: t }), 'Area name customers see')}
          {draft.place ? <Tiny>{draft.place}</Tiny> : null}
          {draft.border ? (
            <View className="flex-row gap-2">
              <Chip label="Pin + range" on={!draft.useBorder} onPress={() => setDraft({ ...draft, useBorder: false, savedBorder: undefined })} />
              <Chip label="Exact border" on={draft.useBorder} onPress={() => setDraft({ ...draft, useBorder: true })} />
            </View>
          ) : null}
          {!draft.useBorder ? (
            <>
              <Tiny>Move the map so the pin sits on the centre of the area.</Tiny>
              <MapPicker key={`${draft.id ?? ''}${draft.name}`} autoLocate={false} value={draft.center} onChange={(p) => setDraft((d) => (d ? { ...d, center: p } : d))} height={240} />
              <Tiny>Range: {draft.radiusKm} km around the pin</Tiny>
              <View className="flex-row flex-wrap gap-2">{RADII.map((r) => <Chip key={r} label={`${r} km`} on={draft.radiusKm === r} onPress={() => setDraft({ ...draft, radiusKm: r })} />)}</View>
            </>
          ) : border.loading ? loading : border.error ? failed(border.error) : null}
          {shape ? (() => { const n = count(shape); return <Tiny>Inside it today: {n.waiting} waiting customers · {n.experts} experts · {n.booked} past bookings.</Tiny>; })() : null}
          <Tiny>Status</Tiny>
          <StatusChips value={draft.launch} onChange={(launch) => setDraft({ ...draft, launch })} />
          {draft.launch.status === 'soon' ? <Tiny>Customers inside see the date and can join the waitlist. Bookings open by themselves that morning.</Tiny> : null}
          {err ? <Text className="font-jkm text-[12.5px] text-crit dark:text-crit-dark">{err}</Text> : null}
          <View className="flex-row gap-2">
            <View className="flex-1"><Btn title={draft.id ? 'Save changes' : 'Add area'} busy={busy} disabled={!shape} onPress={save} /></View>
            <View className="flex-1"><Btn title="Back" tone="secondary" disabled={busy} onPress={() => (draft.id ? close() : setDraft(null))} /></View>
          </View>
        </Panel>
      ) : adding ? (
        <Panel title="Add a service area" wide>
          <View className="flex-row gap-2">
            <Chip label="Search a place" on={mode === 'search'} onPress={() => setMode('search')} />
            <Chip label="By state" on={mode === 'browse'} onPress={() => setMode('browse')} />
          </View>
          {mode === 'search' ? (
            <>
              {input(q, setQ, 'Patel Nagar, MG Road, Sector 52…', () => setQuery(q.trim()))}
              <Btn title="Find" size="sm" disabled={q.trim().length < 3} onPress={() => setQuery(q.trim())} />
              {results.loading ? loading : null}
              {results.error ? failed(results.error) : null}
              {results.data?.map((p) => (
                <Chip key={`${p.osmType}${p.osmId}`} label={`${p.name} · ${p.kind} · ${p.hint}`} onPress={() => fromSearch(p)} />
              ))}
              {results.data && !results.data.length ? <Tiny>No place by that name. Try adding the city.</Tiny> : null}
            </>
          ) : (
            <>
              <Tiny>1 · State</Tiny>
              {state ? <View className="flex-row items-center gap-2"><Chip label={state.name} on onPress={() => { setStateId(null); setDistrict(null); }} /><Tiny>Tap to change</Tiny></View> : (
                <>
                  {input(filter, setFilter, 'Filter states')}
                  <View className="flex-row flex-wrap gap-2">{INDIA_STATES.filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase())).map((s) => <Chip key={s.osmId} label={s.name} onPress={() => { setStateId(s.osmId); setFilter(''); }} />)}</View>
                </>
              )}
              {state ? (
                <>
                  <Tiny>2 · District</Tiny>
                  {districts.loading ? loading : null}
                  {districts.error ? failed(districts.error) : null}
                  {districts.data && !district ? (
                    <>
                      {districts.data.length > 8 ? input(filter, setFilter, `Filter ${districts.data.length} districts`) : null}
                      <View className="flex-row flex-wrap gap-2">
                        <Chip label={`Whole of ${state.name}`} onPress={() => fromBorder(state, state.name)} />
                        {districtList.map((d) => <Chip key={d.osmId} label={areas.some((a) => a.osmId === d.osmId) ? `${d.name} ✓` : d.name} onPress={() => { setDistrict(d); setFilter(''); }} />)}
                      </View>
                    </>
                  ) : null}
                  {district ? <View className="flex-row items-center gap-2"><Chip label={district.name} on onPress={() => setDistrict(null)} /><Tiny>Tap to change</Tiny></View> : null}
                </>
              ) : null}
              {district && state ? (
                <>
                  <Tiny>3 · Which part?</Tiny>
                  {subs.loading ? loading : null}
                  {subs.error ? failed(subs.error) : null}
                  <View className="flex-row flex-wrap gap-2">
                    <Chip label={`Whole ${district.name} district`} onPress={() => fromBorder(district, state.name)} />
                    {(subs.data ?? []).map((p) => <Chip key={p.osmId} label={p.name} onPress={() => fromBorder(p, state.name)} />)}
                  </View>
                </>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      {areas.map((a) => {
        const n = counts.get(a.id);
        const st = areaStatus(a);
        return (
          <Panel key={a.id} title={`${isBorder(a) ? `Border · ${LEVEL_LABEL[a.level ?? 'place']}` : `Pin · ${a.radiusKm} km`}${a.state ? ` · ${a.state}` : ''}`} wide>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="font-jkb text-[15px] text-ink dark:text-ink-dark">{a.name}</Text>
                <Tiny>{n?.experts ?? 0} expert{n?.experts === 1 ? '' : 's'} · {n?.booked ?? 0} recent booking{n?.booked === 1 ? '' : 's'}{n?.waiting ? ` · ${n.waiting} waiting inside it` : ''}</Tiny>
              </View>
              <Badge tone={st === 'live' ? 'ok' : st === 'soon' ? 'warn' : 'neutral'} label={st === 'soon' ? `opens ${niceDay(a.opensAt!)}` : st} />
            </View>
            <StatusChips value={{ status: st, opensAt: a.opensAt ?? nextWeek }} onChange={(l) => { void saveArea(a.id, { ...a, ...launchFields(l) }); }} />
            <View className="flex-row gap-2">
              <Btn title="Edit" size="sm" tone="secondary" onPress={() => edit(a)} />
              <Btn title="Delete" size="sm" tone="danger" onPress={() => deleteArea(a.id)} />
            </View>
          </Panel>
        );
      })}
      <Tiny>Pausing an area stops new bookings there straight away. Visits already booked still go ahead. When areas overlap, the smaller one is used.</Tiny>
    </ScrollView>
  );
}
