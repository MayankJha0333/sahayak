import L from 'leaflet';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { areaStatus, insideArea, isBorder, isServing, nearestArea, pickArea, ringsOf, type AreaShape, type AreaStatus } from '../areaGeo';
import { recent, useCol } from '../data';
import { db } from '../firebase';
import { km } from '../format';
import { INDIA_STATES, LEVEL_LABEL, borderOf, districtsOf, nameAt, placesIn, searchPlaces, type Place } from '../osm';
import type { Area, Booking, LatLng, Partner, Waitlist, WithId } from '../types';
import { Action, Badge, Card, Empty, Icon, Page, Stat, Stats, type Tone } from '../ui';

type Load<T> = { loading: boolean; data: T | null; error: string };
const IDLE = { loading: false, data: null, error: '' };

/** Loads `fn()` whenever `key` changes (null = nothing), keeping only the latest answer. */
function useLoad<T>(key: string | null, fn: () => Promise<T>): Load<T> {
  const f = useRef(fn); f.current = fn;
  const [s, setS] = useState<{ key: string | null; data: T | null; error: string }>({ key: null, data: null, error: '' });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    f.current().then((data) => { if (live) setS({ key, data, error: '' }); }, (e: Error) => { if (live) setS({ key, data: null, error: e.message }); });
    return () => { live = false; };
  }, [key]);
  if (key === null) return IDLE;
  if (s.key !== key) return { loading: true, data: null, error: '' };
  return { loading: false, data: s.data, error: s.error };
}

/* ---------- launch status ---------- */

const STATUS: Record<AreaStatus, { label: string; tone: Tone }> = {
  live: { label: 'Live', tone: 'ok' }, soon: { label: 'Coming soon', tone: 'warn' }, paused: { label: 'Paused', tone: 'neutral' },
};
const toDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** A launch date means 8 AM that day (when experts start work), India time on the ops laptop. */
const fromDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 8, 0, 0).getTime(); };
const niceDay = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const tomorrow = () => toDay(Date.now() + 86_400_000);

type Launch = { status: AreaStatus; day: string };
const launchFields = (l: Launch) => ({ active: l.status === 'live', opensAt: l.status === 'soon' ? fromDay(l.day) : null });

/** Live now / Coming soon on <date> / Paused — the switch that decides whether customers there can book. */
function StatusPicker({ value, onChange, small }: { value: Launch; onChange: (v: Launch) => void; small?: boolean }) {
  return (
    <div className="row" style={{ gap: 8 }} onClick={(e) => e.stopPropagation()}>
      <div className={`seg ${small ? 'sm' : ''}`} role="radiogroup" aria-label="Status">
        {(['live', 'soon', 'paused'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={value.status === k} className={`${value.status === k ? `on ${k}` : ''}`}
            onClick={() => onChange({ status: k, day: value.day || tomorrow() })}>
            {k === 'live' ? 'Live now' : k === 'soon' ? 'Coming soon' : 'Paused'}
          </button>
        ))}
      </div>
      {value.status === 'soon' ? (
        <input type="date" aria-label="Launch date" min={tomorrow()} value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value })}
          style={{ width: small ? 150 : 170, padding: small ? '6px 10px' : undefined }} />
      ) : null}
    </div>
  );
}

/* ---------- the draft being added or edited ---------- */

type Draft = {
  /** Changes only when a new draft starts, so the map zooms once and not on every drag. */
  k: number;
  id: string | null;
  name: string;
  /** Where it came from, for ops: "West Delhi, Delhi". */
  place: string;
  center: LatLng;
  radiusKm: number;
  /** A place with a real border (district, city…) — used when `useBorder` is on. */
  border: Place | null;
  useBorder: boolean;
  /** Border already on a saved area, so editing doesn't fetch it again. */
  savedBorder?: AreaShape;
  state: string;
  launch: Launch;
  createdAt?: number;
};

