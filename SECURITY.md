# BRYBDPF production security

## Secrets

- `CAPTCHA_SECRET` is configured as an encrypted Cloudflare Pages production/preview secret. It must never be committed to Git.
- `telegram_bot_token` is stored only in the D1 `admin_settings` table and is never returned by the admin settings API; only a short masked value is shown.
- `telegram_webhook_secret` is stored in D1 and is required on `X-Telegram-Bot-Api-Secret-Token` for webhook requests.

## Required incident action

The previous `brybdpf` proxy Worker contained a Telegram bot token and public debug routes. The proxy has been replaced and `/tg-info` and `/tg-set` are now blocked. **Rotate the Telegram bot token in Telegram BotFather immediately**, then update it in the admin panel and use **ওয়েবহুক কনফিগার করুন** once. This invalidates the exposed credential and registers the new webhook secret.

## Deployment notes

- Production is deployed by the GitHub-to-Cloudflare-Pages integration from `main`.
- The Pages project binds D1 as `DB`.
- The fallback `src/index.js` Worker source also reads `CAPTCHA_SECRET` from the environment and contains no hardcoded CAPTCHA secret.
- Admin sessions use an HttpOnly, Secure, SameSite cookie plus server-side session rows.
