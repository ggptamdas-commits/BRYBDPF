import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasmModule from '@resvg/resvg-wasm/index_bg.wasm';
import { NOTO_BENGALI_FONT } from '../assets/noto-bengali-font.js';
import { NOTO_LATIN_FONT } from '../assets/noto-latin-font.js';
import * as hb from '../assets/harfbuzz-shim.js';

const posterHbBlob = new hb.Blob(NOTO_BENGALI_FONT);
const posterHbFace = new hb.Face(posterHbBlob);
const posterHbFont = new hb.Font(posterHbFace);
const posterHbUpem = posterHbFace.upem || 1000;
const posterLatinBlob = new hb.Blob(NOTO_LATIN_FONT);
const posterLatinFace = new hb.Face(posterLatinBlob);
const posterLatinFont = new hb.Font(posterLatinFace);
const posterLatinUpem = posterLatinFace.upem || 1000;

let posterRendererReady = null;
async function renderBloodRequestPosterPng(svg) {
  if (!posterRendererReady) posterRendererReady = initWasm(wasmModule);
  await posterRendererReady;
  const renderer = new Resvg(svg, {
    background: '#ffffff',
    // All visible poster text is already converted to shaped glyph paths below.
    textRendering: 0,
    font: {
      fontBuffers: [NOTO_BENGALI_FONT, NOTO_LATIN_FONT],
      defaultFontFamily: 'Noto Sans Bengali',
      sansSerifFamily: 'Noto Sans Bengali'
    }
  });
  const image = renderer.render();
  const png = image.asPng();
  image.free();
  renderer.free();
  return png;
}

function publicStatsCacheKey(origin) {
  return new Request(`${origin}/api/stats?edge-cache=v2`);
}

function invalidatePublicStatsCache(origin, ctx) {
  try {
    if (typeof caches !== "undefined" && caches.default) {
      ctx.waitUntil(caches.default.delete(publicStatsCacheKey(origin)));
    }
  } catch (_) {}
}

async function readPublicStatsCache(origin) {
  try {
    if (typeof caches !== "undefined" && caches.default) {
      return await caches.default.match(publicStatsCacheKey(origin));
    }
  } catch (_) {}
  return null;
}

function writePublicStatsCache(origin, ctx, response) {
  try {
    if (typeof caches !== "undefined" && caches.default) {
      ctx.waitUntil(caches.default.put(publicStatsCacheKey(origin), response.clone()));
    }
  } catch (_) {}
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") ||
         request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
         "127.0.0.1";
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derivedKey))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRandomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(message));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const DEFAULT_CAPTCHA_SECRET = "";

async function generateCaptcha(env) {
  const num1 = Math.floor(Math.random() * 8) + 2;
  const num2 = Math.floor(Math.random() * 8) + 1;
  const answer = (num1 + num2).toString();
  const timestamp = Date.now().toString();
  const payload = `${answer}:${timestamp}`;
  const secret = env.CAPTCHA_SECRET || DEFAULT_CAPTCHA_SECRET;
  if (!secret) throw new Error('CAPTCHA_SECRET is not configured');
  const sig = await sha256Hex(`${payload}:${secret}`);
  const token = btoa(`${payload}:${sig}`);
  return {
    question: `${num1} + ${num2} = ?`,
    token
  };
}

function normalizeDigits(str) {
  if (!str) return "";
  const bn = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
  let res = String(str);
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(bn[i], String(i));
  }
  return res.trim();
}

function normalizePhone(phone) {
  if (!phone) return "";
  let cleaned = normalizeDigits(phone).replace(/[^0-9]/g, "");
  if (cleaned.startsWith("8801") && cleaned.length === 13) {
    cleaned = cleaned.slice(2);
  }
  return cleaned;
}

function isValidPhone(phone) {
  const norm = normalizePhone(phone);
  return /^01[3-9]\d{8}$/.test(norm);
}

async function verifyCaptcha(env, token, userAnswer) {
  if (!token || !userAnswer) return false;
  try {
    const normAns = normalizeDigits(userAnswer).trim();
    if (!/^\d+$/.test(normAns)) return false;
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length === 2) {
      const [num1Str, num2Str] = parts[0].split("+");
      if (num1Str && num2Str) {
        return parseInt(normAns, 10) === (parseInt(num1Str, 10) + parseInt(num2Str, 10));
      }
    }
    if (parts.length === 3) {
      const [correctAnswer, timestamp, sig] = parts;
      let issuedAt = Number(timestamp);
      // Accept both millisecond and second timestamps for compatibility with
      // tokens created by older deployments, while allowing enough time for a
      // user to complete a long blood-request form.
      if (issuedAt > 0 && issuedAt < 10_000_000_000) issuedAt *= 1000;
      const timeDiff = Date.now() - issuedAt;
      if (!Number.isFinite(timeDiff) || timeDiff < -60_000 || timeDiff > 30 * 60 * 1000) return false;
      const secret = env.CAPTCHA_SECRET || DEFAULT_CAPTCHA_SECRET;
      if (!secret) return false;
      const expectedSig = await sha256Hex(`${correctAnswer}:${timestamp}:${secret}`);
      if (sig !== expectedSig) return false;
      return normAns === correctAnswer.trim();
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function sendTelegramAlert(env, requestData, matchedDonors) {
  try {
    let token = "";
    let adminUidsStr = "";

    const { results: settings } = await env.DB.prepare(
      "SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids')"
    ).all();

    for (const s of settings) {
      if (s.key === "telegram_bot_token") token = s.value;
      if (s.key === "telegram_admin_uids") adminUidsStr = s.value;
    }

    if (!token && env.TELEGRAM_BOT_TOKEN) token = env.TELEGRAM_BOT_TOKEN;
    if (!adminUidsStr && env.TELEGRAM_ADMIN_IDS) adminUidsStr = env.TELEGRAM_ADMIN_IDS;

    if (!token || !adminUidsStr) return;

    // Telegram may retry webhook/workerd executions. Claim each request once so one
    // blood request cannot fan out duplicate alerts to every admin.
    if (requestData?.id) {
      await ensureTelegramTables(env);
      const claim = await env.DB.prepare("INSERT OR IGNORE INTO telegram_alert_claims (request_id) VALUES (?)").bind(requestData.id).run();
      if (!(claim?.meta?.changes > 0)) return;
    }

    const uids = parseTelegramAdminUids(adminUidsStr);
    if (uids.length === 0) return;

    const reqCleanPhone = (requestData.contact_phone || "").replace(/[^0-9]/g, "");
    const reqWaNumber = reqCleanPhone.startsWith("88") ? reqCleanPhone : (reqCleanPhone.startsWith("0") ? "88" + reqCleanPhone : reqCleanPhone);
    const waPatientUrl = `https://wa.me/${reqWaNumber}`;

    const safePatient = escapeHtml(requestData.patient_name);
    const safeBg = escapeHtml(requestData.blood_group);
    const safeHosp = escapeHtml(requestData.hospital_name);
    const safeDist = escapeHtml(requestData.district);
    const safeThana = escapeHtml(requestData.thana);
    const safeLoc = escapeHtml(requestData.location);
    const safeNeed = escapeHtml(requestData.needed_by);
    const safeHemoglobin = requestData.hemoglobin_unknown ? "জানা নেই" : escapeHtml(requestData.hemoglobin || "তথ্য নেই");
    const safeReq = escapeHtml(requestData.requester_name || "স্বজন");
    const safeReqAddress = escapeHtml(requestData.requester_current_address);
    const safeNote = escapeHtml(requestData.note);
    const units = requestData.units || 1;

    let donorListText = "";
    if (matchedDonors && matchedDonors.length > 0) {
      donorListText = matchedDonors.slice(0, 10).map((d, i) => {
        const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
        const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
        const waUrl = `https://wa.me/${waNumber}`;
        const tierBadge = d.proximity_tier === 1 ? "🎯 <b>[একই থানা]</b>" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [নিকটবর্তী]");
        const loc = d.current_address ? escapeHtml(d.current_address) : ((d.area ? escapeHtml(d.area) + ", " : "") + escapeHtml(d.district || "রংপুর"));

        return `${i + 1}. <b>${escapeHtml(d.name)}</b> (${loc}) ${tierBadge}\n` +
          `   📞 <code>${d.phone}</code> ➔ <a href="${waUrl}">💬 <b>WhatsApp</b></a>`;
      }).join("\n\n");
    } else {
      donorListText = "⚠️ এই মুহূর্তে কোনো প্রস্তুত ডোনার পাওয়া যায়নি।";
    }

    const messageHtml = `🚨 <b>জরুরি রক্তের আবেদন — BRYBDPF</b> 🚨\n` +
      `────────────────────────────\n` +
      `🩸 <b>প্রয়োজনীয় রক্ত:</b> <code>${safeBg}</code> (${units} ব্যাগ)\n` +
      `👤 <b>রোগীর নাম:</b> ${safePatient}\n` +
      `🏥 <b>হাসপাতাল:</b> ${safeHosp}, ${safeDist}\n` +
      (safeThana ? `📍 <b>থানা/উপজেলা:</b> ${safeThana}\n` : "") +
      `📍 <b>ঠিকানা/ওয়ার্ড:</b> ${safeLoc}\n` +
      `🧪 <b>হিমোগ্লোবিন:</b> ${safeHemoglobin}\n` +
      `⏰ <b>প্রয়োজনের সময়:</b> ${safeNeed}\n` +
      `────────────────────────────\n` +
      `🤝 <b>আবেদনকারী:</b> ${safeReq} (📞 <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>)\n` +
      (safeReqAddress ? `🏠 <b>আবেদনকারীর বর্তমান ঠিকানা:</b> ${safeReqAddress}\n` : "") +
      (safeNote ? `📝 <b>নোট:</b> ${safeNote}\n` : "") +
      `────────────────────────────\n` +
      `📲 <b>আবেদনকারীর সাথে সরাসরি চ্যাট:</b> <a href="${waPatientUrl}"><b>WhatsApp ওপেন করুন</b></a>\n` +
      `────────────────────────────\n` +
      `📋 <b>উপযুক্ত প্রস্তুত ডোনারগণ (${safeBg}):</b>\n\n` +
      donorListText;

    const inlineButtons = [
      [{ text: "💬 আবেদনকারীকে WhatsApp বার্তা", url: waPatientUrl }]
    ];

    let posterPng = null;
    try {
      // 1200x1500 (4:5) is a Facebook-ready portrait post size.
      posterPng = await renderBloodRequestPosterPng(buildBloodRequestPosterSvg(requestData));
    } catch (posterRenderError) {
      console.error('Blood request poster PNG render failed:', posterRenderError);
    }

    for (const uid of uids) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: uid,
            text: messageHtml,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: inlineButtons }
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error(`Telegram send to ${uid} failed:`, errData);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: uid,
              text: messageHtml.replace(/<[^>]*>/g, ""),
              disable_web_page_preview: true
            })
          });
        }

        // Keep the original text alert, then add a clean poster containing only
        // patient details plus the applicant name and phone number.
        if (posterPng) {
          const posterRes = await sendBloodRequestPoster(token, uid, requestData, posterPng);
          if (!posterRes.ok) {
            const posterError = await posterRes.json().catch(() => ({}));
            console.error(`Telegram poster send to ${uid} failed:`, posterError);
          }
        }
      } catch (sendErr) {
        console.error(`Error sending to uid ${uid}:`, sendErr);
      }
    }
  } catch (err) {
    console.error("Error sending Telegram alert:", err);
  }
}

