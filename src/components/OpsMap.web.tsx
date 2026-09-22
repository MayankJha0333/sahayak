import { SchematicMap } from './SchematicMap';
import type { LatLng } from '@/lib/geo';

export type OpsPartner = { id: string; name: string; at: LatLng; state: 'free' | 'busy' | 'offline' };
export type OpsJob = { id: string; at: LatLng; partnerAt?: LatLng; state: 'matching' | 'riding' | 'on_site' };

/** Web has no native map module; show the schematic with the first live job. */
export function OpsMap({ jobs, center, height = 300 }: { partners: OpsPartner[]; jobs: OpsJob[]; center: LatLng; height?: number }) {
  const j = jobs[0];
  return <SchematicMap origin={j?.partnerAt ?? center} dest={j?.at ?? center} at={j?.partnerAt} height={height}
    label={jobs.length ? `${jobs.length} live job${jobs.length > 1 ? 's' : ''}` : 'All quiet'} />;
}
