import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Lock } from '@/components/icons';
import { AppBar, Btn, Card, Chip, Eyebrow, Note, Screen, Tiny } from '@/components/ui';
import { setPayoutMethod } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Where her withdrawals go: a UPI ID (fastest) or a bank account. The server registers it with RazorpayX. */
export default function PayoutMethod() {
  const router = useRouter();
  const { c } = useTheme();
  const { partner } = useAuth();
  const current = partner?.payoutMethod;
  const [type, setType] = useState<'upi' | 'bank'>(current?.type ?? 'upi');
  const [holder, setHolder] = useState(current?.holderName ?? partner?.kyc?.fullName ?? partner?.name ?? '');
  const [upi, setUpi] = useState('');
  const [acct, setAcct] = useState('');
  const [acct2, setAcct2] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const holderOk = /^[A-Za-z .']{3,100}$/.test(holder.trim());
  const upiOk = UPI_RE.test(upi.trim());
  const acctOk = /^\d{9,18}$/.test(acct) && acct === acct2;
  const ifscOk = IFSC_RE.test(ifsc);
  const ok = holderOk && (type === 'upi' ? upiOk : acctOk && ifscOk);
  const hint = !holderOk ? 'Enter the account holder name (letters only).'
    : type === 'upi' ? (upi && !upiOk ? 'A UPI ID looks like name@okaxis or 98xxxxxx@ybl.' : 'Enter your UPI ID.')
    : acct && acct2 && acct !== acct2 ? 'The two account numbers do not match.'
    : ifsc.length === 11 && !ifscOk ? 'That IFSC code does not look right.' : 'Enter your account number twice and the IFSC code.';

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await setPayoutMethod(type === 'upi'
        ? { type: 'upi', upi: upi.trim(), holderName: holder.trim() }
        : { type: 'bank', holderName: holder.trim(), accountNumber: acct, ifsc });
      router.back();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const input = (props: React.ComponentProps<typeof TextInput>) => (
    <TextInput placeholderTextColor={c.ink3} autoCorrect={false} {...props}
      className="font-jk rounded-2xl bg-sunk px-4 py-3.5 text-[15px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
  );

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title={current ? 'Change payout account' : 'Add payout account'} subtitle="Where your money goes" back />
      <Screen footer={
        <View className="gap-2">
          {err ? <Text className="font-jkm text-center text-[13px] text-crit dark:text-crit-dark">{err}</Text> : !ok ? <Tiny className="text-center">{hint}</Tiny> : null}
          <Btn title="Save" busy={busy} disabled={!ok} onPress={save} />
        </View>
      }>
        {current ? <Note>Now paying to {current.label}. Saving a new one replaces it for your next withdrawal.</Note> : null}
        <View className="flex-row gap-2">
          <Chip label="UPI ID" on={type === 'upi'} onPress={() => setType('upi')} />
          <Chip label="Bank account" on={type === 'bank'} onPress={() => setType('bank')} />
        </View>
        <Card>
          <Eyebrow>Account holder name</Eyebrow>
          {input({ value: holder, onChangeText: setHolder, placeholder: 'As on your bank account', autoCapitalize: 'words', accessibilityLabel: 'Account holder name' })}
          {type === 'upi' ? (
            <>
              <Eyebrow>UPI ID</Eyebrow>
              {input({ value: upi, onChangeText: setUpi, placeholder: 'yourname@okaxis', autoCapitalize: 'none', keyboardType: 'email-address', accessibilityLabel: 'UPI ID' })}
              <Tiny>Find it in PhonePe, Google Pay or Paytm under your profile. Money usually arrives within minutes.</Tiny>
            </>
          ) : (
            <>
              <Eyebrow>Account number</Eyebrow>
              {input({ value: acct, onChangeText: (t) => setAcct(t.replace(/\D/g, '').slice(0, 18)), placeholder: '9 to 18 digits', keyboardType: 'number-pad', secureTextEntry: true, accessibilityLabel: 'Account number' })}
              <Eyebrow>Account number again</Eyebrow>
              {input({ value: acct2, onChangeText: (t) => setAcct2(t.replace(/\D/g, '').slice(0, 18)), placeholder: 'Type it again to be sure', keyboardType: 'number-pad', accessibilityLabel: 'Confirm account number' })}
              <Eyebrow>IFSC code</Eyebrow>
              {input({ value: ifsc, onChangeText: (t) => setIfsc(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11)), placeholder: 'HDFC0001234', autoCapitalize: 'characters', accessibilityLabel: 'IFSC code' })}
              <Tiny>The IFSC is printed on your passbook or cheque book. Bank transfers go by IMPS and arrive within minutes.</Tiny>
            </>
          )}
        </Card>
        <View className="flex-row items-start gap-2 px-1">
          <Lock size={13} color={c.ink3} />
          <Tiny className="flex-1">Your details go to RazorpayX, our payout partner. We keep only the last 4 digits of your account number.</Tiny>
        </View>
      </Screen>
    </View>
  );
}
