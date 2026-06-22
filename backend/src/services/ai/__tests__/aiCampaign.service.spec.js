import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const attachGoogleUrlParts = jest.fn();
const reserve = jest.fn();
const record = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    post: axiosPost,
  },
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
}));

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: {
    getProfile: jest.fn(),
    getContextForPrompt: jest.fn(),
    formatProfileForPrompt: jest.fn(() => ''),
    getFormattedProfileForPrompt: jest.fn(() => Promise.resolve('')),
  },
  serializeProductList: jest.fn(() => ''),
}));

jest.unstable_mockModule('../adminContext.service.js', () => ({
  buildAdminContext: jest.fn(),
}));

jest.unstable_mockModule('../../landingTemplate/landingTemplate.service.js', () => ({
  default: {
    generateLandingPage: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer: jest.fn(),
}));

jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts,
}));

jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve,
    record,
  },
}));

const { default: aiCampaignService } = await import('../aiCampaign.service.js');

describe('aiCampaign.service', () => {
  beforeEach(() => {
    axiosPost.mockReset();
    extractGeminiUsage.mockReset();
    attachGoogleUrlParts.mockReset();
    reserve.mockReset();
    record.mockReset();
  });

  it('passes userId into smart chat quota reservation and usage recording', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 10, outputTokens: 5, totalTokens: 15 });
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }],
            },
          },
        ],
      },
    });

    const response = await aiCampaignService._runChat(
      'system prompt',
      [{ role: 'user', content: 'hello' }],
      [],
      42
    );

    expect(response).toMatchObject({ type: 'text', content: 'ok' });
    expect(reserve).toHaveBeenCalledWith(42, expect.objectContaining({
      requestedMaxOutputTokens: 8192,
    }));
    expect(record).toHaveBeenCalledWith(42, { promptTokens: 10, outputTokens: 5, totalTokens: 15 }, {
      feature: 'smart_chat',
      model: expect.any(String),
    });
  });
});
