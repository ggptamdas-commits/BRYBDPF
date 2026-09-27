
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

    let donorText = "";
    const inlineButtons = [];

    // 1. WhatsApp message for the REQUESTER (containing list of matched donors, tagged by proximity tier)
    let shareToRequester = `🩸 *রক্তদাতাদের তালিকা — BRYBDPF* 🩸\n` +
      `───────────────────────\n` +
      `আসসালামু আলাইকুম,\n` +
      `রোগীর জরুরি প্রয়োজনে *${requestData.blood_group}* গ্রুপের রক্তদাতাদের তালিকা (আশেপাশের থানা ও জেলা ভিত্তিতে অগ্রাধিকার অনুযায়ী):\n\n`;
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
        
        const tierTag = d.proximity_tier === 1 ? "🎯 [আপনার নিজস্ব থানায় রোগী]" : "📍 [আপনার জেলায় রোগী]";
        const promptForDonor = `🚨 *জরুরি রক্তের আবেদন — BRYBDPF* 🚨\n` +
          `───────────────────────\n` +
          `আসসালামু আলাইকুম *${d.name}* ভাই,\n` +
          `এক মুমূর্ষু রোগীর জীবন রক্ষায় জরুরি ভিত্তিতে আপনার গ্রুপের (*${requestData.blood_group}*) রক্ত প্রয়োজন। ${tierTag}\n\n` +
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
      `🏥 <b>হাসপাতাল:</b> ${requestData.hospital_name}\n` +
      `📍 <b>থানা ও জেলা:</b> ${requestData.thana ? requestData.thana + ', ' : ''}${requestData.district}\n` +
      `📍 <b>ঠিকানা/ওয়ার্ড:</b> ${requestData.location}\n` +
      `⏰ <b>প্রয়োজনের সময়:</b> ${requestData.needed_by}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🤝 <b>আবেদনকারী:</b> ${requestData.requester_name || "স্বজন"}\n` +
      `📞 <b>যোগাযোগের নম্বর:</b> <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>\n` +
      (requestData.note ? `📝 <b>নোট:</b> ${requestData.note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>রোগীর নিকটবর্তী ডোনারদের তালিকা (অগ্রাধিকার ভিত্তিতে):</b>\n\n` +
      donorText + `\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <b>এক ক্লিকে আবেদনকারীকে ডোনার লিস্ট পাঠাতে:</b>\n` +
      `👉 <a href="${waShareUrl}">WhatsApp-এ গ্রহীতাকে ডোনার তালিকা পাঠান</a>`;

    for (const uid of uids) {
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
    } catch(e) {}

    // Check admin_sessions table
    try {
      const s2 = await env.DB.prepare(
        "SELECT * FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
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
    } catch(e) {}

    return null;
  } catch (err) {
    console.error("Auth admin error:", err);
    return null;
  }
}

const TELEGRAM_WEBHOOK_SECRET = "BRYBDPF_TG_SECURE_TOKEN_2026";

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function tgSendMessage(token, chatId, text, replyMarkup = null, parseMode = "HTML") {
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };
  if (parseMode) payload.parse_mode = parseMode;
  if (replyMarkup) {
    if (Array.isArray(replyMarkup)) {
      payload.reply_markup = { inline_keyboard: replyMarkup };
    } else {
      payload.reply_markup = replyMarkup;
    }
  }
  try {
    let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok && parseMode) {
      delete payload.parse_mode;
      payload.text = text.replace(/<[^>]*>/g, "");
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    return res;
  } catch (e) {
    console.error("tgSendMessage error:", e);
  }
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
    if (Array.isArray(inlineKeyboard)) {
      payload.reply_markup = { inline_keyboard: inlineKeyboard };
    } else {
      payload.reply_markup = inlineKeyboard;
    }
  }
  try {
    let res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      delete payload.message_id;
      if (parseMode) {
        delete payload.parse_mode;
        payload.text = text.replace(/<[^>]*>/g, "");
      }
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    return res;
  } catch (e) {
    console.error("tgEditMessage fallback to sendMessage:", e);
    return tgSendMessage(token, chatId, text, inlineKeyboard, parseMode);
  }
}

