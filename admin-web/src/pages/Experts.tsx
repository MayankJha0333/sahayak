import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { recent, useCol, useDocument } from '../data';
import { call } from '../firebase';
import { inr, when } from '../format';
import type { Area, Earning, KycFile, Partner, Withdrawal, WithId } from '../types';
import { Action, Badge, Card, Chip, Drawer, Empty, Page, Stat, Stats, type Tone } from '../ui';

/** "21 Jul 1992 · 34 years" from "1992-07-21". */
const dobLabel = (dob?: string) => {
  if (!dob) return '—';
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dob;
  const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000));
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${age} years`;
};

export function kycState(p: Partner): { key: string; tone: Tone; label: string } {
  if (p.bot) return { key: 'demo', tone: 'neutral', label: 'demo' };
  if (p.suspended) return { key: 'suspended', tone: 'crit', label: 'suspended' };
  if (p.verified) return { key: 'verified', tone: 'ok', label: 'verified' };
  const s = p.kyc?.status ?? 'not_started';
  if (s === 'submitted') return { key: 'review', tone: 'warn', label: 'to review' };
  if (s === 'rejected') return { key: 'rejected', tone: 'crit', label: 'sent back' };
  return { key: 'signup', tone: 'neutral', label: 'signing up' };
}
const FILTERS = [
  { key: 'review', label: 'To review' }, { key: 'verified', label: 'Verified' }, { key: 'rejected', label: 'Sent back' },
  { key: 'signup', label: 'Signing up' }, { key: 'suspended', label: 'Suspended' }, { key: 'demo', label: 'Demo' }, { key: 'all', label: 'All' },
];

export default function Experts({ param }: { param?: string }) {
  const { rows: partners } = useCol<Partner>('partners');
  const { rows: earnings } = useCol<Earning>('earnings', recent('createdAt', 1000));
  const [picked, setFilter] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const open = (id: string | null) => { window.location.hash = id ? `#/experts/${id}` : '#/experts'; };

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    partners.forEach((p) => { const k = kycState(p).key; m[k] = (m[k] ?? 0) + 1; });
    return m;
  }, [partners]);
  // Open on "To review" when someone is waiting, otherwise on everyone.
  const filter = picked ?? (counts.review ? 'review' : 'all');
  const wallet = (id: string) => earnings.filter((e) => e.partnerId === id && !['withdrawn', 'sent'].includes(e.status)).reduce((n, e) => n + e.total, 0);
  const list = partners
    .filter((p) => filter === 'all' || kycState(p).key === filter)
    .filter((p) => !q || `${p.name} ${p.phone ?? ''} ${p.kyc?.aadhaarLast4 ?? ''} ${p.hub}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.kyc?.submittedAt ?? 0) - (b.kyc?.submittedAt ?? 0));

  return (
    <Page title="Experts" sub="Check Aadhaar and selfies, approve new experts, suspend or move them between areas.">
      <Stats>
        <Stat icon="experts" label="Waiting for you" value={counts.review ?? 0} alert={Boolean(counts.review)} hint="Aadhaar and selfie to check" />
        <Stat icon="check" tone="ok" label="Verified" value={counts.verified ?? 0} hint="Allowed to take jobs" />
        <Stat icon="live" tone="brand" label="Online now" hint="On shift right now" value={partners.filter((p) => p.onShift).length} />
        <Stat icon="x" label="Suspended" value={counts.suspended ?? 0} hint="Get no jobs until restored" />
      </Stats>
      <Card>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="row">{FILTERS.map((f) => <Chip key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}{f.key !== 'all' && counts[f.key] ? ` · ${counts[f.key]}` : ''}</Chip>)}</div>
          <input placeholder="Search name, phone, Aadhaar last 4" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        </div>
        {list.length === 0 ? <Empty>{filter === 'review' ? 'No one is waiting. New experts appear here after they send their Aadhaar and selfie.' : 'No experts here.'}</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>Name</th><th>Status</th><th>Phone</th><th>Area</th><th>Aadhaar</th><th>Sent</th><th>Jobs</th><th>Rating</th><th>Wallet</th><th>Payout to</th></tr></thead>
            <tbody>{list.map((p) => {
              const s = kycState(p);
              return (
                <tr key={p.id} className="click" onClick={() => open(p.id)}>
                  <td><b>{p.kyc?.fullName ?? p.name}</b></td>
                  <td><Badge tone={s.tone}>{s.label}</Badge>{p.onShift ? <> <Badge tone="ok">online</Badge></> : null}</td>
                  <td>{p.phone ?? '—'}</td><td>{p.hub}</td>
                  <td>{p.kyc?.aadhaarLast4 ? `•••• ${p.kyc.aadhaarLast4}` : '—'}</td>
                  <td>{when(p.kyc?.submittedAt)}</td><td>{p.jobs}</td><td>{p.jobs ? `${p.rating}★` : <span className="tiny">new</span>}</td><td>{inr(wallet(p.id))}</td>
                  <td>{p.payoutMethod?.label ?? '—'}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
      {param ? <ExpertDrawer id={param} onClose={() => open(null)} /> : null}
    </Page>
  );
}

const REASONS = ['Aadhaar photo is blurry — retake it in good light', 'Selfie does not match the Aadhaar photo', 'Name does not match Aadhaar', 'Back of Aadhaar is missing', 'Photocopy or screenshot — use the original card'];

function ExpertDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const p = useDocument<Partner>(`partners/${id}`);
  const { rows: areas } = useCol<Area>('areas');
  const { rows: earnings } = useCol<Earning>('earnings', recent('createdAt', 1000));
  const { rows: withdrawals } = useCol<Withdrawal>('withdrawals', recent('createdAt', 300));
  const [reason, setReason] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [done, setDone] = useState('');
  if (p === undefined) return <Drawer onClose={onClose}><p className="muted">Loading…</p></Drawer>;
  if (!p) return <Drawer onClose={onClose}><p>Expert not found.</p></Drawer>;
  const kyc = p.kyc;
  const s = kycState(p);
  const mine = earnings.filter((e) => e.partnerId === id);
  const wallet = mine.filter((e) => !['withdrawn', 'sent'].includes(e.status)).reduce((n, e) => n + e.total, 0);
  const act = (fn: () => Promise<unknown>, msg: string) => async () => { setDone(''); await fn(); setDone(msg); document.querySelector('.drawer')?.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <Drawer onClose={onClose}>
      <div className="spread">
        <div><h1 style={{ margin: 0, fontSize: 24 }}>{kyc?.fullName ?? p.name}</h1><span className="muted">{p.phone ?? 'no phone'} · {p.hub} · {p.jobs ? `${p.jobs} jobs · ${p.rating}★` : 'no jobs yet'}</span></div>
        <div className="row"><Badge tone={s.tone}>{s.label}</Badge><button className="btn sec sm" onClick={onClose}>Close</button></div>
      </div>
      {done ? <div className="note ok">{done}</div> : null}

      {!p.bot ? (
        <Card title="Aadhaar check">
          {!kyc || kyc.status === 'not_started' ? <p className="muted">She has not sent her documents yet.</p> : (
            <div className="grid">
              <dl className="kv">
                <dt>Name on Aadhaar</dt><dd>{kyc.fullName}</dd>
                <dt>Date of birth</dt><dd>{dobLabel(kyc.dob)}</dd>
                {kyc.gender ? <><dt>Gender</dt><dd>{kyc.gender}</dd></> : null}
                <dt>Aadhaar</dt><dd>•••• •••• {kyc.aadhaarLast4}</dd>
                <dt>Home address</dt><dd>{kyc.homeAddress}</dd>
                <dt>Work</dt><dd>{p.skills.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(', ')}</dd>
                <dt>Sent</dt><dd>{when(kyc.submittedAt)}</dd>
                {kyc.reviewedAt ? <><dt>Reviewed</dt><dd>{when(kyc.reviewedAt)}</dd></> : null}
                {kyc.status === 'rejected' ? <><dt>Sent back</dt><dd>{kyc.rejectReason}</dd></> : null}
                {kyc.filesDeleteAt && !kyc.filesDeleted ? <><dt>Photos auto-delete on</dt><dd>{when(kyc.filesDeleteAt)}</dd></> : null}
              </dl>
              {kyc.filesDeleted ? <p className="tiny">Photos were deleted 30 days after approval, as promised to her.</p> : (
                <div className="docs">
                  <Doc id={id} kind="aadhaarFront" label="Aadhaar — front" onZoom={setZoom} />
                  <Doc id={id} kind="aadhaarBack" label="Aadhaar — back" onZoom={setZoom} />
                  <Doc id={id} kind="selfie" label="Selfie" onZoom={setZoom} />
                </div>
              )}
              {kyc.status === 'submitted' ? (
                <div className="grid" style={{ gap: 10 }}>
                  <p className="tiny" style={{ margin: 0 }}>Check that the card is original (not a photocopy), the photo matches the selfie, the name and date of birth match what she typed, and the number ends in {kyc.aadhaarLast4}.</p>
                  <div className="row">
                    <Action run={act(() => call('adminReviewKyc', { partnerId: id, decision: 'approve' }), 'Approved. She can go online now.')}>Approve — she can start work</Action>
                  </div>
                  <div className="row">{REASONS.map((r) => <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r}</button>)}</div>
                  <textarea rows={2} placeholder="Or write what she should fix. She sees this in the app." value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="row"><Action tone="danger" disabled={reason.trim().length < 5} run={act(() => call('adminReviewKyc', { partnerId: id, decision: 'reject', reason }), 'Sent back. She sees your note in the app.')}>Send back to fix</Action></div>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      ) : null}

      <Card title="Work" sub={`Area: ${areas.find((a) => a.id === p.areaId)?.name ?? p.hub ?? 'not set'}`}>
        <p className="tiny" style={{ marginTop: 0 }}>Move her to another area</p>
        <div className="row" style={{ marginBottom: 12 }}>
          {areas.map((a) => <button key={a.id} className={`chip ${p.areaId === a.id ? 'on' : ''}`} disabled={p.areaId === a.id}
            onClick={() => act(() => call('adminUpdatePartner', { partnerId: id, areaId: a.id }), `Moved to ${a.name}.`)()}>{a.name}</button>)}
          {!areas.length ? <span className="tiny">Add service areas first.</span> : null}
        </div>
        {p.suspended
          ? <Action tone="sec" run={act(() => call('adminUpdatePartner', { partnerId: id, suspended: false }), 'Restored. She can go online again.')}>Restore — let her work again</Action>
          : p.verified
            ? <Action tone="danger" confirm="Suspend her? She goes offline and gets no jobs." run={act(() => call('adminUpdatePartner', { partnerId: id, suspended: true, reason: 'Suspended by ops' }), 'Suspended and taken offline.')}>Suspend — stop all jobs</Action>
            : <p className="tiny" style={{ margin: 0 }}>She can't take jobs until you approve her Aadhaar check.</p>}
      </Card>

      <Card title={`Wallet · ${inr(wallet)}`}>
        <dl className="kv">
          <dt>Payout account</dt><dd>{p.payoutMethod ? `${p.payoutMethod.label} · ${p.payoutMethod.holderName}` : 'Not added yet'}</dd>
          <dt>Weekly auto-payout</dt><dd>{p.autoPayout === false ? 'Off' : 'On (Mondays 9 AM)'}</dd>
        </dl>
        <div className="row" style={{ margin: '12px 0' }}>
          <Action tone="sec" small disabled={!p.payoutMethod} run={act(() => call('adminPayoutNow', { partnerId: id }), 'Payout started.')}>Pay out what is ready now</Action>
        </div>
        {withdrawals.every((w) => w.partnerId !== id) ? <p className="tiny" style={{ margin: 0 }}>No payouts yet.</p> : <table><thead><tr><th>When</th><th>Amount</th><th>To</th><th>Status</th><th>UTR / reason</th></tr></thead>
          <tbody>{withdrawals.filter((w) => w.partnerId === id).slice(0, 10).map((w) => (
            <tr key={w.id}><td>{when(w.createdAt)}</td><td>{inr(w.amount)}</td><td>{w.method.label}</td>
              <td><Badge tone={w.status === 'paid' ? 'ok' : w.status === 'failed' ? 'crit' : 'warn'}>{w.status}</Badge></td><td className="tiny">{w.utr ?? w.error ?? ''}</td></tr>
          ))}</tbody></table>}
      </Card>
      {/* Rendered on <body>: the drawer's frosted glass would otherwise trap a full-screen overlay inside itself. */}
      {zoom ? createPortal(<div className="zoom" onClick={() => setZoom(null)} role="dialog" aria-label="Document, enlarged"><img src={zoom} alt="Document, enlarged" /></div>, document.body) : null}
    </Drawer>
  );
}

function Doc({ id, kind, label, onZoom }: { id: string; kind: KycFile['kind']; label: string; onZoom: (src: string) => void }) {
  const f = useDocument<KycFile>(`kycFiles/${id}_${kind}`) as WithId<KycFile> | null | undefined;
  const src = f?.data ? `data:image/jpeg;base64,${f.data}` : null;
  return (
    <figure>
      <figcaption>{label}{f?.uploadedAt ? ` · ${when(f.uploadedAt)}` : ''}</figcaption>
      {src ? <img src={src} alt={label} onClick={() => onZoom(src)} /> : <div className="empty">{f === undefined ? 'Loading…' : 'Missing'}</div>}
    </figure>
  );
}
