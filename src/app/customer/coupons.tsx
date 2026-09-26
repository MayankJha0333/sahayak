import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { BrandPanel } from '@/components/BrandPanel';
import { Check, ChevronDown, Lock, Tag, X } from '@/components/icons';
import { AppBar, Btn, Note, Screen, Tiny, shadow } from '@/components/ui';
import { listMyCoupons, previewCoupon, type CouponInfo } from '@/lib/api';
import { pickCoupon } from '@/lib/bookingDraft';
import { inr } from '@/lib/format';
import { useTheme } from '@/theme';

type Offer = CouponInfo & { amount: number };
type Locked = CouponInfo & { reason: string };

const until = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** "₹50" / "20%" — the saving shown on the badge. */
const face = (c: CouponInfo) => (c.type === 'percent' ? `${c.value}%` : inr(c.value));

/** The rules of a coupon, one per line, in plain words. */
function rules(c: CouponInfo) {
  const t: string[] = [];
  if (c.type === 'percent') t.push(c.maxDiscount ? `${c.value}% off, up to ${inr(c.maxDiscount)}` : `${c.value}% off the booking`);
  else t.push(`${inr(c.value)} off the booking`);
  if (c.minOrder) t.push(`For bookings of ${inr(c.minOrder)} or more`);
  if (c.firstOrderOnly) t.push('Only on your first booking');
  if (c.endsAt) t.push(`Valid till ${until(c.endsAt)}`);
  t.push('One coupon per booking');
  return t;
}

