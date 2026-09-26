import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { BrandPanel } from '@/components/BrandPanel';
import { CreditCard, Lock, RotateCcw, ShieldCheck, Smartphone } from '@/components/icons';
import { AppBar, Btn, Screen, Tiny, shadow } from '@/components/ui';
import { useMyBookings } from '@/lib/db';
import { inr, whenLabel } from '@/lib/format';
import { bookingTitle } from '@/lib/mock';
import type { BookingDoc, WithId } from '@/lib/types';
import { useTheme } from '@/theme';

type B = WithId<BookingDoc>;

/** Everything one booking moved: what she paid, what came back, and what she saved. */
function money(b: B) {
  const extras = (b.extensions ?? []).reduce((n, x) => n + x.amount, 0) + (b.balance?.paid ? b.balance.amount : 0);
  const cancelled = b.status === 'cancelled' || b.status === 'no_match';
  const fee = b.status === 'cancelled' ? b.cancelFee ?? 0 : 0;
  const refunded = cancelled && b.paid ? Math.max(0, b.amountDue - fee) : 0;
  const paid = b.paid ? b.amountDue + extras : 0;
  return { paid, refunded, net: paid - refunded, saved: b.paid && !cancelled ? b.discount : 0, extras, fee };
}

/** Payments: totals at the top, how paying works, then one row per paid booking. */
export default function Payments() {
  const router = useRouter();
  const { c } = useTheme();
  const { rows, loading } = useMyBookings();
  const list = rows.filter((b) => b.paid);
  const sum = list.reduce((t, b) => { const m = money(b); return { net: t.net + m.net, saved: t.saved + m.saved, refunded: t.refunded + m.refunded }; }, { net: 0, saved: 0, refunded: 0 });

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Payments" subtitle="Your spends and refunds" back />
      <Screen>
        <BrandPanel radius={24} style={{ padding: 20, gap: 16 }}>
          <View>
            <Text className="font-jkm text-[13px] text-white/80">Total spent</Text>
            <Text className="font-jkx text-[34px] leading-[40px] text-white">{inr(sum.net)}</Text>
            <Text className="font-jkm text-[12.5px] text-white/80">{list.length} paid booking{list.length === 1 ? '' : 's'}</Text>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white/15 px-3.5 py-3">
              <Text className="font-jkm text-[12px] text-white/80">You saved</Text>
              <Text className="font-jkx text-[18px] text-white">{inr(sum.saved)}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/15 px-3.5 py-3">
              <Text className="font-jkm text-[12px] text-white/80">Refunded</Text>
              <Text className="font-jkx text-[18px] text-white">{inr(sum.refunded)}</Text>
            </View>
          </View>
        </BrandPanel>

        {/* How paying works, in three short lines */}
        <View className="gap-3.5 rounded-[22px] bg-paper p-4 dark:bg-paper-dark" style={shadow}>
          <Text className="font-jkb text-[16px] text-ink dark:text-ink-dark">How you pay</Text>
          {[
            { Icon: Smartphone, title: 'UPI, cards or net banking', sub: 'Pick any when you book — no saved card needed' },
            { Icon: Lock, title: 'Secure checkout by Razorpay', sub: 'We never see or store your card details' },
            { Icon: RotateCcw, title: 'Refunds go back the same way', sub: 'Usually in 5–7 working days' },
          ].map(({ Icon, title, sub }) => (
            <View key={title} className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft dark:bg-brand-softdark"><Icon size={17} color={c.brand} /></View>
              <View className="flex-1"><Text className="font-jkb text-[14px] text-ink dark:text-ink-dark">{title}</Text><Tiny>{sub}</Tiny></View>
            </View>
          ))}
        </View>

        <Text className="mt-1 px-1 font-jkx text-[11px] uppercase tracking-[1.3px] text-ink3 dark:text-ink3-dark">Payment history</Text>
        {loading ? null : list.length === 0 ? (
          <View className="items-center gap-2 rounded-[22px] bg-paper px-6 py-8 dark:bg-paper-dark">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sunk dark:bg-sunk-dark"><CreditCard size={22} color={c.ink3} /></View>
            <Text className="font-jkb text-[16px] text-ink dark:text-ink-dark">No payments yet</Text>
            <Tiny className="text-center">Your first booking will show up here with its receipt details.</Tiny>
            <Btn title="Book an expert" size="sm" onPress={() => router.replace('/customer')} />
          </View>
        ) : (
          <View className="overflow-hidden rounded-[22px] bg-paper dark:bg-paper-dark" style={shadow}>
            {list.map((b, i) => {
              const m = money(b);
              const back = m.refunded > 0;
              const tone = back ? { bg: 'bg-ok-soft dark:bg-ok-softdark', fg: 'text-ok dark:text-ok-dark', label: m.fee ? `Refunded ${inr(m.refunded)}` : 'Refunded' }
                : b.status === 'completed' ? { bg: 'bg-sunk dark:bg-sunk-dark', fg: 'text-ink2 dark:text-ink2-dark', label: 'Paid' }
                : { bg: 'bg-brand-soft dark:bg-brand-softdark', fg: 'text-brand dark:text-brand-dark', label: 'Paid · upcoming' };
              return (
                <View key={b.id} className={`flex-row items-center gap-3 px-4 py-3.5 ${i ? 'border-t border-line2 dark:border-line2-dark' : ''}`}>
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-sunk dark:bg-sunk-dark">
                    {back ? <RotateCcw size={17} color={c.ok} /> : <ShieldCheck size={17} color={c.ink2} />}
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text className="font-jkb text-[14.5px] text-ink dark:text-ink-dark" numberOfLines={1}>{bookingTitle(b)} · {b.durationMin / 60} hr</Text>
                    <Tiny>{whenLabel(b.createdAt)}{m.saved ? ` · saved ${inr(m.saved)}` : ''}{m.extras ? ` · +${inr(m.extras)} extra time` : ''}</Tiny>
                  </View>
                  <View className="items-end gap-1">
                    <Text className={`font-jkx text-[15px] ${back ? 'text-ink3 line-through dark:text-ink3-dark' : 'text-ink dark:text-ink-dark'}`}>{inr(m.paid)}</Text>
                    <View className={`rounded-md px-1.5 py-0.5 ${tone.bg}`}><Text className={`font-jkb text-[10.5px] ${tone.fg}`}>{tone.label}</Text></View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <Tiny className="px-1 text-center">Need a GST invoice or have a payment problem? Write to us from Help & support.</Tiny>
      </Screen>
    </View>
  );
}
