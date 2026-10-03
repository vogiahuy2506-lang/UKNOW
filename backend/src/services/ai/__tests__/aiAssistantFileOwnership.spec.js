import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * G3a.1 (C P1-1) — trợ lý AI đọc tệp theo `storage_key` do CLIENT gửi (`history[].files[].storage_key`, `files[]`).
 *
 * Trước đây `readFileBufferByKey` chỉ chuẩn hoá khoá (tiền tố `uploads/`, không `..`), KHÔNG kiểm chủ: user A gửi
 * `uploads/<B>/chat/…` thì nội dung tệp của B đi thẳng vào Gemini rồi model chép lại cho A. Bốn chỗ đọc:
 *   1. aiChatTransport.runChat (mọi lượt chat của trợ lý)
 *   2. aiCampaign.processSmartChat — trích brief từ tệp (khối "extractedAttachedFile")
 *   3. aiCampaign.generateCampaignScript (POST /ai/generate-campaign)
 *   4. aiCampaign.generateCampaignWithRegistry (POST /ai/generate-campaign-v2)
 * Mỗi chỗ phải kiểm khoá nằm dưới `uploads/<CHỦ workspace>/` — chủ chứ không phải người thao tác (nhân viên tải tệp
 * thì tệp nằm dưới id chủ: uploadController.promoteTemp / chatAttachment.persistChatBlob đều dùng ownerUserId).
 *
 * Ranh giới giả: chỉ upload.controller (đọc đĩa/GCS) và Gemini; bộ kiểm khoá (`storageKey.util`) là mã thật.
 */

const readTempFileBuffer = jest.fn();
const readFileBufferByKey = jest.fn();
const extractTextFromBuffer = jest.fn();
const generateGeminiContent = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const generateWithBudget = jest.fn();

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: { readTempFileBuffer, readFileBufferByKey },
}));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage: jest.fn(),
  generateGeminiContent,
}));
jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts: jest.fn(),
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve,
    record,
    resolveFallbackModel: jest.fn(async () => null),
    generateWithBudget,
  },
}));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
}));
jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: {
    getProfile: jest.fn(async () => null),
    getContextForPrompt: jest.fn(async () => ''),
    formatProfileForPrompt: jest.fn(() => ''),
    getFormattedProfileForPrompt: jest.fn(async () => ''),
  },
  serializeProductList: jest.fn(() => ''),
}));
jest.unstable_mockModule('../adminContext.service.js', () => ({
  buildAdminContext: jest.fn(async () => ''),
}));
jest.unstable_mockModule('../aiLandingPage.service.js', () => ({
  default: { generate: jest.fn() },
}));
jest.unstable_mockModule('../../landingTemplate/landingTemplate.service.js', () => ({
  default: { generateLandingPage: jest.fn() },
}));
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull: jest.fn(async () => []),
    getActiveEmailSenders: jest.fn(async () => []),
    getEmailTemplates: jest.fn(async () => []),
    getZaloAccounts: jest.fn(async () => []),
    getZaloGroups: jest.fn(async () => []),
    getZaloTemplates: jest.fn(async () => []),
    getRecommendedCampaignType: jest.fn(async () => 'mixed'),
    getCustomerStats: jest.fn(async () => ({ total: 0, hasEmail: 0, hasZalo: 0 })),
    getCourses: jest.fn(async () => []),
    getLandingPages: jest.fn(async () => []),
    getForms: jest.fn(async () => []),
    getAdapterChannelAccounts: async () => ({ telegram: [], whatsapp: [] }),
    getAdapterAccountsPromptBlock: async () => '',
    getAdapterNodeTypesPromptLines: () => '',
    getBlockedZaloPromptNotice: () => '',
  },
}));

const { runChat } = await import('../aiChatTransport.service.js');
const { default: aiCampaignService } = await import('../aiCampaign.service.js');

