import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { AppBar, Body, Card, H, Screen } from '@/components/ui';

const PAGES: Record<string, { title: string; sections: [string, string][] }> = {
  about: {
    title: 'About Sahayak',
    sections: [
      ['What we do', 'Sahayak sends a verified house-help expert to your door in about ten minutes. You book her by the hour, tick the tasks you want done, and pay through Razorpay. No monthly commitments.'],
      ['Who the experts are', 'Every expert is ID-verified and police-checked before her first job, and insured while she works. Ratings from customers decide who gets the next job first.'],
      ['Where we are', 'We are starting in Gurugram. If your address is outside our area we will tell you before you pay.'],
      ['When we work', 'Experts start visits between 8 AM and 7 PM, every day. Outside those hours you can still book a slot for later.'],
    ],
  },
  terms: {
    title: 'Terms of service',
    sections: [
      ['Booking', 'A booking reserves an expert for the time you choose. The clock starts when you share the start code with her, never while she is on the way.'],
      ['Payment', 'You pay for the booked time when you book. Extra time is charged at ₹2 a minute at the end of the visit. All payments go through Razorpay; we never store card details.'],
      ['Cancellation', 'Cancel free while we are still finding an expert, and for 2 minutes after one accepts. Scheduled visits are free to cancel up to 2 hours before the slot. After that a ₹49 fee applies and the rest is refunded to the original payment method within 5–7 working days.'],
      ['Conduct', 'Experts may decline unsafe work, work needing a ladder, or anything outside the task list. Please treat them with respect; abusive behaviour ends the visit without refund.'],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    sections: [
      ['What we collect', 'Your mobile number, name, saved addresses and booking history. Location is read only when you set an address or track a visit.'],
      ['What experts see', 'Your first name, the address and gate directions for a job she has accepted, and the task list. Phone calls are routed through masked numbers.'],
      ['What we never do', 'We do not sell your data and we do not store payment card details. You can delete your account and data from Help & support.'],
    ],
  },
};

export default function Legal() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  const p = PAGES[page ?? 'about'] ?? PAGES.about;
  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title={p.title} back />
      <Screen>
        {p.sections.map(([h, body]) => (
          <Card key={h}><H>{h}</H><Body>{body}</Body></Card>
        ))}
        <Text className="font-jk text-center text-[11px] text-ink3 dark:text-ink3-dark">Last updated September 2026</Text>
      </Screen>
    </View>
  );
}
