/**
 * Low-level Mat Bao HDDT HTTP client (login + create-invoice + PDF download).
 * Token cached ~23h; re-login on 401.
 *
 * PDF download response shape varies by Mat Bao API generation:
 * - base64 fields (data_PDF_Base64, …)
 * - link fields (link_file, urlDownloadPDF, …) fetched server-side
 * Path override: MATBAO_HDDT_DOWNLOAD_PATH (default /api/invoice/download-invoice).
 * Demo fixture confirmation remains a production rollout gate.
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

function getTimeoutMs() {
  const n = Number(process.env.MATBAO_HDDT_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30000;
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

async function fetchWithTimeout(url, options = {}, timeoutMs = getTimeoutMs()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function matbaoLogin({ force = false } = {}) {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const { baseUrl, mst, user, pass } = getConfig();
  if (!baseUrl || !mst || !user || !pass) {
    throw new Error('Mat Bao HDDT chưa cấu hình (BASE_URL/MST/USER/PASS)');
  }

  const res = await fetchWithTimeout(`${baseUrl}/api/auth/login`, {
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

async function authorizedFetch(path, {
  method = 'GET',
  body = undefined,
  retried = false,
  timeoutMs = getTimeoutMs(),
} = {}) {
  const { baseUrl } = getConfig();
  const token = await matbaoLogin();
  let res;
  try {
    res = await fetchWithTimeout(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    }, timeoutMs);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Mat Bao request timeout after ${timeoutMs}ms (${path})`);
    }
    throw err;
  }

  if (res.status === 401 && !retried) {
    await matbaoLogin({ force: true });
    return authorizedFetch(path, { method, body, retried: true, timeoutMs });
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

const MAX_PDF_BYTES = Number(process.env.MATBAO_PDF_MAX_BYTES) || 10 * 1024 * 1024;
const MAX_PDF_REDIRECTS = 3;
const DEFAULT_PDF_HOST_SUFFIXES = ['matbao.in'];

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.+$/, '');
}

function isIpLiteral(hostname) {
  const h = String(hostname || '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(':')) return true;
  return false;
}

function hostMatchesSuffix(hostname, suffix) {
  const host = normalizeHostname(hostname);
  const suf = normalizeHostname(suffix);
  if (!host || !suf) return false;
  return host === suf || host.endsWith(`.${suf}`);
}

/** Hosts we may fetch PDF from (Mat Bao + configured API host). Exported for tests. */
export function getMatbaoPdfHostAllowlist() {
  const hosts = new Set();
  for (const suffix of DEFAULT_PDF_HOST_SUFFIXES) hosts.add(suffix);

  const baseUrl = String(process.env.MATBAO_HDDT_BASE_URL || '').trim();
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      const host = normalizeHostname(parsed.hostname);
      if (host && !isIpLiteral(host)) hosts.add(host);
    } catch {
      // ignore invalid BASE_URL
    }
  }

  const extra = String(process.env.MATBAO_HDDT_PDF_HOST_ALLOWLIST || '');
  for (const part of extra.split(',')) {
    const host = normalizeHostname(part);
    if (host && !isIpLiteral(host)) hosts.add(host);
  }
  return [...hosts];
}

export function isAllowedMatbaoPdfHost(hostname) {
  const host = normalizeHostname(hostname);
  if (!host || isIpLiteral(host)) return false;
  return getMatbaoPdfHostAllowlist().some((allowed) => hostMatchesSuffix(host, allowed));
}

/**
 * HTTPS + Mat Bao host allowlist. Rejects IP literals, credentials, and non-443 ports.
 * @returns {URL}
 */
export function assertAllowedMatbaoPdfUrl(rawUrl, label = 'Mat Bao PDF URL') {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error(`${label}: URL không hợp lệ`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label}: chỉ cho phép https`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label}: không chấp nhận URL có credentials`);
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error(`${label}: chỉ cho phép cổng 443`);
  }
  if (!isAllowedMatbaoPdfHost(parsed.hostname)) {
    throw new Error(`${label}: hostname không nằm trong allowlist Mắt Bão`);
  }
  return parsed;
}

