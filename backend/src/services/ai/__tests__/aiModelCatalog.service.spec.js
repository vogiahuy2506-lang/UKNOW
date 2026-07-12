import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockRepo = {
  listAiModels: jest.fn(),
  markGoogleModelsMissing: jest.fn(),
  setOnlyEnabledModel: jest.fn(),
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

  describe('setSystemModel', () => {
    const catalogRows = [
      { modelId: 'gemini-2.5-flash', displayName: 'Flash', isEnabled: true, supportsGenerateContent: true },
      { modelId: 'gemini-2.5-pro', displayName: 'Pro', isEnabled: false, supportsGenerateContent: true },
      { modelId: 'gemini-embedding', displayName: 'Embed', isEnabled: false, supportsGenerateContent: false },
    ];

    beforeEach(() => {
      mockRepo.listAiModels.mockResolvedValue(catalogRows);
      mockRepo.setOnlyEnabledModel.mockResolvedValue([]);
    });

    it('enables exactly the chosen model and disables the rest', async () => {
      const result = await catalogService.setSystemModel('gemini-2.5-pro');
      expect(result).toEqual({ systemModel: 'gemini-2.5-pro' });
      expect(mockRepo.setOnlyEnabledModel).toHaveBeenCalledWith('gemini-2.5-pro');
    });

    it('rejects unknown models with 404', async () => {
      await expect(catalogService.setSystemModel('gemini-9000'))
        .rejects.toThrow(expect.objectContaining({ status: 404 }));
      expect(mockRepo.setOnlyEnabledModel).not.toHaveBeenCalled();
    });

    it('rejects models without generateContent support with 400', async () => {
      await expect(catalogService.setSystemModel('gemini-embedding'))
        .rejects.toThrow(expect.objectContaining({ status: 400 }));
      expect(mockRepo.setOnlyEnabledModel).not.toHaveBeenCalled();
    });

    it('rejects empty model id with 400', async () => {
      await expect(catalogService.setSystemModel(''))
        .rejects.toThrow(expect.objectContaining({ status: 400 }));
    });
  });
});
