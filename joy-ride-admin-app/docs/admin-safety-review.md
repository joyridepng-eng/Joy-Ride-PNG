# Admin feedback and emergency screens — Step 5

This is the Admin-app portion of the feature. It does not enable the backend, apply SQL, build an APK or implement device push. Keep backend PR #17 in Draft and review the Admin feature branch separately.

## Entry points and behaviour

Home has Driver Emergencies and Rider Feedback buttons. These are hidden tab routes so the existing four main tabs remain usable on small screens. The Inbox also links to the emergency queue and individual emergency records. Old notification payloads remain supported; the new DRIVER_EMERGENCY_ALERT type is validated and accepted. Mark-read actions never acknowledge or resolve an alert. Opening an emergency does not depend on a mark-read request succeeding.

The emergency queue defaults to OPEN, with separate ACKNOWLEDGED and RESOLVED filters and pages of 25 records. The first page and emergency detail refresh every 15 seconds while focused and active. Older pages and feedback views refresh manually or on returning to the foreground. Successful checks show a timestamp. Failed checks display an error; cached information is labelled as last known and is not presented as an empty queue.

Emergency detail shows the driver contact, incident ride vehicle, current vehicle registrations (clearly distinguished), optional message, last reported coordinates, accuracy and time. The location is a snapshot, not live tracking. Coordinates can be opened in Maps by an explicit tap. A missing location does not hide the incident.

Acknowledgement requires a confirmation. Resolution requires a nonblank note and confirmation. State and audit information are returned by the server; no optimistic acknowledgement is shown. No resolution action exists until the server reports ACKNOWLEDGED. After timeouts or conflicts, refresh is required before another action. Reading a notification is separate from taking responsibility to respond.

Feedback review displays overall and optional category ratings, the Rider's comment, the ride reference, review status and up to 50 latest audit events. Internal notes remain private to Admin routes. Permitted status transitions match the backend. The request includes expectedStatus and expectedUpdatedAt to prevent overwriting another review. Refreshing a changed record resets the edit form. No Rider identity or comment is sent to Driver summary endpoints.

## Authentication, cancellation and errors

All requests use the existing adminFetch helper and authenticated Admin identity. New workspaces are keyed by signed-in Admin ID so account changes do not reuse record state. Requests have a 15-second deadline, abort on screen changes and ignore late results. A write timeout means its outcome is unknown, not that it failed to save. The backend's idempotency and conflict checks remain authoritative.

Errors use fixed messages; raw response bodies and exception details are not displayed. An unavailable endpoint gives an explicit unavailable/not-enabled message, not an empty queue. This permits local code validation while the backend feature remains undeployed.

No new dependencies, environment variables, app configuration, Expo project identifiers or authentication storage formats are introduced. Existing untracked files are preserved by the installer. Original contexts and authentication helpers are only checked against reviewed hashes, not rewritten.

## What is NOT completed here

Closed-app push, audible emergency alerts, Driver submission screens, offline incident persistence, Rider feedback submission screens, delivery escalation and staff response protocols still require separate implementation/review. This patch must not be used as a guarantee of emergency dispatch. Production APKs and the database remain unchanged.

## Verification

The offline runner uses synthetic responses and executes the actual TypeScript service modules in an isolated VM with a mocked authenticated fetcher. It tests old/new inbox compatibility, reference validation, optional location, malformed response rejection, correct action routes, stale review tokens, safe errors, timeouts and cancellation. It makes no network/database connections and does not read environment files. Run from the Admin project with:

    node tools/verify-admin-safety.cjs

The installer also runs full-project TypeScript and strict lint for every changed/new code file. The assistant checked the screens against installed Expo SDK 54 / React Native types and Expo ESLint rules using minimal harness stubs for unrelated project components; full app integration is checked on the user's laptop. The assistant has not claimed a phone test or complete Expo build.

Before release, use a nonproduction backend with the reviewed migration applied. Test old and new inbox messages; empty, unavailable and offline queues; a no-GPS incident; stale coordinates; two Admins competing; request loss after server commit; feedback review conflicts; background/resume; logout/login as a different Admin; and Android/web layouts. Do not test emergency workflows by modifying production records.

Reference: focus cleanup is documented at https://docs.expo.dev/versions/v54.0.0/sdk/router/ and foreground/background state at https://reactnative.dev/docs/appstate . These underpin the foreground-only refresh design.
