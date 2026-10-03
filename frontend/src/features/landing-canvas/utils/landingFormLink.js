/**
 * "Dùng biểu mẫu đã tạo" trong Cài đặt trang (PLAN_TEN_MIEN_RIENG_VA_BIEU_MAU_LIEN_KET_LANDING_2026-10-03.md, PR-F).
 *
 * Lựa chọn của người dùng nằm trong `form.linkedFormChoice` cho tới lúc bấm Lưu (không gọi API ngay):
 *   - `null`                                  → không đổi gì so với bản đã lưu;
 *   - `{ mode: 'basic' }`                     → quay về Form cơ bản (bỏ biểu mẫu đã chọn);
 *   - `{ mode: 'linked', formId, publicKey, title }` → dùng biểu mẫu có sẵn.
 * Lúc lưu, `buildLinkedFormPayload` đổi thành `linkedFormId` gửi lên backend, còn `applyLinkedFormChoiceToHtml`
 * bảo đảm HTML có ĐÚNG MỘT chỗ trống `<div data-founderai-form-slot></div>` — backend thay chỗ trống đó bằng khối nhúng
 * của biểu mẫu (không tự chèn chỗ trống; không có chỗ trống thì từ chối, không gắn suông).
 *
 * Thuần (không React, không API) để test được.
 */

/** Chỗ trống mà backend (`landingHtmlInjection.util.js` FORM_SLOT_RE) nhận ra và thay bằng khối nhúng thật. */
export const FORM_SLOT_HTML = '<div data-founderai-form-slot></div>';

const SLOT_MENTION_RE = /<div\b[^>]*\bdata-founderai-form-slot\b/i;
const EMBED_SECTION_RE = /<section\b[^>]*\bdata-founderai-form-section\b[^>]*>[\s\S]*?<\/section>/gi;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** HTML đã có chỗ trống chờ biểu mẫu chưa. */
export function htmlHasFormSlot(html) {
  return SLOT_MENTION_RE.test(String(html || ''));
}

/** HTML đã nhúng biểu mẫu có publicKey này chưa (`<div data-founderai-form="KEY">`). */
export function htmlEmbedsFormKey(html, publicKey) {
  const key = String(publicKey || '');
  if (!key) return false;
  const re = new RegExp(`\\bdata-founderai-form\\s*=\\s*(["'])${escapeRegExp(key)}\\1`);
  return re.test(String(html || ''));
}

/** Thay khối nhúng (`<section data-founderai-form-section>…</section>`) của biểu mẫu `publicKey` bằng chỗ trống. */
export function replaceFormEmbedSectionWithSlot(html, publicKey) {
  const source = String(html || '');
  if (!publicKey) return source;
  let replaced = false;
  const next = source.replace(EMBED_SECTION_RE, (match) => {
    if (!replaced && htmlEmbedsFormKey(match, publicKey)) {
      replaced = true;
      return FORM_SLOT_HTML;
    }
    return match;
  });
  return replaced ? next : source;
}

/** Chèn chỗ trống ngay trước `</body>` cuối cùng (không có `</body>` thì nối vào cuối). */
export function insertFormSlot(html) {
  const source = String(html || '');
  const closeBody = source.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
  if (closeBody >= 0) {
    return `${source.slice(0, closeBody)}\n${FORM_SLOT_HTML}\n${source.slice(closeBody)}`;
  }
  return `${source}\n${FORM_SLOT_HTML}\n`;
}

/**
 * Đưa HTML về dạng backend nhận được cho lựa chọn này.
 *  1. Không có lựa chọn / đã có chỗ trống → giữ nguyên.
 *  2. Trang đã nhúng sẵn đúng biểu mẫu được chọn → giữ nguyên (backend chỉ gắn).
 *  3. Trang đang nhúng biểu mẫu cũ (khoá `currentPublicKey` — form tự sinh hoặc biểu mẫu đã chọn trước đó) → thay khối
 *     nhúng đó bằng chỗ trống để backend nhúng biểu mẫu mới đúng vị trí cũ.
 *  4. Còn lại: chọn biểu mẫu → chèn chỗ trống cuối trang; quay về Form cơ bản → không có gì để đặt (backend chỉ gỡ gắn).
 *
 * @param {string} html
 * @param {object|null} choice
 * @param {string|null|undefined} currentPublicKey khoá biểu mẫu đang gắn trang (từ server)
 * @returns {string}
 */
export function applyLinkedFormChoiceToHtml(html, choice, currentPublicKey) {
  const source = String(html || '');
  if (!choice) return source;
  if (htmlHasFormSlot(source)) return source;
  if (choice.mode === 'linked' && choice.publicKey && htmlEmbedsFormKey(source, choice.publicKey)) return source;
  if (currentPublicKey) {
    const replaced = replaceFormEmbedSectionWithSlot(source, currentPublicKey);
    if (replaced !== source) return replaced;
  }
  if (choice.mode === 'basic') return source;
  return insertFormSlot(source);
}

/** Phần body gửi lên PUT landing: thiếu `linkedFormId` = không đổi gì; null = về Form cơ bản. */
export function buildLinkedFormPayload(choice) {
  if (choice?.mode === 'linked') return { linkedFormId: Number(choice.formId) };
  if (choice?.mode === 'basic') return { linkedFormId: null };
  return {};
}

/** Chế độ hiển thị radio theo dữ liệu server + lựa chọn đang chờ lưu. */
export function resolveLinkedFormView(form) {
  const choice = form?.linkedFormChoice || null;
  const serverChosenId =
    form?.linkedFormSource === 'chosen' && form?.linkedFormId != null ? String(form.linkedFormId) : '';
  if (choice?.mode === 'linked') return { mode: 'linked', formId: String(choice.formId), serverChosenId, choice };
  if (choice?.mode === 'basic') return { mode: 'basic', formId: '', serverChosenId, choice };
  return { mode: serverChosenId ? 'linked' : 'basic', formId: serverChosenId, serverChosenId, choice: null };
}

/** Các trường biểu mẫu đang gắn lấy từ phản hồi server (GET / PUT) → vào state `form` của trình soạn. */
export function pickLinkedFormFields(full) {
  return {
    linkedFormId: full?.linkedFormId ?? null,
    linkedFormTitle: full?.linkedFormTitle ?? null,
    linkedFormPublicKey: full?.linkedFormPublicKey ?? null,
    linkedFormSource: full?.linkedFormSource ?? null,
  };
}
