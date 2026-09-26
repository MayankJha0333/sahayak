import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { recent, useCol, useDocument } from '../data';
import { db } from '../firebase';
import { inr, when } from '../format';
import type { Referral, ReferralConfig, User } from '../types';
import { Action, Badge, Card, Empty, Page, Stat, Stats, Switch } from '../ui';

/** What a referral pays, and who brought whom. */
export default function Referrals() {
  const cfg = useDocument<ReferralConfig>('config/referral');
  const { rows } = useCol<Referral>('referrals', recent('invitedAt', 500));
  const { rows: users } = useCol<User>('users');
  const [active, setActive] = useState(true);
  const [cust, setCust] = useState('100');
  const [part, setPart] = useState('100');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (cfg === undefined) return;
    setActive(cfg?.active ?? true); setCust(String(cfg?.customerReward ?? 100)); setPart(String(cfg?.partnerReward ?? 100));
  }, [cfg]);
  const joined = rows.filter((r) => r.status === 'joined');
  const top = Object.entries(joined.reduce<Record<string, number>>((m, r) => ({ ...m, [r.referrerId]: (m[r.referrerId] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id.slice(0, 8);

  return (
    <Page title="Referrals" sub="Customers and experts share their code. Both sides earn once the friend finishes a first booking or job.">
      <Stats>
        <Stat icon="customers" tone="ok" label="Friends joined" hint="Finished a first booking or job" value={joined.length} />
        <Stat icon="referrals" tone="brand" label="Rewards given" hint="Paid to both sides" value={inr(joined.reduce((n, r) => n + r.reward, 0))} />
        <Stat icon="rupee" label="Credit customers hold" hint="Comes off their next booking" value={inr(users.reduce((n, u) => n + (u.rewards ?? 0), 0))} />
      </Stats>
      <div className="cols">
        <Card title="Rewards">
          <div className="grid">
            <div className="spread"><b>Referrals on</b><Switch label="Referrals on" on={active} onChange={setActive} /></div>
            <label className="f">Customer brings a customer — credit to the referrer (₹)<input type="number" min={0} value={cust} onChange={(e) => setCust(e.target.value)} /></label>
            <label className="f">Expert brings an expert — paid to the referrer (₹)<input type="number" min={0} value={part} onChange={(e) => setPart(e.target.value)} /></label>
            <div className="row">
              <Action run={async () => { setMsg(''); await setDoc(doc(db, 'config', 'referral'), { active, customerReward: Number(cust) || 0, partnerReward: Number(part) || 0, updatedAt: Date.now() }); setMsg('Saved. New referrals use these amounts.'); }}>Save</Action>
              {msg ? <span className="tiny">{msg}</span> : null}
            </div>
            <p className="tiny" style={{ margin: 0 }}>Customer credit comes off their next booking. It is never paid out as cash.</p>
          </div>
        </Card>
        <Card title="Top referrers">
          {top.length === 0 ? <Empty>No referrals yet.</Empty> : top.map(([id, n]) => <div key={id} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line2)' }}><span>{nameOf(id)}</span><b>{n}</b></div>)}
        </Card>
      </div>
      <Card title="All referrals">
        {rows.length === 0 ? <Empty>No referrals yet.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>Referred by</th><th>Friend</th><th>Phone</th><th>Side</th><th>Status</th><th>Reward</th><th>When</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td>{nameOf(r.referrerId)}</td><td><b>{r.name}</b></td><td>{r.phone}</td><td>{r.side}</td>
                <td><Badge tone={r.status === 'joined' ? 'ok' : 'neutral'}>{r.status}</Badge></td><td>{inr(r.reward)}</td><td>{when(r.joinedAt ?? r.invitedAt)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </Page>
  );
}
