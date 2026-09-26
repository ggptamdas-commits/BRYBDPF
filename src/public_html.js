export default `<!DOCTYPE html>
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
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
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
