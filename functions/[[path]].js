
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

async function verifyCaptcha(token, userAnswer) {
  if (!token || !userAnswer) return false;
  try {
    const decoded = atob(token);
    const [num1Str, num2Str, tsStr] = decoded.split(":");
    const num1 = parseInt(num1Str, 10);
    const num2 = parseInt(num2Str, 10);
    const ts = parseInt(tsStr, 10);
    const expected = num1 + num2;
    const cleanedAnswer = parseInt(normalizeDigits(userAnswer), 10);

    if (isNaN(cleanedAnswer) || cleanedAnswer !== expected) {
      return false;
    }
    const now = Date.now();
    if (now - ts > 10 * 60 * 1000) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function tgSendMessage(token, chatId, text, replyMarkup = null, parseMode = "HTML") {
  if (!token || !chatId) return;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: parseMode
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

async function tgEditMessage(token, chatId, messageId, text, replyMarkup = null, parseMode = "HTML") {
  if (!token || !chatId || !messageId) return;
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: parseMode
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function tgSendOrEdit(token, chatId, messageId, text, inlineKeyboard = null, parseModeHtml = true) {
  const replyMarkup = inlineKeyboard ? { inline_keyboard: inlineKeyboard } : null;
  const parseMode = parseModeHtml ? "HTML" : "Markdown";
  if (messageId) {
    const res = await tgEditMessage(token, chatId, messageId, text, replyMarkup, parseMode);
    if (res && res.ok) return;
  }
  await tgSendMessage(token, chatId, text, replyMarkup, parseMode);
}

async function tgAnswerCallbackQuery(token, callbackQueryId, text = null, showAlert = false) {
  if (!token || !callbackQueryId) return;
  const payload = { callback_query_id: callbackQueryId };
  if (text) {
    payload.text = text;
    payload.show_alert = showAlert;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

function getMainAdminKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📊 পরিসংখ্যান", callback_data: "cb:stats" },
        { text: "🩸 রক্তের অনুরোধসমূহ", callback_data: "cb:requests" }
      ],
      [
        { text: "👥 ডোনার তালিকা", callback_data: "cb:groups" },
        { text: "⏳ অপেক্ষমাণ অনুরোধ", callback_data: "cb:pending_reqs" }
      ],
      [
        { text: "🔍 ডোনার খুঁজুন", callback_data: "cb:find_donor" },
        { text: "ℹ️ সাহায্য ও তথ্য", callback_data: "cb:help" }
      ]
    ]
  };
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

    const safePatient = escapeHtml(requestData.patient_name);
    const safeBg = escapeHtml(requestData.blood_group);
    const safeHosp = escapeHtml(requestData.hospital_name);
    const safeDist = escapeHtml(requestData.district);
    const safeThana = escapeHtml(requestData.thana);
    const safeLoc = escapeHtml(requestData.location);
    const safePhone = escapeHtml(requestData.contact_phone);
    const safeRequester = escapeHtml(requestData.requester_name || requestData.patient_name);
    const safeUnits = escapeHtml(requestData.units || 1);
    const safeTime = escapeHtml(requestData.needed_by || "জরুরি");
    const safeNote = escapeHtml(requestData.note || "");

    const promptForPatient =
      `আসসালামু আলাইকুম, BRYBDPF থেকে আপনার রক্তের অনুরোধের প্রেক্ষিতে যোগাযোগ করা হচ্ছে।\n` +
      `রোগী: ${requestData.patient_name}, রক্তের গ্রুপ: ${requestData.blood_group}, হাসপাতাল: ${requestData.hospital_name}।`;
    const patientWaUrl = `https://wa.me/${reqWaNumber}?text=${encodeURIComponent(promptForPatient)}`;

    let donorListHtml = "<i>কোনো তাৎক্ষণিক ডোনার পাওয়া যায়নি</i>";

    if (matchedDonors && matchedDonors.length > 0) {
      donorListHtml = matchedDonors.slice(0, 10).map((d, i) => {
        const dCleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
        const waNumber = dCleanPhone.startsWith("88") ? dCleanPhone : (dCleanPhone.startsWith("0") ? "88" + dCleanPhone : dCleanPhone);

        const promptForDonor =
          `*জরুরি রক্তের আবেদন (BRYBDPF)*\n\n` +
          `আসসালামু আলাইকুম ${d.name} ভাই,\n` +
          `একটি জরুরি রক্তের প্রয়োজনে আপনার সহযোগিতা কামনা করছি:\n\n` +
          `• *রোগী:* ${requestData.patient_name}\n` +
          `• *রক্তের গ্রুপ:* *${requestData.blood_group}*\n` +
          `• *পরিমাণ:* ${requestData.units || 1} ব্যাগ\n` +
          `• *হাসপাতাল:* ${requestData.hospital_name}\n` +
          `• *ঠিকানা:* ${requestData.district}${requestData.location ? ", " + requestData.location : ""}\n` +
          `• *মোবাইল:* *${requestData.contact_phone}*\n` +
          (requestData.note ? `• *নোট:* ${requestData.note}\n` : "") +
          `───────────────────────\n` +
          `🤲 আপনি কি রক্তদান করতে প্রস্তুত আছেন? দয়া করে দ্রুত জানান।\n` +
          `🌐 BRYBDPF ব্লাড নেটওয়ার্ক`;

        const donorWaUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(promptForDonor)}`;
        const tierBadge = d.proximity_tier === 1 ? "🎯 <b>[একই থানা]</b>" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [নিকটবর্তী]");
        const loc = (d.area ? escapeHtml(d.area) + ", " : "") + escapeHtml(d.district || "রংপুর");

        return `${i + 1}. <b>${escapeHtml(d.name)}</b> (${loc}) ${tierBadge}\n` +
          `   📞 <code>${d.phone}</code> ➔ <a href="${donorWaUrl}">💬 <b>WhatsApp</b></a>`;
      }).join("\n\n");
    }

    const message =
      `🚨 <b>নতুন রক্তের অনুরোধ! (BRYBDPF)</b> 🚨\n\n` +
      `👤 <b>রোগী:</b> ${safePatient}\n` +
      `🩸 <b>গ্রুপ:</b> <b>${safeBg}</b> (${safeUnits} ব্যাগ)\n` +
      `🏥 <b>হাসপাতাল:</b> ${safeHosp}\n` +
      `📍 <b>এলাকা:</b> ${safeDist}${safeThana ? " > " + safeThana : ""}${safeLoc ? ", " + safeLoc : ""}\n` +
      `⏱️ <b>সময়:</b> ${safeTime}\n` +
      `📞 <b>আবেদনকারী:</b> ${safeRequester} (<code>${safePhone}</code>)\n` +
      (safeNote ? `📝 <b>নোট:</b> ${safeNote}\n` : "") +
      `\n🔗 <a href="${patientWaUrl}">💬 <b>রোগীর সাথে সরাসরি WhatsApp-এ চ্যাট করুন</b></a>\n` +
      `───────────────────────\n` +
      `🎯 <b>স্মার্ট নিকটবর্তী ডোনারদের তালিকা:</b>\n\n` +
      donorListHtml;

    for (const uid of uids) {
      await tgSendMessage(token, uid, message);
    }
  } catch (err) {}
}

async function getAuthenticatedAdmin(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  if (!token) return null;

  try {
    let session = await env.DB.prepare(
      "SELECT user_id, expires_at FROM admin_sessions WHERE token = ?"
    ).bind(token).first();

    if (!session) {
      session = await env.DB.prepare(
        "SELECT user_id, expires_at FROM sessions WHERE token = ?"
      ).bind(token).first();
    }

    if (!session) return null;

    if (new Date(session.expires_at) < new Date()) {
      return null;
    }

    let user = await env.DB.prepare(
      "SELECT id, username, email, role FROM admin_users WHERE id = ?"
    ).bind(session.user_id).first();

    if (!user) {
      user = await env.DB.prepare(
        "SELECT id, username, email, role FROM users WHERE id = ?"
      ).bind(session.user_id).first();
    }

    return user || null;
  } catch (err) {
    return null;
  }
}

async function handleTelegramWebhook(request, env) {
  try {
    let token = "";
    let adminUidsStr = "";

    const { results: settings } = await env.DB.prepare(
      "SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids', 'telegram_webhook_secret')"
    ).all();

    let webhookSecret = "";
    for (const s of settings) {
      if (s.key === "telegram_bot_token") token = s.value;
      if (s.key === "telegram_admin_uids") adminUidsStr = s.value;
      if (s.key === "telegram_webhook_secret") webhookSecret = s.value;
    }

    if (!token && env.TELEGRAM_BOT_TOKEN) token = env.TELEGRAM_BOT_TOKEN;
    if (!adminUidsStr && env.TELEGRAM_ADMIN_IDS) adminUidsStr = env.TELEGRAM_ADMIN_IDS;

    if (webhookSecret) {
      const incomingSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (incomingSecret !== webhookSecret) {
        return json({ ok: false, error: "Unauthorized webhook request" }, 403);
      }
    }

    if (!token) return json({ ok: true });

    const update = await request.json();
    const adminUids = (adminUidsStr || "").split(",").map(u => u.trim()).filter(Boolean);

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const userId = String(msg.from?.id || "");
      const text = (msg.text || "").trim();

      const isAdmin = adminUids.includes(userId);

      if (text === "/start" || text === "/help" || text === "/menu") {
        let welcomeText = `🩸 <b>BRYBDPF ব্লাড ডোনার ম্যানেজমেন্ট বটের স্বাগতম!</b>\n\n` +
          `এটি বাংলাদেশ রেড ইয়ুথ ব্লাড ডোনার্স প্ল্যাটফর্মের অফিসিয়াল অটোমেশন বট।`;

        if (isAdmin) {
          welcomeText += `\n\n✅ <b>আপনার অ্যাডমিন এক্সেস অনুমোদিত।</b> নিচের বাটনগুলো চেপে সহজেই যেকোনো অপশন সিলেক্ট করুন:`;
          await tgSendMessage(token, chatId, welcomeText, getMainAdminKeyboard());
        } else {
          welcomeText += `\n\nℹ️ <i>আপনার টেলিগ্রাম আইডি:</i> <code>${userId}</code>\n` +
            `আপনি যদি অ্যাডমিন হয়ে থাকেন তবে ওয়েবসাইটের অ্যাডমিন প্যানেল (সেটিংস) এ আপনার এই আইডিটি যুক্ত করুন।`;
          const guestKb = {
            inline_keyboard: [
              [{ text: "📊 বর্তমান পরিসংখ্যান", callback_data: "cb:stats" }],
              [{ text: "🌐 আমাদের ওয়েবসাইট ভিজিট করুন", url: "https://brybdpf.pages.dev" }]
            ]
          };
          await tgSendMessage(token, chatId, welcomeText, guestKb);
        }
        return json({ ok: true });
      }

      if (text.startsWith("/search ") || text.startsWith("/find ")) {
        if (!isAdmin) {
          await tgSendMessage(token, chatId, "❌ এই কমান্ডটি ব্যবহারের অনুমতি আপনার নেই।");
          return json({ ok: true });
        }
        const query = text.replace(/^\/(search|find)\s+/, "").trim();
        const donorsRes = await env.DB.prepare(
          "SELECT name, blood_group, district, thana, area, phone, total_donations FROM donors WHERE (blood_group = ? OR district LIKE ? OR thana LIKE ? OR phone LIKE ?) AND is_active = 1 LIMIT 10"
        ).bind(query.toUpperCase(), `%${query}%`, `%${query}%`, `%${query}%`).all();

        const donors = donorsRes.results || [];
        if (donors.length === 0) {
          await tgSendMessage(token, chatId, `🔍 <b>"${escapeHtml(query)}"</b> এর জন্য কোনো ডোনার পাওয়া যায়নি।`);
        } else {
          let donorMsg = `🔍 <b>"${escapeHtml(query)}"</b> এর ফলাফল (${donors.length} জন ডোনার):\n\n`;
          donorMsg += donors.map((d, i) => {
            const dCleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const waNumber = dCleanPhone.startsWith("88") ? dCleanPhone : (dCleanPhone.startsWith("0") ? "88" + dCleanPhone : dCleanPhone);
            const waMsg = `আসসালামু আলাইকুম ${d.name} ভাই, BRYBDPF থেকে রক্তের জরুরি প্রয়োজনে যোগাযোগ করা হচ্ছে।`;
            const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;
            const loc = (d.area ? escapeHtml(d.area) + ", " : "") + escapeHtml(d.district || "রংপুর");

            return `<b>${i + 1}. ${escapeHtml(d.name)}</b> [<b>${d.blood_group}</b>] (${loc})\n` +
              `   📞 <code>${d.phone}</code> | দান: ${d.total_donations || 0} বার ➔ <a href="${waUrl}">💬 <b>WhatsApp</b></a>`;
          }).join("\n\n");
          await tgSendMessage(token, chatId, donorMsg);
        }
        return json({ ok: true });
      }

      if (text === "/stats") {
        const stats = await getPlatformStats(env);
        const statsMsg = `📊 <b>BRYBDPF ব্লাড প্ল্যাটফর্ম লাইভ পরিসংখ্যান</b> 📊\n\n` +
          `👥 <b>মোট রক্তদাতা:</b> ${stats.totalDonors} জন\n` +
          `🩸 <b>মোট রক্তের অনুরোধ:</b> ${stats.totalRequests} টি\n` +
          `✅ <b>সফল রক্তদান:</b> ${stats.completedRequests} টি\n` +
          `⏳ <b>চলমান/অপেক্ষমাণ অনুরোধ:</b> ${stats.pendingRequests} টি\n\n` +
          `<i>আপডেট সময়: ${new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}</i>`;
        await tgSendMessage(token, chatId, statsMsg, isAdmin ? getMainAdminKeyboard() : null);
        return json({ ok: true });
      }
    }

    if (update.callback_query) {
      const cb = update.callback_query;
      const callbackId = cb.id;
      const data = cb.data || "";
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      const userId = String(cb.from?.id || "");
      const isAdmin = adminUids.includes(userId);

      await tgAnswerCallbackQuery(token, callbackId);

      if (data === "cb:menu") {
        let menuText = `🩸 <b>BRYBDPF স্মার্ট অ্যাডমিন কন্ট্রোল বাটন</b> 🩸\nনিচের বাটনগুলো চেপে সরাসরি অ্যাক্সেস করুন:`;
        await tgSendOrEdit(token, chatId, messageId, menuText, getMainAdminKeyboard().inline_keyboard, true);
        return json({ ok: true });
      }

      if (data === "cb:stats") {
        const stats = await getPlatformStats(env);
        const statsMsg = `📊 <b>BRYBDPF প্ল্যাটফর্ম পরিসংখ্যান</b> 📊\n\n` +
          `👥 <b>মোট রক্তদাতা:</b> ${stats.totalDonors} জন\n` +
          `🩸 <b>মোট রক্তের অনুরোধ:</b> ${stats.totalRequests} টি\n` +
          `✅ <b>সফল রক্তদান:</b> ${stats.completedRequests} টি\n` +
          `⏳ <b>চলমান/অপেক্ষমাণ অনুরোধ:</b> ${stats.pendingRequests} টি\n\n` +
          `<i>আপডেট: ${new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}</i>`;

        const kb = [
          [{ text: "🔄 রিফ্রেশ", callback_data: "cb:stats" }],
          [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
        ];
        await tgSendOrEdit(token, chatId, messageId, statsMsg, kb, true);
        return json({ ok: true });
      }

      if (data === "cb:requests" || data === "cb:pending_reqs") {
        if (!isAdmin) {
          await tgSendOrEdit(token, chatId, messageId, "❌ এই তথ্য দেখার অনুমতি আপনার নেই।", null, true);
          return json({ ok: true });
        }

        const isPendingOnly = data === "cb:pending_reqs";
        const sql = isPendingOnly
          ? "SELECT id, patient_name, blood_group, units, hospital_name, district, thana, contact_phone, status, needed_by, created_at FROM requests WHERE status = 'pending' ORDER BY id DESC LIMIT 5"
          : "SELECT id, patient_name, blood_group, units, hospital_name, district, thana, contact_phone, status, needed_by, created_at FROM requests ORDER BY id DESC LIMIT 5";

        const { results: reqs } = await env.DB.prepare(sql).all();

        if (!reqs || reqs.length === 0) {
          const emptyMsg = isPendingOnly
            ? "✅ <b>বর্তমানে কোনো অপেক্ষমাণ রক্তের অনুরোধ নেই!</b>"
            : "ℹ️ <b>কোনো রক্তের অনুরোধ পাওয়া যায়নি।</b>";
          const kb = [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]];
          await tgSendOrEdit(token, chatId, messageId, emptyMsg, kb, true);
          return json({ ok: true });
        }

        let respText = isPendingOnly
          ? `⏳ <b>অপেক্ষমাণ রক্তের অনুরোধসমূহ (সর্বশেষ ${reqs.length} টি):</b>\n\n`
          : `🩸 <b>রক্তের অনুরোধসমূহ (সর্বশেষ ${reqs.length} টি):</b>\n\n`;

        const inlineKb = [];

        reqs.forEach((r, idx) => {
          const cleanPhone = (r.contact_phone || "").replace(/[^0-9]/g, "");
          const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
          const prompt = `আসসালামু আলাইকুম, BRYBDPF থেকে রক্তের অনুরোধ সংক্রান্ত যোগাযোগ।`;
          const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(prompt)}`;

          const statusBadge = r.status === "completed" ? "✅ সম্পন্ন" : (r.status === "cancelled" ? "❌ বাতিল" : "⏳ অপেক্ষমাণ");

          respText += `<b>${idx + 1}. রোগী: ${escapeHtml(r.patient_name)}</b> [<b>${r.blood_group}</b>] (${r.units || 1} ব্যাগ)\n` +
            `   🏥 ${escapeHtml(r.hospital_name)} | ${escapeHtml(r.district)}${r.thana ? ", " + escapeHtml(r.thana) : ""}\n` +
            `   📞 <code>${r.contact_phone}</code> ➔ <a href="${waUrl}">💬 <b>WhatsApp</b></a>\n` +
            `   📌 স্ট্যাটাস: ${statusBadge}\n\n`;

          if (r.status === "pending") {
            inlineKb.push([
              { text: `🎯 #${r.id} এর ডোনার দেখুন`, callback_data: `cb:match:${r.id}` },
              { text: `✅ সম্পন্ন করুন`, callback_data: `cb:done:${r.id}` }
            ]);
          }
        });

        inlineKb.push([
          { text: "🔄 রিফ্রেশ", callback_data: data },
          { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
        ]);

        await tgSendOrEdit(token, chatId, messageId, respText, inlineKb, true);
        return json({ ok: true });
      }

      if (data.startsWith("cb:match:")) {
        if (!isAdmin) return json({ ok: true });
        const reqId = parseInt(data.replace("cb:match:", ""), 10);
        const reqItem = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(reqId).first();

        if (!reqItem) {
          await tgSendOrEdit(token, chatId, messageId, "❌ অনুরোধটি পাওয়া যায়নি।", [[{ text: "🔙 ফিরে যান", callback_data: "cb:pending_reqs" }]], true);
          return json({ ok: true });
        }

        const donors = await findSmartMatchingDonors(env, reqItem.blood_group, reqItem.district, reqItem.thana, 10);

        let matchText = `🎯 <b>অনুরোধ #${reqItem.id} এর জন্য ডোনার তালিকা:</b>\n` +
          `👤 রোগী: <b>${escapeHtml(reqItem.patient_name)}</b> [<b>${reqItem.blood_group}</b>]\n` +
          `📍 এলাকা: ${escapeHtml(reqItem.district)}${reqItem.thana ? ", " + escapeHtml(reqItem.thana) : ""}\n\n`;

        if (donors.length === 0) {
          matchText += `<i>কোনো উপযুক্ত ডোনার বর্তমানে ফ্রি নেই।</i>`;
        } else {
          matchText += donors.map((d, i) => {
            const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
            const waMsg = `আসসালামু আলাইকুম ${d.name} ভাই, রোগী ${reqItem.patient_name} এর জন্য জরুরি ${reqItem.blood_group} রক্ত প্রয়োজন। আপনি কি রক্তদান করতে প্রস্তুত আছেন?`;
            const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;
            const tierBadge = d.proximity_tier === 1 ? "🎯 [একই থানা]" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [নিকটবর্তী]");
            const loc = (d.area ? escapeHtml(d.area) + ", " : "") + escapeHtml(d.district || "রংপুর");

            return `<b>${i + 1}. ${escapeHtml(d.name)}</b> (${loc}) ${tierBadge}\n` +
              `   📞 <code>${d.phone}</code> ➔ <a href="${waUrl}">💬 <b>WhatsApp</b></a>`;
          }).join("\n\n");
        }

        const inlineKb = [
          [{ text: "✅ এই অনুরোধ সম্পন্ন করুন", callback_data: `cb:done:${reqId}` }],
          [{ text: "🔙 অনুরোধ তালিকায় ফিরুন", callback_data: "cb:pending_reqs" }]
        ];

        await tgSendOrEdit(token, chatId, messageId, matchText, inlineKb, true);
        return json({ ok: true });
      }

      if (data.startsWith("cb:done:")) {
        if (!isAdmin) return json({ ok: true });
        const reqId = parseInt(data.replace("cb:done:", ""), 10);

        await env.DB.prepare("UPDATE requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reqId).run();

        const successText = `✅ <b>অনুরোধ #${reqId} সফলভাবে সম্পন্ন হিসেবে চিহ্নিত করা হয়েছে!</b>\n\nরোগীর জীবন রক্ষায় অবদান রাখার জন্য ধন্যবাদ।`;
        const kb = [
          [{ text: "🩸 অন্যান্য অপেক্ষমাণ অনুরোধ", callback_data: "cb:pending_reqs" }],
          [{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]
        ];
        await tgSendOrEdit(token, chatId, messageId, successText, kb, true);
        return json({ ok: true });
      }

      if (data === "cb:groups") {
        if (!isAdmin) return json({ ok: true });

        const groupsText = `🩸 <b>রক্তের গ্রুপ অনুযায়ী ডোনার তালিকা দেখুন:</b>\nগ্রুপ সিলেক্ট করুন:`;
        const groupKb = [
          [
            { text: "🅰️ A+", callback_data: "cb:grp:A%2B" },
            { text: "🅱️ B+", callback_data: "cb:grp:B%2B" },
            { text: "🆎 AB+", callback_data: "cb:grp:AB%2B" },
            { text: "🅾️ O+", callback_data: "cb:grp:O%2B" }
          ],
          [
            { text: "🅰️ A-", callback_data: "cb:grp:A-" },
            { text: "🅱️ B-", callback_data: "cb:grp:B-" },
            { text: "🆎 AB-", callback_data: "cb:grp:AB-" },
            { text: "🅾️ O-", callback_data: "cb:grp:O-" }
          ],
          [
            { text: "🔙 মূল মেনু", callback_data: "cb:menu" }
          ]
        ];
        await tgSendOrEdit(token, chatId, messageId, groupsText, groupKb, true);
        return json({ ok: true });
      }

      if (data.startsWith("cb:grp:")) {
        if (!isAdmin) return json({ ok: true });
        const grp = decodeURIComponent(data.replace("cb:grp:", ""));

        const { results: donors } = await env.DB.prepare(
          "SELECT name, blood_group, district, thana, area, phone, total_donations, last_donation_date FROM donors WHERE blood_group = ? AND is_active = 1 ORDER BY last_donation_date ASC LIMIT 10"
        ).bind(grp).all();

        let donorText = `🩸 <b>গ্রুপ ${grp} এর ডোনার তালিকা (শীর্ষ ${donors.length || 0} জন):</b>\n\n`;
        const inlineKb = [];

        if (!donors || donors.length === 0) {
          donorText += `<i>এই গ্রুপের কোনো সক্রিয় ডোনার বর্তমানে নিবন্ধিত নেই।</i>`;
        } else {
          donorText += donors.map((d, i) => {
            const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
            const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
            const waMsg = `আসসালামু আলাইকুম ${d.name} ভাই, BRYBDPF থেকে রক্তের জরুরি প্রয়োজনে যোগাযোগ করা হচ্ছে।`;
            const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;
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
        return json({ ok: true });
      }

      if (data === "cb:find_donor") {
        const findHelp = `🔍 <b>ডোনার সার্চ করার নিয়ম:</b>\n\n` +
          `নির্দিষ্ট রক্তদাতা খুঁজতে নিচের ফরম্যাটে মেসেজ লিখুন:\n` +
          `<code>/find [রক্তের গ্রুপ বা জেলা বা ফোন নম্বর]</code>\n\n` +
          `<b>উদাহরণ:</b>\n` +
          `• <code>/find B+</code>\n` +
          `• <code>/find রংপুর</code>\n` +
          `• <code>/find 017</code>`;
        await tgSendOrEdit(token, chatId, messageId, findHelp, [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
        return json({ ok: true });
      }

      if (data === "cb:help") {
        const helpText = `ℹ️ <b>BRYBDPF হেল্প সেন্টার</b> ℹ️\n\n` +
          `• ওয়েব পোর্টাল: https://brybdpf.pages.dev\n` +
          `• অ্যাডমিন প্যানেল: https://brybdpf.pages.dev/admin\n` +
          `• সহায়তা ও যোগাযোগ: রেড ইয়ুথ ব্লাড ডোনার্স প্ল্যাটফর্ম\n` +
          `• জরুরি রক্তের চাহিদা মেটাতে ও দ্রুত ডোনার খুঁজে পেতে এই বট ২৪/৭ সক্রিয় রয়েছে।`;
        await tgSendOrEdit(token, chatId, messageId, helpText, [[{ text: "🔙 মূল মেনু", callback_data: "cb:menu" }]], true);
        return json({ ok: true });
      }
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

async function getPlatformStats(env) {
  try {
    const totalDonors = (await env.DB.prepare("SELECT COUNT(*) AS c FROM donors WHERE is_active = 1").first())?.c || 0;
    const totalRequests = (await env.DB.prepare("SELECT COUNT(*) AS c FROM requests").first())?.c || 0;
    const completedRequests = (await env.DB.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'completed'").first())?.c || 0;
    const pendingRequests = (await env.DB.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'pending'").first())?.c || 0;
    return { totalDonors, totalRequests, completedRequests, pendingRequests };
  } catch (e) {
    return { totalDonors: 0, totalRequests: 0, completedRequests: 0, pendingRequests: 0 };
  }
}

const RANGPUR_GEO = {
  "রংপুর": ["কোতোয়ালী", "গংগাচড়া", "তারাগঞ্জ", "বদরগঞ্জ", "মিঠাপুকুর", "পীরগাছা", "পীরগঞ্জ", "কাউনিয়া"],
  "কুড়িগ্রাম": ["কুড়িগ্রাম সদর", "নাগেশ্বরী", "ভুরুঙ্গামারী", "ফুলবাড়ী", "রাজারহাট", "উলিপুর", "চিলমারী", "রৌমারী", "চর রাজিবপুর"],
  "লালমনিরহাট": ["লালমনিরহাট সদর", "আদিতমারী", "কালীগঞ্জ", "হাতীবান্ধা", "পাটগ্রাম"],
  "গাইবান্ধা": ["গাইবান্ধা সদর", "সাদুল্লাপুর", "গোবিন্দগঞ্জ", "পলাশবাড়ী", "সুন্দরগঞ্জ", "সাঘাটা", "ফুলছড়ি"],
  "নীলফামারী": ["নীলফামারী সদর", "সৈয়দপুর", "ডোমার", "ডিমলা", "জলঢাকা", "কিশোরগঞ্জ"],
  "দিনাজপুর": ["দিনাজপুর সদর", "বিরামপুর", "বীরগঞ্জ", "বোচাগঞ্জ", "ফুলবাড়ী", "চিরিরবন্দর", "ঘোড়াঘাট", "হাকিমপুর", "কাহারোল", "খানসামা", "নবাবগঞ্জ", "পার্বতীপুর"],
  "ঠাকুরগাঁও": ["ঠাকুরগাঁও সদর", "পীরগঞ্জ", "বালিয়াডাঙ্গী", "হরিপুর", "রাণীশংকৈল"],
  "পঞ্চগড়": ["পঞ্চগড় সদর", "দেবীগঞ্জ", "বোদা", "আটোয়ারী", "তেঁতুলিয়া"]
};

function normalizeGeoName(name) {
  if (!name) return "";
  return String(name).trim().replace(/^(থানা|উপজেলা|জেলা)\s*:\s*/, "");
}

async function findSmartMatchingDonors(env, bloodGroup, reqDistrict, reqThana, limit = 10) {
  const normDistrict = normalizeGeoName(reqDistrict);
  const normThana = normalizeGeoName(reqThana);

  const matched = [];
  const addedIds = new Set();

  if (normThana && normDistrict) {
    const tier1Res = await env.DB.prepare(`
      SELECT id, name, blood_group, district, thana, area, phone, last_donation_date, total_donations, 1 as proximity_tier
      FROM donors
      WHERE blood_group = ? 
        AND is_active = 1
        AND (district = ? OR district LIKE ?)
        AND (thana = ? OR thana LIKE ?)
      ORDER BY 
        CASE WHEN last_donation_date IS NULL OR last_donation_date = '' THEN 0 ELSE 1 END,
        last_donation_date ASC
      LIMIT ?
    `).bind(bloodGroup, normDistrict, `%${normDistrict}%`, normThana, `%${normThana}%`, limit).all();

    for (const d of (tier1Res.results || [])) {
      if (!addedIds.has(d.id)) {
        matched.push(d);
        addedIds.add(d.id);
      }
    }
  }

  if (matched.length < limit && normDistrict) {
    const needed = limit - matched.length;
    const tier2Res = await env.DB.prepare(`
      SELECT id, name, blood_group, district, thana, area, phone, last_donation_date, total_donations, 2 as proximity_tier
      FROM donors
      WHERE blood_group = ?
        AND is_active = 1
        AND (district = ? OR district LIKE ?)
      ORDER BY 
        CASE WHEN last_donation_date IS NULL OR last_donation_date = '' THEN 0 ELSE 1 END,
        last_donation_date ASC
      LIMIT ?
    `).bind(bloodGroup, normDistrict, `%${normDistrict}%`, needed * 2).all();

    for (const d of (tier2Res.results || [])) {
      if (!addedIds.has(d.id)) {
        matched.push(d);
        addedIds.add(d.id);
        if (matched.length >= limit) break;
      }
    }
  }

  if (matched.length < limit) {
    const needed = limit - matched.length;
    const tier3Res = await env.DB.prepare(`
      SELECT id, name, blood_group, district, thana, area, phone, last_donation_date, total_donations, 3 as proximity_tier
      FROM donors
      WHERE blood_group = ?
        AND is_active = 1
      ORDER BY 
        CASE WHEN district = 'রংপুর' THEN 0 ELSE 1 END,
        CASE WHEN last_donation_date IS NULL OR last_donation_date = '' THEN 0 ELSE 1 END,
        last_donation_date ASC
      LIMIT ?
    `).bind(bloodGroup, needed * 2).all();

    for (const d of (tier3Res.results || [])) {
      if (!addedIds.has(d.id)) {
        matched.push(d);
        addedIds.add(d.id);
        if (matched.length >= limit) break;
      }
    }
  }

  return matched.slice(0, limit);
}

async function ensureAllDatabaseTables(db) {
  if (!db) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS donors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        blood_group TEXT NOT NULL,
        district TEXT NOT NULL,
        thana TEXT,
        area TEXT,
        phone TEXT NOT NULL,
        last_donation_date TEXT,
        total_donations INTEGER DEFAULT 0,
        is_available INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_name TEXT NOT NULL,
        requester_name TEXT,
        requester_blood_group TEXT,
        blood_group TEXT NOT NULL,
        units INTEGER DEFAULT 1,
        hospital_name TEXT NOT NULL,
        district TEXT NOT NULL,
        thana TEXT,
        location TEXT,
        contact_phone TEXT NOT NULL,
        needed_by TEXT,
        note TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      await db.prepare("ALTER TABLE donors ADD COLUMN thana TEXT").run();
    } catch (_) {}
    try {
      await db.prepare("ALTER TABLE requests ADD COLUMN thana TEXT").run();
    } catch (_) {}
    try {
      await db.prepare("ALTER TABLE requests ADD COLUMN requester_name TEXT").run();
    } catch (_) {}
    try {
      await db.prepare("ALTER TABLE requests ADD COLUMN requester_blood_group TEXT").run();
    } catch (_) {}
  } catch (_) {}
}

let dbInitialized = false;
async function ensureDbInitializedOnce(db) {
  if (!dbInitialized) {
    try {
      await ensureAllDatabaseTables(db);
      dbInitialized = true;
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

      if (method === "OPTIONS") return json({ ok: true });

      if (env.DB) {
        await ensureDbInitializedOnce(env.DB);
      }

      if (path === "/api/telegram/webhook" && method === "POST") {
        return await handleTelegramWebhook(request, env);
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
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            drop_pending_updates: false,
            allowed_updates: ["message", "callback_query"]
          })
        });
        const tgData = await tgRes.json();
        return json({ success: tgData.ok, result: tgData, webhookUrl });
      }

      if (path === "/api/captcha" && method === "GET") {
        const n1 = Math.floor(Math.random() * 9) + 1;
        const n2 = Math.floor(Math.random() * 9) + 1;
        const token = btoa(`${n1}:${n2}:${Date.now()}`);
        return json({ question: `${n1} + ${n2} = ?`, token });
      }

      if (path === "/api/stats" && method === "GET") {
        const stats = await getPlatformStats(env);
        return json(stats);
      }

      if (path === "/api/donors/search") {
        return json({
          error: "নিরাপত্তা ও গোপনীয়তা সুরক্ষার স্বার্থে রক্তদাতাদের উন্মুক্ত তালিকা প্রদর্শন সাময়িকভাবে বন্ধ রাখা হয়েছে। আপনার রক্তের প্রয়োজন হলে ওয়েবসাইটের 'জরুরি রক্তের অনুরোধ' ফর্মটি পূরণ করুন।"
        }, 403);
      }

      if (path === "/api/donors/register" && method === "POST") {
        const data = await request.json();
        const { name, blood_group, district, thana, area, phone, last_donation_date, captcha_token, captcha_answer } = data;

        if (!name || !blood_group || !district || !phone) {
          return json({ error: "নাম, রক্তের গ্রুপ, জেলা এবং মোবাইল নম্বর আবশ্যক।" }, 400);
        }

        if (!isValidPhone(phone)) {
          return json({ error: "সঠিক ১১ ডিজিটের বাংলাদেশী মোবাইল নম্বর দিন (যেমন: 017xxxxxxxx)।" }, 400);
        }

        const validCaptcha = await verifyCaptcha(captcha_token, captcha_answer);
        if (!validCaptcha) {
          return json({ error: "ক্যাপচা সমাধান সঠিক হয়নি অথবা মেয়াদোত্তীর্ণ হয়েছে। পুনরায় চেষ্টা করুন।" }, 400);
        }

        const cleanPhone = normalizePhone(phone);
        const existing = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
        if (existing) {
          return json({ error: "এই মোবাইল নম্বরটি দিয়ে ইতিমধ্যে রক্তদাতা নিবন্ধিত রয়েছে।" }, 400);
        }

        await env.DB.prepare(
          "INSERT INTO donors (name, blood_group, district, thana, area, phone, last_donation_date, total_donations, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)"
        ).bind(
          name.trim(),
          blood_group.trim().toUpperCase(),
          district.trim(),
          (thana || "").trim(),
          (area || "").trim(),
          cleanPhone,
          last_donation_date || null
        ).run();

        return json({ success: true, message: "রক্তদাতা হিসেবে আপনার নিবন্ধন সফলভাবে সম্পন্ন হয়েছে! আপনাকে ধন্যবাদ।" });
      }

      if (path === "/api/requests/create" && method === "POST") {
        const data = await request.json();
        const {
          patient_name,
          requester_name,
          requester_blood_group,
          blood_group,
          units,
          hospital_name,
          district,
          thana,
          location,
          contact_phone,
          needed_by,
          note,
          register_as_donor,
          captcha_token,
          captcha_answer
        } = data;

        if (!patient_name || !blood_group || !hospital_name || !district || !contact_phone) {
          return json({ error: "রোগীর নাম, রক্তের গ্রুপ, হাসপাতাল, জেলা এবং যোগাযোগ নম্বর আবশ্যক।" }, 400);
        }

        if (!isValidPhone(contact_phone)) {
          return json({ error: "সঠিক ১১ ডিজিটের বাংলাদেশী মোবাইল নম্বর দিন।" }, 400);
        }

        const validCaptcha = await verifyCaptcha(captcha_token, captcha_answer);
        if (!validCaptcha) {
          return json({ error: "ক্যাপচা সমাধান সঠিক হয়নি অথবা মেয়াদোত্তীর্ণ হয়েছে।" }, 400);
        }

        const cleanPhone = normalizePhone(contact_phone);

        const insertResult = await env.DB.prepare(
          "INSERT INTO requests (patient_name, requester_name, requester_blood_group, blood_group, units, hospital_name, district, thana, location, contact_phone, needed_by, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
        ).bind(
          patient_name.trim(),
          (requester_name || "").trim() || patient_name.trim(),
          (requester_blood_group || "").trim() || null,
          blood_group.trim().toUpperCase(),
          parseInt(units, 10) || 1,
          hospital_name.trim(),
          district.trim(),
          (thana || "").trim(),
          (location || "").trim(),
          cleanPhone,
          needed_by || "জরুরি",
          note || ""
        ).run();

        const requestId = insertResult.meta?.last_row_id;

        if (register_as_donor && requester_name && requester_blood_group) {
          try {
            const exists = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
            if (!exists) {
              await env.DB.prepare(
                "INSERT INTO donors (name, blood_group, district, thana, area, phone, total_donations, is_active) VALUES (?, ?, ?, ?, ?, ?, 0, 1)"
              ).bind(
                requester_name.trim(),
                requester_blood_group.trim().toUpperCase(),
                district.trim(),
                (thana || "").trim(),
                (location || "").trim(),
                cleanPhone
              ).run();
            }
          } catch (e) {}
        }

        const matchedDonors = await findSmartMatchingDonors(env, blood_group.trim().toUpperCase(), district.trim(), (thana || "").trim(), 10);

        ctx.waitUntil(sendTelegramAlert(env, {
          id: requestId,
          patient_name,
          requester_name,
          requester_blood_group,
          blood_group,
          units,
          hospital_name,
          district,
          thana,
          location,
          contact_phone: cleanPhone,
          needed_by,
          note
        }, matchedDonors));

        return json({
          success: true,
          message: "রক্তের অনুরোধটি সফলভাবে গ্রহণ করা হয়েছে! আমাদের স্বেচ্ছাসেবক ও সংশ্লিষ্ট রক্তদাতাদের স্বয়ংক্রিয় অ্যালার্ট পাঠানো হয়েছে।",
          requestId
        });
      }

      if (path === "/api/admin/check-setup" && method === "GET") {
        const count = (await env.DB.prepare("SELECT COUNT(*) as c FROM admin_users").first())?.c || 0;
        return json({ needsSetup: count === 0 });
      }

      if (path === "/api/admin/setup" && method === "POST") {
        const count = (await env.DB.prepare("SELECT COUNT(*) as c FROM admin_users").first())?.c || 0;
        if (count > 0) {
          return json({ error: "অ্যাডমিন ইতিমধ্যে কনফিগার করা হয়েছে। লগইন করুন।" }, 400);
        }

        const { username, password, email } = await request.json();
        if (!username || !password || password.length < 6) {
          return json({ error: "ব্যবহারকারীর নাম ও কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
        }

        const salt = crypto.randomUUID();
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(password + salt));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        await env.DB.prepare(
          "INSERT INTO admin_users (username, password_hash, salt, email, role) VALUES (?, ?, ?, ?, 'superadmin')"
        ).bind(username.trim(), passwordHash, salt, (email || "").trim()).run();

        const token = crypto.randomUUID();
        const user = await env.DB.prepare("SELECT id FROM admin_users WHERE username = ?").bind(username.trim()).first();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
          "INSERT INTO admin_sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
        ).bind(user.id, token, expiresAt).run();

        return json({ success: true, message: "অ্যাডমিন সফলভাবে তৈরি হয়েছে!", token });
      }

      if (path === "/api/admin/login" && method === "POST") {
        const { username, password } = await request.json();
        if (!username || !password) {
          return json({ error: "ইউজারনেম এবং পাসওয়ার্ড দিন।" }, 400);
        }

        const cleanUsername = username.trim();
        let user = await env.DB.prepare(
          "SELECT * FROM admin_users WHERE username = ? OR email = ?"
        ).bind(cleanUsername, cleanUsername.toLowerCase()).first();

        if (!user) {
          user = await env.DB.prepare(
            "SELECT * FROM users WHERE username = ? OR email = ?"
          ).bind(cleanUsername, cleanUsername.toLowerCase()).first();
        }

        if (!user) {
          return json({ error: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।" }, 401);
        }

        const encoder = new TextEncoder();
        let isMatch = false;

        if (user.salt) {
          const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(password + user.salt));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const passwordHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
          if (passwordHash === user.password_hash) isMatch = true;
        }

        if (!isMatch && user.password) {
          const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(password));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const rawHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
          if (rawHash === user.password || password === user.password) isMatch = true;
        }

        if (!isMatch) {
          return json({ error: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।" }, 401);
        }

        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
          "INSERT INTO admin_sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
        ).bind(user.id, token, expiresAt).run();

        return json({
          success: true,
          token,
          user: { id: user.id, username: user.username, role: user.role }
        });
      }

      if (path === "/api/admin/logout" && method === "POST") {
        const authHeader = request.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.substring(7).trim();
          try {
            await env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
            await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
          } catch (e) {}
        }
        return json({ success: true });
      }

      if (path.startsWith("/api/admin/")) {
        const admin = await getAuthenticatedAdmin(request, env);
        if (!admin) {
          return json({ error: "অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে লগইন করুন।" }, 401);
        }

        if (path === "/api/admin/data" && method === "GET") {
          const stats = await getPlatformStats(env);
          const { results: recentRequests } = await env.DB.prepare(
            "SELECT * FROM requests ORDER BY id DESC LIMIT 10"
          ).all();
          const { results: recentDonors } = await env.DB.prepare(
            "SELECT * FROM donors ORDER BY id DESC LIMIT 10"
          ).all();

          return json({
            stats,
            recentRequests: recentRequests || [],
            recentDonors: recentDonors || []
          });
        }

        if (path === "/api/admin/donors" && method === "GET") {
          const page = parseInt(url.searchParams.get("page") || "1", 10);
          const limit = 20;
          const offset = (page - 1) * limit;

          const bg = url.searchParams.get("blood_group");
          const dist = url.searchParams.get("district");
          const q = url.searchParams.get("q");

          let query = "SELECT * FROM donors WHERE 1=1";
          const params = [];

          if (bg) { query += " AND blood_group = ?"; params.push(bg.toUpperCase()); }
          if (dist) { query += " AND district = ?"; params.push(dist); }
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
          const donor = await env.DB.prepare("SELECT is_active FROM donors WHERE id = ?").bind(donorId).first();
          if (!donor) return json({ error: "ডোনার পাওয়া যায়নি" }, 404);

          const newStatus = donor.is_active ? 0 : 1;
          await env.DB.prepare("UPDATE donors SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newStatus, donorId).run();
          return json({ success: true, is_active: newStatus });
        }

        if (path.startsWith("/api/admin/donors/") && method === "DELETE") {
          const donorId = path.split("/")[4];
          await env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(donorId).run();
          return json({ success: true });
        }

        if (path === "/api/admin/requests" && method === "GET") {
          const page = parseInt(url.searchParams.get("page") || "1", 10);
          const limit = 10;
          const offset = (page - 1) * limit;

          const days = parseInt(url.searchParams.get("days") || "10", 10);
          const status = url.searchParams.get("status");

          let query = "SELECT * FROM requests WHERE 1=1";
          const params = [];

          if (days > 0) {
            query += " AND created_at >= datetime('now', '-' || ? || ' days')";
            params.push(days);
          }

          if (status && ["pending", "completed", "cancelled"].includes(status)) {
            query += " AND status = ?";
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
          const reqItem = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(reqId).first();
          if (!reqItem) return json({ error: "অনুরোধ পাওয়া যায়নি" }, 404);

          const donors = await findSmartMatchingDonors(env, reqItem.blood_group, reqItem.district, reqItem.thana, 10);
          return json({ request: reqItem, donors });
        }

        if (path.startsWith("/api/admin/requests/") && path.endsWith("/status") && method === "POST") {
          const reqId = path.split("/")[4];
          const { status } = await request.json();

          if (!["pending", "completed", "cancelled"].includes(status)) {
            return json({ error: "অবৈধ স্ট্যাটাস" }, 400);
          }

          await env.DB.prepare(
            "UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).bind(status, reqId).run();

          return json({ success: true, status });
        }

        if (path === "/api/admin/settings" && method === "GET") {
          const { results: settings } = await env.DB.prepare("SELECT key, value FROM admin_settings").all();
          const settingsMap = {};
          for (const s of (settings || [])) {
            settingsMap[s.key] = s.value;
          }
          return json(settingsMap);
        }

        if (path === "/api/admin/settings" && method === "POST") {
          const data = await request.json();
          for (const [key, value] of Object.entries(data)) {
            const existing = await env.DB.prepare("SELECT id FROM admin_settings WHERE key = ?").bind(key).first();
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
              await fetch(`https://api.telegram.org/bot${data.telegram_bot_token}/setWebhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: webhookUrl,
                  drop_pending_updates: false,
                  allowed_updates: ["message", "callback_query"]
                })
              });
            } catch (e) {}
          }

          return json({ success: true, message: "সেটিংস সংরক্ষিত হয়েছে!" });
        }

        if (path === "/api/admin/change-password" && method === "POST") {
          const { current_password, new_password } = await request.json();
          if (!new_password || new_password.length < 6) {
            return json({ error: "কমপক্ষে ৬ অক্ষরের নতুন পাসওয়ার্ড দিন।" }, 400);
          }

          const user = await env.DB.prepare("SELECT * FROM admin_users WHERE id = ?").bind(admin.id).first();
          if (!user) return json({ error: "ব্যবহারকারী পাওয়া যায়নি" }, 404);

          const encoder = new TextEncoder();
          const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(current_password + user.salt));
          const currentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

          if (currentHash !== user.password_hash) {
            return json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" }, 400);
          }

          const newSalt = crypto.randomUUID();
          const newHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(new_password + newSalt));
          const newPasswordHash = Array.from(new Uint8Array(newHashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

          await env.DB.prepare(
            "UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?"
          ).bind(newPasswordHash, newSalt, admin.id).run();

          return json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!" });
        }

        if (path === "/api/admin/test-telegram" && method === "POST") {
          const testRequest = {
            id: 9999,
            patient_name: "পরীক্ষামূলক রোগী",
            blood_group: "O+",
            units: 1,
            hospital_name: "রংপুর মেডিকেল কলেজ হাসপাতাল",
            district: "রংপুর",
            thana: "কোতোয়ালী",
            location: "মেডিকেল মোড়",
            contact_phone: "01700000000",
            needed_by: "জরুরি",
            note: "BRYBDPF টেলিগ্রাম বট ইন্টিগ্রেশন সফলভাবে কাজ করছে!"
          };
          const sampleDonors = [
            { name: "করিম হোসেন", blood_group: "O+", district: "রংপুর", thana: "কোতোয়ালী", area: "মেডিকেল মোড়", phone: "01711111111", proximity_tier: 1 },
            { name: "রাকিব হাসান", blood_group: "O+", district: "রংপুর", thana: "মিঠাপুকুর", area: "পায়রাবত্ব", phone: "01822222222", proximity_tier: 2 }
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