async function getAuthenticatedAdmin(request, env) {
  try {
    const authHeader = request.headers.get("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/brybdpf_session=([a-f0-9\-]+)/i);
      if (match) token = match[1];
    }

    if (!token) return null;

    try {
      const s = await env.DB.prepare(
        "SELECT admin_email, expires_at FROM sessions WHERE token = ? AND expires_at > datetime('now')"
      ).bind(token).first();
      if (s) {
        const admin = await env.DB.prepare(
          "SELECT id, email, role FROM admins WHERE LOWER(email) = LOWER(?)"
        ).bind(s.admin_email).first();
        if (admin) {
          admin.admin_email = admin.email;
          return admin;
        }
        return { id: 1, email: s.admin_email, admin_email: s.admin_email, role: "superadmin" };
      }
    } catch(e) {}

    try {
      const s2 = await env.DB.prepare(
        "SELECT * FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
      ).bind(token).first();
      if (s2) {
        const admin = await env.DB.prepare(
          "SELECT id, email, role FROM admins WHERE id = ?"
        ).bind(s2.admin_id || s2.user_id).first();
        if (admin) {
          admin.admin_email = admin.email;
          return admin;
        }
      }
    } catch(e) {}

    return null;
  } catch (err) {
    console.error("Auth admin error:", err);
    return null;
  }
}

const TELEGRAM_WEBHOOK_SECRET_KEY = "telegram_webhook_secret";
let telegramTablesReady = null;
let optionalFieldsReady = null;
async function ensureOptionalFields(env) {
  if (!optionalFieldsReady) {
    const addColumn = async (sql) => {
      try {
        await env.DB.prepare(sql).run();
      } catch (error) {
        const message = String(error?.message || error).toLowerCase();
        if (!message.includes('duplicate column') && !message.includes('already exists')) throw error;
      }
    };
    optionalFieldsReady = Promise.all([
      addColumn("ALTER TABLE donors ADD COLUMN current_address TEXT NOT NULL DEFAULT ''"),
      addColumn("ALTER TABLE blood_requests ADD COLUMN hemoglobin TEXT"),
      addColumn("ALTER TABLE blood_requests ADD COLUMN hemoglobin_unknown INTEGER NOT NULL DEFAULT 0"),
      addColumn("ALTER TABLE blood_requests ADD COLUMN requester_current_address TEXT")
    ]).catch(error => { optionalFieldsReady = null; throw error; });
  }
  return optionalFieldsReady;
}
async function ensureTelegramTables(env) {
  if (!telegramTablesReady) {
    telegramTablesReady = Promise.all([
      env.DB.prepare("CREATE TABLE IF NOT EXISTS bot_admin_states (admin_uid TEXT PRIMARY KEY, state TEXT, data TEXT, updated_at TEXT DEFAULT (datetime('now')))").run(),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_update_receipts (update_id INTEGER PRIMARY KEY, received_at TEXT DEFAULT (datetime('now')))").run(),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_alert_claims (request_id INTEGER PRIMARY KEY, claimed_at TEXT DEFAULT (datetime('now')))").run(),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_request_claims (request_id INTEGER PRIMARY KEY, admin_uid TEXT NOT NULL, claimed_at TEXT DEFAULT (datetime('now')))").run(),
      env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT, entity_id INTEGER, details TEXT, created_at TEXT DEFAULT (datetime('now')))").run(),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tg_audit_created ON telegram_admin_audit(created_at)").run()
    ]).catch(error => { telegramTablesReady = null; throw error; });
  }
  return telegramTablesReady;
}

async function recordTelegramAudit(env, adminUid, action, entityType = null, entityId = null, details = '') {
  try {
    await env.DB.prepare("INSERT INTO telegram_admin_audit (admin_uid, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)")
      .bind(String(adminUid), String(action), entityType, entityId === null ? null : Number(entityId), String(details || '').slice(0, 500)).run();
  } catch (error) {
    console.error('Telegram audit error:', error);
  }
}

