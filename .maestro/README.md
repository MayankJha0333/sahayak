# Maestro tests

Customer-app journeys, run against Expo Go on the iOS simulator with the local Firebase emulators.

1. `npm run firebase:emulators` and `npx expo start` (Metro on 8081), with the app open once in Expo Go.
2. Run everything: `npm run test:customer` (same as `maestro test .maestro/customer`)
   or one flow: `maestro test .maestro/customer/02-first-booking.yaml`

The demo experts are shortened to a 90-second job, so the full booking flow takes about 3 minutes.

Run `02-first-booking.yaml` between 8 AM and 7 PM: outside those hours instant booking is closed on purpose, so that flow cannot book "Now".
