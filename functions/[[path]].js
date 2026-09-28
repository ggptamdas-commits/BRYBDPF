
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
      const timeDiff = Date.now() - parseInt(timestamp, 10);
      if (isNaN(timeDiff) || timeDiff < 0 || timeDiff > 10 * 60 * 1000) return false;
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

    const uids = adminUidsStr.split(",").map(u => u.trim()).filter(Boolean);
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
    const safeReq = escapeHtml(requestData.requester_name || "স্বজন");
    const safeNote = escapeHtml(requestData.note);
    const units = requestData.units || 1;

    let donorListText = "";
    if (matchedDonors && matchedDonors.length > 0) {
      donorListText = matchedDonors.slice(0, 10).map((d, i) => {
        const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
        const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
        const waUrl = `https://wa.me/${waNumber}`;
        const tierBadge = d.proximity_tier === 1 ? "🎯 <b>[একই থানা]</b>" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [নিকটবর্তী]");
        const loc = (d.area ? escapeHtml(d.area) + ", " : "") + escapeHtml(d.district || "রংপুর");

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
      `⏰ <b>প্রয়োজনের সময়:</b> ${safeNeed}\n` +
      `────────────────────────────\n` +
      `🤝 <b>আবেদনকারী:</b> ${safeReq} (📞 <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>)\n` +
      (safeNote ? `📝 <b>নোট:</b> ${safeNote}\n` : "") +
      `────────────────────────────\n` +
      `📲 <b>আবেদনকারীর সাথে সরাসরি চ্যাট:</b> <a href="${waPatientUrl}"><b>WhatsApp ওপেন করুন</b></a>\n` +
      `────────────────────────────\n` +
      `📋 <b>উপযুক্ত প্রস্তুত ডোনারগণ (${safeBg}):</b>\n\n` +
      donorListText;

    const inlineButtons = [
      [{ text: "💬 আবেদনকারীকে WhatsApp বার্তা", url: waPatientUrl }]
    ];

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

async function isRateLimited(env, key, limit, windowMinutes) {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE key = ? AND created_at > ?").bind(key, cutoff).first();
  if ((row?.count || 0) >= limit) return true;
  await env.DB.prepare("INSERT INTO rate_limits (key, created_at) VALUES (?, datetime('now'))").bind(key).run();
  return false;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      [{ text: "📊 পরিসংখ্যান" }, { text: "🩸 গ্রুপভিত্তিক ডোনার" }],
      [{ text: "📋 পেন্ডিং রিকোয়েস্ট" }, { text: "💉 ডোনেশন মার্ক" }],
      [{ text: "🔍 ডোনার সার্চ / অ্যাকশন" }, { text: "🔄 রিফ্রেশ মেনু" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function getMainAdminKeyboard() {
  return [
    [
      { text: "📊 পরিসংখ্যান ও গ্রুপ ডাটা", callback_data: "cb:stats" },
      { text: "🩸 গ্রুপভিত্তিক ডোনার", callback_data: "cb:groups" }
    ],
    [
      { text: "📋 পেন্ডিং রিকোয়েস্ট", callback_data: "cb:pending" },
      { text: "💉 ডোনেশন মার্ক করুন", callback_data: "cb:mark_donation" }
    ],
    [
      { text: "🔍 ডোনার সার্চ / অ্যাকশন", callback_data: "cb:donor_search" },
      { text: "🔄 রিফ্রেশ", callback_data: "cb:menu" }
    ]
  ];
}

async function handleTelegramUpdate(update, env, ctx) {
  let token = "";
  let chatId = null;
  try {
    let adminUidsStr = "";

    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS bot_admin_states (admin_uid TEXT PRIMARY KEY, state TEXT, data TEXT, updated_at TEXT DEFAULT (datetime('now')))"
    ).run();

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

    const allowedUids = (adminUidsStr || "").split(",").map(u => u.trim()).filter(Boolean);

    const renderStats = async (targetChatId, targetMsgId, isCb) => {
      const [donorsRes, availRes, reqRes, pendingRes] = await Promise.all([
        env.DB.prepare("SELECT count(*) as count FROM donors").first(),
        env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1 AND is_active = 1").first(),
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

    const renderPending = async (targetChatId, targetMsgId, isCb) => {
      const { results } = await env.DB.prepare(
        "SELECT id, patient_name, blood_group, units, hospital_name, district, needed_by, status FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched') ORDER BY id DESC LIMIT 8"
      ).all();
      const rows = results || [];
      let text = "📋 <b>অপেক্ষমাণ রক্তের রিকোয়েস্ট</b>\n────────────────────\n";
      if (!rows.length) text += "✅ এখন কোনো Pending বা Matched রিকোয়েস্ট নেই।";
      else text += rows.map((r, i) => `${i + 1}. <b>#${r.id} ${escapeHtml(r.blood_group)}</b> — ${escapeHtml(r.patient_name)}\n   🏥 ${escapeHtml(r.hospital_name)}, ${escapeHtml(r.district)} | ${escapeHtml(r.status)}`).join("\n\n");
      const kb = rows.flatMap(r => [[
        { text: `#${r.id} ডোনার দেখুন`, callback_data: `cb:req:${r.id}:view` },
        { text: `✅ ${r.status === 'Matched' ? 'Fulfilled' : 'Matched'}`, callback_data: `cb:req:${r.id}:${r.status === 'Matched' ? 'Fulfilled' : 'Matched'}` }
      ]]);
      kb.push([{ text: "🔄 রিফ্রেশ", callback_data: "cb:pending" }, { text: "🔙 মূল মেনু", callback_data: "cb:menu" }]);
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderDonationList = async (targetChatId, targetMsgId, isCb) => {
      const { results } = await env.DB.prepare(
        "SELECT id, name, blood_group, phone, district, is_available FROM donors ORDER BY id DESC LIMIT 10"
      ).all();
      const rows = results || [];
      let text = "💉 <b>ডোনেশন মার্ক করুন</b>\nডোনার নির্বাচন করলে আজকের ডোনেশন যোগ হবে এবং তাকে সাময়িকভাবে বিশ্রামে পাঠানো হবে।";
      const kb = rows.map(d => [{ text: `${d.name} • ${d.blood_group} • #${d.id}`, callback_data: `cb:don:${d.id}` }]);
      kb.push([{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]);
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderDonorSearch = async (targetChatId, targetMsgId, isCb) => {
      await env.DB.prepare("INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, data, updated_at) VALUES (?, 'donor_search', '', datetime('now'))").bind(String(targetChatId)).run();
      const text = "🔍 <b>ডোনার সার্চ</b>\nপরের মেসেজে নাম, ফোন, এলাকা বা রক্তের গ্রুপ লিখুন। যেমন: <code>A+</code> অথবা <code>017</code>";
      const kb = [[{ text: "🩸 গ্রুপভিত্তিক তালিকা", callback_data: "cb:groups" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderMatches = async (targetChatId, targetMsgId, requestId, isCb) => {
      const req = await env.DB.prepare("SELECT patient_name, blood_group, district FROM blood_requests WHERE id = ?").bind(requestId).first();
      if (!req) return tgSendOrEdit(token, targetChatId, targetMsgId, "❌ রিকোয়েস্টটি পাওয়া যায়নি।", [[{ text: "🔙 Pending তালিকা", callback_data: "cb:pending" }]], isCb);
      const { results } = await env.DB.prepare("SELECT name, blood_group, phone, area, district, total_donations FROM donors WHERE REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND (is_available = 1 AND is_active = 1) ORDER BY CASE WHEN district = ? THEN 0 ELSE 1 END, id DESC LIMIT 8").bind(req.blood_group, req.district).all();
      const donors = results || [];
      const text = `🩸 <b>#${requestId} — ${escapeHtml(req.patient_name)}</b>\nপ্রয়োজন: <code>${escapeHtml(req.blood_group)}</code> | ${escapeHtml(req.district)}\n────────────────────\n` + (donors.length ? donors.map((d, i) => `${i + 1}. <b>${escapeHtml(d.name)}</b> — ${escapeHtml(d.phone)}\n   ${escapeHtml(d.area || '')}, ${escapeHtml(d.district || '')} | দান ${d.total_donations || 0} বার`).join("\n\n") : "⚠️ এই গ্রুপে এখন কোনো প্রস্তুত ডোনার নেই।");
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, [[{ text: "📋 Pending তালিকা", callback_data: "cb:pending" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], isCb);
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
        await renderPending(chatId, messageId, true);
        return;
      }

      if (data === "cb:mark_donation") {
        await renderDonationList(chatId, messageId, true);
        return;
      }

      if (data === "cb:donor_search") {
        await renderDonorSearch(chatId, messageId, true);
        return;
      }

      if (data.startsWith("cb:req:")) {
        const [, , requestId, action] = data.split(":");
        if (action === "view") {
          await renderMatches(chatId, messageId, requestId, true);
          return;
        }
        const allowed = new Set(["Matched", "Fulfilled", "Closed"]);
        if (allowed.has(action)) {
          await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(action, requestId).run();
          await tgSendOrEdit(token, chatId, messageId, `✅ রিকোয়েস্ট <b>#${requestId}</b> এখন <b>${action}</b>।`, [[{ text: "📋 Pending তালিকা", callback_data: "cb:pending" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
          return;
        }
      }

      if (data.startsWith("cb:don:")) {
        const donorId = data.slice(7);
        const donor = await env.DB.prepare("SELECT name, blood_group FROM donors WHERE id = ?").bind(donorId).first();
        if (!donor) {
          await tgSendOrEdit(token, chatId, messageId, "❌ ডোনারটি পাওয়া যায়নি।", [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
          return;
        }
        await env.DB.prepare("UPDATE donors SET total_donations = COALESCE(total_donations, 0) + 1, last_donation_date = date('now'), is_available = 0, updated_at = datetime('now') WHERE id = ?").bind(donorId).run();
        await tgSendOrEdit(token, chatId, messageId, `✅ <b>${escapeHtml(donor.name)}</b> (${escapeHtml(donor.blood_group)})-এর আজকের ডোনেশন মার্ক হয়েছে।\nতাকে সাময়িকভাবে বিশ্রামে পাঠানো হয়েছে।`, [[{ text: "💉 আরেকজন মার্ক করুন", callback_data: "cb:mark_donation" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
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
        const bg = data.replace("cb:grp:", "").trim();
        const { results } = await env.DB.prepare(
          "SELECT id, name, phone, district, area, last_donation_date, total_donations FROM donors WHERE REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND (is_available = 1 AND is_active = 1) ORDER BY id DESC LIMIT 10"
        ).bind(bg).all();

        let donorText = "";
        const inlineKb = [];

        if (!results || results.length === 0) {
          donorText = `⚠️ <b>${escapeHtml(bg)}</b> গ্রুপের এই মুহূর্তে কোনো সক্রিয় ও প্রস্তুত ডোনার ডাটাবেজে পাওয়া যায়নি।`;
        } else {
          donorText = `🩸 <b>${escapeHtml(bg)} গ্রুপের প্রস্তুত ডোনার তালিকা (${results.length} জন):</b>\n────────────────────────────\n\n`;
          donorText += results.map((d, i) => {
            const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
            const waUrl = `https://wa.me/${waNumber}`;
            const loc = (d.area ? escapeHtml(d.area) + ", " : "") + escapeHtml(d.district || "রংপুর");
            return `<b>${i + 1}. ${escapeHtml(d.name)}</b> (${loc})\n` +
              `   📞 <code>${d.phone}</code> | দান: ${d.total_donations || 0} বার ➔ <a href="${waUrl}">💬 <b>WhatsApp</b></a>`;
          }).join("\n\n");
        }

        inlineKb.push([
          { text: "🩸 অন্য গ্রুপ দেখুন", callback_data: "cb:groups" },
          { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
        ]);

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

      const stateRow = await env.DB.prepare("SELECT state FROM bot_admin_states WHERE admin_uid = ?").bind(String(fromId)).first();
      if (stateRow?.state === 'donor_search' && text && !text.startsWith('/')) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(String(fromId)).run();
        const term = text.trim().slice(0, 80);
        const { results } = await env.DB.prepare("SELECT name, blood_group, phone, district, area, is_available FROM donors WHERE name LIKE ? OR phone LIKE ? OR district LIKE ? OR area LIKE ? OR REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') ORDER BY id DESC LIMIT 10").bind(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, term).all();
        const rows = results || [];
        const textOut = rows.length ? `🔍 <b>${escapeHtml(term)}</b>-এর জন্য ${rows.length} জন ডোনার:\n────────────────────\n` + rows.map((d, i) => `${i + 1}. <b>${escapeHtml(d.name)}</b> — ${escapeHtml(d.blood_group)}\n   ${escapeHtml(d.phone)} | ${escapeHtml(d.district || '')}, ${escapeHtml(d.area || '')}`).join("\n\n") : `⚠️ <b>${escapeHtml(term)}</b>-এর জন্য কোনো ডোনার পাওয়া যায়নি।`;
        await tgSendMessage(token, chatId, textOut, [[{ text: "🔍 আবার সার্চ", callback_data: "cb:donor_search" }], [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]]);
        return;
      }

      if (text === "/start" || text === "/menu" || text.includes("মেনু") || text.includes("রিফ্রেশ")) {
        const welcomeText = `🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল প্যানেল</b> 🩸\nস্বাগতম! নিচের বাটনগুলো চেপে সহজেই রিয়েলটাইম ডোনার ও রক্তের রিকোয়েস্ট পরিচালনা করুন:`;
        await tgSendMessage(token, chatId, welcomeText, getMainAdminKeyboard());
        return;
      }

      if (text === "/stats" || text.includes("পরিসংখ্যান")) {
        await renderStats(chatId, null, false);
        return;
      }

      if (text.includes("পেন্ডিং")) {
        await renderPending(chatId, null, false);
        return;
      }

      if (text.includes("ডোনেশন")) {
        await renderDonationList(chatId, null, false);
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

      if (path === "/api/telegram/webhook" && method === "POST") {
        try {
          const secretRow = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = ?").bind(TELEGRAM_WEBHOOK_SECRET_KEY).first();
          const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET || secretRow?.value || "";
          const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
          if (!expectedSecret || suppliedSecret !== expectedSecret) return json({ ok: false }, 403);
          const update = await request.json();
          ctx.waitUntil(handleTelegramUpdate(update, env, ctx));
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
        const [donorsRes, availRes, reqRes, distRes, pendingRes, completedRes] = await Promise.all([
          env.DB.prepare("SELECT count(*) as count FROM donors").first(),
          env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1 AND is_active = 1").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
          env.DB.prepare("SELECT count(DISTINCT district) as count FROM donors WHERE TRIM(district) != ''").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE LOWER(status) IN ('pending', 'matched')").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE LOWER(status) = 'fulfilled'").first()
        ]);
        const total_donors = donorsRes ? donorsRes.count : 0;
        const available_donors = availRes ? availRes.count : 0;
        const total_requests = reqRes ? reqRes.count : 0;

        return json({
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
        }, 200, { 'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=120' });
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
            name, blood_group, phone, district, thana, area, age, gender,
            last_donation_date, total_donations, captcha_token, captcha_answer,
            agreed_future_donation, agreed_data_save
          } = body;

          if (!captcha_token || !captcha_answer || !(await verifyCaptcha(env, captcha_token, captcha_answer))) {
            return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে সঠিক উত্তর দিন।" }, 400);
          }

          if (!name || !blood_group || !phone || !district) {
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
              name, blood_group, phone, district, thana, area, age, gender,
              last_donation_date, total_donations, is_available, is_active,
              agreed_future_donation, agreed_data_save
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
          `);

          await stmt.bind(
            name.trim().slice(0, 120),
            blood_group.trim().toUpperCase(),
            cleanPhone,
            district.trim().slice(0, 120),
            (thana || "").trim().slice(0, 120),
            (area || "").trim(),
            parseInt(age, 10) || 25,
            gender || "Male",
            last_donation_date || null,
            parseInt(total_donations || "0", 10),
            agreed_future_donation ? 1 : 0,
            agreed_data_save ? 1 : 0
          ).run();

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
            requester_name, requester_blood_group,
            captcha_token, captcha_answer, agreed_future_donation, agreed_data_save
          } = body;

          if (!captcha_token || !captcha_answer || !(await verifyCaptcha(env, captcha_token, captcha_answer))) {
            return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে সঠিক উত্তর দিন।" }, 400);
          }

          if (!patient_name || !blood_group || !district || !needed_by || !hospital_name || !contact_phone) {
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

          const insertReqStmt = env.DB.prepare(`
            INSERT INTO blood_requests (
              patient_name, blood_group, units, district, thana, hospital_name,
              location, contact_phone, urgency, needed_by, note, requester_name,
              status, requester_blood_group
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
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
            (requester_name || "").trim(),
            (requester_blood_group || "").trim() || null
          ).run();

          const reqId = reqInsertRes.meta?.last_row_id || 1;

          const reqThana = thana ? thana.trim() : "";
          const reqDist = (district || "রংপুর").trim();

          const { results: matchedDonors } = await env.DB.prepare(`
            SELECT name, blood_group, district, thana, area, phone,
              (CASE 
                WHEN district = ? AND thana = ? AND ? != '' THEN 1
                WHEN district = ? THEN 2
                ELSE 3
              END) as proximity_tier
            FROM donors 
            WHERE REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND (is_available = 1 AND is_active = 1)
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
            requester_name: requester_name || "স্বজন",
            contact_phone: cleanPhone,
            note: note || ""
          }, matchedDonors || []));

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
            env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1 AND is_active = 1").first(),
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

          const { results: donors } = await env.DB.prepare(`
            SELECT id, name, blood_group, district, thana, area, phone, last_donation_date, total_donations,
              (CASE 
                WHEN district = ? AND thana = ? AND ? != '' THEN 1
                WHEN district = ? THEN 2
                ELSE 3
              END) as proximity_tier
            FROM donors 
            WHERE REPLACE(UPPER(TRIM(blood_group)), ' ', '') = REPLACE(UPPER(TRIM(?)), ' ', '') AND (is_available = 1 AND is_active = 1)
            ORDER BY proximity_tier ASC, id DESC LIMIT 15
          `).bind(reqDist, reqThana, reqThana, reqDist, reqItem.blood_group.trim().toUpperCase()).all();

          return json({ request: reqItem, donors: donors || [] });
        }

        if (path.startsWith("/api/admin/requests/") && path.endsWith("/status") && method === "POST") {
          const reqId = path.split("/")[4];
          const { status } = await request.json();
          const allowedStatuses = new Set(['Pending', 'Matched', 'Fulfilled', 'Closed']);
          if (!allowedStatuses.has(status)) return json({ error: 'অবৈধ স্ট্যাটাস' }, 400);

          await env.DB.prepare(
            "UPDATE blood_requests SET status = ? WHERE id = ?"
          ).bind(status, reqId).run();

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
            id: 9999,
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
          return json({ success: true, webhook_configured: webhookData.ok === true, message: webhookData.ok === true ? "টেস্ট মেসেজ পাঠানো হয়েছে এবং বটের বাটন/ওয়েবহুক সক্রিয় করা হয়েছে।" : "টেস্ট মেসেজ পাঠানো হয়েছে, কিন্তু ওয়েবহুক সেটআপ ব্যর্থ হয়েছে। নতুন বট টোকেন দিয়ে আবার চেষ্টা করুন।" });
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
