/**
 * Danh sách BIỂU MẪU của một landing trong Cài đặt trang (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-6; thay mô hình "một
 * biểu mẫu" PR-F của PLAN_TEN_MIEN_RIENG_VA_BIEU_MAU_LIEN_KET_LANDING_2026-10-03.md).
 *
 * Nguồn sự thật = HTML của trang. Mọi thao tác trên danh sách là biến đổi HTML (hàm thuần, test được) rồi lưu như thường:
 *   - biểu mẫu ĐÃ LƯU nằm trong HTML dưới dạng khối nhúng `<section data-founderai-form-section>…<div data-founderai-form="KEY">…`;
 *   - biểu mẫu MỚI chưa lưu nằm trong HTML dưới dạng chỗ trống CÓ LOẠI `<div data-founderai-form-slot="booking"></div>` — backend tạo
 *     biểu mẫu đúng loại ngay lúc lưu rồi thay chỗ trống bằng khối nhúng (landingPageAdmin.service.js);
 *   - biểu mẫu CÓ SẴN vừa chọn từ mục Biểu mẫu nằm ở `form.linkedFormsPending` (chưa có trong HTML); lúc lưu gửi `linkedFormIds`,
 *     backend nối khối nhúng của chúng vào cuối trang.
 * Bỏ một biểu mẫu = xoá khối đó khỏi HTML (biểu mẫu + bài nộp vẫn còn nguyên trong mục Biểu mẫu); đổi thứ tự = đổi chỗ hai khối.
 *
 * Thuần (không React, không API) để test được.
 */
import { FORM_SLOT_KINDS, listFormSlotMatches } from '../../landing-pages/utils/injectLandingEnhancements.js';

export { FORM_SLOT_KINDS };

/** Trần KỸ THUẬT số biểu mẫu / landing (mỗi biểu mẫu là một iframe) — bằng MAX_FORMS_PER_LANDING của backend. */
export const MAX_FORMS_PER_LANDING = 20;

/** Chỗ trống TRẦN (= consult, có thể tái dùng biểu mẫu consult cũ của trang). Trình soạn dùng chỗ trống có LOẠI để tạo MỚI. */
export const FORM_SLOT_HTML = '<div data-founderai-form-slot></div>';

