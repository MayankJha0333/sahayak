import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { Check, Tag } from '@/components/icons';
import { AppBar, Btn, Note, Screen, Tiny, shadow } from '@/components/ui';
import { listMyCoupons, previewCoupon, type CouponInfo } from '@/lib/api';
import { pickCoupon } from '@/lib/bookingDraft';
import { inr } from '@/lib/format';
import { useTheme } from '@/theme';

type Offer = CouponInfo & { amount: number };
type Locked = CouponInfo & { reason: string };

const until = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** "₹50" / "20%" — the big number on the left of the ticket. */
const face = (c: CouponInfo) => (c.type === 'percent' ? `${c.value}%` : inr(c.value));

/** The small print under a coupon, in plain words. */
function terms(c: CouponInfo) {
  const t: string[] = [];
  if (c.type === 'percent' && c.maxDiscount) t.push(`Up to ${inr(c.maxDiscount)} off`);
  if (c.minOrder) t.push(`Min booking ${inr(c.minOrder)}`);
  if (c.firstOrderOnly) t.push('First booking only');
  if (c.endsAt) t.push(`Valid till ${until(c.endsAt)}`);
  return t.join(' · ');
}

/**
 * Apply coupon: every offer she can use on this booking, best saving first, and the ones that do not
 * fit yet with the reason. Picking one hands it back to the review screen; the server checks it again when she pays.
 */
