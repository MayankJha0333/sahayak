# Releasing the Android app

How code gets from this repo to people's phones.

```
 you push to main ──► Checks ──► App update → preview ──► testers' phones, in minutes

 npm run release  ──► Release to Play Store ──► EAS builds the app ──► Play Console, as a draft
 (tag v1.0.x)                                                         you press "Start rollout"
```

All of this runs on **EAS Workflows** (Expo's own CI/CD). The recipes live in `.eas/workflows/`:

| File | Runs when | Does |
|---|---|---|
| `checks.yml` | Pull request or push to `main` | Typechecks the app, builds Cloud Functions and the ops website |
| `app-update-preview.yml` | Push to `main` that changes the app | Over-the-air update to test builds |
| `app-update-production.yml` | You run it | Over-the-air update to everyone on the Play Store app |
| `release-android.yml` | A `v*` tag (`npm run release`) or you run it | Store build → Play Console, internal track, as a draft |

| What changed | How it ships | How long |
|---|---|---|
| Screens, text, logic (JavaScript) | **Over the air** — `App update` workflows | Minutes, no store review |
| New native library, icon, permissions, app version | **New store build** — `npm run release` | ~20 min build + Google review |

---

## One-time setup

Do these once, in order. Steps 1–4 are in your terminal, inside this folder.

### 1. Link the repo to your Expo account

```bash
npx eas-cli@latest init
npx eas-cli@latest update:configure
```

This writes your EAS project id and update URL into `app.json`. Commit `app.json`.

### 2. Send the app's live settings to EAS

Your `.env` must hold the **live** Firebase web config, the Razorpay key id and the Maps key
(not the emulator values). Put `google-services.json` from Firebase in the project root. Then:

```bash
npm run eas:env
```

It copies every `EXPO_PUBLIC_*` value to EAS (preview + production) and uploads `google-services.json`
as a secret file. Cloud builds always point at the live backend.

### 3. First store build (creates the signing key)

```bash
npx eas-cli@latest build --platform android --profile production
```

Answer **Yes** when it offers to generate a new Android keystore. EAS keeps the key safe — every later
build, including the ones from GitHub, signs with it. Download the `.aab` file when the build finishes.

### 4. Play Console

1. Create the app in [Play Console](https://play.google.com/console) (name **Sahayak**, package `com.sahayak.app`).
2. **Upload the first `.aab` by hand** — Google only allows automatic uploads after the first one:
   Testing → Internal testing → Create new release → upload the file from step 3.
3. Let EAS upload the next ones: create a Google Cloud **service account** with access to your Play
   account (Expo's guide: <https://expo.fyi/creating-google-service-account>), download its JSON key, then:

   ```bash
   npx eas-cli@latest credentials --platform android
   ```
   → production → Google Service Account → upload the JSON key.

### 5. Connect GitHub to EAS

On [expo.dev](https://expo.dev) → your **sahayak** project → **Project settings → GitHub** → **Connect**,
install the Expo GitHub app and pick the repo **MayankJha0333/sahayak**.

From then on, pushes and tags start the workflows by themselves. No tokens to copy anywhere.

---

## Every day

### Ship a fix or a new screen (over the air)

Push to `main`. **App update → preview** publishes it to the `preview` channel (test builds).

To send it to everyone on the Play Store app: expo.dev → project → **Workflows → App update → production → Run**,
or in the terminal:

```bash
npx eas-cli@latest workflow:run .eas/workflows/app-update-production.yml
```

### Ship a new Play Store version

```bash
npm run release          # 1.0.0 → 1.0.1  (bug fixes)
npm run release:minor    # 1.0.1 → 1.1.0  (new features)
```

This bumps the version, tags it and pushes. **Release to Play Store** builds on EAS and uploads to the
**Internal testing** track as a draft. Then in Play Console: check the draft → **Review release → Start rollout**.
When testers are happy, promote the same release to **Production** from Play Console.

Follow each run on expo.dev → project → **Workflows** (and **Builds** / **Submissions**).

---

## Good to know

- **Build numbers** (`versionCode`) go up by themselves on every store build (EAS keeps count).
- **Drafts only.** Uploads land as drafts, so nothing reaches users without your click. When the app is
  live and you want uploads to go straight out, change `releaseStatus` to `"completed"` in `eas.json`.
- **Over-the-air updates only reach the same app version.** After `npm run release` the new version gets
  its own updates; older installs keep theirs until they update from the store.
- **The backend** (Cloud Functions, Firestore rules, ops website) is deployed separately:
  `npm run firebase:deploy` and `npm run admin:deploy`.
