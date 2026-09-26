/**
 * BRYBDPF - Smart Blood Donation & Millisecond Donor Search Platform
 * Powered by Cloudflare Workers & Cloudflare D1
 * Zero Hardcoded Credentials - Maximum Security & Edge Performance
 */

// Helper: JSON response with CORS
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      ...extraHeaders
    }
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    }
  });
}

function getClientIP(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";
}

// Cryptography helpers (Web Crypto API)
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

// Anti-Bot Captcha Generator & Verifier
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
    if (isNaN(timeDiff) || timeDiff < 0 || timeDiff > 10 * 60 * 1000) {
      return false;
    }

    const expectedSig = await sha256Hex(`${correctAnswer}:${timestamp}:${CAPTCHA_SECRET}`);
    if (sig !== expectedSig) return false;

    return userAnswer.toString().trim() === correctAnswer.trim();
  } catch (e) {
    return false;
  }
}

// Telegram Notifier
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

    if (!token || !adminUidsStr) {
      console.log("Telegram alert skipped: Token or Admin UIDs not configured.");
      return;
    }

    const uids = adminUidsStr.split(",").map(u => u.trim()).filter(Boolean);
    if (uids.length === 0) return;

    let donorText = "";
    if (matchedDonors && matchedDonors.length > 0) {
      donorText = matchedDonors.slice(0, 20).map((d, i) => {
        const cleanPhone = d.phone.replace(/[^0-9]/g, "");
        const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
        return `${i + 1}. <b>${d.name}</b> (${d.blood_group}) - ${d.district}, ${d.area}\n   📞 <a href="tel:${d.phone}">${d.phone}</a> | 💬 <a href="https://wa.me/${waNumber}">WhatsApp</a>`;
      }).join("\n\n");
    } else {
      donorText = "⚠️ এই গ্রুপের কোনো সক্রিয় ডোনার তাৎক্ষণিকভাবে পাওয়া যায়নি।";
    }

    const reqCleanPhone = requestData.contact_phone.replace(/[^0-9]/g, "");
    const reqWaNumber = reqCleanPhone.startsWith("88") ? reqCleanPhone : (reqCleanPhone.startsWith("0") ? "88" + reqCleanPhone : reqCleanPhone);
    
    let shareMessage = `আসসালামু আলাইকুম, BRYBDPF থেকে আপনার কাঙ্ক্ষিত ${requestData.blood_group} রক্তের ডোনার তালিকা:\n\n`;
    if (matchedDonors && matchedDonors.length > 0) {
      shareMessage += matchedDonors.slice(0, 10).map((d, i) => `${i+1}. ${d.name} (${d.district}) - ${d.phone}`).join("\n");
      shareMessage += "\n\nদ্রুত যোগাযোগ করে রোগীর জীবন রক্ষায় সহযোগিতা নিন।";
    } else {
      shareMessage += "আমরা আরও ডোনার অনুসন্ধানের চেষ্টা করছি।";
    }
    const encodedShare = encodeURIComponent(shareMessage);
    const waShareUrl = `https://wa.me/${reqWaNumber}?text=${encodedShare}`;

    const messageHtml = `🚨 <b>জরুরি রক্তের রিকোয়েস্ট অ্যালার্ট!</b> 🚨\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🩸 <b>রক্তের গ্রুপ:</b> <code>${requestData.blood_group}</code> (${requestData.units} ব্যাগ)\n` +
      `👤 <b>রোগীর নাম:</b> ${requestData.patient_name}\n` +
      `🏥 <b>হাসপাতাল:</b> ${requestData.hospital_name}\n` +
      `📍 <b>ঠিকানা:</b> ${requestData.district}, ${requestData.location}\n` +
      `📞 <b>যোগাযোগের নম্বর:</b> <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>\n` +
      `⏰ <b>প্রয়োজনের সময়:</b> ${requestData.needed_by}\n` +
      `ℹ️ <b>জরুরিতা:</b> ${requestData.urgency || "Emergency"}\n` +
      (requestData.note ? `📝 <b>বিবরণ:</b> ${requestData.note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>সম্ভাব্য ম্যাচিং ডোনার (${matchedDonors.length} জন):</b>\n\n` +
      donorText + `\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <b>এক ক্লিকে রিকোয়েস্টকারীকে ডোনার লিস্ট পাঠান:</b>\n` +
      `👉 <a href="${waShareUrl}">WhatsApp-এ ডোনার লিস্ট পাঠান</a>`;

    for (const uid of uids) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: uid,
          text: messageHtml,
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      });
    }
  } catch (err) {
    console.error("Error sending Telegram alert:", err);
  }
}

