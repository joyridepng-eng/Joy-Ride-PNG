# Feedback and emergency foundation — NOT RELEASE READY

This staged patch adds four Prisma models and three enums. It does not enable
routes, change authentication, send notifications, or apply a database migration.
The SQL remains outside prisma/migrations so deploy:start cannot apply it.
Do not merge this incomplete foundation into master.

## Required service behavior in the next patch

- Feedback: authenticated rider owns a COMPLETED ride with an assigned driver.
  Derive rider/driver IDs on the server. Reject arbitrary IDs from the body.
  Exactly one immutable submission per ride; identical retries return the saved
  result, conflicting retries return conflict. Serialize creation per ride.
  Scores are integers 1–5; optional scores may be absent. Limit comment to 1000
  characters. Admin comments and follow-up notes remain private. Driver sees
  aggregate ratings and count, not rider identities or comments.
- Emergency: server derives driver identity; optional trip must belong to that
  driver. Preserve a client request UUID locally and reuse on retry. Persist alert,
  CREATED event and durable Admin notification/outbox together in a transaction.
  A successful response means server receipt, not human acknowledgement.
  GPS is optional. Coordinates require capture time; show age to Admin. Sanitize
  optional location failure so it does not prevent an alert without location.
- Acknowledge and resolve use an atomic state comparison within a transaction,
  writing one matching event with authenticated Admin ID. Resolution requires
  prior acknowledgement and a bounded outcome note. Reads/mark-read never change
  incident status. Repeated identical actions are safe; competing responders must
  not overwrite the winning responder. Incident details are access controlled.
- Existing Driver guard requires APPROVED plus active authentication. Decide and
  test an emergency-specific policy for suspended but still authenticated drivers;
  do not weaken the existing guard globally. Revoked credentials stay revoked.
- Add bounded lists and account-scoped rate limits. Retain a path for real repeat
  emergencies; do not silently suppress distinct incidents.
- New in-app screens, durable push delivery/retry, dispatcher call fallback,
  acknowledgement UX and physical phone tests remain outstanding. Never promise
  guaranteed emergency response.

## Migration and release gates

The SQL has rating, location, status and actor CHECK constraints not represented
by the Prisma model. db push alone does not verify them. Test this SQL against a
throwaway PostgreSQL 18 baseline, verify existing data remains unchanged, and
compare the resulting schema to Prisma. Then test ownership, concurrent retries,
competing acknowledgements, unauthenticated requests and all old regressions.
Review data-retention policy before release; no automatic deletion is implemented.
Move the tested SQL into an ordered prisma/migrations directory only in the later
reviewed migration step. Confirm backup/recovery and deploy backend before apps.
