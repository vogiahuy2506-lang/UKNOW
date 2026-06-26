import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockDb = {
  query: jest.fn(),
};

const mockCatalogService = {
  getCatalog: jest.fn(),
  getDefaultModel: jest.fn(),
  getEnabledModelIds: jest.fn(),
};

const mockCatalogRepo = {
  getUserPreferredModel: jest.fn(),
  updateUserPreferredModel: jest.fn(),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockDb,
}));

jest.unstable_mockModule('../aiModelCatalog.service.js', () => mockCatalogService);

jest.unstable_mockModule('../../../repositories/ai/aiModelCatalog.repository.js', () => mockCatalogRepo);

const policy = await import('../aiModelPolicy.service.js');

const fullCatalog = [
  { modelId: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', tierRank: 10, isEnabled: true, supportsGenerateContent: true },
  { modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', tierRank: 20, isEnabled: true, supportsGenerateContent: true },
  { modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', tierRank: 30, isEnabled: false, supportsGenerateContent: true },
];
const enabledCatalog = fullCatalog.filter((row) => row.isEnabled);

describe('aiModelPolicy.service dynamic catalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue({
      rows: [{ role: 'user', ai_model: 'gemini-2.5-pro', preferred_ai_model: 'gemini-2.5-pro' }],
    });
    mockCatalogService.getCatalog.mockImplementation(async ({ enabledOnly } = {}) => (enabledOnly ? enabledCatalog : fullCatalog));
    mockCatalogService.getDefaultModel.mockResolvedValue('gemini-2.5-flash');
    mockCatalogService.getEnabledModelIds.mockResolvedValue(enabledCatalog.map((row) => row.modelId));
    mockCatalogRepo.updateUserPreferredModel.mockResolvedValue('gemini-2.5-flash');
  });

  it('clamps a disabled plan max down to the highest enabled model at or below that rank', async () => {
    await expect(policy.getUserMaxAllowedModel(123)).resolves.toBe('gemini-2.5-flash');
    await expect(policy.resolveAllowedModel(123, 'gemini-2.5-pro')).resolves.toBe('gemini-2.5-flash');
  });

  it('returns allowed model metadata and a clamped preferred model', async () => {
    const result = await policy.getAllowedModelsForUser(123);

    expect(result.maxModel).toBe('gemini-2.5-flash');
    expect(result.modelIds).toEqual(['gemini-2.5-flash-lite', 'gemini-2.5-flash']);
    expect(result.preferredModel).toBe('gemini-2.5-flash');
    expect(result.models[0]).toEqual(expect.objectContaining({
      model_id: 'gemini-2.5-flash-lite',
      display_name: 'Gemini 2.5 Flash Lite',
    }));
  });

  it('rejects saving a preferred model outside allowed models', async () => {
    await expect(policy.savePreferredModelForUser(123, 'gemini-2.5-pro')).rejects.toThrow('Model AI không nằm trong gói');
    expect(mockCatalogRepo.updateUserPreferredModel).not.toHaveBeenCalled();
  });
});
