import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CalendarDays, Check, ChevronRight, MapPin } from '@/components/icons';
import { Btn, Card, Tiny } from '@/components/ui';
import { joinWaitlist } from '@/lib/api';
import { useServiceArea } from '@/lib/areas';
import { useAuth } from '@/lib/auth';
import { useMyWaitlist } from '@/lib/db';
import { km, type LatLng } from '@/lib/geo';
import { useTheme } from '@/theme';

const day = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });

/** "4.2 km" nearby, "577 km" far away. */
const dist = (m: number) => (m < 10_000 ? km(m) : `${Math.round(m / 1000)} km`);

/** Joining the waitlist for one address, and whether this person is already on it for (roughly) this spot. */
export function useWaitlistJoin(at: LatLng, line: string, city?: string) {
  const { user } = useAuth();
  const mine = useMyWaitlist(user?.uid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [joinedAt, setJoinedAt] = useState<LatLng | null>(null);
  const near = (p?: LatLng | null) => Boolean(p && Math.abs(p.lat - at.lat) < 0.01 && Math.abs(p.lng - at.lng) < 0.01);
  const onList = near(joinedAt) || Boolean(mine && mine.status === 'waiting' && near(mine.at));
  const join = async () => {
    setBusy(true); setErr('');
    try { await joinWaitlist({ at, line, city }); setJoinedAt(at); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return { onList, busy, err, join };
}

/**
 * Shown wherever an address is outside every live area: home, the address screen and checkout.
 * Tells the customer plainly that we don't serve there yet, when we will (if ops set a launch date),
 * how far the nearest live area is, and lets them join the waitlist in one tap.
 */
export function NotServed({ at, line, city, onChangeAddress, onMore }: { at: LatLng; line: string; city?: string; onChangeAddress?: () => void; /** Opens the full coming-soon page. */ onMore?: () => void }) {
  const { c } = useTheme();
  const { profile } = useAuth();
  const { coverage, loading } = useServiceArea();
  const { onList, busy, err, join } = useWaitlistJoin(at, line, city);
  if (loading) return null;
  const cov = coverage(at);
  if (cov.serving) return null;

  const opensAt = cov.soon?.opensAt ?? null;
  const phone = profile?.phone ? `+91 ${profile.phone.replace(/^\+91/, '').replace(/(\d{5})(\d{5})/, '$1 $2')}` : 'your number';

  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <View className={`h-11 w-11 items-center justify-center rounded-2xl ${onList ? 'bg-ok-soft dark:bg-ok-softdark' : 'bg-brand-soft dark:bg-brand-softdark'}`}>
          {onList ? <Check size={20} color={c.ok} /> : opensAt ? <CalendarDays size={20} color={c.brand} /> : <MapPin size={20} color={c.brand} />}
        </View>
        <View className="flex-1 gap-1">
          <Text className={`font-jkx text-[10.5px] uppercase tracking-[1.3px] ${onList ? 'text-ok dark:text-ok-dark' : 'text-brand dark:text-brand-dark'}`}>
            {onList ? 'You are on the waitlist' : opensAt ? 'Coming soon' : 'Not available here yet'}
          </Text>
          <Text className="font-jkb text-[17px] leading-[22px] text-ink dark:text-ink-dark">
            {onList
              ? opensAt ? `Sahayak starts in ${cov.soon!.name} on ${day(opensAt)}` : 'We will message you when we arrive'
              : opensAt ? `Sahayak starts in ${cov.soon!.name} on ${day(opensAt)}` : 'Service is currently not available in this area'}
          </Text>
          <Text className="font-jk text-[13px] leading-[19px] text-ink2 dark:text-ink2-dark">
            {onList
              ? opensAt
                ? `We'll message you on ${phone} that morning. You can book from 8 AM.`
                : `We'll message you on ${phone} the day experts start working near ${line.split(',').slice(-2).join(',').trim() || 'you'}.`
              : opensAt
                ? 'You can book from that day. Join the waitlist and we will remind you that morning.'
                : 'We are opening new areas every few weeks. Join the waitlist and we will tell you as soon as we reach you.'}
          </Text>
        </View>
      </View>

      {!onList && !opensAt && cov.nearest ? (
        <View className="flex-row items-center gap-2 rounded-2xl bg-sunk px-3 py-2.5 dark:bg-sunk-dark">
          <MapPin size={14} color={c.ink3} />
          <Tiny className="flex-1">Nearest area we serve: <Text className="font-jkb text-ink2 dark:text-ink2-dark">{cov.nearest.area.name}</Text>, {dist(cov.nearest.metres)} away</Tiny>
        </View>
      ) : null}

      {err ? <Tiny className="text-crit dark:text-crit-dark">{err}</Tiny> : null}
      {!onList ? (
        <View className="flex-row gap-2">
          <View className="flex-1"><Btn title="Join the waitlist" busy={busy} onPress={join} /></View>
          {onChangeAddress ? <View className="flex-1"><Btn title="Change address" tone="secondary" disabled={busy} onPress={onChangeAddress} /></View> : null}
        </View>
      ) : onChangeAddress ? <Btn title="Use another address" size="sm" tone="secondary" onPress={onChangeAddress} /> : null}
      {onMore ? (
        <Pressable accessibilityRole="button" onPress={onMore} hitSlop={6} className="flex-row items-center justify-center gap-1 pt-1">
          <Text className="font-jkb text-[13px] text-brand dark:text-brand-dark">{opensAt ? 'See launch details & share' : 'See what happens next & share'}</Text>
          <ChevronRight size={15} color={c.brand} />
        </Pressable>
      ) : null}
    </Card>
  );
}

/**
 * A one-line answer under the address map, updated as the pin moves:
 * "We serve this area" / "Coming to X on <date>" / "Service is not available in this area".
 */
export function AreaStatus({ at }: { at: LatLng }) {
  const { c } = useTheme();
  const { coverage, loading } = useServiceArea();
  if (loading) return null;
  const cov = coverage(at);
  const tone = cov.serving ? 'ok' : cov.soon ? 'warn' : 'crit';
  const bg = { ok: 'bg-ok-soft dark:bg-ok-softdark', warn: 'bg-warn-soft dark:bg-warn-softdark', crit: 'bg-crit-soft dark:bg-crit-softdark' }[tone];
  const fg = { ok: 'text-ok dark:text-ok-dark', warn: 'text-warn dark:text-warn-dark', crit: 'text-crit dark:text-crit-dark' }[tone];
  const Icon = cov.serving ? Check : cov.soon ? CalendarDays : MapPin;
  return (
    <View accessibilityLiveRegion="polite" className={`flex-row items-center gap-2.5 rounded-2xl px-3.5 py-3 ${bg}`}>
      <Icon size={16} color={cov.serving ? c.ok : cov.soon ? c.warn : c.crit} />
      <View className="flex-1">
        <Text className={`font-jkb text-[13.5px] ${fg}`}>
          {cov.serving ? `We serve this area · ${cov.serving.name}` : cov.soon ? `Coming to ${cov.soon.name} on ${day(cov.soon.opensAt!)}` : 'Service is not available in this area'}
        </Text>
        {!cov.serving && !cov.soon && cov.nearest ? <Tiny>Nearest area we serve: {cov.nearest.area.name}, {dist(cov.nearest.metres)} away</Tiny> : null}
      </View>
    </View>
  );
}
