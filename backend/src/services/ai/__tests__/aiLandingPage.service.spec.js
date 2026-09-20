import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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
} = await import('../aiLandingPage.service.js');

/**
 * Chốt kiểm sau sinh (aiLandingPage.service.js): trang phải có ĐÚNG MỘT
 * <form data-founderai-capture> với name="email" — nếu không, founderai-capture.js
 * không bắt được submit và lead rơi mất lặng lẽ. Trước đây (LANDING_FORM_PLACEHOLDER)
 * server tự chèn placeholder khi AI quên — giờ fail cứng 422 để không phát hành trang
 * có form không hoạt động.
 */
const validFormHtml =
  '<!DOCTYPE html><html lang="vi"><head><script src="https://cdn.tailwindcss.com"></script></head><body>' +
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
          `^\\[LandingAI\\] done mode=generate outcome=error ms=\\d+ finishReason=STOP promptChars=\\d+ htmlChars=${html.length}$`
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
        `^\\[LandingAI\\] done mode=edit outcome=success ms=\\d+ finishReason=STOP promptChars=\\d+ htmlChars=${validFormHtml.length}$`
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
    expect(fullPromptText).toContain('BẮT BUỘC đọc hiểu và tuân thủ chặt chẽ theo các yêu cầu');
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
    mockGenerateReturns(generatedHtml);

    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'Tạo landing',
        assets: [asset1],
      })
    ).rejects.toMatchObject({
      status: 422,
      message: 'AI bịa URL ảnh ngoài hệ thống. Vui lòng thử lại.',
    });
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

  it('(v) không asset → prompt không có khối ẢNH, <img> lạ vẫn 422', async () => {
    const htmlWithFakeImg = validFormHtml.replace(
      '</body>',
      `<img src="https://fake.cdn.com/test.webp" alt="Fake"></body>`
    );
    mockGenerateReturns(htmlWithFakeImg);

    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'Tạo landing không ảnh',
        assets: [],
        documents: [],
      })
    ).rejects.toMatchObject({
      status: 422,
      message: 'AI bịa URL ảnh ngoài hệ thống. Vui lòng thử lại.',
    });

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
    '<!DOCTYPE html><html lang="vi"><head><script src="https://cdn.tailwindcss.com"></script></head><body>' +
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
      '<!DOCTYPE html><html lang="vi"><head><script src="https://cdn.tailwindcss.com"></script></head><body>' +
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


