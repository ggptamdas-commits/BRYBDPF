# BRYBDPF সম্পূর্ণ কার্যকারিতা ও Production Audit Report

**Audit date:** 30 September 2026  
**Live URL tested:** `https://brybdpf.pages.dev`  
**Scope:** Public site, API safety, PWA/APK assets, cache behavior, backend route review, admin workflow review, Telegram integration code review  
**Data safety:** Production databaseে কোনো donor বা blood-request তৈরি/পরিবর্তন করা হয়নি।

## 1. Executive summary

BRYBDPF-এর live public application বর্তমানে সচল। Public homepage, statistics API, CAPTCHA API, admin route protection, donor/request API validation, PWA manifest, APK download, Android asset links এবং cache headers পরীক্ষা করা হয়েছে।

### Overall assessment

> **বর্তমান অবস্থা: Production-capable, কিন্তু security hardening ও maintenance cleanup-এর জন্য কিছু গুরুত্বপূর্ণ উন্নতি বাকি আছে।**

সবচেয়ে গুরুত্বপূর্ণ findings:

1. **Admin login endpoint-এ IP/account rate limit নেই — High priority security improvement।**
2. **Cookie-based logout server-side session row delete করে না — Medium/High security improvement।**
3. **`functions/[[path]].js` এবং `src/index.js`-এ duplicate backend আছে — ভবিষ্যৎ deployment ও self-hosting-এ ভুল version চালু হওয়ার ঝুঁকি।**
4. **`service-worker.js` বর্তমানে 0 bytes — PWA installable হলেও offline caching/asset caching কার্যকর নয়।**
5. **CSP header নেই — XSS প্রতিরোধ আরও শক্ত করা দরকার।**
6. **Tailwind, Font Awesome এবং Google Fonts external CDN থেকে load হয় — CDN unavailable হলে UI degraded হতে পারে এবং performance কমতে পারে।**

## 2. Live test results

| Area | Test | Result | Notes |
|---|---|---:|---|
| Homepage | `GET /` | Pass | HTTP 200; Bengali UI returned |
| Public stats | `GET /api/stats` | Pass | Current response: 148 total donors, 145 available, 25 requests, 8 districts, 9 completed, 5 pending |
| CAPTCHA | `GET /api/captcha` | Pass | Fresh question/token; `Cache-Control: no-store` |
| Public donor search | `GET /api/donors/search` | Pass | Correctly blocked with HTTP 403 to protect donor privacy |
| Unauthenticated admin data | `GET /api/admin/data` | Pass | Correctly blocked with HTTP 401 |
| Unauthenticated admin donors | `GET /api/admin/donors` | Pass | Correctly blocked with HTTP 401 |
| Unauthenticated admin requests | `GET /api/admin/requests` | Pass | Correctly blocked with HTTP 401 |
| Unauthenticated Telegram test | `POST /api/admin/test-telegram` | Pass | Correctly blocked with HTTP 401 |
| Invalid blood request | `POST /api/requests/create` with empty payload | Pass | Rejected with CAPTCHA validation error; no data created |
| Invalid donor registration | `POST /api/donors/register` with empty payload | Pass | Rejected with CAPTCHA validation error; no data created |
| Admin setup status | `GET /api/admin/check-setup` | Pass | Reports that setup is already complete |
| Admin page | `GET /admin` | Pass | HTTP 200; no-cache headers present |
| PWA manifest | `GET /manifest.webmanifest` | Pass | Correct `application/manifest+json` content type |
| Service worker | `GET /service-worker.js` | Warning | HTTP 200 but body is empty (0 bytes) |
| Android asset links | `GET /.well-known/assetlinks.json` | Pass | Valid JSON returned |
| APK download | `GET /downloads/BRYBDPF.apk` | Pass | Correct APK content type; 3.16 MB download; ZIP integrity valid |
| APK hash | Signed APK vs hosted APK | Pass | Hosted APK matches signed APK SHA-256 |
| PWA icons/logo | PNG assets | Pass | Correct PNG content returned |

## 3. Functional coverage review

### 3.1 Public homepage

**Status: Working**

Reviewed and/or live-checked:

- Emergency blood request form
- Donor registration modal
- CAPTCHA loading and refresh flow
- Hemoglobin value / “জানা নেই” handling
- Applicant current address requirement
- Blood group and location fields
- Local-only donor photo preview/card behavior
- Public statistics display
- App download CTA
- Donation/social/developer/organizer sections
- Custom dialogs and success/error flows

**Good points:**

- Request and donor submissions use `POST` APIs and no-store behavior.
- Public donor search is intentionally disabled to protect personal information.
- A successful donor/request mutation forces a public statistics refresh.
- Form fields use native `required`, `pattern`, `min`, and `max` validation in addition to server validation.

**Small improvements recommended:**

