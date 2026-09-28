export default `<!DOCTYPE html>
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
                  <th class="p-3">রোগী ও প্রয়োজনীয় গ্রুপ</th>
                  <th class="p-3">হাসপাতাল ও এলাকা</th>
                  <th class="p-3">আবেদনকারী (প্রতিনিধি)</th>
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
        const stats = overview.stats || overview;
        document.getElementById('admin-display-email').textContent = overview.admin_email || 'admin';
        document.getElementById('m-total-donors').textContent = stats.total_donors ?? 0;
        document.getElementById('m-active-donors').textContent = stats.active_donors ?? stats.available_donors ?? 0;
        document.getElementById('m-total-requests').textContent = stats.total_requests ?? 0;
        document.getElementById('m-pending-requests').textContent = stats.pending_requests ?? 0;

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
          '<td class="p-3 font-bold text-slate-900">' + escapeHtml(r.patient_name) + '<br><span class="px-2 py-0.5 bg-rose-100 text-crimson-700 font-extrabold rounded text-[11px]">' + r.blood_group + '</span> (' + r.units + ' ব্যাগ)</td>' +
          '<td class="p-3">' + escapeHtml(r.hospital_name) + '<br><span class="text-slate-400 text-[11px]">' + escapeHtml(r.district) + ', ' + escapeHtml(r.location) + '</span></td>' +
          '<td class="p-3"><b>' + escapeHtml(r.requester_name || r.patient_name) + '</b><br><span class="text-[11px] text-slate-500">গ্রুপ: <span class="font-bold text-slate-800">' + (r.requester_blood_group || '-') + '</span></span><br><a href="tel:' + r.contact_phone + '" class="font-mono text-blue-600 text-[11px]">' + r.contact_phone + '</a></td>' +
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
      const res = await fetch('/api/admin/change-password', {
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
