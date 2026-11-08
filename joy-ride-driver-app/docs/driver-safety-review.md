# Driver safety review — pre-release

Adds a Safety tab, Driver emergency creation/retry/history and aggregate Rider
ratings. Backend PR #17 and Admin safety PR must remain Draft until coordinated
release review. This patch does not enable the production endpoints or migrate
the database. No new dependencies or configuration values are required.

## Emergency behavior

- Explicit send confirmation, optional message up to 200 characters.
- Optional last known location is a separate foreground-permission action with
  a four-second deadline. No GPS/denied permission still permits submission.
  This is a recorded point, not continuous incident tracking.
- One local incident record per Driver ID, stored using native SecureStore
  before POST. The retry payload and UUID survive process restart. No tokens
  are stored in this record. The UUID is a timestamp/random collision-resistant
  idempotency identifier, not a security credential. Ownership is server-side.
- Requests capture the matching authenticated Driver session before sending.
  Changed accounts cannot send another account's pending record. Native records
  remain isolated across sign-out so the same driver can sign in and retry.
- No automatic background/offline sending. Reopen Safety and explicitly retry.
  Do not uninstall/clear app data while receipt is uncertain: local retry storage
  is not a backup and may be lost on uninstall/device loss.
- An unconfirmed record cannot be overwritten. Confirmed records may be replaced
  only by an explicit separate new incident. Server history remains intact.
- Network timeout/invalid reply is unknown receipt, never assumed success.
  Same UUID retries are deduplicated by the backend. Local save failure after a
  successful POST can also be retried safely using the original saved UUID.
- Server-received, Admin-acknowledged and Admin-resolved are separate states.
  Inbox count does not prove delivery/read. Zero inbox recipients is displayed.
- History shows the latest 25 records and refreshes every 15 seconds only while
  focused and foreground. Refresh failure retains a clearly labeled older view.
- Web emergency submission is disabled because this workflow requires durable
  native secure storage. Ratings/history still use authenticated endpoints.
- No device push, sound, SMS, phone call, responder dispatch or guaranteed human
  response is implemented. An on-duty Admin and a direct fallback contact are
  still operational requirements. Closed-app delivery work remains separate.
- Alerts are Driver-scoped and not automatically linked to a ride. Backend
  supports optional ride IDs, but this UI deliberately avoids stale assignments.

## Rating behavior

Only aggregate counts and averages are returned/rendered. Unrated categories
show Not yet rated. No Rider identities/comments or Admin review notes are
exposed. Malformed responses are rejected and raw error bodies are not shown.

## Validation and release gates

15 offline contracts cover durable-before-send, retries after lost replies,
restart, storage failure, unconfirmed replacement, account separation, corrupt
storage, concurrent send, response identity, status transitions, coordinates,
ratings, transport identity, timeouts/cancellation, safe HTTP errors and GPS
absence. These mocks do not prove native storage/GPS or end-to-end delivery.

Before release test on actual phones with the staged backend and Admin app:
1. Send without GPS; Admin sees one alert; Driver stays awaiting acknowledgement.
2. Acknowledge then resolve with Admin notes; Driver sees each server state.
3. Interrupt network after send, restart app, retry; only one backend alert.
4. Double tap, background during send, reopen; retry uses the same incident.
5. Deny location, disable GPS, attach valid location, and delay until stale.
6. Switch Driver accounts; no other driver's saved data appears or is sent.
7. Expire authentication and sign back in to recover the saved incident.
8. Simulate disk/storage failure; no unsaved incident should be submitted.
9. Verify zero-recipient warning and direct contact process with test fixtures.
10. Empty and populated rating summaries match server aggregates.
11. Small phone / large text / keyboard scrolling / tab accessibility.
12. New separate incident after receipt must get a new UUID and Admin audit.

Do not merge, deploy or build a production APK on the strength of offline tests.
