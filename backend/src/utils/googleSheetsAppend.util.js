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
 */

import axios from 'axios';

const TIMEOUT_MS = 10_000;

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
    // Chỉ chấp nhận HTTPS (Google Apps Script luôn HTTPS) hoặc localhost dev
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !isLocal) return null;
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
    marketingConsent: Boolean(lead.marketingConsent ?? lead.marketing_consent),
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
    const body = { ...payload };
    if (cfg.sheetName) body.sheetName = cfg.sheetName;
    const response = await axios.post(cfg.webhookUrl, body, {
      timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
      maxRedirects: 3,
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
    return {
      ok: false,
      error: err?.message || 'Network error khi gọi GAS webhook',
    };
  }
}
