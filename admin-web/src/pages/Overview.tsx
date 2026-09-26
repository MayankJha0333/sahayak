import { where } from 'firebase/firestore';
import { recent, useCol } from '../data';
import { inr, when } from '../format';
import type { Booking, Partner, Waitlist, Withdrawal } from '../types';
import { loadTestData } from '../devSeed';
import { USE_EMULATORS } from '../firebase';
import { Action, Badge, Card, Empty, Icon, Page, Stat, Stats } from '../ui';

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export default function Overview() {
  const { rows: bookings } = useCol<Booking>('bookings', recent('createdAt', 500));
  const { rows: partners } = useCol<Partner>('partners');
  const { rows: waitlist } = useCol<Waitlist>('waitlist', [where('status', '==', 'waiting')], 'waiting');
  const { rows: withdrawals } = useCol<Withdrawal>('withdrawals', recent('createdAt', 100));
  const today = bookings.filter((b) => b.createdAt >= startOfDay() && b.paid);
  const live = bookings.filter((b) => ['matching', 'assigned', 'arrived', 'in_progress'].includes(b.status));
  const noMatch = bookings.filter((b) => b.status === 'no_match');
  const queue = partners.filter((p) => p.kyc?.status === 'submitted' && !p.bot);
  const failed = withdrawals.filter((w) => w.status === 'failed');
  const rated = bookings.filter((b) => b.rating);
  const days = [...Array(7)].map((_, i) => {
    const start = startOfDay() - (6 - i) * 86_400_000;
    const n = bookings.filter((b) => b.paid && b.status !== 'cancelled' && b.createdAt >= start && b.createdAt < start + 86_400_000);
    return { label: new Date(start).toLocaleDateString('en-IN', { weekday: 'short' }), count: n.length, gmv: n.reduce((s, b) => s + b.amountDue, 0) };
  });
  const max = Math.max(1, ...days.map((d) => d.gmv));

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todo = [
    { n: queue.length, href: '#/experts', icon: 'experts' as const, tone: 'var(--warn)', soft: 'var(--warn-soft)', text: `new expert${queue.length === 1 ? '' : 's'} waiting for the Aadhaar check` },
    { n: noMatch.length, href: '#/bookings', icon: 'alert' as const, tone: 'var(--crit)', soft: 'var(--crit-soft)', text: `booking${noMatch.length === 1 ? '' : 's'} found no expert — assign or refund` },
    { n: failed.length, href: '#/payouts', icon: 'payouts' as const, tone: 'var(--crit)', soft: 'var(--crit-soft)', text: `payout${failed.length === 1 ? '' : 's'} failed — money is back in the wallet` },
    { n: waitlist.length, href: '#/waitlist', icon: 'waitlist' as const, tone: 'var(--violet)', soft: 'var(--violet-soft)', text: `${waitlist.length === 1 ? 'person' : 'people'} waiting for us to open near them` },
  ].filter((t) => t.n > 0);
  const week = days.reduce((n, d) => n + d.gmv, 0);

  return (
    <Page title={hello} sub={`Here is Sahayak today, ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}.`}
      right={USE_EMULATORS && bookings.length === 0 && partners.length === 0 ? <Action tone="sec" run={loadTestData}><Icon name="download" />Load test data</Action> : undefined}>
      <Stats>
        <Stat icon="bookings" tone="brand" label="Paid bookings today" value={today.length} hint="Customers who paid today" />
        <Stat icon="rupee" tone="ok" label="Collected today" value={inr(today.reduce((n, b) => n + b.amountDue, 0))} hint="Money in, after discounts" />
        <Stat icon="live" label="Visits happening now" value={live.length} hint="Matching, on the way or working" />
        <Stat icon="experts" tone="ok" label="Experts online" value={partners.filter((p) => p.onShift).length} hint="Ready to take a job" />
        <Stat icon="star" tone="warn" label="Average rating" value={rated.length ? `${(rated.reduce((n, b) => n + (b.rating ?? 0), 0) / rated.length).toFixed(1)} ★` : '—'} hint={rated.length ? `From ${rated.length} rated visits` : 'No ratings yet'} />
      </Stats>
      <div className="cols">
        <Card title="Needs you" sub={todo.length ? 'Tap one to deal with it.' : undefined}>
          {todo.length === 0 ? <Empty>All clear. Nothing is waiting for you.</Empty> : (
            <div className="grid" style={{ gap: 4 }}>
              {todo.map((t) => (
                <a key={t.href} href={t.href} className="todo" style={{ ['--tone' as string]: t.tone, ['--tone-soft' as string]: t.soft }}>
                  <span className="ic"><Icon name={t.icon} /></span><b>{t.n}</b><span className="txt">{t.text}</span><span className="go"><Icon name="arrow" size={18} /></span>
                </a>
              ))}
            </div>
          )}
        </Card>
        <Card title="Money collected, last 7 days" sub={`${inr(week)} in total`}>
          <div className="bars">
            {days.map((d, i) => (
              <div key={i} className={i === 6 ? 'today' : ''} title={`${d.count} bookings · ${inr(d.gmv)}`}>
                <span className="tiny">{d.gmv ? inr(d.gmv) : ''}</span>
                <i style={{ height: `${Math.max(6, (d.gmv / max) * 120)}px` }} />
                <span className="tiny" style={i === 6 ? { color: 'var(--ink)', fontWeight: 700 } : undefined}>{i === 6 ? 'Today' : d.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Happening now" sub="Visits that are matching, on the way or in progress.">
        {live.length === 0 ? <Empty icon="live">No visits running right now.</Empty> : (
          <div className="scroll"><table><thead><tr><th>Booking</th><th>Booked</th><th>Address</th><th>Status</th></tr></thead>
            <tbody>{live.map((b) => <tr key={b.id} className="click" onClick={() => { window.location.hash = '#/bookings'; }}><td><b>{b.id}</b></td><td>{when(b.createdAt)}</td><td className="muted">{b.address.line1}, {b.address.line2}</td><td><Badge tone="brand">{b.status.replace('_', ' ')}</Badge></td></tr>)}</tbody></table></div>
        )}
      </Card>
    </Page>
  );
}
