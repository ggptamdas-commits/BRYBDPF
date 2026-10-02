# BRYBDPF Code-Only Production Review

**Review date:** 2 October 2026  
**Live site:** https://brybdpf.pages.dev  
**Scope:** Application code, live non-destructive smoke tests, authentication, public forms, D1 access, Telegram flow, admin APIs, PWA, caching, performance, deployment configuration and maintainability.  
**Explicitly excluded:** Google Drive, Manus Schedule, local SQL exports and every other backup mechanism.

## Overall score

# **8.5 / 10**

BRYBDPF is **production-capable and usable**, not a prototype. The public site and protected admin surface are responding correctly, the main form flows are implemented, D1 queries are parameterized, the Telegram bot has admin-only controls and timeout protection, and the APK/PWA assets are deployed correctly.

It is not yet a 10/10 system because four engineering gaps can still affect reliability or long-term maintenance:

1. A failed Telegram alert is not automatically retried after the request's alert claim is recorded.
2. Applicant-donor insertion and blood-request insertion are separate writes rather than one atomic transaction.
3. The production CSP is report-only rather than enforced, and the UI still depends on external runtime CDNs.
4. There are two frontend source families (`index.html`/`admin.html` and `src/public_html.js`/`src/admin_html.js`), so future deployments can drift.

## Verification performed

The live non-destructive smoke suite passed all eight checks:

| Check | Result |
|---|---:|
| Homepage | PASS |
| Admin page | PASS |
| Public statistics | PASS |
| Database health | PASS |
| CAPTCHA | PASS |
| Web manifest | PASS |
| Service worker | PASS |
| Unauthenticated admin protection | PASS |

Additional local validation also passed:

- `node --check` for the Pages backend, standalone entry point and smoke test.
- `npm audit --omit=dev --audit-level=high`: **0 high-severity vulnerabilities reported**.
- `npx wrangler deploy --dry-run`: successful; D1 binding detected and bundle generated.
- Git working tree clean after the review.

No production donor or blood-request record was created or modified during testing.

## Scorecard

| Area | Score | Assessment |
|---|---:|---|
| Core public functionality | 9.0/10 | Form, CAPTCHA, donor registration, stats and mobile UI are present and live checks pass. |
| Admin authentication | 8.7/10 | PBKDF2, salted passwords, secure cookie, server sessions, login rate limits and logout revocation are present. |
| Telegram operations | 8.0/10 | Admin-only bot, callback flows, escaping, webhook secret, timeout and fallback text delivery are present; failure retry/observability is incomplete. |
| Data integrity | 8.0/10 | Prepared statements and unique phone constraint are good; multi-write request flow is not atomic. |
| Security headers and browser hardening | 8.0/10 | `HttpOnly`, `Secure`, `SameSite=Strict`, frame denial and no-store private responses are good; CSP is report-only and inline scripts remain. |
| Performance and Cloudflare usage | 8.7/10 | Short edge stats cache, invalidation, pagination and indexes are appropriate for the free tier. |
| PWA/APK delivery | 8.7/10 | Service worker, manifest, asset links and hosted signed APK are working; external assets remain a resilience dependency. |
| Maintainability/deployment safety | 7.5/10 | Backend delegation is improved, but frontend source duplication remains a regression risk. |
| UX/accessibility | 8.3/10 | Mobile-first form and custom dialogs are strong; field-level errors, focus management and autocomplete can improve. |

## What is already strong

### Security

- Admin APIs are blocked without authentication.
- Passwords use PBKDF2-SHA256 with 100,000 iterations and a unique salt for the current admin table.
- Login attempts are limited by IP and normalized account identity.
- Sessions use random tokens, server-side expiry and a `Secure; HttpOnly; SameSite=Strict` cookie.
- Logout removes both legacy and current session rows.
- Telegram webhook requests require `X-Telegram-Bot-Api-Secret-Token`.
- Telegram HTML output consistently escapes user-controlled fields before insertion.
- SQL queries use bound parameters rather than interpolating user values.
- Public donor search is intentionally disabled to protect personal phone/address data.
- Admin settings mask the Telegram bot token rather than returning it.

### Reliability and cost control

