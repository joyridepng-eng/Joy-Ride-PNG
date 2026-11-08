# JoyRide controlled-pilot release checklist

Updated: 5 October 2026, 18:33 Port Moresby time (UTC+10).
Status: RELEASE REVIEW IN PROGRESS. All backend and app PRs remain Draft. Production has not been changed by this work.

## Result recorded today

The user reported successful execution of the synthetic Safety Test Admin handover drill at 18:30 Port Moresby time:

- A Driver submitted a TEST ONLY emergency.
- Joseph acknowledged it from the laptop web app.
- Joyce used her separate Admin account to complete resolution.
- The laptop web app and Driver app displayed RESOLVED.
- The requested handover check included Joseph's acknowledgement and Joyce's resolution in the audit history. The report is user-provided evidence; this checklist did not query or copy incident records.

The earlier laptop checks were also confirmed by the user: separate Joseph/Joyce logins, emergency and feedback reads, Live Fleet after the referrer correction, Driver contact and vehicle details above Google Maps, the fixed incident car marker and centre controls. No passwords, keys, incident coordinates or private notes are included here.

## Reviewed versions

| Component | Feature commit | Status |
|---|---|---|
| Backend | 0198776d72fe | Feature PR #17 remains Draft; last reported CI passed |
| Admin | e3adbe1b131d | Draft; tested web changes are still outside the repository |
| Driver | 229e671cb83c | Draft; tested emergency pin/search/retry build |
| Rider | 655998390416 | Draft; tested Rider feedback build |
| Production backend master | 6540fb038125 | Unchanged production baseline |

Local laptop Google map copy: admin-emergency-map-028c51e7ceec4c8c8e36a12750f061cc. It is an isolated Safety Test export, not a production deployment or committed release artifact.

## Gate 1 — repository and CI review (pending)

- [ ] Review the committed Admin workflows, lockfile and configuration before preparing a patch.
- [ ] Bring the tested browser request fix, contact section and Google map into a narrowly scoped Admin feature patch.
- [ ] Preserve native API/signing/build configuration and both existing local simulator files.
- [ ] Include the corrected origin-only referrer policy in the local web server tooling.
- [ ] Supply a browser-restricted Maps key through hidden runtime input; never commit it or use an Android key on the web.
- [ ] Run TypeScript, strict lint, existing safety regressions, browser request/map contracts and web-export guards in CI without private credentials.
- [ ] Verify new feature commit and all app/backend CI checks; repeat the browser handover flow using that reviewed revision.
- [ ] Review the exact PR diffs. Keep all PRs Draft until the coordinated release gates are met.

## Gate 2 — migration and rollback decision (pending)

Production read-only review confirmed 13 existing migrations; restored rehearsal confirmed both pending additive migrations apply successfully, giving 15 matching checksums and preserving existing records. Pending production migrations:

1. 20260930000000_add_feedback_emergency
2. 20261002000000_add_emergency_location_source

These results do not mean the production migrations have run.

The unchanged previous backend is not a safe rollback target after emergency notification enum values exist: the production-schema Prisma client failed to read those notifications with P2023. A separate compatibility candidate with the expanded Prisma schema passed offline tests and rollback-only PostgreSQL inbox tests, including recipient ownership and preservation of alerts/audits. It still lacks emergency acknowledgement/resolution and feedback endpoints and is NOT approved for deployment.

- [ ] Choose and end-to-end test a rollback/fix-forward build that retains the expanded schema and provides operational emergency handling.
- [ ] Verify authenticated HTTP/business-rule/app behaviour, not only generated-client or inbox compatibility.
- [ ] Preserve emergency records, locations, review history and audit events. Do not blindly deploy the unchanged old backend, drop safety tables/enums or delete new records.
- [ ] Refresh the production backup and confirm its restore path for the actual release window.
- [ ] Review the exact migration/deploy order, required environment settings and post-deploy checks.
- [ ] Obtain a concrete coordinated production-release decision after these gates pass. No production release is authorized by this checklist.

## Gate 3 — Admin response procedure (pending roster)

Primary: Joseph Konga Oltipa. Backup: Joyce John. They jointly coordinate incidents and own release decisions. Separate synthetic TEST accounts have been created and verified; production account access must be reviewed independently.

The requested coverage is 24 hours/day, 7 days/week. A practical roster has not yet been agreed. Two additional assistants are planned; their identities, shifts, permissions and training remain pending. Do not describe coverage as guaranteed until on-duty staffing and backup handover are demonstrated.

- [ ] Name the on-duty Admin and available backup for each pilot shift.
- [ ] Maintain private verified operations/assistance contacts outside the repository and public checklist.
- [ ] Define acknowledgement, Driver contact, assistance dispatch, follow-up and resolution responsibilities.
- [ ] Resolve only after documenting the actual outcome. Marking an inbox item read does not acknowledge or resolve an incident.
- [ ] If safety endpoints become unavailable, contact the Driver through the private operations procedure, record reference/time/actions in the private incident log, and pause new pilot rides when coordination cannot be maintained.
- [ ] Retain the last known location's source/time/accuracy labels; a fixed incident pin and stale/latest GPS are separate evidence.
- [ ] Do not depend on unverified background push delivery. Keep the on-duty monitoring surface active and arrange independent contact/handover.

## Gate 4 — controlled production pilot (not started by this work)

- [ ] Release only reviewed production-target builds; keep Safety Test apps/accounts/databases separate.
- [ ] Verify production migration checksums, health, role/ownership controls and deployed commit.
- [ ] Verify APK package/signature and install the intended production build on named pilot devices.
- [ ] Verify rider-to-admin feedback, Driver rating privacy, emergency acknowledgement/resolution and map/location failure cases.
- [ ] Define pilot size, staffed operating hours, stop criteria and feedback review schedule before admitting real participants.

No database credentials, passwords, Maps keys, account tokens, private telephone numbers, incident contents or production records are stored in this checklist.
