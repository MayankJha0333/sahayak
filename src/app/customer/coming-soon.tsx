import { useLocalSearchParams } from 'expo-router';
import { ComingSoonView } from '@/components/ComingSoon';

/** The coming-soon page for one saved address (the Home tab shows the same view for the default one). */
export default function ComingSoon() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ComingSoonView addressId={id} />;
}
