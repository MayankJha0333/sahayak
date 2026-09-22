import { SchematicMap } from './SchematicMap';
import type { LatLng } from '@/lib/geo';

export function SearchMap({ at, height = 220, label }: { at: LatLng; radiusM: number; experts: { id: string; at: LatLng }[]; height?: number; label?: string; center?: 'home' | 'you' }) {
  return <SchematicMap origin={at} dest={at} height={height} label={label} />;
}
