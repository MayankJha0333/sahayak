import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Lock, ShieldCheck, Timer } from '@/components/icons';
import { BrandPanel } from '@/components/BrandPanel';
import { RecaptchaGate, type PhoneVerifier } from '@/components/RecaptchaGate';
import { Btn, Note, Tiny } from '@/components/ui';
import { useAuth, type PhoneConfirmation } from '@/lib/auth';
import { emulatorOtp } from '@/lib/fb/auth';
import { useNativeSdk } from '@/lib/fb/runtime';
import { USE_EMULATORS } from '@/lib/firebase';
import { clearReferral, pendingReferral } from '@/lib/referral';
import { useTheme } from '@/theme';

type Step = 'phone' | 'otp' | 'name';

const RESEND_SECONDS = 30;
const OTP_LENGTH = 6;

/** Sign in for customers and partners: mobile number → SMS OTP → (first time) name. */
export default function Login() {
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role = roleParam === 'partner' ? 'partner' : 'customer';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { user, phoneStart, profileExists, ensureProfile } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [ref, setRef] = useState('');
  const [showRef, setShowRef] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resendLeft, setResendLeft] = useState(0);
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [kb, setKb] = useState(false);
  const [emuCode, setEmuCode] = useState('');

  // The hero folds up while the keyboard is open so the field and the button both stay in view.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const gate = useRef<PhoneVerifier>(null);
  const otpInput = useRef<TextInput>(null);
  const handled = useRef(false);

  const needsGate = Platform.OS !== 'web' && !useNativeSdk;
  const e164 = `+91${digits}`;
  const phoneOk = digits.length === 10 && /^[6-9]/.test(digits);
  const pretty = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`.trim();
  const dest = role === 'partner' ? '/partner' : '/customer';

  // Resend countdown. Anchored to a tick so nothing reads the clock during render.
  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = setTimeout(() => setResendLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendLeft]);

  // Already signed in (or Android verified the SMS on its own): skip straight past the OTP.
  useEffect(() => {
    if (user && !handled.current && (step === 'otp' || step === 'phone')) void afterVerified();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); }
    catch (e) {
      const err = e as Error & { code?: string };
      if (__DEV__) console.warn('[sign-in]', err.code, err.message);
      setErr(friendly(err.code, err.message));
    }
    finally { setBusy(false); }
  };

  const sendOtp = () => run(async () => {
    Keyboard.dismiss();
    const conf = await phoneStart(e164, needsGate ? gate.current ?? undefined : undefined);
    setConfirmation(conf);
    setOtp('');
    setResendLeft(RESEND_SECONDS);
    setStep('otp');
    setTimeout(() => otpInput.current?.focus(), 350);
    if (USE_EMULATORS) {
      // Local emulator: no SMS exists, so show the code it generated.
      const code = await emulatorOtp(e164);
      if (code) setEmuCode(code);
    }
  });

  const afterVerified = async () => {
    if (handled.current) return;
    handled.current = true;
    try {
      if (await profileExists()) { await ensureProfile(role); router.replace(dest); }
      else {
        const code = await pendingReferral();
        if (code) { setRef(code); setShowRef(true); }
        setStep('name'); setBusy(false);
      }
    } catch (e) {
      handled.current = false;
      setErr(friendly((e as Error & { code?: string }).code, (e as Error).message));
      setBusy(false);
    }
  };

  const verify = (code = otp) => run(async () => {
    if (!confirmation) throw Object.assign(new Error('Ask for a new OTP.'), { code: 'auth/code-expired' });
    try { await confirmation.confirm(code); }
    catch (e) {
      // Wrong code: empty the boxes so she can type the right one straight away.
      setOtp('');
      setTimeout(() => otpInput.current?.focus(), 50);
      throw e;
    }
    await afterVerified();
  });

  const onOtpChange = (t: string) => {
    const clean = t.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(clean);
    if (err && clean.length > 0) setErr('');
    if (clean.length === OTP_LENGTH) void verify(clean);
  };

  const start = () => run(async () => {
    await ensureProfile(role, { name: name.trim(), phone: digits ? e164 : undefined, referralCode: ref.trim() || undefined });
    await clearReferral();
    router.replace(dest);
  });

  const changeNumber = () => { setStep('phone'); setOtp(''); setErr(''); setConfirmation(null); handled.current = false; };

  const headline = role === 'partner'
    ? { eyebrow: 'Partner app', a: 'Kaam shuru karein,', b: 'aaj se.', sub: 'Jobs near you · weekly payouts · insurance included' }
    : { eyebrow: 'Sahayak', a: 'Ghar ka kaam,', b: '10 minute mein.', sub: 'Verified experts at your door, paid by the hour' };

  return (
    <View className="flex-1 bg-hero-deep dark:bg-hero-dark">
      <StatusBar style="light" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          {/* Hero */}
          <BrandPanel style={{ paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: kb ? 30 : 48 }}>

            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back"
                className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
                <ChevronLeft size={20} color="#FFFFFF" />
              </Pressable>
              {kb ? <Text className="font-jkx text-[10.5px] uppercase tracking-[1.6px] text-white/70">{headline.eyebrow}</Text> : null}
            </View>

            {!kb ? (
              <>
                <Text className="mt-7 font-jkx text-[10.5px] uppercase tracking-[1.6px] text-white/70">{headline.eyebrow}</Text>
                <Text className="mt-2 font-jkx text-[32px] leading-[38px] tracking-tight text-white">
                  {headline.a}{'\n'}<Text className="text-amber">{headline.b}</Text>
                </Text>
                <Text className="mt-2.5 font-jk text-[13.5px] leading-5 text-white/70">{headline.sub}</Text>

                <View className="mt-6 flex-row gap-4">
                  {[[ShieldCheck, 'Verified'], [Timer, '10-min arrival'], [Lock, 'No password']].map(([Icon, label]) => (
                    <View key={label as string} className="flex-row items-center gap-1.5">
                      <Icon size={13} color="rgba(255,255,255,0.8)" />
                      <Text className="font-jkm text-[11.5px] text-white/80">{label as string}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </BrandPanel>

          {/* Sheet */}
          <View className="-mt-6 flex-1 rounded-t-[32px] bg-ground px-5 pt-7 dark:bg-ground-dark" style={{ paddingBottom: 16 }}>
            <View className="mb-6 flex-row items-center gap-1.5">
              {(['phone', 'otp', 'name'] as Step[]).map((s, i) => {
                const idx = ['phone', 'otp', 'name'].indexOf(step);
                return <View key={s} className={`h-1.5 rounded-full ${i <= idx ? 'w-7 bg-brand' : 'w-3 bg-line dark:bg-line-dark'}`} />;
              })}
              <Text className="ml-2 font-jkm text-[11px] text-ink3 dark:text-ink3-dark">
                {step === 'phone' ? 'Step 1 of 2' : step === 'otp' ? 'Step 2 of 2' : 'One last thing'}
              </Text>
            </View>

            {step === 'phone' ? (
              <PhoneStep digits={digits} onChange={(d) => { setDigits(d); if (err) setErr(''); }} onSubmit={sendOtp} busy={busy} err={err} role={role} c={c} />
            ) : step === 'otp' ? (
              <OtpStep
                pretty={pretty} otp={otp} onChange={onOtpChange} inputRef={otpInput} busy={busy} err={err}
                resendLeft={resendLeft} onResend={sendOtp} onChangeNumber={changeNumber} onSubmit={() => verify()} c={c}
                hint={emuCode ? `Emulator OTP: ${emuCode}` : __DEV__ && digits === '9999999999' ? 'Test number · OTP 123456' : ''}
              />
            ) : (
              <NameStep
                role={role} name={name} onName={setName} refCode={ref} onRef={setRef} showRef={showRef} onShowRef={() => setShowRef(true)}
                busy={busy} err={err} onSubmit={start} c={c}
              />
            )}
          </View>
        </ScrollView>
        {/* Primary action stays visible above the keyboard */}
        <View className="border-t border-line2 bg-ground px-5 pt-3 dark:border-line2-dark dark:bg-ground-dark" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          {step === 'phone' ? (
            <Btn title="Get OTP" busy={busy} disabled={!phoneOk} onPress={sendOtp} />
          ) : step === 'otp' ? (
            <Btn title={busy ? 'Verifying' : 'Verify & continue'} busy={busy} disabled={otp.length < OTP_LENGTH} onPress={() => verify()} />
          ) : (
            <Btn title={role === 'partner' ? 'Continue' : 'Start booking'} busy={busy} disabled={name.trim().length < 2} onPress={start} />
          )}
        </View>
      </KeyboardAvoidingView>
      {needsGate ? <RecaptchaGate ref={gate} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

type Colours = ReturnType<typeof useTheme>['c'];

function PhoneStep({ digits, onChange, onSubmit, busy, err, role, c }: {
  digits: string; onChange: (d: string) => void; onSubmit: () => void; busy: boolean; err: string; role: 'customer' | 'partner'; c: Colours;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState(false);
  const ok = digits.length === 10 && /^[6-9]/.test(digits);
  const border = err ? 'border-crit dark:border-crit-dark' : focus ? 'border-brand dark:border-brand-dark' : 'border-line dark:border-line-dark';
  return (
    <View className="gap-5">
      <View className="gap-1.5">
        <Text className="font-jkb text-[24px] leading-8 tracking-tight text-ink dark:text-ink-dark">Enter your mobile number</Text>
        <Text className="font-jk text-[14px] leading-[21px] text-ink2 dark:text-ink2-dark">
          We will text you a 6-digit OTP. {role === 'partner' ? 'Use the number linked to your bank account.' : 'No password to remember.'}
        </Text>
      </View>

      <View className="flex-row gap-2.5">
        <View className="h-[60px] flex-row items-center gap-2 rounded-[18px] border border-line bg-paper px-4 dark:border-line-dark dark:bg-paper-dark">
          <View className="rounded-md bg-brand-soft px-1.5 py-0.5 dark:bg-brand-softdark">
            <Text className="font-jkx text-[9.5px] tracking-[0.8px] text-brand dark:text-brand-dark">IND</Text>
          </View>
          <Text className="font-jks text-[18px] text-ink dark:text-ink-dark">+91</Text>
        </View>
        <View className={`h-[60px] flex-1 flex-row items-center rounded-[18px] border-[1.5px] bg-paper px-4 dark:bg-paper-dark ${border}`}>
          <TextInput
            value={format(digits)}
            onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="98765 43210"
            placeholderTextColor={c.ink3}
            maxLength={11}
            autoFocus
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onSubmitEditing={ok ? onSubmit : undefined}
            accessibilityLabel="Mobile number"
            className="font-jks flex-1 text-[19px] tracking-[1.2px] text-ink dark:text-ink-dark"
          />
          {ok ? (
            <View className="h-6 w-6 items-center justify-center rounded-full bg-ok-soft dark:bg-ok-softdark"><Check size={13} color={c.ok} /></View>
          ) : null}
        </View>
      </View>

      {err ? <Note tone="crit">{err}</Note> : null}
      {!err && digits.length === 10 && !ok ? <Note tone="crit">Indian mobile numbers start with 6, 7, 8 or 9.</Note> : null}
      {!err && digits.length > 0 && digits.length < 10 ? <Tiny>{10 - digits.length} more digit{10 - digits.length === 1 ? '' : 's'}</Tiny> : null}

      <Tiny className="text-center">
        By continuing you agree to our{' '}
        <Text className="font-jkb text-ink2 underline dark:text-ink2-dark" onPress={() => router.push({ pathname: '/legal', params: { page: 'terms' } })}>Terms</Text> and{' '}
        <Text className="font-jkb text-ink2 underline dark:text-ink2-dark" onPress={() => router.push({ pathname: '/legal', params: { page: 'privacy' } })}>Privacy Policy</Text>. Standard SMS charges may apply.
      </Tiny>
    </View>
  );
}

function OtpStep({ pretty, otp, onChange, inputRef, busy, err, resendLeft, onResend, onChangeNumber, onSubmit, c, hint }: {
  pretty: string; otp: string; onChange: (t: string) => void; inputRef: React.RefObject<TextInput | null>; busy: boolean; err: string;
  resendLeft: number; onResend: () => void; onChangeNumber: () => void; onSubmit: () => void; c: Colours; hint?: string;
}) {
  const [focus, setFocus] = useState(false);
  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '');
  const active = Math.min(otp.length, OTP_LENGTH - 1);
  return (
    <View className="gap-5">
      <View className="gap-1.5">
        <Text className="font-jkb text-[24px] leading-8 tracking-tight text-ink dark:text-ink-dark">Enter the OTP</Text>
        <View className="flex-row flex-wrap items-center gap-x-1.5">
          <Text className="font-jk text-[14px] leading-[21px] text-ink2 dark:text-ink2-dark">Sent by SMS to</Text>
          <Text className="font-jks text-[14px] leading-[21px] text-ink dark:text-ink-dark">{pretty}</Text>
          <Pressable onPress={onChangeNumber} hitSlop={8} accessibilityRole="button">
            <Text className="font-jkb text-[14px] leading-[21px] text-brand dark:text-brand-dark">Change</Text>
          </Pressable>
        </View>
      </View>

      <Pressable onPress={() => inputRef.current?.focus()} accessibilityRole="none">
        <View className="flex-row justify-between">
          {boxes.map((d, i) => {
            const isActive = focus && i === active && otp.length < OTP_LENGTH;
            const border = err ? 'border-crit dark:border-crit-dark' : isActive ? 'border-brand dark:border-brand-dark' : d ? 'border-ink/30 dark:border-ink-dark/30' : 'border-line dark:border-line-dark';
            return (
              <View key={i} className={`h-[60px] w-[48px] items-center justify-center rounded-2xl border-[1.5px] bg-paper dark:bg-paper-dark ${border}`}>
                {d ? (
                  <Text className="font-jkx text-[24px] text-ink dark:text-ink-dark">{d}</Text>
                ) : isActive ? (
                  <View className="h-6 w-0.5 rounded-full bg-brand" />
                ) : (
                  <View className="h-1.5 w-1.5 rounded-full bg-line dark:bg-line-dark" />
                )}
              </View>
            );
          })}
        </View>
        <TextInput
          ref={inputRef}
          value={otp}
          onChangeText={onChange}
          keyboardType="number-pad"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          textContentType="oneTimeCode"
          maxLength={OTP_LENGTH}
          autoFocus
          caretHidden
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onSubmitEditing={otp.length === OTP_LENGTH ? onSubmit : undefined}
          accessibilityLabel="One-time code"
          style={{ position: 'absolute', opacity: 0, height: 60, width: '100%', color: 'transparent' }}
        />
      </Pressable>

      {err ? <Note tone="crit">{err}</Note> : null}
      {hint ? <Tiny className="text-center">{hint}</Tiny> : null}

      <View className="flex-row items-center justify-center gap-1">
        <Text className="font-jk text-[13px] text-ink3 dark:text-ink3-dark">Didn't get it?</Text>
        {resendLeft > 0 ? (
          <Text className="font-jkm text-[13px] text-ink3 dark:text-ink3-dark">Resend in 0:{String(resendLeft).padStart(2, '0')}</Text>
        ) : (
          <Pressable onPress={onResend} disabled={busy} hitSlop={8} accessibilityRole="button">
            <Text className="font-jkb text-[13px] text-brand dark:text-brand-dark">Resend OTP</Text>
          </Pressable>
        )}
      </View>
      <View className="flex-row items-center justify-center gap-1.5">
        <Lock size={11} color={c.ink3} />
        <Tiny>Never share your OTP. Sahayak will never call to ask for it.</Tiny>
      </View>
    </View>
  );
}

function NameStep({ role, name, onName, refCode, onRef, showRef, onShowRef, busy, err, onSubmit, c }: {
  role: 'customer' | 'partner'; name: string; onName: (t: string) => void; refCode: string; onRef: (t: string) => void;
  showRef: boolean; onShowRef: () => void; busy: boolean; err: string; onSubmit: () => void; c: Colours;
}) {
  const [focus, setFocus] = useState<'name' | 'ref' | null>(null);
  const ok = name.trim().length >= 2;
  const field = (on: boolean) => `h-[60px] flex-row items-center rounded-[18px] border-[1.5px] bg-paper px-4 dark:bg-paper-dark ${on ? 'border-brand dark:border-brand-dark' : 'border-line dark:border-line-dark'}`;
  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-2">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-ok-soft dark:bg-ok-softdark"><Check size={15} color={c.ok} /></View>
        <Text className="font-jkm text-[13px] text-ok dark:text-ok-dark">Number verified</Text>
      </View>
      <View className="gap-1.5">
        <Text className="font-jkb text-[24px] leading-8 tracking-tight text-ink dark:text-ink-dark">
          {role === 'partner' ? 'Your name, as on Aadhaar' : 'What should we call you?'}
        </Text>
        <Text className="font-jk text-[14px] leading-[21px] text-ink2 dark:text-ink2-dark">
          {role === 'partner' ? 'Customers see this on the job card. It must match your ID for verification.' : 'The expert asks for you by name at the door.'}
        </Text>
      </View>

      <View className={field(focus === 'name')}>
        <TextInput
          value={name} onChangeText={onName} placeholder="Full name" placeholderTextColor={c.ink3}
          autoCapitalize="words" autoComplete="name" textContentType="name" autoFocus returnKeyType="done"
          onFocus={() => setFocus('name')} onBlur={() => setFocus(null)} onSubmitEditing={ok ? onSubmit : undefined}
          accessibilityLabel="Your name"
          className="font-jks flex-1 text-[17px] text-ink dark:text-ink-dark"
        />
      </View>

      {showRef ? (
        <View className={field(focus === 'ref')}>
          <TextInput
            value={refCode} onChangeText={(t) => onRef(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="Referral code" placeholderTextColor={c.ink3} autoCapitalize="characters" autoCorrect={false}
            onFocus={() => setFocus('ref')} onBlur={() => setFocus(null)} accessibilityLabel="Referral code"
            className="font-jks flex-1 text-[17px] tracking-[2px] text-ink dark:text-ink-dark"
          />
          <Text className="font-jkm text-[12px] text-ink3 dark:text-ink3-dark">₹100 on first {role === 'partner' ? 'job' : 'booking'}</Text>
        </View>
      ) : null}

      {err ? <Note tone="crit">{err}</Note> : null}
    </View>
  );
}

const format = (d: string) => (d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d);

function friendly(code: string | undefined, fallback: string) {
  switch (code) {
    case 'auth/invalid-phone-number': return 'That does not look like a valid Indian mobile number.';
    case 'auth/invalid-verification-code':
    case 'auth/invalid-verification-id': return 'That OTP is not right. Check the SMS and try again.';
    case 'auth/code-expired':
    case 'auth/session-expired': return 'That OTP has expired. Tap Resend to get a new one.';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded': return 'Too many attempts from this number. Wait a few minutes and try again.';
    case 'auth/network-request-failed': return USE_EMULATORS
      ? 'The local Firebase emulators are not running. In the project folder run: npm run firebase:emulators'
      : 'No internet connection. Check your network and try again.';
    case 'auth/cancelled': return 'The security check was closed before it finished.';
    case 'auth/recaptcha':
    case 'auth/invalid-app-credential':
    case 'auth/captcha-check-failed': return 'The security check failed. Tap Get OTP to try again.';
    case 'auth/operation-not-allowed': return 'Phone sign-in is not enabled in Firebase yet.';
    case 'auth/missing-client-identifier':
    case 'auth/app-not-authorized': return 'This build is not authorised: add its SHA-1 and SHA-256 to the Android app in Firebase.';
    case 'auth/argument-error': return 'The security check could not start. Restart the app and try again.';
    default: return fallback || 'Something went wrong.';
  }
}
