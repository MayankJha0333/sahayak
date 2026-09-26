import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandPanel } from '@/components/BrandPanel';
import { BadgeCheck, Banknote, Book, ChevronRight, Headphones, HeartPulse, Info, Shield, IndianRupee } from '@/components/icons';
import { Avatar, Btn, Divider, Tiny, shadow } from '@/components/ui';
import { setOnShift } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { phonePretty } from '@/lib/format';
import { SERVICES } from '@/lib/mock';
import { useTheme } from '@/theme';

/** Partner profile in the same layout as the customer one: brand header, quick tiles, plain rows. */
export default function PartnerProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { partner, profile, signOut } = useAuth();
  if (!partner) return null;

  const skillNames = SERVICES.filter((s) => partner.skills.includes(s.skill)).map((s) => s.name);
  const skills = skillNames.length ? skillNames : partner.skills;

  const tile = (Icon: typeof Book, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} className="flex-1 gap-6 rounded-[22px] bg-paper p-4 dark:bg-paper-dark" style={shadow}>
      <Icon size={30} color={c.ink2} />
      <Text className="font-jks text-[16px] leading-[21px] text-ink dark:text-ink-dark">{label}</Text>
    </Pressable>
  );

  const info = (Icon: typeof Book, label: string, sub: string, tint = c.ink2) => (
    <View key={label} className="flex-row items-center gap-4 px-4 py-4">
      <Icon size={20} color={tint} />
      <View className="flex-1"><Text className="font-jkm text-[16px] text-ink dark:text-ink-dark">{label}</Text><Tiny>{sub}</Tiny></View>
    </View>
  );

  const link = (Icon: typeof Book, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} className="flex-row items-center gap-4 px-4 py-4">
      <Icon size={20} color={c.ink2} />
      <Text className="font-jkm flex-1 text-[16px] text-ink dark:text-ink-dark">{label}</Text>
      <ChevronRight size={18} color={c.ink3} />
    </Pressable>
  );

  return (
    <ScrollView className="flex-1 bg-ground dark:bg-ground-dark" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
      <BrandPanel style={{ paddingTop: insets.top + 14, paddingBottom: 30, paddingHorizontal: 20 }}>
        <Text className="font-jkb text-[22px] text-white">Profile</Text>
        <View className="mt-6 flex-row items-center gap-5">
          <View className="h-[88px] w-[88px] items-center justify-center rounded-full bg-white"><Avatar initials={partner.initials} size={74} /></View>
          <View className="flex-1">
            <Text className="font-jkx text-[26px] text-white" numberOfLines={1}>{partner.name}</Text>
            <Text className="font-jkm text-[15px] text-white/85">{phonePretty(profile?.phone ?? partner.phone ?? '')}</Text>
            <Text className="font-jkm text-[13px] text-white/70">{partner.hub} hub</Text>
          </View>
        </View>
        <View className="mt-5 flex-row gap-3">
          {[
            { k: 'Rating', v: String(partner.rating) },
            { k: 'Jobs done', v: String(partner.jobs) },
            { k: 'On time', v: `${Math.round(partner.onTime ?? 100)}%` },
          ].map((t) => (
            <View key={t.k} className="flex-1 rounded-3xl border border-white/15 bg-white/10 p-3">
              <Text className="font-jkx text-[9.5px] uppercase tracking-[1.1px] text-white/60">{t.k}</Text>
              <Text className="font-jkx text-[18px] text-white">{t.v}</Text>
            </View>
          ))}
        </View>
      </BrandPanel>

      <View className="gap-4 px-4 pt-4">
        <View className="flex-row gap-3">
          {tile(IndianRupee, 'My earnings', () => router.push('/partner/(tabs)/earnings'))}
          {tile(Headphones, 'Help & support', () => router.push('/help'))}
        </View>

        <View className="gap-3 rounded-[22px] bg-paper p-4 dark:bg-paper-dark" style={shadow}>
          <Text className="font-jks text-[13px] text-ink3 dark:text-ink3-dark">Work you get offered</Text>
          <View className="flex-row flex-wrap gap-2">
            {skills.map((s) => (
              <View key={s} className="rounded-full bg-brand-soft px-3 py-1.5 dark:bg-brand-softdark">
                <Text className="font-jks text-[13px] text-brand dark:text-brand-dark">{s}</Text>
              </View>
            ))}
          </View>
          <Tiny>To add a skill, finish its training at your hub.</Tiny>
        </View>

        <View className="overflow-hidden rounded-[22px] bg-paper dark:bg-paper-dark" style={shadow}>
          {info(BadgeCheck, 'Aadhaar verification',
            partner.bot ? 'Demo expert' : partner.verified ? `Verified${partner.kyc?.aadhaarLast4 ? ` · Aadhaar ending ${partner.kyc.aadhaarLast4}` : ''}` : 'Waiting for our team',
            partner.verified || partner.bot ? c.ok : c.warn)}
          <Divider />
          {info(Banknote, 'Payouts',
            partner.payoutMethod ? `${partner.payoutMethod.label} · ${partner.autoPayout === false ? 'withdraw any time' : 'weekly auto-payout on'}` : 'Add a UPI ID or bank account in Earnings',
            partner.payoutMethod ? c.ok : c.warn)}
          <Divider />
          {info(HeartPulse, 'Insurance', 'Accident cover while you are on a job')}
        </View>

        <View className="overflow-hidden rounded-[22px] bg-paper dark:bg-paper-dark" style={shadow}>
          {link(Info, 'About Sahayak', () => router.push({ pathname: '/legal', params: { page: 'about' } }))}
          <Divider />
          {link(Book, 'Terms of service', () => router.push({ pathname: '/legal', params: { page: 'terms' } }))}
          <Divider />
          {link(Shield, 'Privacy policy', () => router.push({ pathname: '/legal', params: { page: 'privacy' } }))}
        </View>

        <Btn title="Sign out" tone="secondary" onPress={async () => {
          // Signing out also takes her offline, so no job is offered to a phone nobody is watching.
          if (partner.onShift) await setOnShift(false).catch(() => {});
          await signOut(); router.replace('/');
        }} />
      </View>
    </ScrollView>
  );
}
