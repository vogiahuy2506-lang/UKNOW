import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import toast from 'react-hot-toast';
import useCanvasConversation, { makeIntents, detectIntent } from '../useCanvasConversation.js';
import {
  generateLandingHtmlWithAi,
  editLandingHtmlWithAi,
} from '../../../landing-pages/services/landingPagesAdminApi.service.js';

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  generateLandingHtmlWithAi: vi.fn(),
  editLandingHtmlWithAi: vi.fn(),
}));

// react-hot-toast thật: `toast` là HÀM có thêm .success/.error — hook gọi `toast(...)` trực tiếp
// cho cảnh báo tệp bị bỏ qua, mock dạng object sẽ ném "toast is not a function".
vi.mock('react-hot-toast', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

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

/**
 * 03/10/2026: ý định "dùng tên miền riêng …" từng đặt `domainType:'custom'` + hostname vào form → lúc lưu backend xoá
 * subdomain miễn phí mà không đăng ký gì (production: landing 50, 76, 88, 105). Nay chỉ trả lời, KHÔNG đổi form.
 */
describe('useCanvasConversation — intent set-custom-domain KHÔNG đổi domainType / hostname', () => {
  const PROMPTS = [
    'dùng tên miền riêng lp.example.com',
    'set domain example.com',
    'trỏ domain shop.example.vn',
    'custom domain lp.example.com',
    'tên miền riêng', // không có hostname: trước đây ném TypeError (hostname.split trên null)
  ];
  const FORMS = {
    'trang miễn phí': { slug: 'abc', domainType: 'system', customDomainHostname: 'abc.founderai.biz', customDomainIsApex: false },
    'trang chưa có hostname': { slug: 'abc', domainType: 'system', customDomainHostname: null, customDomainIsApex: false },
    'trang có tên miền riêng': { slug: 'abc', domainType: 'custom', customDomainHostname: 'lp.example.com', customDomainIsApex: true },
  };

  it.each(PROMPTS)('"%s" → có trả lời (matched), không setForm, không mở tab', (prompt) => {
    const setForm = vi.fn();
    const openTab = vi.fn();

    const result = detectIntent(prompt, { setForm, openTab, intents: makeIntents(tc) });

    expect(result.matched).toBe(true);
    expect(result.key).toBe('set-custom-domain');
    expect(result.message).toBe('intentSetDomainUnsupported');
    expect(setForm).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
  });

  it.each(Object.entries(FORMS))('%s: form giữ nguyên domainType / hostname / loại sau mọi câu lệnh tên miền', (_name, initial) => {
    for (const prompt of PROMPTS) {
      const { form } = runIntent(prompt, initial);
      expect(form).toEqual(initial);
    }
  });

  it('câu trả lời đi qua i18n (khoá có trong vi.js và en.js, không còn khoá intentSetDomain cũ)', async () => {
    const { default: vi_ } = await import('../../../../i18n/vi.js');
    const { default: en_ } = await import('../../../../i18n/en.js');
    // Đã có giao diện thật (PR-D): câu trả lời chỉ đường tới đúng nhãn trong Cài đặt trang, không bảo liên hệ hỗ trợ nữa.
    expect(vi_.landingCanvas.canvasConversation.intentSetDomainUnsupported).toContain(vi_.landingCanvas.settingsModal.sections.customDomain.useOwn);
    expect(en_.landingCanvas.canvasConversation.intentSetDomainUnsupported).toContain(en_.landingCanvas.settingsModal.sections.customDomain.useOwn);
    expect(vi_.landingCanvas.canvasConversation.intentSetDomain).toBeUndefined();
    expect(en_.landingCanvas.canvasConversation.intentSetDomain).toBeUndefined();
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

  it('backend bỏ qua vài tệp (skippedAttachments) → HTML vẫn được áp + toast cảnh báo nêu tên tệp, không báo lỗi', async () => {
    // PLAN_TEP_DINH_KEM_LANDING_MOI_DINH_DANG_2026-09-15.md Việc 6 — hình dạng thật của
    // generateLandingHtmlWithAi là body axios: { success, data: { html, skippedAttachments } }.
    generateLandingHtmlWithAi.mockResolvedValueOnce({
      success: true,
      data: {
        html: '<div>Trang có ảnh</div>',
        skippedAttachments: [
          { originalName: 'a.heic', reason: 'Không thể chuyển đổi ảnh HEIC: hỏng' },
          { originalName: 'b.pdf', reason: 'Không đọc được chữ trong tệp (có thể là bản scan)' },
          { originalName: 'c.gif', reason: 'Mỗi lượt chỉ dùng tối đa 3 ảnh và 3 tài liệu' },
          { originalName: 'd.doc', reason: 'Trích xuất tài liệu thất bại' },
        ],
      },
    });

    let formState = { title: '', htmlContent: '' };
    const setForm = vi.fn((updater) => {
      formState = typeof updater === 'function' ? updater(formState) : updater;
    });
    const { result } = renderHook(() =>
      useCanvasConversation({ form: formState, setForm, hasExistingHtml: false, openTab: vi.fn(), editingId: null })
    );

    await act(async () => {
      await result.current.handleSend({ prompt: 'Tạo trang từ tệp', files: [{ tempId: 't1', originalName: 'a.heic' }] });
    });

    expect(formState.htmlContent).toBe('<div>Trang có ảnh</div>');
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
    const [text] = toast.mock.calls[0];
    expect(text).toContain('a.heic — Không thể chuyển đổi ảnh HEIC: hỏng');
    expect(text).toContain('c.gif');
    expect(text).not.toContain('d.doc');
    expect(text).toContain('và 1 tệp khác');
  });
});

describe('useCanvasConversation — điền tên trang từ AI (PLAN_LANDING_GIU_NHAP_KHI_F5 Việc 2)', () => {
  const run = async ({ form, hasExistingHtml, response }) => {
    if (hasExistingHtml) editLandingHtmlWithAi.mockResolvedValueOnce(response);
    else generateLandingHtmlWithAi.mockResolvedValueOnce(response);
    let formState = { ...form };
    const setForm = vi.fn((updater) => {
      formState = typeof updater === 'function' ? updater(formState) : updater;
    });
    const { result } = renderHook(() =>
      useCanvasConversation({ form: formState, setForm, hasExistingHtml, openTab: vi.fn(), editingId: null })
    );
    await act(async () => {
      await result.current.handleSend({ prompt: 'Tạo trang bán khoá học AI cho người mới bắt đầu, phong cách tối giản' });
    });
    return formState;
  };

  it('tạo mới, ô tên trống → điền tên AI trả về (hình dạng thật { success, data: { html, title } })', async () => {
    const state = await run({
      form: { title: '', htmlContent: '' },
      hasExistingHtml: false,
      response: { success: true, data: { html: '<div>Trang</div>', title: 'Khoá học AI cho người mới' } },
    });
    expect(state.htmlContent).toBe('<div>Trang</div>');
    expect(state.title).toBe('Khoá học AI cho người mới');
  });

  it('tạo mới nhưng người dùng ĐÃ đặt tên → giữ nguyên tên người dùng, không đè bằng tên AI', async () => {
    const state = await run({
      form: { title: 'Tên tôi tự đặt', htmlContent: '' },
      hasExistingHtml: false,
      response: { success: true, data: { html: '<div>Trang</div>', title: 'Tên AI gợi ý' } },
    });
    expect(state.title).toBe('Tên tôi tự đặt');
  });

  it('sửa trang có sẵn (không phải tạo mới) → không điền tên dù AI trả title', async () => {
    const state = await run({
      form: { title: '', htmlContent: '<div>Cũ</div>' },
      hasExistingHtml: true,
      response: { success: true, data: { html: '<div>Mới</div>', title: 'Tên AI gợi ý' } },
    });
    expect(state.htmlContent).toBe('<div>Mới</div>');
    expect(state.title).toBe('');
  });
});

/**
 * PR-9 (B-4): server báo tiến độ trên luồng sinh / sửa ('generating' | 'fixing') → hook ghi `stage` vào tin AI đang chờ
 * để ChatMessage hiện chữ thay cho "Thinking…"; xong thì tin chuyển sang trạng thái thường.
 */
describe('useCanvasConversation — tiến độ (stage) từ luồng của server (PR-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = (hasExistingHtml) => {
    let formState = { title: '', htmlContent: hasExistingHtml ? '<div>Cũ</div>' : '' };
    const setForm = vi.fn((updater) => {
      formState = typeof updater === 'function' ? updater(formState) : updater;
    });
    return renderHook(() => useCanvasConversation({ form: formState, setForm, hasExistingHtml, openTab: vi.fn(), editingId: null }));
  };

  it.each([
    ['sinh mới', false, () => generateLandingHtmlWithAi],
    ['sửa trang có sẵn', true, () => editLandingHtmlWithAi],
  ])('%s: truyền onStage cho dịch vụ; stage ghi vào tin streaming; xong thì tin hết streaming', async (_name, hasExistingHtml, pick) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let received = null;
    pick().mockImplementationOnce(async ({ onStage }) => {
      received = onStage;
      onStage('generating');
      await gate;
      onStage('fixing');
      return { success: true, data: { html: '<div>Mới</div>', title: 'T', changeSummary: 'Đã đổi' } };
    });

    const { result } = setup(hasExistingHtml);
    let sending;
    await act(async () => {
      sending = result.current.handleSend({ prompt: 'Tạo landing page cho khoá học tiếng Anh giao tiếp' });
    });

    expect(typeof received).toBe('function');
    const streaming = () => result.current.messages.find((m) => m.role === 'ai' && m.status === 'streaming');
    expect(streaming().stage).toBe('generating');

    await act(async () => {
      release();
      await sending;
    });
    expect(streaming()).toBeUndefined();
    expect(result.current.messages.some((m) => m.role === 'ai' && m.status === 'applied')).toBe(true);
  });
});