- Add `autocomplete` attributes to name, phone, email and address fields for faster mobile completion.
- Add `aria-describedby` for CAPTCHA and validation messages.
- Use a visible inline loading state for initial stats rather than only `...` on slower connections.
- Add a clear “data will not upload” notice beside the local donor photo field, not only in supporting text.
- Self-host the most important fonts and icons for better reliability.

### 3.2 Donor registration

**Status: Server-side validation and duplicate protection are present**

Reviewed behavior:

- Phone normalization and 11-digit validation
- Duplicate phone rejection
- CAPTCHA verification
- District/thana/current address fields
- Donor availability and active flags
- Local photo data URL is not included in the registration payload
- Public statistics invalidation after successful registration

**Recommended improvement:**

- Return a distinct error code for every major validation failure (`INVALID_PHONE`, `DUPLICATE_PHONE`, `MISSING_ADDRESS`, etc.) so the UI can highlight the exact field rather than showing a generic message.

### 3.3 Blood request

**Status: Core flow is present and guarded**

Reviewed behavior:

- 24-hour request cooldown per normalized phone
- CAPTCHA validation before database insertion
- Hemoglobin value or unknown flag requirement
- Applicant is inserted into donors using `INSERT OR IGNORE`
- Blood request status begins as `Pending`
- Matching donor query uses normalized blood group and availability
- Telegram alert is queued with `ctx.waitUntil`
- Public statistics cache is invalidated after insertion

**Recommended improvement:**

- Add an explicit transaction or compensating logic around applicant-donor insertion and blood-request insertion. Currently the donor insert happens before the request insert; if the request insert fails, an applicant donor row may remain without its corresponding request.

### 3.4 Admin authentication

**Status: Basic authentication works and unauthenticated access is blocked**

Good controls found:

- PBKDF2-SHA256 password verification
- Server-side session rows
- Secure, HttpOnly, SameSite=Strict cookie
- 7-day session expiry
- Admin APIs return HTTP 401 without authentication
- Admin settings API masks Telegram bot token

**Findings:**

- Login has no visible IP-based or account-based rate limit.
- Logout clears the cookie, but when the user authenticates through the cookie path, the server does not delete the corresponding session row. The session remains valid until expiry if the cookie is later recovered.
- Login returns the session token in JSON as well as setting the HttpOnly cookie. The current admin page does not store the JSON token, but returning it increases exposure unnecessarily.

**Recommended fixes:**

1. Apply a login limiter, for example 5 attempts per IP and per normalized email in 15 minutes.
2. On logout, extract the token from either `Authorization` or `brybdpf_session` cookie and delete both `sessions` and `admin_sessions` rows.
3. Stop returning the token in the login JSON response when cookie authentication is the intended production path.
4. Add a “log out all sessions” option for emergency account recovery.

### 3.5 Admin dashboard

**Status: Route design and UI flow are present; authenticated destructive actions were not executed on production data**

Reviewed actions:

- Request pagination and status filtering
- Request status update
- Matching donor lookup and pagination
- Donor pagination and status toggle
- Donor deletion
- Telegram settings save
- Webhook setup
- Telegram test message
- Password change
- Logout

**Recommended improvements:**

- Add a stronger confirmation dialog for donor deletion showing donor name, blood group and phone suffix.
- After status update, donor toggle, deletion or request update, refresh the affected row immediately and invalidate all related admin cache keys.
- Add a visible “last updated at” timestamp and manual refresh state.
- Disable action buttons during requests to prevent double clicks.
- Add keyboard focus trapping to admin modals and return focus to the triggering button after close.

### 3.6 Telegram bot

**Status: Code path reviewed; live message delivery was not triggered during this audit to avoid an external side effect**

Reviewed controls:

- Webhook secret validation
- Telegram update receipt deduplication
- Admin ID parsing
- Admin-only state and callback flow
- Request claim/release flow
- Donation completion flow
- Audit log writes
- Paginated donor search and matching queries
- Text-only alert delivery after the poster feature was removed

**Recommended improvements:**

- Add delivery status and last failure timestamp to the admin dashboard.
- Add a retry queue or bounded retry for temporary Telegram 5xx/network errors.
- Add webhook health check showing `getWebhookInfo` result, last error date and pending update count.
- Add automatic cleanup schedule for old bot states, receipts, claims and audit rows rather than relying mostly on request-time cleanup.

## 4. Cache and freshness audit

### Current behavior

- Normal public statistics are cached for approximately 10 seconds at the edge.
- Browser local statistics cache is short-lived (approximately 8 seconds).
- CAPTCHA responses use `no-store`.
- Admin API responses use `no-store` at the backend layer.
- Admin browser cache is memory-only with a short TTL and is not shared across users.
- HTML admin responses use `no-cache, no-store, must-revalidate`.
- Donor insert, donor status change, donor deletion, blood-request insert and request status changes invalidate the public stats cache.
- Forced stats refresh uses a `fresh` query parameter and bypasses the edge cache.

### Assessment