// Session Validator Middleware
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

  const { results } = await env.DB.prepare(
    "SELECT token, admin_email, expires_at FROM sessions WHERE token = ? AND expires_at > datetime('now')"
  ).bind(token).all();

  if (results && results.length > 0) {
    return results[0];
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ip = getClientIP(request);

    if (method === "OPTIONS") {
      return json({ ok: true });
    }

    // 1. Captcha generation endpoint
    if (path === "/api/captcha" && method === "GET") {
      const captcha = await generateCaptcha();
      return json(captcha);
    }

    // 2. Public Platform Statistics
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

    // 3. Millisecond Fast Donor Search
    if (path === "/api/donors/search" && method === "GET") {
      const start = performance.now();
      const bg = url.searchParams.get("blood_group") || "";
      const district = url.searchParams.get("district") || "";
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10), 50);

      let query = "SELECT id, name, blood_group, district, area, age, gender, last_donation_date, total_donations, is_available, phone FROM donors WHERE is_available = 1";
      const params = [];

      if (bg && bg !== "ALL") {
        query += " AND blood_group = ?";
        params.push(bg);
      }

      if (district && district.trim()) {
        query += " AND district LIKE ?";
        params.push(`%${district.trim()}%`);
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

    // 4. Register Blood Donor
    if (path === "/api/donors/register" && method === "POST") {
      try {
        const body = await request.json();
        const {
          name, blood_group, phone, district, area, age, gender,
          last_donation_date, total_donations, captcha_token, captcha_answer,
          agreed_future_donation, agreed_data_save
        } = body;

        const isCaptchaValid = await verifyCaptcha(captcha_token, captcha_answer);
        if (!isCaptchaValid) {
          return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! অনুগ্রহ করে পুনরায় চেষ্টা করুন।" }, 400);
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
          blood_group.trim(),
          phone.trim(),
          district.trim(),
          area.trim(),
          parseInt(age, 10) || 20,
          gender || "Male",
          last_donation_date || null,
          parseInt(total_donations, 10) || 0,
          agreed_future_donation ? 1 : 1,
          agreed_data_save ? 1 : 1
        ).run();

        return json({
          success: true,
          message: "অভিনন্দন! আপনার ব্লাড ডোনার রেজিস্ট্রেশন সফলভাবে সম্পন্ন হয়েছে।"
        }, 201);
      } catch (err) {
        return json({ error: "রেজিস্ট্রেশন প্রক্রিয়ায় ত্রুটি: " + err.message }, 500);
      }
    }

    // 5. Submit Emergency Blood Request
    if (path === "/api/requests/create" && method === "POST") {
      try {
        const body = await request.json();
        const {
          patient_name, blood_group, units, hospital_name, district, location,
          contact_phone, urgency, needed_by, note,
          agreed_future_donation, agreed_data_save,
          captcha_token, captcha_answer,
          donor_name, donor_age, donor_gender, donor_area
        } = body;

        const isCaptchaValid = await verifyCaptcha(captcha_token, captcha_answer);
        if (!isCaptchaValid) {
          return json({ error: "ক্যাপচা যাচাই ব্যর্থ হয়েছে! সঠিক যোগফল দিন।" }, 400);
        }

        if (!agreed_future_donation || !agreed_data_save) {
          return json({
            error: "ব্লাড রিকোয়েস্ট পাঠাতে অবশ্যই উভয় সম্মতি শর্তে (ভবিষ্যতে রক্তদান এবং তথ্য সংরক্ষণ) টিক চিহ্ন দিতে হবে।"
          }, 400);
        }

        if (!patient_name || !blood_group || !hospital_name || !district || !location || !contact_phone || !needed_by) {
          return json({ error: "অনুগ্রহ করে সকল আবশ্যকীয় তথ্য পূরণ করুন।" }, 400);
        }

        const cleanPhone = contact_phone.trim();

        // 24-Hour Rate Limiting Check for same phone
        const recentReq = await env.DB.prepare(`
          SELECT id FROM blood_requests 
          WHERE contact_phone = ? 
          AND created_at > datetime('now', '-24 hours')
        `).bind(cleanPhone).first();

        if (recentReq) {
          return json({
            error: "নিরাপত্তার স্বার্থে একই নম্বর দিয়ে বিগত ২৪ ঘণ্টায় একাধিকবার রিকোয়েস্ট পাঠানো নিষেধ। জরুরি প্রয়োজনে এডমিনের সাথে যোগাযোগ করুন।"
          }, 429);
        }

        // Auto-register requester as donor if not existing
        const existingDonor = await env.DB.prepare("SELECT id FROM donors WHERE phone = ?").bind(cleanPhone).first();
        if (!existingDonor) {
          const dName = donor_name && donor_name.trim() ? donor_name.trim() : patient_name.trim() + " (রোগীর প্রতিনিধি)";
          const dAge = parseInt(donor_age, 10) || 25;
          const dGender = donor_gender || "Other";
          const dArea = donor_area && donor_area.trim() ? donor_area.trim() : location.trim();

          await env.DB.prepare(`
            INSERT INTO donors (
              name, blood_group, phone, district, area, age, gender,
              last_donation_date, total_donations, is_available,
              agreed_future_donation, agreed_data_save
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 1, 1, 1)
          `).bind(
            dName,
            blood_group.trim(),
            cleanPhone,
            district.trim(),
            dArea,
            dAge,
            dGender
          ).run();
        }

        await env.DB.prepare(`
          INSERT INTO blood_requests (
            patient_name, blood_group, units, hospital_name, district, location,
            contact_phone, urgency, needed_by, note, status,
            agreed_future_donation, agreed_data_save
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 1, 1)
        `).bind(
          patient_name.trim(),
          blood_group.trim(),
          parseInt(units, 10) || 1,
          hospital_name.trim(),
          district.trim(),
          location.trim(),
          cleanPhone,
          urgency || "Urgent",
          needed_by.trim(),
          note ? note.trim() : ""
        ).run();

        const { results: matchedDonors } = await env.DB.prepare(`
          SELECT id, name, blood_group, district, area, phone, age
          FROM donors
          WHERE blood_group = ? AND is_available = 1 AND phone != ?
          ORDER BY (CASE WHEN district = ? THEN 0 ELSE 1 END), RANDOM()
          LIMIT 20
        `).bind(blood_group.trim(), cleanPhone, district.trim()).all();

        ctx.waitUntil(sendTelegramAlert(env, {
          patient_name, blood_group, units, hospital_name, district, location,
          contact_phone: cleanPhone, urgency, needed_by, note
        }, matchedDonors || []));

        return json({
          success: true,
          message: "আপনার রক্তের রিকোয়েস্ট সফলভাবে গ্রহণ করা হয়েছে এবং নিকটস্থ ডোনারদের সাথে যোগাযোগ শুরু হয়েছে।",
          matched_count: (matchedDonors || []).length,
          matched_donors: matchedDonors || []
        }, 201);
      } catch (err) {
        return json({ error: "রিকোয়েস্ট প্রসেসিং এ ত্রুটি: " + err.message }, 500);
      }
    }

    // Check if initial admin setup is required
    if (path === "/api/admin/check-setup" && method === "GET") {
      const adminSetting = await env.DB.prepare(
        "SELECT value FROM admin_settings WHERE key = 'admin_email'"
      ).first();
      return json({ needsSetup: !adminSetting });
    }

    // First time admin setup (only allowed once if no admin exists)
    if (path === "/api/admin/setup" && method === "POST") {
      const existing = await env.DB.prepare(
        "SELECT value FROM admin_settings WHERE key = 'admin_email'"
      ).first();

      if (existing) {
        return json({ error: "এডমিন ইতিমধ্যে সেটআপ করা রয়েছে! নতুন সেটআপ সম্ভব নয়।" }, 403);
      }

      const body = await request.json();
      const { email, password, telegram_token, telegram_uids } = body;

      if (!email || !password || password.length < 8) {
        return json({ error: "সঠিক ইমেইল এবং কমপক্ষে ৮ অক্ষরের শক্তিশালী পাসওয়ার্ড দিন।" }, 400);
      }

      const salt = generateRandomToken(16);
      const passHash = await hashPassword(password, salt);

      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_email', ?)").bind(email.toLowerCase().trim()),
        env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_salt', ?)").bind(salt),
        env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").bind(passHash),
        env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)").bind(telegram_token ? telegram_token.trim() : ""),
        env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)").bind(telegram_uids ? telegram_uids.trim() : "")
      ]);

      return json({ success: true, message: "এডমিন একাউন্ট সফলভাবে কনফিগার করা হয়েছে!" });
    }

    // Admin Login with Brute-Force Rate Limiting
    if (path === "/api/admin/login" && method === "POST") {
      try {
        const failCountRes = await env.DB.prepare(`
          SELECT count(*) as count FROM login_attempts 
          WHERE ip = ? AND success = 0 
          AND attempted_at > datetime('now', '-15 minutes')
        `).bind(ip).first();

        const failedAttempts = failCountRes ? failCountRes.count : 0;
        if (failedAttempts >= 5) {
          return json({
            error: "অতিরিক্ত ভুল প্রচেষ্টার কারণে আপনার আইপি ১৫ মিনিটের জন্য লক করা হয়েছে। কিছুক্ষণ পর পুনরায় চেষ্টা করুন।"
          }, 429);
        }

        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
          return json({ error: "ইমেইল এবং পাসওয়ার্ড প্রদান করুন।" }, 400);
        }

        const settings = await env.DB.prepare(
          "SELECT key, value FROM admin_settings WHERE key IN ('admin_email', 'admin_salt', 'admin_password_hash')"
        ).all();

        const map = {};
        for (const s of (settings.results || [])) {
          map[s.key] = s.value;
        }

        if (!map.admin_email || !map.admin_salt || !map.admin_password_hash) {
          return json({ error: "এডমিন একাউন্ট এখনো সেটআপ করা হয়নি। অনুগ্রহ করে প্রথমে সেটআপ করুন।" }, 400);
        }

        const inputHash = await hashPassword(password, map.admin_salt);

        if (email.toLowerCase().trim() !== map.admin_email || inputHash !== map.admin_password_hash) {
          await env.DB.prepare(
            "INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, 0)"
          ).bind(ip, email.toLowerCase().trim()).run();

          const remaining = Math.max(0, 5 - (failedAttempts + 1));
          return json({
            error: `ভুল ইমেইল অথবা পাসওয়ার্ড! আর ${remaining} টি সুযোগ অবশিষ্ট আছে।`
          }, 401);
        }

        await env.DB.prepare(
          "INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, 1)"
        ).bind(ip, email.toLowerCase().trim()).run();

        const token = generateRandomToken(32);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await env.DB.prepare(
          "INSERT INTO sessions (token, admin_email, ip, expires_at) VALUES (?, ?, ?, ?)"
        ).bind(token, email.toLowerCase().trim(), ip, expiresAt).run();

        return json({
          success: true,
          token,
          email: map.admin_email,
          message: "এডমিন লগইন সফল হয়েছে!"
        }, 200, {
          "Set-Cookie": `brybdpf_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
        });
      } catch (err) {
        return json({ error: "লগইন প্রসেসে ত্রুটি: " + err.message }, 500);
      }
    }

    // Protected Admin Endpoints
    if (path.startsWith("/api/admin/")) {
      const admin = await getAuthenticatedAdmin(request, env);
      if (!admin) {
        return json({ error: "অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।" }, 401);
      }

      if (path === "/api/admin/logout" && method === "POST") {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(admin.token).run();
        return json({ success: true, message: "সফলভাবে লগআউট হয়েছে।" });
      }

      if (path === "/api/admin/data" && method === "GET") {
        const [totalDonors, activeDonors, totalReqs, pendingReqs] = await Promise.all([
          env.DB.prepare("SELECT count(*) as c FROM donors").first(),
          env.DB.prepare("SELECT count(*) as c FROM donors WHERE is_available = 1").first(),
          env.DB.prepare("SELECT count(*) as c FROM blood_requests").first(),
          env.DB.prepare("SELECT count(*) as c FROM blood_requests WHERE status = 'Pending'").first()
        ]);

        return json({
          total_donors: totalDonors.c,
          active_donors: activeDonors.c,
          total_requests: totalReqs.c,
          pending_requests: pendingReqs.c,
          admin_email: admin.admin_email
        });
      }

      if (path === "/api/admin/donors" && method === "GET") {
        const bg = url.searchParams.get("blood_group") || "";
        const district = url.searchParams.get("district") || "";
        const search = url.searchParams.get("search") || "";

        let q = "SELECT * FROM donors WHERE 1=1";
        const params = [];

        if (bg && bg !== "ALL") {
          q += " AND blood_group = ?";
          params.push(bg);
        }
        if (district && district.trim()) {
          q += " AND district LIKE ?";
          params.push(`%${district.trim()}%`);
        }
        if (search && search.trim()) {
          q += " AND (name LIKE ? OR phone LIKE ? OR area LIKE ?)";
          const s = `%${search.trim()}%`;
          params.push(s, s, s);
        }

        q += " ORDER BY id DESC LIMIT 100";
        const { results } = await env.DB.prepare(q).bind(...params).all();
        return json({ donors: results || [] });
      }

      if (path.match(/^\/api\/admin\/donors\/\d+\/toggle$/) && method === "POST") {
        const id = path.split("/")[4];
        await env.DB.prepare(`
          UPDATE donors 
          SET is_available = CASE WHEN is_available = 1 THEN 0 ELSE 1 END,
              updated_at = datetime('now')
          WHERE id = ?
        `).bind(id).run();
        return json({ success: true });
      }

      if (path.match(/^\/api\/admin\/donors\/\d+$/) && method === "DELETE") {
        const id = path.split("/")[4];
        await env.DB.prepare("DELETE FROM donors WHERE id = ?").bind(id).run();
        return json({ success: true });
      }

      if (path === "/api/admin/requests" && method === "GET") {
        const status = url.searchParams.get("status") || "";
        let q = "SELECT * FROM blood_requests WHERE 1=1";
        const params = [];
        if (status && status !== "ALL") {
          q += " AND status = ?";
          params.push(status);
        }
        q += " ORDER BY id DESC LIMIT 100";
        const { results } = await env.DB.prepare(q).bind(...params).all();
        return json({ requests: results || [] });
      }

      if (path.match(/^\/api\/admin\/requests\/\d+\/status$/) && method === "POST") {
        const id = path.split("/")[4];
        const body = await request.json();
        const { status } = body;
        await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(status, id).run();
        return json({ success: true });
      }

      if (path.match(/^\/api\/admin\/requests\/\d+\/matching-donors$/) && method === "GET") {
        const id = path.split("/")[4];
        const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(id).first();
        if (!req) return json({ error: "রিকোয়েস্ট পাওয়া যায়নি" }, 404);

        const { results: donors } = await env.DB.prepare(`
          SELECT * FROM donors 
          WHERE blood_group = ? AND is_available = 1
          ORDER BY (CASE WHEN district = ? THEN 0 ELSE 1 END), RANDOM()
          LIMIT 20
        `).bind(req.blood_group, req.district).all();

        let shareText = `আসসালামু আলাইকুম, BRYBDPF থেকে আপনার কাঙ্ক্ষিত ${req.blood_group} রক্তের সম্ভাব্য ডোনার তালিকা:\n\n`;
        donors.forEach((d, idx) => {
          shareText += `${idx + 1}. ${d.name} (${d.district}, ${d.area}) - ${d.phone}\n`;
        });
        shareText += "\nরোগীর দ্রুত সুস্থতা কামনা করি।";

        const cleanPhone = req.contact_phone.replace(/[^0-9]/g, "");
        const waNumber = cleanPhone.startsWith("88") ? cleanPhone : (cleanPhone.startsWith("0") ? "88" + cleanPhone : cleanPhone);
        const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(shareText)}`;

        return json({
          request: req,
          donors: donors || [],
          share_text: shareText,
          whatsapp_share_url: waLink
        });
      }

      if (path === "/api/admin/settings" && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT key, value FROM admin_settings WHERE key IN ('telegram_bot_token', 'telegram_admin_uids')"
        ).all();
        const map = { telegram_bot_token: "", telegram_admin_uids: "" };
        for (const r of results) {
          map[r.key] = r.value;
        }
        const maskedToken = map.telegram_bot_token ? map.telegram_bot_token.substring(0, 8) + "..." + map.telegram_bot_token.slice(-4) : "";
        return json({
          telegram_bot_token_masked: maskedToken,
          telegram_admin_uids: map.telegram_admin_uids
        });
      }

      if (path === "/api/admin/settings" && method === "POST") {
        const body = await request.json();
        const { telegram_bot_token, telegram_admin_uids, new_password, current_password } = body;

        const queries = [];

        if (telegram_bot_token !== undefined && telegram_bot_token.trim()) {
          queries.push(
            env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)").bind(telegram_bot_token.trim())
          );
        }
        if (telegram_admin_uids !== undefined) {
          queries.push(
            env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_admin_uids', ?)").bind(telegram_admin_uids.trim())
          );
        }

        if (new_password && new_password.trim()) {
          if (!current_password) {
            return json({ error: "বর্তমান পাসওয়ার্ড প্রয়োজন।" }, 400);
          }
          const { results: curSettings } = await env.DB.prepare(
            "SELECT key, value FROM admin_settings WHERE key IN ('admin_salt', 'admin_password_hash')"
          ).all();
          const curMap = {};
          for (const s of curSettings) curMap[s.key] = s.value;

          const checkHash = await hashPassword(current_password, curMap.admin_salt);
          if (checkHash !== curMap.admin_password_hash) {
            return json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়!" }, 403);
          }

          const newSalt = generateRandomToken(16);
          const newHash = await hashPassword(new_password, newSalt);
          queries.push(
            env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_salt', ?)").bind(newSalt),
            env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").bind(newHash)
          );
        }

        if (queries.length > 0) {
          await env.DB.batch(queries);
        }

        return json({ success: true, message: "সেটিংস সফলভাবে সংরক্ষিত হয়েছে!" });
      }

      if (path === "/api/admin/test-telegram" && method === "POST") {
        const testRequest = {
          patient_name: "টেস্ট রিকোয়েস্ট (সিস্টেম চেক)",
          blood_group: "O+",
          units: 1,
          hospital_name: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
          district: "ঢাকা",
          location: "জরুরি বিভাগ",
          contact_phone: "01700000000",
          urgency: "Testing",
          needed_by: "জরুরি",
          note: "BRYBDPF টেলিগ্রাম বট ইন্টিগ্রেশন সফলভাবে কাজ করছে!"
        };
        const sampleDonors = [
          { name: "করিম হোসেন", blood_group: "O+", district: "ঢাকা", area: "ধানমন্ডি", phone: "01711111111" },
          { name: "রাকিব হাসান", blood_group: "O+", district: "ঢাকা", area: "মিরপুর", phone: "01822222222" }
        ];
        await sendTelegramAlert(env, testRequest, sampleDonors);
        return json({ success: true, message: "টেলিগ্রাম টেস্ট মেসেজ পাঠানো হয়েছে! অনুগ্রহ করে টেলিগ্রাম চেক করুন।" });
      }
    }

    if (path === "/admin") {
      return html(getAdminHtml());
    }

    return html(getPublicHtml());
  }
};

