import publicHtml from './public_html.js';
import adminHtml from './admin_html.js';

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

  if (results && results.length > 0) return results[0];
  return null;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const ip = getClientIP(request);

      if (method === "OPTIONS") return json({ ok: true });

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
        return json({
          error: "নিরাপত্তা ও গোপনীয়তা সুরক্ষার্থে রক্তদাতাদের ব্যক্তিগত তথ্য পাবলিক সার্চে উন্মুক্ত নয়। রক্তের প্রয়োজনে ফর্ম পূরণ করে রিকোয়েস্ট পাঠান।"
        }, 403);
      }

      if (path === "/api/donors/register" && method === "POST") {
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
          name.trim(), blood_group.trim(), phone.trim(), district.trim(), area.trim(),
          parseInt(age, 10) || 20, gender || "Male", last_donation_date || null,
          parseInt(total_donations, 10) || 0,
          agreed_future_donation ? 1 : 1, agreed_data_save ? 1 : 1
        ).run();

        return json({
          success: true,
          message: "অভিনন্দন! আপনার ব্লাড ডোনার রেজিস্ট্রেশন সফলভাবে সম্পন্ন হয়েছে।"
        }, 201);
      }

      if (path === "/api/requests/create" && method === "POST") {
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
          `).bind(dName, blood_group.trim(), cleanPhone, district.trim(), dArea, dAge, dGender).run();
        }

        await env.DB.prepare(`
          INSERT INTO blood_requests (
            patient_name, blood_group, units, hospital_name, district, location,
            contact_phone, urgency, needed_by, note, status,
            agreed_future_donation, agreed_data_save
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 1, 1)
        `).bind(
          patient_name.trim(), blood_group.trim(), parseInt(units, 10) || 1,
          hospital_name.trim(), district.trim(), location.trim(), cleanPhone,
          urgency || "Urgent", needed_by.trim(), note ? note.trim() : ""
        ).run();

        const { results: matchedDonors } = await env.DB.prepare(`
          SELECT id, name, blood_group, district, area, phone, age
          FROM donors
          WHERE blood_group = ? AND is_available = 1 AND phone != ?
          ORDER BY (CASE WHEN district = ? THEN 0 ELSE 1 END), RANDOM()
          LIMIT 20
        `).bind(blood_group.trim(), cleanPhone, district.trim()).all();

        if (ctx && ctx.waitUntil) {
          ctx.waitUntil(sendTelegramAlert(env, {
            patient_name, blood_group, units, hospital_name, district, location,
            contact_phone: cleanPhone, urgency, needed_by, note
          }, matchedDonors || []));
        }

        return json({
          success: true,
          message: "আপনার রক্তের রিকোয়েস্ট সফলভাবে গ্রহণ করা হয়েছে। জরুরি ভিত্তিতে রক্তদাতাদের সাথে সমন্বয়ের জন্য অ্যাডমিন প্যানেল ও টেলিগ্রামে তাৎক্ষণিক নোটিফিকেশন পৌঁছেছে।"
        }, 201);
      }

      if (path === "/api/admin/check-setup" && method === "GET") {
        const adminSetting = await env.DB.prepare(
          "SELECT value FROM admin_settings WHERE key = 'admin_email'"
        ).first();
        return json({ needsSetup: !adminSetting });
      }

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

      if (path === "/api/admin/login" && method === "POST") {
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
        for (const s of (settings.results || [])) map[s.key] = s.value;

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
      }

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
          for (const r of results) map[r.key] = r.value;
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
            if (!current_password) return json({ error: "বর্তমান পাসওয়ার্ড প্রয়োজন।" }, 400);
            const { results: curSettings } = await env.DB.prepare(
              "SELECT key, value FROM admin_settings WHERE key IN ('admin_salt', 'admin_password_hash')"
            ).all();
            const curMap = {};
            for (const s of curSettings) curMap[s.key] = s.value;

            const checkHash = await hashPassword(current_password, curMap.admin_salt);
            if (checkHash !== curMap.admin_password_hash) return json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়!" }, 403);

            const newSalt = generateRandomToken(16);
            const newHash = await hashPassword(new_password, newSalt);
            queries.push(
              env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_salt', ?)").bind(newSalt),
              env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)").bind(newHash)
            );
          }

          if (queries.length > 0) await env.DB.batch(queries);
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

      if (path === "/admin") return html(adminHtml);
      return html(publicHtml);
    } catch (uncaughtError) {
      return new Response("Application Error: " + (uncaughtError.stack || uncaughtError.message), {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  }
};
