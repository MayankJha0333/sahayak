import { useMemo, useState } from 'react';
import { recent, useCol } from '../data';
import { call } from '../firebase';
import { areaStatus, insideArea, isServing, nearestArea, pickArea } from '../areaGeo';
import { downloadCsv, km, when } from '../format';
import type { Area, Waitlist as W } from '../types';
import { Action, Badge, Card, Chip, Empty, Icon, Page, Stat, Stats } from '../ui';

/** People who tried to book outside every live area. Shows where demand is, so you know where to open next. */
export default function Waitlist() {
  const { rows } = useCol<W>('waitlist', recent('createdAt', 2000));
  const { rows: areas } = useCol<Area>('areas');
  const [show, setShow] = useState<'waiting' | 'notified' | 'all'>('waiting');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const list = rows.filter((w) => show === 'all' || w.status === show);
  const covered = (w: W) => pickArea(areas.filter((a) => isServing(a)), w.at);
  const soonFor = (w: W) => areas.find((a) => areaStatus(a) === 'soon' && insideArea(a, w.at));
  const nearest = (w: W) => { const n = nearestArea(areas.filter((a) => isServing(a)), w.at); return n ? { a: n.area, d: n.metres } : undefined; };
  const places = useMemo(() => {
    const m = new Map<string, number>();
    rows.filter((w) => w.status === 'waiting').forEach((w) => { const k = w.city || 'Unknown'; m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows]);
  const nowCovered = rows.filter((w) => w.status === 'waiting' && covered(w));
  const mark = (ids: string[], status: 'notified' | 'removed') => call('adminMarkWaitlist', { ids, status }).then(() => setPicked(new Set()));
  const flip = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Page title="Waitlist" sub="Customers outside every live area. Tell them when you open near them."
      right={<button className="btn sec" onClick={() => downloadCsv('sahayak-waitlist.csv', [['Name', 'Phone', 'Address', 'City', 'Lat', 'Lng', 'Status', 'Joined'], ...list.map((w) => [w.name, w.phone, w.line, w.city, w.at.lat, w.at.lng, w.status, new Date(w.createdAt).toISOString()])])}><Icon name="download" />Download CSV</button>}>
      <Stats>
        <Stat icon="waitlist" tone="warn" label="Waiting" hint="Not told yet" value={rows.filter((w) => w.status === 'waiting').length} />
        <Stat icon="check" tone="ok" label="Now inside a live area" value={nowCovered.length} hint="Tell them we have arrived" />
        <Stat icon="check" label="Told we arrived" hint="Messaged after we opened" value={rows.filter((w) => w.status === 'notified').length} />
      </Stats>
      {nowCovered.length ? (
        <Card title="Ready to tell">
          <p style={{ marginTop: 0 }}>{nowCovered.length} waiting {nowCovered.length === 1 ? 'person is' : 'people are'} now inside a live area. Message them, then mark them as told.</p>
          <Action run={() => mark(nowCovered.map((w) => w.id), 'notified')}>Mark all {nowCovered.length} as told</Action>
        </Card>
      ) : null}
      <div className="cols">
        <Card title="Most asked-for places">
          {places.length === 0 ? <Empty>No one waiting.</Empty> : places.map(([p, n]) => <div key={p} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line2)' }}><span>{p}</span><b>{n}</b></div>)}
        </Card>
      </div>
      <Card>
        <div className="spread" style={{ marginBottom: 10 }}>
          <div className="row">{(['waiting', 'notified', 'all'] as const).map((s) => <Chip key={s} on={show === s} onClick={() => setShow(s)}>{{ waiting: 'Waiting', notified: 'Told', all: 'All' }[s]} · {s === 'all' ? rows.length : rows.filter((w) => w.status === s).length}</Chip>)}</div>
          {picked.size ? <div className="row"><Action small run={() => mark([...picked], 'notified')}>Mark {picked.size} as told</Action><Action small tone="danger" run={() => mark([...picked], 'removed')}>Remove</Action></div> : null}
        </div>
        {list.length === 0 ? <Empty>No one here.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th /><th>Name</th><th>Phone</th><th>Address</th><th>Nearest area</th><th>Joined</th><th>Status</th></tr></thead>
            <tbody>{list.map((w) => {
              const n = nearest(w); const inArea = covered(w);
              return (
                <tr key={w.id} className="click" onClick={() => flip(w.id)}>
                  <td><input type="checkbox" checked={picked.has(w.id)} readOnly style={{ width: 16 }} /></td>
                  <td><b>{w.name || 'Customer'}</b></td><td>{w.phone || '—'}</td><td className="muted">{w.line || `${w.at.lat.toFixed(4)}, ${w.at.lng.toFixed(4)}`}</td>
                  <td>{inArea ? <Badge tone="ok">inside {inArea.name}</Badge> : soonFor(w) ? <Badge tone="warn">{soonFor(w)!.name} opens {new Date(soonFor(w)!.opensAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Badge> : n ? `${km(n.d)} from ${n.a.name}${n.a.state ? `, ${n.a.state}` : ''}` : '—'}</td>
                  <td>{when(w.createdAt)}</td><td><Badge tone={w.status === 'waiting' ? 'warn' : 'ok'}>{w.status === 'waiting' ? 'waiting' : 'told'}</Badge></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </Page>
  );
}
