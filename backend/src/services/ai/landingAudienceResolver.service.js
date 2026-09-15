import aiCampaignRepository from '../../repositories/ai/aiCampaign.repository.js';

/**
 * PR-5b-2b (`PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md`, "Bổ sung 15/09 khi soạn lệnh
 * PR-5b-2", "Neo PR-5b-2b") — "gửi cho người đăng ký landing X" nên đọc node nào: landing X có
 * Biểu mẫu gắn (PR-5b-2a `forms.landing_page_id`, form chưa bị super admin tắt) thì đọc
 * `read_form_submissions` (đúng `formId` đó); landing X KHÔNG có form gắn thì giữ nguyên
 * `read_landing_leads` — nếu đổi bừa sang form thì campaign chạy trên node đọc landing vẫn
 * đúng, còn đổi landing dựng bằng Biểu mẫu mà không đổi thì node cũ đọc bảng `leads` trong khi
 * người đăng ký thật nằm ở `form_submissions` → 0 người nhận trong im lặng, đúng lỗ mà PR-5b-2b
 * bịt.
 *
 * Phản biện plan (15/09): nhiều slug mà chỉ MỘT số có form gắn → mặc định GIỮ NGUYÊN
 * `read_landing_leads`, không đổi gì (trả `null`) — chỉ đổi khi audience có ĐÚNG MỘT slug. Lý do:
 * đổi một phần (tách thành 2 node audience, hoặc chỉ gộp riêng slug có form) làm khác hẳn SỐ
 * NODE/cấu trúc graph so với bản người dùng đã thấy và duyệt trước đó (wizard/bản nháp một node
 * audience duy nhất) — rủi ro làm hỏng một chiến dịch nhiều-landing đang chạy tốt cao hơn giá trị
 * mang lại cho ca hiếm (nhiều landing cùng lúc, một phần dựng bằng Biểu mẫu).
 *
 * Dùng CHUNG cho cả hai nơi cần quyết định này: đường ý định (trước `compileCampaign`,
 * `aiCampaign.service.js`) và vá bản nháp tự do (`aiCampaignDraft.service.js`, cạnh
 * `sanitizeFormOwnership`) — một chỗ quyết định duy nhất, không lặp logic "đúng 1 slug" ở hai nơi
 * rồi lệch nhau.
 *
 * @param {number} ownerId workspace owner id (chủ workspace, KHÔNG phải id người đang thao tác —
 *   xem PR-6c review 15/09 về bẫy này)
 * @param {string[]|null|undefined} slugs
 * @returns {Promise<number|null>} formId nếu nên đổi sang `read_form_submissions`; `null` nếu giữ
 *   nguyên `read_landing_leads` (0/nhiều slug, slug rỗng, landing không có form gắn, hoặc lỗi tra
 *   cứu — fail-safe về hành vi cũ, không phải fail-open sang form)
 */
export async function resolveLandingAudienceToForm(ownerId, slugs) {
  if (!Array.isArray(slugs) || slugs.length !== 1) return null;
  const slug = String(slugs[0] || '').trim();
  const owner = Number(ownerId);
  if (!slug || !Number.isFinite(owner)) return null;
  try {
    return await aiCampaignRepository.getFormIdForLandingSlug(owner, slug);
  } catch (e) {
    console.warn('[AI] Không tra được form gắn landing, giữ read_landing_leads:', e.message);
    return null;
  }
}

/**
 * Áp `resolveLandingAudienceToForm` lên một CampaignIntentV1: `audience.type === 'landing'` và
 * slug đó có form gắn → trả intent MỚI với `audience: { type: 'form', formId, recipientKind }`
 * (giữ nguyên `recipientKind`); mọi trường hợp khác (không phải landing, không đổi được) → trả
 * NGUYÊN `intent` (cùng reference, không tạo bản sao thừa khi không có gì đổi).
 *
 * Tách khỏi call site `compileCampaign` trong `aiCampaign.service.js` để test trực tiếp
 * intent-vào → intent-ra mà không cần dựng cả pipeline chat.
 *
 * @param {object} intent CampaignIntentV1 (hoặc phần tương đương — chỉ cần có `.audience`)
 * @param {number} ownerId workspace owner id
 * @returns {Promise<object>} intent gốc hoặc intent đã đổi audience sang 'form'
 */
export async function applyLandingAudienceResolution(intent, ownerId) {
  if (intent?.audience?.type !== 'landing') return intent;
  const resolvedFormId = await resolveLandingAudienceToForm(ownerId, intent.audience.slugs);
  if (resolvedFormId == null) return intent;
  return {
    ...intent,
    audience: {
      type: 'form',
      formId: resolvedFormId,
      recipientKind: intent.audience.recipientKind,
    },
  };
}

export default { resolveLandingAudienceToForm, applyLandingAudienceResolution };
