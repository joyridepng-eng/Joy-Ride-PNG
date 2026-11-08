# Rider feedback API — feature branch only

Do not merge or deploy this incomplete feature branch. The SQL draft still lives
outside prisma/migrations. These routes require that schema in a disposable test
database; the production schema has not been migrated.

## Endpoints

All requests use the existing role-specific Bearer token authentication.

| Method | Path | Role | Result |
|---|---|---|---|
| POST | /feedback/rider/me/rides/:rideId | Rider | Immutable submission; 200 on creation or identical retry |
| GET | /feedback/rider/me/rides/:rideId | Rider | `{ feedback: record }` or `{ feedback: null }` for own ride |
| GET | /feedback/driver/me/summary | Driver | Own aggregate averages and counts only |
| GET | /feedback/admin | Admin | Paginated private review queue |
| GET | /feedback/admin/:id | Admin | Detail plus up to 50 most recent review events |
| PATCH | /feedback/admin/:id/review | Admin | Atomic review status update and audit event |
| GET | /feedback/admin/drivers/:driverId/summary | Admin | Selected driver's aggregate averages and counts |

## Rider submission

`overallRating` is required, an integer from 1 to 5. The optional category scores
`customerCareRating`, `professionalismRating`, `drivingRating`, and
`cleanlinessRating` accept integers 1–5 or null. Optional `comment` accepts up to
1000 characters (or null); whitespace is trimmed and a blank comment is stored
as null. Unexpected properties, including riderId/driverId, are rejected.

The service locks the owned ride row, verifies COMPLETED with an assigned driver,
and derives all identities on the server. One submission per ride is enforced
by a database unique constraint. Concurrent identical retries return the same
record; different content returns 409. Submissions are not editable in this phase.
Missing/unowned rides return 404; ineligible owned rides return 400.

The Rider response excludes Admin review status, notes, actor IDs and driver
identity fields. There is no public review endpoint. Driver summary includes each
category's own count; absent ratings have null averages, not zero-star scores.
Low ratings do not change driver status or availability.

## Admin review

List parameters: limit (1–50, default 25), cursor, driverId and status. The response
is `{ items, nextCursor }`. Order is createdAt descending then id descending.

Review request requires expectedStatus, expectedUpdatedAt, status and note.
Copy expectedStatus and expectedUpdatedAt from the most recent Admin detail.
The note is mandatory after trimming, maximum 1000 characters.

Transitions: NEW -> REVIEWED/FOLLOW_UP/CLOSED; REVIEWED -> FOLLOW_UP/CLOSED;
FOLLOW_UP -> REVIEWED/CLOSED; CLOSED -> FOLLOW_UP. A no-op is rejected.

The row is locked and both the status and timestamp are compared. The timestamp
advances monotonically, so cycling back to the same status does not make an old
request valid again. A stale or repeated review request returns 409: refresh the
detail and check its audit history before deciding whether another action is
needed. The status update and authenticated Admin audit event commit together.
Audit insert failure rolls back both status and version. Admin notes are private.

## Rate limits and limits of this patch

Authenticated accounts receive 20 write and 120 read requests per minute per
server process. The in-memory limiter has bounded capacity; it is not shared
across replicas and resets on restart. It is basic abuse protection, not a global
quota. Add a shared limiter if deploying multiple backend processes/instances.

The patch changes no dependencies, auth guards, app packages or database schema.
It adds no push notifications and no emergency endpoints. Retention policy,
mobile screens, full app acceptance tests and migration promotion remain pending.

## Verification

- HTTP tests use overridden authentication guards and a mocked service to verify
  role wiring, DTO validation, trusted identity selection and response shape.
  They do not independently prove JWT verification; actual guards are unchanged.
- Rate-limit tests cover missing identity, account isolation and expiry.
- Safety CI builds the real backend and uses the draft-migrated PostgreSQL 18 DB
  to test real service ownership, eligibility, concurrent identical/conflicting
  submissions with observed lock waits, concurrent/stale Admin actions, atomic
  rollback, stale tokens after status cycling, private summaries and pagination.
- Existing backend and driver-assignment CI remain required.
