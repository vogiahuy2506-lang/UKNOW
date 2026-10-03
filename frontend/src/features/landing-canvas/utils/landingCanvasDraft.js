/**
 * Nháp trình soạn landing (PLAN_LANDING_GIU_NHAP_KHI_F5_2026-10-03.md, Việc 1).
 *
 * Lưu form đang soạn + hội thoại AI vào localStorage để F5 / đóng tab không mất. Thuần (không React),
 * MỌI truy cập storage bọc try/catch — chế độ riêng tư / hết dung lượng không được làm sập trang.
 */

export const DRAFT_PREFIX = 'founderai:landingCanvasDraft:';
export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Số tin `applied` gần nhất còn giữ HTML lịch sử cho nút Hoàn tác. */
export const KEEP_UNDO_HTML_COUNT = 3;

/**
 * Các trường form lưu được vào nháp. KHÔNG gồm leadFormFieldErrors / leadFormPersistedMeta / linkedFormId (trường chỉ-server).
 * `linkedFormChoice` (lựa chọn "Dùng biểu mẫu đã tạo" chờ bấm Lưu — landingFormLink.js) CÓ trong nháp: đó là thay đổi người dùng
 * đã làm, mất khi F5 thì họ tưởng đã chọn mà thực ra chưa.
 */
export const DRAFT_FORM_FIELDS = [
  'title',
  'slug',
  'htmlContent',
  'isPublished',
  'domainType',
  'customDomainHostname',
  'customDomainIsApex',
  'leadFormConfig',
  'linkedFormChoice',
];

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ userId: string|number, ownerId: string|number }} scope
 * @param {number|string|null} id  null/'new' = trang mới
 */
export function buildDraftKey(scope, id) {
  const userId = scope?.userId;
  if (userId == null || userId === '') return null;
  const ownerId = scope?.ownerId == null || scope.ownerId === '' ? userId : scope.ownerId;
  const tail = id == null || id === '' || id === 'new' ? 'new' : String(id);
  return `${DRAFT_PREFIX}v${DRAFT_VERSION}:${userId}:${ownerId}:${tail}`;
}

/** Cắt form về đúng các trường nháp. */
export function pickDraftForm(form) {
  if (!form || typeof form !== 'object') return null;
  const out = {};
  for (const key of DRAFT_FORM_FIELDS) {
    out[key] = form[key] === undefined ? null : form[key];
  }
  return out;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** Ảnh chụp để so "bẩn": mọi trường nháp, leadFormConfig đã chuẩn hoá thứ tự khoá. */
export function snapshotDraftForm(form) {
  const picked = pickDraftForm(form) || {};
  return {
    title: String(picked.title ?? ''),
    slug: String(picked.slug ?? ''),
    htmlContent: String(picked.htmlContent ?? ''),
    isPublished: Boolean(picked.isPublished),
    domainType: picked.domainType === 'custom' ? 'custom' : 'system',
    customDomainHostname: picked.customDomainHostname || null,
    customDomainIsApex: Boolean(picked.customDomainIsApex),
    leadFormConfig: stableStringify(picked.leadFormConfig),
    linkedFormChoice: stableStringify(picked.linkedFormChoice),
  };
}

/** @returns {boolean} true nếu form khác mốc. */
export function isDraftFormDirty(form, baselineSnapshot) {
  if (!form || !baselineSnapshot) return false;
  const current = snapshotDraftForm(form);
  return Object.keys(baselineSnapshot).some((k) => current[k] !== baselineSnapshot[k]);
}

function stripUndoHtml(message) {
  if (!message || (!('previousHtml' in message) && !('suggestedHtml' in message))) return message;
  const { previousHtml: _p, suggestedHtml: _s, ...rest } = message;
  return rest;
}

/**
 * Chuẩn bị tin nhắn để ghi: chỉ 3 tin `applied` gần nhất giữ previousHtml/suggestedHtml; tin đang
 * `streaming` thành lỗi; bỏ `files` có thể chứa File (chỉ giữ metadata thuần).
 */
export function serializeMessages(messages, { interruptedText = '' } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const appliedIdx = [];
  list.forEach((m, i) => {
    if (m?.status === 'applied') appliedIdx.push(i);
  });
  const keep = new Set(appliedIdx.slice(-KEEP_UNDO_HTML_COUNT));
  return list.map((m, i) => {
    let next = m;
    if (m?.status === 'streaming') {
      next = { ...m, status: 'error', content: interruptedText, suggestedHtml: null };
    }
    if (!keep.has(i)) next = stripUndoHtml(next);
    if (Array.isArray(next?.files)) {
      next = {
        ...next,
        files: next.files.map((f) => ({
          tempId: f?.tempId,
          storageKey: f?.storageKey,
          originalName: f?.originalName ?? f?.name,
          contentType: f?.contentType ?? f?.type,
          size: f?.size,
        })),
      };
    }
    return next;
  });
}

/** Bỏ previousHtml/suggestedHtml khỏi mọi tin (Hoàn tác không được kéo về HTML cũ hơn bản đã lưu). */
export function stripMessagesUndoHtml(messages) {
  return (Array.isArray(messages) ? messages : []).map(stripUndoHtml);
}

/**
 * Ghi nháp. @returns {{ok: boolean}}
 */
export function writeDraft(key, data) {
  if (!key) return { ok: false };
  const storage = getStorage();
  if (!storage) return { ok: false };
  const payload = {
    v: DRAFT_VERSION,
    savedAt: Date.now(),
    baseUpdatedAt: data?.baseUpdatedAt ?? null,
    form: data?.form ?? null,
    messages: Array.isArray(data?.messages) ? data.messages : [],
  };
  try {
    storage.setItem(key, JSON.stringify(payload));
    return { ok: true };
  } catch {
    // Hết dung lượng: thử lại không kèm HTML lịch sử.
  }
  try {
    const slim = { ...payload, messages: stripMessagesUndoHtml(payload.messages) };
    storage.setItem(key, JSON.stringify(slim));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function clearDraft(key) {
  if (!key) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Đọc nháp. Sai phiên bản / quá 7 ngày / hỏng JSON → xoá, trả null.
 */
export function readDraft(key, now = Date.now()) {
  if (!key) return null;
  const storage = getStorage();
  if (!storage) return null;
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    clearDraft(key);
    return null;
  }
  if (
    !data ||
    data.v !== DRAFT_VERSION ||
    !Number.isFinite(data.savedAt) ||
    now - data.savedAt > DRAFT_MAX_AGE_MS
  ) {
    clearDraft(key);
    return null;
  }
  return {
    savedAt: data.savedAt,
    baseUpdatedAt: data.baseUpdatedAt ?? null,
    form: data.form && typeof data.form === 'object' ? data.form : null,
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}

/** Chuyển nháp sang khoá khác (vd 'new' → id sau khi tạo). `patch` ghi đè trường của nháp. */
export function moveDraft(fromKey, toKey, patch = {}) {
  const draft = readDraft(fromKey);
  if (!draft || !toKey) return { ok: false };
  const result = writeDraft(toKey, { ...draft, ...patch });
  if (fromKey !== toKey) clearDraft(fromKey);
  return result;
}

/** Xoá mọi nháp (đăng xuất). Chỉ khoá có đúng tiền tố. */
export function clearAllDrafts() {
  const storage = getStorage();
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    // ignore
  }
}
