import { useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';
import { BrandPanel } from '@/components/BrandPanel';
import { Check, Clock, Gift, Share2, UserPlus, Wallet } from '@/components/icons';
import { AppBar, Btn, Note, Screen, Tiny, shadow } from '@/components/ui';
import { applyReferral } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyReferrals, useReferralConfig } from '@/lib/db';
import { inr, whenLabel } from '@/lib/format';
import { useTheme } from '@/theme';

const APP_LINK = process.env.EXPO_PUBLIC_SHARE_URL ?? '';

/**
 * Refer & earn (customers only): her code, one Share button, her credit, and every friend she brought
 * with where they are (signed up → first booking done → credit added).
 */
export default function Refer() {
  const { c } = useTheme();
  const { profile } = useAuth();
  const cfg = useReferralConfig();
  const { rows: invites } = useMyReferrals();
  const reward = cfg?.customerReward ?? 50;
  const signup = Math.min(reward, cfg?.signupReward ?? 5);
  const rest = reward - signup;
  const on = cfg?.active ?? true;
  const code = profile?.referralCode ?? '';
  const credit = profile?.rewards ?? 0;
  // Credit already given per friend: the sign-up part, then all of it once they have booked.
  const paidFor = (r: (typeof invites)[number]) => r.paid ?? (r.status === 'joined' ? r.reward : r.signupPaid ?? 0);
  const earned = invites.reduce((n, r) => n + paidFor(r), 0);

  const share = async () => {
    const msg = [
      'I book house help on Sahayak — verified experts at your door in minutes, ₹99 an hour.',
      `Sign up and enter my code ${code} when the app asks "Did a friend invite you?"`,
      APP_LINK ? `Get the app: ${APP_LINK}` : '',
    ].filter(Boolean).join('\n\n');
    try { await Share.share({ message: msg }); } catch { /* closed the share sheet */ }
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Refer & earn" subtitle="Invite friends, get credit" back />
      <Screen>
        {/* Hero: the offer and her code */}
        <BrandPanel radius={26} style={{ padding: 20, gap: 16 }}>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20"><Gift size={24} color="#FFFFFF" /></View>
            <View className="flex-1">
              <Text className="font-jkx text-[24px] leading-[29px] text-white">Get {inr(reward)} for every friend</Text>
              <Text className="font-jkm text-[13px] text-white/85">{signup ? `${inr(signup)} when they sign up + ${inr(rest)} after their first booking` : 'when they finish their first booking'}</Text>
            </View>
          </View>
          <View className="flex-row items-center justify-between rounded-2xl border border-dashed border-white/50 bg-white/10 px-4 py-3">
            <View>
              <Text className="font-jkm text-[11px] uppercase tracking-[1.2px] text-white/75">Your code</Text>
              <Text className="font-jkx text-[26px] tracking-[4px] text-white" selectable>{code || '—'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Share your code" onPress={share} disabled={!code}
              className="flex-row items-center gap-2 rounded-xl bg-white px-4 py-3 active:opacity-85">
              <Share2 size={16} color={c.brand} />
              <Text className="font-jkx text-[14px] text-brand">Share</Text>
            </Pressable>
          </View>
          {!on ? <Text className="font-jkm text-[12.5px] text-white/90">Referral rewards are paused right now. Friends can still join with your code.</Text> : null}
        </BrandPanel>

        {/* Credit wallet */}
        <View className="flex-row items-center gap-3 rounded-[22px] bg-paper p-4 dark:bg-paper-dark" style={shadow}>
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-ok-soft dark:bg-ok-softdark"><Wallet size={20} color={c.ok} /></View>
          <View className="flex-1">
            <Text className="font-jkm text-[12.5px] text-ink3 dark:text-ink3-dark">Your Sahayak credit</Text>
            <Text className="font-jkx text-[24px] leading-[28px] text-ink dark:text-ink-dark">{inr(credit)}</Text>
            <Tiny>{credit > 0 ? 'Comes off your next booking. You can choose to use it at checkout.' : 'Credit from friends shows up here.'}</Tiny>
          </View>
          {earned ? <View className="items-end"><Tiny>Earned so far</Tiny><Text className="font-jkb text-[14px] text-ok dark:text-ok-dark">{inr(earned)}</Text></View> : null}
        </View>

        {/* How it works */}
        <View className="gap-3.5 rounded-[22px] bg-paper p-4 dark:bg-paper-dark">
          <Text className="font-jkb text-[16px] text-ink dark:text-ink-dark">How it works</Text>
          {[
            { n: '1', title: 'Share your code', sub: 'Send it on WhatsApp or to anyone who needs house help.' },
            { n: '2', title: signup ? `Friend signs up — you get ${inr(signup)}` : 'Your friend signs up', sub: 'They enter your code when the app asks "Did a friend invite you?"' },
            { n: '3', title: signup ? `First booking — you get ${inr(rest)} more` : `You get ${inr(reward)} credit`, sub: `That makes ${inr(reward)} for every friend who books.` },
          ].map((s) => (
            <View key={s.n} className="flex-row gap-3">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-soft dark:bg-brand-softdark"><Text className="font-jkx text-[13px] text-brand dark:text-brand-dark">{s.n}</Text></View>
              <View className="flex-1"><Text className="font-jkb text-[14px] text-ink dark:text-ink-dark">{s.title}</Text><Tiny>{s.sub}</Tiny></View>
            </View>
          ))}
        </View>

        {/* Her invites */}
        <Text className="mt-1 px-1 font-jkx text-[11px] uppercase tracking-[1.3px] text-ink3 dark:text-ink3-dark">Your invites</Text>
        {invites.length === 0 ? (
          <View className="items-center gap-2 rounded-[22px] bg-paper px-6 py-7 dark:bg-paper-dark">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sunk dark:bg-sunk-dark"><UserPlus size={22} color={c.ink3} /></View>
            <Text className="font-jkb text-[15px] text-ink dark:text-ink-dark">No friends yet</Text>
            <Tiny className="text-center">Friends who sign up with your code show up here.</Tiny>
            <Btn title="Share your code" size="sm" icon={<Share2 size={15} color={c.onBrand} />} onPress={share} />
          </View>
        ) : (
          <View className="overflow-hidden rounded-[22px] bg-paper dark:bg-paper-dark" style={shadow}>
            {invites.map((r, i) => {
              const done = r.status === 'joined';
              return (
                <View key={r.id} className={`flex-row items-center gap-3 px-4 py-3.5 ${i ? 'border-t border-line2 dark:border-line2-dark' : ''}`}>
                  <View className={`h-10 w-10 items-center justify-center rounded-full ${done ? 'bg-ok-soft dark:bg-ok-softdark' : 'bg-sunk dark:bg-sunk-dark'}`}>
                    {done ? <Check size={17} color={c.ok} /> : <Clock size={17} color={c.ink2} />}
                  </View>
                  <View className="flex-1">
                    <Text className="font-jkb text-[14.5px] text-ink dark:text-ink-dark" numberOfLines={1}>{r.name || 'A friend'}</Text>
                    <Tiny>{done ? `First booking done · ${whenLabel(r.joinedAt ?? r.invitedAt)}` : `Signed up · ${inr(Math.max(0, r.reward - paidFor(r)))} more after their first booking`}</Tiny>
                  </View>
                  <Text className={`font-jkx text-[14px] ${paidFor(r) ? 'text-ok dark:text-ok-dark' : 'text-ink3 dark:text-ink3-dark'}`}>{paidFor(r) ? `+${inr(paidFor(r))}` : inr(r.reward)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Joined without a code? She can still add one before her first booking. */}
        {profile && !profile.referredBy && !profile.firstBookingDone ? <AddCode /> : null}

        <Tiny className="px-1 text-center">Credit is used on bookings and cannot be withdrawn as cash. One code per new customer, added before their first booking.</Tiny>
      </Screen>
    </View>
  );
}

/** "Did a friend invite you?" for customers who skipped it at sign-up. */
function AddCode() {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const apply = async () => {
    setBusy(true); setErr('');
    try { const r = await applyReferral({ code }); setDone(r.signupReward ? `Code added. ${r.referrerName} got ${inr(r.signupReward)} and gets ${inr(r.reward - r.signupReward)} more after your first booking.` : `Code added. ${r.referrerName} gets ${inr(r.reward)} after your first booking.`); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  if (done) return <Note tone="ok">{done}</Note>;
  return (
    <View className="gap-3 rounded-[22px] bg-paper p-4 dark:bg-paper-dark">
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} className="flex-row items-center justify-between">
        <Text className="font-jkb text-[14.5px] text-ink dark:text-ink-dark">Did a friend invite you?</Text>
        <Text className="font-jkb text-[13px] text-brand dark:text-brand-dark">{open ? 'Close' : 'Add code'}</Text>
      </Pressable>
      {open ? (
        <>
          <View className="flex-row items-center gap-2">
            <TextInput value={code} onChangeText={(t) => { setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); setErr(''); }}
              placeholder="Friend's code" placeholderTextColor={c.ink3} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Friend's referral code"
              className="font-jkb flex-1 rounded-2xl bg-sunk px-4 py-3 text-[15px] tracking-[2px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
            <Btn title="Apply" size="sm" busy={busy} disabled={code.length < 4} onPress={apply} />
          </View>
          {err ? <Text className="font-jkm text-[12.5px] text-crit dark:text-crit-dark">{err}</Text> : null}
        </>
      ) : null}
    </View>
  );
}
