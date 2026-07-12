import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCatalogService = {
  getCatalog: jest.fn(),
};

jest.unstable_mockModule('../aiModelCatalog.service.js', () => mockCatalogService);

const policy = await import('../aiModelPolicy.service.js');

const fullCatalog = [
  {
    modelId: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    isEnabled: false,
    supportsGenerateContent: true,
  },
  {
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    isEnabled: false,
    supportsGenerateContent: true,
  },
  {
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    inputTokenLimit: 1048576,
    outputTokenLimit: 131072,
    isEnabled: true,
    supportsGenerateContent: true,
  },
];
const enabledCatalog = fullCatalog.filter((row) => row.isEnabled);

describe('aiModelPolicy.service — single system model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogService.getCatalog.mockImplementation(async ({ enabledOnly } = {}) => (enabledOnly ? enabledCatalog : fullCatalog));
  });

  it('returns the system model regardless of requested/saved model', async () => {
    await expect(policy.getSystemModel()).resolves.toBe('gemini-2.5-pro');
    await expect(policy.getUserMaxAllowedModel(123)).resolves.toBe('gemini-2.5-pro');
    await expect(policy.resolveAllowedModel(123, 'gemini-2.5-flash')).resolves.toBe('gemini-2.5-pro');
    await expect(policy.resolveAllowedModel(null, 'some-unknown-model')).resolves.toBe('gemini-2.5-pro');
  });

  it('picks the highest-capability model if multiple are accidentally enabled', async () => {
    const multiEnabled = fullCatalog.map((row) => ({ ...row, isEnabled: true }));
    mockCatalogService.getCatalog.mockImplementation(async ({ enabledOnly } = {}) => (enabledOnly ? multiEnabled : fullCatalog));
    await expect(policy.getSystemModel()).resolves.toBe('gemini-2.5-pro');
  });

  it('lists exactly one allowed model (the system model) for legacy clients', async () => {
    const result = await policy.getAllowedModelsForUser(123);
    expect(result.maxModel).toBe('gemini-2.5-pro');
    expect(result.modelIds).toEqual(['gemini-2.5-pro']);
    expect(result.preferredModel).toBe('gemini-2.5-pro');
    expect(result.models).toHaveLength(1);
    expect(result.models[0]).toEqual(expect.objectContaining({
      model_id: 'gemini-2.5-pro',
      output_token_limit: 131072,
    }));
  });

  it('savePreferredModelForUser is a no-op that returns the system model', async () => {
    await expect(policy.savePreferredModelForUser(123, 'gemini-2.5-flash'))
      .resolves.toEqual({ preferredModel: 'gemini-2.5-pro' });
  });

  it('falls back to the default model when the enabled catalog is empty', async () => {
    mockCatalogService.getCatalog.mockResolvedValue([]);
    await expect(policy.getSystemModel()).resolves.toBe('gemini-2.5-flash');
  });
});