/**
 * Apply coupon: every offer she can use on this booking (best saving first, the top one called out),
 * then the ones that do not fit yet with the reason. Picking one hands it back to the review screen;
 * the server checks it again when she pays.
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
  const [focused, setFocused] = useState(false);

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

  const best = offers?.[0];
  const ready = code.trim().length >= 3;

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Coupons & offers" subtitle={`Booking total ${inr(price)}`} back />
      <Screen>
        {/* Typed code */}
        <View className="gap-1.5">
          <View className={`flex-row items-center gap-3 rounded-[18px] border-[1.5px] bg-paper pl-4 pr-2 dark:bg-paper-dark ${codeErr ? 'border-crit dark:border-crit-dark' : focused ? 'border-brand dark:border-brand-dark' : 'border-line dark:border-line-dark'}`}>
            <Tag size={18} color={focused ? c.brand : c.ink3} />
            <TextInput value={code} onChangeText={(t) => { setCode(t.toUpperCase().replace(/\s/g, '')); setCodeErr(''); }}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              placeholder="Have a code? Type it here" placeholderTextColor={c.ink3} autoCapitalize="characters" autoCorrect={false}
              returnKeyType="done" onSubmitEditing={applyTyped} accessibilityLabel="Coupon code"
              className="font-jkb flex-1 py-4 text-[15px] tracking-[1px] text-ink dark:text-ink-dark" />
            {code ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear code" hitSlop={8} onPress={() => { setCode(''); setCodeErr(''); }}>
                <X size={16} color={c.ink3} />
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" disabled={checking || !ready} onPress={applyTyped}
              className={`rounded-xl px-4 py-2.5 ${ready ? 'bg-brand' : 'bg-sunk dark:bg-sunk-dark'}`}>
              {checking ? <ActivityIndicator size="small" color={c.onBrand} />
                : <Text className={`font-jkx text-[13px] ${ready ? 'text-onbrand' : 'text-ink3 dark:text-ink3-dark'}`}>APPLY</Text>}
            </Pressable>
          </View>
          {codeErr ? <Text className="px-1 font-jkm text-[12.5px] text-crit dark:text-crit-dark">{codeErr}</Text> : null}
        </View>

        {offers === null ? (
          <View className="gap-3">{[0, 1, 2].map((i) => <View key={i} className="h-[112px] rounded-[20px] bg-paper opacity-60 dark:bg-paper-dark" />)}</View>
        ) : loadErr ? (
          <View className="gap-3">
            <Note tone="crit">{loadErr}</Note>
            <Btn title="Try again" tone="secondary" size="sm" onPress={() => { setOffers(null); setAttempt((n) => n + 1); }} />
          </View>
        ) : (
          <>
            {/* The best saving, called out */}
            {best && applied !== best.code ? (
              <BrandPanel radius={22} style={{ padding: 18, gap: 12 }}>
                <View className="flex-row items-center gap-2">
                  <View className="rounded-full bg-white/20 px-2.5 py-1"><Text className="font-jkx text-[10.5px] uppercase tracking-[1.2px] text-white">Best offer</Text></View>
                  <Text className="font-jkm text-[12.5px] text-white/85">for this booking</Text>
                </View>
                <View className="flex-row items-end justify-between gap-3">
                  <View className="flex-1">
                    <Text className="font-jkx text-[26px] leading-[30px] text-white">Save {inr(best.amount)}</Text>
                    <Text className="font-jkm text-[13.5px] text-white/90">with <Text className="font-jkx tracking-[1px] text-white">{best.code}</Text> · pay {inr(Math.max(0, price - best.amount))}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Apply ${best.code}`} onPress={() => choose(best)}
                    className="rounded-2xl bg-white px-5 py-3 active:opacity-85">
                    <Text className="font-jkx text-[14px] text-brand">APPLY</Text>
                  </Pressable>
                </View>
              </BrandPanel>
            ) : null}

            <Text className="mt-1 px-1 font-jkx text-[11px] uppercase tracking-[1.3px] text-ink3 dark:text-ink3-dark">
              {offers.length ? `${offers.length} offer${offers.length > 1 ? 's' : ''} for you` : 'Offers'}
            </Text>
            {offers.length === 0 ? (
              <View className="items-center gap-2 rounded-[22px] bg-paper px-6 py-8 dark:bg-paper-dark">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sunk dark:bg-sunk-dark"><Tag size={22} color={c.ink3} /></View>
                <Text className="font-jkb text-[16px] text-ink dark:text-ink-dark">No offers for this booking</Text>
                <Tiny className="text-center">New offers show up here. Got a code from a friend or an ad? Type it above.</Tiny>
              </View>
            ) : null}

            {offers.map((o, i) => (
              <Ticket key={o.code} coupon={o} best={i === 0 && offers.length > 1} on={applied === o.code}
                saving={`Save ${inr(o.amount)} on this booking`}
                onApply={() => choose(o)} onRemove={remove} />
            ))}

            {locked.length ? (
              <>
                <Text className="mt-3 px-1 font-jkx text-[11px] uppercase tracking-[1.3px] text-ink3 dark:text-ink3-dark">Not for this booking yet</Text>
                {locked.map((o) => <Ticket key={o.code} coupon={o} reason={o.reason} />)}
              </>
            ) : null}
          </>
        )}

        <Tiny className="px-1 text-center">Coupons are checked again when you pay. You can remove one any time before paying.</Tiny>
      </Screen>
    </View>
  );
}

/** One coupon as a ticket: badge, code and saving on top, a punched line, then the rules (tap to open). */
function Ticket({ coupon, saving, reason, best, on, onApply, onRemove }: {
  coupon: CouponInfo; saving?: string; reason?: string; best?: boolean; on?: boolean; onApply?: () => void; onRemove?: () => void;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const off = Boolean(reason);
  const list = rules(coupon);
  return (
    <View className={`rounded-[20px] bg-paper dark:bg-paper-dark ${on ? 'border-[1.5px] border-ok dark:border-ok-dark' : ''}`} style={off ? undefined : shadow}>
      <View className="flex-row items-center gap-3 p-4">
        <View className={`h-[58px] w-[58px] items-center justify-center rounded-2xl ${off ? 'bg-sunk dark:bg-sunk-dark' : 'bg-brand-soft dark:bg-brand-softdark'}`}>
          <Text className={`font-jkx text-[17px] ${off ? 'text-ink3 dark:text-ink3-dark' : 'text-brand dark:text-brand-dark'}`} numberOfLines={1} adjustsFontSizeToFit>{face(coupon)}</Text>
          <Text className={`font-jkx text-[9.5px] tracking-[1.5px] ${off ? 'text-ink3 dark:text-ink3-dark' : 'text-brand dark:text-brand-dark'}`}>OFF</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text className={`font-jkx text-[14px] tracking-[1.2px] ${off ? 'text-ink2 dark:text-ink2-dark' : 'text-ink dark:text-ink-dark'}`}>{coupon.code}</Text>
            {best ? <View className="rounded-md bg-ok-soft px-1.5 py-0.5 dark:bg-ok-softdark"><Text className="font-jkx text-[9px] tracking-[0.8px] text-ok dark:text-ok-dark">BEST</Text></View> : null}
          </View>
          <Text className={`font-jkm text-[13.5px] leading-[18px] ${off ? 'text-ink3 dark:text-ink3-dark' : 'text-ink2 dark:text-ink2-dark'}`} numberOfLines={2}>{coupon.title}</Text>
          {saving ? <Text className="font-jkb text-[13px] text-ok dark:text-ok-dark">{saving}</Text> : null}
          {reason ? (
            <View className="flex-row items-center gap-1"><Lock size={12} color={c.warn} /><Text className="font-jkb text-[12.5px] text-warn dark:text-warn-dark">{reason}</Text></View>
          ) : null}
        </View>
        {off ? null : on ? (
          <View className="items-end gap-1.5">
            <View className="flex-row items-center gap-1"><Check size={14} color={c.ok} /><Text className="font-jkx text-[12.5px] text-ok dark:text-ok-dark">APPLIED</Text></View>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onRemove}><Text className="font-jkb text-[12.5px] text-crit dark:text-crit-dark">Remove</Text></Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Apply ${coupon.code}`} hitSlop={8} onPress={onApply}
            className="rounded-xl border-[1.5px] border-brand px-3.5 py-2 active:opacity-80 dark:border-brand-dark">
            <Text className="font-jkx text-[12.5px] text-brand dark:text-brand-dark">APPLY</Text>
          </Pressable>
        )}
      </View>

      {/* Punched edge: two half holes and a dashed line, like a paper coupon */}
      <View className="flex-row items-center" style={{ height: 14 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: c.ground }} />
        <View style={{ flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, marginHorizontal: 6 }} />
        <View style={{ width: 14, height: 14, borderRadius: 7, marginRight: -7, backgroundColor: c.ground }} />
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="gap-2 px-4 pb-3.5 pt-2">
        <View className="flex-row items-center justify-between">
          <Tiny>{coupon.endsAt ? `Valid till ${until(coupon.endsAt)}` : coupon.firstOrderOnly ? 'First booking only' : 'No expiry'}</Tiny>
          <View className="flex-row items-center gap-1">
            <Text className="font-jkb text-[12px] text-ink2 dark:text-ink2-dark">{open ? 'Hide details' : 'Details'}</Text>
            <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><ChevronDown size={14} color={c.ink2} /></View>
          </View>
        </View>
        {open ? (
          <View className="gap-1.5">
            {coupon.description ? <Text className="font-jk text-[13px] leading-[19px] text-ink2 dark:text-ink2-dark">{coupon.description}</Text> : null}
            {list.map((r) => (
              <View key={r} className="flex-row gap-2">
                <Text className="text-[13px] text-ink3 dark:text-ink3-dark">•</Text>
                <Text className="font-jk flex-1 text-[12.5px] leading-[18px] text-ink2 dark:text-ink2-dark">{r}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
