/**
 * Soi form `<form data-founderai-capture>` trong HTML landing, đối chiếu tên các ô (`name=`)
 * với `leadFormConfig.customFields` đã khai báo ở Cài đặt trang → Form đăng ký.
 *
 * Câu hỏi sếp 14/09 ("dữ liệu điền vào form sẽ lưu về chỗ nào?"): đo thật trên
 * `checkform.founderai.biz` cho thấy 5/8 ô (Chức vụ, Đơn vị công tác, Phương án họp, Khung giờ
 * hẹn, Câu hỏi) không lưu ở đâu cả — `buildTrustedCustomFieldsSnapshot`
 * (`landingLeadFormConfig.util.js`) âm thầm bỏ qua mọi khoá không khớp schema đã khai báo (chỉ
 * `console.warn`, không báo cho chủ trang). Hàm ở đây CHỈ soi để cảnh báo lúc lưu landing — không
 * tự sửa HTML, không chặn lưu (chuyên mục/form rỗng hay có ô lạ vẫn là trạng thái tạm hợp lệ).
 *
 * Không phải HTML parser thật (đủ cho phạm vi hẹp: form đơn giản do AI sinh hoặc admin dán tay) —
 * quét bằng regex trong ĐÚNG đoạn `<form ... data-founderai-capture ...>...</form>` ĐẦU TIÊN,
 * KHÔNG soi cả trang: landing khách hay có form tìm kiếm/đăng ký bản tin khác không liên quan tới
 * lead capture, soi cả trang sẽ báo động giả cho những form đó.
 */
import { normalizePersistedLeadForm } from './landingLeadFormConfig.util.js';

/**
 * Tên cố định KHÔNG phải customFields — khớp đúng payload thật `founderai-capture.js` gửi lên
 * và `lead.service.js` `createPublicLead` chấp nhận. LƯU Ý: là `interestArea` (camelCase), không
 * phải `interest_area` — xem chú thích đầu file `founderai-capture.js` và `lead.service.js`
 * `mapLeadRowToCampaignItem`/`createPublicLead`.
 */
export const FIXED_CAPTURE_FIELD_NAMES = Object.freeze(
  new Set(['name', 'email', 'phone', 'marketingConsent', 'landingPageSlug', 'occupation', 'interestArea'])
);

const CAPTURE_FORM_RE = /<form\b[^>]*\bdata-founderai-capture\b[^>]*>([\s\S]*?)<\/form>/i;
const NAMED_CONTROL_RE = /<(?:input|select|textarea)\b[^>]*\bname\s*=\s*(["'])([^"']*)\1/gi;

/**
 * Tìm form `data-founderai-capture` ĐẦU TIÊN trong HTML — cùng một quy tắc "form nào" cho mọi
 * nơi cần soi/sửa bên trong nó (`auditLandingCaptureFields` ở đây, và
 * `landingCaptureFieldAutoDeclare.util.js`), tránh hai nơi tự viết lại regex rồi lệch nhau
 * (bẫy "quét cả trang" — landing khách hay có form tìm kiếm/đăng ký bản tin khác).
 *
 * @param {string} html
 * @returns {{ full: string, inner: string }|null} `full` = toàn bộ `<form>...</form>` khớp được
 *   (dùng để thay thế lại đúng vị trí trong HTML gốc); `inner` = nội dung bên trong, không gồm
 *   hai thẻ `<form>`/`</form>`.
 */
export function extractCaptureFormMatch(html) {
  const source = String(html || '');
  const match = source.match(CAPTURE_FORM_RE);
  return match ? { full: match[0], inner: match[1] } : null;
}

/**
 * @param {string} html HTML landing (thường là bản đã chuẩn bị để lưu — `prepareLandingHtmlOnSave`
 *   không đụng vào nội dung form nên soi trước/sau bước đó đều ra kết quả giống nhau).
 * @param {unknown} leadFormConfigOrCustomConfig `leadFormConfig` đã normalize HOẶC `custom_config`
 *   JSONB thô (`normalizePersistedLeadForm` tự bóc `leadForm` bên trong nếu cần) — caller không
 *   cần tự normalize trước.
 * @returns {{ unknownNames: string[], declaredMissing: string[] }} `unknownNames` = tên ô có
 *   trong form nhưng KHÔNG thuộc danh sách cố định và KHÔNG khớp customFields đã khai báo (dữ
 *   liệu các ô này sẽ bị bỏ qua lúc nhận bài nộp). `declaredMissing` = khoá ĐÃ khai báo nhưng
 *   HTML form đang thiếu (khách sẽ không thấy ô để điền). Cả hai đã khử trùng theo `name` (radio
 *   nhiều lựa chọn cùng `name` chỉ đếm một lần) và sắp xếp alphabet để kết quả ổn định.
 */
export function auditLandingCaptureFields(html, leadFormConfigOrCustomConfig) {
  const formMatch = extractCaptureFormMatch(html);
  if (!formMatch) return { unknownNames: [], declaredMissing: [] };

  const inner = formMatch.inner;
  const foundNames = new Set();
  NAMED_CONTROL_RE.lastIndex = 0;
  let m;
  while ((m = NAMED_CONTROL_RE.exec(inner))) {
    const name = m[2];
    if (name) foundNames.add(name);
  }

  const config = normalizePersistedLeadForm(leadFormConfigOrCustomConfig);
  const declaredKeys = new Set((config.customFields || []).map((f) => f.key));

  const unknownNames = [...foundNames]
    .filter((name) => !FIXED_CAPTURE_FIELD_NAMES.has(name) && !declaredKeys.has(name))
    .sort();
  const declaredMissing = [...declaredKeys]
    .filter((key) => !foundNames.has(key))
    .sort();

  return { unknownNames, declaredMissing };
}

/**
 * Dựng câu cảnh báo tiếng Việt từ kết quả `auditLandingCaptureFields`. Trả `null` khi không có gì
 * để báo (gọi trực tiếp cho `dto.warning`, caller tự gộp với cảnh báo khác nếu có — không ghi đè).
 *
 * @param {{ unknownNames?: string[], declaredMissing?: string[] }} audit
 * @returns {string|null}
 */
export function buildCaptureFieldAuditWarning({ unknownNames = [], declaredMissing = [] } = {}) {
  const parts = [];
  if (unknownNames.length > 0) {
    const label = unknownNames.length === 1 ? 'ô' : `${unknownNames.length} ô`;
    parts.push(
      `Form đăng ký có ${label} chưa khai báo (${unknownNames.join(', ')}) — dữ liệu khách điền vào ` +
      `SẼ KHÔNG được lưu. Hãy khai báo trong Cài đặt trang → Form đăng ký rồi nhờ AI đặt lại tên ô.`
    );
  }
  if (declaredMissing.length > 0) {
    const label = declaredMissing.length === 1 ? 'trường' : `${declaredMissing.length} trường`;
    parts.push(
      `Đã khai báo nhưng form đang thiếu ${label} (${declaredMissing.join(', ')}) — khách sẽ không ` +
      `thấy ô này để điền.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
