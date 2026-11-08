# Driver emergency incident map — Step 24

Google Maps is opened on demand in the installed Driver app. Opening or panning the map never attaches a default point. Tap a candidate and explicitly attach it. Red is attached incident, orange is candidate only, blue is an optional device GPS snapshot. Snapshots are not continuous tracking. A manual point has no measured GPS accuracy. Labels include recorded/selection time; aged GPS is marked stale.

Location remains optional. GPS denial, missing GPS, a slow map or closing the map never disables Send. GPS is acquired only by the existing optional foreground button. No background watches, automatic sending or location permission requests on map opening are introduced. New snapshots are tagged GPS, selected pins MANUAL_PIN. Legacy saved points keep unknown source. Pending saved alerts retain their original UUID, point, source and recorded time across failures/restarts/retries; replacement is permitted only after a server receipt and an explicit new incident.

The transport uses a Cache-Control request header rather than Request.cache: native fetch must not inject a cache-busting query rejected by strict backend DTO validation. Regression tests exercise the installed whatwg-fetch Request constructor.

Existing map SDK dependency, signing configuration, API configuration, EAS profiles and authentication are unchanged. Web retains an explanatory fallback. No Maps keys belong in these files. Coordinate handling is tested offline; SDK rendering, marker selection, permission denial, network loss, safe retry/restart and location delivery to Admin require verified test APKs and phone testing.

Keep all PRs Draft. The new backend migration and deployment must first be applied only to the verified isolated test database/backend after CI and destination checks. Production is unchanged. This step prepares files only; no new phone functionality exists until a reviewed APK is built and installed. Admin's incident/latest fleet GPS map follows separately.