- Public statistics use a short edge cache and explicit invalidation after relevant mutations.
- CAPTCHA responses are not cached.
- Admin responses and admin HTML are no-store/no-cache.
- Donor and request endpoints have rate limits and bounded pagination.
- Matching queries use indexed blood-group/availability fields.
- Telegram requests have a timeout and a text fallback when HTML delivery fails.
- Service-worker navigation no longer lets `/admin` replace the public homepage cache.

### Product completeness

- The request form is a three-step wizard.
- Hemoglobin value and “unknown” state are represented in the backend and Telegram message.
- Applicant current address is captured.
- Existing donors are not duplicated because of the unique phone constraint and `INSERT OR IGNORE` behavior.
- Telegram has request claim/release, status updates, donor search, donation completion, audit records and pagination.
- The APK download, web manifest, Android asset links and signed APK hash are valid.

## Priority findings

### P1 — Telegram alert failure has no durable retry path

`sendTelegramAlert()` records `telegram_alert_claims` before sending to admins. If the Telegram API times out or every send fails, the claim remains and a later invocation will skip the alert as a duplicate. The blood request itself succeeds, but the alert can be permanently missed.

**Recommended fix:** store delivery state per request and recipient (`pending`, `sent`, `failed`, `last_error`, `attempt_count`, `next_attempt_at`), mark the claim only after a successful send or use a separate idempotency key, and retry temporary failures with bounded exponential backoff. Add a small admin health panel showing last success/failure and unsent count.

### P1 — Blood request writes are not atomic

The request endpoint inserts the applicant into `donors` first and inserts `blood_requests` second. If the second write fails, an applicant donor row can remain without its corresponding request. This is a data-consistency issue rather than a normal user-facing failure.

**Recommended fix:** use a D1 transaction/batch strategy where supported, or add compensating cleanup keyed by the normalized phone and request operation. The success response should only be returned after both writes succeed.

### P1 — Production CSP is not enforced

The code sets `Content-Security-Policy-Report-Only`, while the HTML uses inline scripts/styles and external Tailwind, Google Fonts, Font Awesome and QRious CDN assets. Report-only CSP provides visibility but does not block an injected script.

**Recommended fix:** move critical scripts/styles to controlled local assets, pin or self-host third-party assets, add nonces or hashes for the remaining inline code, then enforce CSP after a report-only observation period.

### P1 — Frontend source duplication can cause regression

Cloudflare Pages serves `index.html` and `admin.html`, while the standalone Wrangler entry point imports `src/public_html.js` and `src/admin_html.js`. The backend is delegated to the canonical Pages handler, but the two frontend families are still separate files and can diverge.

**Recommended fix:** choose one frontend source of truth and generate the alternate deployment artifact from it, or remove the unused duplicate. Add a CI check that compares route/UI output between Pages and standalone builds.

## Medium-priority improvements

1. Validate blood groups against an allow-list (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`) on the server, not only in the UI.
2. Enforce required consent values server-side instead of accepting their absence as false/implicit defaults.
3. Return stable field-level error codes so the UI can highlight the exact missing or invalid field.
4. Do not return the session bearer token in the login JSON when cookie authentication is the intended path.
5. Add `autocomplete` attributes and `aria-describedby` bindings to the main fields and CAPTCHA errors.
6. Add modal focus trapping and restore focus to the triggering button after close.
7. Disable admin action buttons while a mutation is in flight and refresh the affected row immediately.
8. Add a visible last-refreshed timestamp and a clear empty state to admin lists.
9. Replace user-facing raw `err.message` concatenation with safe operational error codes; log details server-side only.
10. Add automated tests for Telegram 429/5xx, timeout, partial-recipient failure, duplicate webhook delivery and retry recovery.
11. Add automated staging tests for a complete registration → request → Telegram delivery → admin status-update flow.
12. Review and rotate any Telegram token that was ever exposed in an old deployment, as already noted in `SECURITY.md`.

## Final assessment

**8.5/10 is an honest current rating excluding backup.** The system is safe enough for normal production use with careful admin operation, and the live health checks are green. The remaining work is not a redesign: it is focused hardening around delivery guarantees, data atomicity, enforceable browser security policy and deployment consistency.

After the four P1 items are resolved and the end-to-end authenticated Telegram workflow is tested in a non-production/staging path, a rating around **9.5–10/10** would be justified.
