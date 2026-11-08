# Driver emergency API — draft feature branch

This stage implements the backend only. Keep PR #17 in Draft. The schema change is still a SQL draft under tools/drafts/feedback-emergency, not a registered production migration. Do not deploy these endpoints before the separate migration and release review.

## Identity and access

Driver identity always comes from a verified driver access token, never the request body. The emergency-only guard permits APPROVED and SUSPENDED drivers whose authentication is active and token version matches. Disabled, revoked, pending, inactive and deleted accounts are rejected. This exception does not change ordinary driver routes or permit login/refresh for suspended accounts; a still-valid token is required. Admin routes use the existing Admin guard.

## Endpoints

Paths below are relative to any existing application-wide API prefix.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /emergencies/driver/me | Submit or retry an alert; returns HTTP 200 |
| GET | /emergencies/driver/me | Driver's own alerts, newest first |
| GET | /emergencies/driver/me/:id | Driver's own alert status |
| GET | /emergencies/admin | Admin queue; defaults to OPEN and ACKNOWLEDGED |
| GET | /emergencies/admin/:id | Private Admin detail and audit trail |
| PATCH | /emergencies/admin/:id/acknowledge | Record a human acknowledgement |
| PATCH | /emergencies/admin/:id/resolve | Record resolution with a required note |

Create body: required clientRequestId (UUID v4), optional rideId, message (500 characters), location and clientOccurredAt. A supplied ride must belong to the authenticated driver; an active ride is not required. The client must persist a UUID for one incident and reuse it on network retries. A new incident needs a new UUID.

Location shape: { latitude, longitude, accuracyMeters?, recordedAt }. Coordinates must be finite numbers within geographic bounds and recordedAt must be a parseable ISO-style timestamp not more than 60 seconds in the future. Missing or invalid GPS is discarded so it cannot block an alert. Invalid accuracy is discarded separately. Old valid locations remain labelled with age and locationIsStale (over 120 seconds). Client time is advisory; server receipt time is authoritative.

Same driver + UUID + normalized message/ride returns the original alert without creating duplicates. Reusing that UUID for a different message or ride returns 409. Retried GPS/clock values do not overwrite the original incident. A per-driver advisory transaction lock serializes creation.

Both lists accept limit (default 25, max 50), cursor and status. Admin list also accepts driverId. Drivers cannot query other drivers' alerts, private Admin notes or Admin actor identities. Admin contact and vehicle information is restricted to authenticated Admin routes.

## Acknowledgement and resolution

OPEN -> ACKNOWLEDGED -> RESOLVED. Acknowledgement accepts an optional note (1000 characters); resolution requires a nonblank note (1000 characters). Direct OPEN -> RESOLVED is rejected. No reopening or deletion route exists.

Actions take a row lock and save state, timestamp and actor audit event in one transaction. One event per action is enforced by the database. Repeating the same action by the same Admin with the same normalized note returns current detail without another event. A competing Admin or different note returns 409. Refresh the detail on conflicts. Reading or marking an inbox item read never acknowledges an emergency.

## Delivery and operational limits

Creation atomically writes the alert, CREATED event and one durable inbox item per active Admin. Inbox failure rolls back creation rather than returning false success. Each inbox item links to the emergency detail; coordinates and the driver's message are not copied into notification text.

serverReceived means the server transaction committed. humanAcknowledged only becomes true after an Admin action. adminInboxItemCount is the persisted recipient count, not proof that anyone saw a notification. With no active Admins the alert is retained, count is zero, and the Admin queue can still display it later. No device push, SMS, automatic emergency call, offline delivery, escalation timer or dispatch guarantee is implemented in this stage. Phone integration must show truthful status and a tested fallback contact route.

Emergency requests have their own per-process, per-authenticated-account quota: 20 writes and 120 reads per minute. Other feature quotas do not consume it. HTTP 429 or any network failure must not be displayed as successful delivery. These in-memory quotas are not a distributed/global limiter and reset on process restart.

## Verification and release gates

Local installer validates Prisma, generates the local client, checks full-project TypeScript, strict lint for changed TypeScript, focused emergency/notification/feedback tests and runner syntax. Native output is captured; only fixed status messages and allowlisted diagnostic codes are printed.

The existing dedicated PostgreSQL 18 safety CI job builds the backend and applies the draft to its disposable database before running all existing foundation/feedback checks and eight additional emergency service checks. The runner refuses execution unless GitHub-hosted CI and the exact disposable database settings match. It verifies concurrency, ownership, optional metadata, inbox semantics, atomic rollback, Admin actions and zero-recipient behaviour.

Before release: all three CI jobs must pass, complete the phone UI and delivery design, test real devices and disconnected operation, rehearse Admin response, and separately review the registered migration/deployment plan. Passing these backend tests alone does not make an emergency response service operational.

PostgreSQL enum note: the draft adds DRIVER_EMERGENCY_ALERT within its transaction but does not use the new value until after COMMIT. See https://www.postgresql.org/docs/18/sql-altertype.html .
