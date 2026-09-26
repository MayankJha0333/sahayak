import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandPanel } from '@/components/BrandPanel';
import { ChevronRight } from '@/components/icons';
import { SearchMap } from '@/components/SearchMap';
import { TrackingMap } from '@/components/TrackingMap';
import { Avatar, Badge, Body, Btn, Card, Eyebrow, H, Note, Tiny } from '@/components/ui';
import { acceptOffer, declineOffer, devTestJob, seedDemo, setOnShift } from '@/lib/api';
import { USE_EMULATORS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAllPartners, useBooking, useMyJob, useMyOffer, usePartnerBookings } from '@/lib/db';
import { distanceM, etaMinutes, km } from '@/lib/geo';
import { inr, mmss } from '@/lib/format';
import { PARTNER_SHARE, bookingTitle, expertPay } from '@/lib/mock';
import { useTheme } from '@/theme';

const payout = (b: { price: number; extraMin: number; tip: number }) => expertPay(b).total;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The partner's day: one switch to go online, and whatever job is live right now. */
export default function PartnerJobs() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { partner, user } = useAuth();
  const offer = useMyOffer();
  const offered = useBooking(offer?.bookingId);
  const job = useMyJob();
  const { rows: mine } = usePartnerBookings();
  const { rows: partners } = useAllPartners();
  const [now, setNow] = useState(() => Date.now());
  const [seeding, setSeeding] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testErr, setTestErr] = useState('');
  const [answering, setAnswering] = useState<'accept' | 'skip' | null>(null);
  const [offerErr, setOfferErr] = useState('');

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (!partner || !user) return null;
  const today = mine.filter((b) => b.status === 'completed' && (b.endedAt ?? b.createdAt) >= startOfToday());
  const todayEarnings = today.reduce((n, b) => n + payout(b), 0);
  const online = partners.filter((p) => p.onShift && p.id !== user.uid).length;
  const toggle = async (v: boolean) => {
    if (v && partner.suspended) { Alert.alert('Account on hold', partner.suspendReason || 'Please call support to find out more.'); return; }
    setToggling(true);
    try { await setOnShift(v); }
    catch { Alert.alert('Could not go online', 'Check your internet and try again.'); }
    finally { setToggling(false); }
  };

  return (
    <ScrollView
      className="flex-1 bg-ground dark:bg-ground-dark"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, gap: 14, paddingTop: insets.top + 8, paddingBottom: 32 }}>

      {partner.suspended ? <Note tone="crit">Your account is on hold{partner.suspendReason ? `: ${partner.suspendReason}` : ''}. You cannot go online until our team restores it.</Note> : null}
      <BrandPanel radius={34} style={{ gap: 20, paddingHorizontal: 20, paddingVertical: 20 }}>
        <View className="flex-row items-center gap-3">
          <Avatar initials={partner.initials} size={42} />
          <View className="flex-1">
            <Eyebrow>{partner.hub} hub</Eyebrow>
            <Text className="font-jkb text-[17px] text-white">{partner.name}</Text>
          </View>
        </View>

        <Pressable accessibilityRole="switch" accessibilityState={{ checked: partner.onShift }} onPress={() => toggle(!partner.onShift)} disabled={toggling}
          className={`flex-row items-center gap-3 rounded-4xl border p-4 ${partner.onShift ? 'border-ok bg-ok/15 dark:border-ok-dark' : 'border-white/15 bg-white/10'}`}>
          <View className="flex-1">
            <Text className="font-jkb text-[17px] text-white">{partner.onShift ? 'You are online' : 'You are offline'}</Text>
            <Text className="font-jk text-[12px] text-white/70">{partner.onShift ? 'Jobs near you come here first. Your location is shared while online.' : 'Switch on to start receiving jobs.'}</Text>
          </View>
          <Switch value={partner.onShift} onValueChange={toggle} disabled={toggling} trackColor={{ true: c.ok, false: 'rgba(255,255,255,0.25)' }} thumbColor="#FFFFFF" />
        </Pressable>

        <View className="flex-row gap-3">
          <View className="flex-1 rounded-3xl border border-white/15 bg-white/10 p-3.5">
            <Text className="font-jkx text-[10px] uppercase tracking-[1.2px] text-white/60">Today</Text>
            <Text className="font-jkx text-[22px] text-white">{inr(todayEarnings)}</Text>
            <Text className="font-jk text-[11.5px] text-white/60">{today.length} job{today.length === 1 ? '' : 's'}</Text>
          </View>
          <View className="flex-1 rounded-3xl border border-white/15 bg-white/10 p-3.5">
            <Text className="font-jkx text-[10px] uppercase tracking-[1.2px] text-white/60">Rating</Text>
            <Text className="font-jkx text-[22px] text-white">{partner.rating}</Text>
            <Text className="font-jk text-[11.5px] text-white/60">{partner.jobs} job{partner.jobs === 1 ? "" : "s"} · {online} other{online === 1 ? "" : "s"} online</Text>
          </View>
        </View>
      </BrandPanel>

      {offered && offer ? (
        <View className="gap-3 rounded-5xl bg-brand p-3">
          <Pressable onPress={() => router.push(`/partner/offer/${offered.id}`)} accessibilityRole="button">
            <TrackingMap origin={partner.at} dest={offered.address.at} at={partner.at} height={170}
              label={`${km(distanceM(partner.at, offered.address.at))} · ${etaMinutes(distanceM(partner.at, offered.address.at))} min away`} />
          </Pressable>
          <View className="flex-row items-center gap-3 px-2">
            <View className="flex-1">
              <Text className="font-jkx text-[10px] uppercase tracking-[1.2px] text-onbrand opacity-70">New job · {offer.stage === 1 ? 'assigned to you' : 'open to all nearby'}</Text>
              <Text className="font-jkb text-[16px] text-onbrand">{bookingTitle(offered)} · {offered.durationMin} min</Text>
              <Text className="font-jk text-[12px] text-onbrand opacity-80">{offered.address.line2} · you earn {inr(payout(offered))}</Text>
            </View>
            <View className="items-center rounded-full bg-white px-3 py-2">
              <Text className="font-jkx text-[15px] text-brand">{mmss(Math.max(0, (offer.expiresAt - now) / 1000))}</Text>
            </View>
          </View>
          {offerErr ? <Text className="px-2 font-jkm text-[12px] text-white">{offerErr}</Text> : null}
          <View className="flex-row gap-2 px-1 pb-1">
            <Pressable accessibilityRole="button" disabled={Boolean(answering)} onPress={async () => { setAnswering('skip'); setOfferErr(''); try { await declineOffer({ bookingId: offered.id }); } catch (e) { setOfferErr((e as Error).message); } finally { setAnswering(null); } }}
              className="items-center justify-center rounded-full border border-white/40 px-5 py-3.5">
              <Text className="font-jkb text-[15px] text-white">{answering === 'skip' ? '…' : 'Skip'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={Boolean(answering)} onPress={async () => { setAnswering('accept'); setOfferErr(''); try { await acceptOffer({ bookingId: offered.id }); router.push(`/partner/job/${offered.id}`); } catch (e) { setOfferErr((e as Error).message); } finally { setAnswering(null); } }}
              className="flex-1 items-center justify-center rounded-full bg-white py-3.5">
              <Text className="font-jkx text-[16px] text-brand">{answering === 'accept' ? 'Accepting…' : `Accept · earn ${inr(payout(offered))}`}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {job ? (
        <Card selected onPress={() => router.push(`/partner/job/${job.id}`)}>
          <View className="flex-row items-center justify-between">
            <Badge tone="ok" label={{ assigned: 'riding there', arrived: 'at the door', in_progress: 'working' }[job.status as 'assigned']} />
            <ChevronRight size={18} color={c.ink3} />
          </View>
          <H>{bookingTitle(job)} · {job.durationMin} min</H>
          <Tiny>{job.address.line1}, {job.address.line2} · you earn {inr(payout(job))}</Tiny>
        </Card>
      ) : null}

      {!offered && !job ? (
        partner.onShift ? (
          <Card>
            <Eyebrow>Where you are</Eyebrow>
            <SearchMap at={partner.at} radiusM={3000} experts={[]} center="you" height={200} label="Jobs within 3 km come to you" />
            <Tiny>The nearest online expert gets each job first. Keep the app open — a new job rings for 20 seconds.</Tiny>
          </Card>
        ) : (
          <Card>
            <H>You are offline</H>
            <Body>Go online when you are ready to work. Each job pays {Math.round(PARTNER_SHARE * 100)}% of the booking. Your pay is ready to withdraw a day after each job.</Body>
          </Card>
        )
      ) : null}

      {USE_EMULATORS && partners.length <= 1 ? (
        <Card flat>
          <H>Testing alone?</H>
          <Body>Load five demo experts who accept jobs and ride to the door on their own.</Body>
          <Btn title="Load demo experts" tone="secondary" size="sm" busy={seeding} onPress={async () => { setSeeding(true); try { await seedDemo({}); } finally { setSeeding(false); } }} />
        </Card>
      ) : null}

      {USE_EMULATORS && partner.onShift && !offered && !job ? (
        <Card flat>
          <H>Test the partner flow</H>
          <Body>Creates a paid 1-hour job about 700 m away and offers it to you first.</Body>
          {testErr ? <Tiny className="text-crit">{testErr}</Tiny> : null}
          <Btn title="Send me a test job" tone="secondary" size="sm" busy={testing}
            onPress={async () => { setTesting(true); setTestErr(''); try { await devTestJob({}); } catch (e) { setTestErr((e as Error).message); } finally { setTesting(false); } }} />
        </Card>
      ) : null}

      <Note>Every job has a 4-digit start code. The clock only starts once the customer reads it to you, so you are never blamed for a late start.</Note>
    </ScrollView>
  );
}
