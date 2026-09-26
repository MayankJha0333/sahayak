import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { recent, useCol } from '../data';
import { db } from '../firebase';
import { inr, when } from '../format';
import type { Booking, Coupon, WithId } from '../types';
import { Action, Badge, Card, Empty, Page, Stat, Stats, Switch } from '../ui';

type Form = {
  code: string; title: string; description: string; type: 'flat' | 'percent'; value: string; maxDiscount: string; minOrder: string;
  perUserLimit: string; totalLimit: string; startsAt: string; endsAt: string; firstOrderOnly: boolean; public: boolean; editing: boolean;
};
const BLANK: Form = { code: '', title: '', description: '', type: 'flat', value: '', maxDiscount: '', minOrder: '', perUserLimit: '1', totalLimit: '', startsAt: '', endsAt: '', firstOrderOnly: false, public: true, editing: false };
const toInput = (ms?: number | null) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromInput = (s: string) => (s ? new Date(s).getTime() : null);
const num = (s: string) => (s.trim() ? Number(s) : undefined);

const describe = (c: Coupon) =>
  `${c.type === 'percent' ? `${c.value}% off${c.maxDiscount ? ` (up to ${inr(c.maxDiscount)})` : ''}` : `${inr(c.value)} off`}`
  + `${c.minOrder ? ` · min ${inr(c.minOrder)}` : ''}${c.firstOrderOnly ? ' · first booking only' : ''} · ${c.perUserLimit ?? 1}× per customer`;

