import { useState } from 'react';
import { recent, useCol } from '../data';
import { call } from '../firebase';
import { inr, when } from '../format';
import type { Booking, User, WithId } from '../types';
import { Action, Card, Empty, Page, Stat, Stats } from '../ui';

/** Everyone who books. Give credit here as a goodwill gesture after a bad visit. */
export default function Customers() {
  const { rows: users } = useCol<User>('users');
  const { rows: bookings } = useCol<Booking>('bookings', recent('createdAt', 1000));
  const [q, setQ] = useState('');
  const [credit, setCredit] = useState<{ u: WithId<User>; amount: string; note: string } | null>(null);
  const [msg, setMsg] = useState('');
  const customers = users.filter((u) => u.role === 'customer')
    .filter((u) => !q || `${u.name} ${u.phone} ${u.referralCode}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const spent = (id: string) => bookings.filter((b) => b.customerId === id && b.paid && b.status !== 'cancelled').reduce((n, b) => n + b.amountDue, 0);
  const count = (id: string) => bookings.filter((b) => b.customerId === id && b.paid && b.status !== 'cancelled').length;

  return (
    <Page title="Customers" sub="People who book. Credit you give comes off their next booking.">
      <Stats>
        <Stat icon="customers" tone="brand" label="Customers" hint="Signed up" value={users.filter((u) => u.role === 'customer').length} />
        <Stat icon="check" tone="ok" label="Booked at least once" hint="Paid for a visit" value={users.filter((u) => u.role === 'customer' && u.firstBookingDone).length} />
      </Stats>
      {msg && !credit ? <div className="note ok">{msg}</div> : null}
      {credit ? (
        <Card title={`Give credit to ${credit.u.name}`}>
          <div className="form">
            <label className="f">Amount (₹)<input type="number" min={1} max={5000} value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} /></label>
            <label className="f">Why (for our records)<input value={credit.note} onChange={(e) => setCredit({ ...credit, note: e.target.value })} placeholder="Late arrival on 12 Oct" /></label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Action run={async () => { await call('adminGiveCredit', { userId: credit.u.id, amount: Number(credit.amount), note: credit.note }); setMsg(`Gave ${inr(Number(credit.amount))} credit to ${credit.u.name}. It comes off their next booking.`); setCredit(null); }}>Give {inr(Number(credit.amount) || 0)}</Action>
            <button className="btn sec" onClick={() => setCredit(null)}>Cancel</button>
          </div>
        </Card>
      ) : null}
      <Card title="All customers" right={<input placeholder="Search name, phone or code" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />}>
        {customers.length === 0 ? <Empty>No customers found.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>Name</th><th>Phone</th><th>Joined</th><th>Bookings</th><th>Spent</th><th>Credit</th><th>Referral code</th><th /></tr></thead>
            <tbody>{customers.map((u) => (
              <tr key={u.id}><td><b>{u.name}</b></td><td>{u.phone}</td><td>{when(u.createdAt)}</td><td>{count(u.id)}</td><td>{inr(spent(u.id))}</td>
                <td>{inr(u.rewards ?? 0)}</td><td>{u.referralCode}{u.referredBy ? <div className="tiny">by {u.referredBy}</div> : null}</td>
                <td><button className="btn sec sm" onClick={() => { setMsg(''); setCredit({ u, amount: '100', note: '' }); }}>Give credit</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </Page>
  );
}