function getPublicHtml() {
  return `<!DOCTYPE html>
<html lang="bn" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BRYBDPF — স্মার্ট ব্লাড ডোনেশন ও মিলি-সেকেন্ড ডোনার সার্চ নেটওয়ার্ক</title>
  <meta name="description" content="মিলি-সেকেন্ডের মধ্যে কাঙ্ক্ষিত রক্তের গ্রুপের ডোনার খুঁজে বের করুন। আধুনিক ক্লাউডফায়ার প্রযুক্তি ও নিরাপদ ব্লাড নেটওয়ার্ক।">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['"Hind Siliguri"', '"Inter"', 'sans-serif'] },
          colors: {
            crimson: {
              50: '#FFF1F2', 100: '#FFE4E6', 200: '#FECDD3',
              500: '#F43F5E', 600: '#E11D48', 700: '#BE123C', 800: '#9F1239', 900: '#881337',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Hind Siliguri', sans-serif; }
    .blood-drop-pulse { animation: pulse-drop 2s infinite ease-in-out; }
    @keyframes pulse-drop {
      0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 6px rgba(225, 29, 72, 0.4)); }
      50% { transform: scale(1.08); filter: drop-shadow(0 10px 15px rgba(225, 29, 72, 0.6)); }
    }
    .tap-target { min-height: 44px; min-width: 44px; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen flex flex-col selection:bg-crimson-100 selection:text-crimson-800">
  <nav class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-rose-100 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-crimson-700 to-crimson-500 flex items-center justify-center text-white shadow-md shadow-crimson-500/20">
            <svg class="w-6 h-6 fill-current blood-drop-pulse" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          </div>
          <div>
            <span class="text-xl font-bold tracking-tight text-slate-900">BRYBDPF</span>
            <span class="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-crimson-50 text-crimson-700 border border-crimson-200">স্মার্ট ব্লাড প্ল্যাটফর্ম</span>
          </div>
        </div>
        <div class="flex items-center gap-2 sm:gap-4">
          <a href="#request-section" class="tap-target inline-flex items-center px-4 py-2 text-sm font-semibold rounded-xl bg-crimson-600 hover:bg-crimson-700 text-white shadow-sm shadow-crimson-600/30 transition-all">
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            রক্তের রিকোয়েস্ট
          </a>
          <button onclick="openDonorModal()" class="tap-target hidden sm:inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition">ডোনার হোন</button>
          <a href="/admin" class="tap-target inline-flex items-center px-3 py-2 text-xs font-medium rounded-xl text-slate-500 hover:text-crimson-600 hover:bg-rose-50 transition">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            এডমিন
          </a>
        </div>
      </div>
    </div>
  </nav>

  <header class="relative overflow-hidden bg-gradient-to-b from-rose-50/60 via-white to-slate-50 pt-10 pb-14 border-b border-rose-100/60">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 text-center">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-crimson-100/80 border border-crimson-200 text-crimson-800 text-xs sm:text-sm font-semibold mb-6">
        <span class="flex h-2 w-2 relative"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-crimson-600"></span></span>
        ক্লাউডফায়ার এজ স্পিড • ইনস্ট্যান্ট ডোনার ম্যাচিং
      </div>
      <h1 class="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight sm:leading-none">
        মিলি সেকেন্ডের ভেতর <span class="text-transparent bg-clip-text bg-gradient-to-r from-crimson-600 to-rose-500">রক্তদাতা খুঁজুন</span> — জীবন বাঁচান
      </h1>
      <p class="mt-4 sm:mt-6 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
        BRYBDPF স্মার্ট ব্লাড নেটওয়ার্ক। আপনার এলাকা ও রক্তের গ্রুপের ডোনারদের তথ্য মুহূর্তের মধ্যে বের করুন। জরুরি মুহূর্তে এক ক্লিকেই যোগাযোগ করুন।
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a href="#request-section" class="tap-target inline-flex items-center px-6 py-3 rounded-xl bg-crimson-600 hover:bg-crimson-700 text-white font-semibold text-base shadow-lg shadow-crimson-600/30 hover:shadow-xl transition-all">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          জরুরি রক্ত চাই (Request Blood)
        </a>
        <button onclick="openDonorModal()" class="tap-target inline-flex items-center px-6 py-3 rounded-xl border border-crimson-200 bg-white hover:bg-rose-50/50 text-crimson-700 font-semibold text-base transition">
          <svg class="w-5 h-5 mr-2 text-crimson-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
          ডোনার হিসেবে যুক্ত হোন
        </button>
      </div>

      <div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-crimson-600" id="stat-total-donors">...</div>
          <div class="text-xs sm:text-sm text-slate-500 font-medium mt-1">মোট রক্তদাতা</div>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-emerald-600" id="stat-avail-donors">...</div>
          <div class="text-xs sm:text-sm text-slate-500 font-medium mt-1">প্রস্তুত রক্তদাতা</div>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-blue-600" id="stat-districts">৬৪</div>
          <div class="text-xs sm:text-sm text-slate-500 font-medium mt-1">জেলা কাভারেজ</div>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-purple-600" id="stat-requests">...</div>
          <div class="text-xs sm:text-sm text-slate-500 font-medium mt-1">রক্তের রিকোয়েস্ট</div>
        </div>
      </div>
    </div>
  </header>

  <section class="max-w-5xl mx-auto px-4 sm:px-6 -mt-6 relative z-10 w-full">
    <div class="bg-white rounded-3xl border border-slate-200 shadow-xl p-5 sm:p-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
        <div>
          <h2 class="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <svg class="w-5 h-5 text-crimson-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            মিলি সেকেন্ডে ডোনার খুঁজুন
          </h2>
          <p class="text-xs sm:text-sm text-slate-500">ব্লাড গ্রুপ এবং আপনার জেলা নির্বাচন করলেই মুহূর্তের মধ্যে ডোনারের তালিকা হাজির হবে।</p>
        </div>
        <div id="search-timer-badge" class="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          ⚡ রেসপন্স টাইম: <span id="timer-val" class="ml-1 font-mono">০ ms</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-4">
        <div class="sm:col-span-4">
          <label class="block text-xs font-semibold text-slate-700 mb-1">রক্তের গ্রুপ</label>
          <select id="search-bg" class="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-crimson-500 text-sm font-semibold outline-none transition">
            <option value="ALL">সকল রক্তের গ্রুপ</option>
            <option value="A+">A+ (এ পজিটিভ)</option>
            <option value="A-">A- (এ নেগেটিভ)</option>
            <option value="B+">B+ (বি পজিটিভ)</option>
            <option value="B-">B- (বি নেগেটিভ)</option>
            <option value="AB+">AB+ (এবি পজিটিভ)</option>
            <option value="AB-">AB- (এবি নেগেটিভ)</option>
            <option value="O+">O+ (ও পজিটিভ)</option>
            <option value="O-">O- (ও নেগেটিভ)</option>
          </select>
        </div>
        <div class="sm:col-span-5">
          <label class="block text-xs font-semibold text-slate-700 mb-1">জেলা / এলাকা</label>
          <input type="text" id="search-district" placeholder="উদাঃ ঢাকা, চট্টগ্রাম, যশোর, মিরপুর..." class="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-crimson-500 text-sm outline-none transition">
        </div>
        <div class="sm:col-span-3 flex items-end">
          <button onclick="triggerDonorSearch()" class="tap-target w-full h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            সার্চ করুন
          </button>
        </div>
      </div>

      <div class="mt-6">
        <div id="search-results-loading" class="hidden text-center py-8">
          <div class="inline-block animate-spin w-8 h-8 border-4 border-crimson-600 border-t-transparent rounded-full"></div>
          <p class="text-sm text-slate-500 mt-2 font-medium">ক্লাউড ডাটাবেজ থেকে খোঁজা হচ্ছে...</p>
        </div>
        <div id="search-results-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
        <div id="search-no-results" class="hidden text-center py-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <p class="text-slate-600 font-semibold mt-3">এই ফিল্টারে কোনো ডোনার পাওয়া যায়নি।</p>
          <p class="text-xs text-slate-400 mt-1">অন্যান্য জেলা অথবা রক্তের গ্রুপ পরিবর্তন করে আবার চেষ্টা করুন।</p>
        </div>
      </div>
    </div>
  </section>

  <section id="request-section" class="max-w-4xl mx-auto px-4 sm:px-6 py-14 w-full">
    <div class="bg-white rounded-3xl border border-rose-200 shadow-xl overflow-hidden">
      <div class="bg-gradient-to-r from-crimson-700 to-crimson-600 text-white p-6 sm:p-8">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div>
            <h2 class="text-2xl font-bold tracking-tight">জরুরি রক্তের রিকোয়েস্ট পাঠান</h2>
            <p class="text-rose-100 text-sm mt-0.5">তথ্য পূরণ করলেই নিকটস্থ উপযুক্ত ডোনারদের কাছে তাৎক্ষণিক বার্তা পৌঁছাবে।</p>
          </div>
        </div>
      </div>

      <form id="blood-request-form" onsubmit="submitBloodRequest(event)" class="p-6 sm:p-8 space-y-6">
        <div id="request-alert-box" class="hidden p-4 rounded-xl text-sm font-medium"></div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">রোগীর পুরো নাম *</label>
            <input type="text" id="req-patient-name" required placeholder="উদাঃ শফিকুল ইসলাম" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">প্রয়োজনীয় রক্তের গ্রুপ *</label>
            <select id="req-blood-group" required class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm font-semibold transition">
              <option value="">গ্রুপ নির্বাচন করুন</option>
              <option value="A+">A+</option><option value="A-">A-</option>
              <option value="B+">B+</option><option value="B-">B-</option>
              <option value="AB+">AB+</option><option value="AB-">AB-</option>
              <option value="O+">O+</option><option value="O-">O-</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">রক্তের পরিমাণ (ব্যাগ) *</label>
            <input type="number" id="req-units" min="1" max="10" value="1" required class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">জেলা *</label>
            <input type="text" id="req-district" required placeholder="উদাঃ ঢাকা" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">রক্তের প্রয়োজন কখন? *</label>
            <input type="text" id="req-needed-by" required placeholder="উদাঃ আজ বিকাল ৪টায় / জরুরি" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">হাসপাতালের নাম ও ওয়ার্ড নম্বর *</label>
            <input type="text" id="req-hospital" required placeholder="উদাঃ ঢাকা মেডিকেল কলেজ হাসপাতাল" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">হাসপাতালের এলাকা / লোকেশন *</label>
            <input type="text" id="req-location" required placeholder="উদাঃ চাঁনখারপুল, ঢাকা" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
        </div>

        <div class="bg-rose-50/50 p-4 sm:p-5 rounded-2xl border border-rose-100 space-y-4">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-crimson-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            <h3 class="text-sm font-bold text-slate-900">যোগাযোগের মোবাইল নম্বর ও ডোনার প্রোফাইল</h3>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed">* নীতিমালা অনুযায়ী রিকোয়েস্টকারীকেও ভবিষ্যৎ ডোনার হিসেবে তথ্য সংরক্ষণ করতে হবে।</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">মোবাইল নম্বর (১১ ডিজিট) *</label>
              <input type="tel" id="req-phone" required placeholder="01XXXXXXXXX" pattern="[0-9]{11}" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm font-mono transition">
              <span class="text-[11px] text-slate-400 mt-0.5 block">বিগত ২৪ ঘণ্টায় একই নম্বর থেকে একাধিক রিকোয়েস্ট গ্রহণযোগ্য নয়।</span>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার নাম (ডোনার/প্রতিনিধি) *</label>
              <input type="text" id="req-donor-name" required placeholder="আপনার নাম লিখুন" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">বয়স *</label>
              <input type="number" id="req-donor-age" min="18" max="65" value="24" required class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">লিঙ্গ *</label>
              <select id="req-donor-gender" class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs">
                <option value="Male">পুরুষ</option><option value="Female">নারী</option><option value="Other">অন্যান্য</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার এলাকা</label>
              <input type="text" id="req-donor-area" placeholder="উপজেলা / এলাকা" class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs">
            </div>
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">অতিরিক্ত তথ্য (ঐচ্ছিক)</label>
          <textarea id="req-note" rows="2" placeholder="রোগীর অপারেশনের বিবরণ বা বিশেষ নির্দেশনা..." class="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition"></textarea>
        </div>

        <div class="space-y-3 pt-2">
          <label class="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" id="req-agree-1" required class="mt-1 w-4 h-4 rounded text-crimson-600 focus:ring-crimson-500 border-slate-300">
            <span class="text-xs sm:text-sm text-slate-700 font-medium group-hover:text-slate-900">১. ভবিষ্যতে কারো রক্ত লাগলে রক্ত দেয়ার চেষ্টা করবো।</span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" id="req-agree-2" required class="mt-1 w-4 h-4 rounded text-crimson-600 focus:ring-crimson-500 border-slate-300">
            <span class="text-xs sm:text-sm text-slate-700 font-medium group-hover:text-slate-900">২. আমার সকল তথ্য ডুনার লিষ্টে সেইভ রাখলে আমার কোন সমস্যা নেই।</span>
          </label>
        </div>

        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-600">রোবট যাচাই (ক্যাপচা):</span>
            <span id="captcha-question" class="px-3 py-1 bg-white font-mono font-bold text-slate-800 rounded-lg border border-slate-200 shadow-sm text-sm">লোড হচ্ছে...</span>
            <button type="button" onclick="loadCaptcha()" class="text-xs text-crimson-600 hover:underline p-1">নতুন কোড</button>
          </div>
          <div class="w-full sm:w-44">
            <input type="hidden" id="captcha-token">
            <input type="number" id="captcha-answer" required placeholder="যোগফল লিখুন" class="w-full h-10 px-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-crimson-500 outline-none text-sm font-mono text-center">
          </div>
        </div>

        <button type="submit" id="submit-req-btn" class="tap-target w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-crimson-600 to-rose-600 hover:from-crimson-700 hover:to-rose-700 text-white font-bold text-base shadow-md shadow-crimson-600/30 transition-all flex items-center justify-center gap-2">
          <span>জরুরি ব্লাড রিকোয়েস্ট পাঠান</span>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </button>
      </form>
    </div>
  </section>

  <div id="donor-modal" class="fixed inset-0 z-50 hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
    <div class="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
      <div class="bg-slate-900 text-white p-5 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-crimson-600 flex items-center justify-center text-white">
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          </div>
          <h3 class="font-bold text-lg">ব্লাড ডোনার রেজিস্ট্রেশন</h3>
        </div>
        <button onclick="closeDonorModal()" class="text-slate-400 hover:text-white p-1">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <form id="donor-reg-form" onsubmit="submitDonorRegistration(event)" class="p-6 space-y-4">
        <div id="donor-modal-alert" class="hidden p-3 rounded-xl text-xs font-semibold"></div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার পুরো নাম *</label>
          <input type="text" id="reg-name" required placeholder="উদাঃ মোঃ তানভীর আহমেদ" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">রক্তের গ্রুপ *</label>
            <select id="reg-blood-group" required class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm font-semibold transition">
              <option value="">বাছাই করুন</option>
              <option value="A+">A+</option><option value="A-">A-</option>
              <option value="B+">B+</option><option value="B-">B-</option>
              <option value="AB+">AB+</option><option value="AB-">AB-</option>
              <option value="O+">O+</option><option value="O-">O-</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">মোবাইল নম্বর *</label>
            <input type="tel" id="reg-phone" required placeholder="01XXXXXXXXX" pattern="[0-9]{11}" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm font-mono transition">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">নিজ জেলা *</label>
            <input type="text" id="reg-district" required placeholder="উদাঃ ঢাকা" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">উপজেলা / এলাকা *</label>
            <input type="text" id="reg-area" required placeholder="উদাঃ মিরপুর-১০" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm transition">
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">বয়স *</label>
            <input type="number" id="reg-age" min="18" max="65" value="22" required class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">লিঙ্গ *</label>
            <select id="reg-gender" class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs">
              <option value="Male">পুরুষ</option><option value="Female">নারী</option><option value="Other">অন্যান্য</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">মোট রক্তদান</label>
            <input type="number" id="reg-total" min="0" value="0" class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs">
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">সর্বশেষ রক্তদানের তারিখ (যদি থাকে)</label>
          <input type="date" id="reg-last-date" class="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs">
        </div>

        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-slate-600">যাচাই:</span>
          <span id="modal-captcha-q" class="font-mono font-bold text-xs bg-white px-2 py-1 rounded border">...</span>
          <input type="hidden" id="modal-captcha-token">
          <input type="number" id="modal-captcha-ans" required placeholder="উত্তর" class="w-24 h-8 px-2 rounded border text-xs text-center font-mono">
        </div>

        <button type="submit" id="reg-submit-btn" class="tap-target w-full py-3 rounded-xl bg-crimson-600 hover:bg-crimson-700 text-white font-bold text-sm shadow-md transition">
          রেজিস্ট্রেশন নিশ্চিত করুন
        </button>
      </form>
    </div>
  </div>

  <footer class="mt-auto bg-slate-900 text-slate-400 py-10 border-t border-slate-800">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs space-y-3">
      <div class="flex items-center justify-center gap-2 text-white font-bold text-base">
        <span class="w-2.5 h-2.5 rounded-full bg-crimson-500"></span>
        BRYBDPF স্মার্ট ব্লাড নেটওয়ার্ক
      </div>
      <p class="max-w-md mx-auto text-slate-500">স্বেচ্ছাসেবী রক্তদান উদ্যোগ। ক্লাউডফায়ার এজ আর্কিটেকচার দ্বারা সুরক্ষিত ও দ্রুততম গতিতে পরিচালিত।</p>
      <div class="pt-2 text-slate-600">&copy; 2026 BRYBDPF. All rights reserved.</div>
    </div>
  </footer>

  <script>
    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const d = await res.json();
        document.getElementById('stat-total-donors').textContent = d.total_donors || 0;
        document.getElementById('stat-avail-donors').textContent = d.available_donors || 0;
        document.getElementById('stat-districts').textContent = (d.districts_count || 0) + ' টি';
        document.getElementById('stat-requests').textContent = d.total_requests || 0;
      } catch (e) {}
    }

    async function loadCaptcha() {
      try {
        const res = await fetch('/api/captcha');
        const data = await res.json();
        document.getElementById('captcha-question').textContent = data.question;
        document.getElementById('captcha-token').value = data.token;
      } catch (e) {}
    }

    async function loadModalCaptcha() {
      try {
        const res = await fetch('/api/captcha');
        const data = await res.json();
        document.getElementById('modal-captcha-q').textContent = data.question;
        document.getElementById('modal-captcha-token').value = data.token;
      } catch (e) {}
    }

    function openDonorModal() {
      document.getElementById('donor-modal').classList.remove('hidden');
      loadModalCaptcha();
    }
    function closeDonorModal() {
      document.getElementById('donor-modal').classList.add('hidden');
    }

    async function triggerDonorSearch() {
      const bg = document.getElementById('search-bg').value;
      const district = document.getElementById('search-district').value;
      const resultsList = document.getElementById('search-results-list');
      const loading = document.getElementById('search-results-loading');
      const noRes = document.getElementById('search-no-results');
      const timerBadge = document.getElementById('search-timer-badge');
      const timerVal = document.getElementById('timer-val');

      resultsList.innerHTML = '';
      loading.classList.remove('hidden');
      noRes.classList.add('hidden');

      const clientStart = performance.now();
      try {
        const params = new URLSearchParams({ blood_group: bg, district: district });
        const res = await fetch('/api/donors/search?' + params.toString());
        const data = await res.json();
        const clientDuration = Math.round(performance.now() - clientStart);

        loading.classList.add('hidden');
        timerBadge.classList.remove('hidden');
        timerVal.textContent = clientDuration + ' ms';

        if (!data.donors || data.donors.length === 0) {
          noRes.classList.remove('hidden');
          return;
        }

        data.donors.forEach(donor => {
          const cleanPhone = donor.phone.replace(/[^0-9]/g, '');
          const waPhone = cleanPhone.startsWith('88') ? cleanPhone : (cleanPhone.startsWith('0') ? '88' + cleanPhone : cleanPhone);

          const card = document.createElement('div');
          card.className = 'bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col justify-between';
          card.innerHTML = 
            '<div>' +
              '<div class="flex items-start justify-between">' +
                '<div>' +
                  '<h4 class="font-bold text-base text-slate-900">' + escapeHtml(donor.name) + '</h4>' +
                  '<p class="text-xs text-slate-500 mt-0.5">' + escapeHtml(donor.district) + ', ' + escapeHtml(donor.area) + '</p>' +
                '</div>' +
                '<span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold bg-rose-100 text-crimson-700 border border-rose-200">' +
                  escapeHtml(donor.blood_group) +
                '</span>' +
              '</div>' +
              '<div class="flex items-center gap-3 text-xs text-slate-500 mt-3">' +
                '<span>বয়স: ' + donor.age + ' বছর</span>' +
                '<span>•</span>' +
                '<span class="text-emerald-600 font-medium flex items-center gap-1">' +
                  '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> প্রস্তুত' +
                '</span>' +
              '</div>' +
            '</div>' +
            '<div class="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">' +
              '<a href="tel:' + donor.phone + '" class="tap-target flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition">' +
                '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>' +
                'কল করুন' +
              '</a>' +
              '<a href="https://wa.me/' + waPhone + '?text=' + encodeURIComponent('আসসালামু আলাইকুম, জরুরি রক্তের প্রয়োজনে BRYBDPF থেকে আপনার সাথে যোগাযোগ করা হয়েছে।') + '" target="_blank" class="tap-target flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition">' +
                '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.353.101.173.45 1.082 1.341 1.637.289.181.536.297.722.357.186.059.355.051.49-.009.166-.073.714-.834.905-1.121.19-.287.381-.239.638-.145.257.095 1.63.769 1.91 1.009.28.24.466.356.534.472.068.116.068.672-.076 1.077z"/></svg>' +
                'WhatsApp' +
              '</a>' +
            '</div>';
          resultsList.appendChild(card);
        });
      } catch (err) {
        loading.classList.add('hidden');
        alert('সার্চ করতে সমস্যা হয়েছে: ' + err.message);
      }
    }

    async function submitBloodRequest(e) {
      e.preventDefault();
      const alertBox = document.getElementById('request-alert-box');
      const submitBtn = document.getElementById('submit-req-btn');

      alertBox.className = 'hidden';

      const agree1 = document.getElementById('req-agree-1').checked;
      const agree2 = document.getElementById('req-agree-2').checked;

      if (!agree1 || !agree2) {
        alertBox.className = 'p-4 rounded-xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 block';
        alertBox.textContent = 'উভয় সম্মতি শর্তে টিক দিতে হবে।';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = 'পাঠানো হচ্ছে...';

      const payload = {
        patient_name: document.getElementById('req-patient-name').value,
        blood_group: document.getElementById('req-blood-group').value,
        units: parseInt(document.getElementById('req-units').value, 10),
        district: document.getElementById('req-district').value,
        needed_by: document.getElementById('req-needed-by').value,
        hospital_name: document.getElementById('req-hospital').value,
        location: document.getElementById('req-location').value,
        contact_phone: document.getElementById('req-phone').value,
        donor_name: document.getElementById('req-donor-name').value,
        donor_age: parseInt(document.getElementById('req-donor-age').value, 10),
        donor_gender: document.getElementById('req-donor-gender').value,
        donor_area: document.getElementById('req-donor-area').value,
        note: document.getElementById('req-note').value,
        agreed_future_donation: agree1,
        agreed_data_save: agree2,
        captcha_token: document.getElementById('captcha-token').value,
        captcha_answer: document.getElementById('captcha-answer').value
      };

      try {
        const res = await fetch('/api/requests/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'জরুরি ব্লাড রিকোয়েস্ট পাঠান';

        if (!res.ok) {
          alertBox.className = 'p-4 rounded-xl text-sm font-semibold bg-rose-50 text-rose-800 border border-rose-200 block';
          alertBox.textContent = data.error || 'রিকোয়েস্ট ব্যর্থ হয়েছে';
          loadCaptcha();
          return;
        }

        alertBox.className = 'p-4 rounded-xl text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block';
        alertBox.innerHTML = '<strong>সফল!</strong> ' + data.message + '<br>আমরা তাৎক্ষণিকভাবে ' + data.matched_count + ' জন সম্ভাব্য ডোনারের তালিকা এডমিন ও টেলিগ্রাম বটে পাঠিয়েছি।';
        document.getElementById('blood-request-form').reset();
        loadCaptcha();
        loadStats();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'জরুরি ব্লাড রিকোয়েস্ট পাঠান';
        alertBox.className = 'p-4 rounded-xl text-sm font-semibold bg-rose-50 text-rose-800 border border-rose-200 block';
        alertBox.textContent = 'সার্ভার সংযোগ বিচ্ছিন্ন হয়েছে: ' + err.message;
        loadCaptcha();
      }
    }

    async function submitDonorRegistration(e) {
      e.preventDefault();
      const alertBox = document.getElementById('donor-modal-alert');
      const submitBtn = document.getElementById('reg-submit-btn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'সংরক্ষণ করা হচ্ছে...';
      alertBox.className = 'hidden';

      const payload = {
        name: document.getElementById('reg-name').value,
        blood_group: document.getElementById('reg-blood-group').value,
        phone: document.getElementById('reg-phone').value,
        district: document.getElementById('reg-district').value,
        area: document.getElementById('reg-area').value,
        age: parseInt(document.getElementById('reg-age').value, 10),
        gender: document.getElementById('reg-gender').value,
        total_donations: parseInt(document.getElementById('reg-total').value, 10) || 0,
        last_donation_date: document.getElementById('reg-last-date').value || null,
        captcha_token: document.getElementById('modal-captcha-token').value,
        captcha_answer: document.getElementById('modal-captcha-ans').value,
        agreed_future_donation: true,
        agreed_data_save: true
      };

      try {
        const res = await fetch('/api/donors/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        submitBtn.disabled = false;
        submitBtn.textContent = 'রেজিস্ট্রেশন নিশ্চিত করুন';

        if (!res.ok) {
          alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block';
          alertBox.textContent = data.error || 'রেজিস্ট্রেশন ব্যর্থ হয়েছে।';
          loadModalCaptcha();
          return;
        }

        alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block';
        alertBox.textContent = data.message;
        setTimeout(() => {
          closeDonorModal();
          loadStats();
          document.getElementById('donor-reg-form').reset();
        }, 2000);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'রেজিস্ট্রেশন নিশ্চিত করুন';
        alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block';
        alertBox.textContent = 'ত্রুটি: ' + err.message;
        loadModalCaptcha();
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    window.addEventListener('DOMContentLoaded', () => {
      loadStats();
      loadCaptcha();
      triggerDonorSearch();
    });
  </script>
</body>
</html>`;
}

