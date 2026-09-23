import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, X } from '@/components/icons';
import { Text, View } from 'react-native';
import { Art, type ArtName } from '@/components/Art';
import { Accent, AppBar, Btn, Card, Display, Eyebrow, Screen, Tiny } from '@/components/ui';
import { requestAddTask } from '@/lib/bookingDraft';
import { serviceBySlug } from '@/lib/mock';
import { useTheme } from '@/theme';

export default function ServiceDetail() {
  const { slug, mode, on } = useLocalSearchParams<{ slug: string; mode?: string; on?: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const s = serviceBySlug(String(slug));

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title={s.name} subtitle="Service" back />
      <Screen
        footer={
          <Btn
            title={on === '1' ? 'Back to my booking' : 'Add to my booking'}
            onPress={() => {
              // Opened from the booking form: tick it there and go back, keeping everything else she picked.
              if (router.canGoBack()) { if (on !== '1') requestAddTask(s.slug); router.back(); }
              else router.replace({ pathname: '/customer/book/[slug]', params: { slug: s.slug, mode: mode ?? 'now' } });
            }}
          />
        }>
        <View className="items-center justify-center rounded-5xl bg-brand-soft py-9 dark:bg-brand-softdark">
          <Art name={s.slug as ArtName} size={150} />
        </View>

        <Display>
          {s.blurb.split(' ').slice(0, -1).join(' ')} <Accent>{s.blurb.split(' ').slice(-1)}</Accent>
        </Display>

        <View className="flex-row items-center">
          <View className="flex-row items-baseline gap-1.5">
            <Text className="font-jkx text-[26px] text-ink dark:text-ink-dark">~{s.typicalMin} min</Text>
            <Tiny>of her time · no extra charge</Tiny>
          </View>
        </View>

        <Card>
          <Eyebrow>What is included</Eyebrow>
          {s.includes.map((line) => (
            <View key={line} className="flex-row items-start gap-3 py-1">
              <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-ok-soft dark:bg-ok-softdark">
                <Check size={13} color={c.ok} />
              </View>
              <Text className="font-jk flex-1 text-[13.5px] leading-5 text-ink2 dark:text-ink2-dark">{line}</Text>
            </View>
          ))}
        </Card>

        <Card flat>
          <Eyebrow>Not included</Eyebrow>
          {s.excludes.map((line) => (
            <View key={line} className="flex-row items-start gap-3 py-1">
              <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-crit-soft dark:bg-crit-softdark">
                <X size={13} color={c.crit} />
              </View>
              <Text className="font-jk flex-1 text-[13.5px] leading-5 text-ink2 dark:text-ink2-dark">{line}</Text>
            </View>
          ))}
          <Tiny>The expert works from this same list, ticking each line as she finishes it.</Tiny>
        </Card>

        <Card flat>
          <Eyebrow>You provide</Eyebrow>
          <Tiny>Broom, mop and cleaning liquid. The expert brings gloves and a scrubber.</Tiny>
        </Card>
      </Screen>
    </View>
  );
}
