const fetchFn = globalThis.fetch;

async function test() {
  try {
    // 1. Check form config
    const cfg = await fetchFn('http://localhost:5174/api/public/landing-pages/123456/form-config');
    console.log('Form config status:', cfg.status);
    const cfgData = await cfg.json();
    console.log('Form config:', JSON.stringify(cfgData, null, 2));

    // 2. Submit via the same URL the embed form would use
    const r = await fetchFn('http://localhost:5174/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Embed',
        lastName: 'Test',
        email: 'embed-test@example.com',
        phone: '0909991111',
        occupation: 'Giáo viên',
        interestArea: 'AI cho Giáo dục',
        marketingConsent: true,
        landingPageSlug: '123456',
      }),
    });
    console.log('\nSubmit via /api prefix status:', r.status);
    const body = await r.text();
    console.log('Submit body:', body);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
