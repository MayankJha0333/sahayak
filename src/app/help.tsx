import { useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { Send } from '@/components/icons';
import { AppBar, Btn, Card, Chip, Eyebrow, Note, Screen, Tiny } from '@/components/ui';
import { addFeedback } from '@/lib/api';
import { useMyBookings, usePartnerBookings } from '@/lib/db';
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
  const { partner } = useAuth();
  const { rows: asCustomer } = useMyBookings();
  const { rows: asPartner } = usePartnerBookings();
  const bookings = partner ? asPartner : asCustomer;
  const [kind, setKind] = useState<FeedbackDoc['kind']>('feedback');
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(true);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const last = bookings.find((b) => b.status === 'completed');

  const submit = async () => {
    Keyboard.dismiss();
    setBusy(true); setErr('');
    try {
      // A phone that cannot reach the server would otherwise wait here forever with no sign of it.
      const ok = await Promise.race([
        addFeedback(kind, text, attach && last ? last.id : undefined).then(() => true),
        new Promise<false>((done) => setTimeout(() => done(false), 12_000)),
      ]);
      if (!ok) { setErr('Could not reach Sahayak. Check your internet and try again.'); return; }
      setText(''); setSent(true);
    } catch (e) { setErr((e as Error).message || 'Could not send. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Help" subtitle="Tell us anything" back />
      <Screen>
        <Text className="font-jkx text-[26px] leading-8 tracking-tight text-ink dark:text-ink-dark">What is on your mind?</Text>
        <View className="flex-row flex-wrap gap-2">{KINDS.map((k) => <Chip key={k.id} label={k.label} on={kind === k.id} onPress={() => setKind(k.id)} />)}</View>
        <Card>
          <Eyebrow>{KINDS.find((k) => k.id === kind)!.hint}</Eyebrow>
          <TextInput value={text} onChangeText={(t) => { setText(t); if (sent) setSent(false); }} multiline textAlignVertical="top"
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
          {err ? <Note tone="crit">{err}</Note> : null}
          <Btn title="Send" busy={busy} disabled={text.trim().length < 3}
            icon={<Send size={16} color={c.onBrand} />} onPress={submit} />
        </Card>
        {sent
          ? <Note tone="ok">Thank you — we got your message. We reply on your phone, usually the same day.</Note>
          : <Note>Our team reads every message. Problems about a booking are answered first — usually the same day.</Note>}
      </Screen>
    </View>
  );
}
