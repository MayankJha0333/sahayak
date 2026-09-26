import { useEffect, useState, type ReactNode } from 'react';

/* ---------- icons (24px line icons, drawn with the current text colour) ---------- */
const PATHS = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v4h-6zM4 20h6v-3H4z',
  bookings: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 14l2 2 4-4',
  experts: 'M12 3l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.5.9 2.5-2.2 1.6-.8 2.6-2.7-.1L12 20l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.5-.9-2.5 2.2-1.6.8-2.6 2.7.1zM9 11.5l2 2 4-4',
  payouts: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',
  areas: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  coupons: 'M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6zM14 5v2M14 11v2M14 17v2',
  waitlist: 'M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9',
  referrals: 'M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM3 7h18v4H3zM12 7v14M12 7S10.5 3 8 3a2 2 0 0 0 0 4M12 7s1.5-4 4-4a2 2 0 0 1 0 4',
  customers: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  live: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  rupee: 'M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  layers: 'M12 3 2 8l10 5 10-5zM2 16l10 5 10-5M2 12l10 5 10-5',
} as const;
export type IconName = keyof typeof PATHS;
export const Icon = ({ name, size }: { name: IconName; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

/* ---------- layout ---------- */
export const Page = ({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) => (
  <>
    <div className="head"><div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>{right ? <div className="row">{right}</div> : null}</div>
    <div className="grid">{children}</div>
  </>
);
export const Card = ({ title, sub, children, right, className }: { title?: string; sub?: string; children: ReactNode; right?: ReactNode; className?: string }) => (
  <section className={`card ${className ?? ''}`}>
    {title || right ? (
      <div className="card-head"><div>{title ? <h2>{title}</h2> : null}{sub ? <p className="sub">{sub}</p> : null}</div>{right}</div>
    ) : null}
    {children}
  </section>
);

/* ---------- numbers ---------- */
export const Stats = ({ children }: { children: ReactNode }) => <div className="stats">{children}</div>;
/** A big number with a plain-words label and, optionally, one line saying what it means. */
export const Stat = ({ label, value, hint, alert, tone, icon }: {
  label: string; value: ReactNode; hint?: string; alert?: boolean; tone?: 'brand' | 'ok' | 'warn'; icon?: IconName;
}) => (
  <div className={`stat ${alert ? 'alert' : tone ?? ''}`}>
    <span className="label">{icon ? <Icon name={icon} /> : null}{label}</span>
    <b>{value}</b>
    {hint ? <span className="hint">{hint}</span> : null}
  </div>
);

export type Tone = 'ok' | 'warn' | 'crit' | 'brand' | 'violet' | 'neutral';
export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => <span className={`badge ${tone}`}>{children}</span>;
export const Switch = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onChange(!on); }} />
);
export const Chip = ({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" className={`chip ${on ? 'on' : ''}`} onClick={onClick}>{children}</button>
);
export const Empty = ({ children, icon = 'check' }: { children: ReactNode; icon?: IconName }) => <div className="empty"><Icon name={icon} />{children}</div>;

/**
 * A button that runs an async action, shows it is busy, and reports failures next to itself.
 * With `confirm`, the first click asks inline ("Suspend her? · Yes · No") instead of a browser pop-up.
 */
export function Action({ children, run, tone, small, disabled, confirm }: {
  children: ReactNode; run: () => Promise<unknown>; tone?: 'sec' | 'danger'; small?: boolean; disabled?: boolean; confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const go = async () => {
    setBusy(true); setErr(''); setAsking(false);
    try { await run(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <span className="action" onClick={(e) => e.stopPropagation()}>
      {asking ? (
        <span className="confirm" role="alertdialog" aria-label={confirm}>
          <span>{confirm}</span>
          <button type="button" className={`btn ${tone === 'danger' ? 'danger' : ''} sm`} onClick={go} autoFocus>Yes</button>
          <button type="button" className="btn sec sm" onClick={() => setAsking(false)}>No</button>
        </span>
      ) : (
        <button type="button" className={`btn ${tone ?? ''} ${small ? 'sm' : ''}`} disabled={busy || disabled}
          onClick={() => (confirm ? setAsking(true) : void go())}>{busy ? 'Working…' : children}</button>
      )}
      {err ? <span className="err tiny">{err}</span> : null}
    </span>
  );
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  // Esc closes it, like any side panel.
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="drawer-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer glass" role="dialog">{children}</div>
    </div>
  );
}
