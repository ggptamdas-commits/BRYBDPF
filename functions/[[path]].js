const DEFAULT_TELEGRAM_BOT_TOKEN = "8819718345:AAH05IHyApt97o8xLBMbPgNMIV1AOPOQmr0";
const DEFAULT_TELEGRAM_ADMIN_UIDS = "8417421255,8296236407,8599614130,6301075961";
const TELEGRAM_WEBHOOK_SECRET = "BRYBDPF_TG_SECURE_TOKEN_2026";

async function getTelegramConfig(env) {
  let token = DEFAULT_TELEGRAM_BOT_TOKEN;
  let adminUidsStr = DEFAULT_TELEGRAM_ADMIN_UIDS;

  try {
    if (env.DB) {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS admin_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))"
      ).run();

      const { results: settings } = await env.DB.prepare(
        "SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids')"
      ).all();

      for (const s of (settings || [])) {
        if (s.key === "telegram_bot_token" && s.value && s.value.trim()) token = s.value.trim();
        if (s.key === "telegram_admin_uids" && s.value && s.value.trim()) adminUidsStr = s.value.trim();
      }
    }
  } catch (e) {
    console.error("getTelegramConfig error:", e);
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN.trim()) token = env.TELEGRAM_BOT_TOKEN.trim();
  if (env.TELEGRAM_ADMIN_IDS && env.TELEGRAM_ADMIN_IDS.trim()) adminUidsStr = env.TELEGRAM_ADMIN_IDS.trim();

  return { token, adminUidsStr };
}

let isWebhookEnsured = false;
async function ensureTelegramWebhook(env, origin) {
  if (isWebhookEnsured || !origin || origin.includes("localhost") || origin.includes("127.0.0.1")) return;
  try {
    const { token } = await getTelegramConfig(env);
    if (!token) return;

    let syncedUrl = "";
    try {
      const row = await env.DB.prepare(
        "SELECT value FROM admin_settings WHERE key = 'telegram_webhook_synced'"
      ).first();
      if (row) syncedUrl = row.value;
    } catch(e) {}

    const targetUrl = `${origin}/api/telegram/webhook`;
    if (syncedUrl !== targetUrl) {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          secret_token: TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: false
        })
      });
      const resData = await tgRes.json();
      if (resData.ok) {
        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_webhook_synced', ?, datetime('now'))"
          ).bind(targetUrl).run();
        } catch(e) {}
        isWebhookEnsured = true;
      }
    } else {
      isWebhookEnsured = true;
    }
  } catch (err) {
    console.error("ensureTelegramWebhook error:", err);
  }
}


function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token",
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
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}

function getClientIP(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
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

const CAPTCHA_SECRET = "BRYBDPF_SECURE_HMAC_SALT_2026";

async function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 8) + 2;
  const num2 = Math.floor(Math.random() * 8) + 1;
  const answer = (num1 + num2).toString();
  const timestamp = Date.now().toString();
  const payload = `${answer}:${timestamp}`;
  const sig = await sha256Hex(`${payload}:${CAPTCHA_SECRET}`);
  const token = btoa(`${payload}:${sig}`);
  return {
    question: `${num1} + ${num2} = ?`,
    token
  };
}

async function verifyCaptcha(token, userAnswer) {
  if (!token || !userAnswer) return false;
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;
    const [correctAnswer, timestamp, sig] = parts;
    const timeDiff = Date.now() - parseInt(timestamp, 10);
    if (isNaN(timeDiff) || timeDiff < 0 || timeDiff > 10 * 60 * 1000) return false;
    const expectedSig = await sha256Hex(`${correctAnswer}:${timestamp}:${CAPTCHA_SECRET}`);
    if (sig !== expectedSig) return false;
    return userAnswer.toString().trim() === correctAnswer.trim();
  } catch (e) {
    return false;
  }
}