const EMBED_SECTION_RE = /<section\b[^>]*\bdata-founderai-form-section\b[^>]*>[\s\S]*?<\/section>/gi;
const EMBED_DIV_RE = /<div\b[^>]*\bdata-founderai-form\s*=\s*(["'])([A-Za-z0-9_-]+)\1[^>]*>[\s\S]*?<\/div>/gi;
const EMBED_KEY_RE = /\bdata-founderai-form\s*=\s*(["'])([A-Za-z0-9_-]+)\1/;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** HTML đã nhúng biểu mẫu có publicKey này chưa (`<div data-founderai-form="KEY">`). */
export function htmlEmbedsFormKey(html, publicKey) {
  const key = String(publicKey || '');
  if (!key) return false;
  const re = new RegExp(`\\bdata-founderai-form\\s*=\\s*(["'])${escapeRegExp(key)}\\1`);
  return re.test(String(html || ''));
}

/** Chỗ trống CÓ LOẠI: `<div data-founderai-form-slot="booking"></div>` (luôn tạo biểu mẫu MỚI đúng loại lúc lưu). */
export function buildFormSlotHtml(kind) {
  return `<div data-founderai-form-slot="${kind}"></div>`;
}

/** Chèn một đoạn HTML ngay trước `</body>` cuối cùng (không có `</body>` thì nối vào cuối). */
function insertBeforeBodyClose(html, snippet) {
  const source = String(html || '');
  const closeBody = source.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
  if (closeBody >= 0) {
    return `${source.slice(0, closeBody)}\n${snippet}\n${source.slice(closeBody)}`;
  }
  return `${source}\n${snippet}\n`;
}

/**
 * Mọi KHỐI biểu mẫu trong HTML theo thứ tự xuất hiện: khối nhúng (đã lưu) và chỗ trống (chưa lưu).
 *
 * @param {string} html
 * @returns {Array<{ type: 'embed', key: string, start: number, end: number, text: string }
 *   | { type: 'slot', kind: string, bare: boolean, valid: boolean, rawKind: string|null, start: number, end: number, text: string }>}
 */
export function listFormBlocks(html) {
  const source = String(html ?? '');
  const blocks = [];
  for (const m of source.matchAll(EMBED_SECTION_RE)) {
    const key = m[0].match(EMBED_KEY_RE)?.[2];
    if (!key) continue;
    blocks.push({ type: 'embed', key, start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  for (const m of source.matchAll(EMBED_DIV_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    if (blocks.some((b) => b.type === 'embed' && start >= b.start && end <= b.end)) continue; // đã nằm trong khối <section>
    blocks.push({ type: 'embed', key: m[2], start, end, text: m[0] });
  }
  for (const slot of listFormSlotMatches(source)) blocks.push(slot);
  return blocks.sort((a, b) => a.start - b.start);
}

/**
 * Các dòng hiển thị của danh sách biểu mẫu: khối trong HTML (theo thứ tự) rồi tới biểu mẫu có sẵn đang chờ gắn.
 *
 * `source`: 'saved' = khối nhúng của biểu mẫu thuộc tài khoản (tra được tên / loại trong `linkedForms` của server);
 *           'external' = khoá nhúng KHÔNG tra được (dán tay khoá của người khác / dữ liệu lệch) — vẫn xoá được khỏi trang;
 *           'new' = chỗ trống có loại, tạo lúc lưu; 'pending' = biểu mẫu có sẵn chờ gắn lúc lưu.
 * `blockIndex`: chỉ số khối trong HTML (cho remove/move); null với 'pending'.
 *
 * @param {{ html: string, linkedForms?: Array<object>, pending?: Array<{ formId: number, publicKey?: string|null, title?: string|null }> }} params
 */
export function buildFormRows({ html, linkedForms = [], pending = [] }) {
  const byKey = new Map((Array.isArray(linkedForms) ? linkedForms : []).map((f) => [f.publicKey, f]));
  const blocks = listFormBlocks(html);
  const embeddedKeys = new Set(blocks.filter((b) => b.type === 'embed').map((b) => b.key));
  const rows = blocks.map((block, blockIndex) => {
    if (block.type === 'slot') {
      return {
        id: `slot:${blockIndex}`,
        source: 'new',
        blockIndex,
        kind: block.kind,
        bare: block.bare,
        valid: block.valid,
        rawKind: block.rawKind,
        formId: null,
        title: null,
        publicKey: null,
        isPublished: true,
        needsPaymentSetup: false,
      };
    }
    const server = byKey.get(block.key);
    return {
      id: `embed:${blockIndex}`,
      source: server ? 'saved' : 'external',
      blockIndex,
      kind: server?.kind ?? null,
      formId: server?.id ?? null,
      title: server?.title ?? null,
      publicKey: block.key,
      isPublished: server ? server.isPublished !== false : true,
      needsPaymentSetup: Boolean(server?.needsPaymentSetup),
    };
  });
  for (const p of Array.isArray(pending) ? pending : []) {
    if (p?.publicKey && embeddedKeys.has(p.publicKey)) continue; // đã có trên trang (HTML nhúng sẵn) — không hiện hai lần
    rows.push({
      id: `pending:${p.formId}`,
      source: 'pending',
      blockIndex: null,
      kind: null,
      formId: Number(p.formId),
      title: p.title ?? null,
      publicKey: p.publicKey ?? null,
      isPublished: true,
      needsPaymentSetup: false,
    });
  }
  return rows;
}

/** Xoá khối thứ `blockIndex` khỏi HTML (cùng một dấu xuống dòng liền sau). Không có khối đó thì trả nguyên HTML. */
export function removeFormBlock(html, blockIndex) {
  const source = String(html ?? '');
  const block = listFormBlocks(source)[blockIndex];
  if (!block) return source;
  const end = source[block.end] === '\n' ? block.end + 1 : block.end;
  return source.slice(0, block.start) + source.slice(end);
}

/** Đổi chỗ khối `blockIndex` với khối kề (`direction` = -1 lên, +1 xuống). Hết đường thì trả nguyên HTML. */
export function moveFormBlock(html, blockIndex, direction) {
  const source = String(html ?? '');
  const blocks = listFormBlocks(source);
  const a = blocks[blockIndex];
  const b = blocks[blockIndex + direction];
  if (!a || !b) return source;
  const [first, second] = a.start < b.start ? [a, b] : [b, a];
  return (
    source.slice(0, first.start)
    + second.text
    + source.slice(first.end, second.start)
    + first.text
    + source.slice(second.end)
  );
}

/**
 * Thêm một biểu mẫu MỚI theo mẫu: chèn chỗ trống có loại ngay SAU khối biểu mẫu cuối cùng (các biểu mẫu nằm gần nhau); trang chưa
 * có khối nào thì chèn trước `</body>`.
 */
export function addFormSlot(html, kind) {
  const source = String(html ?? '');
  const snippet = buildFormSlotHtml(kind);
  const blocks = listFormBlocks(source);
  if (blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    return `${source.slice(0, last.end)}\n${snippet}${source.slice(last.end)}`;
  }
  return insertBeforeBodyClose(source, snippet);
}

/** Thêm biểu mẫu CÓ SẴN vào danh sách chờ gắn (không trùng). */
export function addPendingForm(pending, form) {
  const list = Array.isArray(pending) ? pending : [];
  const formId = Number(form?.id ?? form?.formId);
  if (!Number.isFinite(formId) || list.some((p) => Number(p.formId) === formId)) return list;
  return [...list, { formId, publicKey: form?.publicKey ?? null, title: form?.title ?? null }];
}

/** Bỏ biểu mẫu khỏi danh sách chờ gắn. */
export function removePendingForm(pending, formId) {
  return (Array.isArray(pending) ? pending : []).filter((p) => Number(p.formId) !== Number(formId));
}

/** Phần body gửi lên PUT landing: danh sách biểu mẫu có sẵn chờ gắn (thứ tự = thứ tự nối vào cuối trang). Rỗng → không gửi gì. */
export function buildLinkedFormsPayload(pending) {
  const ids = (Array.isArray(pending) ? pending : []).map((p) => Number(p.formId)).filter(Number.isFinite);
  return ids.length > 0 ? { linkedFormIds: ids } : {};
}

/**
 * Các biểu mẫu đang nhúng lấy từ phản hồi server (GET / PUT) → vào state `form` của trình soạn. Server cũ (chỉ có khoá đơn
 * `linkedFormId…`, lúc deploy lệch) thì dựng danh sách một phần tử.
 */
export function pickLinkedFormFields(full) {
  if (Array.isArray(full?.linkedForms)) return { linkedForms: full.linkedForms };
  if (full?.linkedFormId != null) {
    return {
      linkedForms: [
        {
          id: full.linkedFormId,
          title: full.linkedFormTitle ?? null,
          publicKey: full.linkedFormPublicKey ?? null,
          isPublished: true,
          kind: null,
          position: 0,
          needsPaymentSetup: false,
        },
      ],
    };
  }
  return { linkedForms: [] };
}
