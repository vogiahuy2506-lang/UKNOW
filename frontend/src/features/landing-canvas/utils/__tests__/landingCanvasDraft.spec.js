import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_MAX_AGE_MS,
  DRAFT_PREFIX,
  buildDraftKey,
  clearAllDrafts,
  clearDraft,
  isDraftFormDirty,
  moveDraft,
  pickDraftForm,
  readDraft,
  serializeMessages,
  snapshotDraftForm,
  writeDraft,
} from '../landingCanvasDraft.js';

const applied = (id) => ({
  id,
  role: 'ai',
  status: 'applied',
  content: id,
  previousHtml: `prev-${id}`,
  suggestedHtml: `sug-${id}`,
});

describe('landingCanvasDraft — khoá', () => {
  it('khoá gồm user + chủ workspace + new|id', () => {
    expect(buildDraftKey({ userId: 5, ownerId: 9 }, null)).toBe(`${DRAFT_PREFIX}v1:5:9:new`);
    expect(buildDraftKey({ userId: 5, ownerId: 9 }, 77)).toBe(`${DRAFT_PREFIX}v1:5:9:77`);
    expect(buildDraftKey({ userId: 5, ownerId: 5 }, 'new')).toBe(`${DRAFT_PREFIX}v1:5:5:new`);
  });
  it('hai nhân viên / hai công ty cùng trình duyệt không dùng chung khoá', () => {
    expect(buildDraftKey({ userId: 5, ownerId: 9 }, 1)).not.toBe(buildDraftKey({ userId: 5, ownerId: 10 }, 1));
    expect(buildDraftKey({ userId: 5, ownerId: 9 }, 1)).not.toBe(buildDraftKey({ userId: 6, ownerId: 9 }, 1));
  });
  it('thiếu userId → null (không ghi)', () => {
    expect(buildDraftKey({ userId: null }, null)).toBeNull();
  });
});

describe('landingCanvasDraft — form', () => {
  it('chỉ giữ trường lưu được, không có leadFormFieldErrors/persistedMeta/linkedFormId', () => {
    const picked = pickDraftForm({
      title: 'a',
      htmlContent: '<p/>',
      leadFormFieldErrors: { x: 1 },
      leadFormPersistedMeta: { keys: [] },
      linkedFormId: 3,
    });
    expect(Object.keys(picked).sort()).toEqual(
      ['customDomainHostname', 'customDomainIsApex', 'domainType', 'htmlContent', 'isPublished', 'leadFormConfig', 'slug', 'title']
    );
  });
  it('bẩn: đổi htmlContent / title / leadFormConfig đều bẩn; thứ tự khoá leadFormConfig thì không', () => {
    const base = { title: 't', htmlContent: 'h', leadFormConfig: { a: 1, b: { c: 2, d: 3 } } };
    const snap = snapshotDraftForm(base);
    expect(isDraftFormDirty({ ...base }, snap)).toBe(false);
    expect(isDraftFormDirty({ ...base, leadFormConfig: { b: { d: 3, c: 2 }, a: 1 } }, snap)).toBe(false);
    expect(isDraftFormDirty({ ...base, htmlContent: 'h2' }, snap)).toBe(true);
    expect(isDraftFormDirty({ ...base, title: 't2' }, snap)).toBe(true);
    expect(isDraftFormDirty({ ...base, leadFormConfig: { a: 2 } }, snap)).toBe(true);
  });
  it('trường phụ ngoài danh sách (leadFormFieldErrors) không làm bẩn', () => {
    const base = { title: 't', htmlContent: 'h' };
    const snap = snapshotDraftForm(base);
    expect(isDraftFormDirty({ ...base, leadFormFieldErrors: { k: 'x' } }, snap)).toBe(false);
  });
});

