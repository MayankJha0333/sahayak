import { useState } from 'react';
import { recent, useCol } from '../data';
import { call } from '../firebase';
import { when } from '../format';
import type { Broadcast, User } from '../types';
import { Action, Badge, Card, Chip, Empty, Icon, Page, Stat, Stats } from '../ui';

type Audience = Broadcast['audience'];
const AUDIENCE: { key: Audience; label: string }[] = [
  { key: 'all', label: 'Everyone' }, { key: 'customers', label: 'Customers' }, { key: 'experts', label: 'Experts' },
];
const OPEN: { key: string; label: string; hint: string }[] = [
  { key: 'home', label: 'Home screen', hint: 'Their own home screen' },
  { key: 'book', label: 'Book a visit', hint: 'Customers: booking screen · experts: home' },
  { key: 'refer', label: 'Refer & earn', hint: 'Customers: refer page · experts: home' },
  { key: 'earnings', label: 'Earnings', hint: 'Experts: wallet · customers: home' },
];
/** Ready-made messages to start from. */
const TEMPLATES: { name: string; audience: Audience; title: string; body: string; open: string }[] = [
  { name: 'Weekend offer', audience: 'customers', open: 'book', title: 'Weekend clean? Save ₹50', body: 'Book any visit this weekend and save ₹50. An expert reaches you in about 10 minutes.' },
  { name: 'Refer a friend', audience: 'customers', open: 'refer', title: 'Give ₹50, get ₹50', body: 'Share your code with a friend. You both get credit when they book their first visit.' },
  { name: 'Busy hours', audience: 'experts', open: 'home', title: 'Lots of bookings right now', body: 'Go online in the next hour — customers near you are booking.' },
  { name: 'Service update', audience: 'all', open: 'home', title: 'A quick update from Sahayak', body: 'We have made booking faster and added live tracking for every visit.' },
];
const MAX_TITLE = 65;
const MAX_BODY = 240;

/** Send one message to everyone's phone. It also lands under the bell in the app, so people with push off still see it. */
export default function Notifications() {
  const { rows: users } = useCol<User>('users');
  const { rows: sent } = useCol<Broadcast>('broadcasts', recent('createdAt', 100));
  const [audience, setAudience] = useState<Audience>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState('home');
  const [msg, setMsg] = useState('');

  const real = users.filter((u) => u.id !== 'demo-customer');
  const counts = {
    all: real.length,
    customers: real.filter((u) => u.role === 'customer').length,
    experts: real.filter((u) => u.role === 'partner').length,
  };
  const reach = counts[audience];
  const ready = title.trim().length >= 3 && body.trim().length >= 3 && reach > 0;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const send = async () => {
    setMsg('');
    const r = await call<{ title: string; body: string; audience: Audience; open: string }, { recipients: number; pushed: number }>(
      'sendBroadcast', { title: title.trim(), body: body.trim(), audience, open });
    const who = `${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}`;
    setMsg(r.pushed
      ? `Sent to ${who}. ${r.pushed} phone${r.pushed === 1 ? '' : 's'} got a push, and it is under the bell in the app.`
      : `Sent to ${who}. It is under the bell in the app, and shows as a banner while the app is open.`);
    setTitle(''); setBody('');
  };

  return (
    <Page title="Notifications" sub="Send a message to people's phones. It also shows under the bell in the app, so nobody misses it. Booking updates go out by themselves.">
      <Stats>
        <Stat icon="customers" tone="brand" label="Customers" hint="Signed up in the app" value={counts.customers} />
        <Stat icon="experts" tone="ok" label="Experts" hint="Signed up as experts" value={counts.experts} />
        <Stat icon="bell" label="Sent this month" hint="Messages from ops" value={sent.filter((b) => b.createdAt >= monthStart.getTime()).length} />
      </Stats>

      <div className="cols">
        <Card title="New message" sub="Keep it short. People read the title first.">
          <div className="grid">
            <div className="row" style={{ gap: 8 }}>
              {TEMPLATES.map((t) => (
                <Chip key={t.name} onClick={() => { setAudience(t.audience); setTitle(t.title); setBody(t.body); setOpen(t.open); setMsg(''); }}>{t.name}</Chip>
              ))}
            </div>
            <div className="f-block">
              <span className="f-label">Who gets it</span>
              <div className="seg" role="radiogroup" aria-label="Who gets it">
                {AUDIENCE.map((a) => (
                  <button key={a.key} type="button" role="radio" aria-checked={audience === a.key} className={audience === a.key ? 'on' : ''} onClick={() => setAudience(a.key)}>
                    {a.label} · {counts[a.key]}
                  </button>
                ))}
              </div>
            </div>
            <label className="f">
              <span className="spread">Title<span className="tiny">{title.length}/{MAX_TITLE}</span></span>
              <input value={title} maxLength={MAX_TITLE} placeholder="Weekend clean? ₹50 off" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="f">
              <span className="spread">Message<span className="tiny">{body.length}/{MAX_BODY}</span></span>
              <textarea rows={3} value={body} maxLength={MAX_BODY} placeholder="Book any visit this weekend and save ₹50." onChange={(e) => setBody(e.target.value)} />
            </label>
            <label className="f">When they tap it
              <select value={open} onChange={(e) => setOpen(e.target.value)}>
                {OPEN.map((o) => <option key={o.key} value={o.key}>{o.label} — {o.hint}</option>)}
              </select>
            </label>
            <div className="row">
              <Action disabled={!ready} run={send} confirm={`Send to ${reach} ${reach === 1 ? 'person' : 'people'}?`}>
                <Icon name="bell" />Send to {AUDIENCE.find((a) => a.key === audience)!.label.toLowerCase()}
              </Action>
              {msg ? <span className="tiny" style={{ color: 'var(--ok)' }}>{msg}</span> : null}
            </div>
          </div>
        </Card>

        <Card title="How it looks" sub="On the lock screen, and under the bell in the app.">
          <div className="phone-preview">
            <div className="lock-time">9:41</div>
            <div className="push">
              <div className="push-app"><i>S</i><span>SAHAYAK</span><span className="tiny">now</span></div>
              <b>{title.trim() || 'Your title shows here'}</b>
              <p>{body.trim() || 'Your message shows here. Two or three short lines work best.'}</p>
            </div>
            <div className="inbox-row">
              <span className="dot" />
              <div><b>{title.trim() || 'Your title shows here'}</b><p>{body.trim() || 'Your message shows here.'}</p></div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Sent messages">
        {sent.length === 0 ? <Empty icon="bell">Nothing sent yet.</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th>When</th><th>To</th><th>Message</th><th>Reached</th><th>Phone pushes</th></tr></thead>
            <tbody>{sent.map((b) => (
              <tr key={b.id}>
                <td>{when(b.createdAt)}</td>
                <td><Badge tone={b.audience === 'experts' ? 'ok' : b.audience === 'customers' ? 'brand' : 'neutral'}>{AUDIENCE.find((a) => a.key === b.audience)?.label}</Badge></td>
                <td style={{ maxWidth: 420 }}><b>{b.title}</b><div className="tiny">{b.body}</div></td>
                <td>{b.status === 'sending' ? <Badge tone="warn">sending…</Badge> : b.recipients}</td>
                <td>{b.pushed ?? 0}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </Page>
  );
}
