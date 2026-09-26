/**
 * Expert sign-up checks. She sends her details, Aadhaar number and three photos (Aadhaar front, back, selfie);
 * ops looks at them and approves or rejects. Only an approved expert can go online and get jobs.
 *
 * Aadhaar rules we follow: the full number is checked (Verhoeff checksum) and then thrown away. We keep the
 * last 4 digits to show ops, and a keyed hash so one Aadhaar cannot sign up twice. The photos live in
 * `kycFiles` (readable only by her and ops) and are deleted 30 days after approval.
 */
import * as crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { SERVICES } from './catalog';
import { isServing } from './areaGeo';
import { loadAreas } from './growth';
import { db, must, onEmulator, requireAdmin, uid, type Kyc, type PartnerDoc } from './shared';

export const KYC_FILE_KINDS = ['aadhaarFront', 'aadhaarBack', 'selfie'] as const;
const KEEP_FILES_MS = 30 * 24 * 60 * 60_000;

/* Verhoeff checksum — every real Aadhaar number passes it, and most typos do not. */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffOk(num: string) {
  let c = 0;
  num.split('').reverse().forEach((ch, i) => { c = D[c][P[i % 8][Number(ch)]]; });
  return c === 0;
}
/** 12 digits, not starting with 0 or 1, checksum valid. */
export const aadhaarOk = (n: string) => /^[2-9]\d{11}$/.test(n) && verhoeffOk(n);

const hashSecret = () => process.env.KYC_HASH_SECRET || (onEmulator ? 'emulator-only-kyc-secret' : '');
const aadhaarHash = (n: string) => {
  const secret = hashSecret();
  if (!secret) throw new HttpsError('failed-precondition', 'KYC_HASH_SECRET is not set on the server.');
  return crypto.createHmac('sha256', secret).update(n).digest('hex');
};

/** DD/MM/YYYY and at least 18 years old. */
function ageFromDob(dob: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCDate() !== d || date.getUTCMonth() !== mo - 1) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d)) age -= 1;
  return age;
}

type SubmitIn = {
  fullName: string; dob: string; gender?: string; homeAddress: string; areaId: string; skills: string[]; aadhaar: string; consent: boolean;
};

