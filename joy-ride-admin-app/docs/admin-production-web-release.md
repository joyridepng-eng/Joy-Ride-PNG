# Hosted Admin production web — release hold

This patch adds an explicit production web mode. It does not deploy, change API CORS, migrate a database, or approve release. Keep every PR Draft.

## Render Static Site settings after CI and release approval

Repository: joltipa2017-eng/joy-ride-admin-app. Deploy only the approved release revision; do not deploy the current master or unreviewed feature pushes. Disable auto-deploy and pull-request previews. Root directory: blank. Publish directory: dist-production.

Build command: npm ci --ignore-scripts --include=dev --no-audit --no-fund && node tools/build-production-web.cjs

Build environment:
- SKIP_INSTALL_DEPS=true (Render dependency installation is handled by the command)
- NODE_VERSION=22
- EXPO_NO_DOTENV=1
- EXPO_NO_TELEMETRY=1
- EXPO_PUBLIC_JOYRIDE_WEB_PRODUCTION=1
- EXPO_PUBLIC_API_BASE_URL=https://explore-png-api.onrender.com
- EXPO_PUBLIC_JOYRIDE_WEB_ORIGIN: actual approved HTTPS origin, without trailing slash, port or path; do not guess the assigned domain
- JOYRIDE_PRODUCTION_WEB_MAPS_KEY: separate production browser Maps key, entered privately in Render; website restrictions must permit only the exact approved site and API restrictions must permit Maps JavaScript API

Omit EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST, EXPO_PUBLIC_JOYRIDE_VARIANT, native Android Maps variables, database URLs, JWT secrets and all account passwords. No native signing credentials belong in this service.

The browser key is deliberately published in /__joyride/maps-config because Google Maps JavaScript runs in the browser. It is a public client credential, protected by Google website/API restrictions, quotas and billing alerts. Never use an unrestricted, native Android or Safety Test browser key. No password, token or database credential is needed for the export.

## Hosting and backend gates

Before allowing production login: establish the assigned HTTPS origin; restrict the browser key; add the exact origin to the backend's reviewed CORS allowlist; verify unauthenticated preflights for login, authenticated reads and incident writes. Do not use wildcard CORS. These checks and changes are still pending.

Render redirect/rewrite: /* -> /index.html, action Rewrite. Existing files are served before the fallback. Verify direct links and refresh on login, inbox, emergency and feedback routes.

Set response headers: /* Referrer-Policy=strict-origin-when-cross-origin; /* X-Content-Type-Options=nosniff; /* X-Frame-Options=DENY; /* Cache-Control=no-store. Retain full origin referrers for Maps and Live Fleet tiles. A tested CSP may be added separately after identifying all current map/image/network dependencies; do not invent a policy that disables emergency maps.

Verify /__joyride/maps-config serves JSON and uses no-store, wrong-origin map loading is refused, no Android key is published, and missing/invalid Maps configuration shows the existing error/incident information. API authorization remains the security boundary for all account and incident data.

## Coordinated release checks still pending

Fresh backup; approved backend revision and two production migrations; emergency/feedback endpoints; recovery retaining expanded schema and safety endpoints; separate Joseph/Joyce production logins and correct permissions; hosted-web authenticated checks; verified pilot APKs and signing continuity; named on-duty/backup cover 05:30–22:00 Port Moresby time; assistance and outage handoff. The website must not suggest monitored emergency coverage outside staffed hours.

Browser exports, Maps restrictions, CORS, hosting and phone/live tests require separate verification. Key-free CI is not a deployed website test.
