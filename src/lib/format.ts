export const inr = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN');

export const mins = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}h ${n % 60 ? `${n % 60}m` : ''}`.trim() : `${n} min`);

export const clock = (ms: number) => {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export const mmss = (secs: number) => {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** "Today · 8:00 AM", "Tomorrow · 9:30 AM", "Wed 24 Sep · 11:00 AM" */
export const whenLabel = (ms: number, now = Date.now()) => {
  const d = new Date(ms); const t = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(t)) / 86_400_000);
  const dayPart = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday'
    : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
  return `${dayPart} · ${clock(ms)}`;
};

export const dayName = (i: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i];

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** "+919999999999" → "+91 99999 99999" */
export const phonePretty = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : p;
};
