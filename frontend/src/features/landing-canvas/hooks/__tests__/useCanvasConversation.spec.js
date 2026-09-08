import { describe, expect, it, vi } from 'vitest';
import { makeIntents, detectIntent } from '../useCanvasConversation.js';

const tc = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

function runIntent(prompt, initialForm) {
  let form = initialForm;
  const setForm = (updater) => {
    form = typeof updater === 'function' ? updater(form) : updater;
  };
  const openTab = vi.fn();
  const intents = makeIntents(tc);
  const result = detectIntent(prompt, { setForm, openTab, intents });
  return { result, form, openTab };
}

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-1 việc 4.
 *
 * Schema đầy đủ (khôi phục ở landingLeadFormConfig.js, commit b8b9725c) chỉ có 2 trường CỐ
 * ĐỊNH bật/tắt được: fixedFields.occupation.visible / fixedFields.interestArea.visible.
 * Trước bản vá, ý định "lead-form-toggle" nhận diện các từ khoá cũ (sđt/tên/email/địa chỉ/
 * công ty/ghi chú...) và ghi `cfg.fields[key] = {...}` lên một MẢNG không còn tồn tại trong
 * schema đầy đủ — no-op câm lặng, người dùng gõ lệnh mà không có gì xảy ra.
 */
describe('useCanvasConversation — intent lead-form-toggle (PR-2d-1 việc 4)', () => {
  it('"bật trường nghề nghiệp" → ghi fixedFields.occupation.visible = true', () => {
    const { result, form } = runIntent('bật trường nghề nghiệp', {
      leadFormConfig: { fixedFields: { occupation: { visible: false } } },
    });
    expect(result.matched).toBe(true);
    expect(result.key).toBe('lead-form-toggle');
    expect(form.leadFormConfig.fixedFields.occupation.visible).toBe(true);
  });

  it('"tắt trường chủ đề quan tâm" → ghi fixedFields.interestArea.visible = false', () => {
    const { result, form } = runIntent('tắt trường chủ đề quan tâm', {
      leadFormConfig: { fixedFields: { interestArea: { visible: true } } },
    });
    expect(result.matched).toBe(true);
    expect(form.leadFormConfig.fixedFields.interestArea.visible).toBe(false);
  });

  it('tên trường tiếng Anh "occupation" cũng khớp (động từ bật/tắt vẫn tiếng Việt)', () => {
    const { form } = runIntent('bật field occupation', {
      leadFormConfig: { fixedFields: { occupation: { visible: false } } },
    });
    expect(form.leadFormConfig.fixedFields.occupation.visible).toBe(true);
  });

  it('"tắt trường công ty" (khoá cũ không còn nghĩa trong schema đầy đủ) → KHÔNG đổi state, trả lời hướng dẫn vào Form đăng ký', () => {
    const { result, form, openTab } = runIntent('tắt trường công ty', {
      leadFormConfig: { fixedFields: { occupation: { visible: true } } },
    });
    expect(result.matched).toBe(true);
    expect(form.leadFormConfig.fixedFields.occupation.visible).toBe(true); // không đổi
    expect(result.message).toContain('intentLeadFormFieldUnsupported');
    expect(openTab).toHaveBeenCalledWith('lead-form');
  });

  it('kết quả không còn ghi lên leadFormConfig.fields (mảng của schema tối giản cũ)', () => {
    const { form } = runIntent('bật trường nghề nghiệp', { leadFormConfig: {} });
    expect(form.leadFormConfig.fields).toBeUndefined();
    expect(form.leadFormConfig.fixedFields.occupation.visible).toBe(true);
  });

  it('prompt ngắn không khớp intent nào → matched=false, không ném lỗi', () => {
    const { result } = runIntent('chào bạn', { leadFormConfig: {} });
    expect(result.matched).toBe(false);
  });
});
