export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const when = (ms?: number | null) => {
  if (!ms) return '—';
  const d = new Date(ms);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Today ${t}`;
  if (diff === -1) return `Yesterday ${t}`;
  if (diff === 1) return `Tomorrow ${t}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${t}`;
};
export const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/** Booking status in plain words, for badges. */
export const STATUS_LABEL: Record<string, string> = {
  payment_pending: 'awaiting payment', matching: 'finding expert', no_match: 'no expert found', assigned: 'expert on the way',
  arrived: 'expert arrived', in_progress: 'in progress', completed: 'completed', cancelled: 'cancelled',
};
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, ' ');

/** Midnight today, in ms. */
export const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
