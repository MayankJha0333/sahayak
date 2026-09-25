import type { LatLng } from '@/lib/geo';
import { SchematicMap } from './SchematicMap';

export function TrackingMap({ footer, label, route: _route, hideExpert: _h, ...props }: {
  origin: LatLng; dest: LatLng; at?: LatLng; height?: number; label?: string; hideExpert?: boolean; route?: LatLng[] | null; footer?: string;
}) {
  return <SchematicMap {...props} label={[label, footer].filter(Boolean).join(' · ')} />;
}
