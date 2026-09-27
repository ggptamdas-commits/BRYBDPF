// BRYBDPF Cloudflare Pages Functions - Comprehensive Backend API
// Features: 3-Tier Geo-Proximity Match (Thana -> District -> Division),
// Safe JSON Error Handling, Admin Sessions, Telegram Integration, D1 Persistence

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      ...extraHeaders
    }
  });
}

function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") ||
         request.headers.get("X-Forwarded-For") ||
         "127.0.0.1";
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
  const num1 = Math.floor(Math.random() * 8) + 1;
  const num2 = Math.floor(Math.random() * 8) + 1;
  const sum = num1 + num2;
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  const toBn = (n) => n.toString().split("").map(d => bnDigits[parseInt(d, 10)] || d).join("");

  const question = `${toBn(num1)} + ${toBn(num2)} = ?`;
  const timestamp = Date.now().toString();
  const payload = `${sum}:${timestamp}`;
  const sig = await sha256Hex(`${payload}:${CAPTCHA_SECRET}`);
  const token = btoa(`${sum}:${timestamp}:${sig}`);

  return { question, token };
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

    for (const s of (settings || [])) {
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

    // 1. WhatsApp message for the REQUESTER
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

    inlineButtons.push([{ text: "⚡ রক্ত গ্রহীতাকে (আবেদনকারী) ডোনার লিস্ট পাঠান", url: waShareUrl }]);

    // 2. WhatsApp messages for matched donors
    if (matchedDonors && matchedDonors.length > 0) {
      donorText = matchedDonors.slice(0, 15).map((d, i) => {
        const cleanPhone = (d.phone || "").replace(/[^0-9]/g, "");
        const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
        
        const promptForDonor = `আসসালামু আলাইকুম ${d.name} ভাই,\n` +
          `BRYBDPF থেকে রক্তের জরুরি প্রয়োজনে যোগাযোগ করা হচ্ছে:\n` +
          `🩸 প্রয়োজনীয় রক্ত: ${requestData.blood_group} (${requestData.units || 1} ব্যাগ)\n` +
          `👤 রোগী: ${requestData.patient_name}\n` +
          `🏥 হাসপাতাল: ${requestData.hospital_name}, ${requestData.district}\n` +
          `📍 ঠিকানা: ${requestData.location}\n` +
          `⏰ সময়সীমা: ${requestData.needed_by}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `আবেদনকারী: ${requestData.requester_name || "স্বজন"}\n` +
          `📞 যোগাযোগের নম্বর: ${requestData.contact_phone}\n` +
          (requestData.note ? `📝 নোট: ${requestData.note}\n` : "") +
          `━━━━━━━━━━━━━━━━\n` +
          `রোগীর জীবন রক্ষায় আপনি কি রক্তদান করতে পারবেন? অনুগ্রহ করে দ্রুত জানান।\n- BRYBDPF`;

        const donorWaUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(promptForDonor)}`;

        if (i < 4) {
          inlineButtons.push([{ text: `💬 ${i + 1}. ${d.name} কে রোগীর তথ্য পাঠান`, url: donorWaUrl }]);
        }

        const tierBadge = d.proximity_tier === 1 ? "🎯 [একই থানা]" : (d.proximity_tier === 2 ? "📍 [একই জেলা]" : "🌐 [বিভাগীয় জেলা]");
        return `${i + 1}. <b>${d.name}</b> (${d.blood_group}) - ${d.district}, ${d.area} ${tierBadge}\n` +
          `   📞 <a href="tel:${d.phone}">${d.phone}</a>\n` +
          `   👉 <a href="${donorWaUrl}">💬 WhatsApp-এ রোগীর তথ্য পাঠান</a>`;
      }).join("\n\n");
    } else {
      donorText = "⚠️ এই গ্রুপের কোনো সক্রিয় ডোনার তাৎক্ষণিকভাবে পাওয়া যায়নি।";
    }

    const thanaDisplay = requestData.thana ? `${requestData.thana}, ` : "";
    const messageHtml = `🚨 <b>জরুরি রক্তের রিকোয়েস্ট অ্যালার্ট!</b> 🚨\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🩸 <b>রোগীর প্রয়োজনীয় রক্ত:</b> <code>${requestData.blood_group}</code> (${requestData.units || 1} ব্যাগ)\n` +
      `👤 <b>রোগীর নাম:</b> ${requestData.patient_name}\n` +
      `🏥 <b>হাসপাতাল:</b> ${requestData.hospital_name} (${thanaDisplay}${requestData.district})\n` +
      `📍 <b>ঠিকানা:</b> ${requestData.location}\n` +
      `⏰ <b>প্রয়োজনের সময়:</b> ${requestData.needed_by}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🤝 <b>আবেদনকারী:</b> ${requestData.requester_name || "স্বজন"}\n` +
      `📞 <b>যোগাযোগের নম্বর:</b> <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>\n` +
      (requestData.note ? `📝 <b>নোট:</b> ${requestData.note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>রোগীর জন্য ৩-ধাপে ম্যাচিং ডোনার তালিকা (${requestData.blood_group}):</b>\n` +
      `(১ম: থানা ➔ ২য়: জেলা ➔ ৩য়: বিভাগ)\n\n` +
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

  try {
    const s1 = await env.DB.prepare(
      "SELECT token, admin_email, expires_at FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    ).bind(token).first();
    if (s1) {
      const admin = await env.DB.prepare(
        "SELECT id, email, role FROM admins WHERE LOWER(email) = LOWER(?)"
      ).bind(s1.admin_email).first();
      if (admin) return { id: admin.id, email: admin.email, role: admin.role, token };
      return { id: 1, email: s1.admin_email, role: 'admin', token };
    }
  } catch (e) {}

  try {
    const s2 = await env.DB.prepare(
      "SELECT admin_id, token, expires_at FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
    ).bind(token).first();
    if (s2) {
      const admin = await env.DB.prepare(
        "SELECT id, email, role FROM admins WHERE id = ?"
      ).bind(s2.admin_id).first();
      if (admin) return { id: admin.id, email: admin.email, role: admin.role, token };
    }
  } catch (e) {}

  return null;
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

    // PUBLIC ENDPOINTS

    if (path === "/api/captcha" && method === "GET") {
      const captcha = await generateCaptcha();
      return json(captcha);
    }

    if (path === "/api/stats" && method === "GET") {
      const start = performance.now();
      const [donorsRes, availRes, reqRes] = await Promise.all([
        env.DB.prepare("SELECT count(*) as count FROM donors").first(),
        env.DB.prepare("SELECT count(*) as count FROM donors WHERE is_available = 1").first(),
        env.DB.prepare("SELECT count(*) as count FROM blood_requests").first()
      ]);

      const duration = (performance.now() - start).toFixed(2);
      return json({
        total_donors: donorsRes?.count || 0,
        available_donors: availRes?.count || 0,
        total_districts: 8,
        total_requests: reqRes?.count || 0,
        duration_ms: duration
      });
    }

    // Donor search is permanently disabled for public users to protect privacy
    if (path === "/api/donors/search") {
      return json({
        success: false,
        error: "রক্তদাতাদের ব্যক্তিগত তথ্যের সুরক্ষা ও গোপনীয়তার স্বার্থে সরাসরি উন্মুক্ত অনুসন্ধান সুবিধা বন্ধ রাখা হয়েছে। জরুরি রক্তের প্রয়োজনে দয়া করে সরাসরি রিকোয়েস্ট সাবমিট করুন।"
      }, 403);
    }

    // DONOR REGISTRATION
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

        const cleanPhone = phone.trim();
        const existing = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
        if (existing) {
          return json({ error: "এই মোবাইল নম্বরটি দিয়ে ইতিমধ্যে ডোনার হিসেবে রেজিস্ট্রেশন করা আছে।" }, 409);
        }

        const isAvailable = (last_donation_date && new Date(last_donation_date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) ? 0 : 1;

        const stmt = env.DB.prepare(`
          INSERT INTO donors (
            name, blood_group, phone, district, area, age, gender,
            last_donation_date, total_donations, is_available,
            agreed_future_donation, agreed_data_save
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        await stmt.bind(
          name.trim(),
          blood_group,
          cleanPhone,
          district.trim(),
          area.trim(),
          parseInt(age, 10),
          gender || "Male",
          last_donation_date || null,
          parseInt(total_donations || "0", 10),
          isAvailable,
          agreed_future_donation ? 1 : 0,
          agreed_data_save ? 1 : 0
        ).run();

        return json({ success: true, message: "ডোনার হিসেবে আপনার নিবন্ধন সফল হয়েছে!" });
      } catch (err) {
        return json({ error: "নিবন্ধন ব্যর্থ হয়েছে: " + err.message }, 500);
      }
    }

    // CREATE EMERGENCY BLOOD REQUEST
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

        // Auto-register requester as future donor if not already present
        const donorBloodGroupToRegister = requester_blood_group || blood_group;
        const donorNameToRegister = requester_name ? requester_name.trim() : patient_name.trim();
        const donorDistrictToRegister = requester_district ? requester_district.trim() : cleanDist;
        const donorAreaToRegister = requester_area ? requester_area.trim() : (cleanThana || location.trim());
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

        // 3-Tier Geo-Proximity Matching:
        // Tier 1: Same District & Area matches Thana
        // Tier 2: Same District (Other Thanas)
        // Tier 3: Other 7 Districts of Rangpur Division
        let matchedDonors = [];
        try {
          const { results } = await env.DB.prepare(`
            SELECT id, name, blood_group, district, area, phone, age, total_donations,
              (CASE 
                WHEN district = ? AND (? != '' AND (area LIKE ? OR ? LIKE '%' || area || '%')) THEN 1
                WHEN district = ? THEN 2
                WHEN district IN ('রংপুর', 'নীলফামারী', 'দিনাজপুর', 'কুড়িগ্রাম', 'লালমনিরহাট', 'গাইবান্ধা', 'ঠাকুরগাঁও', 'পঞ্চগড়') THEN 3
                ELSE 4
              END) as proximity_tier
            FROM donors 
            WHERE blood_group = ? AND is_available = 1 AND phone != ?
            ORDER BY 
              proximity_tier ASC,
              id DESC
            LIMIT 60
          `).bind(
            cleanDist, cleanThana, `%${cleanThana}%`, cleanThana,
            cleanDist,
            blood_group, cleanPhone
          ).all();
          matchedDonors = results || [];
        } catch (e) {
          console.error("Donor match query error:", e);
        }

        const tier1 = matchedDonors.filter(d => d.proximity_tier === 1);
        const tier2 = matchedDonors.filter(d => d.proximity_tier === 2);
        const tier3 = matchedDonors.filter(d => d.proximity_tier === 3);

        ctx.waitUntil(sendTelegramAlert(env, {
          patient_name,
          blood_group,
          units,
          district: cleanDist,
          thana: cleanThana,
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
          message: "আপনার রক্তের রিকোয়েস্ট সফলভাবে গৃহীত হয়েছে! ৩-ধাপের স্মার্ট প্রক্সিমিটি অ্যালগরিদম অনুযায়ী নিকটবর্তী ডোনারদের সাথে যোগাযোগ এবং টেলিগ্রাম অ্যালার্ট প্রক্রিয়া শুরু হয়েছে।",
          request_id: reqInsertRes.meta?.last_row_id || null,
          proximity_matches: {
            total: matchedDonors.length,
            tier1_thana: tier1.length,
            tier2_district: tier2.length,
            tier3_division: tier3.length
          }
        });
      } catch (err) {
        return json({ error: "রিকোয়েস্ট ব্যর্থ হয়েছে: " + err.message }, 500);
      }
    }

    // ADMIN AUTHENTICATED ENDPOINTS
    if (path === "/api/admin/check-setup" && method === "GET") {
      const adminCount = await env.DB.prepare("SELECT count(*) as count FROM admins").first();
      return json({ needsSetup: !adminCount || adminCount.count === 0 });
    }

    if (path === "/api/admin/setup" && method === "POST") {
      const adminCount = await env.DB.prepare("SELECT count(*) as count FROM admins").first();
      if (adminCount && adminCount.count > 0) {
        return json({ error: "অ্যাডমিন অ্যাকাউন্ট ইতিমধ্যে সেটআপ করা হয়েছে।" }, 403);
      }
      const { email, password, telegram_token, telegram_uids } = await request.json();
      if (!email || !password || password.length < 6) {
        return json({ error: "সঠিক ইমেইল এবং ন্যূনতম ৬ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
      }
      const salt = crypto.randomUUID();
      const hash = await sha256Hex(password + salt);
      await env.DB.prepare("INSERT INTO admins (email, password_hash, salt, role) VALUES (?, ?, ?, 'superadmin')")
        .bind(email.toLowerCase().trim(), hash, salt).run();

      if (telegram_token && telegram_token.trim()) {
        await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)")
          .bind(telegram_token.trim()).run();
      }
      if (telegram_uids && telegram_uids.trim()) {
        await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)")
          .bind(telegram_uids.trim()).run();
      }
      return json({ success: true, message: "অ্যাডমিন সেটআপ সফল হয়েছে!" });
    }

    if (path === "/api/admin/login" && method === "POST") {
      const { email, password } = await request.json();
      if (!email || !password) return json({ error: "ইমেইল এবং পাসওয়ার্ড প্রদান করুন।" }, 400);

      const admin = await env.DB.prepare("SELECT * FROM admins WHERE LOWER(email) = LOWER(?)").bind(email.trim()).first();
      if (!admin) return json({ error: "ভুল ইমেইল বা পাসওয়ার্ড।" }, 401);

      const hash = await sha256Hex(password + admin.salt);
      if (hash !== admin.password_hash) return json({ error: "ভুল ইমেইল বা পাসওয়ার্ড।" }, 401);

      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await env.DB.prepare("INSERT INTO sessions (token, admin_email, ip, expires_at) VALUES (?, ?, ?, ?)")
        .bind(token, admin.email, ip, expiresAt).run();

      return json({
        success: true,
        token,
        admin: { id: admin.id, email: admin.email, role: admin.role }
      }, 200, {
        "Set-Cookie": `brybdpf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      });
    }

    if (path === "/api/admin/logout" && method === "POST") {
      const auth = await getAuthenticatedAdmin(request, env);
      if (auth && auth.token) {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(auth.token).run();
      }
      return json({ success: true }, 200, {
        "Set-Cookie": "brybdpf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
      });
    }

    // ALL OTHER /api/admin/* REQUIRE AUTHENTICATION
    if (path.startsWith("/api/admin/")) {
      const auth = await getAuthenticatedAdmin(request, env);
      if (!auth) {
        return json({ error: "অননুমোদিত প্রবেশাধিকার। অনুগ্রহ করে লগইন করুন।" }, 401);
      }

      if (path === "/api/admin/data" && method === "GET") {
        const [donors, requests, settings] = await Promise.all([
          env.DB.prepare("SELECT * FROM donors ORDER BY id DESC").all(),
          env.DB.prepare("SELECT * FROM blood_requests ORDER BY id DESC").all(),
          env.DB.prepare("SELECT key, value FROM admin_settings").all()
        ]);

        const settingsMap = {};
        (settings.results || []).forEach(s => {
          if (s.key === "telegram_bot_token") {
            settingsMap["telegram_bot_token_masked"] = s.value ? s.value.slice(0, 6) + "..." + s.value.slice(-4) : "";
          } else {
            settingsMap[s.key] = s.value;
          }
        });

        return json({
          donors: donors.results || [],
          requests: requests.results || [],
          settings: settingsMap,
          admin: { email: auth.email, role: auth.role }
        });
      }

      if (path === "/api/admin/donors" && method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM donors ORDER BY id DESC").all();
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
        const { results } = await env.DB.prepare("SELECT * FROM blood_requests ORDER BY id DESC").all();
        return json({ requests: results || [] });
      }

      if (path.match(/^\/api\/admin\/requests\/\d+\/status$/) && method === "PATCH") {
        const id = path.split("/")[4];
        const { status } = await request.json();
        await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(status, id).run();
        return json({ success: true });
      }

      // 3-TIER MATCHING ENDPOINT FOR ADMIN
      if (path.match(/^\/api\/admin\/requests\/\d+\/match-donors$/) && method === "GET") {
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

        return json({
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
        }
        if (telegram_admin_uids !== undefined) {
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)")
            .bind(telegram_admin_uids.trim()).run();
        }
        return json({ success: true, message: "সেটিংস সংরক্ষিত হয়েছে!" });
      }

      if (path === "/api/admin/change-password" && method === "POST") {
        const { current_password, new_password } = await request.json();
        if (!new_password || new_password.length < 6) {
          return json({ error: "নতুন পাসওয়ার্ড ন্যূনতম ৬ অক্ষরের হতে হবে।" }, 400);
        }
        const admin = await env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(auth.id).first();
        if (!admin) return json({ error: "অ্যাডমিন পাওয়া যায়নি।" }, 404);

        const currentHash = await sha256Hex(current_password + admin.salt);
        if (currentHash !== admin.password_hash) {
          return json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" }, 400);
        }

        const newSalt = crypto.randomUUID();
        const newHash = await sha256Hex(new_password + newSalt);
        await env.DB.prepare("UPDATE admins SET password_hash = ?, salt = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(newHash, newSalt, auth.id).run();

        return json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!" });
      }

      if (path === "/api/admin/test-telegram" && method === "POST") {
        const testRequest = {
          patient_name: "রাকিব হাসান (টেস্ট রোগী)",
          blood_group: "B+",
          units: 1,
          district: "রংপুর",
          thana: "কোতোয়ালি",
          hospital_name: "রংপুর মেডিকেল কলেজ হাসপাতাল",
          location: "মেডিকেল মোড়, ধাপ",
          contact_phone: "01700000000",
          needed_by: "জরুরি প্রয়োজন",
          note: "সিস্টেম টেস্ট নোটিফিকেশন"
        };
        const sampleDonors = [
          { name: "টেস্ট ডোনার ১", blood_group: "B+", district: "রংপুর", area: "কোতোয়ালি", phone: "01711111111", proximity_tier: 1 },
          { name: "টেস্ট ডোনার ২", blood_group: "B+", district: "রংপুর", area: "মিঠাপুকুর", phone: "01722222222", proximity_tier: 2 },
          { name: "টেস্ট ডোনার ৩", blood_group: "B+", district: "দিনাজপুর", area: "বিরামপুর", phone: "01733333333", proximity_tier: 3 }
        ];
        await sendTelegramAlert(env, testRequest, sampleDonors);
        return json({ success: true, message: "টেলিগ্রাম টেস্ট মেসেজ পাঠানো হয়েছে! টেলিগ্রাম চেক করুন।" });
      }
    }

    if (path === "/admin" || path === "/admin/") return context.next();
    return context.next();
  } catch (uncaughtError) {
    return json({
      success: false,
      error: "সার্ভার সমস্যা: " + (uncaughtError.message || "অপ্রত্যাশিত ত্রুটি ঘটেছে।"),
      details: uncaughtError.stack
    }, 500);
  }
}
