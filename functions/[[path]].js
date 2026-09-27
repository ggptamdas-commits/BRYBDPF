
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token",
      ...extraHeaders
    }
  });
}

function cleanInput(str, maxLen = 200) {
  if (!str || typeof str !== "string") return "";
  return str.trim().slice(0, maxLen);
}

function normalizePhone(phone) {
  if (!phone) return "";
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("01")) {
    return cleaned;
  }
  if (cleaned.length === 13 && cleaned.startsWith("8801")) {
    return cleaned.slice(2);
  }
  return cleaned;
}

function isValidPhone(phone) {
  const norm = normalizePhone(phone);
  return /^01[3-9]\d{8}$/.test(norm);
}

async function sha256Hex(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateRandomToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

const CAPTCHA_SECRET = "BRYBDPF_SECURE_SALT_2026";

async function createCaptcha() {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const answer = (num1 + num2).toString();
  const timestamp = Date.now().toString();
  const question = `${num1} + ${num2} = ?`;
  const signature = await sha256Hex(`${answer}:${timestamp}:${CAPTCHA_SECRET}`);
  const token = `${answer}:${timestamp}:${signature}`;
  return { question, token };
}

async function verifyCaptcha(userAnswer, token) {
  try {
    if (!token || !userAnswer) return false;
    const parts = token.split(":");
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

    // 1. WhatsApp message for the REQUESTER (containing list of matched donors)
    let shareToRequester = `🩸 *রক্তদাতাদের তালিকা — BRYBDPF* 🩸\n` +
      `───────────────────────\n` +
      `আসসালামু আলাইকুম,\n` +
      `রোগীর জরুরি প্রয়োজনে *${requestData.blood_group}* গ্রুপের রক্তদাতাদের তালিকা নিচে দেওয়া হলো:\n\n`;
    if (matchedDonors && matchedDonors.length > 0) {
      shareToRequester += matchedDonors.slice(0, 10).map(
        (d, i) => `${i + 1}. 👤 *${d.name}*\n   📍 ${d.area || d.district}\n   📞 ${d.phone}`
      ).join("\n\n");
      shareToRequester += `\n\n───────────────────────\n` +
        `💡 *পরামর্শ:* অনুগ্রহ করে রক্তদাতাদের সাথে কথা বলে দ্রুত ব্যবস্থা নিন।\n` +
        `🌐 *বাংলাদেশ রেড ইয়ুথ ব্লাড ডোনার্স প্লাটফর্ম*`;
    } else {
      shareToRequester += `দুঃখিত, এই মুহূর্তে প্রস্তুত কোনো রক্তদাতা পাওয়া যায়নি। অনুগ্রহ করে আমাদের অ্যাডমিনদের সাথে যোগাযোগ করুন।`;
    }

    const shareToRequesterUrl = `https://wa.me/${reqWaNumber}?text=${encodeURIComponent(shareToRequester)}`;

    // 2. Format matched donors preview for Telegram message
    if (matchedDonors && matchedDonors.length > 0) {
      donorText = `\n\n🎯 *নিকটবর্তী সম্ভাব্য রক্তদাতা (${matchedDonors.length} জন):*\n` +
        matchedDonors.slice(0, 5).map(
          (d, i) => {
            const tierBadge = d.proximity_tier === 1 ? "🎯 [একই এলাকা]" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [বিভাগীয়]");
            return `${i + 1}. *${d.name}* (${d.blood_group}) - ${tierBadge}\n   📍 ${d.area || d.district} | 📞 \`${d.phone}\``;
          }
        ).join("\n");
      
      if (matchedDonors.length > 5) {
        donorText += `\n   _...এবং আরও ${matchedDonors.length - 5} জন তালিকাভুক্ত আছেন_`;
      }
    } else {
      donorText = `\n\n⚠️ *কোনো প্রস্তুত ডোনার এই মুহূর্তে পাওয়া যায়নি।*`;
    }

    // 3. Create Action Buttons
    // Row 1: Send list to patient/requester via WhatsApp
    inlineButtons.push([
      {
        text: "📲 রোগীকে ডোনারদের তালিকা পাঠান (WhatsApp)",
        url: shareToRequesterUrl
      }
    ]);

    // Row 2: Top 2 donors instant WhatsApp contact buttons (sending patient details to donor)
    if (matchedDonors && matchedDonors.length > 0) {
      const donorBtnRow = [];
      const topDonors = matchedDonors.slice(0, 2);
      for (const td of topDonors) {
        const dCleanPhone = (td.phone || "").replace(/[^0-9]/g, "");
        const dWaNumber = dCleanPhone.startsWith("88") ? dCleanPhone : (dCleanPhone.startsWith("0") ? "88" + dCleanPhone : dCleanPhone);
        
        const msgToDonor = `🩸 *জরুরি রক্তের আবেদন — BRYBDPF* 🩸\n` +
          `───────────────────────\n` +
          `আসসালামু আলাইকুম ${td.name},\n` +
          `আপনার রক্তের গ্রুপ *${td.blood_group}*-এর একজন মুমূর্ষু রোগীর জরুরি রক্তের প্রয়োজন:\n\n` +
          `👤 রোগী: *${requestData.patient_name}*\n` +
          `🏥 হাসপাতাল: *${requestData.hospital_name || "উল্লেখ নেই"}*\n` +
          `📍 অবস্থান: *${requestData.location || requestData.district}*\n` +
          `🩸 পরিমাণ: *${requestData.units || 1} ব্যাগ*\n` +
          `📞 যোগাযোগ: *${requestData.contact_phone}*\n\n` +
          `───────────────────────\n` +
          `আপনি কি রক্তদান করতে প্রস্তুত আছেন? আপনার একটি সিদ্ধান্ত বাঁচাতে পারে একটি প্রাণ! ❤️`;
        
        const donorWaUrl = `https://wa.me/${dWaNumber}?text=${encodeURIComponent(msgToDonor)}`;
        donorBtnRow.push({
          text: `💬 ডোনার: ${td.name.split(" ")[0]}`,
          url: donorWaUrl
        });
      }
      if (donorBtnRow.length > 0) inlineButtons.push(donorBtnRow);
    }

    // Row 3: Admin Actions (Interactive Callbacks)
    if (requestData.id) {
      inlineButtons.push([
        { text: "🔍 বটের মাধ্যমে ম্যাচ দেখুন", callback_data: `match_${requestData.id}` },
        { text: "✅ ম্যানেজ করুন", callback_data: `req_${requestData.id}` }
      ]);
    }

    const tgMessage = `🚨 *জরুরি রক্তের আবেদন (BRYBDPF)* 🚨\n` +
      `───────────────────────\n` +
      `👤 *রোগী:* ${requestData.patient_name}\n` +
      `🩸 *গ্রুপ:* ${requestData.blood_group}\n` +
      `💉 *পরিমাণ:* ${requestData.units || 1} ব্যাগ\n` +
      `🏥 *হাসপাতাল:* ${requestData.hospital_name || "উল্লেখ নেই"}\n` +
      `📍 *ঠিকানা/জেলা:* ${requestData.location ? requestData.location + ", " : ""}${requestData.district}\n` +
      `📞 *যোগাযোগ:* \`${requestData.contact_phone}\`\n` +
      `───────────────────────` +
      donorText;

    for (const uid of uids) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: uid,
            text: tgMessage,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: inlineButtons
            }
          })
        });
      } catch (e) {
        console.error("Telegram send error to " + uid, e);
      }
    }
  } catch (err) {
    console.error("Error sending Telegram alert:", err);
  }
}

