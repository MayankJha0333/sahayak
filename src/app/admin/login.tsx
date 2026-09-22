import { Redirect } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppBar, Btn, Card, Eyebrow, Note, Screen, Tiny, Title } from '@/components/ui';
import { devAdmin } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { USE_EMULATORS } from '@/lib/firebase';
import { inExpoGo } from '@/lib/fb/runtime';
import { useTheme } from '@/theme';

export default function AdminLogin() {
  const { c } = useTheme();
  const { user, isAdmin, adminKnown, emailSignIn, googleSignIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); }
    catch { setErr('Could not sign in, or this account is not on the admins list.'); }
    finally { setBusy(false); }
  };

  // Signed in and on the admins list: the console takes over. Signed in but not an admin: say so.
  if (user && adminKnown && isAdmin) return <Redirect href="/admin" />;
  const notStaff = Boolean(user && adminKnown && !isAdmin && user.email);

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="Ops console" subtitle="Staff only" back />
      <Screen footer={<>
        <Btn title="Sign in" busy={busy} disabled={!email || !password} onPress={() => run(() => emailSignIn(email.trim(), password))} />
        {!inExpoGo ? <Btn title="Continue with Google" tone="secondary" disabled={busy} onPress={() => run(googleSignIn)} /> : null}
      </>}>
        <Title>Sign in with your work email</Title>
        <Card>
          <Eyebrow>Email</Eyebrow>
          <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@company.in"
            placeholderTextColor={c.ink3} accessibilityLabel="Email"
            className="font-jk rounded-2xl bg-sunk px-4 py-3.5 text-[15px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
          <Eyebrow>Password</Eyebrow>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••"
            placeholderTextColor={c.ink3} accessibilityLabel="Password"
            className="font-jk rounded-2xl bg-sunk px-4 py-3.5 text-[15px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
        </Card>
        {err ? <Note tone="crit">{err}</Note> : null}
        {notStaff ? <><Note tone="crit">{user?.email} is not on the admins list.</Note><Btn title="Sign out" tone="secondary" size="sm" onPress={() => signOut()} /></> : null}
        {USE_EMULATORS ? (
          <Card>
            <Eyebrow>Local emulator</Eyebrow>
            <Tiny>Creates a test staff account on the emulator and fills it in.</Tiny>
            <Btn title="Use the test admin" tone="secondary" size="sm" disabled={busy}
              onPress={async () => { try { const r = await devAdmin({}); setEmail(r.email); setPassword(r.password); } catch { setErr('Start the Firebase emulators first.'); } }} />
          </Card>
        ) : null}
        <Note>
          Create the account in Firebase → Authentication → Users, then add a document with that user’s UID to the{' '}
          <Tiny>admins</Tiny> collection.
        </Note>
      </Screen>
    </View>
  );
}