const RADII = [0.5, 1, 2, 3, 5, 8, 12, 20];

/** Where customers can book. Search any colony, road or city and drop a pin with a range, or pick a whole district. */
export default function Areas() {
  const { rows: areas } = useCol<Area>('areas');
  const { rows: waitlist } = useCol<Waitlist>('waitlist', recent('createdAt', 1000));
  const { rows: partners } = useCol<Partner>('partners');
  const { rows: bookings } = useCol<Booking>('bookings', recent('createdAt', 500));
  const people = partners.filter((p) => !p.bot && p.at);
  const waiting = waitlist.filter((w) => w.status === 'waiting');
  const serving = areas.filter((a) => isServing(a));

  const [mode, setMode] = useState<'search' | 'browse'>('search');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState<{ text: string; near?: { s: number; w: number; n: number; e: number } } | null>(null);
  const [stateId, setStateId] = useState<number | null>(null);
  const [district, setDistrict] = useState<Place | null>(null);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [retry, setRetry] = useState(0);
  const mapView = useRef<{ s: number; w: number; n: number; e: number } | undefined>(undefined);
  const state = INDIA_STATES.find((s) => s.osmId === stateId) ?? null;

  const results = useLoad(query ? `${query.text}:${retry}` : null, () => searchPlaces(query!.text, query!.near));
  const districts = useLoad(stateId === null ? null : `d${stateId}:${retry}`, () => districtsOf(stateId!));
  const subs = useLoad(district ? `s${district.osmId}:${retry}` : null, () => placesIn(district!.osmId));
  const needBorder = draft?.useBorder && draft.border && !draft.savedBorder ? draft.border : null;
  const border = useLoad(needBorder ? `b${needBorder.osmId}:${retry}` : null, () => borderOf(needBorder!));

  const previewShape: AreaShape | null = !draft ? null
    : draft.useBorder ? draft.savedBorder ?? border.data
    : { center: draft.center, radiusKm: draft.radiusKm, shape: 'circle' };

  const count = (shape: AreaShape | null | undefined) => !shape ? { waiting: 0, experts: 0, bookings: 0 } : {
    waiting: waiting.filter((w) => insideArea(shape, w.at)).length,
    experts: people.filter((p) => insideArea(shape, p.at)).length,
    bookings: bookings.filter((b) => b.address?.at && insideArea(shape, b.address.at)).length,
  };
  const counts = useMemo(() => new Map(areas.map((a) => [a.id, count(a)])), [areas, waiting, people, bookings]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftCounts = useMemo(() => count(previewShape), [previewShape, waiting, people, bookings]); // eslint-disable-line react-hooks/exhaustive-deps
  const outside = waiting.filter((w) => !pickArea(serving, w.at)).length;

  /* ----- starting a draft ----- */
  const fromSearch = (p: Place) => {
    setSaved(''); setFocus(null);
    setDraft({
      k: Date.now(), id: null, name: p.name, place: p.hint ?? '', center: p.center!, radiusKm: p.suggestKm ?? 2,
      border: p.osmType === 'relation' ? p : null, useBorder: false, state: p.state ?? INDIA_STATES.find((s) => p.hint?.includes(s.name))?.name ?? '',
      launch: { status: 'live', day: tomorrow() },
    });
  };
  const fromBorder = (p: Place, stateName: string) => {
    setSaved(''); setFocus(null);
    setDraft({
      k: Date.now(), id: null, name: p.name, place: p.level === 'state' ? 'India' : [district && district.osmId !== p.osmId ? district.name : '', stateName].filter(Boolean).join(', '),
      center: p.center ?? { lat: 28.44, lng: 77.07 }, radiusKm: 5, border: p, useBorder: true, state: stateName, launch: { status: 'live', day: tomorrow() },
    });
  };
  const fromPoint = (at: LatLng) => {
    setSaved(''); setFocus(null); showEditor();
    setDraft({ k: Date.now(), id: null, name: 'Finding the name…', place: '', center: at, radiusKm: 2, border: null, useBorder: false, state: '', launch: { status: 'live', day: tomorrow() } });
    void nameAt(at).then((n) => setDraft((d) => (d && d.center === at && d.name === 'Finding the name…' ? { ...d, name: n.name, place: n.hint, state: n.state } : d)));
  };
  // The editor sits at the top of the left column: bring it into view.
  const showEditor = () => document.querySelector('.areas')?.scrollIntoView({ behavior: document.visibilityState === 'visible' ? 'smooth' : 'auto', block: 'start' });
  const edit = (a: WithId<Area>) => {
    setSaved(''); setFocus(a.id); showEditor();
    setDraft({
      k: Date.now(), id: a.id, name: a.name, place: a.place ?? [a.city !== a.name ? a.city : '', a.state].filter(Boolean).join(', '), center: a.center, radiusKm: a.radiusKm,
      border: a.osmId ? { osmId: a.osmId, name: a.name, level: a.level ?? 'place', osmType: 'relation' } : null, useBorder: isBorder(a),
      savedBorder: isBorder(a) ? { shape: 'border', border: a.border, bbox: a.bbox, center: a.center, radiusKm: a.radiusKm } : undefined,
      state: a.state ?? '', launch: { status: areaStatus(a), day: a.opensAt ? toDay(a.opensAt) : tomorrow() }, createdAt: a.createdAt,
    });
  };

  const save = async () => {
    if (!draft || !previewShape) return;
    if (draft.name.trim().length < 2) throw new Error('Give the area a name customers will recognise.');
    if (draft.launch.status === 'soon' && (!draft.launch.day || fromDay(draft.launch.day) <= Date.now())) throw new Error('Pick a launch date after today.');
    const id = draft.id ?? (draft.useBorder && draft.border ? `osm-${draft.border.osmId}` : `pin-${Date.now().toString(36)}`);
    const shape = draft.useBorder
      ? { shape: 'border' as const, border: previewShape.border, bbox: previewShape.bbox, center: previewShape.center, radiusKm: previewShape.radiusKm }
      : { shape: 'circle' as const, center: { lat: Number(draft.center.lat.toFixed(5)), lng: Number(draft.center.lng.toFixed(5)) }, radiusKm: draft.radiusKm };
    await setDoc(doc(db, 'areas', id), {
      name: draft.name.trim(), city: draft.place.split(',')[0]?.trim() || draft.name.trim(), state: draft.state, place: draft.place,
      level: draft.useBorder ? draft.border?.level ?? 'place' : 'place', ...(draft.useBorder && draft.border ? { osmId: draft.border.osmId } : {}),
      ...shape, ...launchFields(draft.launch), createdAt: draft.createdAt ?? Date.now(), updatedAt: Date.now(),
    });
    const l = draft.launch;
    setSaved(`${draft.name.trim()} ${l.status === 'live' ? 'is live — customers inside it can book now.' : l.status === 'soon' ? `opens on ${niceDay(fromDay(l.day))}. Customers there see the date and can join the waitlist.` : 'is saved, paused.'}`);
    setDraft(null); setFocus(id);
  };
  const setStatus = (a: WithId<Area>, l: Launch) => setDoc(doc(db, 'areas', a.id), { ...launchFields(l), updatedAt: Date.now() }, { merge: true });

  const groups = useMemo(() => {
    const m = new Map<string, WithId<Area>[]>();
    [...areas].sort((a, b) => a.name.localeCompare(b.name)).forEach((a) => { const k = a.state || (a.city && a.city !== a.name ? a.city : 'Other places'); m.set(k, [...(m.get(k) ?? []), a]); });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [areas]);
  const districtList = (districts.data ?? []).filter((d) => !filter || d.name.toLowerCase().includes(filter.toLowerCase()));
  const tryAgain = <a href="#/areas" onClick={(e) => { e.preventDefault(); setRetry((r) => r + 1); }}>Try again</a>;

  return (
    <Page title="Service areas" sub="Search a colony, road or city and drop a pin with a range — or pick a whole district. Set each area Live, Coming soon (with a date) or Paused.">
      <Stats>
        <Stat icon="areas" tone="ok" label="Live areas" value={serving.length} hint={areas.length ? 'Customers can book here' : 'Gurugram (40 km) until you add one'} />
        <Stat icon="bookings" tone="warn" label="Coming soon" value={areas.filter((a) => areaStatus(a) === 'soon').length} hint="Launch date set" />
        <Stat icon="waitlist" tone="brand" label="Waiting outside" value={outside} hint="Customers we can't serve yet" />
      </Stats>

      <div className="areas">
        <div className="grid">
          {draft ? (
            <Card title={draft.id ? 'Edit area' : 'New area'} sub={draft.useBorder ? 'Uses the real border.' : 'Drag the pin or click the map to move it. Change the range below.'}
              right={<button className="btn sec sm" onClick={() => setDraft(null)} aria-label="Cancel"><Icon name="x" />Cancel</button>}>
              <div className="grid" style={{ gap: 14 }}>
                <label className="f">Area name (customers see this)<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                {draft.place ? <span className="tiny" style={{ marginTop: -8 }}>{draft.place}</span> : null}

                {draft.border ? (
                  <div className="tabs" role="tablist" style={{ justifySelf: 'start' }}>
                    <button role="tab" aria-selected={!draft.useBorder} className={!draft.useBorder ? 'on' : ''} onClick={() => setDraft({ ...draft, useBorder: false, savedBorder: undefined })}>Pin + range</button>
                    <button role="tab" aria-selected={draft.useBorder} className={draft.useBorder ? 'on' : ''} onClick={() => setDraft({ ...draft, useBorder: true })}>Exact border</button>
                  </div>
                ) : null}

                {!draft.useBorder ? (
                  <div className="grid" style={{ gap: 8 }}>
                    <div className="spread"><b>Range</b><span className="range-val">{draft.radiusKm} km around the pin</span></div>
                    <input type="range" min={0.5} max={30} step={0.5} value={draft.radiusKm} aria-label="Range in km"
                      onChange={(e) => setDraft({ ...draft, radiusKm: Number(e.target.value) })} className="slider" />
                    <div className="row" style={{ gap: 6 }}>{RADII.map((r) => <button key={r} type="button" className={`chip ${draft.radiusKm === r ? 'on' : ''}`} onClick={() => setDraft({ ...draft, radiusKm: r })}>{r} km</button>)}</div>
                  </div>
                ) : border.loading ? <><div className="skeleton" /><span className="tiny">Getting the border…</span></> : border.error ? <p className="err" style={{ margin: 0 }}>{border.error} {tryAgain}</p> : null}

                {previewShape ? (
                  <div className="preview">
                    <div className="facts">
                      <div><b>{draftCounts.waiting}</b><span>waiting inside</span></div>
                      <div><b>{draftCounts.experts}</b><span>experts inside</span></div>
                      <div><b>{draftCounts.bookings}</b><span>past bookings</span></div>
                    </div>
                  </div>
                ) : null}

                <div className="grid" style={{ gap: 8 }}>
                  <b>Status</b>
                  <StatusPicker value={draft.launch} onChange={(launch) => setDraft({ ...draft, launch })} />
                  <span className="tiny">{draft.launch.status === 'live' ? 'Customers inside can book straight away.'
                    : draft.launch.status === 'soon' ? 'Customers inside see "Sahayak starts here on this date" and can join the waitlist. Bookings open by themselves that morning. Experts can sign up now.'
                    : 'Saved but switched off. Nobody sees it.'}</span>
                </div>
                <div className="row"><Action run={save} disabled={!previewShape}><Icon name="check" />{draft.id ? 'Save changes' : 'Add area'}</Action></div>
              </div>
            </Card>
          ) : (
            <Card title="Add a service area"
              right={<div className="tabs" role="tablist">
                <button role="tab" aria-selected={mode === 'search'} className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')}>Search a place</button>
                <button role="tab" aria-selected={mode === 'browse'} className={mode === 'browse' ? 'on' : ''} onClick={() => setMode('browse')}>By state</button>
              </div>}>
              {saved ? <div className="note ok" style={{ marginBottom: 14 }}><Icon name="check" size={15} /> {saved}</div> : null}
              {mode === 'search' ? (
                <form className="grid" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 3) setQuery({ text: q.trim(), near: mapView.current }); }}>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <span className="search">
                      <input autoFocus placeholder="Patel Nagar, MG Road, DLF Phase 3, Sector 52…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a place" />
                      {q ? <button type="button" className="clear" aria-label="Clear search" onClick={() => { setQ(''); setQuery(null); }}><Icon name="x" /></button> : null}
                    </span>
                    <button className="btn" disabled={q.trim().length < 3}><Icon name="search" />Find</button>
                  </div>
                  {results.loading ? <div className="grid" style={{ gap: 6 }}><div className="skeleton" /><div className="skeleton" /></div> : null}
                  {results.error ? <p className="err tiny">{results.error} {tryAgain}</p> : null}
                  {results.data ? (
                    <div className="pick">
                      {results.data.map((p) => (
                        <button type="button" key={`${p.osmType}${p.osmId}`} onClick={() => fromSearch(p)}>
                          <span><b style={{ fontWeight: 600 }}>{p.name}</b><br /><small>{p.hint}</small></span><span className="kind">{p.kind}</span>
                        </button>
                      ))}
                      {!results.data.length ? <span className="tiny" style={{ padding: 8 }}>No place by that name. Try adding the city, e.g. "Patel Nagar Delhi".</span> : null}
                    </div>
                  ) : (
                    <p className="tiny" style={{ margin: 0 }}>Pick a result to drop a pin with a range on it. You can also <b>click anywhere on the map</b> and choose "Add an area here".</p>
                  )}
                </form>
              ) : (
                <div className="steps">
                  <div className={`step ${state ? 'done' : 'now'}`}>
                    <span className="n">1</span>
                    <div>
                      <h3>State</h3>
                      <select value={stateId ?? ''} onChange={(e) => { setStateId(e.target.value ? Number(e.target.value) : null); setDistrict(null); setFilter(''); }} aria-label="State">
                        <option value="">Choose a state or union territory…</option>
                        {INDIA_STATES.map((s) => <option key={s.osmId} value={s.osmId}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {state ? (
                    <div className={`step ${district ? 'done' : 'now'}`}>
                      <span className="n">2</span>
                      <div>
                        <h3>District</h3>
                        {districts.loading ? <div className="skeleton" /> : null}
                        {districts.error ? <p className="err tiny">{districts.error} {tryAgain}</p> : null}
                        {districts.data ? (
                          <>
                            {districts.data.length > 8 ? <input placeholder={`Filter ${districts.data.length} districts`} value={filter} onChange={(e) => setFilter(e.target.value)} /> : null}
                            <div className="pick" role="listbox" aria-label="Districts">
                              <button className="whole" onClick={() => fromBorder(state, state.name)}>Whole of {state.name}<small>{LEVEL_LABEL.state}</small></button>
                              {districtList.map((d) => (
                                <button key={d.osmId} className={district?.osmId === d.osmId ? 'on' : ''} onClick={() => setDistrict(d)}>
                                  {d.name}{areas.some((a) => a.osmId === d.osmId) ? <Badge tone="ok">added</Badge> : <small>District</small>}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {district && state ? (
                    <div className="step now">
                      <span className="n">3</span>
                      <div>
                        <h3>Which part?</h3>
                        <div className="pick" role="listbox" aria-label="Places in the district">
                          <button className="whole" onClick={() => fromBorder(district, state.name)}>Whole {district.name} district<small>Exact border</small></button>
                          {subs.loading ? <div className="skeleton" /> : null}
                          {subs.error ? <p className="err tiny">{subs.error} {tryAgain}</p> : null}
                          {(subs.data ?? []).map((p) => <button key={p.osmId} onClick={() => fromBorder(p, state.name)}>{p.name}<small>{LEVEL_LABEL[p.level]}</small></button>)}
                        </div>
                        <p className="tiny" style={{ marginBottom: 0 }}>For a single colony or road, use <a href="#/areas" onClick={(e) => { e.preventDefault(); setMode('search'); }}>Search a place</a>.</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          )}

          <Card title="Your areas" sub="Click one to see it on the map.">
            {areas.length === 0 ? <Empty icon="areas">No areas yet. Until you add one, the app serves Gurugram (40 km around the centre).</Empty> : (
              <div className="alist">
                {groups.map(([g, list]) => (
                  <div key={g} className="alist">
                    <div className="state">{g}</div>
                    {list.map((a) => {
                      const c = counts.get(a.id);
                      const st = areaStatus(a);
                      return (
                        <div key={a.id} className={`aitem ${focus === a.id ? 'focus' : ''}`} onClick={() => setFocus(a.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setFocus(a.id)}>
                          <div className="t">{a.name}<Badge tone={STATUS[st].tone}>{st === 'soon' ? `Opens ${niceDay(a.opensAt!)}` : STATUS[st].label}</Badge></div>
                          <button className="btn sec sm" onClick={(e) => { e.stopPropagation(); edit(a); }}>Edit</button>
                          <div className="m">
                            <span>{isBorder(a) ? `Border · ${LEVEL_LABEL[a.level ?? 'place']}` : `Pin · ${a.radiusKm} km range`} · {c?.experts ?? 0} experts · {c?.bookings ?? 0} bookings{c?.waiting ? ` · ${c.waiting} waiting` : ''}</span>
                          </div>
                          {focus === a.id ? (
                            <div className="expand">
                              <StatusPicker small value={{ status: st, day: a.opensAt ? toDay(a.opensAt) : tomorrow() }} onChange={(l) => { void setStatus(a, l); }} />
                              <Action small tone="danger" confirm={`Delete ${a.name}?`} run={() => deleteDoc(doc(db, 'areas', a.id))}>Delete area</Action>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <p className="tiny" style={{ marginBottom: 0 }}>Pausing stops new bookings at once; visits already booked still happen. When areas overlap, the smaller one is used.</p>
          </Card>
        </div>

        <Card className="mapcard">
          <AreaMap areas={areas} waitlist={waiting} partners={people} draft={draft} preview={previewShape} focus={focus}
            onView={(b) => { mapView.current = b; }}
            onPin={(at) => setDraft((d) => (d && !d.useBorder ? { ...d, center: at } : d))}
            onAddHere={fromPoint} />
          <div className="legend">
            <span><i style={{ background: 'rgba(255,107,82,.55)' }} />Live</span>
            <span><i style={{ border: '1.5px dashed #f5c56b' }} />Coming soon</span>
            <span><i style={{ border: '1.5px dashed #8a8f9c' }} />Paused</span>
            <span><i style={{ border: '1.5px dashed #fff' }} />Editing</span>
            <span><i style={{ background: '#ff8d84', borderRadius: '50%' }} />Waiting customer</span>
            <span><i style={{ background: '#5fdca5', borderRadius: '50%' }} />Expert</span>
          </div>
          <p className="tiny" style={{ margin: '4px 8px 2px' }}>{draft && !draft.useBorder ? 'Click the map or drag the pin to move the centre.' : 'Click anywhere to check if we serve it, or to add an area there.'}</p>
        </Card>
      </div>
    </Page>
  );
}

/* ---------- map ---------- */

const boundsOf = (a: AreaShape) => {
  if (a.bbox) return L.latLngBounds([a.bbox.s, a.bbox.w], [a.bbox.n, a.bbox.e]);
  // A circle's box in degrees (1° of latitude ≈ 111 km).
  const dLat = a.radiusKm / 111, dLng = a.radiusKm / (111 * Math.cos((a.center.lat * Math.PI) / 180));
  return L.latLngBounds([a.center.lat - dLat, a.center.lng - dLng], [a.center.lat + dLat, a.center.lng + dLng]);
};
const shapeLayer = (a: AreaShape, style: L.PathOptions) =>
  isBorder(a)
    ? L.polygon(ringsOf(a).map((r) => [r.map((p) => [p.lat, p.lng] as [number, number])]), style)
    : L.circle([a.center.lat, a.center.lng], { radius: a.radiusKm * 1000, ...style });
/** Glide to nearby places; jump straight to far ones (a long fly across India is slow and makes the map blurry). */
function goTo(m: L.Map, b: L.LatLngBounds, maxZoom = 18) {
  // A hidden tab never draws animation frames, so an animated move would never finish there.
  if (document.visibilityState === 'visible' && m.getBounds().pad(1).intersects(b)) m.flyToBounds(b, { duration: 0.6, maxZoom });
  else m.fitBounds(b, { animate: false, maxZoom });
}
const STYLE: Record<AreaStatus, L.PathOptions> = {
  live: { color: '#ff6b52', weight: 2, fillColor: '#ff6b52', fillOpacity: 0.14 },
  soon: { color: '#f5c56b', weight: 2, dashArray: '7 6', fillColor: '#f5c56b', fillOpacity: 0.08 },
  paused: { color: '#8a8f9c', weight: 1.5, dashArray: '6 6', fillOpacity: 0.03 },
};
const pinIcon = L.divIcon({ className: 'pin', html: '<span></span>', iconSize: [30, 40], iconAnchor: [15, 38] });

function AreaMap({ areas, waitlist, partners, draft, preview, focus, onView, onPin, onAddHere }: {
  areas: WithId<Area>[]; waitlist: Waitlist[]; partners: Partner[]; draft: Draft | null; preview: AreaShape | null; focus: string | null;
  onView: (b: { s: number; w: number; n: number; e: number }) => void; onPin: (at: LatLng) => void; onAddHere: (at: LatLng) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const editLayer = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onView, onPin, onAddHere, areas, draft });
  cb.current = { onView, onPin, onAddHere, areas, draft };
  const fitted = useRef(false);
  const pendingFit = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: [28.4419, 77.0723], zoom: 10 });
    map.current = m;
    // Standard OpenStreetMap tiles, turned dark with a CSS filter (see .leaflet-tile-pane in styles.css).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    editLayer.current = L.layerGroup().addTo(m);
    const view = () => { const b = m.getBounds(); cb.current.onView({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }); };
    m.on('moveend', view); view();
    m.on('click', (e: L.LeafletMouseEvent) => {
      const at: LatLng = { lat: Number(e.latlng.lat.toFixed(5)), lng: Number(e.latlng.lng.toFixed(5)) };
      const { draft: d, areas: all } = cb.current;
      // While placing a pin, a click moves it.
      if (d && !d.useBorder) { cb.current.onPin(at); return; }
      if (d) return;
      // Otherwise: "Do we serve this spot?" with a button to add an area right here.
      const live = all.filter((a) => isServing(a));
      const hit = pickArea(live, at);
      const soon = hit ? null : all.find((a) => areaStatus(a) === 'soon' && insideArea(a, at));
      const near = hit || soon ? null : nearestArea(live, at);
      const box = document.createElement('div');
      box.innerHTML = hit
        ? `<b style="color:#5fdca5">✓ We serve this spot</b><br/>${hit.name}`
        : soon ? `<b style="color:#f5c56b">Coming soon</b><br/>${soon.name} opens ${niceDay(soon.opensAt!)}`
        : `<b style="color:#ff8d84">✕ Not served</b><br/>${near ? `${km(near.metres)} outside ${near.area.name}` : 'No live areas yet'}`;
      if (!hit) {
        const b = document.createElement('button');
        b.className = 'btn sm'; b.style.marginTop = '10px'; b.textContent = '+ Add an area here';
        b.onclick = () => { m.closePopup(); cb.current.onAddHere(at); };
        box.appendChild(document.createElement('br')); box.appendChild(b);
      }
      L.popup().setLatLng(e.latlng).setContent(box).openOn(m);
    });
    // The card changes size with the window: tell Leaflet, and redo the first zoom-to-areas if it ran before the map had a size.
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      if (pendingFit.current && m.getSize().x > 0) { m.fitBounds(pendingFit.current); pendingFit.current = null; }
    });
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // Saved areas, customers and experts.
  useEffect(() => {
    const g = layer.current, m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    areas.filter((a) => a.id !== draft?.id).forEach((a) => {
      const st = areaStatus(a);
      shapeLayer(a, { ...STYLE[st], fillOpacity: (STYLE[st].fillOpacity ?? 0) * (focus === a.id ? 2 : 1) })
        .bindTooltip(`${a.name} · ${st === 'soon' ? `opens ${niceDay(a.opensAt!)}` : STATUS[st].label.toLowerCase()}`, { sticky: true }).addTo(g);
    });
    waitlist.forEach((w) => L.circleMarker([w.at.lat, w.at.lng], { radius: 4.5, color: '#ff8d84', fillColor: '#ff8d84', fillOpacity: 0.9, weight: 1 }).bindTooltip(`${w.name || 'Customer'} · ${w.line}`).addTo(g));
    partners.forEach((p) => L.circleMarker([p.at.lat, p.at.lng], { radius: 4.5, color: '#5fdca5', fillColor: '#5fdca5', fillOpacity: 0.9, weight: 1 }).bindTooltip(p.name).addTo(g));
    if (!fitted.current && areas.length) {
      fitted.current = true;
      const b = areas.map(boundsOf).reduce((acc, x) => acc.extend(x)).pad(0.05);
      if (m.getSize().x > 0) m.fitBounds(b); else pendingFit.current = b;
    }
  }, [areas, waitlist, partners, focus, draft?.id]);

  // The area being added or edited: dashed white shape + a draggable pin.
  useEffect(() => {
    const g = editLayer.current;
    if (!g) return;
    g.clearLayers();
    if (!draft) return;
    if (preview) shapeLayer(preview, { color: '#ffffff', weight: 2.5, dashArray: '6 5', fillColor: '#ffffff', fillOpacity: 0.08, interactive: false }).addTo(g);
    if (!draft.useBorder) {
      const pin = L.marker([draft.center.lat, draft.center.lng], { icon: pinIcon, draggable: true, keyboard: false, title: 'Drag to move' }).addTo(g);
      pin.on('dragend', () => { const p = pin.getLatLng(); cb.current.onPin({ lat: Number(p.lat.toFixed(5)), lng: Number(p.lng.toFixed(5)) }); });
    }
  }, [draft, preview]);

  // Zoom to a new draft (not while dragging its pin or changing its range).
  const draftKey = draft ? `${draft.k}|${draft.useBorder}|${Boolean(preview)}` : '';
  const lastKey = useRef('');
  useEffect(() => {
    if (!draft || !preview || !map.current || draftKey === lastKey.current) return;
    lastKey.current = draftKey;
    goTo(map.current, boundsOf(preview).pad(0.25), 15);
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!draft) lastKey.current = ''; }, [draft]);
  useEffect(() => {
    const a = areas.find((x) => x.id === focus);
    if (a && map.current && !draft) goTo(map.current, boundsOf(a).pad(0.1));
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="map" ref={el} role="application" aria-label="Map of service areas" />;
}