// ==========================================
// TELEGRAM BOT INTERACTIVE WEBHOOK HANDLER
// ==========================================

const TELEGRAM_WEBHOOK_SECRET = "BRYBDPF_TG_SECURE_TOKEN_2026";

async function tgSendMessage(token, chatId, text, inlineKeyboard = null, parseMode = "Markdown") {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: parseMode
    };
    if (inlineKeyboard && inlineKeyboard.length > 0) {
      payload.reply_markup = { inline_keyboard: inlineKeyboard };
    }
    let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    // Fallback if Markdown parsing fails
    if (!res.ok && parseMode === "Markdown") {
      delete payload.parse_mode;
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    return res;
  } catch (err) {
    console.error("tgSendMessage error:", err);
  }
}

async function tgEditMessage(token, chatId, messageId, text, inlineKeyboard = null, parseMode = "Markdown") {
  try {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: parseMode
    };
    if (inlineKeyboard && inlineKeyboard.length > 0) {
      payload.reply_markup = { inline_keyboard: inlineKeyboard };
    }
    let res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok && parseMode === "Markdown") {
      delete payload.parse_mode;
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    return res;
  } catch (err) {
    console.error("tgEditMessage error:", err);
  }
}

async function tgAnswerCallback(token, callbackQueryId, text = "", showAlert = false) {
  try {
    return await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
      })
    });
  } catch (err) {
    console.error("tgAnswerCallback error:", err);
  }
}

function getMainMenuKeyboard() {
  return [
    [
      { text: "📊 পরিসংখ্যান (Stats)", callback_data: "menu_stats" },
      { text: "🩸 রক্তের রিকোয়েস্ট", callback_data: "menu_requests" }
    ],
    [
      { text: "👥 ডোনার তালিকা", callback_data: "menu_donors" },
      { text: "🔍 ডোনার অনুসন্ধান", callback_data: "menu_search_prompt" }
    ],
    [
      { text: "🌐 ওয়েবসাইটে যান", url: "https://brybdpf.pages.dev" },
      { text: "🛠️ অ্যাডমিন প্যানেল", url: "https://brybdpf.pages.dev/admin" }
    ]
  ];
}

