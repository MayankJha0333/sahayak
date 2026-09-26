import { useState } from 'react';
import { startOfDay } from '../format';
import { recent, useCol } from '../data';
import { call } from '../firebase';
import { inr, statusLabel, when } from '../format';
import type { Booking, Partner, User, WithId } from '../types';
import { Action, Badge, Card, Chip, Drawer, Empty, Page, Stat, Stats, type Tone } from '../ui';

const TONE: Record<string, Tone> = {
  payment_pending: 'neutral', matching: 'warn', no_match: 'crit', assigned: 'brand', arrived: 'brand', in_progress: 'brand', completed: 'ok', cancelled: 'neutral',
};
const FILTERS = [
  { key: 'live', label: 'Live', match: (s: string) => ['matching', 'assigned', 'arrived', 'in_progress'].includes(s) },
  { key: 'attention', label: 'Needs you', match: (s: string) => s === 'no_match' },
  { key: 'completed', label: 'Completed', match: (s: string) => s === 'completed' },
  { key: 'cancelled', label: 'Cancelled', match: (s: string) => s === 'cancelled' },
  { key: 'all', label: 'All', match: () => true },
];

export default function Bookings() {
  const { rows } = useCol<Booking>('bookings', recent('createdAt', 500));
  const { rows: partners } = useCol<Partner>('partners');
  const { rows: users } = useCol<User>('users');
  const [filter, setFilter] = useState('live');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Look the open booking up in the live list, so the drawer updates after assign / cancel.
  const open: WithId<Booking> | null = rows.find((b) => b.id === openId) ?? null;
  const setOpen = (b: WithId<Booking> | null) => setOpenId(b?.id ?? null);
  const f = FILTERS.find((x) => x.key === filter)!;
  const name = (id?: string) => (id ? partners.find((p) => p.id === id)?.name ?? users.find((u) => u.id === id)?.name ?? id.slice(0, 8) : '—');
  const list = rows.filter((b) => b.status !== 'payment_pending' || filter === 'all').filter((b) => f.match(b.status))
    .filter((b) => !q || `${b.id} ${name(b.customerId)} ${name(b.partnerId)} ${b.couponCode ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page title="Bookings" sub="Every visit. Open one to assign an expert or cancel and refund.">
      <Stats>
        <Stat icon="live" tone="brand" label="Live now" value={rows.filter((b) => FILTERS[0].match(b.status)).length} hint="Finding, on the way or working" />
        <Stat icon="alert" label="Need you" value={rows.filter((b) => b.status === 'no_match').length} alert={rows.some((b) => b.status === 'no_match')} hint="Nobody accepted — assign or refund" />
        <Stat icon="check" tone="ok" label="Completed, last 7 days" value={rows.filter((b) => b.status === 'completed' && b.createdAt >= startOfDay() - 6 * 86_400_000).length} hint="Visits finished" />
        <Stat icon="rupee" label="Collected, last 7 days" value={inr(rows.filter((b) => b.paid && b.status !== 'cancelled' && b.createdAt >= startOfDay() - 6 * 86_400_000).reduce((n, b) => n + b.amountDue, 0))} hint="After discounts, before refunds" />
      </Stats>
      <Card>
        <div className="spread" style={{ marginBottom: 10 }}>
          <div className="row">{FILTERS.map((x) => <Chip key={x.key} on={filter === x.key} onClick={() => setFilter(x.key)}>{x.label} · {rows.filter((b) => x.match(b.status) && (b.status !== 'payment_pending' || x.key === 'all')).length}</Chip>)}</div>
          <input placeholder="Search id, customer, expert, coupon" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        </div>
        {list.length === 0 ? <Empty>No bookings here.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>Booking</th><th>When</th><th>Customer</th><th>Expert</th><th>Time</th><th>Paid</th><th>Coupon</th><th>Status</th></tr></thead>
            <tbody>{list.map((b) => (
              <tr key={b.id} className="click" onClick={() => setOpen(b)}>
                <td><b>{b.id}</b></td><td>{when(b.scheduledFor ?? b.createdAt)}</td><td>{name(b.customerId)}</td><td>{name(b.partnerId)}</td>
                <td>{b.durationMin + (b.extraMin ?? 0)} min</td><td>{inr(b.amountDue)}{b.razorpay?.refundId ? <div className="tiny">{b.razorpay.refundId === 'queued' ? 'refund pending' : 'refunded'}</div> : null}</td>
                <td>{b.couponCode ?? '—'}</td><td><Badge tone={TONE[b.status] ?? 'neutral'}>{statusLabel(b.status)}</Badge></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {open ? (
        <Drawer onClose={() => setOpen(null)}>
          <div className="spread"><h1 style={{ margin: 0, fontSize: 22 }}>{open.id}</h1><button className="btn sec sm" onClick={() => setOpen(null)}>Close</button></div>
          <Card>
            <dl className="kv">
              <dt>Status</dt><dd><Badge tone={TONE[open.status] ?? 'neutral'}>{statusLabel(open.status)}</Badge></dd>
              <dt>Customer</dt><dd>{name(open.customerId)}</dd><dt>Expert</dt><dd>{name(open.partnerId)}</dd>
              <dt>Address</dt><dd>{open.address.line1}, {open.address.line2}</dd>
              <dt>Tasks</dt><dd>{open.tasks.join(', ')} · {open.durationMin} min{open.extraMin ? ` + ${open.extraMin} extra` : ''}</dd>
              <dt>Price</dt><dd>{open.discount ? <>{inr(open.price)} − {inr(open.discount)} off{open.couponCode ? ` (${open.couponCode})` : ''} = {inr(open.amountDue)} paid</> : `${inr(open.amountDue)} paid`}</dd>
              <dt>Payment</dt><dd>{open.razorpay?.paymentId ?? 'not paid'}{open.razorpay?.refundId ? (open.razorpay.refundId === 'queued' ? ' · refund pending' : ` · refunded (${open.razorpay.refundId})`) : ''}</dd>
              {open.rating ? <><dt>Rating</dt><dd>{open.rating}★</dd></> : null}
            </dl>
          </Card>
          <div className="row">
            {['matching', 'no_match'].includes(open.status) ? <Action run={() => call('adminForceAssign', { bookingId: open.id })}>Assign nearest expert</Action> : null}
            {!['completed', 'cancelled'].includes(open.status) ? <Action tone="danger" confirm="Cancel this visit and refund the customer in full?" run={() => call('adminCancelRefund', { bookingId: open.id })}>Cancel and refund</Action> : null}
          </div>
          <Card title="What happened">
            {(open.dispatchLog ?? []).map((l, i) => <div key={i} className="muted" style={{ padding: '4px 0', borderBottom: '1px solid var(--line2)' }}>{l}</div>)}
          </Card>
        </Drawer>
      ) : null}
    </Page>
  );
}
