import { View } from 'react-native';

/**
 * Soft pastel discs that float over a black panel — the education-app reference.
 * Purely decorative; pointerEvents none so nothing underneath loses taps.
 */
const DOTS = [
  { size: 220, top: -120, right: -90, color: '#FFFFFF', opacity: 0.10 },
  { size: 120, top: 40, right: -50, color: '#FFFFFF', opacity: 0.08 },
  { size: 14, top: 70, right: 110, color: '#FFFFFF', opacity: 0.35 },
  { size: 8, top: 150, right: 60, color: '#FFFFFF', opacity: 0.35 },
  { size: 90, top: 120, left: -50, color: '#FFFFFF', opacity: 0.07 },
];

export function HeroDots({ dim }: { dim?: boolean }) {
  return (
    <View pointerEvents="none" className="absolute inset-0">
      {DOTS.map((d, i) => (
        <View key={i} className="absolute rounded-full"
          style={{ width: d.size, height: d.size, top: d.top, right: d.right, left: d.left, backgroundColor: d.color, opacity: dim ? d.opacity * 0.6 : d.opacity }} />
      ))}
    </View>
  );
}