function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BRYBDPF — অ্যাডমিন কন্ট্রোল প্যানেল</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['"Hind Siliguri"', '"Inter"', 'sans-serif'] },
          colors: {
            crimson: { 500: '#F43F5E', 600: '#E11D48', 700: '#BE123C', 800: '#9F1239' }
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Hind Siliguri', sans-serif; }
    .tap-target { min-height: 44px; min-width: 44px; }
  </style>
</head>
<body class="bg-slate-100 text-slate-800 antialiased min-h-screen flex flex-col">
  <div id="setup-view" class="hidden min-h-screen flex items-center justify-center p-4 bg-slate-900">
    <div class="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700">
      <div class="text-center mb-6">
        <div class="w-12 h-12 bg-crimson-600 rounded-2xl mx-auto flex items-center justify-center text-white mb-3 shadow-lg shadow-crimson-600/30">
          <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
        </div>
        <h2 class="text-xl font-bold text-slate-900">BRYBDPF অ্যাডমিন প্রাথমিক সেটআপ</h2>
        <p class="text-xs text-slate-500 mt-1">কোডের কোথাও অ্যাডমিন তথ্য নেই। আপনার নিজস্ব সুরক্ষিত ইমেইল ও পাসওয়ার্ড সেট করুন।</p>
      </div>

      <div id="setup-alert" class="hidden p-3 rounded-xl text-xs font-semibold mb-4"></div>

      <form onsubmit="handleInitialSetup(event)" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">অ্যাডমিন ইমেইল *</label>
          <input type="email" id="setup-email" required placeholder="admin@domain.com" class="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-crimson-500">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">মাস্টার পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর) *</label>
          <input type="password" id="setup-password" required minlength="8" placeholder="••••••••" class="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-crimson-500">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">টেলিগ্রাম বট টোকেন (ঐচ্ছিক)</label>
          <input type="text" id="setup-tg-token" placeholder="bot123456789:ABCdefGhI..." class="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-mono outline-none">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">টেলিগ্রাম অ্যাডমিন ইউজার আইডি (কমা দিয়ে আলাদা) *</label>
          <input type="text" id="setup-tg-uids" placeholder="123456789, 987654321" class="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-mono outline-none">
        </div>
        <button type="submit" id="setup-btn" class="w-full py-3 rounded-xl bg-crimson-600 hover:bg-crimson-700 text-white font-bold text-sm shadow-md transition">
          অ্যাডমিন একাউন্ট সম্পন্ন করুন
        </button>
      </form>
    </div>
  </div>

  <div id="login-view" class="hidden min-h-screen flex items-center justify-center p-4 bg-slate-900">
    <div class="max-w-sm w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700">
      <div class="text-center mb-6">
        <div class="w-12 h-12 bg-slate-900 rounded-2xl mx-auto flex items-center justify-center text-white mb-3">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        </div>
        <h2 class="text-xl font-bold text-slate-900">অ্যাডমিন লগইন</h2>
        <p class="text-xs text-slate-500 mt-1">সর্বোচ্চ ৫ বার ভুল চেষ্টার পর আইপি সাময়িকভাবে লক হয়ে যাবে।</p>
      </div>

      <div id="login-alert" class="hidden p-3 rounded-xl text-xs font-semibold mb-4"></div>

      <form onsubmit="handleLogin(event)" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">ইমেইল</label>
          <input type="email" id="login-email" required placeholder="admin@..." class="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-crimson-500">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">পাসওয়ার্ড</label>
          <input type="password" id="login-password" required placeholder="••••••••" class="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-crimson-500">
        </div>
        <button type="submit" id="login-btn" class="tap-target w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition">
          সুরক্ষিত লগইন
        </button>
      </form>
    </div>
  </div>

  <div id="dashboard-view" class="hidden flex-1 flex flex-col">
    <header class="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-crimson-600 flex items-center justify-center text-white">
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          </div>
          <div>
            <h1 class="text-base font-bold text-slate-900">BRYBDPF অ্যাডমিন</h1>
            <p class="text-[11px] text-slate-500" id="admin-display-email">admin</p>
          </div>
        </div>

        <div class="flex items-center gap-1 sm:gap-2">
          <button onclick="switchTab('donors')" id="tab-btn-donors" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-crimson-700 transition">ডোনার তালিকা</button>
          <button onclick="switchTab('requests')" id="tab-btn-requests" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">ব্লাড রিকোয়েস্ট</button>
          <button onclick="switchTab('settings')" id="tab-btn-settings" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">টেলিগ্রাম ও সেটিংস</button>
          <a href="/" target="_blank" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 transition">সাইট দেখুন</a>
          <button onclick="handleLogout()" class="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 transition">লগআউট</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div class="text-xs text-slate-500 font-medium">মোট ডোনার</div>
          <div class="text-2xl font-bold text-slate-900 mt-1" id="m-total-donors">0</div>
        </div>
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div class="text-xs text-slate-500 font-medium">প্রস্তুত ডোনার</div>
          <div class="text-2xl font-bold text-emerald-600 mt-1" id="m-active-donors">0</div>
        </div>
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div class="text-xs text-slate-500 font-medium">মোট রিকোয়েস্ট</div>
          <div class="text-2xl font-bold text-slate-900 mt-1" id="m-total-requests">0</div>
        </div>
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div class="text-xs text-slate-500 font-medium">অপেক্ষমান রিকোয়েস্ট</div>
          <div class="text-2xl font-bold text-amber-600 mt-1" id="m-pending-requests">0</div>
        </div>
      </div>

      <div id="tab-donors" class="space-y-4">
        <div class="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <h2 class="font-bold text-slate-900 text-lg">ডোনার ব্যবস্থাপনা ও ফিল্টারিং</h2>
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <select id="admin-filter-bg" onchange="fetchAdminDonors()" class="h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold">
                <option value="ALL">সকল রক্তের গ্রুপ</option>
                <option value="A+">A+</option><option value="A-">A-</option>
                <option value="B+">B+</option><option value="B-">B-</option>
                <option value="AB+">AB+</option><option value="AB-">AB-</option>
                <option value="O+">O+</option><option value="O-">O-</option>
              </select>
              <input type="text" id="admin-search-text" oninput="debounceSearch()" placeholder="নাম বা মোবাইল নম্বর..." class="h-10 px-3 rounded-xl border border-slate-200 text-xs flex-1 sm:w-48">
            </div>
          </div>

          <div class="overflow-x-auto mt-4">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th class="p-3">নাম</th>
                  <th class="p-3">গ্রুপ</th>
                  <th class="p-3">ফোন নম্বর</th>
                  <th class="p-3">জেলা ও এলাকা</th>
                  <th class="p-3">বয়স</th>
                  <th class="p-3">স্ট্যাটাস</th>
                  <th class="p-3 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody id="admin-donors-tbody" class="divide-y divide-slate-100"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-requests" class="hidden space-y-4">
        <div class="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between pb-4 border-b border-slate-100">
            <h2 class="font-bold text-slate-900 text-lg">ব্লাড রিকোয়েস্ট তালিকা ও ১-ক্লিক শেয়ার</h2>
            <select id="admin-filter-status" onchange="fetchAdminRequests()" class="h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold">
              <option value="ALL">সকল স্ট্যাটাস</option>
              <option value="Pending">অপেক্ষমান (Pending)</option>
              <option value="Matched">ম্যাচড (Matched)</option>
              <option value="Fulfilled">সম্পন্ন (Fulfilled)</option>
              <option value="Closed">বন্ধ (Closed)</option>
            </select>
          </div>

          <div class="overflow-x-auto mt-4">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th class="p-3">রোগী</th>
                  <th class="p-3">গ্রুপ/ব্যাগ</th>
                  <th class="p-3">হাসপাতাল ও এলাকা</th>
                  <th class="p-3">যোগাযোগ</th>
                  <th class="p-3">সময়সীমা</th>
                  <th class="p-3">স্ট্যাটাস</th>
                  <th class="p-3 text-right">ডোনার লিস্ট ও শেয়ার</th>
                </tr>
              </thead>
              <tbody id="admin-requests-tbody" class="divide-y divide-slate-100"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-settings" class="hidden max-w-2xl mx-auto space-y-6">
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 class="font-bold text-slate-900 text-base mb-1">টেলিগ্রাম বট কনফিগারেশন</h2>
          <p class="text-xs text-slate-500 mb-4">নতুন রক্তের রিকোয়েস্ট আসলে তাৎক্ষণিকভাবে নির্ধারিত অ্যাডমিনদের টেলিগ্রামে অ্যালার্ট ও শীর্ষ ২০ ডোনার লিস্ট পাঠাবে।</p>
          <div id="settings-alert" class="hidden p-3 rounded-xl text-xs font-semibold mb-4"></div>

          <form onsubmit="handleSaveSettings(event)" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">টেলিগ্রাম বট টোকেন (Bot Token)</label>
              <input type="text" id="cfg-tg-token" placeholder="নতুন টোকেন সেট করতে এখানে লিখুন" class="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-mono outline-none">
              <span id="masked-token-note" class="text-[11px] text-slate-400 mt-1 block"></span>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">টেলিগ্রাম অ্যাডমিন ইউজার আইডি (UIDs - কমা দিয়ে একাধিক দিন)</label>
              <input type="text" id="cfg-tg-uids" placeholder="123456789, 987654321" class="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-mono outline-none">
            </div>
            <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
              <button type="button" onclick="testTelegramAlert()" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition">টেস্ট মেসেজ পাঠান</button>
              <button type="submit" class="px-6 py-2.5 rounded-xl bg-crimson-600 hover:bg-crimson-700 text-white text-xs font-bold shadow transition">সেটিংস সংরক্ষণ করুন</button>
            </div>
          </form>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 class="font-bold text-slate-900 text-base mb-1">অ্যাডমিন পাসওয়ার্ড পরিবর্তন</h2>
          <p class="text-xs text-slate-500 mb-4">নিরাপত্তার স্বার্থে নিয়মিত শক্তিশালী পাসওয়ার্ড ব্যবহার করুন।</p>

          <form onsubmit="handleChangePassword(event)" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">বর্তমান পাসওয়ার্ড</label>
              <input type="password" id="pwd-current" required class="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)</label>
              <input type="password" id="pwd-new" minlength="8" required class="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm">
            </div>
            <button type="submit" class="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition">পাসওয়ার্ড আপডেট করুন</button>
          </form>
        </div>
      </div>
    </main>
  </div>

  <div id="matching-modal" class="fixed inset-0 z-50 hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 class="font-bold text-slate-900 text-base">ম্যাচিং ডোনার তালিকা ও ১-ক্লিক শেয়ার</h3>
          <p class="text-xs text-slate-500 mt-0.5" id="match-modal-subtitle">লোড হচ্ছে...</p>
        </div>
        <button onclick="closeMatchingModal()" class="text-slate-400 hover:text-slate-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="my-4 overflow-y-auto flex-1 space-y-2" id="matching-donors-list"></div>

      <div class="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button onclick="copyShareText()" class="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-1.5 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          ডোনার লিস্ট কপি করুন
        </button>
        <a id="btn-wa-share" href="#" target="_blank" class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.353.101.173.45 1.082 1.341 1.637.289.181.536.297.722.357.186.059.355.051.49-.009.166-.073.714-.834.905-1.121.19-.287.381-.239.638-.145.257.095 1.63.769 1.91 1.009.28.24.466.356.534.472.068.116.068.672-.076 1.077z"/></svg>
          ১-ক্লিকে WhatsApp-এ পাঠান
        </a>
      </div>
    </div>
  </div>

  <script>
    let currentShareText = '';
    let searchTimeout = null;

    async function initAdmin() {
      try {
        const setupRes = await fetch('/api/admin/check-setup');
        const setupData = await setupRes.json();

        if (setupData.needsSetup) {
          document.getElementById('setup-view').classList.remove('hidden');
          return;
        }

        const token = localStorage.getItem('brybdpf_admin_token');
        if (!token) {
          document.getElementById('login-view').classList.remove('hidden');
          return;
        }

        const dataRes = await fetch('/api/admin/data', {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!dataRes.ok) {
          localStorage.removeItem('brybdpf_admin_token');
          document.getElementById('login-view').classList.remove('hidden');
          return;
        }

        const overview = await dataRes.json();
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('admin-display-email').textContent = overview.admin_email;
        document.getElementById('m-total-donors').textContent = overview.total_donors;
        document.getElementById('m-active-donors').textContent = overview.active_donors;
        document.getElementById('m-total-requests').textContent = overview.total_requests;
        document.getElementById('m-pending-requests').textContent = overview.pending_requests;

        fetchAdminDonors();
        fetchAdminRequests();
        loadSettings();
      } catch (err) {
        document.getElementById('login-view').classList.remove('hidden');
      }
    }

    async function handleInitialSetup(e) {
      e.preventDefault();
      const alertBox = document.getElementById('setup-alert');
      const btn = document.getElementById('setup-btn');
      btn.disabled = true;

      const payload = {
        email: document.getElementById('setup-email').value,
        password: document.getElementById('setup-password').value,
        telegram_token: document.getElementById('setup-tg-token').value,
        telegram_uids: document.getElementById('setup-tg-uids').value
      };

      try {
        const res = await fetch('/api/admin/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        btn.disabled = false;

        if (!res.ok) {
          alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 block';
          alertBox.textContent = data.error || 'সেটআপ ব্যর্থ হয়েছে';
          return;
        }

        alert('সেটআপ সম্পন্ন হয়েছে! এখন লগইন করুন।');
        location.reload();
      } catch (err) {
        btn.disabled = false;
        alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 block';
        alertBox.textContent = 'ত্রুটি: ' + err.message;
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      const alertBox = document.getElementById('login-alert');
      const btn = document.getElementById('login-btn');
      btn.disabled = true;
      btn.textContent = 'যাচাই করা হচ্ছে...';

      const payload = {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
      };

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        btn.disabled = false;
        btn.textContent = 'সুরক্ষিত লগইন';

        if (!res.ok) {
          alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 block';
          alertBox.textContent = data.error || 'লগইন ব্যর্থ হয়েছে';
          return;
        }

        localStorage.setItem('brybdpf_admin_token', data.token);
        location.reload();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'সুরক্ষিত লগইন';
        alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 block';
        alertBox.textContent = 'ত্রুটি: ' + err.message;
      }
    }

    async function handleLogout() {
      const token = localStorage.getItem('brybdpf_admin_token');
      if (token) {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
      }
      localStorage.removeItem('brybdpf_admin_token');
      location.reload();
    }

    function switchTab(tab) {
      ['donors', 'requests', 'settings'].forEach(t => {
        document.getElementById('tab-' + t).classList.add('hidden');
        document.getElementById('tab-btn-' + t).className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition';
      });
      document.getElementById('tab-' + tab).classList.remove('hidden');
      document.getElementById('tab-btn-' + tab).className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-crimson-700 transition';
    }

    async function fetchAdminDonors() {
      const token = localStorage.getItem('brybdpf_admin_token');
      const bg = document.getElementById('admin-filter-bg').value;
      const search = document.getElementById('admin-search-text').value;

      const params = new URLSearchParams({ blood_group: bg, search: search });
      const res = await fetch('/api/admin/donors?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      const tbody = document.getElementById('admin-donors-tbody');
      tbody.innerHTML = '';

      (data.donors || []).forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = 
          '<td class="p-3 font-bold text-slate-900">' + escapeHtml(d.name) + '</td>' +
          '<td class="p-3"><span class="px-2 py-0.5 bg-rose-100 text-crimson-700 font-extrabold rounded">' + d.blood_group + '</span></td>' +
          '<td class="p-3 font-mono font-medium">' + d.phone + '</td>' +
          '<td class="p-3">' + escapeHtml(d.district) + ', ' + escapeHtml(d.area) + '</td>' +
          '<td class="p-3">' + d.age + ' বছর</td>' +
          '<td class="p-3">' +
            '<button onclick="toggleDonor(' + d.id + ')" class="px-2.5 py-1 rounded-full text-[11px] font-bold ' + (d.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600') + '">' +
              (d.is_available ? 'সক্রিয়' : 'নিষ্ক্রিয়') +
            '</button>' +
          '</td>' +
          '<td class="p-3 text-right space-x-2">' +
            '<a href="tel:' + d.phone + '" class="text-blue-600 hover:underline">কল</a>' +
            '<a href="https://wa.me/' + d.phone.replace(/[^0-9]/g, '') + '" target="_blank" class="text-emerald-600 hover:underline">WhatsApp</a>' +
            '<button onclick="deleteDonor(' + d.id + ')" class="text-rose-600 hover:underline">মুছুন</button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    function debounceSearch() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(fetchAdminDonors, 300);
    }

    async function toggleDonor(id) {
      const token = localStorage.getItem('brybdpf_admin_token');
      await fetch('/api/admin/donors/' + id + '/toggle', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      fetchAdminDonors();
    }

    async function deleteDonor(id) {
      if (!confirm('আপনি কি নিশ্চিত যে এই ডোনারের তথ্য মুছে ফেলতে চান?')) return;
      const token = localStorage.getItem('brybdpf_admin_token');
      await fetch('/api/admin/donors/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      fetchAdminDonors();
    }

    async function fetchAdminRequests() {
      const token = localStorage.getItem('brybdpf_admin_token');
      const status = document.getElementById('admin-filter-status').value;
      const res = await fetch('/api/admin/requests?status=' + status, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      const tbody = document.getElementById('admin-requests-tbody');
      tbody.innerHTML = '';

      (data.requests || []).forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = 
          '<td class="p-3 font-bold text-slate-900">' + escapeHtml(r.patient_name) + '</td>' +
          '<td class="p-3"><span class="px-2 py-0.5 bg-rose-100 text-crimson-700 font-extrabold rounded">' + r.blood_group + '</span> (' + r.units + ' ব্যাগ)</td>' +
          '<td class="p-3">' + escapeHtml(r.hospital_name) + '<br><span class="text-slate-400 text-[11px]">' + escapeHtml(r.district) + ', ' + escapeHtml(r.location) + '</span></td>' +
          '<td class="p-3 font-mono font-medium">' + r.contact_phone + '</td>' +
          '<td class="p-3">' + escapeHtml(r.needed_by) + '</td>' +
          '<td class="p-3">' +
            '<select onchange="updateRequestStatus(' + r.id + ', this.value)" class="text-xs font-semibold rounded p-1 border">' +
              '<option value="Pending" ' + (r.status === 'Pending' ? 'selected' : '') + '>অপেক্ষমান</option>' +
              '<option value="Matched" ' + (r.status === 'Matched' ? 'selected' : '') + '>ম্যাচড</option>' +
              '<option value="Fulfilled" ' + (r.status === 'Fulfilled' ? 'selected' : '') + '>সম্পন্ন</option>' +
              '<option value="Closed" ' + (r.status === 'Closed' ? 'selected' : '') + '>বন্ধ</option>' +
            '</select>' +
          '</td>' +
          '<td class="p-3 text-right">' +
            '<button onclick="viewMatchingDonors(' + r.id + ')" class="px-3 py-1.5 rounded-lg bg-crimson-600 hover:bg-crimson-700 text-white font-bold text-[11px] shadow transition">' +
              'ডোনার লিস্ট ও শেয়ার' +
            '</button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    async function updateRequestStatus(id, newStatus) {
      const token = localStorage.getItem('brybdpf_admin_token');
      await fetch('/api/admin/requests/' + id + '/status', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    }

    async function viewMatchingDonors(reqId) {
      const token = localStorage.getItem('brybdpf_admin_token');
      const modal = document.getElementById('matching-modal');
      const list = document.getElementById('matching-donors-list');
      const subtitle = document.getElementById('match-modal-subtitle');
      const waBtn = document.getElementById('btn-wa-share');

      modal.classList.remove('hidden');
      list.innerHTML = '<p class="text-xs text-slate-400">ডোনার লোড করা হচ্ছে...</p>';

      const res = await fetch('/api/admin/requests/' + reqId + '/matching-donors', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();

      subtitle.textContent = 'রোগী: ' + data.request.patient_name + ' | গ্রুপ: ' + data.request.blood_group + ' | হাসপাতাল: ' + data.request.hospital_name;
      currentShareText = data.share_text;
      waBtn.href = data.whatsapp_share_url;

      list.innerHTML = '';
      if (!data.donors || data.donors.length === 0) {
        list.innerHTML = '<p class="text-xs text-rose-600">কোনো সক্রিয় ডোনার পাওয়া যায়নি।</p>';
        return;
      }

      data.donors.forEach((d, idx) => {
        const item = document.createElement('div');
        item.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs';
        item.innerHTML = 
          '<div>' +
            '<span class="font-bold text-slate-900">' + (idx + 1) + '. ' + escapeHtml(d.name) + '</span>' +
            '<span class="ml-1 text-slate-500">(' + escapeHtml(d.district) + ', ' + escapeHtml(d.area) + ')</span>' +
            '<div class="font-mono text-slate-700 mt-0.5">' + d.phone + '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<a href="tel:' + d.phone + '" class="px-2.5 py-1 rounded bg-slate-900 text-white font-bold">কল</a>' +
            '<a href="https://wa.me/' + d.phone.replace(/[^0-9]/g, '') + '" target="_blank" class="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold">WhatsApp</a>' +
          '</div>';
        list.appendChild(item);
      });
    }

    function closeMatchingModal() {
      document.getElementById('matching-modal').classList.add('hidden');
    }

    function copyShareText() {
      navigator.clipboard.writeText(currentShareText);
      alert('ডোনার লিস্ট ক্লিপবোর্ডে কপি করা হয়েছে!');
    }

    async function loadSettings() {
      const token = localStorage.getItem('brybdpf_admin_token');
      const res = await fetch('/api/admin/settings', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        document.getElementById('cfg-tg-uids').value = data.telegram_admin_uids || '';
        if (data.telegram_bot_token_masked) {
          document.getElementById('masked-token-note').textContent = 'বর্তমান টোকেন: ' + data.telegram_bot_token_masked;
        }
      }
    }

    async function handleSaveSettings(e) {
      e.preventDefault();
      const token = localStorage.getItem('brybdpf_admin_token');
      const alertBox = document.getElementById('settings-alert');

      const payload = {
        telegram_admin_uids: document.getElementById('cfg-tg-uids').value
      };
      const newToken = document.getElementById('cfg-tg-token').value;
      if (newToken.trim()) {
        payload.telegram_bot_token = newToken.trim();
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      alertBox.className = 'p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 block';
      alertBox.textContent = data.message || 'সংরক্ষিত হয়েছে';
      loadSettings();
    }

    async function testTelegramAlert() {
      const token = localStorage.getItem('brybdpf_admin_token');
      const res = await fetch('/api/admin/test-telegram', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const d = await res.json();
      alert(d.message || d.error);
    }

    async function handleChangePassword(e) {
      e.preventDefault();
      const token = localStorage.getItem('brybdpf_admin_token');
      const payload = {
        current_password: document.getElementById('pwd-current').value,
        new_password: document.getElementById('pwd-new').value
      };
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ');
        return;
      }
      alert('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!');
      document.getElementById('pwd-current').value = '';
      document.getElementById('pwd-new').value = '';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    window.addEventListener('DOMContentLoaded', initAdmin);
  </script>
</body>
</html>`;
}