/** Discount codes. The server checks every rule again when the customer pays. */
export default function Coupons() {
  const { rows: coupons } = useCol<Coupon>('coupons');
  const { rows: bookings } = useCol<Booking>('bookings', recent('createdAt', 1000));
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState('');
  const paid = bookings.filter((b) => b.paid && b.status !== 'cancelled');
  const savedBy = (code: string) => paid.filter((b) => b.couponCode === code).reduce((n, b) => n + (b.couponDiscount ?? 0), 0);

  const save = async () => {
    if (!f) return;
    const code = f.code.trim().toUpperCase().replace(/\s+/g, '');
    const value = Number(f.value);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) { setErr('Code: 3 to 20 letters or numbers, no spaces.'); return; }
    if (!f.editing && coupons.some((c) => c.id === code)) { setErr('That code already exists. Edit it instead.'); return; }
    if (!(value > 0) || (f.type === 'percent' && value > 90)) { setErr(f.type === 'percent' ? 'Percent off must be 1 to 90.' : 'Enter how many rupees off.'); return; }
    const prev = coupons.find((c) => c.id === code);
    const c: Coupon = {
      code, title: f.title.trim() || (f.type === 'percent' ? `${value}% off` : `₹${value} off`), description: f.description.trim(),
      type: f.type, value, perUserLimit: num(f.perUserLimit) ?? 1, firstOrderOnly: f.firstOrderOnly, public: f.public,
      active: prev?.active ?? true, used: prev?.used ?? 0, startsAt: fromInput(f.startsAt), endsAt: fromInput(f.endsAt), createdAt: prev?.createdAt ?? Date.now(),
      ...(num(f.maxDiscount) ? { maxDiscount: num(f.maxDiscount) } : {}), ...(num(f.minOrder) ? { minOrder: num(f.minOrder) } : {}),
      ...(num(f.totalLimit) ? { totalLimit: num(f.totalLimit) } : {}),
    };
    await setDoc(doc(db, 'coupons', code), { ...c, updatedAt: Date.now() });
    setF(null); setErr('');
  };
  const edit = (c: WithId<Coupon>) => {
    setErr('');
    setF({
      code: c.id, title: c.title, description: c.description ?? '', type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '',
      minOrder: c.minOrder ? String(c.minOrder) : '', perUserLimit: String(c.perUserLimit ?? 1), totalLimit: c.totalLimit ? String(c.totalLimit) : '',
      startsAt: toInput(c.startsAt), endsAt: toInput(c.endsAt), firstOrderOnly: Boolean(c.firstOrderOnly), public: Boolean(c.public), editing: true,
    });
  };
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => (x ? { ...x, [k]: e.target.value } : x));

  return (
    <Page title="Coupons" sub="Discount codes customers type at checkout, or pick from the list in the app."
      right={<button className="btn" onClick={() => { setErr(''); setF(BLANK); }}>New coupon</button>}>
      <Stats>
        <Stat icon="coupons" tone="brand" label="Live coupons" hint="Customers can use these today" value={coupons.filter((c) => c.active && !(c.endsAt && c.endsAt < Date.now())).length} />
        <Stat icon="bookings" label="Bookings with a coupon" hint="Paid bookings" value={paid.filter((b) => b.couponCode).length} />
        <Stat icon="rupee" tone="warn" label="Given away" hint="Total discount so far" value={inr(paid.reduce((n, b) => n + (b.couponDiscount ?? 0), 0))} />
      </Stats>
      {f ? (
        <Card title={f.editing ? `Edit ${f.code}` : 'New coupon'}>
          <div className="grid">
            <div className="form">
              <label className="f">Code<input value={f.code} disabled={f.editing} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="DIWALI100" /></label>
              <label className="f">Title customers see<input value={f.title} onChange={set('title')} placeholder="₹100 off this Diwali" /></label>
              <label className="f">Discount type
                <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Form['type'] })}><option value="flat">₹ off</option><option value="percent">% off</option></select>
              </label>
              <label className="f">{f.type === 'percent' ? 'Percent off' : 'Rupees off'}<input type="number" min={1} value={f.value} onChange={set('value')} /></label>
              {f.type === 'percent' ? <label className="f">Most it can take off (₹)<input type="number" value={f.maxDiscount} onChange={set('maxDiscount')} placeholder="optional" /></label> : null}
              <label className="f">Minimum booking (₹)<input type="number" value={f.minOrder} onChange={set('minOrder')} placeholder="optional" /></label>
              <label className="f">Uses per customer<input type="number" min={1} value={f.perUserLimit} onChange={set('perUserLimit')} /></label>
              <label className="f">Total uses<input type="number" value={f.totalLimit} onChange={set('totalLimit')} placeholder="no limit" /></label>
              <label className="f">Starts<input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /></label>
              <label className="f">Ends<input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></label>
            </div>
            <label className="f">Small print (optional)<input value={f.description} onChange={set('description')} placeholder="Valid on bookings of 60 minutes or more" /></label>
            <div className="row">
              <button type="button" className={`chip ${f.firstOrderOnly ? 'on' : ''}`} onClick={() => setF({ ...f, firstOrderOnly: !f.firstOrderOnly })}>First booking only</button>
              <button type="button" className={`chip ${f.public ? 'on' : ''}`} onClick={() => setF({ ...f, public: !f.public })}>Show in the app's coupon list</button>
            </div>
            {err ? <p className="err" style={{ margin: 0 }}>{err}</p> : null}
            <div className="row"><Action run={save}>Save coupon</Action><button className="btn sec" onClick={() => setF(null)}>Cancel</button></div>
          </div>
        </Card>
      ) : null}
      <Card>
        {!coupons.some((c) => c.id === 'FIRST50') ? <p className="tiny" style={{ marginTop: 0 }}>FIRST50 (₹50 off the first booking) is built in. Create a coupon called FIRST50 to change or switch it off.</p> : null}
        {coupons.length === 0 ? <Empty>No coupons yet.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>Code</th><th>What it does</th><th>Used</th><th>Given away</th><th>Ends</th><th>In app</th><th>On</th><th /></tr></thead>
            <tbody>{coupons.map((c) => {
              const expired = Boolean(c.endsAt && c.endsAt < Date.now());
              return (
                <tr key={c.id}>
                  <td><b>{c.id}</b><div className="tiny">{c.title}</div></td>
                  <td className="muted">{describe(c)}</td>
                  <td>{c.used ?? 0}{c.totalLimit ? ` / ${c.totalLimit}` : ''}</td>
                  <td>{inr(savedBy(c.id))}</td>
                  <td>{c.endsAt ? <>{when(c.endsAt)} {expired ? <Badge tone="neutral">expired</Badge> : null}</> : '—'}</td>
                  <td>{c.public ? 'listed' : 'code only'}</td>
                  <td><Switch label={`${c.id} on`} on={c.active} onChange={(v) => { void setDoc(doc(db, 'coupons', c.id), { active: v, updatedAt: Date.now() }, { merge: true }); }} /></td>
                  <td><div className="row">
                    <button className="btn sec sm" onClick={() => edit(c)}>Edit</button>
                    <Action small tone="danger" confirm={`Delete ${c.id}?`} run={() => deleteDoc(doc(db, 'coupons', c.id))}>Delete</Action>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </Page>
  );
}
