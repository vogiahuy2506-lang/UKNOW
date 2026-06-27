import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockRepo = {
  listAiModels: jest.fn(),
  markGoogleModelsMissing: jest.fn(),
  updateAiModel: jest.fn(),
  upsertGoogleModel: jest.fn(),
};

jest.unstable_mockModule('../../../repositories/ai/aiModelCatalog.repository.js', () => mockRepo);

const catalogService = await import('../aiModelCatalog.service.js');

describe('aiModelCatalog.service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    catalogService.invalidateCatalogCache();
    process.env.GEMINI_API_KEY = 'test-key';
    mockRepo.markGoogleModelsMissing.mockResolvedValue(0);
    mockRepo.upsertGoogleModel.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('syncs generateContent Gemini chat models with Google metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            description: 'Fast multimodal model',
            inputTokenLimit: 1048576,
            outputTokenLimit: 65536,
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
          {
            name: 'models/gemini-2.5-flash-preview-09-2025',
            displayName: 'Gemini 2.5 Flash Preview',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/text-embedding-004',
            displayName: 'Text Embedding 004',
            supportedGenerationMethods: ['embedContent'],
          },
        ],
      }),
    });

    const result = await catalogService.syncModelsFromGoogle();

    expect(result).toEqual(expect.objectContaining({
      fetched: 3,
      seen: 1,
      generateContent: 1,
      skippedUnsupported: 1,
      skippedIrrelevant: 1,
    }));
    expect(mockRepo.upsertGoogleModel).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      description: 'Fast multimodal model',
      supportsGenerateContent: true,
    }));
    expect(mockRepo.upsertGoogleModel).toHaveBeenCalledTimes(1);
    expect(mockRepo.markGoogleModelsMissing).toHaveBeenCalledWith(expect.objectContaining({
      seenModelIds: ['gemini-2.5-flash'],
    }));
  });
});
