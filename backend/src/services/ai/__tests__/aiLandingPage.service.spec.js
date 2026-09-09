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

const { default: aiLandingPageService } = await import('../aiLandingPage.service.js');

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

const mockGenerateReturns = (html) => {
  generateWithBudget.mockResolvedValue({
    text: JSON.stringify({ title: 'T', html }),
    blockReason: null,
    finishReason: 'STOP',
  });
};

describe('aiLandingPageService.generate — chốt form data-founderai-capture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  it('form đúng hợp đồng (data-founderai-capture + name=email) → pass, không đổi html', async () => {
    mockGenerateReturns(validFormHtml);
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    expect(result.html).toBe(validFormHtml);
  });

  it('thiếu data-founderai-capture → 422', async () => {
    const html = validFormHtml.replace('data-founderai-capture', '');
    mockGenerateReturns(html);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/data-founderai-capture/) });
  });

  it('có data-founderai-capture nhưng thiếu name="email" → 422', async () => {
    const html = validFormHtml.replace('<input type="email" name="email" />', '<input type="email" />');
    mockGenerateReturns(html);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/email/) });
  });
});

/**
 * PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md PR-2b (bản sửa Review 08/09 tối): leadFormDraft
 * chỉ còn điều khiển occupation/interestArea — KHÔNG có cf_sugg_NN_text (suggestedCustomFieldLabels
 * thành hàng chết, không có đường lưu customFields nào sống được qua LandingCanvasEditor.jsx).
 */
describe('aiLandingPageService.generate — leadFormDraft điều khiển occupation/interestArea', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getContextForLandingAi.mockResolvedValue('');
  });

  const withField = (html, name) =>
    html.replace(
      '<label><input type="checkbox" name="marketingConsent" />',
      `<select name="${name}"><option value="">x</option></select>` +
        '<label><input type="checkbox" name="marketingConsent" />'
    );

  it('leadFormDraft.fixedFields.occupation.visible=true → prompt chứa đúng khoá OCCUPATION_VALUES', async () => {
    mockGenerateReturns(withField(validFormHtml, 'occupation'));
    await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormDraft: { fixedFields: { occupation: { visible: true }, interestArea: { visible: false } } },
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('name="occupation"');
    for (const value of OCCUPATION_VALUES) {
      expect(sentPrompt).toContain(`<option value="${value}">${value}</option>`);
    }
    // interestArea không yêu cầu → không nhúng option interestArea vào prompt
    expect(sentPrompt).not.toContain('name="interestArea"');
  });

  it('leadFormDraft.fixedFields.interestArea.visible=true → prompt chứa đúng khoá INTEREST_AREA_VALUES', async () => {
    mockGenerateReturns(withField(validFormHtml, 'interestArea'));
    await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormDraft: { fixedFields: { occupation: { visible: false }, interestArea: { visible: true } } },
    });
    const sentPrompt = generateWithBudget.mock.calls[0][1].parts[0].text;
    expect(sentPrompt).toContain('name="interestArea"');
    for (const value of INTEREST_AREA_VALUES) {
      expect(sentPrompt).toContain(`<option value="${value}">${value}</option>`);
    }
  });

  it('leadFormDraft không có (hoặc cả hai visible=false) → prompt KHÔNG thêm rule 9, hành vi như cũ', async () => {
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
        leadFormDraft: { fixedFields: { occupation: { visible: true } } },
      })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/occupation/) });
  });

  it('interestArea.visible=true nhưng HTML thiếu name="interestArea" → 422', async () => {
    mockGenerateReturns(validFormHtml); // không có field interestArea
    await expect(
      aiLandingPageService.generate({
        userId: 1,
        prompt: 'landing khoá học',
        leadFormDraft: { fixedFields: { interestArea: { visible: true } } },
      })
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/interestArea/) });
  });

  it('occupation.visible=true và HTML CÓ name="occupation" → pass, không 422', async () => {
    mockGenerateReturns(withField(validFormHtml, 'occupation'));
    const result = await aiLandingPageService.generate({
      userId: 1,
      prompt: 'landing khoá học',
      leadFormDraft: { fixedFields: { occupation: { visible: true } } },
    });
    expect(result.html).toContain('name="occupation"');
  });
});