export const submitKyc = onCall<SubmitIn>(async (r) => {
  const u = uid(r);
  const i = r.data;
  const pref = db.collection('partners').doc(u);
  const p = must((await pref.get()).data() as PartnerDoc | undefined, 'Finish signing up as an expert first.');
  if (p.kyc?.status === 'approved') throw new HttpsError('failed-precondition', 'You are already verified.');
  if (p.kyc?.status === 'submitted') throw new HttpsError('failed-precondition', 'Your documents are already with our team.');
  if (!i.consent) throw new HttpsError('invalid-argument', 'Please agree to the verification check.');

  const fullName = String(i.fullName ?? '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 3 || fullName.length > 80) throw new HttpsError('invalid-argument', 'Enter your full name as printed on Aadhaar.');
  const age = ageFromDob(String(i.dob ?? ''));
  if (age === null) throw new HttpsError('invalid-argument', 'Enter your date of birth as DD/MM/YYYY.');
  if (age < 18) throw new HttpsError('invalid-argument', 'You must be at least 18 to work with Sahayak.');
  if (age > 70) throw new HttpsError('invalid-argument', 'Please check your date of birth.');
  const homeAddress = String(i.homeAddress ?? '').trim();
  if (homeAddress.length < 10) throw new HttpsError('invalid-argument', 'Enter your full home address.');
  const skills = [...new Set((i.skills ?? []).filter((s) => SERVICES.some((x) => x.skill === s)))];
  if (skills.length === 0) throw new HttpsError('invalid-argument', 'Pick at least one kind of work you do.');
  // Live areas and ones opening soon: experts sign up before launch so there is someone to send on day one.
  const area = (await loadAreas()).find((a) => a.id === i.areaId && (isServing(a) || typeof a.opensAt === 'number'));
  if (!area) throw new HttpsError('invalid-argument', 'Pick the area you want to work in.');

  const aadhaar = String(i.aadhaar ?? '').replace(/\D/g, '');
  if (!aadhaarOk(aadhaar)) throw new HttpsError('invalid-argument', 'That Aadhaar number is not valid. Check all 12 digits.');
  const hash = aadhaarHash(aadhaar);
  const dupe = await db.collection('partners').where('kyc.aadhaarHash', '==', hash).limit(2).get();
  if (dupe.docs.some((d) => d.id !== u)) throw new HttpsError('already-exists', 'This Aadhaar is already linked to another Sahayak account. Call support if that is wrong.');

  const files = await Promise.all(KYC_FILE_KINDS.map((k) => db.collection('kycFiles').doc(`${u}_${k}`).get()));
  const missing = KYC_FILE_KINDS.filter((_, n) => !files[n].exists);
  if (missing.length) throw new HttpsError('failed-precondition', 'Upload the front and back of your Aadhaar and a selfie first.');

  const kyc: Kyc = {
    status: 'submitted', fullName, dob: i.dob, gender: String(i.gender ?? '').slice(0, 20), homeAddress: homeAddress.slice(0, 300),
    aadhaarLast4: aadhaar.slice(-4), aadhaarHash: hash, submittedAt: Date.now(),
  };
  const initials = fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  await pref.update({
    kyc, name: fullName, initials, skills, areaId: area.id, hub: area.name,
    // Her first position until the app reports a live one: the centre of her area.
    at: p.at ?? area.center,
  });
  await db.collection('users').doc(u).update({ name: fullName }).catch(() => undefined);
  return { ok: true as const };
});

/** Ops decision. Approving turns work on; rejecting sends her back to fix what is wrong. */
export const adminReviewKyc = onCall<{ partnerId: string; decision: 'approve' | 'reject'; reason?: string }>(async (r) => {
  const admin = await requireAdmin(r);
  const pref = db.collection('partners').doc(r.data.partnerId);
  const p = must((await pref.get()).data() as PartnerDoc | undefined, 'Expert not found.');
  if (!p.kyc || p.kyc.status === 'not_started') throw new HttpsError('failed-precondition', 'She has not sent her documents yet.');
  const now = Date.now();
  if (r.data.decision === 'approve') {
    const deleteAt = now + KEEP_FILES_MS;
    await pref.update({
      verified: true, 'kyc.status': 'approved', 'kyc.reviewedAt': now, 'kyc.reviewedBy': admin,
      'kyc.rejectReason': FieldValue.delete(), 'kyc.filesDeleteAt': deleteAt,
    });
    const batch = db.batch();
    KYC_FILE_KINDS.forEach((k) => batch.set(db.collection('kycFiles').doc(`${r.data.partnerId}_${k}`), { deleteAt }, { merge: true }));
    await batch.commit();
  } else {
    const reason = String(r.data.reason ?? '').trim();
    if (reason.length < 5) throw new HttpsError('invalid-argument', 'Tell her what to fix (at least a few words).');
    await pref.update({
      verified: false, onShift: false, 'kyc.status': 'rejected', 'kyc.reviewedAt': now, 'kyc.reviewedBy': admin, 'kyc.rejectReason': reason.slice(0, 300),
    });
  }
  await db.collection('auditLog').add({ at: now, by: admin, action: `kyc_${r.data.decision}`, partnerId: r.data.partnerId, reason: r.data.reason ?? '' });
  return { ok: true as const };
});

/** Suspend (stops all work) or restore an expert, or move her to another area. */
export const adminUpdatePartner = onCall<{ partnerId: string; suspended?: boolean; reason?: string; areaId?: string }>(async (r) => {
  const admin = await requireAdmin(r);
  const pref = db.collection('partners').doc(r.data.partnerId);
  must((await pref.get()).exists ? true : null, 'Expert not found.');
  const patch: Record<string, unknown> = {};
  if (typeof r.data.suspended === 'boolean') {
    patch.suspended = r.data.suspended;
    if (r.data.suspended) { patch.onShift = false; patch.suspendReason = String(r.data.reason ?? '').slice(0, 200); }
    else patch.suspendReason = FieldValue.delete();
  }
  if (r.data.areaId) {
    const area = (await loadAreas()).find((a) => a.id === r.data.areaId);
    if (!area) throw new HttpsError('invalid-argument', 'Unknown area.');
    patch.areaId = area.id; patch.hub = area.name;
  }
  await pref.update(patch);
  await db.collection('auditLog').add({ at: Date.now(), by: admin, action: 'partner_update', partnerId: r.data.partnerId, patch: JSON.stringify(patch) });
  return { ok: true as const };
});

/** Called from the minute tick: Aadhaar photos go 30 days after approval. */
export async function deleteExpiredKycFiles(now: number) {
  const due = await db.collection('kycFiles').where('deleteAt', '<=', now).limit(50).get();
  if (due.empty) return;
  const batch = db.batch();
  const partners = new Set<string>();
  due.docs.forEach((d) => { batch.delete(d.ref); partners.add(String(d.get('partnerId') ?? d.id.split('_')[0])); });
  partners.forEach((id) => batch.update(db.collection('partners').doc(id), { 'kyc.filesDeleted': true }));
  await batch.commit();
}
