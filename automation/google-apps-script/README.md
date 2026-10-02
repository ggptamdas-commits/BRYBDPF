# BRYBDPF Google Apps Script Backup

This package runs a daily Cloudflare D1 SQL export and stores the result in the existing private Google Drive folder **BRYBDPF Database Backups**.

## Security model

- No Cloudflare token is stored in the source file.
- `CF_API_TOKEN` is stored only as an Apps Script **Script Property**.
- The token is used only for the Cloudflare D1 export endpoint.
- Signed download URLs are kept in memory and are never logged or saved.
- Drive files are created inside the existing private folder; the script never makes files public and never deletes files.
- `LockService` prevents overlapping exports.
- The script validates HTTP status and backup size before creating the Drive file.

## One-time setup

1. Open [Google Apps Script](https://script.google.com/) while signed in to the Google account that owns the backup folder.
2. Create a new standalone project, open **Code.gs**, and paste the contents of `Code.gs` from this folder.
3. In Cloudflare, create a **custom API token** limited to this account with **Account → D1 → Edit** permission, which is the practical permission required by the D1 export API. Do not send that token in chat.
4. In Apps Script open **Project Settings → Script properties → Add script property**:
   - Property: `CF_API_TOKEN`
   - Value: the Cloudflare token
5. Save the project.
6. Run `setup()` once. Google will show the official authorization screen. Review the requested permissions and press **Allow**.
7. Run `testBackupNow()` once and confirm a new dated `.sql` file appears in the private Drive folder.

After that, the time-driven trigger runs approximately at **00:00 Asia/Riyadh every day**. Apps Script time triggers are approximate within the selected hour, which is normal Google behavior.

## Required Cloudflare values already embedded

- Account ID: `89f2622941e3fc085b7f7f72d18e17d6`
- Database ID: `cedeb5e7-0e3b-42fc-97cd-d87dd784e944`
- Drive folder ID: `1F4Cmk15UAykl2dNHTK16XjQZN7LjmEvX`

## Verification checklist

- `setup()` completes without error.
- Apps Script **Triggers** shows one daily `runBackup` trigger.
- `testBackupNow()` completes successfully.
- Drive contains a new file named `BRYBDPF-D1-backup-YYYYMMDD-HHmmss.sql`.
- The file is inside the private backup folder and is not shared publicly.
- Apps Script **Executions** shows the run as completed.

## Important operational note

Cloudflare D1 export can temporarily make the database unavailable for queries while the export runs. The schedule is placed around midnight Riyadh time to reduce user impact. Keep the existing Manus Schedule active until this Apps Script test succeeds; then disable the duplicate Manus schedule to avoid two exports per day.
