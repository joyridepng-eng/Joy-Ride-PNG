# Driver incident address search

A typed landmark/address is resolved using the existing expo-location native geocoder. Explicit Search avoids per-keystroke lookups. PNG context is appended if absent. Search coverage is device/provider dependent; no Google Places autocomplete, exact-position guarantee or continuous GPS is implied.

Android requires foreground location permission for geocoding. Denial, network failure, empty results and a ten-second timeout leave manual pin selection and emergency submission available. No new dependencies, keys, permission declarations, backend fields, database migrations or Admin changes are introduced.

At most one native lookup is in flight. Timeout/cancellation discard late results while retaining the busy guard until the underlying native operation finishes. Editing the query, choosing a pin, sending, leaving the screen or backgrounding cancels pending UI results. Results are bounded, deduplicated and checked for finite valid coordinates. They never supply GPS accuracy.

Choosing a suggested point only creates an orange candidate. The Driver adjusts and explicitly attaches it as MANUAL_PIN. Existing saved retries remain immutable. The typed query is not added to the server payload or persisted as incident metadata; Drivers can put landmark details in the existing emergency message. A saved pin remains separate from current GPS.

Tests: existing 22 safety/retry/native-fetch checks plus six search-policy checks. Real phone tests still required: local place coverage, permission denial, timeout/offline, late results after manual selection, confirmed pin delivery to Admin and retry preservation. No network or database was used for offline contract tests.
