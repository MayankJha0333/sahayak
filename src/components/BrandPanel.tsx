import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * The heavy brand panel from the Pronto reference: a deep-to-bright diagonal gradient with
 * faint diagonal hairlines over it. Wrap any header or hero in it.
 */
export function BrandPanel({ children, style, className, radius = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; className?: string; radius?: number }) {
  const { c } = useTheme();
  return (
    <View className={className} style={[{ overflow: 'hidden', borderRadius: radius }, style]}>
      <LinearGradient colors={[c.heroDeep, c.hero, c.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
        <Defs>
          <Pattern id="stripes" patternUnits="userSpaceOnUse" width="26" height="26" patternTransform="rotate(-35)">
            <Line x1="0" y1="0" x2="0" y2="26" stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stripes)" />
      </Svg>
      {children}
    </View>
  );
}
