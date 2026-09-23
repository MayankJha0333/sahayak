import { useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { Send } from '@/components/icons';
import { AppBar, Badge, Btn, Card, Chip, Divider, Eyebrow, Note, Screen, Tiny } from '@/components/ui';
import { addFeedback } from '@/lib/api';
import { useMyBookings, useMyFeedback, usePartnerBookings } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { clock } from '@/lib/format';
import { bookingTitle } from '@/lib/mock';
import type { FeedbackDoc } from '@/lib/types';
import { useTheme } from '@/theme';

const KINDS: { id: FeedbackDoc['kind']; label: string; hint: string }[] = [
  { id: 'feedback', label: 'Feedback', hint: 'What went well, what did not' },
  { id: 'request', label: 'Request', hint: 'Something you wish the app did' },
  { id: 'problem', label: 'Problem', hint: 'Something broke or was wrong' },
];

export default function Help() {
  const { c } = useTheme();
  const { rows: feedback } = useMyFeedback();
  const { partner } = useAuth();
  const { rows: asCustomer } = useMyBookings();
  const { rows: asPartner } = usePartnerBookings();
  const bookings = partner ? asPartner : asCustomer;
  const [kind, setKind] = useState<FeedbackDoc['kind']>('feedback');
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(true);
  const [sent, setSent] = useState(false);
  const last = bookings.find((b) => b.status === 'completed');

  const submit = async () => {
    Keyboard.dismiss();
    await addFeedback(kind, text, attach && last ? last.id : undefined);
    setText(''); setSent(true); setTimeout(() => setSent(false), 2500);
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Help" subtitle="Tell us anything" back />
      <Screen>
        <Text className="font-jkx text-[26px] leading-8 tracking-tight text-ink dark:text-ink-dark">What is on your mind?</Text>
        <View className="flex-row flex-wrap gap-2">{KINDS.map((k) => <Chip key={k.id} label={k.label} on={kind === k.id} onPress={() => setKind(k.id)} />)}</View>
        <Card>
          <Eyebrow>{KINDS.find((k) => k.id === kind)!.hint}</Eyebrow>
          <TextInput value={text} onChangeText={setText} multiline textAlignVertical="top"
            placeholder={kind === 'request' ? 'e.g. Let me pick the same expert every time' : 'Write as much or as little as you like'}
            placeholderTextColor={c.ink3} accessibilityLabel="Your message"
            className="font-jk min-h-[120px] rounded-2xl bg-sunk px-4 py-3.5 text-[14.5px] leading-5 text-ink dark:bg-sunk-dark dark:text-ink-dark" />
          {last ? (
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="font-jkm text-[13px] text-ink dark:text-ink-dark">{partner ? "Attach your last job" : "Attach your last booking"}</Text>
                <Tiny>{bookingTitle(last)} · {clock(last.createdAt)} · {last.id}</Tiny>
              </View>
              <Chip label={attach ? 'Attached' : 'Attach'} on={attach} onPress={() => setAttach(!attach)} />
            </View>
          ) : null}
          <Btn title={sent ? 'Sent — thank you' : 'Send'} disabled={text.trim().length < 3} tone={sent ? 'secondary' : 'primary'}
            icon={sent ? undefined : <Send size={16} color={c.onBrand} />} onPress={submit} />
        </Card>
        {feedback.length ? (
          <Card>
            <Eyebrow>You have sent</Eyebrow>
            {feedback.map((f, i) => (
              <View key={f.id}>
                {i ? <Divider /> : null}
                <View className="gap-1.5 py-2.5">
                  <View className="flex-row items-center gap-2">
                    <Badge tone={f.kind === 'problem' ? 'crit' : f.kind === 'request' ? 'brand' : 'neutral'} label={f.auto ? 'your rating' : f.kind} />
                    <Tiny>{clock(f.at)}{f.bookingId ? ` · ${f.bookingId}` : ''}</Tiny>
                  </View>
                  <Text className="font-jk text-[13.5px] leading-5 text-ink2 dark:text-ink2-dark">{f.text}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}
        <Note>Our team reads every message. Problems about a booking are answered first — usually the same day.</Note>
      </Screen>
    </View>
  );
}
