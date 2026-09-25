import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, Text, View,
  type PressableProps, type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ServiceGlyph } from './icons';
import { useTheme } from '@/theme';

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export function Screen({
  children, scroll = true, footer, pad = 20,
}: { children: ReactNode; scroll?: boolean; footer?: ReactNode; pad?: number }) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  if (!scroll) {
    return (
      <View className="flex-1 bg-ground dark:bg-ground-dark">
        <View style={{ flex: 1, padding: pad, gap: 14 }}>{children}</View>
        {footer ? <Footer insets={insets.bottom} kb={kb}>{footer}</Footer> : null}
      </View>
    );
  }
  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // iOS scrolls the focused field into view while the keyboard is up.
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: pad, gap: 14, paddingBottom: (footer ? 28 : insets.bottom + 32) }}>
        {children}
      </ScrollView>
      {footer ? <Footer insets={insets.bottom} kb={kb}>{footer}</Footer> : null}
    </View>
  );
}

/** Height of the on-screen keyboard (iOS only; Android resizes the window itself). */
function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

function Footer({ children, insets, kb }: { children: ReactNode; insets: number; kb: number }) {
  // Keep the main action above the keyboard so it is never hidden while typing.
  return (
    <View
      className="border-t border-line2 bg-paper px-5 pt-4 dark:border-line2-dark dark:bg-paper-dark"
      style={{
        paddingBottom: kb > 0 ? kb + 12 : insets + 14,
        gap: 10,
        ...Platform.select({
          ios: { shadowColor: '#121427', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: -6 } },
          android: { elevation: 12 },
          default: {},
        }),
      }}>
      {children}
    </View>
  );
}

export function AppBar({
  title, subtitle, back, right, onBack,
}: { title: string; subtitle?: string; back?: boolean; right?: ReactNode; /** Inside a modal: close it instead of leaving the screen. */ onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { c } = useTheme();
  return (
    <View
      className="flex-row items-center gap-3 bg-ground px-5 pb-3 dark:bg-ground-dark"
      style={{ paddingTop: insets.top + 8 }}>
      {back ? (
        <Pressable
          onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/customer'))}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-10 w-10 items-center justify-center rounded-full bg-paper dark:bg-paper-dark">
          <ChevronLeft size={20} color={c.ink} />
        </Pressable>
      ) : null}
      <View className="flex-1">
        {subtitle ? <Eyebrow>{subtitle}</Eyebrow> : null}
        <Text className="font-jkb text-[19px] leading-6 text-ink dark:text-ink-dark" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

export const Display = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`font-jkx text-[30px] leading-9 tracking-tight text-ink dark:text-ink-dark ${className}`}>
    {children}
  </Text>
);
export const Title = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`font-jkb text-[23px] leading-7 tracking-tight text-ink dark:text-ink-dark ${className}`}>
    {children}
  </Text>
);
export const H = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`font-jks text-[15.5px] leading-5 text-ink dark:text-ink-dark ${className}`}>{children}</Text>
);
export const Body = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`font-jk text-[14px] leading-[21px] text-ink2 dark:text-ink2-dark ${className}`}>{children}</Text>
);
export const Tiny = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`font-jk text-[12px] leading-[17px] text-ink3 dark:text-ink3-dark ${className}`}>{children}</Text>
);
export const Eyebrow = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`font-jkx text-[10.5px] uppercase tracking-[1.3px] text-brand dark:text-brand-dark ${className}`}>
    {children}
  </Text>
);
/** Snabbit's signature move: one word of the headline in the accent colour. */
export const Accent = ({ children }: { children: ReactNode }) => (
  <Text className="text-brand dark:text-brand-dark">{children}</Text>
);
export const Money = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <Text className={`font-jkx text-[18px] text-ink dark:text-ink-dark ${className}`}>{children}</Text>
);

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

const shadow = Platform.select({
  ios: { shadowColor: '#121427', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
  default: { boxShadow: '0 6px 18px rgba(18,20,39,0.07)' } as object,
});

export function Card({
  children, selected, onPress, flat, className = '', ...rest
}: ViewProps & { children: ReactNode; selected?: boolean; onPress?: () => void; flat?: boolean; className?: string }) {
  const look = selected
    ? 'bg-brand-soft dark:bg-brand-softdark'
    : flat
      ? 'bg-sunk dark:bg-sunk-dark'
      : 'bg-paper dark:bg-paper-dark';
  const inner = (
    <View className={`gap-2.5 rounded-4xl p-4 ${look} ${flat || selected ? '' : 'dark:border dark:border-line2-dark'} ${className}`} style={flat || selected ? undefined : shadow} {...rest}>
      {children}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => <View style={{ opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }}>{inner}</View>}
    </Pressable>
  );
}

export const Divider = () => <View className="h-px bg-line2 dark:bg-line2-dark" />;

