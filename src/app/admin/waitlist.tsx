import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Panel } from '@/components/admin';
import { Badge, Btn, Chip, Stat, Tiny, Title } from '@/components/ui';
import { adminMarkWaitlist } from '@/lib/api';
import { useAllWaitlist, useAreas } from '@/lib/db';
import { whenLabel } from '@/lib/format';
import { isServing, nearestArea } from '@/lib/areaGeo';
import { km } from '@/lib/geo';
import { useTheme } from '@/theme';

/** People who tried to book outside every area. Grouped by place so ops can see where to open next. */
export default function AdminWaitlist() {
  const { c } = useTheme();
  const { rows } = useAllWaitlist();
  const { rows: areas } = useAreas();
  const [show, setShow] = useState<'waiting' | 'notified' | 'all'>('waiting');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const nearest = (at: { lat: number; lng: number }) => { const n = nearestArea(areas.filter((a) => isServing(a)), at); return n ? { a: n.area, d: n.metres } : undefined; };
  const list = rows.filter((w) => show === 'all' || w.status === show);
  const cities = useMemo(() => {
    const m = new Map<string, number>();
    rows.filter((w) => w.status === 'waiting').forEach((w) => m.set(w.city || 'Unknown', (m.get(w.city || 'Unknown') ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const mark = async (status: 'notified' | 'removed') => {
    setBusy(true);
    try { await adminMarkWaitlist({ ids: [...picked], status }); setPicked(new Set()); } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Title>Waitlist</Title>
      <View className="flex-row flex-wrap gap-2">
        <Stat label="Waiting" value={String(rows.filter((w) => w.status === 'waiting').length)} />
        <Stat label="Told we arrived" value={String(rows.filter((w) => w.status === 'notified').length)} />
      </View>
      {cities.length ? (
        <Panel title="Most asked-for places" wide>
          {cities.map(([city, n]) => <Text key={city} className="font-jk text-[13px] text-ink2 dark:text-ink2-dark">{city} · {n} waiting</Text>)}
        </Panel>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {(['waiting', 'notified', 'all'] as const).map((s) => <Chip key={s} label={s} on={show === s} onPress={() => setShow(s)} />)}
      </View>
      {picked.size ? (
        <View className="flex-row gap-2">
          <Btn title={`Mark ${picked.size} as told`} size="sm" busy={busy} onPress={() => mark('notified')} />
          <Btn title="Remove" size="sm" tone="danger" disabled={busy} onPress={() => mark('removed')} />
        </View>
      ) : <Tiny>Tap people to select them. After you add an area that covers them and call or message them, mark them as told.</Tiny>}
      {list.length === 0 ? <Tiny>No one here.</Tiny> : null}
      {list.map((w) => {
        const n = nearest(w.at);
        const on = picked.has(w.id);
        return (
          <Pressable key={w.id} onPress={() => toggle(w.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            className={`gap-1 rounded-2xl border p-3.5 ${on ? 'border-brand bg-brand-soft dark:border-brand-dark dark:bg-brand-softdark' : 'border-line2 bg-paper dark:border-line2-dark dark:bg-paper-dark'}`}>
            <View className="flex-row items-center justify-between">
              <Text className="font-jkb text-[14px] text-ink dark:text-ink-dark">{w.name || 'Customer'} · {w.phone || 'no phone'}</Text>
              <Badge tone={w.status === 'waiting' ? 'warn' : 'ok'} label={w.status} />
            </View>
            <Tiny>{w.line || `${w.at.lat.toFixed(4)}, ${w.at.lng.toFixed(4)}`}{w.city ? ` · ${w.city}` : ''}</Tiny>
            <Tiny>Joined {whenLabel(w.createdAt)}{n ? ` · ${n.d <= 0 ? `now inside ${n.a.name}` : `${km(n.d)} outside ${n.a.name}`}` : ''}</Tiny>
          </Pressable>
        );
      })}
      <Text style={{ color: c.ink3 }} className="font-jk text-[11px]">Customers join from the app when their address is outside every live area.</Text>
    </ScrollView>
  );
}
