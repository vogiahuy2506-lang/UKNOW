/**
 * Tiện ích gửi dữ liệu landing lead sang Google Sheets thông qua webhook.
 *
 * Thiết kế:
 * - Không yêu cầu Google API key hay OAuth (key trong HTML phía client rất dễ bị lộ).
 * - Admin tạo một Google Apps Script (GAS) Web App với URL `exec` riêng,
 *   paste URL đó vào cấu hình landing page (customConfig.googleSheetsWebhookUrl).
 * - Khi có lead mới, backend POST dữ liệu dạng JSON tới URL đó; GAS phía Google xử lý ghi vào Sheet.
 * - Đảm bảo GAS deployment được cấu hình "Execute as: Me", "Who has access: Anyone"
 *   để UKNOW backend có thể gọi mà không cần xác thực.
 *
 * Lưu ý vận hành:
 * - Best-effort: nếu sync thất bại, KHÔNG chặn flow đăng ký lead (tránh ảnh hưởng UX).
 * - Lỗi sync được log để admin debug.
 *
 * Chống SSRF (webhook bắn ra từ lượt gửi lead công khai): chỉ https tới host có IP công khai, kết nối
 * ghim IP đã kiểm, redirect kiểm lại từng chặng. Ngoại lệ http://localhost / 127.0.0.1 chỉ tồn tại
 * khi NODE_ENV khác 'production' (dev test với GAS giả lập).
 */

import { isSsrfBlockedError, safeHttpRequest } from './ssrfGuard.util.js';

const TIMEOUT_MS = 10_000;
/** Phản hồi của GAS không được dùng — chỉ đọc tối đa chừng này rồi bỏ. */
const MAX_RESPONSE_BYTES = 1024 * 1024;

function isLocalDevWebhookHost(hostname) {
  return process.env.NODE_ENV !== 'production' && (hostname === 'localhost' || hostname === '127.0.0.1');
}

/**
 * Lấy cấu hình Google Sheets sync từ customConfig của landing page.
 * Trả về null nếu chưa bật.
 *
 * @param {object|null|undefined} customConfig
 * @returns {{ webhookUrl: string, sheetName?: string } | null}
 */
export function extractGoogleSheetsSyncConfig(customConfig) {
  if (!customConfig || typeof customConfig !== 'object') return null;
  const cfg = customConfig.googleSheetsSync || customConfig.sheetsSync;
  if (!cfg || typeof cfg !== 'object') return null;
  const enabled = cfg.enabled === true || cfg.enabled === 'true' || cfg.enabled === 1;
  if (!enabled) return null;
  const webhookUrl = String(cfg.webhookUrl || cfg.url || '').trim();
  if (!webhookUrl) return null;
  let safeUrl = webhookUrl;
  try {
    const u = new URL(webhookUrl);
    // Chỉ chấp nhận HTTPS (Google Apps Script luôn HTTPS); localhost chỉ cho môi trường dev/test.
    const isLocal = isLocalDevWebhookHost(u.hostname);
    if (u.protocol !== 'https:' && !(isLocal && u.protocol === 'http:')) return null;
    if (u.username || u.password) return null;
    safeUrl = u.toString();
  } catch {
    return null;
  }
  const sheetName = String(cfg.sheetName || cfg.tabName || '').trim() || undefined;
  return { webhookUrl: safeUrl, sheetName };
}

/**
 * Chuẩn hóa payload gửi sang GAS - giữ schema ổn định, dễ đọc trong Sheet.
 *
 * @param {object} lead  - lead row từ DB
 * @param {object} meta  - { landingPageSlug, landingPageTitle? }
 * @returns {object}
 */
export function buildGoogleSheetsPayload(lead, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    slug: meta.landingPageSlug || lead.landingPageSlug || '',
    landingTitle: meta.landingPageTitle || '',
    lastName: lead.lastName || lead.last_name || '',
    firstName: lead.firstName || lead.first_name || '',
    fullName: `${lead.lastName || lead.last_name || ''} ${lead.firstName || lead.first_name || ''}`.trim(),
    email: lead.email || '',
    phone: lead.phone || '',
    occupation: lead.occupation || '',
    interestArea: lead.interestArea || lead.interest_area || '',
    marketingConsent: (lead.marketingConsent ?? lead.marketing_consent) === null || (lead.marketingConsent ?? lead.marketing_consent) === undefined
      ? null
      : Boolean(lead.marketingConsent ?? lead.marketing_consent),
    utmSource: lead.utmSource || lead.utm_source || '',
    utmMedium: lead.utmMedium || lead.utm_medium || '',
    utmCampaign: lead.utmCampaign || lead.utm_campaign || '',
    utmContent: lead.utmContent || lead.utm_content || '',
    utmTerm: lead.utmTerm || lead.utm_term || '',
    customFields: lead.customFields || lead.custom_fields || {},
    leadId: lead.id ?? lead.leadId ?? null,
  };
}

/**
 * Gửi dữ liệu lead sang Google Sheets thông qua GAS webhook.
 * Best-effort: throw error nếu thất bại, caller tự quyết định có rollback hay không.
 *
 * @param {{ webhookUrl: string, sheetName?: string }} cfg
 * @param {object} payload
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function appendLeadToGoogleSheet(cfg, payload) {
  if (!cfg || !cfg.webhookUrl) {
    return { ok: false, error: 'missing webhookUrl' };
  }
  try {
    // Kiểm lại lúc gửi (URL có thể đã được lưu trước khi có kiểm tra, hoặc qua đường ghi khác).
    const safeCfg = extractGoogleSheetsSyncConfig({
      googleSheetsSync: { enabled: true, webhookUrl: cfg.webhookUrl },
    });
    if (!safeCfg) {
      return { ok: false, error: 'Webhook URL không hợp lệ (chỉ chấp nhận https)' };
    }
    const target = new URL(safeCfg.webhookUrl);
    const body = { ...payload };
    if (cfg.sheetName) body.sheetName = cfg.sheetName;
    // GAS trả 302 sang script.googleusercontent.com sau khi doPost chạy → theo redirect (POST→GET).
    const response = await safeHttpRequest(target, {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 3,
      allowLoopback: isLocalDevWebhookHost(target.hostname),
    });
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status };
    }
    return {
      ok: false,
      status: response.status,
      error: `GAS webhook trả về ${response.status}`,
    };
  } catch (err) {
    if (isSsrfBlockedError(err)) {
      return { ok: false, error: 'Webhook URL trỏ tới địa chỉ nội bộ — không được phép' };
    }
    return {
      ok: false,
      error: err?.message || 'Network error khi gọi GAS webhook',
    };
  }
}
