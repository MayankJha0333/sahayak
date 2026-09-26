# Sahayak

A ten-minute home-services app in the Snabbit / Pronto mould. **Three apps in one Expo
project** on a **real Firebase backend** with **Razorpay** payments:

| App | Runs on | What it does |
|---|---|---|
| **Customer** | phone | Phone sign-in, book now or schedule, pay with Razorpay, live map tracking, wallet, referrals, help |
| **Partner** | phone | Phone sign-in, shifts, job offers on a map, start code → checklist → finish, earnings, referrals |
| **Admin** | web (and phone) | Email sign-in, live ops, bookings with force-assign and refund, partners, feedback, dispatch rules |

Book a job in the customer app and the same job appears as an offer in the partner app and on the
admin console, because all three read the same Firestore. Dispatch, pricing, payment
verification and refunds run in Cloud Functions — the phone never decides who gets the job or how
much is charged.

---

## 1 · Run the app

```bash
cd ~/OpenSource/sahayak
npm install
cp .env.example .env      # fill in Firebase + Razorpay values (section 2)
npm start                 # Expo Go — press i, a, or w
```

With an empty `.env` the app opens on a setup screen instead of crashing.

### Run everything locally, with no paid services

```bash
npm run firebase:emulators          # Auth + Firestore + Functions on your Mac (needs Java)
# .env: EXPO_PUBLIC_USE_EMULATORS=true, then
npx expo start --go --clear         # press i
```

In this mode the OTP is shown on screen (the emulator never sends SMS), payments use a
test sheet instead of Razorpay, and nothing touches the cloud project or the Blaze plan.

## 2 · Backend setup (one time, ~20 minutes)

### Firebase — already done for project `sahayak-b3d2a`

Set up on 22 Sep 2026:

- **Android app** `com.sahayak.app` registered → `google-services.json` in the project root
- **Web app** "Sahayak Web" registered → values in `.env`
- **Authentication**: Email/Password, Google (support email set, Web client id in `.env`) and Phone
  (test number `+91 99999 99999` / code `123456`, no SMS sent)
- **Firestore** created in `asia-south1` (Mumbai), production rules

Still to do, and it needs your keys:

1. **Upgrade to Blaze** (console → Upgrade). Free at this scale; Cloud Functions need it.
2. **SHA-1 / SHA-256** for the Android build, or Google and Phone sign-in fail on a real
   phone. After `eas init`, run `eas credentials -p android` → it prints the fingerprints of the
   keystore EAS builds with. Add both under Firebase → Project settings → Sahayak Android →
   Add fingerprint. Then download a fresh `google-services.json` from that page and replace the
   one here (it gains an Android OAuth client).
3. Deploy rules and functions: `npm run firebase:deploy` (after `firebase login`).

How the app talks to Firebase:

| Platform | SDK | Config source |
|---|---|---|
| Android / iOS build | React Native Firebase (native) | `google-services.json` / `GoogleService-Info.plist` |
| Web (admin console) | Firebase JS SDK | `EXPO_PUBLIC_FIREBASE_*` in `.env` |

`src/lib/fb/*.ts` are the web versions; `*.native.ts` beside them are what Metro picks on a phone.
The rest of the app imports from `src/lib/fb/` and never knows which one it got.

| Expo Go | Firebase JS SDK (falls back automatically) | `.env` |

`src/lib/fb/runtime.ts` decides at startup. **Expo Go** gets the JS SDK, so Firestore and
Cloud Functions work there unchanged.

### Sign-in: mobile number + OTP

Customers and partners sign in with a mobile number only (`src/app/login.tsx`): number → 6-digit
SMS OTP → name on the first visit. Staff use email on the ops console.