async function handleTelegramUpdate(update, env, ctx) {
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

    if (!token) return;

    const adminUids = (adminUidsStr || "").split(",").map(u => u.trim()).filter(Boolean);

    // ----------------------------------------------------
    // 1. HANDLE CALLBACK QUERIES (BUTTON CLICKS)
    // ----------------------------------------------------
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || "";
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const fromId = String(cq.from?.id || "");

      // Check admin authorization
      if (adminUids.length > 0 && !adminUids.includes(fromId)) {
        await tgAnswerCallback(token, cq.id, "⛔ দুঃখিত, আপনি এই বটের অনুমোদিত অ্যাডমিন নন।", true);
        return;
      }

      await tgAnswerCallback(token, cq.id);

      // MAIN MENU
      if (data === "menu_main") {
        const text = `🩸 *বাংলাদেশ রেড ইয়ুথ ব্লাড ডোনার্স প্লাটফর্ম*\n` +
          `*অ্যাডমিন কন্ট্রোল সেন্টার*\n\n` +
          `নিচের মেনু থেকে আপনার পছন্দনীয় অপশন নির্বাচন করুন:`;
        await tgEditMessage(token, chatId, messageId, text, getMainMenuKeyboard());
        return;
      }

      // STATS
      if (data === "menu_stats") {
        const totalDonors = (await env.DB.prepare("SELECT COUNT(*) as count FROM donors").first())?.count || 0;
        const availableDonors = (await env.DB.prepare("SELECT COUNT(*) as count FROM donors WHERE is_available = 1").first())?.count || 0;
        const totalRequests = (await env.DB.prepare("SELECT COUNT(*) as count FROM blood_requests").first())?.count || 0;
        const pendingRequests = (await env.DB.prepare("SELECT COUNT(*) as count FROM blood_requests WHERE status = 'pending'").first())?.count || 0;

        const { results: groupStats } = await env.DB.prepare(
          "SELECT blood_group, COUNT(*) as count FROM donors WHERE is_available = 1 GROUP BY blood_group ORDER BY count DESC"
        ).all();

        let breakdown = (groupStats || []).map(g => `▫️ *${g.blood_group}:* ${g.count} জন`).join("\n");
        if (!breakdown) breakdown = "কোনো ডোনার ডেটা নেই";

        const text = `📊 *সিস্টেম পরিসংখ্যান (BRYBDPF)*\n` +
          `───────────────────────\n` +
          `👥 *মোট নিবন্ধিত রক্তদাতা:* ${totalDonors} জন\n` +
          `🟢 *প্রস্তুত (Available) রক্তদাতা:* ${availableDonors} জন\n` +
          `🔴 *অপেক্ষমাণ রক্তের আবেদন:* ${pendingRequests} টি\n` +
          `📦 *সর্বমোট আবেদন:* ${totalRequests} টি\n\n` +
          `🩸 *প্রস্তুত রক্তদাতাদের রক্তের গ্রুপ:* \n${breakdown}\n` +
          `───────────────────────`;

        const keyboard = [
          [{ text: "🔄 রিফ্রেশ", callback_data: "menu_stats" }],
          [{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]
        ];
        await tgEditMessage(token, chatId, messageId, text, keyboard);
        return;
      }

      // REQUESTS LIST
      if (data === "menu_requests") {
        const { results: reqs } = await env.DB.prepare(
          "SELECT id, patient_name, blood_group, units, district, hospital_name, contact_phone, status, created_at FROM blood_requests ORDER BY id DESC LIMIT 5"
        ).all();

        if (!reqs || reqs.length === 0) {
          const text = `🩸 *রক্তের আবেদনসমূহ*\n\nবর্তমানে কোনো রক্তের আবেদন নেই।`;
          await tgEditMessage(token, chatId, messageId, text, [[{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]]);
          return;
        }

        let text = `🩸 *সর্বশেষ রক্তের আবেদনসমূহ:*\n───────────────────────\n`;
        const keyboard = [];

        reqs.forEach((r, idx) => {
          const statusIcon = r.status === "approved" ? "✅" : (r.status === "fulfilled" ? "🎉" : "⏳");
          text += `*#${r.id}* ${statusIcon} *${r.patient_name}* (${r.blood_group} - ${r.units} ব্যাগ)\n` +
            `📍 ${r.district} | 🏥 ${r.hospital_name || "হসপিটাল"}\n` +
            `📞 \`${r.contact_phone}\`\n\n`;

          keyboard.push([
            { text: `🔍 #${r.id} ডোনার ম্যাচ`, callback_data: `match_${r.id}` },
            { text: `ব্যবস্থাপনা`, callback_data: `req_${r.id}` }
          ]);
        });

        keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
        await tgEditMessage(token, chatId, messageId, text, keyboard);
        return;
      }

      // SPECIFIC REQUEST MANAGEMENT
      if (data.startsWith("req_")) {
        const reqId = data.replace("req_", "");
        const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(reqId).first();
        if (!req) {
          await tgEditMessage(token, chatId, messageId, "❌ আবেদনটি পাওয়া যায়নি।", [[{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]]);
          return;
        }

        const text = `📋 *আবেদন #${req.id} বিস্তারিত:*\n` +
          `───────────────────────\n` +
          `👤 *রোগী:* ${req.patient_name}\n` +
          `🩸 *গ্রুপ:* ${req.blood_group}\n` +
          `💉 *পরিমাণ:* ${req.units} ব্যাগ\n` +
          `📍 *জেলা/এলাকা:* ${req.district} ${req.location ? "(" + req.location + ")" : ""}\n` +
          `🏥 *হাসপাতাল:* ${req.hospital_name || "উল্লেখ নেই"}\n` +
          `📞 *ফোন:* \`${req.contact_phone}\`\n` +
          `📊 *স্ট্যাটাস:* ${req.status}\n` +
          `───────────────────────`;

        const keyboard = [
          [
            { text: "🔍 ৩-ধাপের ডোনার ম্যাচ", callback_data: `match_${req.id}` }
          ],
          [
            { text: "✅ অনুমোদিত (Approve)", callback_data: `status_${req.id}_approved` },
            { text: "🎉 সম্পন্ন (Fulfilled)", callback_data: `status_${req.id}_fulfilled` }
          ],
          [
            { text: "❌ বাতিল (Cancel)", callback_data: `status_${req.id}_cancelled` },
            { text: "🔙 আবেদন তালিকা", callback_data: "menu_requests" }
          ]
        ];

        await tgEditMessage(token, chatId, messageId, text, keyboard);
        return;
      }

      // UPDATE REQUEST STATUS
      if (data.startsWith("status_")) {
        const parts = data.split("_");
        const reqId = parts[1];
        const newStatus = parts[2];
        await env.DB.prepare("UPDATE blood_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newStatus, reqId).run();
        
        await tgEditMessage(
          token,
          chatId,
          messageId,
          `✅ আবেদন #${reqId}-এর স্ট্যাটাস পরিবর্তন করে *${newStatus}* করা হয়েছে।`,
          [
            [{ text: "📋 আবেদনে ফিরে যান", callback_data: `req_${reqId}` }],
            [{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]
          ]
        );
        return;
      }

      // DONOR MATCH FOR A REQUEST (3-TIER PROXIMITY)
      if (data.startsWith("match_")) {
        const reqId = data.replace("match_", "");
        const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(reqId).first();
        if (!req) {
          await tgEditMessage(token, chatId, messageId, "❌ আবেদনটি পাওয়া যায়নি।", [[{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]]);
          return;
        }

        const cleanDist = req.district || "";
        const cleanThana = req.location || "";

        const { results: matched } = await env.DB.prepare(`
          SELECT id, name, blood_group, district, area, phone,
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
          LIMIT 10
        `).bind(
          cleanDist, `%${cleanThana}%`, cleanThana,
          cleanDist,
          req.blood_group, req.contact_phone
        ).all();

        let matchMsg = `🎯 *আবেদন #${req.id} এর জন্য ডোনার ম্যাচিং:*\n` +
          `👤 রোগী: *${req.patient_name}* | 🩸 গ্রুপ: *${req.blood_group}*\n` +
          `📍 অবস্থান: *${req.district}* (${req.location || "সাধারণ"})\n` +
          `───────────────────────\n`;

        const keyboard = [];

        if (matched && matched.length > 0) {
          matched.forEach((d, i) => {
            const badge = d.proximity_tier === 1 ? "🎯 [একই এলাকা]" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [বিভাগীয়]");
            matchMsg += `${i + 1}. *${d.name}* (${d.blood_group}) - ${badge}\n` +
              `   📍 ${d.area || d.district} | 📞 \`${d.phone}\`\n\n`;

            const dPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const dWa = dPhone.startsWith("88") ? dPhone : (dPhone.startsWith("0") ? "88" + dPhone : dPhone);
            const waMsg = `🩸 *জরুরি রক্তের আবেদন — BRYBDPF*\nআসসালামু আলাইকুম ${d.name}, রোগী ${req.patient_name} এর জন্য জরুরি ${req.blood_group} রক্ত প্রয়োজন। অবস্থান: ${req.hospital_name || req.district}। যোগাযোগ: ${req.contact_phone}।`;
            keyboard.push([
              { text: `💬 WhatsApp: ${d.name.split(" ")[0]}`, url: `https://wa.me/${dWa}?text=${encodeURIComponent(waMsg)}` }
            ]);
          });

          // Share all to requester button
          const rPhone = (req.contact_phone || "").replace(/[^0-9]/g, "");
          const rWa = rPhone.startsWith("88") ? rPhone : (rPhone.startsWith("0") ? "88" + rPhone : rPhone);
          let allList = `🩸 *${req.blood_group} রক্তদাতাদের তালিকা (BRYBDPF)*:\n\n` +
            matched.map((d, i) => `${i + 1}. ${d.name} (${d.area || d.district}) - ${d.phone}`).join("\n");
          keyboard.unshift([
            { text: "📲 রোগীকে সম্পূর্ণ তালিকা পাঠান (WhatsApp)", url: `https://wa.me/${rWa}?text=${encodeURIComponent(allList)}` }
          ]);
        } else {
          matchMsg += `⚠️ দুঃখিত, এই মুহূর্তে *${req.blood_group}* গ্রুপের কোনো উপযুক্ত প্রস্তুত রক্তদাতা পাওয়া যায়নি।`;
        }

        keyboard.push([
          { text: "📋 আবেদনে ফিরে যান", callback_data: `req_${req.id}` },
          { text: "🔙 মূল মেনু", callback_data: "menu_main" }
        ]);

        await tgEditMessage(token, chatId, messageId, matchMsg, keyboard);
        return;
      }

      // DONORS OVERVIEW
      if (data === "menu_donors") {
        const { results: recentDonors } = await env.DB.prepare(
          "SELECT id, name, blood_group, district, area, phone, is_available FROM donors ORDER BY id DESC LIMIT 6"
        ).all();

        let text = `👥 *রক্তদাতাদের সাম্প্রতিক তালিকা (সর্বশেষ ৬ জন):*\n───────────────────────\n`;
        const keyboard = [];

        (recentDonors || []).forEach(d => {
          const availIcon = d.is_available === 1 ? "🟢 প্রস্তুত" : "🔴 বিশ্রামে";
          text += `👤 *${d.name}* (${d.blood_group}) - ${availIcon}\n` +
            `📍 ${d.area || d.district} | 📞 \`${d.phone}\`\n\n`;

          keyboard.push([
            { text: `টগল: ${d.name.split(" ")[0]} (${d.is_available === 1 ? "বিশ্রাম দিন" : "প্রস্তুত করুন"})`, callback_data: `toggle_donor_${d.id}` }
          ]);
        });

        keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
        await tgEditMessage(token, chatId, messageId, text, keyboard);
        return;
      }

      // TOGGLE DONOR AVAILABILITY
      if (data.startsWith("toggle_donor_")) {
        const donorId = data.replace("toggle_donor_", "");
        const d = await env.DB.prepare("SELECT is_available, name FROM donors WHERE id = ?").bind(donorId).first();
        if (d) {
          const newStatus = d.is_available === 1 ? 0 : 1;
          await env.DB.prepare("UPDATE donors SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newStatus, donorId).run();
          await tgAnswerCallback(token, cq.id, `${d.name}-এর স্ট্যাটাস আপডেট হয়েছে: ${newStatus === 1 ? "প্রস্তুত" : "বিশ্রামে"}`, true);
          // Return to donors list
          const { results: recentDonors } = await env.DB.prepare(
            "SELECT id, name, blood_group, district, area, phone, is_available FROM donors ORDER BY id DESC LIMIT 6"
          ).all();

          let text = `👥 *রক্তদাতাদের সাম্প্রতিক তালিকা (সর্বশেষ ৬ জন):*\n───────────────────────\n`;
          const keyboard = [];

          (recentDonors || []).forEach(item => {
            const availIcon = item.is_available === 1 ? "🟢 প্রস্তুত" : "🔴 বিশ্রামে";
            text += `👤 *${item.name}* (${item.blood_group}) - ${availIcon}\n` +
              `📍 ${item.area || item.district} | 📞 \`${item.phone}\`\n\n`;

            keyboard.push([
              { text: `টগল: ${item.name.split(" ")[0]} (${item.is_available === 1 ? "বিশ্রাম দিন" : "প্রস্তুত করুন"})`, callback_data: `toggle_donor_${item.id}` }
            ]);
          });

          keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
          await tgEditMessage(token, chatId, messageId, text, keyboard);
          return;
        }
      }

      // SEARCH PROMPT
      if (data === "menu_search_prompt") {
        const text = `🔍 *ডোনার অনুসন্ধান গাইড:*\n` +
          `───────────────────────\n` +
          `বটের মেসেজে সরাসরি রক্তের গ্রুপ বা এলাকা লিখে পাঠান।\n` +
          `*উদাহরণ:*\n` +
          `▫️ \`O+\` বা \`A+\` (নির্দিষ্ট গ্রুপের ডোনার খুঁজতে)\n` +
          `▫️ \`রংপুর O+\` (জেলা ও গ্রুপ মিলিয়ে খুঁজতে)\n` +
          `▫️ \`দিনাজপুর\` (নির্দিষ্ট জেলার ডোনার খুঁজতে)\n\n` +
          `বট স্বয়ংক্রিয়ভাবে নিকটবর্তী প্রস্তুত রক্তদাতাদের তালিকা প্রদর্শন করবে।`;
        await tgEditMessage(token, chatId, messageId, text, [[{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]]);
        return;
      }
    }

    // ----------------------------------------------------
    // 2. HANDLE TEXT MESSAGES
    // ----------------------------------------------------
    if (update.message && update.message.text) {
      const msg = update.message;
      const text = msg.text.trim();
      const chatId = msg.chat.id;
      const fromId = String(msg.from?.id || "");

      // Check admin authorization
      if (adminUids.length > 0 && !adminUids.includes(fromId)) {
        await tgSendMessage(token, chatId, "⛔ *অননুমোদিত অ্যাক্সেস*\nদুঃখিত, আপনি BRYBDPF অ্যাডমিন হিসেবে অনুমোদিত নন। আপনার টেলিগ্রাম আইডি: `" + fromId + "`");
        return;
      }

      // START / MENU COMMAND
      if (text === "/start" || text === "/menu" || text.toLowerCase() === "menu") {
        const welcome = `🩸 *স্বাগতম, বাংলাদেশ রেড ইয়ুথ ব্লাড ডোনার্স প্লাটফর্ম বটের অ্যাডমিন সেন্টারে!*\n\n` +
          `এই বটের মাধ্যমে আপনি সরাসরি রক্তের রিকোয়েস্ট মনিটর, স্বয়ংক্রিয় ডোনার ম্যাচ ও হোয়াটসঅ্যাপে যোগাযোগ পরিচালনা করতে পারবেন।\n\n` +
          `নিচের মেনু থেকে আপনার পছন্দনীয় অপশন নির্বাচন করুন:`;
        await tgSendMessage(token, chatId, welcome, getMainMenuKeyboard());
        return;
      }

      // STATS COMMAND
      if (text === "/stats") {
        const totalDonors = (await env.DB.prepare("SELECT COUNT(*) as count FROM donors").first())?.count || 0;
        const availableDonors = (await env.DB.prepare("SELECT COUNT(*) as count FROM donors WHERE is_available = 1").first())?.count || 0;
        const totalRequests = (await env.DB.prepare("SELECT COUNT(*) as count FROM blood_requests").first())?.count || 0;
        const pendingRequests = (await env.DB.prepare("SELECT COUNT(*) as count FROM blood_requests WHERE status = 'pending'").first())?.count || 0;

        const statText = `📊 *সিস্টেম পরিসংখ্যান (BRYBDPF)*\n` +
          `───────────────────────\n` +
          `👥 *মোট রক্তদাতা:* ${totalDonors} জন\n` +
          `🟢 *প্রস্তুত রক্তদাতা:* ${availableDonors} জন\n` +
          `🔴 *পেন্ডিং রক্তের আবেদন:* ${pendingRequests} টি\n` +
          `📦 *সর্বমোট আবেদন:* ${totalRequests} টি`;
        await tgSendMessage(token, chatId, statText, getMainMenuKeyboard());
        return;
      }

      // REQUESTS COMMAND
      if (text === "/requests") {
        const { results: reqs } = await env.DB.prepare(
          "SELECT id, patient_name, blood_group, units, district, hospital_name, contact_phone, status FROM blood_requests ORDER BY id DESC LIMIT 5"
        ).all();

        if (!reqs || reqs.length === 0) {
          await tgSendMessage(token, chatId, "🩸 কোনো রক্তের আবেদন নেই।", getMainMenuKeyboard());
          return;
        }

        let respText = `🩸 *সর্বশেষ রক্তের আবেদনসমূহ:*\n───────────────────────\n`;
        const keyboard = [];

        reqs.forEach(r => {
          const statusIcon = r.status === "approved" ? "✅" : (r.status === "fulfilled" ? "🎉" : "⏳");
          respText += `*#${r.id}* ${statusIcon} *${r.patient_name}* (${r.blood_group} - ${r.units} ব্যাগ)\n` +
            `📍 ${r.district} | 🏥 ${r.hospital_name || "হসপিটাল"}\n` +
            `📞 \`${r.contact_phone}\`\n\n`;

          keyboard.push([
            { text: `🔍 #${r.id} ডোনার ম্যাচ`, callback_data: `match_${r.id}` },
            { text: `ব্যবস্থাপনা`, callback_data: `req_${r.id}` }
          ]);
        });
        keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
        await tgSendMessage(token, chatId, respText, keyboard);
        return;
      }

      // DONORS COMMAND
      if (text === "/donors") {
        const { results: recentDonors } = await env.DB.prepare(
          "SELECT id, name, blood_group, district, area, phone, is_available FROM donors ORDER BY id DESC LIMIT 6"
        ).all();

        let respText = `👥 *রক্তদাতাদের সাম্প্রতিক তালিকা (সর্বশেষ ৬ জন):*\n───────────────────────\n`;
        const keyboard = [];

        (recentDonors || []).forEach(d => {
          const availIcon = d.is_available === 1 ? "🟢 প্রস্তুত" : "🔴 বিশ্রামে";
          respText += `👤 *${d.name}* (${d.blood_group}) - ${availIcon}\n` +
            `📍 ${d.area || d.district} | 📞 \`${d.phone}\`\n\n`;

          keyboard.push([
            { text: `টগল: ${d.name.split(" ")[0]} (${d.is_available === 1 ? "বিশ্রাম দিন" : "প্রস্তুত করুন"})`, callback_data: `toggle_donor_${d.id}` }
          ]);
        });

        keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
        await tgSendMessage(token, chatId, respText, keyboard);
        return;
      }

      // MATCH COMMAND: /match <id>
      if (text.startsWith("/match")) {
        const parts = text.split(" ");
        if (parts.length < 2) {
          await tgSendMessage(token, chatId, "⚠️ ব্যবহারের নিয়ম: `/match <রিকোয়েস্ট_আইডি>`\nযেমন: `/match 1`");
          return;
        }
        const reqId = parts[1].trim();
        const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(reqId).first();
        if (!req) {
          await tgSendMessage(token, chatId, `❌ #${reqId} নম্বরের কোনো রক্তের আবেদন পাওয়া যায়নি।`);
          return;
        }

        const cleanDist = req.district || "";
        const cleanThana = req.location || "";

        const { results: matched } = await env.DB.prepare(`
          SELECT id, name, blood_group, district, area, phone,
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
          LIMIT 10
        `).bind(
          cleanDist, `%${cleanThana}%`, cleanThana,
          cleanDist,
          req.blood_group, req.contact_phone
        ).all();

        let matchMsg = `🎯 *আবেদন #${req.id} এর জন্য ডোনার ম্যাচিং:*\n` +
          `👤 রোগী: *${req.patient_name}* | 🩸 গ্রুপ: *${req.blood_group}*\n` +
          `📍 অবস্থান: *${req.district}* (${req.location || "সাধারণ"})\n` +
          `───────────────────────\n`;

        const keyboard = [];

        if (matched && matched.length > 0) {
          matched.forEach((d, i) => {
            const badge = d.proximity_tier === 1 ? "🎯 [একই এলাকা]" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [বিভাগীয়]");
            matchMsg += `${i + 1}. *${d.name}* (${d.blood_group}) - ${badge}\n` +
              `   📍 ${d.area || d.district} | 📞 \`${d.phone}\`\n\n`;

            const dPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const dWa = dPhone.startsWith("88") ? dPhone : (dPhone.startsWith("0") ? "88" + dPhone : dPhone);
            const waMsg = `🩸 *জরুরি রক্তের আবেদন — BRYBDPF*\nআসসালামু আলাইকুম ${d.name}, রোগী ${req.patient_name} এর জন্য জরুরি ${req.blood_group} রক্ত প্রয়োজন। অবস্থান: ${req.hospital_name || req.district}। যোগাযোগ: ${req.contact_phone}।`;
            keyboard.push([
              { text: `💬 WhatsApp: ${d.name.split(" ")[0]}`, url: `https://wa.me/${dWa}?text=${encodeURIComponent(waMsg)}` }
            ]);
          });
        } else {
          matchMsg += `⚠️ কোনো প্রস্তুত ডোনার পাওয়া যায়নি।`;
        }

        keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
        await tgSendMessage(token, chatId, matchMsg, keyboard);
        return;
      }

      // NATURAL LANGUAGE OR KEYWORD SEARCH FOR DONORS
      // If user types blood group (e.g. O+, A-, etc.) or location
      const bgMatch = text.match(/^(A|B|AB|O)[+-]$/i);
      if (bgMatch) {
        const bg = text.toUpperCase();
        const { results: donors } = await env.DB.prepare(
          "SELECT id, name, blood_group, district, area, phone FROM donors WHERE blood_group = ? AND is_available = 1 ORDER BY RANDOM() LIMIT 8"
        ).bind(bg).all();

        let sText = `🩸 *${bg} গ্রুপের প্রস্তুত রক্তদাতা (${(donors || []).length} জন):*\n───────────────────────\n`;
        const keyboard = [];

        if (donors && donors.length > 0) {
          donors.forEach((d, i) => {
            sText += `${i + 1}. *${d.name}*\n   📍 ${d.area || d.district} | 📞 \`${d.phone}\`\n\n`;
            const dPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const dWa = dPhone.startsWith("88") ? dPhone : (dPhone.startsWith("0") ? "88" + dPhone : dPhone);
            keyboard.push([
              { text: `💬 WhatsApp: ${d.name}`, url: `https://wa.me/${dWa}?text=${encodeURIComponent("আসসালামু আলাইকুম " + d.name + ", BRYBDPF থেকে রক্তের প্রয়োজনে যোগাযোগ করছি।")}` }
            ]);
          });
        } else {
          sText += `⚠️ এই মুহূর্তে *${bg}* গ্রুপের কোনো প্রস্তুত রক্তদাতা পাওয়া যায়নি।`;
        }

        keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
        await tgSendMessage(token, chatId, sText, keyboard);
        return;
      }

      // GENERAL SEARCH (LOCATION OR MULTI-TERM)
      const { results: foundDonors } = await env.DB.prepare(`
        SELECT id, name, blood_group, district, area, phone 
        FROM donors 
        WHERE is_available = 1 AND (district LIKE ? OR area LIKE ? OR blood_group LIKE ?)
        ORDER BY RANDOM() LIMIT 8
      `).bind(`%${text}%`, `%${text}%`, `%${text}%`).all();

      if (foundDonors && foundDonors.length > 0) {
        let sText = `🔍 *"${text}" সম্পর্কিত রক্তদাতাদের ফলাফল (${foundDonors.length} জন):*\n───────────────────────\n`;
        const keyboard = [];

        foundDonors.forEach((d, i) => {
          sText += `${i + 1}. *${d.name}* (${d.blood_group})\n   📍 ${d.area || d.district} | 📞 \`${d.phone}\`\n\n`;
          const dPhone = (d.phone || "").replace(/[^0-9]/g, "");
          const dWa = dPhone.startsWith("88") ? dPhone : (dPhone.startsWith("0") ? "88" + dPhone : dPhone);
          keyboard.push([
            { text: `💬 WhatsApp: ${d.name}`, url: `https://wa.me/${dWa}?text=${encodeURIComponent("আসসালামু আলাইকুম " + d.name + ", BRYBDPF থেকে রক্তের প্রয়োজনে যোগাযোগ করছি।")}` }
          ]);
        });

        keyboard.push([{ text: "🔙 মূল মেনু", callback_data: "menu_main" }]);
        await tgSendMessage(token, chatId, sText, keyboard);
        return;
      }

      // UNRECOGNIZED INPUT
      const defaultResp = `❓ আপনার বার্তাটি বুঝতে পারিনি।\n\n` +
        `বটের ফিচার ব্যবহার করতে নিচের বাটন চাপুন অথবা রক্তের গ্রুপ লিখে পাঠান (যেমন: \`O+\`, \`A+\`)।`;
      await tgSendMessage(token, chatId, defaultResp, getMainMenuKeyboard());
    }
  } catch (err) {
    console.error("Telegram bot error:", err);
  }
}

// ==========================================
// MAIN WORKER DISPATCHER
// ==========================================

export async function onRequest(context) {
  const { request, env, ctx } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token"
      }
    });
  }

  try {
    // ----------------------------------------------------
    // TELEGRAM WEBHOOK ENDPOINT
    // ----------------------------------------------------
    if (path === "/api/telegram/webhook" && method === "POST") {
      try {
        const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (secret && secret !== TELEGRAM_WEBHOOK_SECRET) {
          return json({ error: "Invalid Telegram webhook secret token" }, 401);
        }
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(update, env, ctx));
        return json({ ok: true });
      } catch (err) {
        return json({ error: "Telegram update parsing failed: " + err.message }, 400);
      }
    }

    if (path === "/api/telegram/setup-webhook" && method === "POST") {
      try {
        let token = "";
        const { results } = await env.DB.prepare(
          "SELECT value FROM admin_settings WHERE key = 'telegram_bot_token'"
        ).all();
        token = results && results.length > 0 ? results[0].value : env.TELEGRAM_BOT_TOKEN;

        if (!token) {
          return json({ success: false, error: "Telegram bot token is not configured in settings." }, 400);
        }

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
        return json({
          success: tgRes.ok,
          telegram_response: tgData,
          synced_url: webhookUrl
        });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // ----------------------------------------------------
    // PUBLIC CAPTCHA & STATS
    // ----------------------------------------------------
    if (path === "/api/captcha" && method === "GET") {
      const captcha = await createCaptcha();
      return json(captcha);
    }

    if (path === "/api/stats" && method === "GET") {
      try {
        const totalDonors = (await env.DB.prepare("SELECT COUNT(*) as count FROM donors").first())?.count || 0;
        const availableDonors = (await env.DB.prepare("SELECT COUNT(*) as count FROM donors WHERE is_available = 1").first())?.count || 0;
        const totalRequests = (await env.DB.prepare("SELECT COUNT(*) as count FROM blood_requests").first())?.count || 0;
        const pendingRequests = (await env.DB.prepare("SELECT COUNT(*) as count FROM blood_requests WHERE status = 'pending'").first())?.count || 0;

        const { results: groupStats } = await env.DB.prepare(
          "SELECT blood_group, COUNT(*) as count FROM donors WHERE is_available = 1 GROUP BY blood_group"
        ).all();

        return json({
          total_donors: totalDonors,
          available_donors: availableDonors,
          total_requests: totalRequests,
          pending_requests: pendingRequests,
          groups: groupStats || []
        });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ----------------------------------------------------
    // PUBLIC BLOOD REQUEST SUBMISSION
    // ----------------------------------------------------
    if (path === "/api/requests/create" && method === "POST") {
      try {
        const body = await request.json();
        const {
          patient_name,
          blood_group,
          units,
          district,
          hospital_name,
          contact_phone,
          location,
          notes,
          captcha_answer,
          captcha_token
        } = body;

        if (!patient_name || !blood_group || !district || !contact_phone) {
          return json({ success: false, error: "সকল বাধ্যতামূলক তথ্য (রোগীর নাম, রক্তের গ্রুপ, জেলা ও ফোন) পূরণ করুন।" }, 400);
        }

        const validBg = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
        if (!validBg.includes(blood_group)) {
          return json({ success: false, error: "রক্তের গ্রুপ সঠিক নয়।" }, 400);
        }

        if (!isValidPhone(contact_phone)) {
          return json({ success: false, error: "সঠিক ১১ ডিজিটের বাংলাদেশী মোবাইল নম্বর দিন (যেমন: 017xxxxxxxx)।" }, 400);
        }

        const isCaptchaValid = await verifyCaptcha(captcha_answer, captcha_token);
        if (!isCaptchaValid) {
          return json({ success: false, error: "ক্যাপচা সমাধান সঠিক হয়নি বা সময় উত্তীর্ণ হয়েছে। পুনরায় চেষ্টা করুন।" }, 400);
        }

        const cleanPhone = normalizePhone(contact_phone);
        const cleanUnits = parseInt(units, 10) || 1;
        const cleanDist = cleanInput(district, 100);
        const cleanThana = cleanInput(location, 100);

        // Insert request
        const res = await env.DB.prepare(`
          INSERT INTO blood_requests (
            patient_name, blood_group, units, district, hospital_name,
            contact_phone, location, notes, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
          cleanInput(patient_name, 100),
          blood_group,
          cleanUnits,
          cleanDist,
          cleanInput(hospital_name, 150),
          cleanPhone,
          cleanThana,
          cleanInput(notes, 500)
        ).run();

        const requestId = res.meta?.last_row_id;

        // Smart 3-Tier Geo-Proximity Donor Search for Telegram Alert
        let matchedDonors = [];
        try {
          const { results } = await env.DB.prepare(`
            SELECT id, name, blood_group, district, area, phone,
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
          id: requestId,
          patient_name,
          blood_group,
          units: cleanUnits,
          district: cleanDist,
          hospital_name,
          location: cleanThana,
          contact_phone: cleanPhone
        }, matchedDonors));

        return json({
          success: true,
          message: "আপনার জরুরি রক্তের রিকোয়েস্ট সফলভাবে গৃহীত হয়েছে! রক্তদাতাদের গোপনীয়তা রক্ষায় পাবলিক তালিকা উন্মুক্ত না রেখে সিস্টেম স্বয়ংক্রিয়ভাবে নিকটবর্তী রক্তদাতাদের সাথে সমন্বয় শুরু করেছে।",
          request_id: requestId,
          matched_count: matchedDonors.length
        });
      } catch (err) {
        return json({ success: false, error: "রিকোয়েস্ট সাবমিট ব্যর্থ হয়েছে: " + err.message }, 500);
      }
    }

    // ----------------------------------------------------
    // PUBLIC DONOR REGISTRATION
    // ----------------------------------------------------
    if (path === "/api/donors/register" && method === "POST") {
      try {
        const body = await request.json();
        const {
          name,
          blood_group,
          phone,
          district,
          area,
          last_donation_date,
          total_donations,
          is_available,
          social_link,
          emergency_contact,
          captcha_answer,
          captcha_token
        } = body;

        if (!name || !blood_group || !phone || !district) {
          return json({ success: false, error: "সকল প্রয়োজনীয় তথ্য (নাম, রক্তের গ্রুপ, ফোন, জেলা) প্রদান করুন।" }, 400);
        }

        const validBg = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
        if (!validBg.includes(blood_group)) {
          return json({ success: false, error: "রক্তের গ্রুপ সঠিক নয়।" }, 400);
        }

        if (!isValidPhone(phone)) {
          return json({ success: false, error: "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন।" }, 400);
        }

        const isCaptchaValid = await verifyCaptcha(captcha_answer, captcha_token);
        if (!isCaptchaValid) {
          return json({ success: false, error: "ক্যাপচা সমাধান সঠিক হয়নি। পুনরায় চেষ্টা করুন।" }, 400);
        }

        const cleanPhone = normalizePhone(phone);

        // Check if phone already registered
        const existing = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
        if (existing) {
          return json({ success: false, error: "এই মোবাইল নম্বরটি ইতোমধ্যে রক্তদাতা হিসেবে নিবন্ধিত আছে।" }, 400);
        }

        const avail = is_available === false || is_available === 0 ? 0 : 1;
        const donations = parseInt(total_donations, 10) || 0;

        const res = await env.DB.prepare(`
          INSERT INTO donors (
            name, blood_group, phone, district, area,
            last_donation_date, total_donations, is_available,
            social_link, emergency_contact, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
          cleanInput(name, 100),
          blood_group,
          cleanPhone,
          cleanInput(district, 100),
          cleanInput(area, 100),
          cleanInput(last_donation_date, 50),
          donations,
          avail,
          cleanInput(social_link, 200),
          cleanInput(emergency_contact, 50)
        ).run();

        return json({
          success: true,
          message: "অভিনন্দন! আপনি সফলভাবে বাংলাদেশ রেড ইয়ুথ ব্লাড ডোনার্স প্লাটফর্মে রক্তদাতা হিসেবে নিবন্ধিত হয়েছেন।",
          donor_id: res.meta?.last_row_id
        });
      } catch (err) {
        return json({ success: false, error: "নিবন্ধন ব্যর্থ হয়েছে: " + err.message }, 500);
      }
    }

    // ----------------------------------------------------
    // ADMIN AUTHENTICATION & MANAGEMENT
    // ----------------------------------------------------
    if (path === "/api/admin/login" && method === "POST") {
      try {
        const { username, password } = await request.json();
        if (!username || !password) {
          return json({ success: false, error: "ইউজারনেম ও পাসওয়ার্ড আবশ্যক।" }, 400);
        }

        const admin = await env.DB.prepare("SELECT * FROM admin_users WHERE username = ? OR email = ?").bind(username.trim(), username.trim()).first();
        if (!admin) {
          return json({ success: false, error: "ভুল ইউজারনেম বা পাসওয়ার্ড।" }, 401);
        }

        const passwordHash = await sha256Hex(password);
        if (admin.password_hash !== passwordHash) {
          return json({ success: false, error: "ভুল ইউজারনেম বা পাসওয়ার্ড।" }, 401);
        }

        const token = generateRandomToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
          "INSERT INTO admin_sessions (token, admin_id, created_at, expires_at) VALUES (?, ?, CURRENT_TIMESTAMP, ?)"
        ).bind(token, admin.id, expiresAt).run();

        return json({
          success: true,
          token,
          admin: {
            id: admin.id,
            username: admin.username,
            name: admin.name,
            email: admin.email,
            role: admin.role
          }
        });
      } catch (err) {
        return json({ success: false, error: "লগইন ব্যর্থ হয়েছে: " + err.message }, 500);
      }
    }

    // Admin Auth Middleware Helper
    const authHeader = request.headers.get("Authorization") || "";
    let currentAdmin = null;

    if (authHeader.startsWith("Bearer ")) {
      const sessionToken = authHeader.slice(7).trim();
      if (sessionToken) {
        const session = await env.DB.prepare(`
          SELECT s.*, a.id as admin_id, a.username, a.name, a.email, a.role
          FROM admin_sessions s
          JOIN admin_users a ON s.admin_id = a.id
          WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
        `).bind(sessionToken).first();
        if (session) {
          currentAdmin = session;
        }
      }
    }

    // PROTECT ALL /api/admin/* ROUTES
    if (path.startsWith("/api/admin/")) {
      if (!currentAdmin) {
        return json({ success: false, error: "অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে পুনরায় লগইন করুন।" }, 401);
      }

      // GET ADMIN SETTINGS
      if (path === "/api/admin/settings" && method === "GET") {
        const { results } = await env.DB.prepare("SELECT key, value FROM admin_settings").all();
        const map = {};
        for (const r of (results || [])) {
          if (r.key === "telegram_bot_token") {
            map["telegram_bot_token_masked"] = r.value ? r.value.slice(0, 6) + "..." + r.value.slice(-4) : "";
          } else {
            map[r.key] = r.value;
          }
        }
        return json({ success: true, settings: map });
      }

      // SAVE ADMIN SETTINGS
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
                allowed_updates: ["message", "callback_query"]
              })
            });
          } catch (e) {
            console.error("Auto setWebhook error:", e);
          }
        }

        if (telegram_admin_uids !== undefined) {
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)")
            .bind(telegram_admin_uids.trim()).run();
        }

        return json({ success: true, message: "অ্যাডমিন সেটিংস ও টেলিগ্রাম বট সফলভাবে সংরক্ষিত ও সিঙ্ক করা হয়েছে!" });
      }

      // ADMIN TEST TELEGRAM ALERT
      if (path === "/api/admin/test-telegram" && method === "POST") {
        const testRequest = {
          id: 999,
          patient_name: "টেস্ট রোগী (BRYBDPF)",
          blood_group: "O+",
          units: 1,
          district: "রংপুর",
          hospital_name: "রংপুর মেডিকেল কলেজ হাসপাতাল",
          location: "ধাপ",
          contact_phone: "01700000000"
        };
        const sampleDonors = [
          { name: "হাসান মাহমুদ", blood_group: "O+", district: "রংপুর", area: "ধাপ", phone: "01711111111", proximity_tier: 1 },
          { name: "রাকিব হাসান", blood_group: "O+", district: "রংপুর", area: "মডার্ন মোড়", phone: "01822222222", proximity_tier: 2 }
        ];
        await sendTelegramAlert(env, testRequest, sampleDonors);
        return json({ success: true, message: "টেস্ট টেলিগ্রাম অ্যালার্ট পাঠানো সম্পন্ন হয়েছে।" });
      }

      // LIST DONORS (PAGINATED & FILTERED)
      if (path === "/api/admin/donors" && method === "GET") {
        const bg = url.searchParams.get("blood_group") || "";
        const district = url.searchParams.get("district") || "";
        const available = url.searchParams.get("is_available") || "";
        const search = url.searchParams.get("search") || "";

        let query = "SELECT * FROM donors WHERE 1=1";
        const params = [];

        if (bg) {
          query += " AND blood_group = ?";
          params.push(bg);
        }
        if (district) {
          query += " AND district = ?";
          params.push(district);
        }
        if (available !== "") {
          query += " AND is_available = ?";
          params.push(parseInt(available, 10));
        }
        if (search) {
          query += " AND (name LIKE ? OR phone LIKE ? OR area LIKE ?)";
          params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += " ORDER BY id DESC LIMIT 100";
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return json({ success: true, donors: results || [] });
      }

      // TOGGLE DONOR AVAILABILITY
      if (path === "/api/admin/donors/toggle" && method === "POST") {
        const { id, is_available } = await request.json();
        await env.DB.prepare("UPDATE donors SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(is_available ? 1 : 0, id).run();
        return json({ success: true, message: "ডোনার স্ট্যাটাস আপডেট হয়েছে।" });
      }

      // LIST BLOOD REQUESTS
      if (path === "/api/admin/requests" && method === "GET") {
        const status = url.searchParams.get("status") || "";
        let query = "SELECT * FROM blood_requests WHERE 1=1";
        const params = [];

        if (status) {
          query += " AND status = ?";
          params.push(status);
        }

        query += " ORDER BY id DESC LIMIT 100";
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return json({ success: true, requests: results || [] });
      }

      // UPDATE BLOOD REQUEST STATUS
      if (path === "/api/admin/requests/status" && method === "POST") {
        const { id, status } = await request.json();
        await env.DB.prepare("UPDATE blood_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(status, id).run();
        return json({ success: true, message: "রিকোয়েস্ট স্ট্যাটাস আপডেট হয়েছে।" });
      }
    }

    // 404 for unknown endpoints
    return json({ error: "Endpoint not found", path }, 404);

  } catch (uncaughtError) {
    return json({
      success: false,
      error: "সার্ভার সমস্যা: " + (uncaughtError.message || "অপ্রত্যাশিত ত্রুটি ঘটেছে।"),
      details: uncaughtError.stack
    }, 500);
  }
}