async function isRateLimited(env, key, limit, windowMinutes) {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE key = ? AND created_at > ?").bind(key, cutoff).first();
  if ((row?.count || 0) >= limit) return true;
  await env.DB.prepare("INSERT INTO rate_limits (key, created_at) VALUES (?, datetime('now'))").bind(key).run();
  // Keep the limiter table bounded without adding a scheduled job or affecting normal requests.
  if (Math.random() < 0.01) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE created_at < datetime('now', '-2 hours')").run().catch(() => {});
  }
  return false;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXml(str) {
  return String(str ?? '').replace(/[<>&'\"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));
}

function posterText(value, fallback = 'তথ্য দেওয়া হয়নি') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function shapedPosterText(value, x, baseline, size, fill, anchor = 'start', maxWidth = Infinity) {
  const text = String(value ?? '');
  if (!text) return '';
  const isBengali = /[\u0980-\u09FF]/.test(text);
  const shapeFont = isBengali ? posterHbFont : posterLatinFont;
  const shapeUpem = isBengali ? posterHbUpem : posterLatinUpem;
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(shapeFont, buffer);
  const glyphs = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  const scale = size / shapeUpem;
  const totalWidth = positions.reduce((sum, p) => sum + p.xAdvance, 0) * scale;
  const fitScale = Number.isFinite(maxWidth) && totalWidth > maxWidth ? maxWidth / totalWidth : 1;
  const glyphScale = scale * fitScale;
  let cursor = anchor === 'middle' ? x - totalWidth * fitScale / 2 : x;
  let paths = '';
  for (let i = 0; i < glyphs.length; i++) {
    const position = positions[i];
    const path = shapeFont.glyphToPath(glyphs[i].codepoint);
    if (path) {
      const gx = cursor + position.xOffset * glyphScale;
      const gy = baseline - position.yOffset * glyphScale;
      paths += `<path d="${path}" transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${glyphScale.toFixed(5)} ${(-glyphScale).toFixed(5)})" fill="${fill}"/>`;
    }
    cursor += position.xAdvance * glyphScale;
  }
  return `<g aria-label="${escapeXml(text)}">${paths}</g>`;
}

function buildBloodRequestPosterSvg(data) {
  const fields = [
    ['রোগীর পুরো নাম', posterText(data.patient_name)],
    ['রক্তের গ্রুপ', posterText(data.blood_group)],
    ['রক্তের পরিমাণ (ব্যাগ)', posterText(data.units, '১')],
    ['হিমোগ্লোবিন', data.hemoglobin_unknown ? 'জানা নেই' : posterText(data.hemoglobin)],
    ['রক্ত লাগবে', posterText(data.needed_by)],
    ['চিকিৎসাধীন জেলা', posterText(data.district)],
    ['হাসপাতালের থানা / এলাকা', posterText(data.thana)],
    ['হাসপাতালের নাম ও ওয়ার্ড', posterText(data.hospital_name)],
    ['সুনির্দিষ্ট ঠিকানা / রোড', posterText(data.location)],
    ['রোগের কারণ / অতিরিক্ত তথ্য', posterText(data.note)],
    ['আবেদনকারীর পুরো নাম', posterText(data.requester_name, 'স্বজন')],
    ['যোগাযোগের মোবাইল নম্বর', posterText(data.contact_phone)]
  ];
  const rows = fields.map(([label, value], index) => {
    const y = 426 + index * 75;
    return `<rect x="50" y="${y - 47}" width="1100" height="62" rx="14" class="field"/>${shapedPosterText(`${index + 1}. ${label}:`, 72, y - 8, 25, '#0b2b55', 'start', 365)}${shapedPosterText(value, 478, y - 8, 34, '#172554', 'start', 640)}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
    <rect width="1200" height="1500" fill="#ffffff"/>
    <rect x="0" y="0" width="1200" height="20" fill="#0b2b55"/><rect x="0" y="20" width="1200" height="20" fill="#d90429"/>
    ${shapedPosterText('BRYBDPF', 600, 104, 86, '#0b2b55', 'middle', 600)}
    ${shapedPosterText('রংপুর বিভাগীয় ব্লাড নেটওয়ার্ক', 600, 158, 46, '#d90429', 'middle', 900)}
    ${shapedPosterText('জরুরি রক্ত সহায়তা — মানবতার পাশে', 600, 194, 27, '#0b2b55', 'middle', 900)}
    <path d="M88 228 H1112" stroke="#0b2b55" stroke-width="6"/><path d="M88 238 H1112" stroke="#d90429" stroke-width="3"/>
    <g transform="translate(1010 68)"><path d="M0 0 C-44 55 -57 81 -57 111 A57 57 0 0 0 57 111 C57 81 44 55 0 0Z" fill="#d90429"/><path d="M-31 103 C-31 78 -15 65 0 77 C15 65 31 78 31 103" fill="none" stroke="#fff" stroke-width="7"/><path d="M-25 101 H-10 L0 82 L10 112 L20 96 H33" fill="none" stroke="#fff" stroke-width="5"/></g>
    <rect x="76" y="270" width="1048" height="112" rx="28" fill="#d90429" stroke="#8f1235" stroke-width="8"/>
    <rect x="92" y="286" width="1016" height="80" rx="18" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
    ${shapedPosterText('জরুরি রক্তের প্রয়োজন', 600, 345, 64, '#ffffff', 'middle', 900)}
    ${shapedPosterText('রোগীর তথ্য ও যোগাযোগের তথ্য', 600, 402, 29, '#0b2b55', 'middle', 900)}
    ${rows}
    <path d="M70 1370 H1130" stroke="#0b2b55" stroke-width="7"/><path d="M70 1382 H1130" stroke="#d90429" stroke-width="3"/>
    ${shapedPosterText('রক্তদানে এগিয়ে আসুন — জীবন বাঁচান', 600, 1430, 36, '#d90429', 'middle', 1000)}
    ${shapedPosterText('BRYBDPF • brybdpf.pages.dev', 600, 1470, 22, '#0b2b55', 'middle', 1000)}
    <style>
      .brand{font-family:Arial,sans-serif;font-size:86px;font-weight:900;fill:#0b2b55;letter-spacing:6px}.brandBn{font-family:'Noto Sans Bengali',sans-serif;font-size:46px;font-weight:400;fill:#d90429}.brandSub{font-family:'Noto Sans Bengali',sans-serif;font-size:27px;font-weight:400;fill:#0b2b55}.title{font-family:'Noto Sans Bengali',sans-serif;font-size:64px;font-weight:400;fill:#fff}.sectionHint{font-family:'Noto Sans Bengali',sans-serif;font-size:29px;font-weight:400;fill:#0b2b55}.label{font-family:'Noto Sans Bengali',sans-serif;font-size:25px;font-weight:400;fill:#0b2b55}.field{fill:#fff;stroke:#475569;stroke-width:3}.value{font-family:'Noto Sans Bengali',sans-serif;font-size:34px;font-weight:400;fill:#172554}.footer{font-family:'Noto Sans Bengali',sans-serif;font-size:36px;font-weight:400;fill:#d90429}.url{font-family:Arial,sans-serif;font-size:22px;font-weight:700;fill:#0b2b55}
    </style>
  </svg>`;
}

async function sendBloodRequestPoster(token, uid, requestData, pngBytes) {
  const form = new FormData();
  form.append('chat_id', uid);
  form.append('caption', '🩸 জরুরি রক্তের আবেদন পোস্টার');
  form.append('photo', new Blob([pngBytes], { type: 'image/png' }), `brybdpf-blood-request-${requestData.id || 'new'}.png`);
  return fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
}

function parseTelegramAdminUids(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map(v => v.trim())
    .filter(v => /^-?\d+$/.test(v));
}

async function tgSendMessage(token, chatId, text, inlineKeyboard = null, parseMode = "HTML") {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true
  };
  if (inlineKeyboard) {
    payload.reply_markup = { inline_keyboard: inlineKeyboard };
  }
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function tgEditMessage(token, chatId, messageId, text, inlineKeyboard = null, parseMode = "HTML") {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true
  };
  if (parseMode) payload.parse_mode = parseMode;
  if (inlineKeyboard) {
    payload.reply_markup = { inline_keyboard: inlineKeyboard };
  }
  try {
    let res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      return await tgSendMessage(token, chatId, text, inlineKeyboard, parseMode);
    }
    return res;
  } catch (e) {
    return tgSendMessage(token, chatId, text, inlineKeyboard, parseMode);
  }
}

async function tgAnswerCallback(token, callbackQueryId, text = null) {
  if (!callbackQueryId) return;
  try {
    const payload = { callback_query_id: callbackQueryId };
    if (text) payload.text = text;
    return await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

async function tgSendOrEdit(token, chatId, messageId, text, replyMarkup, isCallback) {
  if (isCallback && messageId) {
    return tgEditMessage(token, chatId, messageId, text, replyMarkup);
  }
  return tgSendMessage(token, chatId, text, replyMarkup);
}

function getMainAdminReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "⚡ অপারেশন ড্যাশবোর্ড" }, { text: "📊 পরিসংখ্যান" }],
      [{ text: "🩸 গ্রুপভিত্তিক ডোনার" }, { text: "📋 পেন্ডিং রিকোয়েস্ট" }],
      [{ text: "💉 রক্তদান সম্পন্ন" }, { text: "🔍 ডোনার সার্চ / অ্যাকশন" }],
      [{ text: "🔄 রিফ্রেশ মেনু" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function getMainAdminKeyboard() {
  return [
    [
      { text: "⚡ অপারেশন ড্যাশবোর্ড", callback_data: "cb:ops" },
      { text: "📊 পরিসংখ্যান ও গ্রুপ ডাটা", callback_data: "cb:stats" }
    ],
    [
      { text: "🩸 গ্রুপভিত্তিক ডোনার", callback_data: "cb:groups" },
      { text: "📋 পেন্ডিং রিকোয়েস্ট", callback_data: "cb:pending" }
    ],
    [
      { text: "💉 রক্তদান সম্পন্ন", callback_data: "cb:mark_donation" },
      { text: "🔍 ডোনার সার্চ / অ্যাকশন", callback_data: "cb:donor_search" }
    ],
    [
      { text: "🔄 রিফ্রেশ", callback_data: "cb:menu" }
    ]
  ];
}

async function handleTelegramUpdate(update, env, ctx, publicOrigin = null) {
  let token = "";
  let chatId = null;
  try {
    let adminUidsStr = "";

    await ensureTelegramTables(env);

    const { results: settings } = await env.DB.prepare(
      "SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids')"
    ).all();

    for (const s of settings) {
      if (s.key === "telegram_bot_token") token = s.value;
      if (s.key === "telegram_admin_uids") adminUidsStr = s.value;
    }

    if (!token && env.TELEGRAM_BOT_TOKEN) token = env.TELEGRAM_BOT_TOKEN;
    if (!adminUidsStr && env.TELEGRAM_ADMIN_IDS) adminUidsStr = env.TELEGRAM_ADMIN_IDS;

    if (!token) return;

    const allowedUids = parseTelegramAdminUids(adminUidsStr);

    const renderStats = async (targetChatId, targetMsgId, isCb) => {
      const [donorsRes, availRes, reqRes, pendingRes] = await Promise.all([
        env.DB.prepare("SELECT count(*) as count FROM donors").first(),
        env.DB.prepare("SELECT count(*) as count FROM donors WHERE (is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) AND is_active = 1").first(),
        env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
        env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched')").first()
      ]);

      const total = donorsRes?.count || 0;
      const avail = availRes?.count || 0;
      const onHold = total - avail;

      const text = `📊 <b>BRYBDPF সামগ্রিক পরিসংখ্যান ও ডোনার ডাটা</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 <b>মোট নিবন্ধিত ডোনার:</b> ${total} জন\n` +
        `✅ <b>রক্তদানে প্রস্তুত:</b> ${avail} জন\n` +
        `⏸️ <b>বিশ্রামে / আন-অ্যাক্টিভ:</b> ${onHold} জন\n` +
        `📋 <b>মোট রক্তের রিকোয়েস্ট:</b> ${reqRes?.count || 0} টি\n` +
        `⏳ <b>অপেক্ষমাণ (Pending):</b> ${pendingRes?.count || 0} টি\n`;

      const kb = [
        [{ text: "🩸 গ্রুপভিত্তিক ডোনার তালিকা", callback_data: "cb:groups" }],
        [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
      ];

      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderOperations = async (targetChatId, targetMsgId, isCb) => {
      const [pending, urgent, today, fulfilled, claims, groups] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS c FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched')").first(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched') AND LOWER(COALESCE(urgency, 'urgent')) = 'urgent'").first(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM blood_requests WHERE date(created_at) = date('now')").first(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM blood_requests WHERE LOWER(status) = 'fulfilled' AND date(created_at) = date('now')").first(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM telegram_request_claims c JOIN blood_requests r ON r.id = c.request_id WHERE LOWER(r.status) IN ('pending', 'matched')").first(),
        env.DB.prepare("SELECT blood_group, COUNT(*) AS c FROM donors WHERE is_active = 1 AND (is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) GROUP BY blood_group ORDER BY c DESC").all()
      ]);
      const groupLine = (groups.results || []).slice(0, 8).map(g => `${escapeHtml(g.blood_group)}: <b>${g.c}</b>`).join('  •  ') || 'এখনও কোনো ডাটা নেই';
      const text = `⚡ <b>BRYBDPF অপারেশন ড্যাশবোর্ড</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
        `🚨 <b>জরুরি pending:</b> ${urgent?.c || 0}\n` +
        `📋 <b>মোট active case:</b> ${pending?.c || 0}\n` +
        `👤 <b>Claim করা case:</b> ${claims?.c || 0}\n` +
        `📅 <b>আজকের request:</b> ${today?.c || 0}\n` +
        `✅ <b>আজ fulfilled:</b> ${fulfilled?.c || 0}\n\n` +
        `🩸 <b>Available blood group:</b>\n${groupLine}`;
      const kb = [
        [{ text: '🚨 Pending cases', callback_data: 'cb:pending' }, { text: '📊 বিস্তারিত stats', callback_data: 'cb:stats' }],
        [{ text: '🧾 Admin activity log', callback_data: 'cb:audit' }],
        [{ text: '🔄 Refresh', callback_data: 'cb:ops' }, { text: '🔙 মূল মেনু', callback_data: 'cb:menu' }]
      ];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderAudit = async (targetChatId, targetMsgId, isCb) => {
      const { results } = await env.DB.prepare("SELECT admin_uid, action, entity_type, entity_id, details, created_at FROM telegram_admin_audit ORDER BY id DESC LIMIT 10").all();
      const rows = results || [];
      const text = `🧾 <b>সাম্প্রতিক admin activity</b>\n────────────────────\n` + (rows.length ? rows.map((r, i) => `${i + 1}. <b>${escapeHtml(r.action)}</b> ${r.entity_id ? `#${r.entity_id}` : ''}\n   👤 ${escapeHtml(r.admin_uid)} • ${escapeHtml(r.created_at || '')}\n   ${escapeHtml(r.details || '')}`).join('\n\n') : 'এখনও কোনো activity record নেই।');
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, [[{ text: '🔄 Refresh', callback_data: 'cb:audit' }], [{ text: '⚡ অপারেশন ড্যাশবোর্ড', callback_data: 'cb:ops' }], [{ text: '🔙 মূল মেনু', callback_data: 'cb:menu' }]], isCb);
    };

    const renderRequestDetails = async (targetChatId, targetMsgId, requestId, adminUid, isCb) => {
      const req = await env.DB.prepare("SELECT id, patient_name, blood_group, units, hospital_name, district, thana, location, contact_phone, urgency, needed_by, note, status, requester_name, requester_current_address, hemoglobin, hemoglobin_unknown, created_at FROM blood_requests WHERE id = ?").bind(requestId).first();
      if (!req) return tgSendOrEdit(token, targetChatId, targetMsgId, '❌ রিকোয়েস্টটি পাওয়া যায়নি।', [[{ text: '📋 Pending তালিকা', callback_data: 'cb:pending' }]], isCb);
      const claim = await env.DB.prepare("SELECT admin_uid, claimed_at FROM telegram_request_claims WHERE request_id = ?").bind(requestId).first();
      const status = String(req.status || 'Pending');
      const location = [req.hospital_name, req.district, req.thana, req.location].filter(Boolean).map(escapeHtml).join(', ');
      const text = `🧾 <b>রিকোয়েস্ট #${req.id} বিস্তারিত</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 রোগী: <b>${escapeHtml(req.patient_name)}</b>\n🩸 রক্ত: <code>${escapeHtml(req.blood_group)}</code> • ${req.units || 1} ব্যাগ\n` +
        `🚨 Priority: <b>${escapeHtml(req.urgency || 'Urgent')}</b>\n📍 ${location}\n⏰ ${escapeHtml(req.needed_by)}\n` +
        `📞 <code>${escapeHtml(req.contact_phone)}</code>\n👤 আবেদনকারী: ${escapeHtml(req.requester_name || 'স্বজন')}\n🏠 বর্তমান ঠিকানা: ${escapeHtml(req.requester_current_address || 'তথ্য নেই')}\n🧪 হিমোগ্লোবিন: <b>${req.hemoglobin_unknown ? 'জানা নেই' : escapeHtml(req.hemoglobin || 'তথ্য নেই')}</b>\n📌 Status: <b>${escapeHtml(status)}</b>\n` +
        `👤 Assigned: <b>${claim ? escapeHtml(claim.admin_uid) : 'কেউ নয়'}</b>${claim?.claimed_at ? `\n🕒 Claimed: ${escapeHtml(claim.claimed_at)}` : ''}` +
        (req.note ? `\n📝 Note: ${escapeHtml(req.note)}` : '');
      const kb = [
        [{ text: '🩸 Matching donors', callback_data: `cb:req:${req.id}:view` }],
        claim?.admin_uid === String(adminUid) ? [{ text: '🔓 Claim release', callback_data: `cb:req:${req.id}:unclaim` }] : [{ text: claim ? `👤 Claimed by ${claim.admin_uid}` : '🙋 এই case claim করুন', callback_data: `cb:req:${req.id}:claim` }],
        [{ text: status === 'Pending' ? '✅ Matched করুন' : '✅ Fulfilled করুন', callback_data: `cb:req:${req.id}:${status === 'Pending' ? 'Matched' : 'Fulfilled'}` }, { text: '🚫 Closed', callback_data: `cb:req:${req.id}:Closed` }],
        [{ text: '📋 Pending তালিকা', callback_data: 'cb:pending' }, { text: '🔙 মূল মেনু', callback_data: 'cb:menu' }]
      ];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderGroups = async (targetChatId, targetMsgId, isCb) => {
      const text = "🩸 <b>কোন গ্রুপের ডোনারদের তথ্য দেখতে চান নির্বাচন করুন:</b>";
      const kb = [
        [
          { text: "A+", callback_data: "cb:grp:A+" },
          { text: "A-", callback_data: "cb:grp:A-" },
          { text: "B+", callback_data: "cb:grp:B+" },
          { text: "B-", callback_data: "cb:grp:B-" }
        ],
        [
          { text: "AB+", callback_data: "cb:grp:AB+" },
          { text: "AB-", callback_data: "cb:grp:AB-" },
          { text: "O+", callback_data: "cb:grp:O+" },
          { text: "O-", callback_data: "cb:grp:O-" }
        ],
        [
          { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
        ]
      ];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderPending = async (targetChatId, targetMsgId, isCb, adminUid = targetChatId) => {
      const { results } = await env.DB.prepare(
        "SELECT id, patient_name, blood_group, units, hospital_name, district, thana, needed_by, urgency, status, hemoglobin, hemoglobin_unknown, created_at FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched') ORDER BY CASE WHEN LOWER(COALESCE(urgency, 'urgent')) = 'urgent' THEN 0 ELSE 1 END, id DESC LIMIT 8"
      ).all();
      const rows = results || [];
      const claims = rows.length ? await env.DB.prepare(`SELECT request_id, admin_uid FROM telegram_request_claims WHERE request_id IN (${rows.map(() => '?').join(',')})`).bind(...rows.map(r => r.id)).all() : { results: [] };
      const claimMap = new Map((claims.results || []).map(c => [Number(c.request_id), c.admin_uid]));
      let text = "📋 <b>অপেক্ষমাণ রক্তের রিকোয়েস্ট</b>\n────────────────────\n";
      if (!rows.length) text += "✅ এখন কোনো Pending বা Matched রিকোয়েস্ট নেই।";
      else text += rows.map((r, i) => `${i + 1}. ${String(r.urgency || 'Urgent').toLowerCase() === 'urgent' ? '🚨' : '🟡'} <b>#${r.id} ${escapeHtml(r.blood_group)}</b> — ${escapeHtml(r.patient_name)}\n   🏥 ${escapeHtml(r.hospital_name)}, ${escapeHtml(r.district)}${r.thana ? `, ${escapeHtml(r.thana)}` : ''}\n   🧪 Hb: ${r.hemoglobin_unknown ? 'জানা নেই' : escapeHtml(r.hemoglobin || 'তথ্য নেই')}\n   📌 ${escapeHtml(r.status)} • ${escapeHtml(r.needed_by)} • ${claimMap.has(Number(r.id)) ? `👤 ${escapeHtml(claimMap.get(Number(r.id)))}` : '🙋 Unassigned'}`).join("\n\n");
      const kb = rows.flatMap(r => {
        const claim = claimMap.get(Number(r.id));
        return [[
          { text: `#${r.id} বিস্তারিত`, callback_data: `cb:req:${r.id}:details` },
          { text: claim ? `👤 ${claim === String(adminUid) ? 'আমার claim' : 'Claimed'}` : '🙋 Claim', callback_data: claim ? `cb:req:${r.id}:details` : `cb:req:${r.id}:claim` }
        ]];
      });
      kb.push([{ text: "🔄 রিফ্রেশ", callback_data: "cb:pending" }, { text: "🔙 মূল মেনু", callback_data: "cb:menu" }]);
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderDonationPrompt = async (targetChatId, targetMsgId, isCb, stateKey = targetChatId) => {
      try {
        await env.DB.prepare("INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, data, updated_at) VALUES (?, 'donation_phone', '', datetime('now'))").bind(String(stateKey)).run();
      } catch (stateError) {
        console.error("Telegram donation state error:", stateError);
        return tgSendOrEdit(token, targetChatId, targetMsgId, "⚠️ সাময়িক ডাটাবেজ সমস্যা হয়েছে। অনুগ্রহ করে আবার বাটনটি চাপুন।", [[{ text: "🔄 আবার চেষ্টা", callback_data: "cb:mark_donation" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], isCb);
      }
      const text = "💉 <b>রক্তদান সম্পন্ন মার্ক করুন</b>\nডোনারের নিবন্ধিত ১১ ডিজিটের ফোন নম্বর পাঠান।\n\nফোন পাওয়ার পর আমি ডোনারের নাম ও লিঙ্গ দেখিয়ে আপনার কাছে নিশ্চিতকরণ চাইব।";
      const kb = [[{ text: "❌ বাতিল", callback_data: "cb:don_cancel" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderDonorSearch = async (targetChatId, targetMsgId, isCb) => {
      await env.DB.prepare("INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, data, updated_at) VALUES (?, 'donor_search', '', datetime('now'))").bind(String(targetChatId)).run();
      const text = "🔍 <b>ডোনার সার্চ</b>\nপরের মেসেজে নাম, ফোন, এলাকা বা রক্তের গ্রুপ লিখুন। যেমন: <code>A+</code> অথবা <code>017</code>";
      const kb = [[{ text: "🩸 গ্রুপভিত্তিক তালিকা", callback_data: "cb:groups" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderMatches = async (targetChatId, targetMsgId, requestId, isCb, page = 1) => {
      const req = await env.DB.prepare("SELECT patient_name, blood_group, district FROM blood_requests WHERE id = ?").bind(requestId).first();
      if (!req) return tgSendOrEdit(token, targetChatId, targetMsgId, "❌ রিকোয়েস্টটি পাওয়া যায়নি।", [[{ text: "🔙 Pending তালিকা", callback_data: "cb:pending" }]], isCb);
      const safePage = Math.max(1, Number(page) || 1);
      const limit = 8;
      const offset = (safePage - 1) * limit;
      const where = "REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND ((is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) AND is_active = 1)";
      const [countRow, donorRows] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS c FROM donors WHERE ${where}`).bind(req.blood_group).first(),
        env.DB.prepare(`SELECT name, blood_group, phone, area, district, current_address, total_donations FROM donors WHERE ${where} ORDER BY CASE WHEN district = ? THEN 0 ELSE 1 END, id DESC LIMIT ? OFFSET ?`).bind(req.blood_group, req.district, limit, offset).all()
      ]);
      const total = countRow?.c || 0;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const donors = donorRows.results || [];
      const text = `🩸 <b>#${requestId} — ${escapeHtml(req.patient_name)}</b>\nপ্রয়োজন: <code>${escapeHtml(req.blood_group)}</code> | ${escapeHtml(req.district)}\nপৃষ্ঠা ${safePage}/${totalPages} • মোট ${total} জন\n────────────────────\n` + (donors.length ? donors.map((d, i) => `${offset + i + 1}. <b>${escapeHtml(d.name)}</b> — ${escapeHtml(d.phone)}\n   📍 ${escapeHtml(d.current_address || ((d.area || '') + ', ' + (d.district || '')))} | দান ${d.total_donations || 0} বার`).join("\n\n") : "⚠️ এই গ্রুপে এখন কোনো প্রস্তুত ডোনার নেই।");
      const nav = [];
      if (safePage > 1) nav.push({ text: "⬅️ আগের", callback_data: `cb:req:${requestId}:view:${safePage - 1}` });
      if (safePage < totalPages) nav.push({ text: "পরের ➡️", callback_data: `cb:req:${requestId}:view:${safePage + 1}` });
      const kb = [];
      if (nav.length) kb.push(nav);
      kb.push([{ text: "📋 Pending তালিকা", callback_data: "cb:pending" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]);
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = String(cq.from?.id || "");
      chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = cq.data || "";

      if (!allowedUids.includes(fromId)) {
        await tgAnswerCallback(token, cq.id, "⛔ অননুমোদিত অ্যাক্সেস।");
        return;
      }

      await tgAnswerCallback(token, cq.id);

      if (data === "cb:pending") {
        await renderPending(chatId, messageId, true, fromId);
        return;
      }

      if (data === "cb:ops") {
        await renderOperations(chatId, messageId, true);
        return;
      }

      if (data === "cb:audit") {
        await renderAudit(chatId, messageId, true);
        return;
      }

      if (data === "cb:mark_donation" || data === "mark_donation" || data === "donation_done") {
        await renderDonationPrompt(chatId, messageId, true, fromId);
        return;
      }

      if (data === "cb:donor_search") {
        await renderDonorSearch(chatId, messageId, true);
        return;
      }

      if (data.startsWith("cb:req:")) {
        const parts = data.split(":");
        const requestId = parts[2];
        const action = parts[3];
        const matchPage = parts[4] === undefined ? 1 : Math.max(1, Number(parts[4]) || 1);
        if (action === "view") {
          await renderMatches(chatId, messageId, requestId, true, matchPage);
          return;
        }
        if (action === "details") {
          await renderRequestDetails(chatId, messageId, requestId, fromId, true);
          return;
        }
        if (action === "claim") {
          const claim = await env.DB.prepare("INSERT OR IGNORE INTO telegram_request_claims (request_id, admin_uid) VALUES (?, ?)").bind(requestId, fromId).run();
          if (claim?.meta?.changes > 0) {
            await recordTelegramAudit(env, fromId, 'CLAIM_REQUEST', 'blood_request', requestId, 'Request claimed from Telegram');
            await renderRequestDetails(chatId, messageId, requestId, fromId, true);
          } else {
            await tgSendOrEdit(token, chatId, messageId, '👤 এই case ইতিমধ্যে অন্য একজন admin claim করেছেন।', [[{ text: '🧾 Details দেখুন', callback_data: `cb:req:${requestId}:details` }], [{ text: '📋 Pending তালিকা', callback_data: 'cb:pending' }]], true);
          }
          return;
        }
        if (action === "unclaim") {
          const released = await env.DB.prepare("DELETE FROM telegram_request_claims WHERE request_id = ? AND admin_uid = ?").bind(requestId, fromId).run();
          if (released?.meta?.changes > 0) await recordTelegramAudit(env, fromId, 'RELEASE_REQUEST', 'blood_request', requestId, 'Request claim released');
          await renderRequestDetails(chatId, messageId, requestId, fromId, true);
          return;
        }
        const allowed = new Set(["Matched", "Fulfilled", "Closed"]);
        if (allowed.has(action)) {
          const previous = await env.DB.prepare("SELECT status FROM blood_requests WHERE id = ?").bind(requestId).first();
          await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(action, requestId).run();
          await recordTelegramAudit(env, fromId, `STATUS_${action.toUpperCase()}`, 'blood_request', requestId, `${previous?.status || 'unknown'} -> ${action}`);
          if (publicOrigin) invalidatePublicStatsCache(publicOrigin, ctx);
          await tgSendOrEdit(token, chatId, messageId, `✅ রিকোয়েস্ট <b>#${requestId}</b> এখন <b>${action}</b>।`, [[{ text: "🧾 Details", callback_data: `cb:req:${requestId}:details` }], [{ text: "📋 Pending তালিকা", callback_data: "cb:pending" }, { text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
          return;
        }
      }

      if (data === "cb:don_cancel") {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(String(fromId)).run();
        await tgSendOrEdit(token, chatId, messageId, "✅ ডোনেশন মার্ক বাতিল করা হয়েছে。", [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
        return;
      }

      if (data.startsWith("cb:don_confirm:")) {
        const donorId = data.slice("cb:don_confirm:".length);
        const donor = await env.DB.prepare("SELECT id, name, blood_group, gender, is_available FROM donors WHERE id = ?").bind(donorId).first();
        if (!donor) {
          await tgSendOrEdit(token, chatId, messageId, "❌ ডোনারটি পাওয়া যায়নি।", [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
          return;
        }
        const isFemale = /female|মহিলা|নারী|মেয়ে|মেয়ে/i.test(String(donor.gender || ''));
        const months = isFemale ? 4 : 3;
        const nextAvailable = new Date();
        nextAvailable.setMonth(nextAvailable.getMonth() + months);
        const nextDate = nextAvailable.toISOString().slice(0, 10);
        const nextDateBn = nextAvailable.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
        await env.DB.prepare("UPDATE donors SET total_donations = COALESCE(total_donations, 0) + 1, last_donation_date = date('now'), next_available_date = ?, is_available = 0, updated_at = datetime('now') WHERE id = ?").bind(nextDate, donorId).run();
        await recordTelegramAudit(env, fromId, 'DONATION_COMPLETE', 'donor', donorId, `${donor.name} • ${donor.blood_group} • ${months} months unavailable`);
        if (publicOrigin) invalidatePublicStatsCache(publicOrigin, ctx);
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(String(fromId)).run();
        await tgSendOrEdit(token, chatId, messageId, `✅ <b>রক্তদান সম্পন্ন হিসেবে সংরক্ষণ হয়েছে</b>\n\n👤 ${escapeHtml(donor.name)} (${escapeHtml(donor.blood_group)})\n📅 আজকের ডোনেশন যোগ হয়েছে\n⏸️ ${months} মাসের জন্য আন-অ্যাভেইলেবল\n🟢 আবার রক্ত দিতে পারবেন: <b>${nextDateBn}</b>`, [[{ text: "💉 আরেকজনের ডোনেশন মার্ক করুন", callback_data: "cb:mark_donation" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
        return;
      }

      if (data.startsWith("cb:don:")) {
        await renderDonationPrompt(chatId, messageId, true);
        return;
      }
      if (data === "cb:menu") {
        const text = "🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল</b> 🩸\nস্বাগতম! নিচের বাটনগুলো ব্যবহার করে পরিচালনা করুন:";
        await tgSendOrEdit(token, chatId, messageId, text, getMainAdminKeyboard(), true);
        return;
      }

      if (data === "cb:stats") {
        await renderStats(chatId, messageId, true);
        return;
      }

      if (data === "cb:groups") {
        await renderGroups(chatId, messageId, true);
        return;
      }

      if (data.startsWith("cb:grp:")) {
        const groupData = data.replace("cb:grp:", "").trim();
        const marker = groupData.lastIndexOf(":p:");
        const bg = marker >= 0 ? groupData.slice(0, marker) : groupData;
        const page = marker >= 0 ? Math.max(1, Number(groupData.slice(marker + 3)) || 1) : 1;
        const limit = 10;
        const offset = (page - 1) * limit;
        const where = "REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND ((is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) AND is_active = 1)";
        const [countRow, donorRows] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) AS c FROM donors WHERE ${where}`).bind(bg).first(),
        env.DB.prepare(`SELECT id, name, phone, district, area, current_address, last_donation_date, total_donations FROM donors WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(bg, limit, offset).all()
        ]);
        const total = countRow?.c || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const results = donorRows.results || [];
        let donorText = `🩸 <b>${escapeHtml(bg)} গ্রুপের প্রস্তুত ডোনার তালিকা</b>\nপৃষ্ঠা ${page}/${totalPages} • মোট ${total} জন\n────────────────────────────\n\n`;
        donorText += results.length ? results.map((d, i) => {
          const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
          const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
          const waUrl = `https://wa.me/${waNumber}`;
          const loc = d.current_address ? escapeHtml(d.current_address) : ((d.area ? escapeHtml(d.area) + ", " : "") + escapeHtml(d.district || "রংপুর"));
          return `<b>${offset + i + 1}. ${escapeHtml(d.name)}</b> (${loc})\n   📞 <code>${d.phone}</code> | দান: ${d.total_donations || 0} বার ➔ <a href="${waUrl}">💬 <b>WhatsApp</b></a>`;
        }).join("\n\n") : "⚠️ এই গ্রুপে এখন কোনো সক্রিয় ও প্রস্তুত ডোনার নেই।";
        const nav = [];
        if (page > 1) nav.push({ text: "⬅️ আগের", callback_data: `cb:grp:${bg}:p:${page - 1}` });
        if (page < totalPages) nav.push({ text: "পরের ➡️", callback_data: `cb:grp:${bg}:p:${page + 1}` });
        const inlineKb = [];
        if (nav.length) inlineKb.push(nav);
        inlineKb.push([{ text: "🩸 অন্য গ্রুপ দেখুন", callback_data: "cb:groups" }, { text: "🔙 মূল মেনু", callback_data: "cb:menu" }]);
        await tgSendOrEdit(token, chatId, messageId, donorText, inlineKb, true);
        return;
      }
    }

    if (update.message) {
      const msg = update.message;
      const fromId = String(msg.from?.id || "");
      chatId = msg.chat?.id;
      const text = (msg.text || "").trim();

      if (!allowedUids.includes(fromId)) {
        await tgSendMessage(token, chatId, "⛔ <b>অননুমোদিত অ্যাক্সেস।</b>");
        return;
      }

      let stateRow = await env.DB.prepare("SELECT state, data FROM bot_admin_states WHERE admin_uid = ? AND updated_at > datetime('now', '-30 minutes')").bind(String(fromId)).first();
      const isMenuAction = text === '/start' || text === '/menu' || text === '/stats' || text === '/groups' ||
        text.includes('মেনু') || text.includes('রিফ্রেশ') || text.includes('পরিসংখ্যান') ||
        text.includes('অপারেশন') || text.includes('ড্যাশবোর্ড') || text.includes('পেন্ডিং') ||
        text.includes('গ্রুপভিত্তিক') || text.includes('রক্তদান') || text.includes('ডোনেশন') ||
        text.includes('সার্চ') || text.includes('অ্যাকশন');
      if (isMenuAction && stateRow?.state) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(String(fromId)).run();
        stateRow = null;
      }
      if (['donation_phone', 'waiting_for_donation_phone', 'waiting_for_phone'].includes(stateRow?.state) && text && !text.startsWith('/')) {
        const cleanPhone = normalizePhone(text);
        if (!isValidPhone(cleanPhone)) {
          await tgSendMessage(token, chatId, "⚠️ সঠিক ১১ ডিজিটের ফোন নম্বর দিন। যেমন: <code>017XXXXXXXX</code>", [[{ text: "❌ বাতিল", callback_data: "cb:don_cancel" }]]);
          return;
        }
        const donor = await env.DB.prepare("SELECT id, name, blood_group, gender, is_available, next_available_date FROM donors WHERE phone = ?").bind(cleanPhone).first();
        if (!donor) {
          await tgSendMessage(token, chatId, "❌ এই ফোন নম্বরের কোনো নিবন্ধিত ডোনার পাওয়া যায়নি। নম্বরটি আবার পাঠান বা বাতিল করুন।", [[{ text: "🔄 আবার চেষ্টা", callback_data: "cb:mark_donation" }], [{ text: "❌ বাতিল", callback_data: "cb:don_cancel" }]]);
          return;
        }
        await env.DB.prepare("INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, data, updated_at) VALUES (?, 'donation_confirm', ?, datetime('now'))").bind(String(fromId), JSON.stringify({ donor_id: donor.id })).run();
        const genderText = /female|মহিলা|নারী|মেয়ে|মেয়ে/i.test(String(donor.gender || '')) ? 'নারী' : 'পুরুষ';
        await tgSendMessage(token, chatId, `🔎 <b>ডোনার পাওয়া গেছে</b>\n\n👤 নাম: <b>${escapeHtml(donor.name)}</b>\n🩸 গ্রুপ: <b>${escapeHtml(donor.blood_group)}</b>\n⚧ লিঙ্গ: ${genderText}\n📞 ফোন: <code>${escapeHtml(cleanPhone)}</code>\n\nআপনি কি নিশ্চিত যে এই ডোনার আজ রক্ত দিয়েছেন?`, [[{ text: "✅ হ্যাঁ, নিশ্চিত", callback_data: `cb:don_confirm:${donor.id}` }, { text: "❌ না, বাতিল", callback_data: "cb:don_cancel" }]]);
        return;
      }

      if (stateRow?.state === 'donor_search' && text && !text.startsWith('/')) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(String(fromId)).run();
        const term = text.trim().slice(0, 80);
        const { results } = await env.DB.prepare("SELECT name, blood_group, phone, district, area, current_address, is_available FROM donors WHERE name LIKE ? OR phone LIKE ? OR district LIKE ? OR area LIKE ? OR current_address LIKE ? OR REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') ORDER BY id DESC LIMIT 10").bind(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, term).all();
        const rows = results || [];
        const textOut = rows.length ? `🔍 <b>${escapeHtml(term)}</b>-এর জন্য ${rows.length} জন ডোনার:\n────────────────────\n` + rows.map((d, i) => `${i + 1}. <b>${escapeHtml(d.name)}</b> — ${escapeHtml(d.blood_group)}\n   ${escapeHtml(d.phone)} | ${escapeHtml(d.current_address || ((d.district || '') + ', ' + (d.area || '')))}`).join("\n\n") : `⚠️ <b>${escapeHtml(term)}</b>-এর জন্য কোনো ডোনার পাওয়া যায়নি।`;
        await tgSendMessage(token, chatId, textOut, [[{ text: "🔍 আবার সার্চ", callback_data: "cb:donor_search" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]]);
        return;
      }

      if (text === "/start" || text === "/menu" || text.includes("মেনু") || text.includes("রিফ্রেশ")) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(String(fromId)).run();
        const welcomeText = `🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল প্যানেল</b> 🩸\nস্বাগতম! নিচের বাটনগুলো চেপে সহজেই রিয়েলটাইম ডোনার ও রক্তের রিকোয়েস্ট পরিচালনা করুন:`;
        await tgSendMessage(token, chatId, welcomeText, getMainAdminKeyboard());
        return;
      }

      if (text.includes("অপারেশন") || text.includes("ড্যাশবোর্ড")) {
        await renderOperations(chatId, null, false);
        return;
      }

      if (text === "/stats" || text.includes("পরিসংখ্যান")) {
        await renderStats(chatId, null, false);
        return;
      }

      if (text.includes("পেন্ডিং")) {
        await renderPending(chatId, null, false, fromId);
        return;
      }

      if (text.includes("ডোনেশন") || text.includes("রক্তদান")) {
        await renderDonationPrompt(chatId, null, false, fromId);
        return;
      }

      if (text.includes("সার্চ") || text.includes("অ্যাকশন")) {
        await renderDonorSearch(chatId, null, false);
        return;
      }

      if (text === "/groups" || text.includes("গ্রুপ")) {
        await renderGroups(chatId, null, false);
        return;
      }

      await tgSendMessage(token, chatId, "🩸 <b>আপনার admin access সক্রিয় আছে</b>\nনিচের menu থেকে একটি অপশন নির্বাচন করুন:", getMainAdminKeyboard());
    }
  } catch (err) {
    console.error("Telegram bot error:", err);
  }
}

async function hashPasswordPBKDF2(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derivedKey))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPasswordSHA256(password, salt) {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(password + (salt || "")));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  const ctx = context;

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const ip = getClientIP(request);

      if (method === "OPTIONS") return json({ ok: true });

      if (path.startsWith('/api/')) await ensureOptionalFields(env);

      if (path === "/api/telegram/webhook" && method === "POST") {
        try {
          const secretRow = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = ?").bind(TELEGRAM_WEBHOOK_SECRET_KEY).first();
          const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET || secretRow?.value || "";
          const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
          if (!expectedSecret || suppliedSecret !== expectedSecret) return json({ ok: false }, 403);
          const update = await request.json();
          // Telegram retries webhook deliveries. Ignore an update already processed,
          // preventing duplicate messages and duplicate donation/status actions.
          if (update?.update_id !== undefined) {
            await ensureTelegramTables(env);
            const receipt = await env.DB.prepare("INSERT OR IGNORE INTO telegram_update_receipts (update_id) VALUES (?)").bind(Number(update.update_id)).run();
            if (!(receipt?.meta?.changes > 0)) return json({ ok: true, duplicate: true });
            if (Math.random() < 0.01) await env.DB.prepare("DELETE FROM telegram_update_receipts WHERE received_at < datetime('now', '-2 days')").run().catch(() => {});
          }
          // Process inline so Telegram callback updates are not dropped when a Pages
          // invocation ends before a background waitUntil task is scheduled.
          await handleTelegramUpdate(update, env, ctx, url.origin);
          return json({ ok: true });
        } catch (e) {
          return json({ ok: false, error: e.message }, 500);
        }
      }

      if (path === "/api/telegram/setup-webhook" && method === "POST") {
        const admin = await getAuthenticatedAdmin(request, env);
        if (!admin) return json({ error: "অননুমোদিত অ্যাক্সেস" }, 401);

        const host = url.origin;
        const webhookUrl = `${host}/api/telegram/webhook`;

        const tokenRes = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_bot_token'").first();
        if (!tokenRes || !tokenRes.value) {
          return json({ success: false, error: "টেলিগ্রাম বট টোকেন কনফিগার করা নেই।" });
        }

        const token = tokenRes.value;
        let secretRow = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = ?").bind(TELEGRAM_WEBHOOK_SECRET_KEY).first();
        const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET || secretRow?.value || generateRandomToken(24);
        if (!secretRow?.value && !env.TELEGRAM_WEBHOOK_SECRET) {
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").bind(TELEGRAM_WEBHOOK_SECRET_KEY, webhookSecret).run();
        }
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: webhookSecret,
            drop_pending_updates: false,
            allowed_updates: ["message", "callback_query"]
          })
        });
        const tgData = await tgRes.json();
        return json({ success: tgData.ok, result: tgData, webhookUrl });
      }

      if (path === "/api/captcha" && method === "GET") {
        const captcha = await generateCaptcha(env);
        return json(captcha);
      }

      if (path === "/api/stats" && method === "GET") {
        const edgeCachedStats = await readPublicStatsCache(url.origin);
        if (edgeCachedStats) return edgeCachedStats;
        const [donorsRes, availRes, reqRes, distRes, pendingRes, completedRes] = await Promise.all([
          env.DB.prepare("SELECT count(*) as count FROM donors").first(),
          env.DB.prepare("SELECT count(*) as count FROM donors WHERE (is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) AND is_active = 1").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
          env.DB.prepare("SELECT count(DISTINCT district) as count FROM donors WHERE TRIM(district) != ''").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched')").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE LOWER(status) = 'fulfilled'").first()
        ]);
        const total_donors = donorsRes ? donorsRes.count : 0;
        const available_donors = availRes ? availRes.count : 0;
        const total_requests = reqRes ? reqRes.count : 0;

        const statsResponse = json({
          total_donors,
          totalDonors: total_donors,
          available_donors,
          availableDonors: available_donors,
          total_requests,
          totalRequests: total_requests,
          districts_count: distRes?.count || 0,
          districtsCount: distRes?.count || 0,
          completed_requests: completedRes?.count || 0,
          pending_requests: pendingRes?.count || 0
        }, 200, { 'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=30' });
        writePublicStatsCache(url.origin, ctx, statsResponse);
        return statsResponse;
      }

      if (path === "/api/donors/search") {
        return json({
          success: false,
          error: "রক্তদাতাদের ব্যক্তিগত তথ্যের সুরক্ষা ও গোপনীয়তার স্বার্থে উন্মুক্ত পাবলিক অনুসন্ধান বন্ধ রাখা হয়েছে। জরুরি রক্তের প্রয়োজনে দয়া করে সরাসরি রিকোয়েস্ট সাবমিট করুন।"
        }, 403);
      }

      if (path === "/api/donors/register" && method === "POST") {
        try {
          if (await isRateLimited(env, `donor-register:${ip}`, 5, 60)) return json({ error: "অনেকবার চেষ্টা করা হয়েছে। এক ঘণ্টা পরে আবার চেষ্টা করুন।" }, 429);
          const body = await request.json();
          const {
            name, blood_group, phone, district, thana, area, current_address, age, gender,
            last_donation_date, total_donations, captcha_token, captcha_answer,
            agreed_future_donation, agreed_data_save
          } = body;

          if (!captcha_token || !captcha_answer || !(await verifyCaptcha(env, captcha_token, captcha_answer))) {
            return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে সঠিক উত্তর দিন।" }, 400);
          }

          if (!name || !blood_group || !phone || !district || !String(current_address || '').trim()) {
            return json({ error: "সকল প্রয়োজনীয় তথ্য সঠিকভাবে পূরণ করুন।" }, 400);
          }

          const cleanPhone = normalizePhone(phone);
          if (!isValidPhone(cleanPhone)) {
            return json({ error: "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।" }, 400);
          }
          const existing = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
          if (existing) {
            return json({ error: "এই মোবাইল নম্বরটি দিয়ে ইতিমধ্যে ডোনার হিসেবে রেজিস্ট্রেশন করা আছে।" }, 409);
          }

          const stmt = env.DB.prepare(`
            INSERT INTO donors (
              name, blood_group, phone, district, thana, area, current_address, age, gender,
              last_donation_date, total_donations, is_available, is_active,
              agreed_future_donation, agreed_data_save
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
          `);

          await stmt.bind(
            name.trim().slice(0, 120),
            blood_group.trim().toUpperCase(),
            cleanPhone,
            district.trim().slice(0, 120),
            (thana || "").trim().slice(0, 120),
            (area || "").trim(),
            String(current_address).trim().slice(0, 300),
            parseInt(age, 10) || 25,
            gender || "Male",
            last_donation_date || null,
            parseInt(total_donations || "0", 10),
            agreed_future_donation ? 1 : 0,
            agreed_data_save ? 1 : 0
          ).run();

          invalidatePublicStatsCache(url.origin, ctx);
          return json({
            success: true,
            message: "অভিনন্দন! আপনার রক্তদাতা নিবন্ধন সফলভাবে সম্পন্ন হয়েছে।"
          });
        } catch (err) {
          return json({ error: "নিবন্ধন সম্পন্ন করা যায়নি: " + err.message }, 500);
        }
      }

      if (path === "/api/requests/create" && method === "POST") {
        try {
          if (await isRateLimited(env, `request-create:${ip}`, 10, 60)) return json({ error: "অনেকবার রিকোয়েস্ট করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।" }, 429);
          const body = await request.json();
          const {
            patient_name, blood_group, units, district, thana, needed_by,
            hospital_name, location, note, contact_phone, urgency,
            requester_name, requester_blood_group, requester_age, requester_gender,
            requester_district, requester_area, requester_current_address,
            hemoglobin, hemoglobin_unknown,
            captcha_token, captcha_answer, agreed_future_donation, agreed_data_save
          } = body;

          if (!captcha_token || !captcha_answer || !(await verifyCaptcha(env, captcha_token, captcha_answer))) {
            return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে সঠিক উত্তর দিন।" }, 400);
          }

          const normalizedHemoglobin = String(hemoglobin || '').trim().slice(0, 30);
          const isHemoglobinUnknown = Number(hemoglobin_unknown) === 1 || hemoglobin_unknown === true;
          const normalizedRequesterAddress = String(requester_current_address || '').trim().slice(0, 300);
          if (!patient_name || !blood_group || !district || !needed_by || !hospital_name || !contact_phone || !String(requester_name || '').trim() || !requester_blood_group || !requester_district || !requester_area || !normalizedRequesterAddress || (!normalizedHemoglobin && !isHemoglobinUnknown)) {
            return json({ error: "রোগী ও হাসপাতালের সকল প্রয়োজনীয় তথ্য পূরণ করুন।" }, 400);
          }

          const cleanPhone = normalizePhone(contact_phone);
          if (!isValidPhone(cleanPhone)) {
            return json({ error: "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।", code: "INVALID_PHONE" }, 400);
          }

          const recentRequest = await env.DB.prepare(
            "SELECT id, created_at FROM blood_requests WHERE contact_phone = ? AND created_at >= datetime('now', '-24 hours') ORDER BY created_at DESC LIMIT 1"
          ).bind(cleanPhone).first();
          if (recentRequest) {
            return json({
              error: "এই মোবাইল নম্বর থেকে গত ২৪ ঘণ্টায় একটি রক্তের আবেদন করা হয়েছে। ২৪ ঘণ্টা পূর্ণ হলে আবার আবেদন করতে পারবেন।",
              code: "REQUEST_COOLDOWN",
              last_request_id: recentRequest.id
            }, 429);
          }

          const requesterName = String(requester_name || '').trim().slice(0, 120);
          const requesterBloodGroup = String(requester_blood_group || '').trim().toUpperCase();
          const requesterDistrict = String(requester_district || district || 'রংপুর').trim().slice(0, 120);
          const requesterArea = String(requester_area || '').trim().slice(0, 120);
          const requesterGender = ['Male', 'Female', 'Other'].includes(requester_gender) ? requester_gender : 'Male';
          const requesterAge = Math.min(65, Math.max(18, parseInt(requester_age, 10) || 25));

          await env.DB.prepare(`
            INSERT OR IGNORE INTO donors (
              name, blood_group, phone, district, thana, area, current_address,
              age, gender, last_donation_date, total_donations, is_available, is_active,
              agreed_future_donation, agreed_data_save
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 1, 1, 1, 1)
          `).bind(
            requesterName,
            requesterBloodGroup,
            cleanPhone,
            requesterDistrict,
            requesterArea,
            requesterArea,
            normalizedRequesterAddress,
            requesterAge,
            requesterGender
          ).run();

          const insertReqStmt = env.DB.prepare(`
            INSERT INTO blood_requests (
              patient_name, blood_group, units, district, thana, hospital_name,
              location, contact_phone, urgency, needed_by, note, requester_name,
              status, requester_blood_group, requester_current_address, hemoglobin, hemoglobin_unknown
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)
          `);

          const reqInsertRes = await insertReqStmt.bind(
            patient_name.trim(),
            blood_group.trim().toUpperCase(),
            parseInt(units, 10) || 1,
            (district || "রংপুর").trim(),
            thana ? thana.trim() : "",
            hospital_name.trim(),
            location ? location.trim() : "",
            cleanPhone,
            urgency || "Urgent",
            needed_by.trim(),
            note ? note.trim() : "",
            requesterName,
            requesterBloodGroup || null,
            normalizedRequesterAddress,
            isHemoglobinUnknown ? null : normalizedHemoglobin,
            isHemoglobinUnknown ? 1 : 0
          ).run();

          const reqId = reqInsertRes.meta?.last_row_id || 1;

          const reqThana = thana ? thana.trim() : "";
          const reqDist = (district || "রংপুর").trim();

          const { results: matchedDonors } = await env.DB.prepare(`
            SELECT name, blood_group, district, thana, area, current_address, phone,
              (CASE 
                WHEN district = ? AND thana = ? AND ? != '' THEN 1
                WHEN district = ? THEN 2
                ELSE 3
              END) as proximity_tier
            FROM donors 
            WHERE REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND ((is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) AND is_active = 1)
            ORDER BY proximity_tier ASC, id DESC LIMIT 15
          `).bind(reqDist, reqThana, reqThana, reqDist, blood_group.trim().toUpperCase()).all();

          ctx.waitUntil(sendTelegramAlert(env, {
            id: reqId,
            blood_group: blood_group.trim().toUpperCase(),
            units: parseInt(units, 10) || 1,
            patient_name: patient_name.trim(),
            hospital_name: hospital_name.trim(),
            district: reqDist,
            location: location || "",
            thana: reqThana,
            needed_by: needed_by.trim(),
            requester_name: requesterName || "স্বজন",
            contact_phone: cleanPhone,
            requester_current_address: normalizedRequesterAddress,
            note: note || "",
            hemoglobin: isHemoglobinUnknown ? null : normalizedHemoglobin,
            hemoglobin_unknown: isHemoglobinUnknown ? 1 : 0
          }, matchedDonors || []));

          invalidatePublicStatsCache(url.origin, ctx);
          return json({
            success: true,
            message: "জরুরি রক্তের আবেদন সফলভাবে গৃহীত হয়েছে! রক্তদাতাদের দ্রুত নোটিফিকেশন পাঠানো হচ্ছে।",
            request_id: reqId
          });
        } catch (err) {
          return json({ error: "অনুরোধ পাঠানো যায়নি: " + err.message }, 500);
        }
      }

      if (path === "/api/admin/check-setup" && method === "GET") {
        const count = (await env.DB.prepare("SELECT COUNT(*) as c FROM admins").first())?.c || 0;
        return json({ needsSetup: count === 0 });
      }

      if (path === "/api/admin/setup" && method === "POST") {
        const count = (await env.DB.prepare("SELECT COUNT(*) as c FROM admins").first())?.c || 0;
        if (count > 0) {
          return json({ error: "অ্যাডমিন ইতিমধ্যে কনফিগার করা আছে। অনুগ্রহ করে লগইন করুন।" }, 400);
        }
        const { email, password, telegram_token, telegram_uids } = await request.json();
        if (!email || !password || password.length < 8) {
          return json({ error: "সঠিক ইমেইল ও কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
        }
        const salt = crypto.randomUUID().replace(/-/g, "");
        const hash = await hashPassword(password, salt);
        await env.DB.prepare(
          "INSERT INTO admins (email, password_hash, salt, role) VALUES (?, ?, ?, 'superadmin')"
        ).bind(email.trim().toLowerCase(), hash, salt).run();

        const token = crypto.randomUUID().replace(/-/g, "");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(
          "INSERT INTO sessions (token, admin_email, expires_at) VALUES (?, ?, ?)"
        ).bind(token, email.trim().toLowerCase(), expiresAt).run();
        await env.DB.batch([
          env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)").bind(String(telegram_token || '').trim()),
          env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)").bind(String(telegram_uids || '').trim()),
          env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)").bind(TELEGRAM_WEBHOOK_SECRET_KEY, env.TELEGRAM_WEBHOOK_SECRET || generateRandomToken(24))
        ]);

        return json({ success: true, token });
      }

      if (path === "/api/admin/login" && method === "POST") {
        const body = await request.json();
        const emailOrUser = (body.email || body.username || "").trim();
        const password = body.password || "";

        if (!emailOrUser || !password) {
          return json({ error: "ইমেইল এবং পাসওয়ার্ড দিন।" }, 400);
        }

        let user = await env.DB.prepare(
          "SELECT * FROM admins WHERE LOWER(email) = LOWER(?)"
        ).bind(emailOrUser).first();

        if (!user) {
          user = await env.DB.prepare(
            "SELECT * FROM admin_users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)"
          ).bind(emailOrUser, emailOrUser).first();
        }

        if (!user) {
          return json({ error: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।" }, 401);
        }

        let isMatch = false;

        try {
          if (user.salt) {
            const pbkdf2Hash = await hashPasswordPBKDF2(password, user.salt);
            if (pbkdf2Hash === user.password_hash) isMatch = true;
          }
        } catch (_) {}

        if (!isMatch && user.salt) {
          try {
            const sha256Hash = await hashPasswordSHA256(password, user.salt);
            if (sha256Hash === user.password_hash) isMatch = true;
          } catch (_) {}
        }

        if (!isMatch) {
          return json({ error: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।" }, 401);
        }

        const token = crypto.randomUUID().replace(/-/g, "");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO admin_sessions (admin_id, token, expires_at) VALUES (?, ?, ?)"
          ).bind(user.id, token, expiresAt).run();
        } catch (_) {}
        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO sessions (token, admin_email, expires_at) VALUES (?, ?, ?)"
          ).bind(token, user.email || emailOrUser, expiresAt).run();
        } catch (_) {}

        return json({
          success: true,
          token,
          user: { id: user.id, username: user.email || user.username, email: user.email, role: user.role || "superadmin" }
        }, 200, { 'Set-Cookie': `brybdpf_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800` });
      }

      if (path === "/api/admin/logout" && method === "POST") {
        const authHeader = request.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.substring(7).trim();
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
          await env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
        }
        return json({ success: true }, 200, { 'Set-Cookie': 'brybdpf_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
      }

      if (path.startsWith("/api/admin/")) {
        const admin = await getAuthenticatedAdmin(request, env);
        if (!admin) {
          return json({ error: "অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে লগইন করুন।" }, 401);
        }

        if (path === "/api/admin/data" && method === "GET") {
          const [donorsRes, availRes, reqRes, pendingRes, completedRes] = await Promise.all([
            env.DB.prepare("SELECT count(*) as count FROM donors").first(),
            env.DB.prepare("SELECT count(*) as count FROM donors WHERE (is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) AND is_active = 1").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched')").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE LOWER(status) = 'fulfilled'").first()
          ]);
          const { results: recentRequests } = await env.DB.prepare(
            "SELECT * FROM blood_requests ORDER BY id DESC LIMIT 10"
          ).all();
          const { results: recentDonors } = await env.DB.prepare(
            "SELECT * FROM donors ORDER BY id DESC LIMIT 10"
          ).all();

          const total_donors = donorsRes ? donorsRes.count : 0;
          const active_donors = availRes ? availRes.count : 0;
          const total_requests = reqRes ? reqRes.count : 0;
          const pending_requests = pendingRes ? pendingRes.count : 0;
          const completed_requests = completedRes ? completedRes.count : 0;

          return json({
            admin_email: admin.admin_email || admin.email || '',
            total_donors,
            active_donors,
            total_requests,
            pending_requests,
            stats: {
              total_donors,
              totalDonors: total_donors,
              available_donors: active_donors,
              availableDonors: active_donors,
              total_requests,
              totalRequests: total_requests,
              completed_requests,
              pending_requests
            },
            recentRequests: recentRequests || [],
            recentDonors: recentDonors || []
          });
        }

        if (path === "/api/admin/donors" && method === "GET") {
          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
          const offset = (page - 1) * limit;

          const bg = url.searchParams.get("blood_group");
          const dist = url.searchParams.get("district");
          const q = url.searchParams.get("search") || url.searchParams.get("q");

          let query = "SELECT * FROM donors WHERE 1=1";
          const params = [];

          if (bg && bg !== "ALL") { query += " AND REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '')"; params.push(bg); }
          if (dist && dist !== "ALL") { query += " AND district = ?"; params.push(dist); }
          if (q) { query += " AND (name LIKE ? OR phone LIKE ? OR area LIKE ?)"; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

          const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as c");
          const totalCount = (await env.DB.prepare(countQuery).bind(...params).first())?.c || 0;

          query += " ORDER BY id DESC LIMIT ? OFFSET ?";
          params.push(limit, offset);

          const { results: donors } = await env.DB.prepare(query).bind(...params).all();

          return json({
            donors: donors || [],
            total: totalCount,
            page,
            totalPages: Math.ceil(totalCount / limit)
          });
        }

        if (path.startsWith("/api/admin/donors/") && path.endsWith("/toggle") && method === "POST") {
          const donorId = path.split("/")[4];
          const donor = await env.DB.prepare("SELECT is_available, is_active FROM donors WHERE id = ?").bind(donorId).first();
          if (!donor) return json({ error: "ডোনার পাওয়া যায়নি" }, 404);

          const currentStatus = donor.is_active !== undefined ? donor.is_active : donor.is_available;
          const newStatus = currentStatus ? 0 : 1;
          await env.DB.prepare(
            "UPDATE donors SET is_available = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).bind(newStatus, newStatus, donorId).run();
          invalidatePublicStatsCache(url.origin, ctx);
          return json({ success: true, is_active: newStatus, is_available: newStatus });
        }

        if (path.startsWith("/api/admin/donors/") && method === "DELETE") {
          const donorId = path.split("/")[4];
          await env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(donorId).run();
          return json({ success: true });
        }

        if (path === "/api/admin/requests" && method === "GET") {
          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10) || 10));
          const offset = (page - 1) * limit;

          const days = parseInt(url.searchParams.get("days") || "0", 10);
          const status = url.searchParams.get("status");

          let query = "SELECT * FROM blood_requests WHERE 1=1";
          const params = [];

          if (days > 0) {
            query += " AND created_at >= datetime('now', '-' || ? || ' days')";
            params.push(days);
          }

          if (status && status !== "ALL") {
            query += " AND LOWER(status) = LOWER(?)";
            params.push(status);
          }

          const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as c");
          const totalCount = (await env.DB.prepare(countQuery).bind(...params).first())?.c || 0;

          query += " ORDER BY id DESC LIMIT ? OFFSET ?";
          params.push(limit, offset);

          const { results: requests } = await env.DB.prepare(query).bind(...params).all();

          return json({
            requests: requests || [],
            total: totalCount,
            page,
            totalPages: Math.ceil(totalCount / limit)
          });
        }

        if (path.startsWith("/api/admin/requests/") && path.endsWith("/match-donors") && method === "GET") {
          const parts = path.split("/");
          const reqId = parts[4];
          const reqItem = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(reqId).first();
          if (!reqItem) return json({ error: "অনুরোধ পাওয়া যায়নি" }, 404);

          const reqThana = reqItem.thana || "";
          const reqDist = (reqItem.district || "রংপুর").trim();

          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
          const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "15", 10) || 15));
          const offset = (page - 1) * limit;
          const where = "REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND ((is_available = 1 OR (next_available_date IS NOT NULL AND next_available_date <= date('now'))) AND is_active = 1)";
          const count = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM donors WHERE ${where}`).bind(reqItem.blood_group.trim().toUpperCase()).first())?.c || 0;
          const { results: donors } = await env.DB.prepare(`
            SELECT id, name, blood_group, district, thana, area, current_address, phone, age, last_donation_date, total_donations,
              (CASE WHEN district = ? AND thana = ? AND ? != '' THEN 1 WHEN district = ? THEN 2 ELSE 3 END) as proximity_tier
            FROM donors WHERE ${where}
            ORDER BY proximity_tier ASC, id DESC LIMIT ? OFFSET ?
          `).bind(reqDist, reqThana, reqThana, reqDist, reqItem.blood_group.trim().toUpperCase(), limit, offset).all();

          return json({ request: reqItem, donors: donors || [], total: count, page, totalPages: Math.max(1, Math.ceil(count / limit)) });
        }

        if (path.startsWith("/api/admin/requests/") && path.endsWith("/status") && method === "POST") {
          const reqId = path.split("/")[4];
          const { status } = await request.json();
          const allowedStatuses = new Set(['Pending', 'Matched', 'Fulfilled', 'Closed']);
          if (!allowedStatuses.has(status)) return json({ error: 'অবৈধ স্ট্যাটাস' }, 400);

          await env.DB.prepare(
            "UPDATE blood_requests SET status = ? WHERE id = ?"
          ).bind(status, reqId).run();
          invalidatePublicStatsCache(url.origin, ctx);

          return json({ success: true, status });
        }

        if (path === "/api/admin/settings" && method === "GET") {
          const { results: settings } = await env.DB.prepare("SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids')").all();
          const settingsMap = {};
          for (const item of (settings || [])) {
            if (item.key === 'telegram_bot_token') {
              const value = String(item.value || '');
              settingsMap.telegram_bot_token_masked = value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '';
            } else {
              settingsMap[item.key] = item.value;
            }
          }
          return json(settingsMap);
        }

        if (path === "/api/admin/settings" && method === "POST") {
          const data = await request.json();
          const allowedKeys = new Set(['telegram_bot_token', 'telegram_admin_uids']);
          for (const [key, value] of Object.entries(data)) {
            if (!allowedKeys.has(key)) continue;
            const existing = await env.DB.prepare("SELECT key FROM admin_settings WHERE key = ?").bind(key).first();
            if (existing) {
              await env.DB.prepare("UPDATE admin_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?").bind(String(value || ""), key).run();
            } else {
              await env.DB.prepare("INSERT INTO admin_settings (key, value) VALUES (?, ?)").bind(key, String(value || "")).run();
            }
          }

          if (data.telegram_bot_token) {
            try {
              const host = url.origin;
              const webhookUrl = `${host}/api/telegram/webhook`;
              const secretRow = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = ?").bind(TELEGRAM_WEBHOOK_SECRET_KEY).first();
              const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET || secretRow?.value || generateRandomToken(24);
              if (!secretRow?.value && !env.TELEGRAM_WEBHOOK_SECRET) {
                await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").bind(TELEGRAM_WEBHOOK_SECRET_KEY, webhookSecret).run();
              }
              await fetch(`https://api.telegram.org/bot${data.telegram_bot_token}/setWebhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: webhookUrl,
                  secret_token: webhookSecret,
                  drop_pending_updates: false,
                  allowed_updates: ["message", "callback_query"]
                })
              });
            } catch (e) { console.error('Telegram webhook setup failed', e); }
          }

          return json({ success: true, message: "সেটিংস সংরক্ষিত হয়েছে!" });
        }

        if (path === "/api/admin/change-password" && method === "POST") {
          const { current_password, new_password } = await request.json();
          if (!current_password || !new_password || new_password.length < 8) {
            return json({ error: "কমপক্ষে ৮ অক্ষরের নতুন পাসওয়ার্ড দিন।" }, 400);
          }

          const user = await env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(admin.id).first();
          if (!user) return json({ error: "ব্যবহারকারী পাওয়া যায়নি" }, 404);

          let isCurrentMatch = false;
          try {
            if (user.salt) {
              const pbkdf2Hash = await hashPasswordPBKDF2(current_password, user.salt);
              if (pbkdf2Hash === user.password_hash) isCurrentMatch = true;
            }
          } catch (_) {}

          if (!isCurrentMatch) {
            return json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" }, 400);
          }

          const newSalt = crypto.randomUUID().replace(/-/g, "");
          const newPasswordHash = await hashPasswordPBKDF2(new_password, newSalt);

          await env.DB.prepare(
            "UPDATE admins SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).bind(newPasswordHash, newSalt, admin.id).run();

          return json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!" });
        }

        if (path === "/api/admin/test-telegram" && method === "POST") {
          const tokenRes = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_bot_token'").first();
          if (!tokenRes?.value) return json({ success: false, error: "টেলিগ্রাম বট টোকেন কনফিগার করা নেই।" }, 400);
          const uidRow = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_admin_uids'").first();
          const testUids = parseTelegramAdminUids(uidRow?.value || env.TELEGRAM_ADMIN_IDS || '');
          if (!testUids.length) return json({ success: false, error: "কোনো বৈধ Telegram admin ID কনফিগার করা নেই। উদাহরণ: 7430012162" }, 400);
          const secretRow = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = ?").bind(TELEGRAM_WEBHOOK_SECRET_KEY).first();
          const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET || secretRow?.value || generateRandomToken(24);
          if (!secretRow?.value && !env.TELEGRAM_WEBHOOK_SECRET) {
            await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").bind(TELEGRAM_WEBHOOK_SECRET_KEY, webhookSecret).run();
          }
          const webhookResponse = await fetch(`https://api.telegram.org/bot${tokenRes.value}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: `${url.origin}/api/telegram/webhook`, secret_token: webhookSecret, drop_pending_updates: false, allowed_updates: ["message", "callback_query"] })
          });
          const webhookData = await webhookResponse.json().catch(() => ({}));
          const testRequest = {
            patient_name: "পরীক্ষামূলক রোগী",
            blood_group: "O+",
            units: 1,
            hospital_name: "রংপুর মেডিকেল কলেজ হাসপাতাল",
            district: "রংপুর",
            location: "মেডিকেল মোড়",
            contact_phone: "01700000000",
            needed_by: "জরুরি",
            note: "BRYBDPF টেলিগ্রাম বট টেস্ট সফল!"
          };
          const sampleDonors = [
            { name: "করিম হোসেন", blood_group: "O+", district: "রংপুর", area: "মেডিকেল মোড়", phone: "01711111111" }
          ];
          await sendTelegramAlert(env, testRequest, sampleDonors);
          return json({ success: true, recipients: testUids.length, webhook_configured: webhookData.ok === true, message: webhookData.ok === true ? `টেস্ট মেসেজ ${testUids.length} জন admin-কে পাঠানো হয়েছে এবং বটের বাটন/ওয়েবহুক সক্রিয় করা হয়েছে।` : `টেস্ট মেসেজ ${testUids.length} জন admin-কে পাঠানো হয়েছে, কিন্তু ওয়েবহুক সেটআপ ব্যর্থ হয়েছে।` });
        }
      }

      if (path === "/admin" || path === "/admin/" || path === "/admin.html") {
        if (env.ASSETS) {
          let assetRes = await env.ASSETS.fetch(new Request(`${url.origin}/admin`, request));
          if (assetRes.status >= 300 && assetRes.status < 400) {
            const loc = assetRes.headers.get("Location");
            if (loc) {
              const target = new URL(loc, url.origin);
              if (target.pathname !== "/admin" && target.pathname !== "/admin.html") {
                assetRes = await env.ASSETS.fetch(new Request(target, request));
              }
            }
          }
          if (assetRes.status === 200) {
            const h = new Headers(assetRes.headers);
            h.set("Content-Type", "text/html; charset=UTF-8");
            h.set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
            h.set("Pragma", "no-cache");
            h.set("Expires", "0");
            return new Response(assetRes.body, { status: 200, headers: h });
          }
        }
        return context.next();
      }
      return context.next();
    } catch (uncaughtError) {
      return new Response("Application Error: " + (uncaughtError.stack || uncaughtError.message), {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

}
