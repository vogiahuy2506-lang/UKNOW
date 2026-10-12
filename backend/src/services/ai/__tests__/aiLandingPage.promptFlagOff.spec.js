/**
 * PR-7a — cờ `AI_LANDING_FORM_MODE` TẮT thì prompt SINH và SỬA của AI landing phải GIỐNG TỪNG BYTE bản trước PR-7a.
 *
 * Hash bên dưới đo bằng sha256 của chuỗi prompt gửi cho model, trên bản `1fc35d52` (trước PR-7a, chạy chính file này ở worktree tách ra
 * từ commit đó) rồi ghim lại. PR-7a đụng vào đúng các đoạn prompt đó (luật chỗ trống có loại) nên đây là chốt "cờ tắt → không đổi gì":
 * ai sửa chữ prompt ở nhánh cờ TẮT thì ca này đỏ và phải cố ý cập nhật hash (kèm lý do trong commit).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'node:crypto';

const getContextForLandingAi = jest.fn(async () => '');
const generateWithBudget = jest.fn();

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: { getContextForLandingAi },
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: { generateWithBudget },
}));

const { default: aiLandingPageService } = await import('../aiLandingPage.service.js');

const SHELL_HEAD =
  '<!DOCTYPE html><html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<script src="https://cdn.tailwindcss.com"></script></head><body>';
const CAPTURE_FORM =
  '<form data-founderai-capture><input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  '<label><input type="checkbox" name="marketingConsent" /> Đồng ý</label><button type="submit">Đăng ký</button></form>' +
  '<div class="founderai-capture-success" style="display:none"></div><div class="founderai-capture-error" style="display:none"></div>';
const HTML_CAPTURE = `${SHELL_HEAD}<section>${CAPTURE_FORM}</section></body></html>`;
const HTML_BARE_SLOT = `${SHELL_HEAD}<section><div data-founderai-form-slot></div></section></body></html>`;
const HTML_TYPED_SLOT = `${SHELL_HEAD}<section><div data-founderai-form-slot="booking"></div></section></body></html>`;

const LEAD_FORM_CONFIG = {
  fixedFields: { occupation: { visible: true }, interestArea: { visible: false } },
  customFields: [
    { key: 'cf_chuc_vu_ab12', type: 'text', labelVi: 'Chức vụ', required: false, options: [] },
    { key: 'cf_gio_ef56', type: 'select', labelVi: 'Khung giờ', required: true, options: [{ value: 'sang', labelVi: 'Sáng' }] },
  ],
};

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const sentPrompt = () => generateWithBudget.mock.calls[0][1].parts[0].text;

async function promptOf(run) {
  generateWithBudget.mockClear();
  // Chỉ cần prompt ĐÃ GỬI; HTML giả của model có thể trượt chốt kiểm sau đó (vd thiếu ô nghề nghiệp) — không liên quan tới ca này.
  await run().catch(() => {});
  return sha(sentPrompt());
}

const editCase = (currentHtml, extra = {}) => () => aiLandingPageService.editHtml({
  userId: 1,
  currentHtml,
  instruction: 'Đổi màu nút thành xanh',
  ...extra,
});

describe('cờ AI_LANDING_FORM_MODE tắt → prompt AI landing giữ nguyên từng byte (chốt PR-7a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AI_LANDING_FORM_MODE;
    delete process.env.AI_LANDING_EDIT_MODE;
    getContextForLandingAi.mockResolvedValue('');
  });
  afterEach(() => {
    delete process.env.AI_LANDING_FORM_MODE;
    delete process.env.AI_LANDING_EDIT_MODE;
  });

  it('hash prompt sinh (vi có leadFormConfig, en không) + sửa (vá / viết lại; có chỗ trống trần / có loại / không có; có khoá khai báo)', async () => {
    const hashes = {};

    generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', html: HTML_CAPTURE }), finishReason: 'STOP' });
    hashes.generateVi = await promptOf(() => aiLandingPageService.generate({
      userId: 1, prompt: 'landing khoá học', titleHint: 'Khoá học A', leadFormConfig: LEAD_FORM_CONFIG,
    }));
    hashes.generateEn = await promptOf(() => aiLandingPageService.generate({
      userId: 1, prompt: 'course landing', contentLocale: 'en',
    }));

    generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', edits: [] }), finishReason: 'STOP' });
    hashes.patchNoSlot = await promptOf(editCase(HTML_CAPTURE));
    hashes.patchBareSlot = await promptOf(editCase(HTML_BARE_SLOT));
    hashes.patchTypedSlot = await promptOf(editCase(HTML_TYPED_SLOT));
    hashes.patchDeclaredFields = await promptOf(editCase(HTML_CAPTURE, { leadFormConfig: LEAD_FORM_CONFIG }));

    process.env.AI_LANDING_EDIT_MODE = 'full';
    generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', html: HTML_CAPTURE }), finishReason: 'STOP' });
    hashes.fullNoSlot = await promptOf(editCase(HTML_CAPTURE));
    generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', html: HTML_TYPED_SLOT }), finishReason: 'STOP' });
    hashes.fullTypedSlot = await promptOf(editCase(HTML_TYPED_SLOT));

    expect(hashes).toEqual({
      generateVi: 'b2a85fe6305c0015',
      generateEn: '1833c4bf2f1b17a9',
      patchNoSlot: '1e1e9df62645892b',
      patchBareSlot: '7558ee80273787ca',
      patchTypedSlot: '91904230d1945b44',
      patchDeclaredFields: 'ed66874a7a297269',
      fullNoSlot: '8fe3aeab424f135c',
      fullTypedSlot: '4d83199fb38d4813',
    });
  });

  it('cờ tắt: không thêm khoá formDrafts vào kết quả và không nạp dịch vụ nháp', async () => {
    generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', html: HTML_CAPTURE }), finishReason: 'STOP' });
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    expect(result).not.toHaveProperty('formDrafts');
  });
});
