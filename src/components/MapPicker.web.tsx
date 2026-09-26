import { Text, View } from 'react-native';
import { SchematicMap } from './SchematicMap';
import type { LatLng } from '@/lib/geo';

type Props = { value: LatLng; onChange: (at: LatLng, place?: string) => void; height?: number; autoLocate?: boolean };

/** The web build has no native map; addresses are set from the phone app. */
export function MapPicker({ value, height = 300 }: Props) {
  return (
    <View>
      <SchematicMap origin={value} dest={value} height={height} label="Set the pin from the phone app" />
      <Text className="font-jk mt-2 text-[12px] text-ink3 dark:text-ink3-dark">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</Text>
    </View>
  );
}