**Cache design is reasonable for the free Cloudflare plan and should not create harmful stale donor/request data.** The only intentionally stale item is the public counter for a few seconds, which is acceptable for a public dashboard.

### Recommendations

- Keep the current short TTL; do not cache private donor or admin responses.
- Add a cache version or deployment version in HTML so clients can diagnose stale assets quickly.
- Consider immutable, long-lived cache headers for hashed static assets once asset filenames are versioned.
- Add automated tests that perform a mutation in staging, call `/api/stats?fresh=...`, and confirm the counter changes.

## 5. PWA and APK audit

### Passed

- Manifest is available at the correct path.
- Manifest has name, icons, scope, standalone display and start URL.
- Android `assetlinks.json` is valid and matches the package identity/signing fingerprint in the repository configuration.
- APK is hosted from Cloudflare and downloads with the correct APK content type.
- Hosted APK matches the signed local APK hash.
- APK ZIP integrity is valid.

### Improvement needed

`service-worker.js` is empty. This means:

- The site can still meet basic installability requirements through the manifest.
- There is no offline fallback.
- There is no controlled asset caching.
- Users on poor connections receive no service-worker assistance.
- PWA update behavior depends mostly on normal browser/Cloudflare asset loading.

**Recommendation:** Either implement a minimal versioned service worker with an offline fallback and safe network-first API policy, or remove the service-worker registration and describe the product as an installable web app rather than an offline-capable PWA.

## 6. Architecture and maintainability findings

There are two backend/frontend source families:

- `functions/[[path]].js` with `index.html` and `admin.html`
- `src/index.js` with `src/public_html.js` and `src/admin_html.js`

They are not fully identical. The `wrangler.toml` still points `main` to `src/index.js`, while Cloudflare Pages production is serving the Pages Functions version. This is a significant maintenance risk:

- A future deployment method change can accidentally publish the older implementation.
- A self-host migration can run a different route set and UI.
- Bug fixes may be applied to one source family but not the other.
- Telegram/admin behavior can diverge between environments.

**Recommendation:** Select one canonical application architecture, archive or remove the unused duplicate, and add a CI check that fails if the two route/UI trees diverge.

## 7. Security hardening findings

| Severity | Finding | Recommendation |
|---|---|---|
| High | No login rate limit visible in the admin login route | Add IP + account limiter and exponential backoff |
| Medium | Cookie logout does not revoke server session row | Delete session rows for cookie-authenticated logout |
| Medium | No Content-Security-Policy header observed | Add a tested CSP; begin with report-only mode |
| Medium | CORS is broadly `*` on API responses | Restrict CORS to the actual site origin if cross-origin access is not required |
| Low | Login token is returned in JSON despite HttpOnly cookie flow | Remove token from JSON response |
| Low | External CDN scripts/styles/fonts are runtime dependencies | Self-host or pin integrity/versioned assets |
| Operational | Android keystore files exist locally in the workspace | Keep them out of Git and public backups; rotate if ever exposed |

The local Android signing files are ignored by Git in the current repository, which is good. They must still be treated as secrets and never uploaded to a public repository or shared in a support message.

## 8. UX polish recommendations without changing functionality

1. Add a compact “last refreshed” label to public statistics and admin lists.
2. Use consistent Bengali terminology for `Pending`, `Matched`, `Fulfilled`, and `Closed` in both filters and badges.
3. Add field-level error text below the exact invalid field on mobile.
4. Add `autocomplete="tel"`, `autocomplete="name"`, `autocomplete="email"`, and address autocomplete hints.
5. Add a short success summary after a request: request ID, submitted time, and contact number masked.
6. Improve loading skeletons for admin donor/request tables instead of blank table areas.
7. Add a “copy request summary” action in admin beside WhatsApp sharing.
8. Add a clear empty state for no matching donors with an alternate next step.
9. Reduce external JavaScript dependencies and defer nonessential scripts.
10. Add keyboard and screen-reader checks to custom dialog components.

## 9. Recommended priority plan

### Priority 1 — Security

- Add login rate limiting.
- Revoke cookie sessions on logout.
- Add CSP in report-only mode, then enforce after testing.
- Review and restrict CORS.
- Confirm no Android signing files or secrets exist in any public Git history.

### Priority 2 — Reliability

- Choose one canonical backend/source tree.
- Decide whether to implement a real service worker or remove the empty registration.
- Add Telegram delivery health/retry visibility.
- Add mutation/cache integration tests in staging.

### Priority 3 — UX

- Improve field-level validation and loading states.
- Add refresh timestamps and safer delete confirmation.
- Self-host/pin external UI dependencies.

## 10. Final conclusion

The live application is functioning and the main public security boundaries are working. The most important immediate concern is not a broken donor/request flow; it is **operational/security hardening** around admin login/logout and source duplication. The PWA is installable and the APK delivery is healthy, but it is not currently an offline-capable PWA because the service worker is empty.

No production records were changed during this audit.
