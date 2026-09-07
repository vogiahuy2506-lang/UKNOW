import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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
 * server tự chèn placeholder khi AI quên — giờ fail cứng 502 để không phát hành trang
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

  it('thiếu data-founderai-capture → 502', async () => {
    const html = validFormHtml.replace('data-founderai-capture', '');
    mockGenerateReturns(html);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/data-founderai-capture/) });
  });

  it('có data-founderai-capture nhưng thiếu name="email" → 502', async () => {
    const html = validFormHtml.replace('<input type="email" name="email" />', '<input type="email" />');
    mockGenerateReturns(html);
    await expect(
      aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' })
    ).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/email/) });
  });
});