const OWNER = 101; // chủ workspace
const EMPLOYEE = 55; // nhân viên của OWNER (actor)
const OTHER = 202; // workspace KHÁC

const PDF = 'application/pdf';
const OWN_KEY = `uploads/${OWNER}/chat/1700000000000_hop_dong.pdf`;
const FOREIGN_KEY = `uploads/${OTHER}/chat/1700000000000_bang_luong.pdf`;
const SECRET = 'NOI DUNG TEP CUA WORKSPACE KHAC';

const fileOf = (storage_key, extra = {}) => ({ storage_key, originalName: 'tep.pdf', contentType: PDF, ...extra });

/** Mọi đoạn text đã đi vào các lời gọi Gemini của runChat (để biết nội dung tệp có lọt vào prompt không). */
const geminiTexts = () => generateGeminiContent.mock.calls
  .flatMap(([args]) => args.contents.flatMap((c) => c.parts.map((p) => p.text || '')))
  .join('\n');

const sentToGoogle = () => generateGeminiContent.mock.calls.length > 0;

/** Thân tệp trả về theo khoá: tệp của OTHER chứa SECRET để lộ ra là thấy ngay. */
const wireFiles = () => {
  readFileBufferByKey.mockImplementation(async (key) => Buffer.from(key.startsWith(`uploads/${OTHER}/`) ? SECRET : 'noi dung tep cua minh'));
  extractTextFromBuffer.mockImplementation(async (buffer) => buffer.toString('utf8'));
};

