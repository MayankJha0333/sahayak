import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect, Stop, LinearGradient } from 'react-native-svg';
import { routePoints, type LatLng } from '@/lib/geo';
import { useTheme } from '@/theme';

type Props = { origin: LatLng; dest: LatLng; at?: LatLng; height?: number; label?: string };

/**
 * A drawn map: real coordinates projected into the box. No API key, no native
 * module — works on web and in Expo Go. A dev build swaps in the real map.
 */
export function SchematicMap({ origin, dest, at, height = 240, label }: Props) {
  const { c } = useTheme();
  const pts = [origin, dest, ...(at ? [at] : [])];
  const pad = 0.0022;
  const minLat = Math.min(...pts.map((p) => p.lat)) - pad;
  const maxLat = Math.max(...pts.map((p) => p.lat)) + pad;
  const minLng = Math.min(...pts.map((p) => p.lng)) - pad;
  const maxLng = Math.max(...pts.map((p) => p.lng)) + pad;

  const W = 360, H = height;
  const x = (p: LatLng) => ((p.lng - minLng) / Math.max(1e-6, maxLng - minLng)) * W;
  const y = (p: LatLng) => H - ((p.lat - minLat) / Math.max(1e-6, maxLat - minLat)) * H;

  const route = routePoints(origin, dest, 30);
  const d = route.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ');

  return (
    <View className="overflow-hidden rounded-4xl" style={{ height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <Rect width="30" height="30" fill={c.sunk} />
            <Line x1="0" y1="0" x2="30" y2="0" stroke={c.line} strokeWidth="1" />
            <Line x1="0" y1="0" x2="0" y2="30" stroke={c.line} strokeWidth="1" />
          </Pattern>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.paper} stopOpacity="0.32" />
            <Stop offset="1" stopColor={c.paper} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        <Rect width={W} height={H} fill="url(#grid)" />
        {/* a couple of thicker roads so it reads as a map, not graph paper */}
        <Line x1="0" y1={H * 0.36} x2={W} y2={H * 0.36} stroke={c.paper} strokeWidth="9" opacity={0.85} />
        <Line x1={W * 0.62} y1="0" x2={W * 0.62} y2={H} stroke={c.paper} strokeWidth="9" opacity={0.85} />
        <Rect width={W} height={H} fill="url(#fade)" />

        <Path d={d} stroke={c.brand} strokeWidth="4" strokeLinecap="round" fill="none" opacity={0.25} />
        <Path d={d} stroke={c.brand} strokeWidth="4" strokeLinecap="round" strokeDasharray="1 11" fill="none" />

        <G>
          <Circle cx={x(dest)} cy={y(dest)} r="17" fill={c.brand} opacity={0.15} />
          <Circle cx={x(dest)} cy={y(dest)} r="7" fill={c.brand} stroke={c.paper} strokeWidth="3" />
        </G>

        {at ? (
          <G>
            <Circle cx={x(at)} cy={y(at)} r="20" fill={c.ok} opacity={0.16} />
            <Circle cx={x(at)} cy={y(at)} r="9" fill={c.ok} stroke={c.paper} strokeWidth="3.5" />
          </G>
        ) : null}
      </Svg>

      {label ? (
        <View className="absolute left-4 top-4 rounded-full bg-paper px-3.5 py-2 dark:bg-paper-dark">
          <Text className="font-jkb text-[11.5px] text-ink dark:text-ink-dark">{label}</Text>
        </View>
      ) : null}
    </View>
  );
}
