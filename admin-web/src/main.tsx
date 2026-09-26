import 'leaflet/dist/leaflet.css';
import './styles.css';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, where } from 'firebase/firestore';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useCol } from './data';
import { auth, call, db, USE_EMULATORS } from './firebase';
import Areas from './pages/Areas';
import Bookings from './pages/Bookings';
import Coupons from './pages/Coupons';
import Customers from './pages/Customers';
import Experts from './pages/Experts';
import Overview from './pages/Overview';
import Payouts from './pages/Payouts';
import Referrals from './pages/Referrals';
import Waitlist from './pages/Waitlist';
import type { Partner, Waitlist as WaitlistRow } from './types';
import { Icon, type IconName } from './ui';

const PAGES = {
  overview: { label: 'Overview', C: Overview, icon: 'overview', group: 'Run the day' },
  bookings: { label: 'Bookings', C: Bookings, icon: 'bookings', group: 'Run the day' },
  experts: { label: 'Experts', C: Experts, icon: 'experts', group: 'Run the day' },
  payouts: { label: 'Payouts', C: Payouts, icon: 'payouts', group: 'Run the day' },
  areas: { label: 'Service areas', C: Areas, icon: 'areas', group: 'Grow' },
  waitlist: { label: 'Waitlist', C: Waitlist, icon: 'waitlist', group: 'Grow' },
  coupons: { label: 'Coupons', C: Coupons, icon: 'coupons', group: 'Grow' },
  referrals: { label: 'Referrals', C: Referrals, icon: 'referrals', group: 'Grow' },
  customers: { label: 'Customers', C: Customers, icon: 'customers', group: 'Grow' },
} as const satisfies Record<string, { label: string; icon: IconName; group: string; C: unknown }>;
type PageKey = keyof typeof PAGES;

const pageFromHash = (): { page: PageKey; param?: string } => {
  const [p, param] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { page: (p in PAGES ? p : 'overview') as PageKey, param };
};

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [admin, setAdmin] = useState<boolean | undefined>(undefined);
  const [route, setRoute] = useState(pageFromHash);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) { setAdmin(undefined); return; }
    return onSnapshot(doc(db, `admins/${user.uid}`), (s) => setAdmin(s.exists()), () => setAdmin(false));
  }, [user]);
  useEffect(() => { const f = () => setRoute(pageFromHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  if (user === undefined || (user && admin === undefined)) return <div className="login"><div className="skeleton" style={{ width: 220 }} /></div>;
  if (!user || !admin) return <Login notAdmin={Boolean(user && admin === false)} />;
  const { C } = PAGES[route.page];
  return (
    <div className="shell">
      <Sidebar page={route.page} email={user.email ?? ''} />
      <main className="main"><C param={route.param} /></main>
    </div>
  );
}

function Sidebar({ page, email }: { page: PageKey; email: string }) {
  const { rows: queue } = useCol<Partner>('partners', [where('kyc.status', '==', 'submitted')], 'queue');
  const { rows: waiting } = useCol<WaitlistRow>('waitlist', [where('status', '==', 'waiting')], 'waiting');
  const counts: Partial<Record<PageKey, number>> = { experts: queue.filter((p) => !p.bot).length, waitlist: waiting.length };
  const keys = Object.keys(PAGES) as PageKey[];
  return (
    <nav className="side" aria-label="Sections">
      <div className="logo"><i>S</i><div>Sahayak<small>Ops dashboard</small></div></div>
      {keys.map((k, i) => (
        <div key={k} style={{ display: 'contents' }}>
          {i === 0 || PAGES[keys[i - 1]].group !== PAGES[k].group ? <div className="group">{PAGES[k].group}</div> : null}
          <a href={`#/${k}`} className={`nav ${page === k ? 'on' : ''}`} aria-current={page === k ? 'page' : undefined}>
            <Icon name={PAGES[k].icon} />{PAGES[k].label}
            {counts[k] ? <span className="count" title={k === 'experts' ? 'Waiting for the Aadhaar check' : 'People waiting'}>{counts[k]}</span> : null}
          </a>
        </div>
      ))}
      <div className="foot">
        {USE_EMULATORS ? <span className="env">Local test data</span> : null}
        <div className="who"><b>{(email[0] ?? 'A').toUpperCase()}</b><span>{email}</span></div>
        <a className="out" href="#/overview" onClick={() => signOut(auth)}><Icon name="out" />Sign out</a>
      </div>
    </nav>
  );
}

function Login({ notAdmin }: { notAdmin: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e?: string, p?: string) => {
    setBusy(true); setErr('');
    try { await signInWithEmailAndPassword(auth, e ?? email, p ?? password); }
    catch (x) {
      const code = (x as { code?: string }).code ?? '';
      setErr(code === 'auth/network-request-failed' ? (USE_EMULATORS ? 'Cannot reach the local backend. Start it with: npm run firebase:emulators' : 'No internet connection.') : 'Wrong email or password.');
    } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={(ev) => { ev.preventDefault(); void go(); }}>
        <div className="logo" style={{ padding: 0 }}><i>S</i><div>Sahayak<small>Ops dashboard</small></div></div>
        <h1>Welcome back</h1>
        <p className="muted" style={{ margin: 0 }}>Staff only. Sign in with your ops account.</p>
        {notAdmin ? <p className="err">This account is not on the admins list. <a href="#/" onClick={() => signOut(auth)}>Use another account</a></p> : null}
        <label className="f">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="f">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {err ? <p className="err" style={{ margin: 0 }}>{err}</p> : null}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {USE_EMULATORS ? (
          <button type="button" className="btn sec" disabled={busy} onClick={async () => {
            setBusy(true);
            try { const r = await call<Record<string, never>, { email: string; password: string }>('devAdmin', {}); await go(r.email, r.password); }
            catch (e) { setErr((e as Error).message); setBusy(false); }
          }}>Use the test admin (emulator only)</button>
        ) : null}
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