export function Row({
  left, title, sub, right, onPress,
}: { left?: ReactNode; title: string; sub?: string; right?: ReactNode; onPress?: () => void }) {
  const inner = (
    <View className="flex-row items-center gap-3.5 py-3">
      {left ? <View className="h-9 w-9 items-center justify-center rounded-full bg-sunk dark:bg-sunk-dark">{left}</View> : null}
      <View className="flex-1">
        <Text className="font-jkm text-[14px] text-ink dark:text-ink-dark">{title}</Text>
        {sub ? <Tiny>{sub}</Tiny> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{inner}</Pressable> : inner;
}

export function SplitRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className={`flex-1 ${strong ? 'font-jks text-[14.5px] text-ink dark:text-ink-dark' : 'font-jk text-[13.5px] text-ink2 dark:text-ink2-dark'}`}>
        {label}
      </Text>
      <Text className={strong ? 'font-jkx text-[16px] text-ink dark:text-ink-dark' : 'font-jkm text-[13.5px] text-ink dark:text-ink-dark'}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

type BtnProps = PressableProps & {
  title: string;
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  busy?: boolean;
  icon?: ReactNode;
};

export function Btn({ title, tone = 'primary', size = 'md', busy, icon, disabled, ...rest }: BtnProps) {
  const { c } = useTheme();
  const bg = {
    primary: 'bg-cta dark:bg-cta-dark',
    secondary: 'bg-paper border border-line dark:bg-paper-dark dark:border-line-dark',
    ghost: 'bg-transparent',
    danger: 'bg-crit-soft dark:bg-crit-softdark',
  }[tone];
  const fg = {
    primary: 'text-oncta dark:text-oncta-dark',
    secondary: 'text-ink dark:text-ink-dark',
    ghost: 'text-brand dark:text-brand-dark',
    danger: 'text-crit dark:text-crit-dark',
  }[tone];
  const pad = size === 'sm' ? 'px-4 py-2.5' : 'px-5 py-4';
  const txt = size === 'sm' ? 'text-[13px]' : 'text-[15px]';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      // A plain style object: NativeWind drops a style *function* when className is set, which left
      // disabled buttons looking fully tappable. Press feedback comes from the active: variant instead.
      className={`flex-row items-center justify-center gap-2 rounded-full active:opacity-80 ${bg} ${pad}`}
      style={[tone === 'primary' && !disabled ? shadow : undefined, { opacity: disabled ? 0.4 : 1 }]}
      {...rest}>
      {busy ? <ActivityIndicator size="small" color={tone === 'primary' ? c.onCta : c.brand} />
        : icon && tone === 'primary' && size === 'md' ? <View className="h-7 w-7 items-center justify-center rounded-full bg-oncta/15 dark:bg-oncta-dark/15">{icon}</View>
        : icon}
      <Text className={`font-jkb ${txt} ${fg}`}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-full border px-4 py-2.5 ${on ? 'border-brand bg-brand-soft dark:border-brand-dark dark:bg-brand-softdark' : 'border-line bg-paper dark:border-line-dark dark:bg-paper-dark'}`}>
      <Text className={`text-[12.5px] ${on ? 'font-jkb text-ink dark:text-ink-dark' : 'font-jkm text-ink2 dark:text-ink2-dark'}`}>{label}</Text>
    </Pressable>
  );
}

const TONE_BG = {
  neutral: 'bg-sunk dark:bg-sunk-dark',
  ok: 'bg-ok-soft dark:bg-ok-softdark', warn: 'bg-warn-soft dark:bg-warn-softdark', crit: 'bg-crit-soft dark:bg-crit-softdark',
  brand: 'bg-brand-soft dark:bg-brand-softdark',
} as const;
const TONE_FG = {
  neutral: 'text-ink2 dark:text-ink2-dark',
  ok: 'text-ok dark:text-ok-dark', warn: 'text-warn dark:text-warn-dark', crit: 'text-crit dark:text-crit-dark',
  brand: 'text-brand dark:text-brand-dark',
} as const;

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof TONE_BG }) {
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${TONE_BG[tone]}`}>
      <Text className={`font-jkx text-[9.5px] uppercase tracking-[0.9px] ${TONE_FG[tone]}`}>{label}</Text>
    </View>
  );
}

export function Note({ children, tone = 'brand' }: { children: ReactNode; tone?: keyof typeof TONE_BG }) {
  return (
    <View className={`rounded-3xl px-4 py-3.5 ${TONE_BG[tone]}`}>
      <Text className="font-jk text-[12.5px] leading-[19px] text-ink dark:text-ink-dark">{children}</Text>
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <View className="h-2 overflow-hidden rounded-full bg-sunk dark:bg-sunk-dark">
      <View className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </View>
  );
}

export function Avatar({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <View className="items-center justify-center rounded-full bg-brand" style={{ width: size, height: size }}>
      <Text className="font-jkx text-onbrand dark:text-onbrand-dark" style={{ fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

/** The catalogue tile: a soft pink disc with the service icon in brand pink. */
export function IconTile({ icon, size = 52, strong }: { icon: string; size?: number; strong?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      className={`items-center justify-center rounded-full ${strong ? 'bg-brand' : 'bg-brand-soft dark:bg-brand-softdark'}`}
      style={{ width: size, height: size }}>
      <ServiceGlyph name={icon} size={size * 0.46} color={strong ? c.onBrand : c.brand} />
    </View>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'crit' | 'ok' }) {
  return (
    <View
      className={`min-w-[108px] flex-1 gap-1 rounded-3xl bg-paper p-3.5 dark:bg-paper-dark ${tone === 'crit' ? 'bg-crit-soft dark:bg-crit-softdark' : ''}`}
      style={shadow}>
      <Text className="font-jkx text-[9.5px] uppercase tracking-[1.1px] text-ink3 dark:text-ink3-dark">{label}</Text>
      <Text className={`font-jkx text-[20px] ${tone === 'crit' ? 'text-crit dark:text-crit-dark' : 'text-ink dark:text-ink-dark'}`}>{value}</Text>
    </View>
  );
}

export { shadow };
