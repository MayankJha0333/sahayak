import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Panel, couponSummary } from '@/components/admin';
import { Badge, Btn, Chip, Tiny, Title } from '@/components/ui';
import { couponId, deleteCoupon, saveCoupon } from '@/lib/api';
import { useAllCoupons } from '@/lib/db';
import { useTheme } from '@/theme';

type Form = { code: string; title: string; type: 'flat' | 'percent'; value: string; maxDiscount: string; minOrder: string; perUserLimit: string; totalLimit: string; days: string; firstOrderOnly: boolean; public: boolean };
const BLANK: Form = { code: '', title: '', type: 'flat', value: '', maxDiscount: '', minOrder: '', perUserLimit: '1', totalLimit: '', days: '', firstOrderOnly: false, public: true };

/** Discount codes. FIRST50 works until you save your own coupon called FIRST50. */
export default function AdminCoupons() {
  const { c } = useTheme();
  const { rows: coupons } = useAllCoupons();
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const num = (s: string) => (s.trim() ? Number(s) : undefined);

  const save = async () => {
    if (!f) return;
    const code = couponId(f.code);
    const value = Number(f.value);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) { setErr('Code: 3 to 20 letters or numbers.'); return; }
    if (!(value > 0) || (f.type === 'percent' && value > 90)) { setErr(f.type === 'percent' ? 'Percent must be 1 to 90.' : 'Enter the rupees off.'); return; }
    setBusy(true); setErr('');
    try {
      const prev = coupons.find((x) => x.id === code);
      const days = num(f.days);
      await saveCoupon({
        code, title: f.title.trim() || (f.type === 'percent' ? `${value}% off` : `₹${value} off`), type: f.type, value,
        ...(num(f.maxDiscount) ? { maxDiscount: num(f.maxDiscount) } : {}), ...(num(f.minOrder) ? { minOrder: num(f.minOrder) } : {}),
        perUserLimit: num(f.perUserLimit) ?? 1, ...(num(f.totalLimit) ? { totalLimit: num(f.totalLimit) } : {}),
        firstOrderOnly: f.firstOrderOnly, public: f.public, active: prev?.active ?? true, used: prev?.used ?? 0,
        startsAt: prev?.startsAt ?? Date.now(), endsAt: days ? Date.now() + days * 86_400_000 : prev?.endsAt ?? null, createdAt: prev?.createdAt ?? Date.now(),
      });
      setF(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const input = (key: keyof Form, placeholder: string, numeric = false) => (
    <TextInput value={String(f?.[key] ?? '')} onChangeText={(t) => setF((x) => (x ? { ...x, [key]: numeric ? t.replace(/[^\d]/g, '') : t } : x))} placeholder={placeholder}
      placeholderTextColor={c.ink3} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize={key === 'code' ? 'characters' : 'sentences'}
      className="font-jk rounded-xl bg-sunk px-3 py-2.5 text-[13px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View className="flex-row items-center justify-between">
        <Title>Coupons</Title>
        <Btn title="New coupon" size="sm" onPress={() => { setErr(''); setF(BLANK); }} />
      </View>
      {f ? (
        <Panel title="Coupon" wide>
          {input('code', 'CODE, e.g. DIWALI100')}
          {input('title', 'What customers see, e.g. ₹100 off this Diwali')}
          <View className="flex-row gap-2"><Chip label="₹ off" on={f.type === 'flat'} onPress={() => setF({ ...f, type: 'flat' })} /><Chip label="% off" on={f.type === 'percent'} onPress={() => setF({ ...f, type: 'percent' })} /></View>
          {input('value', f.type === 'percent' ? 'Percent off' : 'Rupees off', true)}
          {f.type === 'percent' ? input('maxDiscount', 'Most it can take off (₹, optional)', true) : null}
          {input('minOrder', 'Minimum booking (₹, optional)', true)}
          {input('perUserLimit', 'Uses per customer', true)}
          {input('totalLimit', 'Total uses (optional)', true)}
          {input('days', 'Expires in how many days (optional)', true)}
          <View className="flex-row flex-wrap gap-2">
            <Chip label="First booking only" on={f.firstOrderOnly} onPress={() => setF({ ...f, firstOrderOnly: !f.firstOrderOnly })} />
            <Chip label="Show in the app" on={f.public} onPress={() => setF({ ...f, public: !f.public })} />
          </View>
          {err ? <Text className="font-jkm text-[12.5px] text-crit dark:text-crit-dark">{err}</Text> : null}
          <View className="flex-row gap-2">
            <View className="flex-1"><Btn title="Save coupon" busy={busy} onPress={save} /></View>
            <View className="flex-1"><Btn title="Cancel" tone="secondary" onPress={() => setF(null)} /></View>
          </View>
        </Panel>
      ) : null}
      {!coupons.some((x) => x.id === 'FIRST50') ? <Tiny>FIRST50 (₹50 off the first booking) is built in. Save a coupon called FIRST50 to change or pause it.</Tiny> : null}
      {coupons.map((x) => {
        const expired = Boolean(x.endsAt && x.endsAt < Date.now());
        return (
          <Panel key={x.id} title={x.id} wide>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="font-jkb text-[14.5px] text-ink dark:text-ink-dark">{x.title}</Text>
                <Tiny>{couponSummary(x)}</Tiny>
                <Tiny>Used {x.used ?? 0}{x.totalLimit ? ` of ${x.totalLimit}` : ''} time{(x.used ?? 0) === 1 ? '' : 's'}{x.endsAt ? ` · ${expired ? 'expired' : `ends ${new Date(x.endsAt).toLocaleDateString('en-IN')}`}` : ''}{x.public ? '' : ' · hidden'}</Tiny>
              </View>
              <Badge tone={expired ? 'neutral' : x.active ? 'ok' : 'neutral'} label={expired ? 'expired' : x.active ? 'on' : 'off'} />
              <Switch value={x.active} onValueChange={(v) => { void saveCoupon({ ...x, active: v }); }} />
            </View>
            <View className="flex-row gap-2">
              <Btn title="Edit" size="sm" tone="secondary" onPress={() => setF({
                code: x.id, title: x.title, type: x.type, value: String(x.value), maxDiscount: x.maxDiscount ? String(x.maxDiscount) : '', minOrder: x.minOrder ? String(x.minOrder) : '',
                perUserLimit: String(x.perUserLimit ?? 1), totalLimit: x.totalLimit ? String(x.totalLimit) : '', days: '', firstOrderOnly: Boolean(x.firstOrderOnly), public: Boolean(x.public),
              })} />
              <Btn title="Delete" size="sm" tone="danger" onPress={() => deleteCoupon(x.id)} />
            </View>
          </Panel>
        );
      })}
    </ScrollView>
  );
}
