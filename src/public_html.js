export default `<!DOCTYPE html>
<html lang="bn" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>BRYBDPF — নিরাপদ ও দ্রুত ব্লাড নেটওয়ার্ক</title>
  <meta name="description" content="নিরাপদ রক্তদাতা ব্যবস্থাপনা ও জরুরি রক্ত সহায়তা প্ল্যাটফর্ম। সুরক্ষিত অ্যাডমিন প্যানেল ও টেলিগ্রাম অ্যালার্ট সিস্টেম।">
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
  <!-- Navbar -->
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
        <div class="flex items-center gap-2 sm:gap-3">
          <button onclick="openDonorModal()" class="tap-target inline-flex items-center px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-crimson-600 hover:bg-crimson-700 text-white shadow-sm transition">
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
            ডোনার হোন
          </button>
          <a href="/admin" class="tap-target inline-flex items-center px-3 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:text-crimson-600 hover:bg-rose-50 border border-slate-200 transition">
            <svg class="w-4 h-4 mr-1 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            অ্যাডমিন
          </a>
        </div>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <header class="relative overflow-hidden bg-gradient-to-b from-rose-50/60 via-white to-slate-50 pt-10 pb-12 border-b border-rose-100/60">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 text-center">
      <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-crimson-100/80 border border-crimson-200 text-crimson-800 text-xs sm:text-sm font-semibold mb-5">
        <span class="flex h-2 w-2 relative"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-crimson-600"></span></span>
        নিরাপদ রক্তদাতা ব্যবস্থাপনা ও জরুরি রক্ত সহায়তা নেটওয়ার্ক
      </div>
      <h1 class="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight sm:leading-none">
        জরুরি রক্তের প্রয়োজনে পাশে আছে <span class="text-transparent bg-clip-text bg-gradient-to-r from-crimson-600 to-rose-500">BRYBDPF প্ল্যাটফর্ম</span>
      </h1>
      <p class="mt-4 sm:mt-5 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
        রক্তদাতাদের ব্যক্তিগত ফোন নম্বর ও তথ্যের সর্বোচ্চ সুরক্ষা নিশ্চিত করতে পাবলিক তথ্য উন্মুক্ত রাখা হয় না। রক্তের প্রয়োজনে নিচের ফর্মে রিকোয়েস্ট পাঠান — অনুমোদিত অ্যাডমিন ও অটোমেটেড টেলিগ্রাম বটের মাধ্যমে দ্রুততম সময়ে রক্তদাতার সাথে সমন্বয় করা হবে।
      </p>
      <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
        <a href="#request-section" class="tap-target inline-flex items-center px-6 py-3 rounded-xl bg-crimson-600 hover:bg-crimson-700 text-white font-semibold text-sm sm:text-base shadow-lg shadow-crimson-600/30 hover:shadow-xl transition-all">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          জরুরি রক্তের রিকোয়েস্ট পাঠান
        </a>
        <button onclick="openDonorModal()" class="tap-target inline-flex items-center px-6 py-3 rounded-xl border border-crimson-200 bg-white hover:bg-rose-50/50 text-crimson-700 font-semibold text-sm sm:text-base transition">
          <svg class="w-5 h-5 mr-2 text-crimson-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
          ডোনার হিসেবে যুক্ত হোন
        </button>
      </div>

      <!-- Live Counters -->
      <div class="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto">
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-crimson-600" id="stat-total-donors">...</div>
          <div class="text-xs text-slate-500 font-medium mt-1">নিবন্ধিত রক্তদাতা</div>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-emerald-600" id="stat-avail-donors">...</div>
          <div class="text-xs text-slate-500 font-medium mt-1">প্রস্তুত রক্তদাতা</div>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-blue-600" id="stat-districts">৬৪</div>
          <div class="text-xs text-slate-500 font-medium mt-1">জেলা কাভারেজ</div>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div class="text-2xl sm:text-3xl font-bold text-purple-600" id="stat-requests">...</div>
          <div class="text-xs text-slate-500 font-medium mt-1">মোট রিকোয়েস্ট</div>
        </div>
      </div>
    </div>
  </header>

  <!-- Privacy Banner -->
  <section class="max-w-4xl mx-auto px-4 sm:px-6 -mt-4 relative z-10 w-full">
    <div class="bg-white rounded-2xl border border-rose-100 shadow-sm p-4 sm:p-5 flex items-start sm:items-center gap-3.5">
      <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      </div>
      <div class="text-xs sm:text-sm text-slate-600 leading-relaxed">
        <span class="font-bold text-slate-900 block text-sm">১০০% তথ্যের সুরক্ষা ও গোপনীয়তা নীতি</span>
        রক্তদাতাদের ব্যক্তিগত ফোন নম্বর ও তথ্যের অপব্যবহার রোধে পাবলিক হোম পেইজে কোনো নম্বর প্রদর্শিত হয় না। সকল তথ্য সুরক্ষিতভাবে অ্যাডমিন প্যানেল এবং টেলিগ্রামের মাধ্যমে শুধুমাত্র জরুরি প্রয়োজনেই যাচাইকৃত স্বেচ্ছাসেবকদের কাছে সরবরাহ করা হয়।
      </div>
    </div>
  </section>

  <!-- Blood Request Section -->
  <section id="request-section" class="max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
    <div class="bg-white rounded-3xl border border-rose-200 shadow-xl overflow-hidden">
      <div class="bg-gradient-to-r from-crimson-700 to-crimson-600 text-white p-6 sm:p-8">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div>
            <h2 class="text-xl sm:text-2xl font-bold tracking-tight">জরুরি রক্তের রিকোয়েস্ট পাঠান</h2>
            <p class="text-rose-100 text-xs sm:text-sm mt-0.5">রোগীর রক্তের প্রয়োজন ও আবেদনকারীর তথ্য দিন — অ্যাডমিন ও টেলিগ্রামে তাৎক্ষণিক অ্যালার্ট যাবে।</p>
          </div>
        </div>
      </div>

      <form id="blood-request-form" onsubmit="submitBloodRequest(event)" class="p-6 sm:p-8 space-y-6">
        <div id="request-alert-box" class="hidden p-4 rounded-xl text-sm font-medium"></div>

        <!-- Section 1: Patient Information -->
        <div class="p-5 rounded-2xl bg-rose-50/40 border border-rose-100 space-y-4">
          <div class="flex items-center gap-2 pb-2 border-b border-rose-200/60">
            <span class="w-6 h-6 rounded-full bg-crimson-600 text-white text-xs font-bold flex items-center justify-center">১</span>
            <h3 class="text-sm font-bold text-slate-900">রোগীর তথ্য ও রক্তের চাহিদা</h3>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">রোগীর পুরো নাম *</label>
              <input type="text" id="req-patient-name" required placeholder="উদাঃ মোঃ শফিকুল ইসলাম" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">রোগীর প্রয়োজনীয় রক্তের গ্রুপ *</label>
              <select id="req-patient-blood-group" required class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm font-semibold bg-white transition">
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
              <input type="number" id="req-units" min="1" max="10" value="1" required class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">জেলা (হাসপাতালের জেলা) *</label>
              <input type="text" id="req-district" required placeholder="উদাঃ ঢাকা" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">রক্ত কখন প্রয়োজন? *</label>
              <input type="text" id="req-needed-by" required placeholder="উদাঃ আজ বিকাল ৪টায় / জরুরি" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">হাসপাতালের নাম ও ওয়ার্ড/কেবিন নম্বর *</label>
              <input type="text" id="req-hospital" required placeholder="উদাঃ ঢাকা মেডিকেল কলেজ হাসপাতাল" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">হাসপাতালের ঠিকানা / এলাকা *</label>
              <input type="text" id="req-location" required placeholder="উদাঃ চাঁনখারপুল, ঢাকা" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition">
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">রোগীর সমস্যা / বিশেষ নোট (ঐচ্ছিক)</label>
            <textarea id="req-note" rows="2" placeholder="রোগীর অপারেশনের বিবরণ বা বিশেষ নির্দেশনা..." class="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition"></textarea>
          </div>
        </div>

        <!-- Section 2: Applicant / Representative Information (Future Donor Registration) -->
        <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
          <div class="flex items-center gap-2 pb-2 border-b border-slate-200">
            <span class="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">২</span>
            <div>
              <h3 class="text-sm font-bold text-slate-900">আবেদনকারী / রোগীর প্রতিনিধির তথ্য</h3>
              <p class="text-[11px] text-slate-500">রোগীর প্রতিনিধি হিসেবে আপনার তথ্য ডোনার তালিকায় সংরক্ষিত হবে (রোগীকে ডোনার করা হবে না)।</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার নাম (রোগীর স্বজন / প্রতিনিধি) *</label>
              <input type="text" id="req-applicant-name" required placeholder="আপনার পুরো নাম লিখুন" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm bg-white transition">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার মোবাইল নম্বর (১১ ডিজিট) *</label>
              <input type="tel" id="req-phone" required placeholder="01XXXXXXXXX" pattern="[0-9]{11}" class="w-full h-11 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-crimson-500 outline-none text-sm font-mono bg-white transition">
              <span class="text-[11px] text-slate-400 mt-0.5 block">বিগত ২৪ ঘণ্টায় একই নম্বর থেকে একাধিক রিকোয়েস্ট পাঠানো নিষেধ।</span>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold text-crimson-700 mb-1">আপনার নিজস্ব রক্তের গ্রুপ *</label>
              <select id="req-applicant-blood-group" required class="w-full h-10 px-2.5 rounded-lg border-2 border-crimson-200 focus:ring-2 focus:ring-crimson-500 outline-none text-xs font-bold bg-white transition">
                <option value="">আপনার রক্তের গ্রুপ</option>
                <option value="A+">A+</option><option value="A-">A-</option>
                <option value="B+">B+</option><option value="B-">B-</option>
                <option value="AB+">AB+</option><option value="AB-">AB-</option>
                <option value="O+">O+</option><option value="O-">O-</option>
              </select>
              <span class="text-[10px] text-slate-500 block mt-0.5">রোগীর রক্তের গ্রুপ নয়, আপনার নিজের গ্রুপ</span>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার বয়স *</label>
              <input type="number" id="req-applicant-age" min="18" max="65" value="26" required class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs bg-white">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার লিঙ্গ *</label>
              <select id="req-applicant-gender" class="w-full h-10 px-2.5 rounded-lg border border-slate-200 text-xs bg-white">
                <option value="Male">পুরুষ</option><option value="Female">নারী</option><option value="Other">অন্যান্য</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার জেলা *</label>
              <input type="text" id="req-applicant-district" required placeholder="উদাঃ ঢাকা" class="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">আপনার উপজেলা / এলাকা *</label>
              <input type="text" id="req-applicant-area" required placeholder="উদাঃ মিরপুর / ধানমন্ডি" class="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white">
            </div>
          </div>
        </div>

        <div class="space-y-3 pt-2">
          <label class="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" id="req-agree-1" required class="mt-1 w-4 h-4 rounded text-crimson-600 focus:ring-crimson-500 border-slate-300">
            <span class="text-xs sm:text-sm text-slate-700 font-medium group-hover:text-slate-900">১. ভবিষ্যতে কারো রক্ত লাগলে আমি রক্ত দেয়ার চেষ্টা করবো।</span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer group">
            <input type="checkbox" id="req-agree-2" required class="mt-1 w-4 h-4 rounded text-crimson-600 focus:ring-crimson-500 border-slate-300">
            <span class="text-xs sm:text-sm text-slate-700 font-medium group-hover:text-slate-900">২. আবেদনকারী হিসেবে আমার নিজের তথ্য রক্তদাতা তালিকায় সংরক্ষণ করতে সম্মতি দিচ্ছি।</span>
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

  <!-- Donor Registration Modal -->
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
      <p class="max-w-md mx-auto text-slate-500">স্বেচ্ছাসেবী রক্তদান উদ্যোগ। রক্তদাতার ব্যক্তিগত তথ্যের নিরাপত্তা ও গোপনীয়তা বজায় রেখে পরিচালিত।</p>
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
        // Patient details
        patient_name: document.getElementById('req-patient-name').value,
        blood_group: document.getElementById('req-patient-blood-group').value,
        units: parseInt(document.getElementById('req-units').value, 10),
        district: document.getElementById('req-district').value,
        needed_by: document.getElementById('req-needed-by').value,
        hospital_name: document.getElementById('req-hospital').value,
        location: document.getElementById('req-location').value,
        note: document.getElementById('req-note').value,
        
        // Requester/Representative details (who will be registered as donor)
        requester_name: document.getElementById('req-applicant-name').value,
        contact_phone: document.getElementById('req-phone').value,
        requester_blood_group: document.getElementById('req-applicant-blood-group').value,
        requester_age: parseInt(document.getElementById('req-applicant-age').value, 10),
        requester_gender: document.getElementById('req-applicant-gender').value,
        requester_district: document.getElementById('req-applicant-district').value,
        requester_area: document.getElementById('req-applicant-area').value,
        
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
        alertBox.innerHTML = '<strong>সফল!</strong> ' + (data.message || 'আপনার রক্তের রিকোয়েস্ট সফলভাবে গ্রহণ করা হয়েছে।') + '<br><span class="text-xs text-emerald-700 mt-1 block">আমাদের অ্যাডমিন প্যানেল ও টেলিগ্রাম অ্যালার্টে রিকোয়েস্টটি পাঠানো হয়েছে। দ্রুত রক্তদাতা সমন্বয় করা হচ্ছে।</span>';
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
    });
  </script>
</body>
</html>`;
