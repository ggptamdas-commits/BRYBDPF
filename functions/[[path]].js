
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
      `🩸 <b>রোগীর প্রয়োজনীয় রক্তের গ্রুপ:</b> <code>${requestData.blood_group}</code> (${requestData.units} ব্যাগ)\n` +
      `👤 <b>রোগীর নাম:</b> ${requestData.patient_name}\n` +
      `🏥 <b>হাসপাতাল:</b> ${requestData.hospital_name}, ${requestData.district}\n` +
      `📍 <b>ঠিকানা:</b> ${requestData.location}\n` +
      `⏰ <b>প্রয়োজনের সময়:</b> ${requestData.needed_by}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🤝 <b>আবেদনকারী (প্রতিনিধি):</b> ${requestData.requester_name || "স্বজন"}\n` +
      `🩸 <b>প্রতিনিধির নিজের রক্তের গ্রুপ:</b> <code>${requestData.requester_blood_group || "N/A"}</code>\n` +
      `📞 <b>যোগাযোগের নম্বর:</b> <a href="tel:${requestData.contact_phone}">${requestData.contact_phone}</a>\n` +
      (requestData.note ? `📝 <b>নোট:</b> ${requestData.note}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>রোগীর জন্য সম্ভাব্য ডোনার তালিকা (${requestData.blood_group}):</b>\n\n` +
      donorText + `\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <b>এক ক্লিকে আবেদনকারীকে ডোনার লিস্ট পাঠান:</b>\n` +
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
            patient_name, blood_group, units, district, needed_by,
            hospital_name, location, note, contact_phone, urgency,
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
              patient_name, blood_group, units, district, hospital_name,
              location, contact_phone, urgency, needed_by, note, requester_name,
              status, requester_blood_group
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
          `);

          const reqInsertRes = await insertReqStmt.bind(
            patient_name.trim(),
            blood_group,
            parseInt(units, 10),
            district.trim(),
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
            const { results } = await env.DB.prepare(
              "SELECT name, blood_group, district, area, phone FROM donors WHERE blood_group = ? AND is_available = 1 AND phone != ? ORDER BY (CASE WHEN district LIKE ? THEN 0 ELSE 1 END), RANDOM() LIMIT 20"
            ).bind(blood_group, cleanPhone, `%${district.trim()}%`).all();
            matchedDonors = results || [];
          } catch (e) {
            console.error("Donor match query error:", e);
          }

          ctx.waitUntil(sendTelegramAlert(env, {
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
          return json({ error: "সঠিক ইমেইল এবং কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
        }

        const salt = generateRandomToken(16);
        const hash = await hashPassword(password, salt);

        await env.DB.prepare("INSERT INTO admins (email, password_hash, salt, role) VALUES (?, ?, ?, 'superadmin')")
          .bind(email.trim().toLowerCase(), hash, salt)
          .run();

        if (telegram_token && telegram_token.trim()) {
          await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)")
            .bind(telegram_token.trim())
            .run();
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
          return json({ error: "ইমেইল ও পাসওয়ার্ড প্রদান করুন।" }, 400);
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

        const admin = await env.DB.prepare("SELECT id, email, password_hash, salt FROM admins WHERE email = ?").bind(cleanEmail).first();
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
        await env.DB.prepare("INSERT INTO sessions (token, admin_email, expires_at) VALUES (?, ?, datetime('now', '+7 days'))")
          .bind(sessionToken, admin.email)
          .run();

        return json({
          success: true,
          token: sessionToken,
          message: "লগইন সফল হয়েছে!"
        }, 200, {
          "Set-Cookie": `brybdpf_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
        });
      }

      if (path === "/api/admin/logout" && method === "POST") {
        const adminSession = await getAuthenticatedAdmin(request, env);
        if (adminSession) {
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(adminSession.token).run();
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
            env.DB.prepare("SELECT count(*) as count FROM blood_requests").first(),
            env.DB.prepare("SELECT count(*) as count FROM blood_requests WHERE status = 'Pending'").first()
          ]);

          return json({
            admin_email: adminSession.admin_email,
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
          let query = "SELECT * FROM blood_requests";
          const params = [];

          if (status && status !== "ALL") {
            query += " WHERE status = ?";
            params.push(status);
          }

          query += " ORDER BY id DESC LIMIT 100";
          const { results } = await env.DB.prepare(query).bind(...params).all();
          return json({ requests: results || [] });
        }

        if (path.match(/^\/api\/admin\/requests\/\d+\/status$/) && method === "PATCH") {
          const id = path.split("/")[4];
          const { status } = await request.json();
          await env.DB.prepare("UPDATE blood_requests SET status = ? WHERE id = ?").bind(status, id).run();
          return json({ success: true });
        }

        if (path.match(/^\/api\/admin\/requests\/\d+\/match-donors$/) && method === "GET") {
          const id = path.split("/")[4];
          const req = await env.DB.prepare("SELECT * FROM blood_requests WHERE id = ?").bind(id).first();
          if (!req) return json({ error: "রিকোয়েস্ট পাওয়া যায়নি।" }, 404);

          const { results } = await env.DB.prepare(
            "SELECT id, name, blood_group, district, area, phone, age FROM donors WHERE blood_group = ? AND is_available = 1 ORDER BY (CASE WHEN district LIKE ? THEN 0 ELSE 1 END), id DESC LIMIT 20"
          ).bind(req.blood_group, `%${req.district}%`).all();

          return json({
            request_id: req.id,
            patient_name: req.patient_name,
            blood_group: req.blood_group,
            district: req.district,
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
            await env.DB.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('telegram_bot_token', ?)")
              .bind(telegram_bot_token.trim())
              .run();
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
          if (!current_password || !new_password || new_password.length < 8) {
            return json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" }, 400);
          }

          const admin = await env.DB.prepare("SELECT id, password_hash, salt FROM admins WHERE email = ?").bind(adminSession.admin_email).first();
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

      if (path === "/admin" || path === "/admin/") return context.next();
      return context.next();
    } catch (uncaughtError) {
      return new Response("Application Error: " + (uncaughtError.stack || uncaughtError.message), {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

}
