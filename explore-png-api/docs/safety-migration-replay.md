# Feedback and emergency migration rehearsal

The four new files register the already tested SQL draft as migration
`20260930000000_add_feedback_emergency` and add a separate disposable CI job.
The registered SQL is byte-for-byte identical to the draft; its historical
DRAFT header remains to preserve the tested contents. Registration is not
production release approval.

CI runs `prisma migrate deploy` against an empty PostgreSQL 18 service. It
requires exactly fourteen migration directories, verifies successful history
entries and checksums, repeats deployment to check idempotency, inspects
constraints and indexes, and reads ten models through the generated client.
Existing constraint and service/concurrency tests remain separate CI jobs.
This job does not establish full schema drift parity or phone behavior.

Do not run the CI runner against Render. It refuses local runs and any URL
other than its hardcoded disposable localhost CI destination. The installer
runs syntax and schema checks only, using a synthetic local URL during schema
validation. It does not apply migrations or contact a database.

Keep backend PR #17 and all three app PRs in Draft. Push these four reviewed
files after the installer passes, then wait for every backend CI check to pass.
Only then prepare the isolated Render test database and backend, using fresh
synthetic test accounts. Production migration/deployment and phone integration
remain pending. No reset, db push, baseline marking or production restore is
part of this step.
