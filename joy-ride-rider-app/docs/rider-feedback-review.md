# Rider feedback — pre-release review

Adds Rate this ride / View feedback links on a completed ride's status and
receipt screens. The new feedback route is hidden from the tab bar. The form
rechecks the authenticated Rider's ride and saved feedback; server-side ownership
and completed-ride checks remain authoritative.

## Behavior

Overall rating is required (integer 1–5). Customer care, professionalism,
driving and cleanliness are optional. Optional categories can be cleared and
omitted. The optional comment is limited to 1000 UTF-16 characters, matching the
backend DTO limit. Whitespace-only comments are omitted; text is trimmed.
No Driver/Rider IDs, review status or Admin notes are submitted in the body.

Submission requires confirmation and is immutable once saved on the server.
The same Rider/ride can have only one feedback record. Existing feedback,
including a record submitted from another device, is displayed rather than
resubmitted. Rider comments are available to Admin; Drivers receive aggregates.
The Rider response parser excludes internal review fields.

A native SecureStore draft is committed before POST. Long Unicode text is split
into small JSON-encoded chunks, with the index committed last. Incomplete writes
cannot be sent. Retry uses the exact normalized body. Corrupted storage is
retained and blocked for investigation. Native drafts are isolated by Rider ID
and ride ID, retained across sign-out, and removed after server confirmation.
Deletion of chunk data is best effort after index removal.

Web drafts use sessionStorage for the current tab; no persistent comment storage
is added to localStorage. Closing the tab may lose an unconfirmed draft. Reopen
the ride to check whether the backend saved it before submitting again. Native
uninstall/clearing app data can also remove pending drafts. No automatic
background submission or draft synchronization is implemented.

The feedback screen is keyed by Rider/ride. Changed accounts cannot send another
Rider's saved draft. Requests verify and capture the matching session before
network use. Request deadlines settle even when fetch ignores cancellation.
Raw server error bodies and API URLs are not shown. Refresh/focus/background
handling prevents late requests from updating a different Rider or ride screen.
An uncertain submission freezes the attempted values and offers refresh/retry.
A confirmed response displays a receipt, even if a subsequent refresh fails.

Native confirmation uses Alert; web confirmation uses the browser confirmation
dialog. The old receipt and ride-status operations are preserved, with only
new completed-ride links added and formatting normalized.

## Validation and remaining gates

18 offline tests exercise rating boundaries, omissions, comment trimming/limits,
private-field exclusion, completed/assigned ride eligibility, wrong ride/link,
storage failure, lost replies, restart/retry, other-device confirmation, account
isolation, double taps, invalid confirmation, Unicode chunk sizes, partial writes,
corrupted storage, session changes, timeouts/cancellation and safe HTTP errors.
TypeScript and changed-code lint must pass against the actual Rider project.

These tests use synthetic fixtures and mocked dependencies. They do not prove
native SecureStore, live backend communication, Admin review or Driver aggregates.
Before release test actual phones and browser against the staged backend:

1. Completed own ride opens feedback from both receipt and status; active,
   cancelled, unassigned and another Rider's ride are blocked by the backend.
2. Overall required; categories optional and clearable; boundary scores and
   1000-character Unicode comments work; Admin receives correct values.
3. Submit then reopen from both links: receipt appears, no edit or second POST.
4. Interrupt the reply, restart app, retry; exactly one backend record exists.
5. Background during submit and reopen; the same saved body is checked/retried.
6. Switch accounts and rides; drafts/confirmation never leak across workspaces.
7. Expire authentication, sign in again, recover the same saved submission.
8. Simulate storage failure; no POST occurs before durable draft commitment.
9. Submit from another device; refresh shows that server record without editing.
10. Admin private review and Driver aggregate summaries reflect the saved rating.
11. Native and browser confirmation, small screens, large text, keyboard
    scrolling and accessible rating controls work.

Keep Rider, Driver and Admin feature PRs and backend PR #17 in Draft until
coordinated integration, migration/release review and phone testing are complete.
This patch does not migrate the database, deploy the backend or build an APK.
