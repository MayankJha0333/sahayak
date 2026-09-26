#!/usr/bin/env node
/**
 * Starts the Firebase emulators for local development.
 * The Firestore emulator needs Java. If `java` is not on PATH, this looks in the usual
 * places on a Mac (Android Studio's bundled runtime, Homebrew's Temurin) before giving up.
 */
const { spawnSync, spawn } = require('child_process');
const { existsSync } = require('fs');
const os = require('os');
const path = require('path');

const candidates = [
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  path.join(os.homedir(), 'Applications/Android Studio.app/Contents/jbr/Contents/Home'),
  '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
  '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
  '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
  '/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
  '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home',
  '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
];

const hasJava = (env) => spawnSync('java', ['-version'], { env, stdio: 'ignore' }).status === 0;

const env = { ...process.env };
if (!hasJava(env)) {
  const home = candidates.find((c) => existsSync(path.join(c, 'bin', 'java')));
  if (home) {
    env.JAVA_HOME = home;
    env.PATH = `${path.join(home, 'bin')}${path.delimiter}${env.PATH}`;
    console.log(`Using Java from ${home}`);
  }
}
if (!hasJava(env)) {
  console.error('\nThe Firestore emulator needs Java and none was found.');
  console.error('Install it once with:   brew install --cask temurin@21');
  console.error('(or install Android Studio, whose bundled Java is picked up automatically)\n');
  process.exit(1);
}

const args = ['-y', 'firebase-tools@latest', 'emulators:start', '--only', 'auth,firestore,functions,hosting', '--project', 'demo-sahayak'];
const child = spawn('npx', args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
