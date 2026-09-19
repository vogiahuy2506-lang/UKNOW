/**
 * Tự khai báo trường form landing lúc lưu — `_internal/PLAN_TU_KHAI_BAO_TRUONG_FORM_LANDING_2026-09-16.md`.
 *
 * Nối tiếp `landingCaptureFieldAudit.util.js` (chỉ CẢNH BÁO ô chưa khai báo): người dùng nói
 * "thêm ô Chức vụ" thì trang phải ra đủ trường VÀ dữ liệu phải được lưu — không có lý gì bắt họ tự
 * vào Cài đặt trang → Form đăng ký khai báo trước rồi mới nhờ AI sửa form. Hàm ở đây soi form
 * `data-founderai-capture`, DỰNG khai báo `customFields` từ chính HTML rồi ĐỔI TÊN `name=` thành
 * khoá `cf_*` hợp lệ — chạy lúc lưu (`landingPageAdmin.service.js` `create()`/`update()`), không
 * làm trong prompt AI (phải chạy được cả khi người dùng dán HTML tay; AI không đáng tin để tự sinh
 * khoá hợp lệ).
 *
 * BẪY NẶNG NHẤT (mục 6.2 trong plan): `select`/`radio` thiếu `options` làm
 * `normalizeCustomSubmitValue` (`landingLeadFormConfig.util.js`) `throw` khi khách gửi bài —
 * `/api/public/leads` trả 400 và MẤT CẢ LEAD, không chỉ mất một ô. Vì vậy: trích KHÔNG được đủ
 * lựa chọn (rỗng, trùng value, chỉ có option rỗng dạng placeholder) → BỎ QUA ô đó hẳn, giữ nguyên
 * `name=` cũ để `auditLandingCaptureFields` vẫn cảnh báo được (lưới an toàn thật sự).
 */
import {
  normalizePersistedLeadForm,
  CUSTOM_FIELD_KEY_RE,
  MAX_CUSTOM_FIELDS,
  FORBIDDEN_FIELD_KEYS,
  LABEL_VI_MIN,
  LABEL_VI_MAX,
  OPTION_VALUE_MAX,
  OPTION_LABEL_MAX,
} from './landingLeadFormConfig.util.js';
import { extractCaptureFormMatch, auditLandingCaptureFields } from './landingCaptureFieldAudit.util.js';

/**
 * `type` input không mang dữ liệu người dùng nhập — không phải trường phụ (plan mục 3, "Bỏ qua,
 * không coi là trường phụ"). `hidden`/`submit`/`button`/`reset`/`image` không có UI nhập liệu thật;
 * `file` thì `founderai-capture.js` gửi JSON, không có cách gửi file — khai báo cũng vô ích.
 */