/** Exported for unit tests. */
export function extractPdfBase64(body) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [
    body.data_PDF_Base64,
    body.data_pdf_base64,
    body.Data_PDF_Base64,
    body?.data?.data_PDF_Base64,
    body?.data?.pdfBase64,
    body?.data?.PDFBase64,
    body?.Data?.data_PDF_Base64,
    body?.result?.data_PDF_Base64,
    typeof body.Data === 'string' ? body.Data : null,
    typeof body.data === 'string' ? body.data : null,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/** Exported for unit tests — link_file / urlDownloadPDF style responses. */
export function extractPdfLink(body) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [
    body.link_file,
    body.Link_File,
    body.linkFile,
    body.urlDownloadPDF,
    body.UrlDownloadPDF,
    body?.data?.link_file,
    body?.data?.Link_File,
    body?.data?.linkFile,
    body?.data?.urlDownloadPDF,
    body?.Data?.link_file,
    body?.result?.link_file,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) return c.trim();
  }
  return null;
}

function assertPdfBuffer(buffer, label) {
  if (!buffer.length || buffer.length > MAX_PDF_BYTES) {
    throw new Error(`${label}: kích thước PDF không hợp lệ (${buffer.length})`);
  }
  if (buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
    throw new Error(`${label}: nội dung không phải PDF`);
  }
}

function bufferFromBase64(b64, label) {
  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    throw new Error(`${label}: base64 không hợp lệ`);
  }
  assertPdfBuffer(buffer, label);
  return buffer;
}

async function fetchPdfFromUrl(url, label = 'Mat Bao PDF URL') {
  let current = assertAllowedMatbaoPdfUrl(url, label).toString();

  for (let hop = 0; hop <= MAX_PDF_REDIRECTS; hop += 1) {
    const res = await fetchWithTimeout(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/pdf,application/octet-stream,*/*' },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers?.get?.('location');
      if (!loc) {
        throw new Error(`${label}: redirect thiếu Location`);
      }
      let next;
      try {
        next = new URL(loc, current);
      } catch {
        throw new Error(`${label}: Location redirect không hợp lệ`);
      }
      current = assertAllowedMatbaoPdfUrl(next.toString(), `${label} (redirect)`).toString();
      continue;
    }

    if (!res.ok) {
      throw new Error(`${label}: HTTP ${res.status}`);
    }
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    assertPdfBuffer(buffer, label);
    return buffer;
  }

  throw new Error(`${label}: quá nhiều redirect`);
}

function downloadPath() {
  const p = String(process.env.MATBAO_HDDT_DOWNLOAD_PATH || '/api/invoice/download-invoice').trim();
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * Download invoice PDF via Mat Bao API (and optional stored pdfUrl fallback).
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function matbaoDownloadInvoicePdf({ maTraCuu, maSoHdon, pdfUrl } = {}) {
  if (!maTraCuu && !maSoHdon && !pdfUrl) {
    throw new Error('Thiếu maTraCuu/maSoHdon/pdfUrl để tải PDF');
  }

  let apiError = null;
  if (maTraCuu || maSoHdon) {
    try {
      const api = await authorizedFetch(downloadPath(), {
        method: 'POST',
        body: {
          MaTraCuu: maTraCuu || undefined,
          MaSoHDon: maSoHdon || undefined,
          maTraCuu: maTraCuu || undefined,
          maSoHdon: maSoHdon || undefined,
        },
      });
      if (!api.ok) {
        const msg = api.body?.message || api.body?.errorMessage || api.status;
        apiError = new Error(`Mat Bao download-invoice HTTP ${api.status}: ${msg}`);
      } else {
        const b64 = extractPdfBase64(api.body);
        if (b64) {
          return {
            buffer: bufferFromBase64(b64, 'Mat Bao download-invoice'),
            contentType: 'application/pdf',
          };
        }
        const link = extractPdfLink(api.body);
        if (link) {
          return {
            buffer: await fetchPdfFromUrl(link, 'Mat Bao download link_file'),
            contentType: 'application/pdf',
          };
        }
        apiError = new Error('Mat Bao download-invoice: thiếu data_PDF_Base64/link_file');
      }
    } catch (err) {
      apiError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (typeof pdfUrl === 'string' && pdfUrl.trim()) {
    return {
      buffer: await fetchPdfFromUrl(pdfUrl.trim(), 'Mat Bao pdf_url fallback'),
      contentType: 'application/pdf',
    };
  }

  throw apiError || new Error('Mat Bao download-invoice failed');
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
    || inner.link_file
    || item.urlDownloadPDF
    || item.link_file
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
