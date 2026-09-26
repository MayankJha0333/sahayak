import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Panel, Table } from '@/components/admin';
import { Btn, Stat, Tiny, Title } from '@/components/ui';
import { saveReferralConfig } from '@/lib/api';
import { useAllReferrals, useReferralConfig } from '@/lib/db';
import { inr, whenLabel } from '@/lib/format';
import { useTheme } from '@/theme';

/** What a referral pays, and who has referred whom. */
export default function AdminReferrals() {
  const { c } = useTheme();
  const cfg = useReferralConfig();
  const { rows } = useAllReferrals();
  const [active, setActive] = useState(true);
  const [cust, setCust] = useState('50');
  const [sign, setSign] = useState('5');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (cfg === undefined) return;
    setActive(cfg?.active ?? true); setCust(String(cfg?.customerReward ?? 50)); setSign(String(cfg?.signupReward ?? 5));
  }, [cfg]);

  const save = async () => {
    setBusy(true); setMsg('');
    try { await saveReferralConfig({ active, customerReward: Number(cust) || 0, signupReward: Math.min(Number(sign) || 0, Number(cust) || 0), partnerReward: 0 }); setMsg('Saved. New referrals use these amounts.'); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const field = (v: string, set: (t: string) => void) => (
    <TextInput value={v} onChangeText={(t) => set(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholderTextColor={c.ink3}
      className="font-jk w-28 rounded-xl bg-sunk px-3 py-2.5 text-[13px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
  );
  const joined = rows.filter((r) => r.status === 'joined');

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Title>Referrals</Title>
      <View className="flex-row flex-wrap gap-2">
        <Stat label="Friends joined" value={String(joined.length)} />
        <Stat label="Rewards given" value={inr(joined.reduce((n, r) => n + r.reward, 0))} />
      </View>
      <Panel title="Rewards" wide>
        <View className="flex-row items-center justify-between"><Text className="font-jks text-[13.5px] text-ink dark:text-ink-dark">Referrals on</Text><Switch value={active} onValueChange={setActive} /></View>
        <View className="flex-row items-center justify-between"><Tiny>Total credit per friend who books</Tiny>{field(cust, setCust)}</View>
        <View className="flex-row items-center justify-between"><Tiny>Of that, paid when the friend signs up</Tiny>{field(sign, setSign)}</View>
        <Btn title="Save" size="sm" busy={busy} onPress={save} />
        {msg ? <Tiny>{msg}</Tiny> : null}
      </Panel>
      <Panel title="Latest referrals" wide>
        <Table head={['Friend', 'Phone', 'Status', 'Reward', 'When']}
          rows={rows.slice(0, 50).map((r) => [r.name, r.phone, r.status === 'joined' ? 'credit added' : 'signed up', inr(r.reward), whenLabel(r.joinedAt ?? r.invitedAt)])} />
      </Panel>
    </ScrollView>
  );
}