const IGNORED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function getAttr(tagStr, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(["'])([^"']*)\\1`, 'i');
  const m = String(tagStr || '').match(re);
  return m ? m[2] : null;
}

function hasBooleanAttr(tagStr, attrName) {
  return new RegExp(`(?:\\s|^)${attrName}(?=[\\s/>]|$)`, 'i').test(String(tagStr || ''));
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Giải mã vài thực thể HTML hay gặp trong nhãn chép ra từ trang — đủ cho phạm vi hẹp, không phải
 * bộ giải mã đầy đủ (khớp mức độ `aiLandingPage.service.js` `htmlHasOptionValue` đã chấp nhận). */
function decodeBasicEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Nhãn tiếng Việt khi không tìm được `<label>`/`aria-label`/`placeholder` — viết lại từ `name`
 * (phản biện 16/09: không phục hồi được dấu tiếng Việt đã mất khi đặt tên không dấu, vd
 * `name="chuc_vu"` ra "Chuc vu" chứ không phải "Chức vụ" — chấp nhận, đây là nhãn CUỐI trong
 * chuỗi ưu tiên, chỉ dùng khi trang không để lại gợi ý nào khác). Luôn trả chuỗi hợp lệ độ dài
 * [LABEL_VI_MIN, LABEL_VI_MAX] — `name` một ký tự (vd `name="a"`) vẫn phải qua được
 * `validateCustomFieldInput`, không được ném lỗi làm hỏng cả lượt lưu.
 */
function humanizeFieldName(name) {
  const spaced = String(name || '')
    .replace(/^cf_/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  const words = spaced.split(/\s+/).filter(Boolean);
  const humanized = words.length > 0
    ? words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
    : String(name || '');
  const clamped = humanized.slice(0, LABEL_VI_MAX);
  return clamped.length >= LABEL_VI_MIN ? clamped : `Trường ${name}`.slice(0, LABEL_VI_MAX);
}

/**
 * Nhãn cho một ô:
 * 1. `<label for="id">` (như hiện tại)
 * 2. `<label>` bọc ngoài ô (lấy chữ của label, bỏ thẻ control con; trừ type="radio" vì bọc radio là nhãn option)
 * 3. `<label>` đứng ngay trước ô trong cùng khối, không có `for` (~400-500 ký tự, không có input/select/textarea xen giữa)
 * 4. `aria-label` → `placeholder` → tên ô viết lại (như hiện tại)
 */
function resolveLabel(inner, tagStr, name) {
  const id = getAttr(tagStr, 'id');
  if (id) {
    const forRe = new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*(["'])${escapeRegExp(id)}\\1[^>]*>([\\s\\S]*?)<\\/label>`, 'i');
    const m = inner.match(forRe);
    if (m) {
      const text = decodeBasicEntities(stripTags(m[2])).trim();
      if (text.length >= LABEL_VI_MIN) return text.slice(0, LABEL_VI_MAX);
    }
  }

  const tagIndex = inner.indexOf(tagStr);
  const inputType = (getAttr(tagStr, 'type') || '').toLowerCase();

  // 2. MỚI — <label> bọc ngoài ô (trừ type="radio" vì label bọc ngoài radio là nhãn lựa chọn option)
  if (tagIndex !== -1 && inputType !== 'radio') {
    const wrappingLabelRe = /<label\b[^>]*>([\s\S]*?)<\/label>/gi;
    let lm;
    while ((lm = wrappingLabelRe.exec(inner))) {
      const labelStart = lm.index;
      const labelEnd = wrappingLabelRe.lastIndex;
      if (labelStart < tagIndex && labelEnd > tagIndex + tagStr.length) {
        const withoutControl = lm[1].replace(/<(input|select|textarea)\b[^>]*>(?:[\s\S]*?<\/\1>)?/gi, ' ');
        const text = decodeBasicEntities(stripTags(withoutControl)).trim();
        if (text.length >= LABEL_VI_MIN) return text.slice(0, LABEL_VI_MAX);
        break;
      }
    }
  }

  // 3. MỚI — <label> đứng ngay trước ô trong cùng khối, không có for
  if (tagIndex !== -1) {
    const MAX_PRECEDING_DISTANCE = 500;
    const startIdx = Math.max(0, tagIndex - MAX_PRECEDING_DISTANCE);
    const chunk = inner.slice(startIdx, tagIndex);
    const precedingLabelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
    let lastMatch = null;
    let pm;
    while ((pm = precedingLabelRe.exec(chunk))) {
      // Chỉ nhận label KHÔNG bọc control khác bên trong
      if (!/<(input|select|textarea)\b/i.test(pm[2])) {
        lastMatch = {
          content: pm[2],
          endIndexInChunk: precedingLabelRe.lastIndex,
        };
      }
    }
    if (lastMatch) {
      const between = chunk.slice(lastMatch.endIndexInChunk);
      if (!/<(input|select|textarea)\b/i.test(between)) {
        const text = decodeBasicEntities(stripTags(lastMatch.content)).trim();
        if (text.length >= LABEL_VI_MIN) return text.slice(0, LABEL_VI_MAX);
      }
    }
  }

  const ariaLabel = getAttr(tagStr, 'aria-label');
  if (ariaLabel) {
    const text = decodeBasicEntities(ariaLabel).trim();
    if (text.length >= LABEL_VI_MIN) return text.slice(0, LABEL_VI_MAX);
  }
  const placeholder = getAttr(tagStr, 'placeholder');
  if (placeholder) {
    const text = decodeBasicEntities(placeholder).trim();
    if (text.length >= LABEL_VI_MIN) return text.slice(0, LABEL_VI_MAX);
  }
  return humanizeFieldName(name);
}

/** Mọi thẻ `<input|select|textarea>` mang đúng `name` này, theo thứ tự xuất hiện — không quan tâm
 * thứ tự thuộc tính bên trong thẻ (khác `NAMED_CONTROL_RE` của audit, ở đây cần đọc thêm `type`/
 * `id`/`required` nên phải bắt trọn thẻ trước rồi tách thuộc tính sau). */
function findTagsWithName(inner, name) {
  const re = /<(input|select|textarea)\b[^>]*>/gi;
  const tags = [];
  let m;
  while ((m = re.exec(inner))) {
    const tagStr = m[0];
    if (getAttr(tagStr, 'name') === name) {
      tags.push({ tag: m[1].toLowerCase(), full: tagStr });
    }
  }
  return tags;
}

/**
 * Lựa chọn của `<select name=NAME>` — chỉ nhận `<option value="...">` có `value` KHÔNG rỗng (mẫu
 * "— Chọn —" thường viết `value=""`, bị loại tự nhiên, không cần đoán chữ). Value trùng nhau, hoặc
 * không còn lựa chọn nào sau khi lọc → trả `null` (BỎ QUA cả ô, mục 6.2).
 */
function extractSelectOptions(inner, name) {
  const selectRe = new RegExp(`<select\\b[^>]*\\bname\\s*=\\s*(["'])${escapeRegExp(name)}\\1[^>]*>([\\s\\S]*?)<\\/select>`, 'i');
  const m = inner.match(selectRe);
  if (!m) return null;
  const body = m[2];
  const optionRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  const options = [];
  const seenValues = new Set();
  let om;
  while ((om = optionRe.exec(body))) {
    const value = (getAttr(`<option ${om[1]}>`, 'value') || '').trim();
    if (!value || FORBIDDEN_FIELD_KEYS.has(value) || value.length > OPTION_VALUE_MAX) continue;
    if (seenValues.has(value)) return null; // trùng value → không tin cả field, bỏ qua hẳn
    const labelText = decodeBasicEntities(stripTags(om[2])).trim().slice(0, OPTION_LABEL_MAX) || value;
    seenValues.add(value);
    options.push({ value, labelVi: labelText });
  }
  return options.length >= 1 ? options : null;
}

/**
 * Lựa chọn của nhóm `<input type="radio" name=NAME>` — chỉ nhận dạng canonical
 * `<label><input type="radio" .../> Nhãn</label>` (đúng khuôn `aiLandingPage.service.js`
 * `buildLeadFormExtraFieldsPromptBlock` tự sinh). Không khớp khuôn này, value rỗng, hoặc trùng
 * value → trả `null` (bỏ qua cả field, cùng lý do bẫy 6.2 như select).
 */
function extractRadioOptions(inner, name) {
  const labelBlockRe = /<label\b[^>]*>([\s\S]*?)<\/label>/gi;
  const options = [];
  const seenValues = new Set();
  let lm;
  while ((lm = labelBlockRe.exec(inner))) {
    const block = lm[1];
    const inputMatch = block.match(/<input\b[^>]*>/i);
    if (!inputMatch) continue;
    const inputTag = inputMatch[0];
    if ((getAttr(inputTag, 'type') || '').toLowerCase() !== 'radio') continue;
    if (getAttr(inputTag, 'name') !== name) continue;
    const value = (getAttr(inputTag, 'value') || '').trim();
    if (!value || FORBIDDEN_FIELD_KEYS.has(value) || value.length > OPTION_VALUE_MAX) continue;
    if (seenValues.has(value)) return null;
    const labelText = decodeBasicEntities(stripTags(block.replace(inputTag, ''))).trim().slice(0, OPTION_LABEL_MAX) || value;
    seenValues.add(value);
    options.push({ value, labelVi: labelText });
  }
  return options.length >= 1 ? options : null;
}

/**
 * Xác định kiểu trường + (nếu select/radio) trích lựa chọn cho một `name`. Trả `{ skip: true,
 * reason }` khi không thể/không nên tự khai báo (giữ nguyên `name=` cũ, để audit tiếp tục cảnh báo).
 */
function classifyField(inner, name) {
  const tags = findTagsWithName(inner, name);
  if (tags.length === 0) return { skip: true, reason: 'not_found' };

  const first = tags[0];
  if (first.tag === 'select') {
    const options = extractSelectOptions(inner, name);
    if (!options) return { skip: true, reason: 'select_no_options' };
    return { type: 'select', options, tags };
  }
  if (first.tag === 'textarea') {
    return { type: 'textarea', options: [], tags };
  }

  const inputType = (getAttr(first.full, 'type') || 'text').toLowerCase();
  if (IGNORED_INPUT_TYPES.has(inputType)) return { skip: true, reason: 'ignored_type' };
  if (inputType === 'radio') {
    const options = extractRadioOptions(inner, name);
    if (!options) return { skip: true, reason: 'radio_no_options' };
    return { type: 'radio', options, tags };
  }
  if (inputType === 'checkbox') {
    return { type: 'checkbox', options: [], tags };
  }
  return { type: 'text', options: [], tags };
}

/**
 * Bản song sinh backend của `frontend/src/features/landing-pages/utils/landingLeadFormConfig.js`
 * `generateCustomFieldKey` — cùng dạng `cf_<slug từ nhãn, bỏ dấu>_<rand4>`, cùng khớp
 * `CUSTOM_FIELD_KEY_RE`. Tự thử lại khi trùng khoá đã dùng trong cùng lượt lưu (cực hiếm — 36^4 ≈
 * 1,68 triệu tổ hợp cho 4 ký tự ngẫu nhiên).
 *
 * @param {string} label dùng làm gốc slug (đọc được hơn slug hoá từ `name` kỹ thuật)
 * @param {Set<string>} usedKeys khoá đã có trong cấu hình + đã sinh trong cùng lượt này
 * @returns {string}
 */
function generateCustomFieldKeyBackend(label, usedKeys) {
  const slug = String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'field';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rand = Math.random().toString(36).slice(2, 6);
    const rest = `${slug}_${rand}`.replace(/[^a-z0-9_]/g, '').slice(0, 40);
    const key = `cf_${rest.padEnd(4, 'x')}`;
    if (CUSTOM_FIELD_KEY_RE.test(key) && !usedKeys.has(key)) return key;
  }
  // Rơi vào đây gần như không thể xảy ra (20 lần trùng liên tiếp) — thêm timestamp cho chắc duy nhất.
  return `cf_field_${Date.now().toString(36)}`.slice(0, 43);
}

/**
 * Soi form `data-founderai-capture`, tự dựng khai báo cho các ô CHƯA khai báo (dùng lại
 * `auditLandingCaptureFields` để lấy đúng danh sách — cùng phạm vi, cùng luật loại trừ tên cố
 * định), rồi đổi `name=` của các ô khai báo THÀNH CÔNG sang khoá mới ngay trong HTML.
 *
 * KHÔNG sửa khoá đã tồn tại (mục 6.4) — chỉ THÊM field mới vào mảng, `landingPageAdmin.service.js`
 * gộp qua `validateAdminLeadFormConfig` (chặn đổi `type`/`options` của khoá cũ ở lớp đó rồi, không
 * lặp lại kiểm tra ở đây).
 *
 * @param {string} html HTML landing sắp lưu (đã thay chỗ trống biểu mẫu nếu có — hàm này không
 *   quan tâm `AI_LANDING_FORM_MODE`, chỉ soi form `data-founderai-capture` nếu có).
 * @param {unknown} leadFormConfigOrCustomConfig cấu hình HIỆN CÓ (trước khi thêm field mới) —
 *   dùng để biết khoá nào đã khai báo (không đụng) và còn bao nhiêu chỗ trống dưới trần
 *   `MAX_CUSTOM_FIELDS`.
 * @returns {{ html: string, newFields: object[], skipped: Array<{ name: string, reason: string }> }}
 *   `newFields` đã ở đúng dạng input cho `validateAdminLeadFormConfig` (key/type/labelVi/required/
 *   options); `skipped` liệt kê ô KHÔNG tự khai báo được kèm lý do, để lưới an toàn
 *   `auditLandingCaptureFields` tiếp tục cảnh báo đúng những ô này.
 */
export function autoDeclareLandingCaptureFields(html, leadFormConfigOrCustomConfig) {
  const rawHtml = String(html || '');
  const formMatch = extractCaptureFormMatch(rawHtml);
  if (!formMatch) return { html: rawHtml, newFields: [], skipped: [] };

  const { unknownNames } = auditLandingCaptureFields(rawHtml, leadFormConfigOrCustomConfig);
  if (unknownNames.length === 0) return { html: rawHtml, newFields: [], skipped: [] };

  const config = normalizePersistedLeadForm(leadFormConfigOrCustomConfig);
  const usedKeys = new Set((config.customFields || []).map((f) => f.key));
  const existingCount = (config.customFields || []).length;

  const inner = formMatch.inner;
  const newFields = [];
  const skipped = [];
  const renameMap = new Map(); // name cũ trong HTML -> khoá cf_* mới

  for (const name of unknownNames) {
    if (existingCount + newFields.length >= MAX_CUSTOM_FIELDS) {
      skipped.push({ name, reason: 'cap_exceeded' });
      continue;
    }
    const built = classifyField(inner, name);
    if (built.skip) {
      skipped.push({ name, reason: built.reason });
      continue;
    }
    const labelVi = resolveLabel(inner, built.tags[0].full, name);
    const required = built.tags.some((t) => hasBooleanAttr(t.full, 'required'));
    const key = generateCustomFieldKeyBackend(labelVi, usedKeys);
    usedKeys.add(key);
    newFields.push({
      key,
      type: built.type,
      labelVi,
      labelEn: null,
      placeholderVi: null,
      placeholderEn: null,
      required,
      options: built.options,
    });
    renameMap.set(name, key);
  }

  if (renameMap.size === 0) return { html: rawHtml, newFields: [], skipped };

  // Chỉ đổi name= TRONG PHẠM VI form capture (mục 6.3) — radio cùng tên đổi hết cùng lúc vì regex
  // có cờ `g`, không cần vòng lặp riêng cho từng input.
  let newInner = inner;
  for (const [oldName, newKey] of renameMap) {
    const renameRe = new RegExp(`(\\bname\\s*=\\s*)(["'])${escapeRegExp(oldName)}\\2`, 'g');
    newInner = newInner.replace(renameRe, `$1$2${newKey}$2`);
  }
  const newFull = formMatch.full.replace(formMatch.inner, newInner);
  const newHtml = rawHtml.replace(formMatch.full, newFull);

  return { html: newHtml, newFields, skipped };
}