| Where | How the SMS gets sent |
|---|---|
| Android / iOS build | React Native Firebase, no captcha step (needs the app's SHA-1/SHA-256 in Firebase) |
| Expo Go | Firebase JS SDK; `src/components/RecaptchaGate.tsx` renders Firebase's reCAPTCHA in a WebView that runs on your `authDomain`, so the SMS goes out without a native build. Usually invisible; a puzzle appears only if Google is unsure |
| Web | Firebase JS SDK with an invisible reCAPTCHA on the page |

While testing, **+91 99999 99999** with OTP **123456** is a Firebase test number (Authentication →
Sign-in method → Phone → *Phone numbers for testing*): it signs in without sending an SMS and
without counting against the daily quota. Google sign-in remains wired up in `src/lib/fb/auth.*`
but is not shown on the sign-in screen.

### Razorpay

1. Sign up at razorpay.com and stay in **Test mode**.
2. **Settings → API Keys → Generate test key.**
3. `EXPO_PUBLIC_RAZORPAY_KEY_ID` in `.env` gets the **key id** (starts `rzp_test_`).
4. `functions/.env` gets both the key id and the **key secret** (copy `functions/.env.example`).
   The secret never leaves the server.
5. **Webhook** (backup for when the phone closes mid-payment): Razorpay → Settings → **Webhooks** → Add →
   URL `https://asia-south1-<project-id>.cloudfunctions.net/razorpayWebhook`, events **payment.captured** and
   **payment.failed**, and a secret → put the same secret in `functions/.env` as `RAZORPAY_WEBHOOK_SECRET`.
6. **RazorpayX** (paying experts): activate RazorpayX (a current account Razorpay runs for you) and add money
   to it. Put its account number in `functions/.env` as `RAZORPAYX_ACCOUNT_NUMBER`. Add a RazorpayX webhook
   to `https://asia-south1-<project-id>.cloudfunctions.net/razorpayXWebhook` with events **payout.processed**,
   **payout.reversed**, **payout.failed** and put its secret in `RAZORPAYX_WEBHOOK_SECRET`.
   On the emulator you can leave all of this empty: payouts are faked and marked paid with a `TESTUTR…` id.
   Also set `KYC_HASH_SECRET` (`openssl rand -hex 32`) — it fingerprints Aadhaar numbers so one card
   cannot sign up twice. Set it once and never change it.
7. Optional: `EXPO_PUBLIC_ROUTING_URL` in `.env` points the road maps at your own OSRM server
   (defaults to the public OpenStreetMap demo server, which is fine for testing only).

### Deploy the backend

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes,functions
```

### Make yourself an admin

1. Firebase → Authentication → Users → **Add user** with an email and password.
2. Firestore → start a collection **`admins`** → document id = that user's **UID** → any field (e.g. `role: "ops"`).
3. Open the app → **Ops console** → sign in.

On the local emulators you can skip this: the ops sign-in screen has **Use the test admin**, which creates `ops@sahayak.test` / `sahayak123` and adds it to `admins`.

### Admin website

A separate web dashboard for ops lives in `admin-web/` (Vite + React). It uses the same Firebase
project and the same `admins` list as the in-app console.

```bash
npm --prefix admin-web install     # once
npm run admin:dev                  # http://localhost:5174 (talks to the emulators)
npm run admin:deploy               # build + Firebase Hosting
```

On the emulator, the Overview page of an empty database shows **Load test data**: it fills every page with
clearly-fake sample data (experts at each stage incl. one waiting with sample ID photos, a week of bookings,
payouts, a coupon, waitlist entries and referrals) so you can try each flow.

`npm run firebase:emulators` also serves the last build at http://127.0.0.1:5002 (run `npm run admin:build`
first, then restart the emulators). Copy `admin-web/.env.example` to `admin-web/.env` for a real project.

What it does:

| Page | What you can do |
| --- | --- |
| Overview | Today's bookings, money in, experts online, queue to review |
| Experts | Review Aadhaar front/back + selfie, approve or send back with a reason, set area, suspend, see wallet |
| Bookings | Every booking with status, coupon and amount |
| Payouts | Withdrawals, failed payouts, hold / release an earning, pay now |
| Service areas | Search any colony, road or city ("Patel Nagar") and drop a **pin with a range** (drag it, 0.5–30 km), or pick State → District for a real border. Click the map to check a spot or add an area there. Each area is **Live**, **Coming soon** (with a launch date — it opens by itself that morning) or **Paused** |
| Coupons | Flat or % off, max discount, min order, first order only, per-user and total limits, dates, public or hidden |
| Waitlist | People outside every area, how far they are, mark invited, export CSV |
| Referrals | Switch referrals on/off and set both rewards |
| Customers | Look someone up and give credit |

### Load demo experts

Nobody is on shift in a fresh database. From the admin console (or the partner app's shift tab)
press **Load demo experts**. Five bot partners appear who accept jobs and ride to the door on
their own, so one person can test the whole flow.

## 3 · Test the whole thing

1. Launcher → **I need help at home** → any 10-digit number and a name → Continue.
2. **Book now** → pick a duration → **Review** → **Pay with Razorpay**.
3. Razorpay test checkout opens. Use any test card (`4111 1111 1111 1111`, any future date, any CVV) or a test UPI id (`success@razorpay`).
4. Watch the matching screen: stage 1 direct assign, stage 2 broadcast if needed.
5. A demo expert accepts, rides to your door on the map, you get a start code.
6. Tap **She has started**. The job runs ~90 seconds, then completes.
7. While she works, tap **+15 min** to extend: pay through Razorpay and watch the timer move.
8. Rate it. The expert's payout appears under Partners → Payouts in the ops console.
9. Open the **admin console** in a browser (`npm run web`) and see every step land there live.

To test the partner side yourself: sign in as a partner on a second device (or the simulator).
A new expert first goes through **sign-up** (5 steps: about you → your work → Aadhaar card number +
front and back photos → selfie → check and send). `234123412346` is a valid test Aadhaar number.
She then sees *Under review* until an admin approves her (Admin website → Experts). After approval
she can turn **on shift** on and book from the customer app. The offer arrives with a map and a 20-second
countdown.

## 4 · How money moves

**You pay for time, not per task.** **1 h ₹99** · 1.5 h ₹149 · 2 h ₹189 · 3 h ₹279 · extra time ₹2 a minute
(`PRICE_BY_MIN` in `src/lib/mock.ts` and `functions/src/catalog.ts` — keep them identical).
The tasks you tick are her checklist for that time; adding a task never adds to the bill.

```
Customer pays
  Review → createOrder (server prices the time, applies FIRST50 + rewards, creates a Razorpay order, auto-capture)
         → Razorpay checkout in a WebView (failed attempts can be retried inside the checkout)
         → verifyPayment: HMAC signature + fetch the payment from Razorpay (right order, right amount, captured)
         → booking is paid → dispatch (or the reserved expert for a scheduled slot)
  razorpayWebhook does the same if the app closed before verifying; a payment that lands after the
  booking expired is refunded automatically.

Extra time during the visit
  Track screen → +15 / +30 / +60 min → createExtensionOrder → checkout → verifyExtension
  → minutes added, session end moved (both phones update live). Ends while paying → refunded.

Expert gets paid (wallet + RazorpayX)
  Visit completed → payExpert: 62% of the booked time + 62% of extra time + tips
  → earnings/{bookingId} in her wallet, ready to withdraw 24 h later (2 min on the emulator)
    A rating of 2★ or less puts it on hold until ops releases it. Sahayak covers any coupon gap.
  → She adds a UPI id or bank account once (Earnings → Money goes to)
  → Withdraw any time from ₹100, or leave "weekly auto-payout" on (every Monday 9 AM IST)
  → withdrawFor locks the earnings and sends a RazorpayX payout (idempotent)
  → razorpayXWebhook marks it paid (with the bank UTR) or failed; a failed payout goes back to her wallet.

No expert found  → automatic refund via Razorpay
Customer cancels → full refund before assignment (and 2 min after), ₹49 fee after
```

No customer wallet and no cash on delivery: every rupee a customer pays goes through Razorpay.
Referral rewards are rupees off the next booking (`users.rewards`), released when the friend
completes a first booking. Ops sets the reward amounts (or turns referrals off) in `config/referral`.

**Coupons.** `coupons/{CODE}` — created on the admin website. The best public coupon is applied on
the Review screen by itself; customers can also type a code. The server re-checks every rule in
`createOrder`, so the app can never give itself a discount. `FIRST50` is built in.

**Service areas.** `areas/{id}` — ops picks a state, then a district or a city, on the admin website.
The area stores that place's **real border** from OpenStreetMap (encoded polylines, simplified to stay
small), so "Gurugram" means exactly Gurugram district, not a circle around it. An address outside
every live area can't be booked; the customer sees *We are not at this address yet* and can join the
**waitlist**. When areas overlap (a city inside a whole state), the smaller one wins. With no areas at all,
the app falls back to Gurugram (40 km). An area can also be a **pin with a range** (a circle) for a single
colony or road. **Coming soon** areas have an `opensAt` date: customers there see "Sahayak starts here on
<date>", can join the waitlist, and experts can already sign up; bookings open by themselves that morning.
The border maths lives in `areaGeo.ts` — one identical copy each in `functions/src`, `src/lib` and
`admin-web/src`. The district list for every state is bundled (`indiaDistricts.ts`); towns inside a
district and the borders are fetched live from OpenStreetMap's free servers (Overpass and Nominatim).

**Expert verification.** Aadhaar is checked with its checksum, only the last 4 digits and a keyed
fingerprint are stored, and the three photos (`kycFiles`) are deleted 30 days after approval.
Only the server can set `verified`; the rules stop an unverified or suspended expert from going on shift.

**Referral is a link.** Account → Refer a friend → *Share my link* sends
`https://sahayak-b3d2a.web.app/r/CODE`; opening the app from it (or `sahayak://r/CODE`) remembers
the code until sign-up finishes (`src/lib/referral.ts`). Hosting that URL with a store redirect is
the remaining step.

## 5 · Testing on your own Android phone

**Same Wi-Fi (easiest, no ngrok needed).** The emulators listen on your Wi-Fi address and the app finds your
computer by itself.

1. Phone and computer on the **same Wi-Fi**. Install **Expo Go** from the Play Store.
2. Restart the emulators (`npm run firebase:emulators`). If macOS asks to allow incoming connections for Java / node, click **Allow**.
3. `npx expo start --go --clear`, then scan the QR code with Expo Go.
4. The admin website on the phone: `npm run admin:dev:lan`, then open `http://<computer-ip>:5174`
   (find the IP with `ipconfig getifaddr en0`).

Office or public Wi-Fi often blocks phone-to-laptop traffic. Use your phone's hotspot for the laptop instead.

**Different network (ngrok).** `npx expo start --go --tunnel` sends the app through an ngrok tunnel
(Expo installs `@expo/ngrok` the first time). The tunnel only carries the app's code, not the local
emulators, so for this switch the app to the real Firebase project: set `EXPO_PUBLIC_USE_EMULATORS=false`
and deploy the backend (section 2).

## 6 · Testing on a real phone with EAS

Expo Go runs everything above. A **development build** adds the native map:

```bash
npm install -g eas-cli && eas login && eas init
npm run build:dev:ios        # or build:dev:android
npm run start:dev-client
npm run update               # push JS changes without rebuilding
```

## 7 · Layout

```
src/
  app/                    expo-router file routes
    index.tsx             launcher: pick an app or go straight to yours
    login.tsx             phone sign-in (customer / partner)
    customer/             (tabs) home · bookings · plans · account
      service/[slug]  book/[slug]  review  matching/[id]  track/[id]  rate/[id]
      plan/[id]  wallet  refer  help
    partner/              (tabs) shift · earnings (wallet) · score · you
      verify  payout  offer/[id]  job/[id]  shift/[id]  refer
    admin/                login · live ops · bookings · experts · areas · coupons · waitlist · referrals · feedback
  lib/
    firebase.ts           app, auth, firestore, functions (emulator switch)
    auth.tsx              AuthProvider — user, profile, partner doc, admin flag
    db.ts                 live Firestore hooks (onSnapshot)
    api.ts                typed calls to the Cloud Functions
    mock.ts               service catalogue, plans, zones (catalogue must match functions/src/catalog.ts)
  components/             ui, icons, maps, RazorpayCheckout, ReferralScreen, SetupScreen
  theme/                  palettes.js — one word switches the whole colour scheme
functions/src/
  index.ts                createOrder · verifyPayment · dispatch · lifecycle · refunds · admin · seedDemo
  catalog.ts              prices — the server's copy is the one that counts
  razorpay.ts             orders, capture check, refunds, webhook + HMAC verify, RazorpayX payouts
  kyc.ts                  expert sign-up, Aadhaar checks, admin review, suspend
  wallet.ts               earnings, payout method, withdraw, weekly auto-payout, payout webhook
  growth.ts               service areas, waitlist, coupons, referral settings, customer credit
  shared.ts               db, admin check, shared types
admin-web/                admin website (Vite + React + Leaflet), deployed to Firebase Hosting
firestore.rules           who may read and write what
```

## 8 · Look and feel

Always dark, in the CRED mould: near-black ground, charcoal cards with hairlines, white pill
buttons, coral `#FF6B52` as the single accent per screen, uppercase tracked labels. The light
palette still exists for the web console; `src/theme/index.tsx` pins the scheme to dark.

## 9 · What is still mocked

- **Phone OTP on web** uses an invisible reCAPTCHA; on Android it is real SMS (10/day on the free plan).
- **Plans / subscriptions** — visible, marked *coming soon*.
- **Zone statistics** on the admin console — static until there are enough real bookings.
- **Chat and calling** — UI only.
- **Scheduled jobs** (`tick`, `weeklyPayouts`) don't run on the local emulators. On the emulator,
  expired KYC photos are not cleaned up and the Monday auto-payout never fires — use **Withdraw**.
- **Payouts on the emulator** are faked (no RazorpayX account number set).

## Checks

```bash
npm run typecheck && npm run lint && npm run export:web
cd functions && npm run typecheck
```
