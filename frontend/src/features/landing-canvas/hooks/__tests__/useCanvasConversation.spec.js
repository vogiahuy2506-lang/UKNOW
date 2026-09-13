import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCanvasConversation, { makeIntents, detectIntent } from '../useCanvasConversation.js';
import {
  generateLandingHtmlWithAi,
  editLandingHtmlWithAi,
} from '../../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  generateLandingHtmlWithAi: vi.fn(),
  editLandingHtmlWithAi: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

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

describe('useCanvasConversation — có files bỏ qua intent, gọi API với files và editingId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('có files khi edit → bỏ qua detectIntent và gọi editLandingHtmlWithAi với files + landingPageId', async () => {
    editLandingHtmlWithAi.mockResolvedValueOnce({
      html: '<div>Đã cập nhật HTML</div>',
    });

    let formState = {
      title: 'Landing test',
      htmlContent: '<div>HTML ban đầu</div>',
      leadFormConfig: { fixedFields: { occupation: { visible: false } } },
    };
    const setForm = vi.fn((updater) => {
      formState = typeof updater === 'function' ? updater(formState) : updater;
    });
    const openTab = vi.fn();

    const { result } = renderHook(() =>
      useCanvasConversation({
        form: formState,
        setForm,
        hasExistingHtml: true,
        openTab,
        editingId: 99,
      })
    );

    const files = [
      { tempId: 'tmp_1', originalName: 'logo.png', contentType: 'image/png', size: 1024 },
    ];

    // Dù prompt là "bật trường nghề nghiệp" (vốn khớp intent lead-form-toggle)
    await act(async () => {
      await result.current.handleSend({
        prompt: 'bật trường nghề nghiệp',
        files,
      });
    });

    // 1) Không match intent local
    expect(openTab).not.toHaveBeenCalled();
    expect(formState.leadFormConfig.fixedFields.occupation.visible).toBe(false);

    // 2) Gọi editLandingHtmlWithAi với files và landingPageId
    expect(editLandingHtmlWithAi).toHaveBeenCalledTimes(1);
    expect(editLandingHtmlWithAi).toHaveBeenCalledWith(
      expect.objectContaining({
        currentHtml: '<div>HTML ban đầu</div>',
        instruction: 'bật trường nghề nghiệp',
        files,
        landingPageId: 99,
      })
    );

    // 3) Message của user trong state có chứa files
    const userMessage = result.current.messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();
    expect(userMessage.files).toEqual(files);
  });

  it('có files khi generate mới → gọi generateLandingHtmlWithAi với files + landingPageId', async () => {
    generateLandingHtmlWithAi.mockResolvedValueOnce({
      html: '<div>Landing HTML mới</div>',
    });

    let formState = {
      title: '',
      htmlContent: '',
    };
    const setForm = vi.fn((updater) => {
      formState = typeof updater === 'function' ? updater(formState) : updater;
    });

    const { result } = renderHook(() =>
      useCanvasConversation({
        form: formState,
        setForm,
        hasExistingHtml: false,
        openTab: vi.fn(),
        editingId: null,
      })
    );

    const files = [
      { tempId: 'tmp_2', originalName: 'brochure.pdf', contentType: 'application/pdf', size: 2048 },
    ];

    await act(async () => {
      await result.current.handleSend({
        prompt: 'Tạo landing page từ tài liệu',
        files,
      });
    });

    expect(generateLandingHtmlWithAi).toHaveBeenCalledTimes(1);
    expect(generateLandingHtmlWithAi).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Tạo landing page từ tài liệu',
        files,
        landingPageId: null,
      })
    );
  });
});
