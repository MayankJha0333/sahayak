#!/usr/bin/env node
/**
 * Copies the app's public settings from your local .env to EAS, so cloud builds and over-the-air
 * updates talk to the live Firebase project. Run it once, and again whenever .env changes:
 *
 *   npm run eas:env
 *
 * - Only EXPO_PUBLIC_* values are sent (they end up inside the app anyway, so they are not secrets).
 * - Cloud builds always use the live backend: EXPO_PUBLIC_USE_EMULATORS is forced to "false".
 * - google-services.json is uploaded as a secret file variable (it is git-ignored, so EAS never sees it otherwise).
 *
 * Needs `eas login` first. Nothing is printed except the names of the settings.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ENVIRONMENTS = ['preview', 'production'];
const SKIP = new Set(['EXPO_PUBLIC_USE_EMULATORS', 'EXPO_PUBLIC_EMULATOR_HOST']);

if (!existsSync('.env')) {
  console.error('No .env file here. Copy .env.example to .env and fill in the live Firebase and Razorpay values first.');
  process.exit(1);
}

const vars = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
    .filter(([k, v]) => k.startsWith('EXPO_PUBLIC_') && !SKIP.has(k) && v),
);

const project = vars.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
if (!project || project.startsWith('demo-')) {
  console.error('EXPO_PUBLIC_FIREBASE_PROJECT_ID in .env is empty or a demo project. Put your live Firebase web config in .env first.');
  process.exit(1);
}
vars.EXPO_PUBLIC_USE_EMULATORS = 'false';

const envFlags = ENVIRONMENTS.flatMap((e) => ['--environment', e]);
const eas = (args) => {
  const r = spawnSync('npx', ['--yes', 'eas-cli@latest', ...args, '--non-interactive'], { stdio: ['ignore', 'ignore', 'inherit'] });
  return r.status === 0;
};

let failed = 0;
for (const [name, value] of Object.entries(vars)) {
  const ok = eas(['env:create', '--name', name, '--value', value, '--type', 'string', '--visibility', 'plaintext', '--scope', 'project', '--force', ...envFlags]);
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}

if (existsSync('google-services.json')) {
  const ok = eas(['env:create', '--name', 'GOOGLE_SERVICES_JSON', '--value', './google-services.json', '--type', 'file', '--visibility', 'secret', '--scope', 'project', '--force', ...envFlags]);
  console.log(`${ok ? '✓' : '✗'} GOOGLE_SERVICES_JSON (file)`);
  if (!ok) failed++;
} else {
  console.warn('! google-services.json not found — download it from Firebase (Project settings → Android app) and run this again.');
}

console.log(failed ? `\n${failed} setting(s) failed. Check you ran \`eas init\` and \`eas login\`.` : `\nDone. EAS builds and updates for ${ENVIRONMENTS.join(' + ')} now use project "${project}".`);
process.exit(failed ? 1 : 0);