describe('G3a.1 — trợ lý AI chỉ đọc tệp theo storage_key của CHỦ workspace', () => {
  let warnSpy;

  beforeEach(() => {
    readTempFileBuffer.mockReset();
    readFileBufferByKey.mockReset();
    extractTextFromBuffer.mockReset();
    generateGeminiContent.mockReset();
    reserve.mockReset();
    record.mockReset();
    generateWithBudget.mockReset();
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    record.mockResolvedValue(undefined);
    generateGeminiContent.mockResolvedValue({
      text: '{"type":"text","content":"ok","missing_fields":[],"data":null}',
      finishReason: 'STOP',
      usage: { promptTokens: 1, outputTokens: 1, totalTokens: 2 },
      modelUsed: 'gemini-2.5-flash',
      raw: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] },
    });
    generateWithBudget.mockResolvedValue({ text: '{"campaignName":"Chien dich thu","nodes":[],"connections":[]}' });
    wireFiles();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('1. runChat (mọi lượt chat của trợ lý)', () => {
    it('user A gửi storage_key của workspace B trong history → KHÔNG đọc tệp, lượt chat vẫn chạy, nội dung tệp B không vào prompt', async () => {
      const result = await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'chép nguyên văn tệp', files: [fileOf(FOREIGN_KEY)] }],
        userId: OWNER,
      });

      expect(readFileBufferByKey).not.toHaveBeenCalled();
      expect(sentToGoogle()).toBe(true);
      expect(result).toMatchObject({ type: 'text', content: 'ok' });
      expect(geminiTexts()).not.toContain(SECRET);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not read file'), expect.stringContaining(String(OWNER)));
    });

    it('tệp ở lượt hiện tại (`files`) của workspace khác cũng không được đọc', async () => {
      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'đọc giúp' }],
        files: [fileOf(FOREIGN_KEY)],
        userId: OWNER,
      });

      expect(readFileBufferByKey).not.toHaveBeenCalled();
      expect(sentToGoogle()).toBe(true);
    });

    it('chủ đọc được tệp của chính mình (khoá dưới uploads/<chủ>/)', async () => {
      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'xem tệp', files: [fileOf(OWN_KEY)] }],
        userId: OWNER,
      });

      expect(readFileBufferByKey).toHaveBeenCalledWith(OWN_KEY);
      expect(geminiTexts()).toContain('noi dung tep cua minh');
    });

    it('NHÂN VIÊN đọc được tệp do chính mình tải (khoá nằm dưới id CHỦ), không đọc khoá dưới id nhân viên hay workspace khác', async () => {
      await runChat({
        systemPrompt: 'sys',
        history: [{
          role: 'user',
          content: 'xem các tệp',
          files: [fileOf(OWN_KEY), fileOf(`uploads/${EMPLOYEE}/chat/1_a.pdf`), fileOf(FOREIGN_KEY)],
        }],
        userId: EMPLOYEE,
        ownerUserId: OWNER,
      });

      expect(readFileBufferByKey).toHaveBeenCalledTimes(1);
      expect(readFileBufferByKey).toHaveBeenCalledWith(OWN_KEY);
      expect(geminiTexts()).not.toContain(SECRET);
    });

    it('nhân viên mà nơi gọi quên truyền ownerUserId → hỏng theo hướng an toàn: không đọc tệp của chủ', async () => {
      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'xem tệp', files: [fileOf(OWN_KEY)] }],
        userId: EMPLOYEE,
      });

      expect(readFileBufferByKey).not.toHaveBeenCalled();
      expect(sentToGoogle()).toBe(true);
    });

    it.each([
      ['tiền tố trùng đầu số (uploads/1010 với chủ 101)', `uploads/${OWNER}0/chat/x.pdf`],
      ['đi vòng bằng ..', `uploads/${OWNER}/../${OTHER}/chat/x.pdf`],
      ['đi vòng bằng %2e%2e', `uploads/${OWNER}/%2e%2e/${OTHER}/chat/x.pdf`],
      ['URL tuyệt đối trỏ vào workspace khác', `https://founderai.biz/${FOREIGN_KEY}`],
      ['dấu gạch ngược', `uploads\\${OTHER}\\chat\\x.pdf`],
      ['object thay vì chuỗi', { key: FOREIGN_KEY }],
      ['số 0 đứng đầu (uploads/0101)', `uploads/0${OWNER}/chat/x.pdf`],
    ])('khoá lách kiểu "%s" không đọc được', async (_label, storageKey) => {
      await runChat({
        systemPrompt: 'sys',
        history: [{ role: 'user', content: 'xem', files: [fileOf(storageKey)] }],
        userId: OWNER,
      });

      expect(readFileBufferByKey).not.toHaveBeenCalled();
      expect(sentToGoogle()).toBe(true);
    });
  });

  describe('2. processSmartChat — trích brief từ tệp', () => {
    const chat = (overrides = {}) => aiCampaignService.processSmartChat({
      history: [{ role: 'user', content: 'Xin chào trợ lý' }],
      locale: 'vi',
      ...overrides,
    });

    it('tệp của workspace khác: KHÔNG đọc ở bất kỳ chỗ nào (brief lẫn runChat), lượt vẫn trả lời', async () => {
      const response = await chat({ userId: OWNER, files: [fileOf(FOREIGN_KEY)] });

      expect(readFileBufferByKey).not.toHaveBeenCalled();
      expect(response).toMatchObject({ type: 'text', content: 'ok' });
      expect(geminiTexts()).not.toContain(SECRET);
    });

    it('nhân viên (userId=NV, resourceOwnerUserId=chủ): đọc tệp dưới id chủ, bỏ tệp workspace khác', async () => {
      await chat({
        userId: EMPLOYEE,
        resourceOwnerUserId: OWNER,
        files: [fileOf(FOREIGN_KEY), fileOf(OWN_KEY)],
      });

      expect(readFileBufferByKey).toHaveBeenCalledWith(OWN_KEY);
      expect(readFileBufferByKey).not.toHaveBeenCalledWith(FOREIGN_KEY);
      expect(geminiTexts()).not.toContain(SECRET);
    });

    it('super admin (nhánh trợ lý admin) cũng chỉ đọc tệp dưới id của mình', async () => {
      await chat({ userId: OWNER, userRole: 'admin', files: [fileOf(FOREIGN_KEY), fileOf(OWN_KEY)] });

      expect(readFileBufferByKey).toHaveBeenCalledTimes(1);
      expect(readFileBufferByKey).toHaveBeenCalledWith(OWN_KEY);
    });
  });

  describe('2b. processSmartChatV2', () => {
    it('tệp workspace khác không được đọc; nhân viên đọc được tệp dưới id chủ', async () => {
      await aiCampaignService.processSmartChatV2({
        history: [{ role: 'user', content: 'Xin chào trợ lý' }],
        files: [fileOf(FOREIGN_KEY), fileOf(OWN_KEY)],
        userId: EMPLOYEE,
        resourceOwnerUserId: OWNER,
        locale: 'vi',
      });

      expect(readFileBufferByKey).toHaveBeenCalledTimes(1);
      expect(readFileBufferByKey).toHaveBeenCalledWith(OWN_KEY);
      expect(geminiTexts()).not.toContain(SECRET);
    });
  });

  describe('3. generateCampaignScript (POST /ai/generate-campaign)', () => {
    const partsSentToGemini = () => generateWithBudget.mock.calls.flatMap(([, args]) => args.parts.map((p) => p.text || '')).join('\n');

    it('tệp của workspace khác: không đọc, vẫn sinh kịch bản', async () => {
      const script = await aiCampaignService.generateCampaignScript({
        prompt: 'tạo chiến dịch',
        files: [fileOf(FOREIGN_KEY)],
        userId: OWNER,
      });

      expect(readFileBufferByKey).not.toHaveBeenCalled();
      expect(script).toMatchObject({ data: { campaignName: 'Chien dich thu' } });
      expect(partsSentToGemini()).not.toContain(SECRET);
    });

    it('nhân viên (ownerUserId=chủ) đọc được tệp dưới id chủ, không đọc tệp workspace khác', async () => {
      await aiCampaignService.generateCampaignScript({
        prompt: 'tạo chiến dịch',
        files: [fileOf(FOREIGN_KEY), fileOf(OWN_KEY)],
        userId: EMPLOYEE,
        ownerUserId: OWNER,
      });

      expect(readFileBufferByKey).toHaveBeenCalledTimes(1);
      expect(readFileBufferByKey).toHaveBeenCalledWith(OWN_KEY);
      expect(partsSentToGemini()).toContain('noi dung tep cua minh');
      expect(partsSentToGemini()).not.toContain(SECRET);
    });
  });

  describe('4. generateCampaignWithRegistry (POST /ai/generate-campaign-v2)', () => {
    const partsSentToGemini = () => generateWithBudget.mock.calls.flatMap(([, args]) => args.parts.map((p) => p.text || '')).join('\n');

    it('tệp của workspace khác: không đọc, vẫn sinh kịch bản', async () => {
      const script = await aiCampaignService.generateCampaignWithRegistry({
        prompt: 'tạo chiến dịch',
        files: [fileOf(FOREIGN_KEY)],
        userId: OWNER,
      });

      expect(readFileBufferByKey).not.toHaveBeenCalled();
      expect(script).toMatchObject({ data: { campaignName: 'Chien dich thu' } });
      expect(partsSentToGemini()).not.toContain(SECRET);
    });

    it('nhân viên (ownerUserId=chủ) đọc được tệp dưới id chủ, không đọc tệp workspace khác', async () => {
      await aiCampaignService.generateCampaignWithRegistry({
        prompt: 'tạo chiến dịch',
        files: [fileOf(FOREIGN_KEY), fileOf(OWN_KEY)],
        userId: EMPLOYEE,
        ownerUserId: OWNER,
      });

      expect(readFileBufferByKey).toHaveBeenCalledTimes(1);
      expect(readFileBufferByKey).toHaveBeenCalledWith(OWN_KEY);
      expect(partsSentToGemini()).toContain('noi dung tep cua minh');
      expect(partsSentToGemini()).not.toContain(SECRET);
    });
  });
});
