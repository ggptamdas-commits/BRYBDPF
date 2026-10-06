const base = (process.env.BASE_URL || 'https://brybdpf.pages.dev').replace(/\/$/, '');

const checks = [
  { name: 'homepage', path: '/', expect: r => r.status === 200 && r.text.includes('BRYBDPF') && r.text.includes('ওমান প্রবাসী') && !r.text.includes('ওমার প্রবাসী') },
  { name: 'single-page request form', path: '/', expect: r => r.status === 200 && ['req-patient-details', 'req-district', 'req-patient-blood-group', 'req-units', 'req-hemoglobin', 'req-needed-day', 'req-needed-month', 'req-needed-year', 'req-needed-time', 'req-location', 'req-reference-name', 'req-phone', 'captcha-question', 'captcha-answer'].every(id => r.text.includes(`id="${id}"`)) && !r.text.includes('req-patient-name') && !r.text.includes('ভবিষ্যৎ রক্তদাতা নিবন্ধন') && !r.text.includes('req-agree-2') && !r.text.includes('data-request-panel="2"') },
  { name: 'admin page', path: '/admin', expect: r => r.status === 200 && r.text.includes('অ্যাডমিন') },
  { name: 'public stats', path: '/api/stats', expect: r => r.status === 200 && Number.isFinite(r.json?.total_donors) },
  { name: 'database health', path: '/api/health', expect: r => r.status === 200 && r.json?.ok === true && r.json?.database === 'reachable' },
  { name: 'captcha', path: '/api/captcha', expect: r => r.status === 200 && r.json?.token && r.json?.question },
  { name: 'manifest', path: '/manifest.webmanifest', expect: r => r.status === 200 && r.json?.name && r.json?.start_url },
  { name: 'service worker', path: '/service-worker.js', expect: r => r.status === 200 && r.text.includes('brybdpf-shell-v2') && r.text.includes("url.pathname.startsWith('/api/')") },
  { name: 'admin protection', path: '/api/admin/data', expect: r => r.status === 401 && r.json?.error }
];

let failed = 0;
for (const check of checks) {
  try {
    const response = await fetch(`${base}${check.path}`, { headers: { Accept: 'application/json, text/plain, */*' } });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    const result = { status: response.status, text, json };
    if (!check.expect(result)) throw new Error(`unexpected response (HTTP ${response.status})`);
    console.log(`PASS  ${check.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${check.name}: ${error.message}`);
  }
}

if (failed) {
  console.error(`${failed} smoke check(s) failed for ${base}`);
  process.exit(1);
}
console.log(`All ${checks.length} non-destructive smoke checks passed for ${base}`);
