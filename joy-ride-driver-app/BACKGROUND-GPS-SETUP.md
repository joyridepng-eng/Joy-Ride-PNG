# JoyRide Driver Android background GPS test build

This is an internal test APK for Expo SDK 54, not a published Play Store release.
The Admin app stays unchanged. Expo Go keeps the previous foreground GPS hook.

## 1. Install and check

Run Prepare-JoyRide-Background-GPS.ps1. It backs up source/configuration plus package files, installs Expo SDK 54-compatible task and build-properties dependencies, and runs `npx tsc --noEmit`.
If installation or TypeScript fails, stop before building and report the error. Dependency changes are not automatically rolled back after npm failure. Backups are under Documents/JoyRide-backups/background-gps-*.

Run `npx expo-doctor` in the Driver project and resolve native dependency compatibility errors before building. Native packages previously unused by Expo Go are compiled into the dedicated APK.

## 2. Configure the build environment privately

In the existing Expo project dashboard, configure these variables for the PREVIEW environment:
- EXPO_PUBLIC_API_BASE_URL: the real backend base URL, preserving any API prefix.
- EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: your Android Maps SDK key. Configure it for the Driver Android package and the APK's signing certificate.

Use EAS Sensitive visibility for the Maps key so build logs mask the value. These client values are bundled in the app; sensitive visibility does not make a client-side Maps key a server secret. Never add backend signing secrets or database credentials to the app.
Do not paste either variable's value into chat. Existing local environment files are not edited by the installer.

A private Wi-Fi backend address works only when the phone can reach that network. A standalone APK does not make a local backend reachable over mobile data. Use a reachable HTTPS backend for tests away from that network. The test build enables Android cleartext traffic only when its configured API URL uses HTTP.

## 3. Build the internal APK

From the Driver project:

```powershell
npx eas-cli login
npx eas-cli build --platform android --profile background-gps
```

Use the existing Expo project/account and existing Android signing credentials if already configured. The installer adds a separate background-gps profile/channel and changes app version to 1.2.0, leaving the package identity unchanged. It does not publish an OTA update.
Download and install the APK from the completed EAS build. Open Joy Ride Driver directly. No Metro or Expo Go is needed for this preview APK; the backend must still run and be reachable.

## 4. Phone test

1. Sign in. Open Availability and tap Go Online.
2. Grant precise foreground location and, when explained by the app, Android background location (Allow all the time).
3. Confirm the persistent JoyRide location notification and a recent successful GPS upload. Use Enable GPS to retry permissions if needed.
4. Assign a ride, walk with the phone, and verify Admin coordinates update.
5. Switch to another app for two minutes; repeat with the phone locked for two minutes. Verify fresh Admin location timestamps during both tests.
6. Reopen Assigned Ride. Complete the trip. Check that the receipt and map still work.
7. Tap Go Offline. Confirm the notification disappears and new GPS uploads stop. One already-sent request may finish.
8. Repeat using sign-out. Sign in as another test driver and confirm no earlier driver's positions are uploaded under the new account.

Stop GPS stops location sharing only; Go Offline also updates server availability. Mark Unavailable keeps an online driver sharing location.
While online, completion removes the ride association from subsequent uploads; fleet tracking continues until stopped or offline.

## Limits of this first background version

- Android only. iOS and Expo Go retain foreground tracking.
- OS battery management and force-stop can interrupt tracking. This is not a promise of continuous operation after force-stop, reboot, or the user swiping away the app.
- Internet access and an unexpired Driver session are required. A failed upload is retried with the next fresh GPS sample; this version does not persist an offline trip-history queue.
- GPS intervals are requests to Android, not guaranteed timing. Uploads target roughly five seconds and two metres of movement.
- Native build, map-key configuration, and locked-screen operation must be verified on the actual phone. Local mocked tests do not replace these checks.

References:
https://docs.expo.dev/versions/v54.0.0/sdk/location/
https://docs.expo.dev/versions/v54.0.0/sdk/task-manager/
https://docs.expo.dev/eas/environment-variables/manage/
