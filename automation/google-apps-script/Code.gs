/**
 * BRYBDPF unattended D1 -> Google Drive backup
 *
 * Secrets are never stored in this source file. Add CF_API_TOKEN as a
 * Script Property in Apps Script Project Settings before running setup().
 */
const CONFIG = Object.freeze({
  ACCOUNT_ID: '89f2622941e3fc085b7f7f72d18e17d6',
  DATABASE_ID: 'cedeb5e7-0e3b-42fc-97cd-d87dd784e944',
  DRIVE_FOLDER_ID: '1F4Cmk15UAykl2dNHTK16XjQZN7LjmEvX',
  TIMEZONE: 'Asia/Riyadh',
  TRIGGER_HOUR: 0,
  POLL_INTERVAL_MS: 15000,
  MAX_POLLS: 36,
  MAX_BACKUP_BYTES: 50 * 1024 * 1024,
});

function setup() {
  const token = PropertiesService.getScriptProperties().getProperty('CF_API_TOKEN');
  if (!token) {
    throw new Error('Missing Script Property CF_API_TOKEN. Add it in Project Settings, then run setup() again.');
  }
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  if (!folder) throw new Error('Backup Drive folder could not be opened.');

  // Idempotent: never create duplicate daily triggers for this function.
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'runBackup') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('runBackup')
    .timeBased()
    .atHour(CONFIG.TRIGGER_HOUR)
    .everyDays(1)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  Logger.log('BRYBDPF daily backup trigger installed for approximately 00:00 Asia/Riyadh.');
}

function runBackup() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('Skipped: another BRYBDPF backup is already running.');
    return;
  }
  try {
    const token = PropertiesService.getScriptProperties().getProperty('CF_API_TOKEN');
    if (!token) throw new Error('Missing Script Property CF_API_TOKEN.');

    const exportUrl = 'https://api.cloudflare.com/client/v4/accounts/' +
      encodeURIComponent(CONFIG.ACCOUNT_ID) + '/d1/database/' +
      encodeURIComponent(CONFIG.DATABASE_ID) + '/export';
    const headers = { Authorization: 'Bearer ' + token };

    const started = cfJson_(exportUrl, 'post', headers, { output_format: 'polling' });
    let result = started.result || {};
    const bookmark = result.at_bookmark;
    if (!bookmark) throw new Error('Cloudflare export did not return a bookmark.');

    let ready = null;
    for (let i = 0; i < CONFIG.MAX_POLLS; i++) {
      Utilities.sleep(CONFIG.POLL_INTERVAL_MS);
      const status = cfJson_(exportUrl, 'post', headers, { current_bookmark: bookmark });
      result = status.result || {};
      if (result.signed_url) {
        ready = result;
        break;
      }
      if (result.error) throw new Error('Cloudflare export failed: ' + String(result.error).slice(0, 300));
    }
    if (!ready || !ready.signed_url) throw new Error('Cloudflare export timed out before a signed download URL was returned.');

    // The signed URL is used only in memory and is never logged or saved.
    const download = UrlFetchApp.fetch(ready.signed_url, { muteHttpExceptions: true });
    if (download.getResponseCode() < 200 || download.getResponseCode() >= 300) {
      throw new Error('Signed SQL download failed with HTTP ' + download.getResponseCode() + '.');
    }
    const blob = download.getBlob();
    const bytes = blob.getBytes().length;
    if (!bytes || bytes > CONFIG.MAX_BACKUP_BYTES) {
      throw new Error('Backup size validation failed (' + bytes + ' bytes).');
    }

    const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd-HHmmss');
    const fileName = 'BRYBDPF-D1-backup-' + stamp + '.sql';
    const file = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID)
      .createFile(blob.setName(fileName).setContentType('application/sql'));
    file.setDescription('Private BRYBDPF D1 SQL backup. Generated automatically; do not share publicly.');

    Logger.log(JSON.stringify({ ok: true, name: file.getName(), fileId: file.getId(), bytes: bytes }));
  } catch (error) {
    // Error text is operational only; never include tokens, SQL, or signed URLs.
    const safe = String(error && error.message ? error.message : error).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 500);
    console.error(JSON.stringify({ ok: false, error: safe }));
    throw new Error(safe);
  } finally {
    lock.releaseLock();
  }
}

function testBackupNow() {
  runBackup();
}

function cfJson_(url, method, headers, payload) {
  const response = UrlFetchApp.fetch(url, {
    method: method,
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (e) {
    throw new Error('Cloudflare returned non-JSON HTTP ' + code + '.');
  }
  if (code < 200 || code >= 300 || data.success !== true) {
    const message = data.errors && data.errors[0] && data.errors[0].message;
    throw new Error('Cloudflare API HTTP ' + code + (message ? ': ' + message : '.'));
  }
  return data;
}