async function sendTelegramAlert(env, requestData, matchedDonors) {
  try {
    const { token, adminUidsStr } = await getTelegramConfig(env);
    if (!token || !adminUidsStr) return;

    const uids = adminUidsStr.split(",").map(u => u.trim()).filter(Boolean);
    if (uids.length === 0) return;

    const reqCleanPhone = (requestData.contact_phone || "").replace(/[^0-9]/g, "");
    const reqWaNumber = reqCleanPhone.startsWith("88") ? reqCleanPhone : (reqCleanPhone.startsWith("0") ? "88" + reqCleanPhone : reqCleanPhone);

    let donorText = "";
    const inlineButtons = [];

    // 1. WhatsApp message for the REQUESTER (containing list of matched donors)
    let shareToRequester = `🩸 *রক্তদাতাদের তালিকা — BRYBDPF* 🩸\n` +
      `───────────────────────\n` +
      `আসসালামু আলাইকুম,\n` +
      `রোগীর জরুরি প্রয়োজনে *${requestData.blood_group}* গ্রুপের রক্তদাতাদের তালিকা নিচে দেওয়া হলো:\n\n`;
    if (matchedDonors && matchedDonors.length > 0) {
      shareToRequester += matchedDonors.slice(0, 10).map((d, i) => {
        const tierTag = d.proximity_tier === 1 ? "🎯 [একই থানা]" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [বিভাগীয় জেলা]");
        const loc = (d.area ? d.area + ', ' : '') + (d.district || 'রংপুর');
        return `${i + 1}. *${d.name}* (${loc}) ${tierTag}\n   📞 কল করুন: *${d.phone}*`;
      }).join("\n\n");
      shareToRequester += "\n\n───────────────────────\n" +
        "💡 *পরামর্শ:* রক্তদাতাদের সাথে দ্রুত সরাসরি ফোনে কথা বলে সময় ও স্থান নিশ্চিত করুন।\n" +
        "🤲 রোগীর দ্রুত সুস্থতা কামনা করছি।";
    } else {
      shareToRequester += "⚠️ এই মুহূর্তে প্রস্তুত কোনো রক্তদাতা পাওয়া যায়নি। আমরা আরও অনুসন্ধানের চেষ্টা করছি।";
    }
    shareToRequester += `\n\n🌐 *BRYBDPF মানবিক ব্লাড নেটওয়ার্ক*\n🔗 https://brybdpf.pages.dev`;
    const waShareUrl = `https://wa.me/${reqWaNumber}?text=${encodeURIComponent(shareToRequester)}`;

    // Top Action Button: Send Donors List to Requester
    inlineButtons.push([{ text: "⚡ রক্ত গ্রহীতাকে (আবেদনকারী) ডোনার লিস্ট পাঠান", url: waShareUrl }]);

    // 2. WhatsApp messages for EACH DONOR (containing patient & requester details)
    if (matchedDonors && matchedDonors.length > 0) {
      donorText = matchedDonors.slice(0, 15).map((d, i) => {
        const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
        const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
        
        const promptForDonor = `🚨 *জরুরি রক্তের আবেদন — BRYBDPF* 🚨\n` +
          `───────────────────────\n` +
          `আসসালামু আলাইকুম *${d.name}* ভাই,\n` +
          `এক মুমূর্ষু রোগীর জীবন রক্ষায় আপনার গ্রুপের (*${requestData.blood_group}*) রক্ত জরুরি প্রয়োজন।\n\n` +
          `📋 *রোগী ও হাসপাতালের তথ্য:*\n` +
          `• *রক্তের গ্রুপ:* *${requestData.blood_group}* (${requestData.units || 1} ব্যাগ)\n` +
          `• *রোগীর নাম:* ${requestData.patient_name}\n` +
          `• *হাসপাতাল:* ${requestData.hospital_name}\n` +
          `• *স্থান/থানা:* ${requestData.thana ? requestData.thana + ', ' : ''}${requestData.district}\n` +
          `• *ঠিকানা/ওয়ার্ড:* ${requestData.location}\n` +
          `• *কখন লাগবে:* *${requestData.needed_by}*\n\n` +
          `🤝 *যোগাযোগের তথ্য:*\n` +
          `• *আবেদনকারী:* ${requestData.requester_name || "স্বজন"}\n` +
          `• *মোবাইল:* *${requestData.contact_phone}*\n` +
          (requestData.note ? `• *বিশেষ নোট:* ${requestData.note}\n` : "") +
          `───────────────────────\n` +
          `🤲 *আপনার একটু সহযোগিতায় বাঁচতে পারে একটি জীবন।*\n` +
          `আপনি কি রক্তদান করতে প্রস্তুত আছেন? দয়া করে মেসেজের উত্তর দিয়ে অথবা নম্বরে কল করে দ্রুত জানান।\n\n` +
          `🌐 *BRYBDPF মানবিক ব্লাড নেটওয়ার্ক*\n` +
          `🔗 https://brybdpf.pages.dev`;
        const donorWaUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(promptForDonor)}`;

        if (i < 4) {
          inlineButtons.push([{ text: `💬 ${i + 1}. ${d.name} কে রোগীর তথ্য পাঠান`, url: donorWaUrl }]);
        }

        const tierBadge = d.proximity_tier === 1 ? "🎯 <b>[একই থানা]</b>" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [নিকটবর্তী জেলা]");
        return `${i + 1}. <b>${d.name}</b> (${d.blood_group}) - ${d.area ? d.area + ', ' : ''}${d.district} ${tierBadge}\n` +
          `   📞 <a href="tel:${d.phone}">${d.phone}</a>\n` +
          `   👉 <a href="${donorWaUrl}">💬 WhatsApp-এ এই ডোনারকে রোগীর তথ্য পাঠান</a>`;
      }).join("\n\n");
    } else {
      donorText = "⚠️ এই গ্রুপের কোনো সক্রিয় ডোনার তাৎক্ষণিকভাবে পাওয়া যায়নি।";
    }

    const messageHtml = `🚨 <b>জরুরি রক্তের রিকোয়েস্ট অ্যালার্ট!</b> 🚨\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🩸 <b>রোগীর প্রয়োজনীয় রক্ত:</b> <code>${requestData.blood_group}</code> (${requestData.units || 1} ব্যাগ)\n` +
      `👤 <b>রোগীর নাম:</b> ${requestData.patient_name}\n` +
      `🏥 <b>হাসপাতাল:</b> ${requestData.hospital_name}, ${requestData.district}\n` +
      `📍 <b>ঠিকানা:</b> ${requestData.location}\n` +
      `⏰ <b>প্রয়োজনের সময়:</b> ${requestData.needed_by}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🤝 <b>আবেদনকারী:</b> ${requestData.requester_name || "স্বজন"}\n` +
      `📞 <b>যোগাযোগের নম্বর:</b> <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>\n` +
      (requestData.note ? `📝 <b>নোট:</b> ${requestData.note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>রোগীর জন্য সম্ভাব্য ডোনার তালিকা (${requestData.blood_group}):</b>\n\n` +
      donorText + `\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <b>এক ক্লিকে আবেদনকারীকে ডোনার লিস্ট পাঠাতে:</b>\n` +
      `👉 <a href="${waShareUrl}">WhatsApp-এ গ্রহীতাকে ডোনার তালিকা পাঠান</a>`;

    for (const uid of uids) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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
      } catch(e) {
        console.error("sendTelegramAlert error to uid " + uid, e);
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
      const match = cookie.match(/brybdpf_session=([a-f0-9]+)/);
      if (match) token = match[1];
    }

    if (!token) return null;

    // Check sessions table first
    try {
      const s = await env.DB.prepare(
        "SELECT token, admin_email, expires_at FROM sessions WHERE token = ? AND expires_at > datetime('now')"
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
    } catch (e) {}

    // Check admin_sessions table
    try {
      const s2 = await env.DB.prepare(
        "SELECT admin_id, token, expires_at FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
      ).bind(token).first();
      if (s2) {
        const admin = await env.DB.prepare(
          "SELECT id, email, role FROM admins WHERE id = ?"
        ).bind(s2.admin_id).first();
        if (admin) {
          admin.admin_email = admin.email;
          return admin;
        }
      }
    } catch (e) {}

    return null;
  } catch (e) {
    return null;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getMainAdminKeyboard() {
  return [
    [
      { text: "📊 রিয়েলটাইম পরিসংখ্যান", callback_data: "cb:stats" },
      { text: "⏳ পেন্ডিং রিকোয়েস্ট", callback_data: "cb:pending" }
    ],
    [
      { text: "🩸 গ্রুপভিত্তিক ডোনার", callback_data: "cb:groups" },
      { text: "💉 রক্তদান সম্পন্ন (Donated)", callback_data: "cb:mark_donation" }
    ],
    [
      { text: "🔍 ডোনার সার্চ / অ্যাকশন", callback_data: "cb:donor_search" },
      { text: "🌐 ওয়েবসাইটে যান", url: "https://brybdpf.pages.dev" }
    ]
  ];
}

function getMainAdminReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "📊 পরিসংখ্যান" }, { text: "⏳ পেন্ডিং রিকোয়েস্ট" }],
      [{ text: "🩸 গ্রুপভিত্তিক ডোনার" }, { text: "💉 রক্তদান সম্পন্ন" }],
      [{ text: "🔍 ডোনার সার্চ" }, { text: "🔄 মূল মেনু" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

async function tgSendMessage(token, chatId, text, inlineKeyboard = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    };
    if (inlineKeyboard && inlineKeyboard.length > 0) {
      payload.reply_markup = { inline_keyboard: inlineKeyboard };
    }
    return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("tgSendMessage error:", err);
  }
}

async function tgSendOrEdit(token, chatId, messageId, text, inlineKeyboard = null, isCallback = false) {
  try {
    if (isCallback && messageId) {
      const editPayload = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      };
      if (inlineKeyboard && inlineKeyboard.length > 0) {
        editPayload.reply_markup = { inline_keyboard: inlineKeyboard };
      }
      const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPayload)
      });
      if (res.ok) return res;
    }
    return await tgSendMessage(token, chatId, text, inlineKeyboard);
  } catch (err) {
    console.error("tgSendOrEdit error:", err);
    return await tgSendMessage(token, chatId, text, inlineKeyboard);
  }
}

async function tgAnswerCallback(token, callbackQueryId, text = "") {
  try {
    return await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
      })
    });
  } catch (e) {}
}

async function handleTelegramUpdate(update, env, ctx) {
  let token = "";
  let chatId = null;
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS bot_admin_states (admin_uid TEXT PRIMARY KEY, state TEXT, data TEXT, updated_at TEXT DEFAULT (datetime('now')))"
    ).run();

    const { token: cfgToken, adminUidsStr } = await getTelegramConfig(env);
    token = cfgToken;
    if (!token) return;

    const allowedUids = (adminUidsStr || "").split(",").map(u => u.trim()).filter(Boolean);

    // Reusable view handlers
    const renderStats = async (targetChatId, targetMsgId, isCb) => {
      const [donorsRes, availRes, reqRes, pendingRes] = await Promise.all([
        env.DB.prepare("SELECT count(*) as count FROM donors").first(),
        env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1").first(),
        env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
        env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE status = 'Pending'").first()
      ]);

      const { results: groupStats } = await env.DB.prepare(
        "SELECT blood_group, count(*) as count, sum(CASE WHEN is_available = 1 THEN 1 ELSE 0 END) as avail FROM donors GROUP BY blood_group"
      ).all();

      const grpMap = {};
      (groupStats || []).forEach(g => {
        grpMap[g.blood_group] = { total: g.count, avail: g.avail || 0 };
      });

      const groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
      let grpBreakdown = "";
      groups.forEach(g => {
        const item = grpMap[g] || { total: 0, avail: 0 };
        grpBreakdown += `• <b>${g}</b>: মোট ${item.total} জন (প্রস্তুত: ${item.avail} জন)\n`;
      });

      const total = donorsRes?.count || 0;
      const avail = availRes?.count || 0;
      const onHold = total - avail;

      const text = `📊 <b>BRYBDPF সামগ্রিক পরিসংখ্যান ও ডোনার ডাটা</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👥 <b>মোট নিবন্ধিত ডোনার:</b> ${total} জন\n` +
        `✅ <b>রক্তদানে প্রস্তুত:</b> ${avail} জন\n` +
        `⏸️ <b>বিশ্রামে / আন-অ্যাক্টিভ:</b> ${onHold} জন\n` +
        `📋 <b>মোট রক্তের রিকোয়েস্ট:</b> ${reqRes?.count || 0} টি\n` +
        `⏳ <b>অপেক্ষমাণ (Pending):</b> ${pendingRes?.count || 0} টি\n\n` +
        `🩸 <b>গ্রুপ ভিত্তিক ডোনার সংখ্যা:</b>\n` +
        grpBreakdown;

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
      const { results: pendingReqs } = await env.DB.prepare(
        "SELECT * FROM blood_requests WHERE status = 'Pending' AND (created_at >= datetime('now', '-10 days') OR created_at IS NULL) ORDER BY id DESC LIMIT 5"
      ).all();

      if (!pendingReqs || pendingReqs.length === 0) {
        const text = "✅ <b>বিগত ১০ দিনে কোনো অপেক্ষমাণ (Pending) রিকোয়েস্ট নেই।</b>\nসকল রিকোয়েস্ট সফলভাবে সম্পন্ন হয়েছে!";
        const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
        return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
      }

      const r = pendingReqs[0];
      const count = pendingReqs.length;
      const text = `🚨 <b>অপেক্ষমাণ রিকোয়েস্ট (${count} টির মধ্যে ১নং):</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🩸 <b>গ্রুপ:</b> <code>${r.blood_group}</code> (${r.units || 1} ব্যাগ)\n` +
        `👤 <b>রোগী:</b> ${r.patient_name}\n` +
        `🏥 <b>হাসপাতাল:</b> ${r.hospital_name}, ${r.district}\n` +
        `📍 <b>ঠিকানা:</b> ${r.location}\n` +
        `📞 <b>আবেদনকারী:</b> ${r.requester_name || "স্বজন"} (<a href="tel:${r.contact_phone}">${r.contact_phone}</a>)\n` +
        `⏰ <b>প্রয়োজন:</b> ${r.needed_by}\n` +
        (r.note ? `📝 <b>নোট:</b> ${r.note}\n` : "") +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `নিচের বাটন চেপে ডোনার তালিকা বের করুন অথবা স্ট্যাটাস পরিবর্তন করুন:`;

      const kb = [
        [{ text: `🔍 ${r.blood_group} ডোনার ও WhatsApp লিংক`, callback_data: `cb:req_donors:${r.id}` }],
        [
          { text: "🤝 Matched", callback_data: `cb:req_status:${r.id}:Matched` },
          { text: "✅ Fulfilled", callback_data: `cb:req_status:${r.id}:Fulfilled` },
          { text: "❌ Closed", callback_data: `cb:req_status:${r.id}:Closed` }
        ],
        [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
      ];

      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderMarkDonationPrompt = async (targetChatId, targetMsgId, isCb, adminUid) => {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, updated_at) VALUES (?, 'waiting_for_donation_phone', datetime('now'))"
      ).bind(adminUid).run();

      const text = `💉 <b>রক্তদান সম্পন্ন (Donated) মার্ক করুন</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
        `যে ডোনার রক্তদান সম্পন্ন করেছেন, তার <b>মোবাইল নম্বরটি</b> লিখে পাঠান (যেমন: <code>017XXXXXXXX</code>):\n\n` +
        `<i>ℹ️ নিয়ম: পুরুষদের ক্ষেত্রে স্বয়ংক্রিয়ভাবে ৯০ দিন (৩ মাস) এবং নারীদের ক্ষেত্রে ১২০ দিন (৪ মাস) ডোনার রেস্টে থাকবে এবং এই সময়ে তাকে প্রস্তুত তালিকায় দেখানো হবে না।</i>`;

      const kb = [[{ text: "❌ বাতিল করুন", callback_data: "cb:menu" }]];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    const renderDonorSearchPrompt = async (targetChatId, targetMsgId, isCb, adminUid) => {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, updated_at) VALUES (?, 'waiting_for_search_phone', datetime('now'))"
      ).bind(adminUid).run();

      const text = `🔍 <b>ডোনার অনুসন্ধান ও ব্যবস্থা গ্রহণ</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
        `যে ডোনারের বিস্তারিত তথ্য দেখতে চান অথবা যার বিরুদ্ধে কোনো অভিযোগ রয়েছে, তার <b>মোবাইল নম্বরটি</b> লিখে পাঠান:`;

      const kb = [[{ text: "❌ বাতিল করুন", callback_data: "cb:menu" }]];
      return tgSendOrEdit(token, targetChatId, targetMsgId, text, kb, isCb);
    };

    // 1. Handle Callback Queries (Inline Button Clicks)
    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = String(cq.from?.id || "");
      chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = cq.data || "";

      // Anti-Hijack Authorization Check
      if (allowedUids.length > 0 && !allowedUids.includes(fromId)) {
        await tgAnswerCallback(token, cq.id, "⛔ অননুমোদিত অ্যাক্সেস। আপনি অ্যাডমিন নন।");
        return;
      }

      await tgAnswerCallback(token, cq.id);

      if (data === "cb:menu") {
        const text = "🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল</b> 🩸\n━━━━━━━━━━━━━━━━━━━━\nস্বাগতম! নিচের বাটনগুলো ব্যবহার করে রিয়েলটাইম ডোনার ও রক্তের রিকোয়েস্ট পরিচালনা করুন:";
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
        const bg = data.replace("cb:grp:", "");
        const { results } = await env.DB.prepare(
          "SELECT id, name, phone, district, area, last_donation_date, total_donations FROM donors WHERE blood_group = ? AND is_available = 1 ORDER BY id DESC LIMIT 8"
        ).bind(bg).all();

        let donorText = "";
        const inlineKb = [];

        if (!results || results.length === 0) {
          donorText = `⚠️ <b>${bg}</b> গ্রুপের এই মুহূর্তে কোনো সক্রিয় ও প্রস্তুত ডোনার ডাটাবেজে পাওয়া যায়নি।`;
        } else {
          donorText = `🩸 <b>${bg} গ্রুপের প্রস্তুত ডোনার তালিকা (শীর্ষ ${results.length} জন):</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
          results.forEach((d, i) => {
            const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
            donorText += `<b>${i + 1}. ${d.name}</b> (${d.district}, ${d.area})\n` +
              `   📞 <code>${d.phone}</code> | দান: ${d.total_donations || 0} বার\n\n`;
            
            inlineKb.push([
              { text: `💬 ${d.name}-কে WhatsApp মেসেজ`, url: `https://wa.me/${waNumber}?text=${encodeURIComponent("আসসালামু আলাইকুম " + d.name + " ভাই, BRYBDPF থেকে রক্তের জরুরি প্রয়োজনে যোগাযোগ করা হচ্ছে।")}` }
            ]);
          });
        }

        inlineKb.push([
          { text: "🩸 অন্য গ্রুপ দেখুন", callback_data: "cb:groups" },
          { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
        ]);

        await tgSendOrEdit(token, chatId, messageId, donorText, inlineKb, true);
        return;
      }

      if (data === "cb:pending") {
        await renderPending(chatId, messageId, true);
        return;
      }

      if (data.startsWith("cb:req_status:")) {
        const parts = data.split(":");
        const reqId = parts[2];
        const newStatus = parts[3];

        await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(newStatus, reqId).run();

        const text = `✅ <b>রিকোয়েস্ট #${reqId} সফলভাবে '${newStatus}' স্ট্যাটাসে আপডেট করা হয়েছে!</b>`;
        const kb = [
          [{ text: "📋 পরবর্তী পেন্ডিং রিকোয়েস্ট", callback_data: "cb:pending" }],
          [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
        ];

        await tgSendOrEdit(token, chatId, messageId, text, kb, true);
        return;
      }

      if (data.startsWith("cb:req_donors:")) {
        const reqId = data.replace("cb:req_donors:", "");
        const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(reqId).first();
        if (!req) {
          await tgAnswerCallback(token, cq.id, "রিকোয়েস্ট পাওয়া যায়নি।");
          return;
        }

        const reqThana = req.thana || "";
        const reqDist = (req.district || "রংপুর").trim();

        const { results: donors } = await env.DB.prepare(`
          SELECT name, blood_group, district, area, phone,
            (CASE 
              WHEN district = ? AND area LIKE ? AND ? != '' THEN 1
              WHEN district = ? THEN 2
              ELSE 3
            END) as proximity_tier
          FROM donors 
          WHERE blood_group = ? AND is_available = 1
          ORDER BY proximity_tier ASC, id DESC LIMIT 8
        `).bind(reqDist, `%${reqThana}%`, reqThana, reqDist, req.blood_group).all();

        let text = `📋 <b>রিকোয়েস্ট #${req.id} এর জন্য প্রস্তুত ডোনার তালিকা:</b>\n` +
          `রোগী: ${req.patient_name} (${req.blood_group}) - ${req.hospital_name}\n━━━━━━━━━━━━━━━━━━━━\n`;

        const kb = [];

        if (!donors || donors.length === 0) {
          text += "⚠️ এই মুহূর্তে এই গ্রুপের কোনো প্রস্তুত ডোনার পাওয়া যায়নি।";
        } else {
          donors.forEach((d, i) => {
            const cleanPhone = d.phone.replace(/[^0-9]/g, "");
            const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
            
            text += `<b>${i + 1}. ${d.name}</b> (${d.district}, ${d.area}) - <code>${d.phone}</code>\n`;

            const prefilledText = `🚨 *জরুরি রক্তের আবেদন — BRYBDPF* 🚨\n` +
              `───────────────────────\n` +
              `আসসালামু আলাইকুম *${d.name}* ভাই,\n` +
              `জরুরি প্রয়োজনে *${req.blood_group}* (${req.units || 1} ব্যাগ) রক্তের প্রয়োজন।\n\n` +
              `📋 *রোগীর বিবরণ:*\n` +
              `• *রোগী:* ${req.patient_name}\n` +
              `• *হাসপাতাল:* ${req.hospital_name}, ${req.district}\n` +
              `• *ঠিকানা:* ${req.location}\n` +
              `• *কখন লাগবে:* *${req.needed_by}*\n` +
              `• *আবেদনকারী:* ${req.requester_name || "স্বজন"} (*${req.contact_phone}*)\n` +
              (req.note ? `• *নোট:* ${req.note}\n` : "") +
              `───────────────────────\n` +
              `🤲 আপনি কি রক্তদান করতে প্রস্তুত আছেন? দয়া করে দ্রুত জানান।\n\n` +
              `🌐 *BRYBDPF ব্লাড নেটওয়ার্ক*\n` +
              `🔗 https://brybdpf.pages.dev`;
            kb.push([
              { text: `💬 WhatsApp: ${d.name}`, url: `https://wa.me/${waNumber}?text=${encodeURIComponent(prefilledText)}` }
            ]);
          });
        }

        kb.push([
          { text: "🤝 Matched মার্ক করুন", callback_data: `cb:req_status:${req.id}:Matched` },
          { text: "✅ Fulfilled মার্ক করুন", callback_data: `cb:req_status:${req.id}:Fulfilled` }
        ]);
        kb.push([
          { text: "📋 পেন্ডিং তালিকায় ফিরুন", callback_data: "cb:pending" },
          { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
        ]);

        await tgSendOrEdit(token, chatId, messageId, text, kb, true);
        return;
      }

      if (data === "cb:mark_donation") {
        await renderMarkDonationPrompt(chatId, messageId, true, fromId);
        return;
      }

      if (data === "cb:donor_search") {
        await renderDonorSearchPrompt(chatId, messageId, true, fromId);
        return;
      }

      if (data.startsWith("cb:donor_delete:")) {
        const donorId = data.replace("cb:donor_delete:", "");
        await env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(donorId).run();
        const text = `🗑️ <b>ডোনার (ID #${donorId}) সফলভাবে ডাটাবেজ থেকে মুছে ফেলা হয়েছে!</b>`;
        const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
        await tgSendOrEdit(token, chatId, messageId, text, kb, true);
        return;
      }

      if (data.startsWith("cb:donor_suspend:")) {
        const parts = data.split(":");
        const donorId = parts[2];
        const days = parseInt(parts[3] || "90", 10);

        await env.DB.prepare(
          "UPDATE donors SET is_available = 0, last_donation_date = CURRENT_DATE WHERE id = ? "
        ).bind(donorId).run();

        const text = `⏸️ <b>ডোনার (ID #${donorId}) কে সফলভাবে ${days} দিনের জন্য সাময়িক সাসপেন্ড করা হয়েছে!</b>\nএই সময়ের মধ্যে কোনো অ্যালার্ট বা সার্চে তার তথ্য আসবে না।`;
        const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
        await tgSendOrEdit(token, chatId, messageId, text, kb, true);
        return;
      }

      if (data.startsWith("cb:donor_reactivate:")) {
        const donorId = data.replace("cb:donor_reactivate:", "");
        await env.DB.prepare(
          "UPDATE donors SET is_available = 1 WHERE id = ?"
        ).bind(donorId).run();

        const text = `✅ <b>ডোনার (ID #${donorId}) সফলভাবে পুনরায় সক্রিয় (Active) করা হয়েছে!</b>`;
        const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
        await tgSendOrEdit(token, chatId, messageId, text, kb, true);
        return;
      }
    }

    // 2. Handle Text Messages (Reply Keyboard or Typed)
    if (update.message) {
      const msg = update.message;
      const fromId = String(msg.from?.id || "");
      chatId = msg.chat?.id;
      const text = (msg.text || "").trim();

      // Anti-Hijack Authorization Check
      if (allowedUids.length > 0 && !allowedUids.includes(fromId)) {
        await tgSendMessage(token, chatId, `👋 আসসালামু আলাইকুম!\nআপনি <b>বাংলাদেশ রেড ইয়ুথ ব্লাড ডোনার্স প্লাটফর্ম</b> বটের সাথে যুক্ত হয়েছেন।\n\n⚠️ আপনি এখনো অ্যাডমিন হিসেবে নিবন্ধিত নন। আপনার টেলিগ্রাম আইডি:\n<code>${fromId}</code>\n\nওয়েবসাইটের অ্যাডমিন প্যানেল থেকে এই আইডিটি যুক্ত করলে আপনি সরাসরি সকল ফিচার পরিচালনা করতে পারবেন।`);
        return;
      }

      // Check if admin is waiting for input
      const adminStateRecord = await env.DB.prepare(
        "SELECT state, data FROM bot_admin_states WHERE admin_uid = ? AND updated_at > datetime('now', '-30 minutes')"
      ).bind(fromId).first();

      const currentState = adminStateRecord ? adminStateRecord.state : "";

      // Menu / Refresh
      if (text === "/start" || text === "/menu" || text.includes("মেনু") || text.includes("রিফ্রেশ")) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();
        const welcomeText = `🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল প্যানেল</b> 🩸\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `আসসালামু আলাইকুম! নিচের বাটনগুলো চেপে সহজেই রিয়েলটাইম ডোনার ও রক্তের রিকোয়েস্ট পরিচালনা করুন:`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: welcomeText,
            parse_mode: "HTML",
            reply_markup: getMainAdminReplyKeyboard()
          })
        });

        await tgSendMessage(token, chatId, "কন্ট্রোল প্যানেল অপশনসমূহ:", getMainAdminKeyboard());
        return;
      }

      // Stats
      if (text === "/stats" || text.includes("পরিসংখ্যান")) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();
        await renderStats(chatId, null, false);
        return;
      }

      // Groups
      if (text === "/groups" || text.includes("গ্রুপ")) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();
        await renderGroups(chatId, null, false);
        return;
      }

      // Pending
      if (text === "/pending" || text.includes("পেন্ডিং")) {
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();
        await renderPending(chatId, null, false);
        return;
      }

      // Mark Donation
      if (text === "/donate" || text === "/donated" || text.includes("ডোনেশন") || text.includes("রক্তদান")) {
        await renderMarkDonationPrompt(chatId, null, false, fromId);
        return;
      }

      // Donor Search
      if (text === "/search" || text.includes("সার্চ")) {
        await renderDonorSearchPrompt(chatId, null, false, fromId);
        return;
      }

      // State: waiting_for_donation_phone
      if (currentState === "waiting_for_donation_phone") {
        const cleanPhone = text.replace(/[^0-9]/g, "");
        if (cleanPhone.length < 10) {
          await tgSendMessage(token, chatId, "❌ অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নম্বর লিখুন (উদাঃ 017XXXXXXXX):");
          return;
        }

        const donor = await env.DB.prepare(
          "SELECT * FROM donors WHERE phone LIKE ? OR phone LIKE ?"
        ).bind(`%${cleanPhone.slice(-10)}%`, cleanPhone).first();

        if (!donor) {
          await tgSendMessage(token, chatId, `❌ <code>${text}</code> নম্বরে কোনো নিবন্ধিত ডোনার পাওয়া যায়নি। আবার চেষ্টা করুন অথবা /menu চাপুন:`);
          return;
        }

        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();

        const isFemale = (donor.gender || "").toLowerCase() === "female" || donor.gender === "নারী";
        const cooldownDays = isFemale ? 120 : 90;

        await env.DB.prepare(`
          UPDATE donors SET
            is_available = 0,
            last_donation_date = CURRENT_DATE,
            total_donations = COALESCE(total_donations, 0) + 1
          WHERE id = ?
        `).bind(donor.id).run();

        const confirmText = `🎉 <b>রক্তদান রেকর্ড সফল হয়েছে!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>ডোনার:</b> ${donor.name} (${donor.blood_group})\n` +
          `📞 <b>ফোন:</b> <code>${donor.phone}</code>\n` +
          `🩸 <b>মোট দান:</b> ${(donor.total_donations || 0) + 1} বার\n` +
          `⏳ <b>রেস্ট পিরিয়ড:</b> পরবর্তী ${cooldownDays} দিন বিশ্রামে রাখা হয়েছে।\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `দানবীর রক্তদাতাকে আন্তরিক কৃতজ্ঞতা ও অভিনন্দন! ❤️`;

        const kb = [
          [{ text: "💉 অন্য ডোনার মার্ক করুন", callback_data: "cb:mark_donation" }],
          [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
        ];

        await tgSendMessage(token, chatId, confirmText, kb);
        return;
      }

      // State: waiting_for_search_phone
      if (currentState === "waiting_for_search_phone") {
        const cleanPhone = text.replace(/[^0-9]/g, "");
        if (cleanPhone.length < 5) {
          await tgSendMessage(token, chatId, "❌ অনুগ্রহ করে অন্তত ৫ বা তার বেশি ডিজিটের মোবাইল নম্বর বা নাম লিখুন:");
          return;
        }

        const { results: donors } = await env.DB.prepare(
          "SELECT * FROM donors WHERE phone LIKE ? OR name LIKE ? LIMIT 5"
        ).bind(`%${cleanPhone}%`, `%${text}%`).all();

        if (!donors || donors.length === 0) {
          await tgSendMessage(token, chatId, `❌ <code>${text}</code> দিয়ে কোনো ডোনার পাওয়া যায়নি। আবার চেষ্টা করুন অথবা /menu চাপুন:`);
          return;
        }

        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();

        for (const d of donors) {
          const statusText = d.is_available === 1 ? "✅ প্রস্তুত (Available)" : "⏸️ বিশ্রামে / অফলাইন";
          const dText = `👤 <b>ডোনার প্রোফাইল (#${d.id}):</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `• <b>নাম:</b> ${d.name}\n` +
            `• <b>রক্তের গ্রুপ:</b> <code>${d.blood_group}</code>\n` +
            `• <b>মোবাইল:</b> <code>${d.phone}</code>\n` +
            `• <b>ঠিকানা:</b> ${d.district}, ${d.area}\n` +
            `• <b>বয়স ও লিঙ্গ:</b> ${d.age || "N/A"} বছর | ${d.gender || "Male"}\n` +
            `• <b>স্ট্যাটাস:</b> ${statusText}\n` +
            `• <b>সর্বশেষ দান:</b> ${d.last_donation_date || "রেকর্ড নেই"}\n` +
            `• <b>মোট রক্তদান:</b> ${d.total_donations || 0} বার\n` +
            `━━━━━━━━━━━━━━━━━━━━`;

          const kb = [
            [
              d.is_available === 1 
                ? { text: "⏸️ ৯০ দিন রেস্ট দিন", callback_data: `cb:donor_suspend:${d.id}:90` }
                : { text: "✅ পুনরায় সক্রিয় করুন", callback_data: `cb:donor_reactivate:${d.id}` },
              { text: "🗑️ ডোনার মুছুন", callback_data: `cb:donor_delete:${d.id}` }
            ]
          ];

          await tgSendMessage(token, chatId, dText, kb);
        }

        await tgSendMessage(token, chatId, "আরও অ্যাকশন বা মূল মেনুতে যেতে চাপুন:", [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]]);
        return;
      }

      // Default fallback
      await tgSendMessage(token, chatId, "🤖 অনুগ্রহ করে মেনু থেকে অপশন বেছে নিন অথবা /menu লিখুন:", getMainAdminKeyboard());
    }
  } catch (err) {
    console.error("handleTelegramUpdate error:", err);
  }
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  const ctx = context;
  const waitUntil = (promise) => {
    try {
      if (context && typeof context.waitUntil === 'function') {
        context.waitUntil(promise);
      } else if (context && context.ctx && typeof context.ctx.waitUntil === 'function') {
        context.ctx.waitUntil(promise);
      } else if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(promise);
      } else if (promise && typeof promise.catch === 'function') {
        promise.catch(e => console.error("Background task error:", e));
      }
    } catch(e) {
      console.error("waitUntil error:", e);
    }
  };

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // Automatic Background Webhook Auto-Sync to Telegram API
      waitUntil(ensureTelegramWebhook(env, url.origin));
      const ip = getClientIP(request);

    // Automatic Edge-level UTM parameter stripping (?utm_source=gemini etc.)
    if (method === "GET" && (url.searchParams.has("utm_source") || url.searchParams.has("utm_medium") || url.searchParams.has("utm_campaign"))) {
      url.searchParams.delete("utm_source");
      url.searchParams.delete("utm_medium");
      url.searchParams.delete("utm_campaign");
      url.searchParams.delete("utm_term");
      url.searchParams.delete("utm_content");
      const cleanSearch = url.searchParams.toString();
      const cleanUrl = url.origin + url.pathname + (cleanSearch ? "?" + cleanSearch : "") + url.hash;
      return Response.redirect(cleanUrl, 301);
    }

      if (method === "OPTIONS") return json({ ok: true });

      
      // Diagnostic ping/status endpoint
      if (path === "/api/telegram/status" || path === "/api/telegram/ping") {
        try {
          const { token, adminUidsStr } = await getTelegramConfig(env);
          const tgRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
          const info = await tgRes.json();
          return json({
            success: true,
            bot_token_preview: token.slice(0, 8) + "..." + token.slice(-5),
            configured_admins: adminUidsStr,
            expected_webhook_url: `${url.origin}/api/telegram/webhook`,
            telegram_webhook_info: info
          });
        } catch(err) {
          return json({ success: false, error: err.message }, 500);
        }
      }

      // Public / Force webhook setup endpoint
      if ((path === "/api/telegram/setup-webhook" || path === "/api/telegram/sync-webhook") && (method === "POST" || method === "GET")) {
        try {
          const { token } = await getTelegramConfig(env);
          const webhookUrl = `${url.origin}/api/telegram/webhook`;
          const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: webhookUrl,
              secret_token: TELEGRAM_WEBHOOK_SECRET,
              allowed_updates: ["message", "callback_query"],
              drop_pending_updates: false
            })
          });
          const tgData = await tgRes.json();
          if (tgData.ok) {
            try {
              await env.DB.prepare(
                "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_webhook_synced', ?, datetime('now'))"
              ).bind(webhookUrl).run();
            } catch(e) {}
          }
          return json({
            success: tgRes.ok,
            telegram_response: tgData,
            synced_url: webhookUrl
          });
        } catch (err) {
          return json({ success: false, error: err.message }, 500);
        }
      }

      // Incoming Telegram Webhook updates (multi-path support)
      if (
        (path === "/api/telegram/webhook" ||
         path === "/api/telegram-webhook" ||
         path === "/telegram/webhook" ||
         path === "/api/telegram") &&
        method === "POST"
      ) {
        try {
          const update = await request.json();
          waitUntil(handleTelegramUpdate(update, env, ctx));
          return json({ ok: true });
        } catch (e) {
          return json({ ok: true });
        }
      }

      // Fallback: If Telegram posts to root /
      if ((path === "/" || path === "") && method === "POST") {
        try {
          const update = await request.json();
          if (update && (update.update_id !== undefined || update.message || update.callback_query)) {
            waitUntil(handleTelegramUpdate(update, env, ctx));
            return json({ ok: true });
          }
        } catch(e) {}
      }

      if (path === "/api/captcha" && method === "GET") {
        const captcha = await generateCaptcha();
        return json(captcha);
      }

      if (path === "/api/stats" && method === "GET") {
        const start = performance.now();
        const [donorsRes, availRes, reqRes, distRes] = await Promise.all([
          env.DB.prepare("SELECT count(*) as count FROM donors").first(),
          env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
          env.DB.prepare("SELECT count(DISTINCT district) as count FROM donors").first()
        ]);
        const duration = (performance.now() - start).toFixed(2);
        return json({
          total_donors: donorsRes ? donorsRes.count : 0,
          available_donors: availRes ? availRes.count : 0,
          total_requests: reqRes ? reqRes.count : 0,
          districts_count: distRes ? distRes.count : 0,
          query_duration_ms: duration
        });
      }

      if (path === "/api/donors/search") {
        return json({
          error: "ব্যক্তিগত তথ্যের সুরক্ষার্থে পাবলিক ডোনার অনুসন্ধান সুবিধা বন্ধ রাখা হয়েছে।"
        }, 403);
      }

      if (path === "/api/donors/register" && method === "POST") {
        try {
          const body = await request.json();
          const {
            name, blood_group, phone, district, area, age, gender,
            last_donation_date, total_donations, captcha_token, captcha_answer,
            agreed_future_donation, agreed_data_save
          } = body;

          let isCaptchaValid = true;
          if (captcha_token && captcha_answer) {
            isCaptchaValid = await verifyCaptcha(captcha_token, captcha_answer);
          } else if (captcha_token && !captcha_answer) {
            isCaptchaValid = false;
          }
          if (!isCaptchaValid) {
            return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে সঠিক উত্তর দিন।" }, 400);
          }

          if (!name || !blood_group || !phone || !district || !area || !age) {
            return json({ error: "সকল প্রয়োজনীয় তথ্য সঠিকভাবে পূরণ করুন।" }, 400);
          }

          const existing = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(phone.trim()).first();
          if (existing) {
            return json({ error: "এই মোবাইল নম্বরটি দিয়ে ইতিমধ্যে ডোনার হিসেবে রেজিস্ট্রেশন করা আছে।" }, 409);
          }

          const stmt = env.DB.prepare(`
            INSERT INTO donors (\
              name, blood_group, phone, district, area, age, gender,\
              last_donation_date, total_donations, is_available,\
              agreed_future_donation, agreed_data_save\
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `);

          await stmt.bind(
            name.trim(),
            blood_group,
            phone.trim(),
            district.trim(),
            area.trim(),
            parseInt(age, 10),
            gender || "Male",
            last_donation_date || null,
            parseInt(total_donations || "0", 10),
            agreed_future_donation ? 1 : 0,
            agreed_data_save ? 1 : 0
          ).run();

          return json({ success: true, message: "ডোনার হিসেবে আপনার নিবন্ধন সফল হয়েছে!" });
        } catch (err) {
          return json({ error: "নিবন্ধন ব্যর্থ হয়েছে: " + err.message }, 500);
        }
      }

      if (path === "/api/requests/create" && method === "POST") {
        try {
          const body = await request.json();
          const {
            patient_name, blood_group, units, district, thana, needed_by,
            hospital_name, location, note, contact_phone, urgency,
            requester_name, requester_blood_group, requester_age, requester_gender,
            requester_district, requester_area,
            captcha_token, captcha_answer, agreed_future_donation, agreed_data_save
          } = body;

          let isCaptchaValid = true;
          if (captcha_token && captcha_answer) {
            isCaptchaValid = await verifyCaptcha(captcha_token, captcha_answer);
          } else if (captcha_token && !captcha_answer) {
            isCaptchaValid = false;
          }
          if (!isCaptchaValid) {
            return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে সঠিক উত্তর দিন।" }, 400);
          }

          if (!patient_name || !blood_group || !units || !district || !needed_by || !hospital_name || !location || !contact_phone) {
            return json({ error: "রোগী ও হাসপাতালের সকল প্রয়োজনীয় তথ্য পূরণ করুন।" }, 400);
          }

          if (!agreed_future_donation || !agreed_data_save) {
            return json({ error: "রক্তের রিকোয়েস্ট পাঠাতে হলে উভয় শর্তাবলীতে সম্মতি প্রদান বাধ্যতামূলক।" }, 400);
          }

          const cleanPhone = contact_phone.trim();
          const recentReq = await env.DB.prepare(
            "SELECT id FROM blood_requests WHERE contact_phone = ? AND created_at > datetime('now', '-24 hours')"
          ).bind(cleanPhone).first();

          if (recentReq) {
            return json({ error: "বিগত ২৪ ঘণ্টায় এই নম্বর থেকে ইতিমধ্যে একটি রিকোয়েস্ট পাঠানো হয়েছে। জরুরি প্রয়োজনে অ্যাডমিনের সাথে যোগাযোগ করুন।" }, 429);
          }

          const cleanDist = (district || "রংপুর").trim();
          const cleanThana = (thana || "").trim();

          const insertReqStmt = env.DB.prepare(`
            INSERT INTO blood_requests (\
              patient_name, blood_group, units, district, thana, hospital_name,\
              location, contact_phone, urgency, needed_by, note, requester_name,\
              status, requester_blood_group\
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
          `);

          const reqInsertRes = await insertReqStmt.bind(
            patient_name.trim(),
            blood_group,
            parseInt(units, 10),
            cleanDist,
            cleanThana || null,
            hospital_name.trim(),
            location.trim(),
            cleanPhone,
            urgency || "Emergency",
            needed_by.trim(),
            note ? note.trim() : "",
            requester_name ? requester_name.trim() : "স্বজন",
            requester_blood_group || null
          ).run();

          const donorBloodGroupToRegister = requester_blood_group || blood_group;
          const donorNameToRegister = requester_name ? requester_name.trim() : patient_name.trim();
          const donorDistrictToRegister = requester_district ? requester_district.trim() : district.trim();
          const donorAreaToRegister = requester_area ? requester_area.trim() : location.trim();
          const donorAgeToRegister = requester_age ? parseInt(requester_age, 10) : 25;
          const donorGenderToRegister = requester_gender || "Male";

          const existingDonor = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
          if (!existingDonor) {
            await env.DB.prepare(`
              INSERT INTO donors (\
                name, blood_group, phone, district, area, age, gender,\
                is_available, agreed_future_donation, agreed_data_save\
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
            `).bind(
              donorNameToRegister,
              donorBloodGroupToRegister,
              cleanPhone,
              donorDistrictToRegister,
              donorAreaToRegister,
              donorAgeToRegister,
              donorGenderToRegister
            ).run();
          }

          let matchedDonors = [];
          try {
            const cleanDist = (district || "রংপুর").trim();
            const cleanThana = (thana || "").trim();

            const { results } = await env.DB.prepare(`
              SELECT name, blood_group, district, area, phone,\
                (CASE \
                  WHEN district = ? AND area LIKE ? AND ? != '' THEN 1\
                  WHEN district = ? THEN 2\
                  ELSE 3\
                END) as proximity_tier\
              FROM donors \
              WHERE blood_group = ? AND is_available = 1 AND phone != ?\
              ORDER BY \
                proximity_tier ASC,\
                RANDOM()\
              LIMIT 20\
            `).bind(
              cleanDist, `%${cleanThana}%`, cleanThana,\
              cleanDist,\
              blood_group, cleanPhone\
            ).all();
            matchedDonors = results || [];
          } catch (e) {
            console.error("Donor match query error:", e);
          }

          waitUntil(sendTelegramAlert(env, {
            patient_name,
            blood_group,
            units,
            district,
            hospital_name,
            location,
            contact_phone: cleanPhone,
            needed_by,
            note,
            requester_name,
            requester_blood_group
          }, matchedDonors));

          return json({
            success: true,
            message: "আপনার রক্তের রিকোয়েস্ট সফলভাবে গৃহীত হয়েছে! উপযুক্ত ডোনারদের সাথে যোগাযোগ এবং টেলিগ্রাম অ্যালার্ট প্রক্রিয়া শুরু হয়েছে।",
            request_id: reqInsertRes.meta?.last_row_id || null
          });
        } catch (err) {
          return json({ error: "রিকোয়েস্ট ব্যর্থ হয়েছে: " + err.message }, 500);
        }
      }

      if (path === "/api/admin/check-setup" && method === "GET") {
        const adminCount = await env.DB.prepare("SELECT count(*) as count FROM admins").first();
        return json({ needsSetup: !adminCount || adminCount.count === 0 });
      }

      if (path === "/api/admin/setup" && method === "POST") {
        const adminCount = await env.DB.prepare("SELECT count(*) as count FROM admins").first();
        if (adminCount && adminCount.count > 0) {
          return json({ error: "অ্যাডমিন ইতিমধ্যে কনফিগার করা আছে।" }, 403);
        }

        const { email, password, telegram_token, telegram_uids } = await request.json();
        if (!email || !password || password.length < 8) {
          return json({ error: "সঠিক ইমেইল এবং অন্তত ৮ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
        }

        const salt = generateRandomToken(16);
        const passwordHash = await hashPassword(password, salt);

        await env.DB.prepare(`
          INSERT INTO admins (email, password_hash, password_salt, role)
          VALUES (?, ?, ?, 'superadmin')
        `).bind(email.toLowerCase().trim(), passwordHash, salt).run();

        if (telegram_token && telegram_token.trim()) {
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)")
            .bind(telegram_token.trim()).run();
        }
        if (telegram_uids && telegram_uids.trim()) {
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)")
            .bind(telegram_uids.trim()).run();
        }

        const sessionToken = generateRandomToken(32);
        await env.DB.prepare(`
          INSERT INTO sessions (token, admin_email, expires_at)
          VALUES (?, ?, datetime('now', '+7 days'))
        `).bind(sessionToken, email.toLowerCase().trim()).run();

        return json({
          success: true,
          token: sessionToken,
          message: "অ্যাডমিন অ্যাকাউন্ট তৈরি সফল হয়েছে!"
        });
      }

      if (path === "/api/admin/login" && method === "POST") {
        const { email, password } = await request.json();
        if (!email || !password) {
          return json({ error: "ইমেইল ও পাসওয়ার্ড প্রদান করুন।" }, 400);
        }

        const normalizedEmail = email.toLowerCase().trim();
        const admin = await env.DB.prepare("SELECT * FROM admins WHERE LOWER(email) = ?").bind(normalizedEmail).first();
        if (!admin) {
          return json({ error: "ভুল ইমেইল বা পাসওয়ার্ড।" }, 401);
        }

        const testHash = await hashPassword(password, admin.password_salt);
        if (testHash !== admin.password_hash) {
          return json({ error: "ভুল ইমেইল বা পাসওয়ার্ড।" }, 401);
        }

        const sessionToken = generateRandomToken(32);
        try {
          await env.DB.prepare(`
            INSERT INTO sessions (token, admin_email, expires_at)
            VALUES (?, ?, datetime('now', '+7 days'))
          `).bind(sessionToken, normalizedEmail).run();
        } catch(e) {}

        try {
          await env.DB.prepare(`
            INSERT INTO admin_sessions (token, admin_id, expires_at)
            VALUES (?, ?, datetime('now', '+7 days'))
          `).bind(sessionToken, admin.id).run();
        } catch(e) {}

        return json({
          success: true,
          token: sessionToken,
          email: admin.email,
          role: admin.role
        });
      }

      if (path === "/api/admin/logout" && method === "POST") {
        const admin = await getAuthenticatedAdmin(request, env);
        if (admin && admin.token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(admin.token).run();
          try {
            await env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(admin.token).run();
          } catch(e) {}
        }
        return json({ success: true });
      }

      // ADMIN PROTECTED ROUTES
      if (path.startsWith("/api/admin/")) {
        const admin = await getAuthenticatedAdmin(request, env);
        if (!admin) {
          return json({ error: "অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে পুনরায় লগইন করুন।" }, 401);
        }

        if (path === "/api/admin/data" && method === "GET") {
          const [totalD, activeD, totalR, pendingR] = await Promise.all([
            env.DB.prepare("SELECT count(*) as count FROM donors").first(),
            env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE status = 'Pending'").first()
          ]);

          return json({
            admin_email: admin.admin_email || admin.email,
            total_donors: totalD ? totalD.count : 0,
            active_donors: activeD ? activeD.count : 0,
            total_requests: totalR ? totalR.count : 0,
            pending_requests: pendingR ? pendingR.count : 0
          });
        }

        if (path === "/api/admin/donors" && method === "GET") {
          const bg = url.searchParams.get("blood_group");
          const search = url.searchParams.get("search");

          let query = "SELECT * FROM donors WHERE 1=1";
          const params = [];

          if (bg && bg !== "ALL") {
            query += " AND blood_group = ?";
            params.push(bg);
          }
          if (search && search.trim()) {
            query += " AND (name LIKE ? OR phone LIKE ? OR district LIKE ? OR area LIKE ?)";
            const s = `%${search.trim()}%`;
            params.push(s, s, s, s);
          }

          query += " ORDER BY id DESC LIMIT 100";
          const stmt = env.DB.prepare(query);
          const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
          return json({ donors: results || [] });
        }

        if (path.match(/^\/api\/admin\/donors\/\d+\/toggle$/) && method === "POST") {
          const id = path.split("/")[4];
          const donor = await env.DB.prepare("SELECT is_available FROM donors WHERE id = ?").bind(id).first();
          if (!donor) return json({ error: "ডোনার পাওয়া যায়নি" }, 404);

          const newStatus = donor.is_available === 1 ? 0 : 1;
          await env.DB.prepare("UPDATE donors SET is_available = ? WHERE id = ?").bind(newStatus, id).run();
          return json({ success: true, is_available: newStatus });
        }

        if (path.match(/^\/api\/admin\/donors\/\d+$/) && method === "DELETE") {
          const id = path.split("/")[4];
          await env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(id).run();
          return json({ success: true });
        }

        if (path === "/api/admin/requests" && method === "GET") {
          const status = url.searchParams.get("status") || "ALL";
          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
          const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)), 50);
          const offset = (page - 1) * limit;

          // Filter by last 10 days (or records with null timestamp)
          let whereClause = "WHERE (created_at >= datetime('now', '-10 days') OR created_at IS NULL)";
          const params = [];

          const validStatuses = ["Pending", "Matched", "Fulfilled", "Closed"];
          if (status && status !== "ALL" && validStatuses.includes(status)) {
            whereClause += " AND status = ?";
            params.push(status);
          }

          // Count total in last 10 days
          const countQuery = "SELECT count(*) as total FROM blood_requests " + whereClause;
          const countStmt = params.length > 0 ? env.DB.prepare(countQuery).bind(...params) : env.DB.prepare(countQuery);
          const totalRes = await countStmt.first();
          const total = totalRes ? totalRes.total : 0;

          // Paginated records (max 10 per page)
          const dataQuery = "SELECT * FROM blood_requests " + whereClause + " ORDER BY id DESC LIMIT ? OFFSET ?";
          const dataParams = [...params, limit, offset];
          const dataStmt = env.DB.prepare(dataQuery).bind(...dataParams);
          const { results } = await dataStmt.all();

          return json({
            requests: results || [],
            total,
            page,
            limit,
            total_pages: Math.ceil(total / limit) || 1,
            days_limit: 10
          });
        }

        if (path.match(/^\/api\/admin\/requests\/\d+\/status$/) && (method === "PATCH" || method === "POST")) {
          const id = path.split("/")[4];
          const { status } = await request.json();
          const validStatuses = ["Pending", "Matched", "Fulfilled", "Closed"];
          if (!validStatuses.includes(status)) {
            return json({ error: "অবৈধ স্ট্যাটাস।" }, 400);
          }
          await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(status, id).run();
          return json({ success: true, status });
        }

        if (path.match(/^\/api\/admin\/requests\/\d+\/(match-donors|matching-donors)$/) && method === "GET") {
          const id = path.split("/")[4];
          const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(id).first();
          if (!req) return json({ error: "রিকোয়েস্ট পাওয়া যায়নি।" }, 404);

          const cleanDist = (req.district || "রংপুর").trim();
          const cleanThana = (req.thana || "").trim();

          const { results } = await env.DB.prepare(`
            SELECT id, name, blood_group, district, area, phone, age, total_donations, last_donation_date,
              (CASE 
                WHEN district = ? AND (? != '' AND (area LIKE ? OR ? LIKE '%' || area || '%')) THEN 1
                WHEN district = ? THEN 2
                WHEN district IN ('রংপুর', 'নীলফামারী', 'দিনাজপুর', 'কুড়িগ্রাম', 'লালমনিরহাট', 'গাইবান্ধা', 'ঠাকুরগাঁও', 'পঞ্চগড়') THEN 3
                ELSE 4
              END) as proximity_tier
            FROM donors 
            WHERE blood_group = ? AND is_available = 1
            ORDER BY 
              proximity_tier ASC,
              id DESC
            LIMIT 60
          `).bind(
            cleanDist, cleanThana, `%${cleanThana}%`, cleanThana,
            cleanDist,
            req.blood_group
          ).all();

          const allDonors = results || [];
          const tier1 = allDonors.filter(d => d.proximity_tier === 1);
          const tier2 = allDonors.filter(d => d.proximity_tier === 2);
          const tier3 = allDonors.filter(d => d.proximity_tier === 3);

          let shareText = `আসসালামু আলাইকুম, BRYBDPF থেকে আপনার কাঙ্ক্ষিত ${req.blood_group} রক্তের সম্ভাব্য ডোনার তালিকা:\n\n`;
          allDonors.slice(0, 10).forEach((d, idx) => {
            shareText += `${idx + 1}. ${d.name} (${d.district}, ${d.area || ''}) - ${d.phone}\n`;
          });
          shareText += "\nরোগীর দ্রুত সুস্থতা কামনা করি।";

          const cleanPhone = (req.contact_phone || "").replace(/[^0-9]/g, "");
          const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
          const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(shareText)}`;

          return json({
            request: req,
            share_text: shareText,
            whatsapp_share_url: waLink,
            request_id: req.id,
            patient_name: req.patient_name,
            blood_group: req.blood_group,
            units: req.units,
            district: req.district,
            thana: req.thana || "",
            hospital_name: req.hospital_name,
            location: req.location,
            contact_phone: req.contact_phone,
            needed_by: req.needed_by,
            donors: allDonors,
            tier1_thana_donors: tier1,
            tier2_district_donors: tier2,
            tier3_division_donors: tier3,
            counts: {
              total: allDonors.length,
              tier1_thana: tier1.length,
              tier2_district: tier2.length,
              tier3_division: tier3.length
            }
          });
        }

        if (path === "/api/admin/settings" && method === "GET") {
          const { results } = await env.DB.prepare("SELECT key, value FROM admin_settings").all();
          const map = {};
          (results || []).forEach(r => {
            if (r.key === "telegram_bot_token") {
              map["telegram_bot_token_masked"] = r.value ? r.value.slice(0, 6) + "..." + r.value.slice(-4) : "";
            } else {
              map[r.key] = r.value;
            }
          });
          return json(map);
        }

        if (path === "/api/admin/settings" && method === "POST") {
          const { telegram_bot_token, telegram_admin_uids } = await request.json();

          if (telegram_bot_token && telegram_bot_token.trim()) {
            const cleanToken = telegram_bot_token.trim();
            await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)")
              .bind(cleanToken).run();

            // Auto-configure Webhook with Telegram API
            try {
              const webhookUrl = `${url.origin}/api/telegram/webhook`;
              await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: webhookUrl,
                  secret_token: TELEGRAM_WEBHOOK_SECRET,
                  allowed_updates: ["message", "callback_query"],
                  drop_pending_updates: false
                })
              });
              await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_webhook_synced', ?, datetime('now'))")
                .bind(webhookUrl).run();
            } catch(e) {
              console.error("Auto setWebhook error:", e);
            }
          }

          if (telegram_admin_uids !== undefined) {
            await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)")
              .bind(telegram_admin_uids.trim()).run();
          }

          return json({ success: true, message: "সেটিংস সফলভাবে সংরক্ষিত হয়েছে।" });
        }

        if (path === "/api/admin/change-password" && method === "POST") {
          const { current_password, new_password } = await request.json();
          if (!current_password || !new_password || new_password.length < 8) {
            return json({ error: "নতুন পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।" }, 400);
          }

          const currentAdmin = await env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(admin.id).first();
          const currentHash = await hashPassword(current_password, currentAdmin.password_salt);
          if (currentHash !== currentAdmin.password_hash) {
            return json({ error: "বর্তমান পাসওয়ার্ড ভুল।" }, 400);
          }

          const newSalt = generateRandomToken(16);
          const newHash = await hashPassword(new_password, newSalt);

          await env.DB.prepare("UPDATE admins SET password_hash = ?, password_salt = ? WHERE id = ?")
            .bind(newHash, newSalt, admin.id).run();

          return json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে।" });
        }

        // ADMIN TEST TELEGRAM ALERT
        if (path === "/api/admin/test-telegram" && method === "POST") {
          const testRequest = {
            patient_name: "করিম উদ্দিন (পরীক্ষামূলক)",
            blood_group: "O+",
            units: 1,
            district: "রংপুর",
            thana: "সদর",
            hospital_name: "রংপুর মেডিকেল কলেজ হাসপাতাল",
            location: "মেডিকেল রোড",
            contact_phone: "01700000000",
            needed_by: "জরুরি (আজকের মধ্যে)",
            note: "এটি অ্যাডমিন প্যানেল থেকে পাঠানো একটি পরীক্ষামূলক অ্যালার্ট।"
          };
          const sampleDonors = [
            { name: "হাসান আলী", blood_group: "O+", district: "রংপুর", area: "সদর", phone: "01711111111", proximity_tier: 1 }
          ];
          await sendTelegramAlert(env, testRequest, sampleDonors);
          return json({ success: true, message: "টেলিগ্রাম টেস্ট মেসেজ ও কন্ট্রোল বাটন পাঠানো হয়েছে! টেলিগ্রাম চেক করুন।" });
        }
      }

      // FALLBACK TO STATIC ASSETS OR NEXT PAGES HANDLER
      if (context.next) {
        return context.next();
      }

      return json({ error: "Not Found" }, 404);
    } catch (err) {
      console.error("Top-level Pages Functions Exception:", err);
      return json({
        success: false,
        error: "সার্ভার সমস্যা: " + err.message,
        details: err.stack
      }, 500);
    }
}