export default function Coupons() {
  const router = useRouter();
  const { c } = useTheme();
  const { price: priceParam, applied } = useLocalSearchParams<{ price: string; applied?: string }>();
  const price = Number(priceParam) || 0;

  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [locked, setLocked] = useState<Locked[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let live = true;
    listMyCoupons({ price })
      .then((r) => { if (live) { setOffers(r.coupons); setLocked(r.unavailable ?? []); setLoadErr(''); } })
      .catch((e) => { if (live) { setOffers([]); setLoadErr((e as Error).message || 'Could not load offers.'); } });
    return () => { live = false; };
  }, [price, attempt]);

  const choose = (o: { code: string; title: string; amount: number }) => { pickCoupon(o); router.back(); };
  const remove = () => { pickCoupon(null); router.back(); };

  const applyTyped = async () => {
    const want = code.trim().toUpperCase();
    if (want.length < 3) return;
    Keyboard.dismiss();
    setChecking(true); setCodeErr('');
    try { choose(await previewCoupon({ code: want, price })); }
    catch (e) { setCodeErr((e as Error).message); }
    finally { setChecking(false); }
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Apply coupon" subtitle={`For your ${inr(price)} booking`} back />
      <Screen>
        {/* Typed code */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2 rounded-[20px] border border-line bg-paper px-4 py-1.5 dark:border-line-dark dark:bg-paper-dark">
            <Tag size={18} color={c.ink3} />
            <TextInput value={code} onChangeText={(t) => { setCode(t.toUpperCase().replace(/\s/g, '')); setCodeErr(''); }}
              placeholder="Enter coupon code" placeholderTextColor={c.ink3} autoCapitalize="characters" autoCorrect={false}
              returnKeyType="done" onSubmitEditing={applyTyped} accessibilityLabel="Coupon code"
              className="font-jkb flex-1 py-3 text-[15px] tracking-[1px] text-ink dark:text-ink-dark" />
            <Pressable accessibilityRole="button" disabled={checking || code.trim().length < 3} onPress={applyTyped} hitSlop={8}>
              {checking ? <ActivityIndicator size="small" color={c.brand} />
                : <Text className={`font-jkx text-[14px] ${code.trim().length < 3 ? 'text-ink3 dark:text-ink3-dark' : 'text-brand dark:text-brand-dark'}`}>APPLY</Text>}
            </Pressable>
          </View>
          {codeErr ? <Text className="px-1 font-jkm text-[12.5px] text-crit dark:text-crit-dark">{codeErr}</Text> : null}
        </View>

        {offers === null ? (
          <View className="items-center gap-2 py-10">
            <ActivityIndicator color={c.brand} />
            <Tiny>Finding offers for you…</Tiny>
          </View>
        ) : loadErr ? (
          <View className="gap-3">
            <Note tone="crit">{loadErr}</Note>
            <Btn title="Try again" tone="secondary" size="sm" onPress={() => { setOffers(null); setAttempt((n) => n + 1); }} />
          </View>
        ) : (
          <>
            <Text className="mt-1 px-1 font-jkx text-[11px] uppercase tracking-[1.3px] text-ink3 dark:text-ink3-dark">
              {offers.length ? 'Best offers for you' : 'Offers'}
            </Text>
            {offers.length === 0 ? (
              <View className="items-center gap-2 rounded-[22px] bg-paper px-6 py-8 dark:bg-paper-dark">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sunk dark:bg-sunk-dark"><Tag size={22} color={c.ink3} /></View>
                <Text className="font-jkb text-[16px] text-ink dark:text-ink-dark">No offers for this booking</Text>
                <Tiny className="text-center">New offers show up here. Have a code from a friend or an ad? Type it above.</Tiny>
              </View>
            ) : null}

            {offers.map((o) => {
              const on = applied === o.code;
              return (
                <Ticket key={o.code} coupon={o} tone={c.brand}
                  saving={`You save ${inr(o.amount)} on this booking`}
                  action={on ? (
                    <View className="flex-row items-center gap-3">
                      <View className="flex-row items-center gap-1"><Check size={14} color={c.ok} /><Text className="font-jkx text-[13px] text-ok dark:text-ok-dark">APPLIED</Text></View>
                      <Pressable accessibilityRole="button" hitSlop={8} onPress={remove}><Text className="font-jkb text-[13px] text-crit dark:text-crit-dark">Remove</Text></Pressable>
                    </View>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Apply ${o.code}`} hitSlop={8} onPress={() => choose(o)}
                      className="rounded-full bg-brand px-4 py-2 active:opacity-85">
                      <Text className="font-jkx text-[13px] text-onbrand">APPLY</Text>
                    </Pressable>
                  )} />
              );
            })}

            {locked.length ? (
              <>
                <Text className="mt-3 px-1 font-jkx text-[11px] uppercase tracking-[1.3px] text-ink3 dark:text-ink3-dark">More offers</Text>
                {locked.map((o) => (
                  <Ticket key={o.code} coupon={o} tone={c.ink3} dim reason={o.reason} />
                ))}
              </>
            ) : null}
          </>
        )}

        <Tiny className="px-1 text-center">One coupon per booking. The saving is checked again when you pay.</Tiny>
      </Screen>
    </View>
  );
}

/** A coupon drawn as a ticket: the saving on a coloured stub, the details on the right. */
function Ticket({ coupon, tone, saving, reason, action, dim }: {
  coupon: CouponInfo; tone: string; saving?: string; reason?: string; action?: React.ReactNode; dim?: boolean;
}) {
  const { c } = useTheme();
  const small = terms(coupon);
  return (
    <View className="flex-row overflow-hidden rounded-[22px] bg-paper dark:bg-paper-dark" style={dim ? undefined : shadow}>
      <View style={{ width: 74, backgroundColor: tone, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, opacity: dim ? 0.55 : 1 }}>
        <Text className="font-jkx text-[20px] text-white" numberOfLines={1} adjustsFontSizeToFit>{face(coupon)}</Text>
        <Text className="font-jkx text-[11px] tracking-[1.5px] text-white/90">OFF</Text>
      </View>
      {/* Punched edge between stub and body */}
      <View style={{ width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, marginVertical: 10 }} />
      <View className="flex-1 gap-1.5 px-4 py-3.5">
        <View className="flex-row items-center justify-between gap-2">
          <View className="rounded-lg border border-dashed border-line px-2 py-1 dark:border-line-dark">
            <Text className={`font-jkx text-[13px] tracking-[1.2px] ${dim ? 'text-ink3 dark:text-ink3-dark' : 'text-ink dark:text-ink-dark'}`}>{coupon.code}</Text>
          </View>
          {action}
        </View>
        <Text className={`font-jkb text-[15px] leading-[20px] ${dim ? 'text-ink2 dark:text-ink2-dark' : 'text-ink dark:text-ink-dark'}`}>{coupon.title}</Text>
        {coupon.description ? <Tiny>{coupon.description}</Tiny> : null}
        {saving ? <Text className="font-jkb text-[13px] text-ok dark:text-ok-dark">{saving}</Text> : null}
        {reason ? <Text className="font-jkb text-[13px] text-warn dark:text-warn-dark">{reason}</Text> : null}
        {small ? <Tiny className="border-t border-dashed border-line pt-1.5 dark:border-line-dark">{small}</Tiny> : null}
      </View>
    </View>
  );
}
