# Emergency map location contract

Additive API response field `locationSource`: `GPS`, `MANUAL_PIN`, or null. Null means legacy or unknown source. Existing clients remain compatible. New clients send optional `location.source` inside the existing optional location object.

GPS coordinates are reported by the authenticated Driver; they are not proof of physical presence. A manual pin is selected by the Driver and has no measured GPS accuracy. Its locationRecordedAt is selection time, not a device GPS capture time. Invalid optional coordinates/clocks are discarded without blocking the emergency. No coordinates are invented.

The first received incident location and origin remain unchanged on duplicate retries. Current fleet telemetry is a separate stream and must never overwrite the incident point. Vehicle registrations do not prove which vehicle was at an incident; use an incident-linked ride vehicle where available and label others as unconfirmed.

This step adds one migration and two database constraints. Existing migrations and draft foundation SQL are unchanged. CI's disposable safety fixtures apply the new migration before emergency service checks; full replay expects 15 migrations. Actual PostgreSQL checks await CI. No production migration or deployment is authorized by this preparation. The isolated test backend/database will be updated only after CI passes and destination checks are completed.

Driver selectable map and Admin incident/live map screens follow on their existing Draft branches. Until those steps are complete, there is no new phone map functionality.