async function tgAnswerCallback(token, callbackQueryId, text = null) {
  if (!callbackQueryId || callbackQueryId.length < 5) return;
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

      const text = `📊 <b>BRYBDPF রংপুর বিভাগীয় পরিসংখ্যান ও ডোনার ডাটা</b>\n` +
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
        `🏥 <b>হাসপাতাল:</b> ${r.hospital_name}\n` +
        `📍 <b>স্থান/থানা:</b> ${r.thana ? r.thana + ', ' : ''}${r.district}\n` +
        `📍 <b>ঠিকানা/ওয়ার্ড:</b> ${r.location}\n` +
        `📞 <b>আবেদনকারী:</b> ${r.requester_name || "স্বজন"} (<a href="tel:${r.contact_phone}">${r.contact_phone}</a>)\n` +
        `⏰ <b>প্রয়োজন:</b> ${r.needed_by}\n` +
        (r.note ? `📝 <b>নোট:</b> ${r.note}\n` : "") +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `নিচের বাটন চেপে ডোনার তালিকা বের করুন অথবা স্ট্যাটাস পরিবর্তন করুন:`;

      const kb = [
        [{ text: `🔍 ${r.blood_group} নিকটবর্তী ডোনার ও WhatsApp লিংক`, callback_data: `cb:req_donors:${r.id}` }],
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
      if (!allowedUids.includes(fromId)) {
        await tgAnswerCallback(token, cq.id, "⛔ অননুমোদিত অ্যাক্সেস। আপনি অ্যাডমিন নন।");
        return;
      }

      await tgAnswerCallback(token, cq.id);

      if (data === "cb:menu") {
        const text = "🩸 <b>BRYBDPF রংপুর বিভাগীয় অ্যাডমিন কন্ট্রোল</b> 🩸\n━━━━━━━━━━━━━━━━━━━━\nস্বাগতম! নিচের বাটনগুলো ব্যবহার করে রিয়েলটাইম ডোনার ও রক্তের রিকোয়েস্ট পরিচালনা করুন:";
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
            donorText += `<b>${i + 1}. ${d.name}</b> (${d.area ? d.area + ', ' : ''}${d.district})\n` +
              `   📞 <code>${d.phone}</code> | দান: ${d.total_donations || 0} বার\n\n`;
            
            const grpWaMsg = `আসসালামু আলাইকুম *${d.name}* ভাই,\n` +
              `জরুরি প্রয়োজনে *${bg}* রক্তের জন্য BRYBDPF থেকে যোগাযোগ করা হচ্ছে। রোগীর জীবন রক্ষায় আপনি কি রক্তদান করতে প্রস্তুত আছেন? দয়া করে দ্রুত জানান।\n- BRYBDPF ব্লাড নেটওয়ার্ক`;

            inlineKb.push([
              { text: `💬 ${d.name}-কে WhatsApp মেসেজ`, url: `https://wa.me/${waNumber}?text=${encodeURIComponent(grpWaMsg)}` }
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
          `রোগী: ${req.patient_name} (${req.blood_group}) - ${req.hospital_name}\n` +
          `স্থান: ${req.thana ? req.thana + ', ' : ''}${req.district}\n━━━━━━━━━━━━━━━━━━━━\n`;

        const kb = [];

        if (!donors || donors.length === 0) {
          text += "⚠️ এই মুহূর্তে এই গ্রুপের কোনো প্রস্তুত ডোনার পাওয়া যায়নি।";
        } else {
          donors.forEach((d, i) => {
            const cleanPhone = d.phone.replace(/[^0-9]/g, "");
            const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
            const tierBadge = d.proximity_tier === 1 ? "🎯 <b>[একই থানা]</b>" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [নিকটবর্তী জেলা]");
            
            text += `<b>${i + 1}. ${d.name}</b> (${d.area ? d.area + ', ' : ''}${d.district}) ${tierBadge}\n   📞 <code>${d.phone}</code>\n`;

            const prefilledText = `🚨 *জরুরি রক্তের আবেদন — BRYBDPF* 🚨\n` +
              `───────────────────────\n` +
              `আসসালামু আলাইকুম *${d.name}* ভাই,\n` +
              `জরুরি প্রয়োজনে *${req.blood_group}* (${req.units || 1} ব্যাগ) রক্তের প্রয়োজন।\n\n` +
              `📋 *রোগীর বিবরণ:*\n` +
              `• *রোগী:* ${req.patient_name}\n` +
              `• *হাসপাতাল:* ${req.hospital_name}\n` +
              `• *স্থান/থানা:* ${req.thana ? req.thana + ', ' : ''}${req.district}\n` +
              `• *ঠিকানা/ওয়ার্ড:* ${req.location}\n` +
              `• *কখন লাগবে:* *${req.needed_by}*\n` +
              `• *আবেদনকারী:* ${req.requester_name || "স্বজন"} (*${req.contact_phone}*)\n` +
              (req.note ? `• *নোট:* ${req.note}\n` : "") +
              `───────────────────────\n` +
              `🤲 আপনি কি রক্তদান করতে প্রস্তুত আছেন? দয়া করে দ্রুত জানান।\n\n` +
              `🌐 *BRYBDPF রংপুর বিভাগীয় ব্লাড নেটওয়ার্ক*\n` +
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
      if (!allowedUids.includes(fromId)) {
        await tgSendMessage(token, chatId, "⛔ <b>অননুমোদিত অ্যাক্সেস।</b>\nআপনি এই বটের অনুমোদিত অ্যাডমিন তালিকায় নেই।");
        return;
      }

      // Check if admin is waiting for input
      const adminStateRecord = await env.DB.prepare(
        "SELECT state, data FROM bot_admin_states WHERE admin_uid = ?"
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

        const respText = `✅ <b>রক্তদান সফলভাবে রেকর্ড সম্পন্ন!</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>ডোনার:</b> ${donor.name} (<code>${donor.blood_group}</code>)\n` +
          `📞 <b>ফোন:</b> <code>${donor.phone}</code>\n` +
          `🚻 <b>লিঙ্গ:</b> ${isFemale ? "নারী" : "পুরুষ"} (বিশ্রামকাল: <b>${cooldownDays} দিন</b>)\n` +
          `🩸 <b>সর্বমোট রক্তদান:</b> ${(donor.total_donations || 0) + 1} বার\n\n` +
          `<i>আগামী ${cooldownDays} দিনের জন্য এই রক্তদাতাকে স্বয়ংক্রিয়ভাবে আন-অ্যাক্টিভ (বিশ্রামরত) রাখা হয়েছে।</i>`;

        await tgSendMessage(token, chatId, respText, [
          [{ text: "💉 আরেকটি ডোনেশন মার্ক করুন", callback_data: "cb:mark_donation" }],
          [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
        ]);
        return;
      }

      // State: waiting_for_search_phone
      if (currentState === "waiting_for_search_phone") {
        const cleanPhone = text.replace(/[^0-9]/g, "");
        const donor = await env.DB.prepare(
          "SELECT * FROM donors WHERE phone LIKE ? OR phone LIKE ?"
        ).bind(`%${cleanPhone.slice(-10)}%`, cleanPhone).first();

        if (!donor) {
          await tgSendMessage(token, chatId, `❌ <code>${text}</code> নম্বরে কোনো ডোনার পাওয়া যায়নি। আবার সঠিক নম্বর লিখুন অথবা /menu লিখুন:`);
          return;
        }

        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();

        const isAvail = donor.is_available === 1;
        const respText = `👤 <b>ডোনার প্রোফাইল ও বিস্তারিত তথ্য:</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `<b>নাম:</b> ${donor.name}\n` +
          `<b>রক্তের গ্রুপ:</b> <code>${donor.blood_group}</code>\n` +
          `<b>মোবাইল নম্বর:</b> <code>${donor.phone}</code>\n` +
          `<b>ঠিকানা:</b> ${donor.district}, ${donor.area}\n` +
          `<b>বয়স ও লিঙ্গ:</b> ${donor.age || "-"} বছর | ${donor.gender || "Male"}\n` +
          `<b>স্ট্যাটাস:</b> ${isAvail ? "🟢 সক্রিয় ও প্রস্তুত" : "🔴 সাময়িক অনুপলব্ধ / বিশ্রামে"}\n` +
          `<b>মোট রক্তদান:</b> ${donor.total_donations || 0} বার\n` +
          `<b>সর্বশেষ রক্তদান:</b> ${donor.last_donation_date || "তথ্য নেই"}\n\n` +
          `ব্যবস্থা গ্রহণ করতে নিচের অ্যাকশন বাটন ব্যবহার করুন:`;

        const kb = [
          [
            { text: isAvail ? "⏸️ ৯০ দিন সাসপেন্ড" : "✅ পুনরায় সক্রিয় করুন", callback_data: isAvail ? `cb:donor_suspend:${donor.id}:90` : `cb:donor_reactivate:${donor.id}` },
            { text: "🗑️ স্থায়ীভাবে মুছুন", callback_data: `cb:donor_delete:${donor.id}` }
          ],
          [
            { text: "🔍 অন্য ডোনার খুঁজুন", callback_data: "cb:donor_search" },
            { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
          ]
        ];

        await tgSendMessage(token, chatId, respText, kb);
        return;
      }

      // Default fallback
      await tgSendMessage(token, chatId, "🩸 মেনু দেখতে নিচের বাটনে ক্লিক করুন অথবা /menu লিখুন:", getMainAdminKeyboard());
    }
  } catch (err) {
    console.error("Telegram bot error:", err);
    try {
      if (token && chatId) {
        await tgSendMessage(token, chatId, "⚠️ কমান্ডটি প্রক্রিয়াকরণে সাময়িক সমস্যা হয়েছে। অনুগ্রহ করে /menu লিখে চেষ্টা করুন।");
      }
    } catch (_) {}
  }
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

      if (path === "/api/telegram/webhook" && method === "POST") {
        try {
          const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
          if (secret && secret !== TELEGRAM_WEBHOOK_SECRET) {
            return json({ error: "Invalid secret token" }, 403);
          }
          const update = await request.json();
          ctx.waitUntil(handleTelegramUpdate(update, env, ctx));
          return json({ ok: true });
        } catch (e) {
          return json({ ok: true });
        }
      }

      if (path === "/api/telegram/setup-webhook" && method === "POST") {
        const adminSession = await getAuthenticatedAdmin(request, env);
        if (!adminSession) return json({ error: "Unauthorized" }, 401);

        const { results } = await env.DB.prepare(
          "SELECT value FROM admin_settings WHERE key = 'telegram_bot_token'"
        ).all();
        const token = results && results.length > 0 ? results[0].value : env.TELEGRAM_BOT_TOKEN;
        if (!token) return json({ error: "টেলিগ্রাম বট টোকেন সেট করা নেই।" }, 400);

        const webhookUrl = `${url.origin}/api/telegram/webhook`;
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: TELEGRAM_WEBHOOK_SECRET,
            allowed_updates: ["message", "callback_query"]
          })
        });
        const tgData = await tgRes.json();
        return json({ success: tgData.ok, message: tgData.description || "ওয়েবহুক সফলভাবে কনফিগার হয়েছে!", webhook_url: webhookUrl });
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

      if (path === "/api/donors/search" && method === "GET") {
        const start = performance.now();
        const bg = url.searchParams.get("blood_group") || "";
        const district = url.searchParams.get("district") || "";
        const area = url.searchParams.get("area") || "";
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10), 50);

        let query = "SELECT id, name, blood_group, district, area, age, gender, last_donation_date, total_donations, is_available, phone FROM donors WHERE is_available = 1";
        const params = [];

        if (bg && bg !== "ALL") {
          query += " AND blood_group = ?";
          params.push(bg);
        }

        if (district && district.trim() && district !== "ALL") {
          query += " AND district = ?";
          params.push(district.trim());
        }

        if (area && area.trim() && area !== "ALL") {
          query += " AND area LIKE ?";
          params.push(`%${area.trim()}%`);
        }

        query += " ORDER BY RANDOM() LIMIT ?";
        params.push(limit);

        const stmt = env.DB.prepare(query);
        const { results } = await stmt.bind(...params).all();
        const duration = (performance.now() - start).toFixed(2);

        return json({
          donors: results || [],
          count: (results || []).length,
          duration_ms: duration
        });
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
            INSERT INTO donors (
              name, blood_group, phone, district, area, age, gender,
              last_donation_date, total_donations, is_available,
              agreed_future_donation, agreed_data_save
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
            hospital_name, location, contact_phone, urgency,
            requester_name, requester_blood_group, requester_age, requester_gender,
            requester_district, requester_area,
            captcha_token, captcha_answer, agreed_future_donation, agreed_data_save
          } = body;

          const isCaptchaValid = await verifyCaptcha(captcha_token, captcha_answer);
          if (!isCaptchaValid) {
            return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে পুনরায় চেষ্টা করুন।" }, 400);
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

          const insertReqStmt = env.DB.prepare(`
            INSERT INTO blood_requests (
              patient_name, blood_group, units, district, thana, hospital_name,
              location, contact_phone, urgency, needed_by, note, requester_name,
              status, requester_blood_group
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
          `);

          const reqInsertRes = await insertReqStmt.bind(
            patient_name.trim(),
            blood_group,
            parseInt(units, 10),
            (district || "রংপুর").trim(),
            thana ? thana.trim() : null,
            hospital_name.trim(),
            location.trim(),
            cleanPhone,
            urgency || "Emergency",
            needed_by.trim(),
            body.note ? body.note.trim() : "",
            requester_name ? requester_name.trim() : "স্বজন",
            requester_blood_group || null
          ).run();

          const donorBloodGroupToRegister = requester_blood_group || blood_group;
          const donorNameToRegister = requester_name ? requester_name.trim() : patient_name.trim();
          const donorDistrictToRegister = requester_district ? requester_district.trim() : (district || "রংপুর").trim();
          const donorAreaToRegister = requester_area ? requester_area.trim() : (thana || location).trim();
          const donorAgeToRegister = requester_age ? parseInt(requester_age, 10) : 25;
          const donorGenderToRegister = requester_gender || "Male";

          const existingDonor = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
          if (!existingDonor) {
            await env.DB.prepare(`
              INSERT INTO donors (
                name, blood_group, phone, district, area, age, gender,
                is_available, agreed_future_donation, agreed_data_save
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
              SELECT name, blood_group, district, area, phone,
                (CASE 
                  WHEN district = ? AND area LIKE ? AND ? != '' THEN 1
                  WHEN district = ? THEN 2
                  ELSE 3
                END) as proximity_tier
              FROM donors 
              WHERE blood_group = ? AND is_available = 1 AND phone != ?
              ORDER BY 
                proximity_tier ASC,
                RANDOM()
              LIMIT 20
            `).bind(
              cleanDist, `%${cleanThana}%`, cleanThana,
              cleanDist,
              blood_group, cleanPhone
            ).all();
            matchedDonors = results || [];
          } catch (e) {
            console.error("Donor match query error:", e);
          }

          ctx.waitUntil(sendTelegramAlert(env, {
            patient_name,
            blood_group,
            units,
            district,
            thana,
            hospital_name,
            location,
            contact_phone: cleanPhone,
            needed_by,
            note: body.note,
            requester_name,
            requester_blood_group
          }, matchedDonors));

          return json({
            success: true,
            message: "আপনার রক্তের রিকোয়েস্ট সফলভাবে গৃহীত হয়েছে! নিকটবর্তী ও প্রস্তুত ডোনারদের সাথে সমন্বয় এবং টেলিগ্রাম অ্যালার্ট প্রক্রিয়া শুরু হয়েছে।",
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
          return json({ error: "অ্যাডমিন ইতিমধ্যে কনফিগার করা আছে। নতুন অ্যাডমিন তৈরি সম্পূর্ণ নিষিদ্ধ।" }, 403);
        }

        const { email, password, telegram_token, telegram_uids } = await request.json();
        if (!email || !password || password.length < 8) {
          return json({ error: "সঠিক ইমেইল এবং কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
        }

        const salt = generateRandomToken(16);
        const hash = await hashPassword(password, salt);

        await env.DB.prepare("INSERT INTO admins (email, password_hash, salt, role) VALUES (?, ?, ?, 'superadmin')")
          .bind(email.trim().toLowerCase(), hash, salt)
          .run();

        if (telegram_token && telegram_token.trim()) {
          const cleanToken = telegram_token.trim();
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)")
            .bind(cleanToken)
            .run();

          try {
            const webhookUrl = `${url.origin}/api/telegram/webhook`;
            await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: webhookUrl,
                secret_token: TELEGRAM_WEBHOOK_SECRET,
                allowed_updates: ["message", "callback_query"]
              })
            });
          } catch (tgErr) {
            console.error("Auto webhook setup error:", tgErr);
          }
        }

        if (telegram_uids && telegram_uids.trim()) {
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)")
            .bind(telegram_uids.trim())
            .run();
        }

        return json({ success: true, message: "অ্যাডমিন সফলভাবে কনফিগার করা হয়েছে!" });
      }

      if (path === "/api/admin/login" && method === "POST") {
        const { email, password } = await request.json();
        if (!email || !password) {
          return json({ error: "ইমেইল এবং পাসওয়ার্ড প্রদান করুন।" }, 400);
        }

        const cleanEmail = email.trim().toLowerCase();
        const attemptsKey = `attempts_${cleanEmail}_${ip}`;
        const attemptsRecord = await env.DB.prepare("SELECT attempt_count, last_attempt FROM login_rate_limit WHERE ip_key = ?").bind(attemptsKey).first();

        if (attemptsRecord && attemptsRecord.attempt_count >= 5) {
          const lastTime = new Date(attemptsRecord.last_attempt).getTime();
          if (Date.now() - lastTime < 15 * 60 * 1000) {
            return json({ error: "অতিরিক্ত ভুল চেষ্টার কারণে ১৫ মিনিটের জন্য লগইন স্থগিত করা হয়েছে।" }, 429);
          } else {
            await env.DB.prepare("DELETE FROM login_rate_limit WHERE ip_key = ?").bind(attemptsKey).run();
          }
        }

        // Case-insensitive email search
        const admin = await env.DB.prepare(
          "SELECT id, email, password_hash, salt, role FROM admins WHERE LOWER(email) = LOWER(?)"
        ).bind(cleanEmail).first();

        if (!admin) {
          await env.DB.prepare("INSERT INTO login_rate_limit (ip_key, attempt_count, last_attempt) VALUES (?, 1, datetime('now')) ON CONFLICT(ip_key) DO UPDATE SET attempt_count = attempt_count + 1, last_attempt = datetime('now')").bind(attemptsKey).run();
          return json({ error: "ভুল ইমেইল অথবা পাসওয়ার্ড।" }, 401);
        }

        const calculatedHash = await hashPassword(password, admin.salt);
        if (calculatedHash !== admin.password_hash) {
          await env.DB.prepare("INSERT INTO login_rate_limit (ip_key, attempt_count, last_attempt) VALUES (?, 1, datetime('now')) ON CONFLICT(ip_key) DO UPDATE SET attempt_count = attempt_count + 1, last_attempt = datetime('now')").bind(attemptsKey).run();
          return json({ error: "ভুল ইমেইল অথবা পাসওয়ার্ড।" }, 401);
        }

        await env.DB.prepare("DELETE FROM login_rate_limit WHERE ip_key = ?").bind(attemptsKey).run();

        const sessionToken = generateRandomToken(32);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // Insert into sessions table
        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO sessions (token, admin_email, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
          ).bind(sessionToken, admin.email).run();
        } catch(e) {}

        // Insert into admin_sessions table
        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO admin_sessions (admin_id, token, expires_at) VALUES (?, ?, ?)"
          ).bind(admin.id, sessionToken, expiresAt).run();
        } catch(e) {}

        return json({
          success: true,
          token: sessionToken,
          admin_email: admin.email,
          admin: { email: admin.email, role: admin.role },
          message: "লগইন সফল হয়েছে!"
        }, 200, {
          "Set-Cookie": `brybdpf_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
        });
      }

      if (path === "/api/admin/logout" && method === "POST") {
        const adminSession = await getAuthenticatedAdmin(request, env);
        if (adminSession) {
          try { await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(adminSession.token).run(); } catch(e) {}
          try { await env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(adminSession.token).run(); } catch(e) {}
        }
        return json({ success: true }, 200, {
          "Set-Cookie": `brybdpf_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        });
      }

      if (path.startsWith("/api/admin/")) {
        const adminSession = await getAuthenticatedAdmin(request, env);
        if (!adminSession) {
          return json({ error: "অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে লগইন করুন।" }, 401);
        }

        if (path === "/api/admin/data" && method === "GET") {
          const [totalDonors, activeDonors, totalRequests, pendingRequests] = await Promise.all([
            env.DB.prepare("SELECT count(*) as count FROM donors").first(),
            env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE (created_at >= datetime('now', '-10 days') OR created_at IS NULL)").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE status = 'Pending' AND (created_at >= datetime('now', '-10 days') OR created_at IS NULL)").first()
          ]);

          return json({
            admin_email: adminSession.admin_email || adminSession.email,
            total_donors: totalDonors?.count || 0,
            active_donors: activeDonors?.count || 0,
            total_requests: totalRequests?.count || 0,
            pending_requests: pendingRequests?.count || 0
          });
        }

        if (path === "/api/admin/donors" && method === "GET") {
          const bg = url.searchParams.get("blood_group") || "";
          const search = url.searchParams.get("search") || "";

          let query = "SELECT id, name, blood_group, phone, district, area, age, gender, last_donation_date, total_donations, is_available, created_at FROM donors WHERE 1=1";
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
          const { results } = await env.DB.prepare(query).bind(...params).all();
          return json({ donors: results || [] });
        }

        if (path.match(/^\/api\/admin\/donors\/\d+\/toggle$/) && method === "POST") {
          const id = path.split("/")[4];
          await env.DB.prepare("UPDATE donors SET is_available = CASE WHEN is_available = 1 THEN 0 ELSE 1 END WHERE id = ?").bind(id).run();
          return json({ success: true });
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

          let whereClause = "WHERE (created_at >= datetime('now', '-10 days') OR created_at IS NULL)";
          const params = [];

          const validStatuses = ["Pending", "Matched", "Fulfilled", "Closed"];
          if (status && status !== "ALL" && validStatuses.includes(status)) {
            whereClause += " AND status = ?";
            params.push(status);
          }

          const countQuery = "SELECT count(*) as total FROM blood_requests " + whereClause;
          const countStmt = params.length > 0 ? env.DB.prepare(countQuery).bind(...params) : env.DB.prepare(countQuery);
          const totalRes = await countStmt.first();
          const total = totalRes ? totalRes.total : 0;

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

        if (path.match(/^\/api\/admin\/requests\/\d+\/status$/) && method === "PATCH") {
          const id = path.split("/")[4];
          const { status } = await request.json();
          const validStatuses = ["Pending", "Matched", "Fulfilled", "Closed"];
          if (!validStatuses.includes(status)) {
            return json({ error: "অবৈধ স্ট্যাটাস।" }, 400);
          }
          await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(status, id).run();
          return json({ success: true, status });
        }

        if (path.match(/^\/api\/admin\/requests\/\d+\/match-donors$/) && method === "GET") {
          const id = path.split("/")[4];
          const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(id).first();
          if (!req) return json({ error: "রিকোয়েস্ট পাওয়া যায়নি।" }, 404);

          const reqThana = req.thana || "";
          const reqDist = (req.district || "রংপুর").trim();

          const { results } = await env.DB.prepare(`
            SELECT id, name, blood_group, district, area, phone, age,
              (CASE 
                WHEN district = ? AND area LIKE ? AND ? != '' THEN 1
                WHEN district = ? THEN 2
                ELSE 3
              END) as proximity_tier
            FROM donors 
            WHERE blood_group = ? AND is_available = 1 
            ORDER BY proximity_tier ASC, id DESC LIMIT 20
          `).bind(reqDist, `%${reqThana}%`, reqThana, reqDist, req.blood_group).all();

          return json({
            request_id: req.id,
            patient_name: req.patient_name,
            blood_group: req.blood_group,
            district: req.district,
            thana: req.thana,
            hospital_name: req.hospital_name,
            contact_phone: req.contact_phone,
            donors: results || []
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
              .bind(cleanToken)
              .run();

            try {
              const webhookUrl = `${url.origin}/api/telegram/webhook`;
              await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: webhookUrl,
                  secret_token: TELEGRAM_WEBHOOK_SECRET,
                  allowed_updates: ["message", "callback_query"]
                })
              });
            } catch (tgErr) {
              console.error("Auto webhook setup error:", tgErr);
            }
          }

          if (telegram_admin_uids !== undefined) {
            await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)")
              .bind(telegram_admin_uids.trim())
              .run();
          }

          return json({ success: true });
        }

        if (path === "/api/admin/change-password" && method === "POST") {
          const { current_password, new_password } = await request.json();

          if (!new_password || new_password.length < 8) {
            return json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" }, 400);
          }

          const admin = await env.DB.prepare("SELECT id, password_hash, salt FROM admins WHERE LOWER(email) = LOWER(?)").bind(adminSession.admin_email || adminSession.email).first();
          const calcCurrentHash = await hashPassword(current_password, admin.salt);
          if (calcCurrentHash !== admin.password_hash) {
            return json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" }, 400);
          }

          const newSalt = generateRandomToken(16);
          const newHash = await hashPassword(new_password, newSalt);

          await env.DB.prepare("UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?").bind(newHash, newSalt, admin.id).run();
          return json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!" });
        }

        if (path === "/api/admin/test-telegram" && method === "POST") {
          const testRequest = {
            patient_name: "টেস্ট রোগী",
            blood_group: "O+",
            units: 1,
            hospital_name: "রংপুর মেডিকেল কলেজ হাসপাতাল",
            district: "রংপুর",
            thana: "কোতোয়ালি",
            location: "জরুরি বিভাগ",
            contact_phone: "01700000000",
            urgency: "Testing",
            needed_by: "জরুরি",
            note: "BRYBDPF রংপুর বিভাগীয় টেলিগ্রাম বট সফলভাবে কাজ করছে!"
          };
          const sampleDonors = [
            { name: "করিম হোসেন", blood_group: "O+", district: "রংপুর", area: "কোতোয়ালি", phone: "01711111111", proximity_tier: 1 },
            { name: "রাকিব হাসান", blood_group: "O+", district: "নীলফামারী", area: "সৈয়দপুর", phone: "01822222222", proximity_tier: 3 }
          ];
          await sendTelegramAlert(env, testRequest, sampleDonors);
          
          try {
            const { results } = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_admin_uids'").all();
            const tokenRes = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_bot_token'").first();
            if (results && results.length > 0 && tokenRes) {
              const uids = results[0].value.split(',').map(u => u.trim()).filter(Boolean);
              for (const uid of uids) {
                await tgSendMessage(tokenRes.value, uid, "🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল বাটন</b> 🩸\nনিচের বাটনগুলো চেপে সরাসরি বটের ফিচারগুলো পরীক্ষা করুন:", getMainAdminKeyboard());
              }
            }
          } catch(e) {}

          return json({ success: true, message: "টেলিগ্রাম টেস্ট মেসেজ ও কন্ট্রোল বাটন পাঠানো হয়েছে! টেলিগ্রাম চেক করুন।" });
        }
      }

      if (path === "/admin" || path === "/admin/") return context.next();
      return context.next();
    } catch (uncaughtError) {
      return new Response("Application Error: " + (uncaughtError.stack || uncaughtError.message), {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

}
