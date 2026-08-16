function enabled(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function validateInvoiceEnv(env = process.env) {
  if (!enabled(env.INVOICE_VAT_ENABLED)) return;

  const missing = [];
  if (!enabled(env.MATBAO_EINVOICE_WORKER_ENABLED)) {
    missing.push('MATBAO_EINVOICE_WORKER_ENABLED');
  }

  const requiredCredentials = [
    'MATBAO_HDDT_BASE_URL',
    'MATBAO_HDDT_MST',
    'MATBAO_HDDT_USER',
    'MATBAO_HDDT_PASS',
    'MATBAO_HDDT_KHHDON',
  ];

  for (const key of requiredCredentials) {
    if (!String(env[key] || '').trim()) {
      missing.push(key);
    }
  }

  if (missing.length) {
    throw new Error(
      `INVOICE_VAT_ENABLED=true requires Mat Bao e-invoice worker and credentials: ${missing.join(', ')}`
    );
  }
}
