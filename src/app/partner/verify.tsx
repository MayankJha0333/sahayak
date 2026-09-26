import { Image } from 'expo-image';
import { Redirect, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { Camera, Check, ImageIcon, Lock, ShieldCheck } from '@/components/icons';
import { AppBar, Badge, Body, Btn, Card, Chip, Eyebrow, H, Note, Progress, Screen, SplitRow, Tiny, Title } from '@/components/ui';
import { aadhaarPretty, aadhaarValid, ageOf, dobPretty } from '@/lib/aadhaar';
import { submitKyc, uploadKycFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAreas, useKycFile } from '@/lib/db';
import { whenLabel } from '@/lib/format';
import { captureKycImage } from '@/lib/kycImage';
import type { KycFileKind } from '@/lib/types';
import { useTheme } from '@/theme';
import { areaStatus } from '@/lib/areaGeo';

const SKILLS = [
  { id: 'cleaning', label: 'Sweeping, mopping, dishes' },
  { id: 'kitchen', label: 'Kitchen deep clean' },
  { id: 'bathroom', label: 'Bathroom cleaning' },
  { id: 'laundry', label: 'Laundry and folding' },
  { id: 'cooking', label: 'Cooking help' },
];
const GENDERS = ['Female', 'Male', 'Other'];
/** Until ops adds areas the server serves Gurugram under this id. Mirrors functions/src/growth.ts. */
const DEFAULT_AREA = { id: 'default-gurugram', name: 'Gurugram', city: 'Gurugram' };
const STEPS = ['About you', 'Your work', 'Aadhaar card', 'Selfie', 'Check and send'];

/**
 * Expert sign-up: her details, the kind of work she does, her Aadhaar (number + both sides) and a selfie.
 * Ops checks them; until then she cannot go online. Also shows "under review" and "please fix" states.
 */
export default function VerifyExpert() {
  const { partner, user, signOut } = useAuth();
  const kyc = partner?.kyc;
  if (!partner || !user) return <View className="flex-1 items-center justify-center bg-ground dark:bg-ground-dark"><ActivityIndicator /></View>;
  if (partner.bot || partner.verified) return <Redirect href={'/partner' as Href} />;
  if (kyc?.status === 'submitted') return <UnderReview submittedAt={kyc.submittedAt} last4={kyc.aadhaarLast4} onSignOut={signOut} uid={user.uid} />;
  return <Form uid={user.uid} />;
}

function Form({ uid }: { uid: string }) {
  const { partner, signOut } = useAuth();
  const { c } = useTheme();
  const kyc = partner?.kyc;
  const { rows: areaRows } = useAreas();
  const areas = useMemo(() => {
    // Live areas, and ones opening soon (she can sign up before launch).
    const live = areaRows.filter((a) => areaStatus(a) !== 'paused').map((a) => ({
      id: a.id, city: a.city,
      name: areaStatus(a) === 'soon' ? `${a.name} (opens ${new Date(a.opensAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : a.name,
    }));
    return areaRows.length ? live : [DEFAULT_AREA];
  }, [areaRows]);

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(kyc?.fullName ?? (partner?.name === 'New expert' ? '' : partner?.name ?? ''));
  const [dob, setDob] = useState(kyc?.dob ?? '');
  const [gender, setGender] = useState(kyc?.gender ?? '');
  const [home, setHome] = useState(kyc?.homeAddress ?? '');
  const [areaId, setAreaId] = useState(partner?.areaId ?? '');
  const [skills, setSkills] = useState<string[]>(kyc ? partner?.skills ?? [] : []);
  const [aadhaar, setAadhaar] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const front = useKycFile(uid, 'aadhaarFront');
  const back = useKycFile(uid, 'aadhaarBack');
  const selfie = useKycFile(uid, 'selfie');

  const age = ageOf(dob);
  const digits = aadhaar.replace(/\D/g, '');
  const checks = [
    fullName.trim().length >= 3 && age !== null && age >= 18 && age <= 70 && home.trim().length >= 10,
    Boolean(areas.find((a) => a.id === areaId)) && skills.length > 0,
    aadhaarValid(digits) && Boolean(front) && Boolean(back),
    Boolean(selfie),
    consent,
  ];
  const stepHint = [
    age !== null && age < 18 ? 'You must be at least 18 to work with Sahayak.' : 'Fill in your name, date of birth and home address.',
    'Pick your area and at least one kind of work.',
    digits.length === 12 && !aadhaarValid(digits) ? 'That Aadhaar number is not valid. Check all 12 digits.' : 'Enter your Aadhaar number and add photos of both sides.',
    'Take a clear selfie.',
    'Tick the box to agree.',
  ][step];

  const next = async () => {
    setErr('');
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    setBusy(true);
    try {
      await submitKyc({ fullName: fullName.trim(), dob, gender, homeAddress: home.trim(), areaId, skills, aadhaar: digits, consent });
      setAadhaar('');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const input = (props: React.ComponentProps<typeof TextInput>) => (
    <TextInput placeholderTextColor={c.ink3} {...props}
      className="font-jk rounded-2xl bg-sunk px-4 py-3.5 text-[15px] text-ink dark:bg-sunk-dark dark:text-ink-dark" />
  );

  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar
        title={STEPS[step]} subtitle={`Expert sign-up · step ${step + 1} of ${STEPS.length}`}
        back={step > 0} onBack={() => { setErr(''); setStep(step - 1); }}
        right={<Pressable onPress={signOut} hitSlop={10}><Text className="font-jkm text-[13px] text-ink3 dark:text-ink3-dark">Sign out</Text></Pressable>} />
      <Screen footer={
        <View className="gap-2">
          {err ? <Text className="font-jkm text-center text-[13px] text-crit dark:text-crit-dark">{err}</Text>
            : !checks[step] ? <Tiny className="text-center">{stepHint}</Tiny> : null}
          <Btn title={step === STEPS.length - 1 ? 'Send for verification' : 'Continue'} busy={busy} disabled={!checks[step]} onPress={next} />
        </View>
      }>
        <Progress value={(step + 1) / STEPS.length} />

        {kyc?.status === 'rejected' && step === 0 ? (
          <Note tone="crit">Our team could not verify you yet: {kyc.rejectReason}. Fix this and send again.</Note>
        ) : null}

        {step === 0 ? (
          <>
            <Card>
              <Eyebrow>Full name, exactly as on Aadhaar</Eyebrow>
              {input({ value: fullName, onChangeText: setFullName, placeholder: 'Sunita Devi', autoCapitalize: 'words', accessibilityLabel: 'Full name' })}
              <Eyebrow>Date of birth</Eyebrow>
              {input({ value: dob, onChangeText: (t) => { const v = dobPretty(t); setDob(v); if (v.length === 10) Keyboard.dismiss(); }, placeholder: 'DD/MM/YYYY', keyboardType: 'number-pad', maxLength: 10, accessibilityLabel: 'Date of birth' })}
              {age !== null && age < 18 ? <Tiny className="text-crit dark:text-crit-dark">You must be at least 18.</Tiny> : null}
              <Eyebrow>Gender (optional)</Eyebrow>
              <View className="flex-row flex-wrap gap-2">{GENDERS.map((g) => <Chip key={g} label={g} on={gender === g} onPress={() => setGender(gender === g ? '' : g)} />)}</View>
              <Eyebrow>Home address</Eyebrow>
              {input({ value: home, onChangeText: setHome, placeholder: 'House, street, area, city, PIN', multiline: true, accessibilityLabel: 'Home address', style: { minHeight: 76, textAlignVertical: 'top' } })}
            </Card>
            <Tiny>Customers see your first name and photo initials only. Your address and date of birth are for our records.</Tiny>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Card>
              <Eyebrow>Where do you want to work?</Eyebrow>
              <View className="flex-row flex-wrap gap-2">{areas.map((a) => <Chip key={a.id} label={a.city && a.city !== a.name ? `${a.name}, ${a.city}` : a.name} on={areaId === a.id} onPress={() => setAreaId(a.id)} />)}</View>
              {areas.length === 0 ? <Tiny>We are not taking new experts right now. Please check back soon.</Tiny> : null}
            </Card>
            <Card>
              <Eyebrow>What work do you do?</Eyebrow>
              <View className="flex-row flex-wrap gap-2">
                {SKILLS.map((s) => <Chip key={s.id} label={s.label} on={skills.includes(s.id)} onPress={() => setSkills(skills.includes(s.id) ? skills.filter((x) => x !== s.id) : [...skills, s.id])} />)}
              </View>
              <Tiny>You only get jobs that need the work you picked. You can change this later with our team.</Tiny>
            </Card>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Card>
              <Eyebrow>Aadhaar number</Eyebrow>
              {input({ value: aadhaarPretty(aadhaar), onChangeText: (t) => { const v = t.replace(/\D/g, '').slice(0, 12); setAadhaar(v); if (v.length === 12) Keyboard.dismiss(); }, placeholder: '1234 5678 9012', keyboardType: 'number-pad', maxLength: 14, accessibilityLabel: 'Aadhaar number' })}
              {digits.length === 12 ? (
                aadhaarValid(digits)
                  ? <View className="flex-row items-center gap-1.5"><Check size={14} color={c.ok} /><Tiny className="text-ok dark:text-ok-dark">Looks right</Tiny></View>
                  : <Tiny className="text-crit dark:text-crit-dark">This is not a valid Aadhaar number. Check the digits.</Tiny>
              ) : kyc?.aadhaarLast4 ? <Tiny>Enter it again to send. Last time: •••• •••• {kyc.aadhaarLast4}</Tiny> : null}
              <View className="flex-row items-start gap-2">
                <Lock size={13} color={c.ink3} />
                <Tiny className="flex-1">We check the number and keep only the last 4 digits. The full number is never saved.</Tiny>
              </View>
            </Card>
            <PhotoSlot uid={uid} kind="aadhaarFront" title="Front of Aadhaar" hint="The side with your photo, name and date of birth." has={Boolean(front)} data={front?.data} />
            <PhotoSlot uid={uid} kind="aadhaarBack" title="Back of Aadhaar" hint="The side with your address." has={Boolean(back)} data={back?.data} />
            <Tiny>Lay the card on a plain surface in good light. All four corners and every word should be clear. No photocopies.</Tiny>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <PhotoSlot uid={uid} kind="selfie" title="A selfie" hint="Face the camera in good light. No sunglasses, cap or mask." has={Boolean(selfie)} data={selfie?.data} selfie />
            <Tiny>We match this with the photo on your Aadhaar. Customers also see it on the job card so they know who is at the door.</Tiny>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Card>
              <Eyebrow>Your details</Eyebrow>
              <SplitRow label="Name" value={fullName.trim()} />
              <SplitRow label="Date of birth" value={dob} />
              {gender ? <SplitRow label="Gender" value={gender} /> : null}
              <SplitRow label="Area" value={areas.find((a) => a.id === areaId)?.name ?? '—'} />
              <SplitRow label="Work" value={`${skills.length} kind${skills.length === 1 ? '' : 's'}`} />
              <SplitRow label="Aadhaar" value={`•••• •••• ${digits.slice(-4)}`} />
              <SplitRow label="Photos" value="Front, back, selfie" />
            </Card>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)}
              className="flex-row items-start gap-3 rounded-3xl bg-paper p-4 dark:bg-paper-dark">
              <View className={`mt-0.5 h-6 w-6 items-center justify-center rounded-lg border ${consent ? 'border-brand bg-brand' : 'border-line dark:border-line-dark'}`}>
                {consent ? <Check size={15} color={c.onBrand} /> : null}
              </View>
              <Text className="font-jk flex-1 text-[13px] leading-5 text-ink2 dark:text-ink2-dark">
                I agree that Sahayak may check my Aadhaar and selfie to verify who I am. The photos are deleted 30 days after I am approved, and only the last 4 digits of my Aadhaar are kept.
              </Text>
            </Pressable>
            <Note>Our team usually checks documents within a day. You can go online and start getting jobs as soon as you are approved.</Note>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

function PhotoSlot({ uid, kind, title, hint, has, data, selfie }: {
  uid: string; kind: KycFileKind; title: string; hint: string; has: boolean; data?: string; selfie?: boolean;
}) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const take = async (source: 'camera' | 'library') => {
    Keyboard.dismiss(); setErr(''); setBusy(true);
    try {
      const img = await captureKycImage(source, { selfie });
      if (img) await uploadKycFile(kind, img);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  void uid;
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <H>{title}</H>
        {has ? <Badge tone="ok" label="Added" /> : null}
      </View>
      <Tiny>{hint}</Tiny>
      {data ? (
        <Image source={{ uri: `data:image/jpeg;base64,${data}` }} contentFit="cover" accessibilityLabel={`${title} photo`}
          style={{ width: '100%', aspectRatio: selfie ? 1 : 1.58, borderRadius: 18, backgroundColor: c.sunk }} />
      ) : (
        <View className="items-center justify-center rounded-3xl border border-dashed border-line bg-sunk dark:border-line-dark dark:bg-sunk-dark" style={{ aspectRatio: selfie ? 1.4 : 1.58 }}>
          {busy ? <ActivityIndicator color={c.brand} /> : selfie ? <Camera size={30} color={c.ink3} /> : <ImageIcon size={30} color={c.ink3} />}
        </View>
      )}
      {err ? <Tiny className="text-crit dark:text-crit-dark">{err}</Tiny> : null}
      <View className="flex-row gap-2">
        <View className="flex-1"><Btn size="sm" tone={has ? 'secondary' : 'primary'} title={has ? 'Retake' : selfie ? 'Take selfie' : 'Take photo'} busy={busy} onPress={() => take('camera')} /></View>
        <View className="flex-1"><Btn size="sm" tone="secondary" title="From gallery" disabled={busy} onPress={() => take('library')} /></View>
      </View>
    </Card>
  );
}

function UnderReview({ submittedAt, last4, onSignOut, uid }: { submittedAt?: number; last4?: string; onSignOut: () => void; uid: string }) {
  const { c } = useTheme();
  const selfie = useKycFile(uid, 'selfie');
  return (
    <View className="flex-1 bg-ground dark:bg-ground-dark">
      <AppBar title="We are checking your documents" subtitle="Expert verification" />
      <Screen footer={<Btn title="Sign out" tone="secondary" onPress={onSignOut} />}>
        <Card>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-warn-soft dark:bg-warn-softdark"><ShieldCheck size={22} color={c.warn} /></View>
            <View className="flex-1">
              <Title>Under review</Title>
              <Tiny>Sent {submittedAt ? whenLabel(submittedAt) : 'just now'} · Aadhaar ending {last4 ?? '••••'}</Tiny>
            </View>
          </View>
          <Body>Our team is matching your Aadhaar and selfie. This usually takes less than a day. We will let you know here as soon as you are approved.</Body>
        </Card>
        {selfie?.data ? (
          <Image source={{ uri: `data:image/jpeg;base64,${selfie.data}` }} contentFit="cover" style={{ width: 96, height: 96, borderRadius: 48, alignSelf: 'center' }} />
        ) : null}
        <Card flat>
          <Eyebrow>What happens next</Eyebrow>
          <Body>1. We check that your name, photo and Aadhaar match.</Body>
          <Body>2. Once approved, you can go online and get jobs near you.</Body>
          <Body>3. Add your UPI ID or bank account in Earnings to withdraw what you earn.</Body>
        </Card>
        <Tiny>If something is wrong, we will tell you what to fix and you can send your documents again.</Tiny>
      </Screen>
    </View>
  );
}
