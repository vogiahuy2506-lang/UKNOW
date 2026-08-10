/**
 * Low-level Mat Bao HDDT HTTP client (login + create-invoice).
 * Token cached ~23h; re-login on 401.
 */

const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

/** @type {{ token: string, expiresAt: number } | null} */
let cachedToken = null;

export function _resetMatbaoTokenCacheForTests() {
  cachedToken = null;
}

function getConfig() {
  const baseUrl = String(process.env.MATBAO_HDDT_BASE_URL || '').replace(/\/$/, '');
  const mst = String(process.env.MATBAO_HDDT_MST || '').trim();
  const user = String(process.env.MATBAO_HDDT_USER || '').trim();
  const pass = String(process.env.MATBAO_HDDT_PASS || '');
  const khmshdon = String(process.env.MATBAO_HDDT_KHMSHDON || '1').trim();
  const khhdon = String(process.env.MATBAO_HDDT_KHHDON || '').trim();
  return { baseUrl, mst, user, pass, khmshdon, khhdon };
}

export function isMatbaoConfigured() {
  const { baseUrl, mst, user, pass, khhdon } = getConfig();
  return Boolean(baseUrl && mst && user && pass && khhdon);
}

export function getMatbaoSeriesConfig() {
  const { khmshdon, khhdon } = getConfig();
  return { khmshdon, khhdon };
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractAccessToken(body) {
  if (!body || typeof body !== 'object') return null;
  return (
    body.accessToken
    || body.access_token
    || body?.data?.accessToken
    || body?.data?.access_token
    || body?.Data?.accessToken
    || body?.result?.accessToken
    || null
  );
}

export async function matbaoLogin({ force = false } = {}) {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const { baseUrl, mst, user, pass } = getConfig();
  if (!baseUrl || !mst || !user || !pass) {
    throw new Error('Mat Bao HDDT chưa cấu hình (BASE_URL/MST/USER/PASS)');
  }

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ MST: mst, TDNhap: user, MKhau: pass }),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = body?.message || body?.errorMessage || body?.ErrorMessage || res.statusText;
    throw new Error(`Mat Bao login HTTP ${res.status}: ${msg}`);
  }
  const token = extractAccessToken(body);
  if (!token) {
    throw new Error('Mat Bao login: không có accessToken trong response');
  }
  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function authorizedFetch(path, { method = 'GET', body = undefined, retried = false } = {}) {
  const { baseUrl } = getConfig();
  const token = await matbaoLogin();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !retried) {
    await matbaoLogin({ force: true });
    return authorizedFetch(path, { method, body, retried: true });
  }

  const parsed = await parseJsonSafe(res);
  return { ok: res.ok, status: res.status, body: parsed };
}

/**
 * @param {object[]} invoices — array payload for create-invoice
 */
export async function matbaoCreateInvoices(invoices) {
  return authorizedFetch('/api/invoice/create-invoice', {
    method: 'POST',
    body: invoices,
  });
}

export async function matbaoListTemplates(year = new Date().getFullYear()) {
  return authorizedFetch(`/api/invoice/templates?year=${encodeURIComponent(year)}`, {
    method: 'GET',
  });
}

/**
 * Normalize per-item result from create-invoice response.
 * Real Mat Bao shape (Postman demo):
 *   data: [ { errorCode: 200, data: { maSoHDon, shDon, urlDownloadPDF } } ]
 * Flat fields on the outer item are fallbacks only.
 */
export function parseCreateInvoiceItemResult(apiBody) {
  const list = apiBody?.data
    || apiBody?.Data
    || apiBody?.result
    || (Array.isArray(apiBody) ? apiBody : null);

  const item = Array.isArray(list) ? list[0] : (list && typeof list === 'object' ? list : null);
  if (!item) {
    const outerCode = apiBody?.errorCode ?? apiBody?.ErrorCode ?? apiBody?.code;
    return {
      errorCode: outerCode != null ? String(outerCode) : 'unknown',
      errorMessage: apiBody?.errorMessage || apiBody?.ErrorMessage || apiBody?.message || 'Empty create-invoice data',
      maSoHdon: null,
      soHdon: null,
      pdfUrl: null,
      raw: apiBody,
    };
  }

  const inner = (item.data && typeof item.data === 'object')
    ? item.data
    : ((item.Data && typeof item.Data === 'object') ? item.Data : {});

  const errorCode = item.errorCode ?? item.ErrorCode ?? item.code ?? 200;
  const maSoHdon = inner.maSoHDon
    || inner.MaSoHDon
    || item.maSoHDon
    || item.MaSoHDon
    || item.ma_so_hdon
    || null;
  const soRaw = inner.shDon ?? inner.SHDon ?? inner.soHDon
    ?? item.shDon ?? item.SHDon ?? item.soHDon ?? item.so_hdon;
  const pdfUrl = inner.urlDownloadPDF
    || inner.UrlDownloadPDF
    || inner.url_download_pdf
    || item.urlDownloadPDF
    || null;

  return {
    errorCode: String(errorCode),
    errorMessage: item.errorMessage || item.ErrorMessage || item.message || null,
    maSoHdon: maSoHdon != null ? String(maSoHdon) : null,
    soHdon: soRaw != null && soRaw !== '' ? String(soRaw) : null,
    pdfUrl: pdfUrl != null ? String(pdfUrl) : null,
    raw: item,
  };
}
