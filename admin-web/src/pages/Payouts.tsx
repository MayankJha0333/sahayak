import { useState } from 'react';
import { recent, useCol } from '../data';
import { call } from '../firebase';
import { downloadCsv, inr, when } from '../format';
import type { Earning, Partner, Withdrawal } from '../types';
import { Action, Badge, Card, Chip, Empty, Icon, Page, Stat, Stats } from '../ui';

const SHOW = { all: 'All', processing: 'Sending', paid: 'Paid', failed: 'Failed' } as const;
const HOW: Record<string, string> = { manual: 'She withdrew', weekly: 'Weekly auto', admin: 'Sent by ops' };

/** Money going to experts: withdrawals through RazorpayX, and earnings held after a complaint. */
export default function Payouts() {
  const { rows: withdrawals } = useCol<Withdrawal>('withdrawals', recent('createdAt', 500));
  const { rows: earnings } = useCol<Earning>('earnings', recent('createdAt', 1000));
  const { rows: partners } = useCol<Partner>('partners');
  const [show, setShow] = useState<'all' | 'processing' | 'paid' | 'failed'>('all');
  const now = Date.now();
  const inWallets = earnings.filter((e) => !['withdrawn', 'sent', 'on_hold'].includes(e.status));
  const ready = inWallets.filter((e) => (e.availableAt ?? 0) <= now).reduce((n, e) => n + e.total, 0);
  const pending = inWallets.filter((e) => (e.availableAt ?? 0) > now).reduce((n, e) => n + e.total, 0);
  const held = earnings.filter((e) => e.status === 'on_hold');
  const list = withdrawals.filter((w) => show === 'all' || w.status === show);
  const name = (id: string) => partners.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <Page title="Payouts" sub="Experts withdraw to UPI or bank (at least ₹100). Everything ready also goes out every Monday at 9 AM."
      right={<button className="btn sec" onClick={() => downloadCsv('sahayak-payouts.csv', [['Expert', 'Amount', 'To', 'Status', 'UTR', 'Trigger', 'When'], ...list.map((w) => [w.partnerName, w.amount, w.method.label, w.status, w.utr ?? '', w.trigger, new Date(w.createdAt).toISOString()])])}><Icon name="download" />Download CSV</button>}>
      <Stats>
        <Stat icon="check" tone="ok" label="Paid out" hint="Reached experts' accounts" value={inr(withdrawals.filter((w) => w.status === 'paid').reduce((n, w) => n + w.amount, 0))} />
        <Stat icon="payouts" tone="brand" label="Sending now" hint="Usually lands in minutes" value={inr(withdrawals.filter((w) => w.status === 'processing').reduce((n, w) => n + w.amount, 0))} />
        <Stat icon="rupee" label="Ready in wallets" hint="Experts can withdraw this" value={inr(ready)} />
        <Stat icon="waitlist" label="In 24 h hold" hint="Ready a day after the job" value={inr(pending)} />
        <Stat icon="alert" label="On hold (complaints)" hint="Release after you check" value={inr(held.reduce((n, e) => n + e.total, 0))} alert={held.length > 0} />
      </Stats>
      {held.length ? (
        <Card title="Held after a low rating">
          <table><thead><tr><th>Expert</th><th>Booking</th><th>Amount</th><th>Why</th><th /></tr></thead>
            <tbody>{held.map((e) => (
              <tr key={e.id}><td>{name(e.partnerId)}</td><td>{e.bookingId}</td><td>{inr(e.total)}</td><td className="muted">{e.holdReason ?? '—'}</td>
                <td><Action small tone="sec" run={() => call('adminReleaseEarning', { bookingId: e.bookingId })}>Release</Action></td></tr>
            ))}</tbody></table>
        </Card>
      ) : null}
      <Card>
        <div className="row" style={{ marginBottom: 10 }}>{(['all', 'processing', 'paid', 'failed'] as const).map((s) => <Chip key={s} on={show === s} onClick={() => setShow(s)}>{SHOW[s]} · {s === 'all' ? withdrawals.length : withdrawals.filter((w) => w.status === s).length}</Chip>)}</div>
        {list.length === 0 ? <Empty>No withdrawals yet.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>When</th><th>Expert</th><th>Amount</th><th>To</th><th>How</th><th>Status</th><th>UTR / reason</th><th /></tr></thead>
            <tbody>{list.map((w) => (
              <tr key={w.id}><td>{when(w.createdAt)}</td><td><a href={`#/experts/${w.partnerId}`}>{w.partnerName}</a></td><td>{inr(w.amount)}</td><td>{w.method.label}</td><td>{HOW[w.trigger] ?? w.trigger}</td>
                <td><Badge tone={w.status === 'paid' ? 'ok' : w.status === 'failed' ? 'crit' : 'warn'}>{SHOW[w.status]}</Badge></td>
                <td className="tiny">{w.utr ?? w.error ?? ''}</td>
                <td>{w.status === 'failed' ? <Action small tone="sec" run={() => call('adminPayoutNow', { partnerId: w.partnerId })}>Try again</Action> : null}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="tiny" style={{ marginBottom: 0 }}>A failed payout puts the money back in the expert's wallet, so she (or you) can try again after fixing her account details.</p>
      </Card>
    </Page>
  );
}
