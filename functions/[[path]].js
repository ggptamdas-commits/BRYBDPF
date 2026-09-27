async function ensureCoreTables(env) {
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT,
        created_at TEXT
      )
    `).run();
  } catch (e) {
    console.error("Table ensure error:", e);
  }
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
  const hashArray = Array.from(new Uint8Array(derivedKey));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateRandomToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyCaptcha(token, answer) {
  try {
    if (!token || !answer) return false;
    const parts = token.split(":");
    if (parts.length !== 3) return false;
    const [num1Str, num2Str, timestampStr] = parts;
    const num1 = parseInt(num1Str, 10);
    const num2 = parseInt(num2Str, 10);
    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    if (isNaN(num1) || isNaN(num2) || isNaN(timestamp)) return false;
    if (now - timestamp > 10 * 60 * 1000) return false;
    return parseInt(answer, 10) === (num1 + num2);
  } catch (e) {
    return false;
  }
}

async function isRateLimited(env, ip, action, maxAttempts = 5, windowMinutes = 15) {
  try {
    const key = `rl:${action}:${ip}`;
    const now = new Date().toISOString();
    const threshold = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM rate_limits WHERE created_at < ?").bind(threshold).run();
    const countRes = await env.DB.prepare("SELECT count(*) as count FROM rate_limits WHERE key = ? AND created_at >= ?").bind(key, threshold).first();
    const count = countRes ? countRes.count : 0;
    if (count >= maxAttempts) return true;
    await env.DB.prepare("INSERT INTO rate_limits (key, created_at) VALUES (?, ?)").bind(key, now).run();
    return false;
  } catch (err) {
    return false;
  }
}

async function sendTelegramAlert(env, requestData, matchedDonors) {
  try {
    let token = "";
    let adminUidsStr = "";
    const { results } = await env.DB.prepare("SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids')").all();
    for (const r of results) {
      if (r.key === "telegram_bot_token") token = r.value;
      if (r.key === "telegram_admin_uids") adminUidsStr = r.value;
    }
    if (!token && env.TELEGRAM_BOT_TOKEN) token = env.TELEGRAM_BOT_TOKEN;
    if (!adminUidsStr && env.TELEGRAM_ADMIN_IDS) adminUidsStr = env.TELEGRAM_ADMIN_IDS;
    if (!token || !adminUidsStr) return;

    const uids = adminUidsStr.split(",").map(u => u.trim()).filter(Boolean);
    if (uids.length === 0) return;

    const reqCleanPhone = requestData.contact_phone.replace(/[^0-9]/g, "");
    const reqWaNumber = reqCleanPhone.startsWith("88") ? reqCleanPhone : (reqCleanPhone.startsWith("0") ? "88" + reqCleanPhone : reqCleanPhone);

    let donorText = "";
    const inlineButtons = [];

    if (matchedDonors && matchedDonors.length > 0) {
      donorText = matchedDonors.slice(0, 15).map((d, i) => {
        const cleanPhone = d.phone.replace(/[^0-9]/g, "");
        const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
        
        // 1-Click WhatsApp pre-filled message with full patient & applicant info
        const prefilledPrompt = `আসসালামু আলাইকুম ${d.name} ভাই,\n` +
          `BRYBDPF থেকে রক্তের জরুরি প্রয়োজনে যোগাযোগ করা হচ্ছে:\n` +
          `🩸 প্রয়োজনীয় রক্ত: ${requestData.blood_group} (${requestData.units || 1} ব্যাগ)\n` +
          `👤 রোগী: ${requestData.patient_name}\n` +
          `🏥 হাসপাতাল: ${requestData.hospital_name}, ${requestData.district}\n` +
          `📍 ঠিকানা: ${requestData.location}\n` +
          `⏰ প্রয়োজনের সময়: ${requestData.needed_by}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `আবেদনকারী: ${requestData.requester_name || "স্বজন"}\n` +
          `📞 যোগাযোগের নম্বর: ${requestData.contact_phone}\n` +
          (requestData.note ? `📝 নোট: ${requestData.note}\n` : "") +
          `━━━━━━━━━━━━━━━━\n` +
          `রোগীর জীবন রক্ষায় আপনি কি রক্তদানে সহযোগিতা করতে পারবেন? অনুগ্রহ করে দ্রুত জানান।\n` +
          `- BRYBDPF ব্লাড নেটওয়ার্ক (https://brybdpf.pages.dev)`;

        const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(prefilledPrompt)}`;

        if (i < 6) {
          inlineButtons.push([{ text: `💬 WhatsApp: ${d.name} (${d.district})`, url: waUrl }]);
        }

        return `${i + 1}. <b>${d.name}</b> (${d.blood_group}) - ${d.district}, ${d.area}\n   📞 <a href="tel:${d.phone}">${d.phone}</a> | 💬 <a href="${waUrl}">WhatsApp বার্তা পাঠান</a>`;
      }).join("\n\n");
    } else {
      donorText = "⚠️ এই গ্রুপের কোনো সক্রিয় ডোনার তাৎক্ষণিকভাবে পাওয়া যায়নি।";
    }

    let shareMessage = `আসসালামু আলাইকুম, BRYBDPF থেকে আপনার কাঙ্ক্ষিত ${requestData.blood_group} রক্তের ডোনার তালিকা:\n\n`;
    if (matchedDonors && matchedDonors.length > 0) {
      shareMessage += matchedDonors.slice(0, 10).map((d, i) => `${i+1}. ${d.name} (${d.district}) - ${d.phone}`).join("\n");
    } else {
      shareMessage += "এই মুহূর্তে প্রস্তুত কোনো ডোনার পাওয়া যায়নি।";
    }
    shareMessage += `\n\n- BRYBDPF জরুরি রক্ত সহায়তা (https://brybdpf.pages.dev)`;

    const waShareUrl = `https://wa.me/${reqWaNumber}?text=${encodeURIComponent(shareMessage)}`;

    const messageHtml = `🚨 <b>জরুরি রক্তের নতুন আবেদন (BRYBDPF)</b> 🚨\n\n` +
      `🩸 <b>গ্রুপ:</b> <code>${requestData.blood_group}</code> (${requestData.units || 1} ব্যাগ)\n` +
      `👤 <b>রোগী:</b> ${requestData.patient_name}\n` +
      `🏥 <b>হাসপাতাল:</b> ${requestData.hospital_name}, ${requestData.district}\n` +
      `📍 <b>ঠিকানা:</b> ${requestData.location}\n` +
      `⏰ <b>কখন লাগবে:</b> ${requestData.needed_by}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `আবেদনকারী: ${requestData.requester_name || "স্বজন"}\n` +
      `📞 <b>যোগাযোগের নম্বর:</b> <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>\n` +
      (requestData.note ? `📝 <b>নোট:</b> ${requestData.note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>রোগীর জন্য প্রস্তুত ডোনার তালিকা (${requestData.blood_group}):</b>\n\n` +
      donorText + `\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <b>আবেদনকারীকে ডোনার তালিকা পাঠাতে:</b> <a href="${waShareUrl}">WhatsApp শেয়ার</a>`;

    inlineButtons.push([{ text: "⚡ আবেদনকারীকে WhatsApp-এ ডোনার তালিকা পাঠান", url: waShareUrl }]);

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
    console.error("Telegram alert error:", err);
  }
}

async function getAuthenticatedAdmin(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  const session = await env.DB.prepare(
    "SELECT * FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
  ).bind(token).first();
  if (session) {
    const admin = await env.DB.prepare("SELECT id, email, role FROM admins WHERE id = ?").bind(session.admin_id).first();
    return admin;
  }
  return null;
}

const TELEGRAM_WEBHOOK_SECRET = "BRYBDPF_TG_SECURE_TOKEN_2026";

async function tgSendMessage(token, chatId, text, replyMarkup = null, parseMode = "HTML") {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true
  };
  if (replyMarkup) {
    if (Array.isArray(replyMarkup)) {
      payload.reply_markup = { inline_keyboard: replyMarkup };
    } else {
      payload.reply_markup = replyMarkup;
    }
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
    parse_mode: parseMode,
    disable_web_page_preview: true
  };
  if (inlineKeyboard) {
    payload.reply_markup = { inline_keyboard: inlineKeyboard };
  }
  return fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function tgAnswerCallback(token, callbackQueryId, text = null) {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function getMainAdminReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "📊 পরিসংখ্যান ও গ্রুপ ডাটা" }, { text: "🩸 গ্রুপভিত্তিক ডোনার" }],
      [{ text: "📋 পেন্ডিং রিকোয়েস্ট" }, { text: "💉 রক্তদান (Donated) মার্ক" }],
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
      { text: "💉 রক্তদান (Donated) মার্ক", callback_data: "cb:mark_donation" }
    ],
    [
      { text: "🔍 ডোনার সার্চ / অ্যাকশন", callback_data: "cb:donor_search" },
      { text: "🔄 রিফ্রেশ মেনু", callback_data: "cb:menu" }
    ]
  ];
}

let isWebhookEnsured = false;
async function ensureTelegramWebhook(env, origin) {
  if (isWebhookEnsured || !origin || origin.includes("localhost") || origin.includes("127.0.0.1")) return;
  try {
    const { results } = await env.DB.prepare(
      "SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_webhook_synced')"
    ).all();
    let token = env.TELEGRAM_BOT_TOKEN || "";
    let syncedOrigin = "";
    for (const s of (results || [])) {
      if (s.key === "telegram_bot_token" && s.value) token = s.value;
      if (s.key === "telegram_webhook_synced") syncedOrigin = s.value;
    }
    if (!token) return;

    if (syncedOrigin !== origin) {
      const webhookUrl = `${origin}/api/telegram/webhook`;
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ["message", "callback_query"]
        })
      });
      const data = await tgRes.json();
      if (data.ok) {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_webhook_synced', ?, datetime('now'))"
        ).bind(origin).run();
        isWebhookEnsured = true;
      }
    } else {
      isWebhookEnsured = true;
    }
  } catch (e) {
    console.error("Auto webhook sync failed:", e);
  }
}

async function handleTelegramUpdate(update, env, ctx) {
  try {
    let token = "";
    let adminUidsStr = "";

    // Ensure bot session table exists
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

    // 1. Handle Callback Queries (Button Clicks)
    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = String(cq.from?.id || "");
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = cq.data || "";

      // Anti-Hijack Authorization Check
      if (!allowedUids.includes(fromId)) {
        await tgAnswerCallback(token, cq.id, "⛔ অননুমোদিত অ্যাক্সেস। আপনি অ্যাডমিন নন।");
        return;
      }

      await tgAnswerCallback(token, cq.id);

      if (data === "cb:menu") {
        const text = "🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল</b> 🩸\n━━━━━━━━━━━━━━━━━━━━\nস্বাগতম! নিচের বাটনগুলো ব্যবহার করে রিয়েলটাইম ডোনার ও রক্তের রিকোয়েস্ট পরিচালনা করুন:";
        await tgEditMessage(token, chatId, messageId, text, getMainAdminKeyboard());
        return;
      }

      if (data === "cb:stats") {
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

        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }

      if (data === "cb:groups") {
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
        await tgEditMessage(token, chatId, messageId, text, kb);
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

        await tgEditMessage(token, chatId, messageId, donorText, inlineKb);
        return;
      }

      if (data === "cb:pending") {
        const { results: pendingReqs } = await env.DB.prepare(
          "SELECT * FROM blood_requests WHERE status = 'Pending' AND (created_at >= datetime('now', '-10 days') OR created_at IS NULL) ORDER BY id DESC LIMIT 5"
        ).all();

        if (!pendingReqs || pendingReqs.length === 0) {
          const text = "✅ <b>বিগত ১০ দিনে কোনো অপেক্ষমাণ (Pending) রিকোয়েস্ট নেই।</b>\nসকল রিকোয়েস্ট সফলভাবে সম্পন্ন হয়েছে!";
          const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
          await tgEditMessage(token, chatId, messageId, text, kb);
          return;
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

        await tgEditMessage(token, chatId, messageId, text, kb);
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

        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }

      if (data.startsWith("cb:req_donors:")) {
        const reqId = data.replace("cb:req_donors:", "");
        const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(reqId).first();
        if (!req) {
          await tgAnswerCallback(token, cq.id, "রিকোয়েস্ট পাওয়া যায়নি।");
          return;
        }

        const { results: donors } = await env.DB.prepare(
          "SELECT name, blood_group, district, area, phone FROM donors WHERE blood_group = ? AND is_available = 1 ORDER BY (CASE WHEN district LIKE ? THEN 0 ELSE 1 END), id DESC LIMIT 6"
        ).bind(req.blood_group, `%${req.district}%`).all();

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

            const prefilledText = `আসসালামু আলাইকুম ${d.name} ভাই,\n` +
              `জরুরি প্রয়োজনে ${req.blood_group} (${req.units || 1} ব্যাগ) রক্তের প্রয়োজন।\n` +
              `রোগী: ${req.patient_name}\n` +
              `হাসপাতাল: ${req.hospital_name}, ${req.district}\n` +
              `ঠিকানা: ${req.location}\n` +
              `আবেদনকারী: ${req.requester_name || "স্বজন"} (${req.contact_phone})\n` +
              `প্রয়োজনের সময়: ${req.needed_by}\n\n` +
              `আপনি কি রক্তদান করতে প্রস্তুত আছেন? দয়া করে দ্রুত জানান।\n- BRYBDPF ব্লাড নেটওয়ার্ক`;

            kb.push([
              { text: `💬 WhatsApp: ${d.name}`, url: `https://wa.me/${waNumber}?text=${encodeURIComponent(prefilledText)}` }
            ]);
          });
        }

        // WhatsApp share to recipient button
        const reqCleanPhone = req.contact_phone.replace(/[^0-9]/g, "");
        const reqWaNumber = reqCleanPhone.startsWith("88") ? reqCleanPhone : (reqCleanPhone.startsWith("0") ? "88" + reqCleanPhone : reqCleanPhone);
        let shareList = `আসসালামু আলাইকুম, BRYBDPF থেকে আপনার ${req.blood_group} রক্তের সম্ভাব্য ডোনার তালিকা:\n\n`;
        if (donors && donors.length > 0) {
          shareList += donors.map((d, i) => `${i+1}. ${d.name} (${d.district}) - ${d.phone}`).join("\n");
        }
        shareList += `\n\n- BRYBDPF জরুরি রক্ত সহায়তা (https://brybdpf.pages.dev)`;
        const waShareUrl = `https://wa.me/${reqWaNumber}?text=${encodeURIComponent(shareList)}`;

        kb.push([
          { text: "⚡ আবেদনকারীকে WhatsApp-এ তালিকা পাঠান", url: waShareUrl }
        ]);
        kb.push([
          { text: "🤝 Matched মার্ক করুন", callback_data: `cb:req_status:${req.id}:Matched` },
          { text: "✅ Fulfilled মার্ক করুন", callback_data: `cb:req_status:${req.id}:Fulfilled` }
        ]);
        kb.push([
          { text: "📋 পেন্ডিং তালিকায় ফিরুন", callback_data: "cb:pending" },
          { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
        ]);

        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }

      if (data === "cb:mark_donation") {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, updated_at) VALUES (?, 'waiting_for_donation_phone', datetime('now'))"
        ).bind(fromId).run();

        const text = `💉 <b>রক্তদান সম্পন্ন (Donated) মার্ক করুন</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `যে ডোনার রক্তদান সম্পন্ন করেছেন, তার <b>মোবাইল নম্বরটি</b> লিখে পাঠান (যেমন: <code>017XXXXXXXX</code>):\n\n` +
          `<i>ℹ️ নিয়ম: পুরুষদের ক্ষেত্রে স্বয়ংক্রিয়ভাবে ৯০ দিন (৩ মাস) এবং নারীদের ক্ষেত্রে ১২০ দিন (৪ মাস) ডোনার রেস্টে থাকবে এবং এই সময়ে তাকে প্রস্তুত তালিকায় দেখানো হবে না।</i>`;

        const kb = [[{ text: "❌ বাতিল করুন", callback_data: "cb:menu" }]];
        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }

      if (data === "cb:donor_search") {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO bot_admin_states (admin_uid, state, updated_at) VALUES (?, 'waiting_for_search_phone', datetime('now'))"
        ).bind(fromId).run();

        const text = `🔍 <b>ডোনার অনুসন্ধান ও ব্যবস্থা গ্রহণ</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `যে ডোনারের বিস্তারিত তথ্য দেখতে চান অথবা যার বিরুদ্ধে কোনো অভিযোগ রয়েছে, তার <b>মোবাইল নম্বরটি</b> লিখে পাঠান:`;

        const kb = [[{ text: "❌ বাতিল করুন", callback_data: "cb:menu" }]];
        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }

      if (data.startsWith("cb:donor_donate:")) {
        const donorId = data.replace("cb:donor_donate:", "");
        const donor = await env.DB.prepare("SELECT * FROM donors WHERE id = ?").bind(donorId).first();
        if (!donor) {
          await tgAnswerCallback(token, cq.id, "ডোনার পাওয়া যায়নি।");
          return;
        }

        const isFemale = (donor.gender || "").toLowerCase().includes("fem") || donor.gender === "নারী" || (donor.gender || "").toLowerCase() === "f";
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

        await tgEditMessage(token, chatId, messageId, respText, [
          [{ text: "💉 আরেকটি ডোনেশন মার্ক করুন", callback_data: "cb:mark_donation" }],
          [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
        ]);
        return;
      }

      if (data.startsWith("cb:donor_ban:")) {
        const donorId = data.replace("cb:donor_ban:", "");
        await env.DB.prepare(
          "UPDATE donors SET is_available = 0, last_donation_date = '2099-12-31' WHERE id = ?"
        ).bind(donorId).run();
        const text = `🚫 <b>ডোনার (ID #${donorId}) কে স্থায়ীভাবে ব্যান/ব্লক করা হয়েছে!</b>\nতার তথ্য কোনো জরুরি রিকোয়েস্টে আসবে না।`;
        const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }

      if (data.startsWith("cb:donor_delete:")) {
        const donorId = data.replace("cb:donor_delete:", "");
        await env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(donorId).run();
        const text = `🗑️ <b>ডোনার (ID #${donorId}) সফলভাবে ডাটাবেজ থেকে মুছে ফেলা হয়েছে!</b>`;
        const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
        await tgEditMessage(token, chatId, messageId, text, kb);
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
        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }

      if (data.startsWith("cb:donor_reactivate:")) {
        const donorId = data.replace("cb:donor_reactivate:", "");
        await env.DB.prepare(
          "UPDATE donors SET is_available = 1 WHERE id = ?"
        ).bind(donorId).run();

        const text = `✅ <b>ডোনার (ID #${donorId}) সফলভাবে পুনরায় সক্রিয় (Active) করা হয়েছে!</b>`;
        const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
        await tgEditMessage(token, chatId, messageId, text, kb);
        return;
      }
    }

    // 2. Handle Text Messages
    if (update.message) {
      const msg = update.message;
      const fromId = String(msg.from?.id || "");
      const chatId = msg.chat?.id;
      const text = (msg.text || "").trim();

      // Anti-Hijack Authorization Check
      if (!allowedUids.includes(fromId)) {
        await tgSendMessage(token, chatId, "⛔ <b>অননুমোদিত অ্যাক্সেস।</b>\nআপনি এই বটের অনুমোদিত অ্যাডমিন তালিকায় নেই।");
        return;
      }

      // Check if admin is in a state (waiting for phone number)
      const adminStateRecord = await env.DB.prepare(
        "SELECT state, data FROM bot_admin_states WHERE admin_uid = ?"
      ).bind(fromId).first();

      const currentState = adminStateRecord ? adminStateRecord.state : "";

      if (text === "/start" || text === "/menu" || text === "মেনু" || text === "🔄 রিফ্রেশ মেনু" || text === "রিফ্রেশ") {
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

      if (text === "/stats" || text === "পরিসংখ্যান" || text === "📊 পরিসংখ্যান" || text === "📊 পরিসংখ্যান ও গ্রুপ ডাটা") {
        const cqFake = { id: "stats", from: msg.from, message: { chat: msg.chat, message_id: msg.message_id }, data: "cb:stats" };
        update.callback_query = cqFake;
        update.message = null;
        return handleTelegramUpdate(update, env, ctx);
      }

      if (text === "/groups" || text === "গ্রুপ" || text === "🩸 গ্রুপভিত্তিক ডোনার") {
        const cqFake = { id: "groups", from: msg.from, message: { chat: msg.chat, message_id: msg.message_id }, data: "cb:groups" };
        update.callback_query = cqFake;
        update.message = null;
        return handleTelegramUpdate(update, env, ctx);
      }

      if (text === "/pending" || text === "পেন্ডিং" || text === "📋 পেন্ডিং রিকোয়েস্ট") {
        const cqFake = { id: "pending", from: msg.from, message: { chat: msg.chat, message_id: msg.message_id }, data: "cb:pending" };
        update.callback_query = cqFake;
        update.message = null;
        return handleTelegramUpdate(update, env, ctx);
      }

      if (text === "/donate" || text === "/donated" || text === "ডোনেশন" || text === "💉 রক্তদান (Donated) মার্ক" || text === "💉 ডোনেশন মার্ক") {
        const cqFake = { id: "mark_donation", from: msg.from, message: { chat: msg.chat, message_id: msg.message_id }, data: "cb:mark_donation" };
        update.callback_query = cqFake;
        update.message = null;
        return handleTelegramUpdate(update, env, ctx);
      }

      if (text === "/search" || text === "সার্চ" || text === "🔍 ডোনার সার্চ / অ্যাকশন" || text === "🔍 ডোনার সার্চ") {
        const cqFake = { id: "donor_search", from: msg.from, message: { chat: msg.chat, message_id: msg.message_id }, data: "cb:donor_search" };
        update.callback_query = cqFake;
        update.message = null;
        return handleTelegramUpdate(update, env, ctx);
      }

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

        // Clear state
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();

        const isFemale = (donor.gender || "").toLowerCase().includes("fem") || donor.gender === "নারী" || (donor.gender || "").toLowerCase() === "f";
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

      if (currentState === "waiting_for_search_phone") {
        const cleanPhone = text.replace(/[^0-9]/g, "");
        const donor = await env.DB.prepare(
          "SELECT * FROM donors WHERE phone LIKE ? OR phone LIKE ?"
        ).bind(`%${cleanPhone.slice(-10)}%`, cleanPhone).first();

        if (!donor) {
          await tgSendMessage(token, chatId, `❌ <code>${text}</code> নম্বরে কোনো ডোনার পাওয়া যায়নি। আবার সঠিক নম্বর লিখুন অথবা /menu লিখুন:`);
          return;
        }

        // Clear state
        await env.DB.prepare("DELETE FROM bot_admin_states WHERE admin_uid = ?").bind(fromId).run();

        const isAvail = donor.is_available === 1;
        const isFemale = (donor.gender || "").toLowerCase().includes("fem") || donor.gender === "নারী" || (donor.gender || "").toLowerCase() === "f";
        const respText = `👤 <b>ডোনার প্রোফাইল ও বিস্তারিত তথ্য:</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `<b>নাম:</b> ${donor.name}\n` +
          `<b>রক্তের গ্রুপ:</b> <code>${donor.blood_group}</code>\n` +
          `<b>মোবাইল নম্বর:</b> <code>${donor.phone}</code>\n` +
          `<b>ঠিকানা:</b> ${donor.district}, ${donor.area}\n` +
          `<b>বয়স ও লিঙ্গ:</b> ${donor.age || "-"} বছর | ${isFemale ? "নারী" : "পুরুষ"}\n` +
          `<b>স্ট্যাটাস:</b> ${isAvail ? "🟢 সক্রিয় ও প্রস্তুত" : "🔴 সাময়িক অনুপলব্ধ / বিশ্রামে"}\n` +
          `<b>মোট রক্তদান:</b> ${donor.total_donations || 0} বার\n` +
          `<b>সর্বশেষ রক্তদান:</b> ${donor.last_donation_date || "তথ্য নেই"}\n\n` +
          `ব্যবস্থা গ্রহণ করতে নিচের অ্যাকশন বাটন ব্যবহার করুন:`;

        const kb = [
          [
            { text: "💉 রক্তদান (Donated) মার্ক", callback_data: `cb:donor_donate:${donor.id}` },
            { text: isAvail ? "⏸️ ৯০ দিন সাসপেন্ড" : "✅ পুনরায় সক্রিয় করুন", callback_data: isAvail ? `cb:donor_suspend:${donor.id}:90` : `cb:donor_reactivate:${donor.id}` }
          ],
          [
            { text: "⏸️ ১৮০ দিন টার্মিনেট", callback_data: `cb:donor_suspend:${donor.id}:180` },
            { text: "🚫 পার্মানেন্ট ব্যান", callback_data: `cb:donor_ban:${donor.id}` }
          ],
          [
            { text: "🗑️ স্থায়ীভাবে মুছুন", callback_data: `cb:donor_delete:${donor.id}` },
            { text: "🔍 অন্য ডোনার খুঁজুন", callback_data: "cb:donor_search" }
          ],
          [
            { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
          ]
        ];

        await tgSendMessage(token, chatId, respText, kb);
        return;
      }

      // Direct phone number lookup if admin sends a mobile number in idle state
      const directDigits = text.replace(/[^0-9]/g, "");
      if (directDigits.length >= 10 && directDigits.length <= 13) {
        const donor = await env.DB.prepare(
          "SELECT * FROM donors WHERE phone LIKE ? OR phone LIKE ?"
        ).bind(`%${directDigits.slice(-10)}%`, directDigits).first();

        if (donor) {
          const isAvail = donor.is_available === 1;
          const isFemale = (donor.gender || "").toLowerCase().includes("fem") || donor.gender === "নারী" || (donor.gender || "").toLowerCase() === "f";
          const respText = `👤 <b>ডোনার প্রোফাইল ও বিস্তারিত তথ্য:</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `<b>নাম:</b> ${donor.name}\n` +
            `<b>রক্তের গ্রুপ:</b> <code>${donor.blood_group}</code>\n` +
            `<b>মোবাইল নম্বর:</b> <code>${donor.phone}</code>\n` +
            `<b>ঠিকানা:</b> ${donor.district}, ${donor.area}\n` +
            `<b>বয়স ও লিঙ্গ:</b> ${donor.age || "-"} বছর | ${isFemale ? "নারী" : "পুরুষ"}\n` +
            `<b>স্ট্যাটাস:</b> ${isAvail ? "🟢 সক্রিয় ও প্রস্তুত" : "🔴 সাময়িক অনুপলব্ধ / বিশ্রামে"}\n` +
            `<b>মোট রক্তদান:</b> ${donor.total_donations || 0} বার\n` +
            `<b>সর্বশেষ রক্তদান:</b> ${donor.last_donation_date || "তথ্য নেই"}\n\n` +
            `ব্যবস্থা গ্রহণ করতে নিচের অ্যাকশন বাটন ব্যবহার করুন:`;

          const kb = [
            [
              { text: "💉 রক্তদান (Donated) মার্ক", callback_data: `cb:donor_donate:${donor.id}` },
              { text: isAvail ? "⏸️ ৯০ দিন সাসপেন্ড" : "✅ পুনরায় সক্রিয় করুন", callback_data: isAvail ? `cb:donor_suspend:${donor.id}:90` : `cb:donor_reactivate:${donor.id}` }
            ],
            [
              { text: "⏸️ ১৮০ দিন টার্মিনেট", callback_data: `cb:donor_suspend:${donor.id}:180` },
              { text: "🚫 পার্মানেন্ট ব্যান", callback_data: `cb:donor_ban:${donor.id}` }
            ],
            [
              { text: "🗑️ স্থায়ীভাবে মুছুন", callback_data: `cb:donor_delete:${donor.id}` },
              { text: "🔍 অন্য ডোনার খুঁজুন", callback_data: "cb:donor_search" }
            ],
            [
              { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
            ]
          ];

          await tgSendMessage(token, chatId, respText, kb);
          return;
        }
      }

      // Default response
      await tgSendMessage(token, chatId, "🩸 মেনু দেখতে নিচের বাটনে ক্লিক করুন অথবা /menu লিখুন:", getMainAdminKeyboard());
    }
  } catch (err) {
    console.error("Telegram bot error:", err);
  }
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  const ctx = context;

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    ctx.waitUntil(ensureTelegramWebhook(env, url.origin));
    ctx.waitUntil(ensureCoreTables(env));
    const method = request.method;

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
      const num1 = Math.floor(Math.random() * 9) + 1;
      const num2 = Math.floor(Math.random() * 9) + 1;
      const timestamp = Date.now();
      const token = `${num1}:${num2}:${timestamp}`;
      const toBengaliNumber = (n) => String(n).replace(/[0-9]/g, d => "০১২৩৪৫৬৭৮৯"[d]);
      return json({
        question: `${toBengaliNumber(num1)} + ${toBengaliNumber(num2)} = ?`,
        token
      });
    }

    if (path === "/api/stats" && method === "GET") {
      const [totalDonors, activeDonors, districts, totalRequests] = await Promise.all([
        env.DB.prepare("SELECT count(*) as count FROM donors").first(),
        env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1").first(),
        env.DB.prepare("SELECT count(DISTINCT district) as count FROM donors").first(),
        env.DB.prepare("SELECT count(*) as count FROM blood_requests").first()
      ]);

      return json({
        total_donors: totalDonors ? totalDonors.count : 0,
        active_donors: activeDonors ? activeDonors.count : 0,
        districts_count: districts ? Math.max(districts.count, 64) : 64,
        total_requests: totalRequests ? totalRequests.count : 0
      });
    }

    if (path === "/api/requests" && method === "POST") {
      const clientIP = getClientIP(request);
      const isLimited = await isRateLimited(env, clientIP, "request_create", 3, 60);
      if (isLimited) {
        return json({ error: "অতিরিক্ত রিকোয়েস্ট পাঠানো হয়েছে। দয়া করে ১ ঘণ্টা পর চেষ্টা করুন।" }, 429);
      }

      try {
        const body = await request.json();
        const {
          patient_name, blood_group, units, district, needed_by,
          hospital_name, location, contact_phone, urgency,
          requester_name, requester_blood_group, requester_age, requester_gender,
          requester_district, requester_area,
          captcha_token, captcha_answer, agreed_future_donation, agreed_data_save
        } = body;

        const isCaptchaValid = await verifyCaptcha(captcha_token, captcha_answer);
        if (!isCaptchaValid) {
          return json({ error: "রোবট সুরক্ষা যাচাই (ক্যাপচা) ব্যর্থ হয়েছে! নতুন সংখ্যা দিয়ে চেষ্টা করুন।" }, 400);
        }

        if (!patient_name || !blood_group || !units || !district || !hospital_name || !location || !contact_phone || !needed_by) {
          return json({ error: "রোগীর সকল প্রয়োজনীয় তথ্য সঠিকভাবে পূরণ করুন।" }, 400);
        }

        const cleanPhone = contact_phone.replace(/[^0-9]/g, "");
        if (cleanPhone.length !== 11) {
          return json({ error: "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন।" }, 400);
        }

        const phoneLimited = await isRateLimited(env, cleanPhone, "phone_request", 2, 1440);
        if (phoneLimited) {
          return json({ error: "একই মোবাইল নম্বর থেকে বিগত ২৪ ঘণ্টায় ইতিমধ্যে আবেদন করা হয়েছে।" }, 429);
        }

        const insertReqResult = await env.DB.prepare(`
          INSERT INTO blood_requests (
            patient_name, blood_group, units, hospital_name, district, location,
            contact_phone, urgency, needed_by, note, requester_name, requester_blood_group
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          patient_name.trim(),
          blood_group,
          units || 1,
          hospital_name.trim(),
          district.trim(),
          location.trim(),
          cleanPhone,
          urgency || "Emergency",
          needed_by.trim(),
          body.note ? body.note.trim() : "",
          requester_name ? requester_name.trim() : "স্বজন",
          requester_blood_group || null
        ).run();

        const requestId = insertReqResult.meta?.last_row_id;

        if (requester_name && cleanPhone && requester_blood_group) {
          try {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO donors (
                name, blood_group, phone, district, area, age, gender, is_available
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `).bind(
              requester_name.trim(),
              requester_blood_group,
              cleanPhone,
              requester_district ? requester_district.trim() : district.trim(),
              requester_area ? requester_area.trim() : location.trim(),
              requester_age || 25,
              requester_gender || "Male"
            ).run();
          } catch (donorErr) {
            console.error("Auto donor registration error:", donorErr);
          }
        }

        const { results: matchedDonors } = await env.DB.prepare(`
          SELECT id, name, blood_group, district, area, phone
          FROM donors
          WHERE blood_group = ? AND is_available = 1
          ORDER BY (CASE WHEN district LIKE ? THEN 0 ELSE 1 END), id DESC
          LIMIT 20
        `).bind(blood_group, `%${district}%`).all();

        ctx.waitUntil(sendTelegramAlert(env, {
          patient_name,
          blood_group,
          units,
          hospital_name,
          district,
          location,
          contact_phone: cleanPhone,
          needed_by,
          note: body.note,
          requester_name,
          requester_blood_group
        }, matchedDonors));

        return json({
          success: true,
          message: "জরুরি রক্তের রিকোয়েস্ট সফলভাবে গৃহীত হয়েছে!",
          request_id: requestId,
          matched_donors_count: matchedDonors ? matchedDonors.length : 0
        });
      } catch (err) {
        return json({ error: "রিকোয়েস্ট প্রসেস করতে ব্যর্থ হয়েছে: " + err.message }, 500);
      }
    }

    if (path === "/api/donors/search" && method === "GET") {
      // Public search disabled for complete donor privacy and security
      return json({
        donors: [],
        message: "রক্তদাতাদের ব্যক্তিগত তথ্যের সর্বোচ্চ নিরাপত্তার স্বার্থে উন্মুক্ত ডোনার অনুসন্ধান বন্ধ রাখা হয়েছে। শুধুমাত্র অনুমোদিত অ্যাডমিন প্যানেল ও টেলিগ্রাম বট থেকে ডোনার তথ্য অ্যাক্সেসযোগ্য।"
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

        const cleanPhone = phone.replace(/[^0-9]/g, "");
        if (cleanPhone.length !== 11) {
          return json({ error: "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (উদাঃ 017XXXXXXXX)।" }, 400);
        }

        const existing = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
        if (existing) {
          return json({ error: "এই মোবাইল নম্বরটি দিয়ে ইতিমধ্যে একজন রক্তদাতা নিবন্ধিত আছেন।" }, 409);
        }

        await env.DB.prepare(`
          INSERT INTO donors (
            name, blood_group, phone, district, area, age, gender,
            last_donation_date, total_donations, is_available, agreed_future_donation, agreed_data_save
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
        `).bind(
          name.trim(),
          blood_group,
          cleanPhone,
          district.trim(),
          area.trim(),
          age,
          gender || "Male",
          last_donation_date || null,
          total_donations || 0
        ).run();

        return json({ success: true, message: "রক্তদাতা হিসেবে আপনার নিবন্ধন সফলভাবে সম্পন্ন হয়েছে!" });
      } catch (err) {
        return json({ error: "নিবন্ধন ব্যর্থ হয়েছে: " + err.message }, 500);
      }
    }

    // Admin API Routes
    if (path.startsWith("/api/admin")) {
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
          return json({ error: "বৈধ ইমেইল এবং কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
        }

        const salt = generateRandomToken(16);
        const passwordHash = await hashPassword(password, salt);

        await env.DB.prepare(
          "INSERT INTO admins (email, password_hash, salt, role) VALUES (?, ?, ?, 'superadmin')"
        ).bind(email.trim().toLowerCase(), passwordHash, salt).run();

        if (telegram_token) {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_bot_token', ?, datetime('now'))"
          ).bind(telegram_token.trim()).run();
        }
        if (telegram_uids) {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_admin_uids', ?, datetime('now'))"
          ).bind(telegram_uids.trim()).run();
        }

        return json({ success: true, message: "প্রাথমিক অ্যাডমিন সফলভাবে সেটআপ হয়েছে।" });
      }

      if (path === "/api/admin/login" && method === "POST") {
        const clientIP = getClientIP(request);
        const isLimited = await isRateLimited(env, clientIP, "admin_login", 5, 15);
        if (isLimited) {
          return json({ error: "অতিরিক্ত ভুল চেষ্টার কারণে ১৫ মিনিটের জন্য লগইন স্থগিত করা হয়েছে।" }, 429);
        }

        const { email, password } = await request.json();
        if (!email || !password) {
          return json({ error: "ইমেইল এবং পাসওয়ার্ড প্রদান করুন।" }, 400);
        }

        const admin = await env.DB.prepare(
          "SELECT * FROM admins WHERE email = ?"
        ).bind(email.trim().toLowerCase()).first();

        if (!admin) {
          return json({ error: "ভুল ইমেইল অথবা পাসওয়ার্ড।" }, 401);
        }

        const computedHash = await hashPassword(password, admin.salt);
        if (computedHash !== admin.password_hash) {
          return json({ error: "ভুল ইমেইল অথবা পাসওয়ার্ড।" }, 401);
        }

        const sessionToken = generateRandomToken(32);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
          "INSERT INTO admin_sessions (admin_id, token, expires_at) VALUES (?, ?, ?)"
        ).bind(admin.id, sessionToken, expiresAt).run();

        return json({
          success: true,
          token: sessionToken,
          admin: { email: admin.email, role: admin.role }
        });
      }

      // Protected admin endpoints
      const admin = await getAuthenticatedAdmin(request, env);
      if (!admin) {
        return json({ error: "অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে পুনরায় লগইন করুন।" }, 401);
      }

      if (path === "/api/admin/data" && method === "GET") {
        const [totalDonors, activeDonors, totalRequests, pendingRequests] = await Promise.all([
          env.DB.prepare("SELECT count(*) as count FROM donors").first(),
          env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE (created_at >= datetime('now', '-10 days') OR created_at IS NULL)").first(),
          env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE status = 'Pending' AND (created_at >= datetime('now', '-10 days') OR created_at IS NULL)").first()
        ]);

        return json({
          admin_email: admin.email,
          total_donors: totalDonors ? totalDonors.count : 0,
          active_donors: activeDonors ? activeDonors.count : 0,
          total_requests: totalRequests ? totalRequests.count : 0,
          pending_requests: pendingRequests ? pendingRequests.count : 0
        });
      }

      if (path === "/api/admin/donors" && method === "GET") {
        const bg = url.searchParams.get("blood_group") || "";
        const search = url.searchParams.get("search") || "";

        let query = "SELECT id, name, blood_group, phone, district, area, age, gender, last_donation_date, total_donations, is_available, created_at FROM donors";
        const params = [];
        const conditions = [];

        if (bg && bg !== "ALL") {
          conditions.push("blood_group = ?");
          params.push(bg);
        }

        if (search && search.trim()) {
          conditions.push("(name LIKE ? OR phone LIKE ? OR district LIKE ?)");
          params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
        }

        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY id DESC LIMIT 100";
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return json({ donors: results || [] });
      }

      if (path.match(/^\/api\/admin\/donors\/\d+\/toggle-status$/) && method === "POST") {
        const id = path.split("/")[4];
        const donor = await env.DB.prepare("SELECT is_available FROM donors WHERE id = ?").bind(id).first();
        if (!donor) return json({ error: "ডোনার পাওয়া যায়নি।" }, 404);
        const newStatus = donor.is_available === 1 ? 0 : 1;
        await env.DB.prepare("UPDATE donors SET is_available = ? WHERE id = ?").bind(newStatus, id).run();
        return json({ success: true, is_available: newStatus });
      }

      if (path.match(/^\/api\/admin\/donors\/\d+$/) && method === "DELETE") {
        const id = path.split("/")[4];
        await env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(id).run();
        return json({ success: true, message: "ডোনার সফলভাবে মুছে ফেলা হয়েছে।" });
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
        const bloodReq = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(id).first();
        if (!bloodReq) return json({ error: "রিকোয়েস্ট পাওয়া যায়নি।" }, 404);

        const { results } = await env.DB.prepare(`
          SELECT id, name, blood_group, district, area, phone, age
          FROM donors
          WHERE blood_group = ? AND is_available = 1
          ORDER BY (CASE WHEN district LIKE ? THEN 0 ELSE 1 END), id DESC
          LIMIT 20
        `).bind(bloodReq.blood_group, `%${bloodReq.district}%`).all();

        return json({
          request: bloodReq,
          matched_donors: results || []
        });
      }

      if (path === "/api/admin/settings" && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids')"
        ).all();
        const settings = {};
        for (const r of results) {
          settings[r.key] = r.value;
        }
        return json({
          telegram_bot_token_set: !!settings.telegram_bot_token,
          telegram_admin_uids: settings.telegram_admin_uids || ""
        });
      }

      if (path === "/api/admin/settings" && method === "POST") {
        const { telegram_bot_token, telegram_admin_uids } = await request.json();
        if (telegram_bot_token && telegram_bot_token.trim()) {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_bot_token', ?, datetime('now'))"
          ).bind(telegram_bot_token.trim()).run();
        }
        if (telegram_admin_uids !== undefined) {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO admin_settings (key, value, updated_at) VALUES ('telegram_admin_uids', ?, datetime('now'))"
          ).bind(telegram_admin_uids.trim()).run();
        }
        return json({ success: true, message: "সেটিংস সফলভাবে সংরক্ষিত হয়েছে!" });
      }

      if (path === "/api/admin/change-password" && method === "POST") {
        const { current_password, new_password } = await request.json();
        if (!new_password || new_password.length < 8) {
          return json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" }, 400);
        }

        const adminRecord = await env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(admin.id).first();
        if (current_password) {
          const currentHash = await hashPassword(current_password, adminRecord.salt);
          if (currentHash !== adminRecord.password_hash) {
            return json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" }, 400);
          }
        }

        const newSalt = generateRandomToken(16);
        const newHash = await hashPassword(new_password, newSalt);

        await env.DB.prepare(
          "UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?"
        ).bind(newHash, newSalt, admin.id).run();

        return json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে!" });
      }

      if (path === "/api/admin/test-telegram" && method === "POST") {
        const testRequest = {
          patient_name: "টেস্ট রোগী (মোঃ কামাল)",
          blood_group: "O+",
          units: 1,
          hospital_name: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
          district: "ঢাকা",
          location: "জরুরি বিভাগ, ৩য় তলা",
          contact_phone: "01711111111",
          needed_by: "জরুরি প্রয়োজন",
          note: "এটি টেলিগ্রাম বট ভেরিফিকেশন টেস্ট মেসেজ।",
          requester_name: "সিস্টেম টেস্ট অ্যাডমিন",
          requester_blood_group: "O+"
        };
        const sampleDonors = [
          { name: "রাকিব হাসান", blood_group: "O+", district: "ঢাকা", area: "মিরপুর", phone: "01822222222" }
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