describe('landingCanvasDraft — serializeMessages', () => {
  it('chỉ 3 tin applied gần nhất giữ previousHtml/suggestedHtml', () => {
    const out = serializeMessages([applied('a'), applied('b'), applied('c'), applied('d'), applied('e')]);
    expect(out[0].previousHtml).toBeUndefined();
    expect(out[0].suggestedHtml).toBeUndefined();
    expect(out[1].previousHtml).toBeUndefined();
    expect(out[2].previousHtml).toBe('prev-c');
    expect(out[3].previousHtml).toBe('prev-d');
    expect(out[4].suggestedHtml).toBe('sug-e');
  });
  it('tin streaming thành error với câu gián đoạn', () => {
    const out = serializeMessages(
      [{ id: 's', role: 'ai', status: 'streaming', content: '', suggestedHtml: 'x' }],
      { interruptedText: 'Bị gián đoạn' }
    );
    expect(out[0].status).toBe('error');
    expect(out[0].content).toBe('Bị gián đoạn');
    expect(out[0].suggestedHtml).toBeUndefined();
  });
  it('tệp đính kèm chỉ giữ metadata (không previewUrl/File)', () => {
    const out = serializeMessages([
      { id: 'u', role: 'user', files: [{ tempId: 't1', originalName: 'a.png', previewUrl: 'blob:x', file: {} }] },
    ]);
    expect(out[0].files[0]).toMatchObject({ tempId: 't1', originalName: 'a.png' });
    expect(out[0].files[0].previewUrl).toBeUndefined();
    expect(out[0].files[0].file).toBeUndefined();
  });
});

describe('landingCanvasDraft — ghi / đọc', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('ghi rồi đọc lại đủ form + messages + baseUpdatedAt', () => {
    const key = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    expect(writeDraft(key, { form: { title: 'x' }, messages: [applied('a')], baseUpdatedAt: 't0' }).ok).toBe(true);
    const d = readDraft(key);
    expect(d.form.title).toBe('x');
    expect(d.messages).toHaveLength(1);
    expect(d.baseUpdatedAt).toBe('t0');
  });

  it('hết dung lượng: ghi lại bản không HTML lịch sử', () => {
    const key = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (v.includes('prev-a')) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    const r = writeDraft(key, { form: null, messages: [applied('a')] });
    expect(r.ok).toBe(true);
    const d = readDraft(key);
    expect(d.messages[0].previousHtml).toBeUndefined();
    expect(d.messages[0].content).toBe('a');
  });

  it('vẫn hết dung lượng sau khi bỏ HTML lịch sử → ok:false, không ném', () => {
    const key = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(writeDraft(key, { form: { title: 'x' }, messages: [] })).toEqual({ ok: false });
  });

  it('storage ném khi đọc → null, không ném', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readDraft('k')).toBeNull();
  });

  it('quá 7 ngày → null và xoá khoá', () => {
    const key = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    writeDraft(key, { form: { title: 'x' }, messages: [] });
    expect(readDraft(key, Date.now() + DRAFT_MAX_AGE_MS + 1000)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('sai phiên bản → null và xoá khoá', () => {
    const key = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    localStorage.setItem(key, JSON.stringify({ v: 99, savedAt: Date.now(), messages: [] }));
    expect(readDraft(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('JSON hỏng → null', () => {
    const key = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    localStorage.setItem(key, '{oops');
    expect(readDraft(key)).toBeNull();
  });

  it('moveDraft chuyển new → id và áp patch', () => {
    const from = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    const to = buildDraftKey({ userId: 1, ownerId: 1 }, 42);
    writeDraft(from, { form: { title: 'x' }, messages: [applied('a')] });
    moveDraft(from, to, { form: null, baseUpdatedAt: 'T' });
    expect(readDraft(from)).toBeNull();
    const d = readDraft(to);
    expect(d.form).toBeNull();
    expect(d.baseUpdatedAt).toBe('T');
    expect(d.messages).toHaveLength(1);
  });

  it('clearDraft xoá đúng khoá; clearAllDrafts chỉ xoá khoá có tiền tố', () => {
    const k1 = buildDraftKey({ userId: 1, ownerId: 1 }, null);
    const k2 = buildDraftKey({ userId: 2, ownerId: 2 }, 7);
    writeDraft(k1, { messages: [] });
    writeDraft(k2, { messages: [] });
    localStorage.setItem('founder_ai_landing_canvas_chat_width', '460');
    clearDraft(k1);
    expect(localStorage.getItem(k1)).toBeNull();
    expect(localStorage.getItem(k2)).not.toBeNull();
    clearAllDrafts();
    expect(localStorage.getItem(k2)).toBeNull();
    expect(localStorage.getItem('founder_ai_landing_canvas_chat_width')).toBe('460');
  });
});
