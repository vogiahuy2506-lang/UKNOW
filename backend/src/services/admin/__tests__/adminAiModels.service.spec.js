/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-8 (audit_ai.md C-16): trang Quan ly model AI hien chi phi THUC DO moi luot goi
 * (30 ngay) lay tu CUNG service voi trang Chi phi AI; so uoc tinh chi con cho model chua co luot goi nao.
 */
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetCatalog = jest.fn();
const mockGetAvgAiTokenUsage = jest.fn();
const mockGetMeasuredCostByModel = jest.fn();

jest.unstable_mockModule('../../ai/aiModelCatalog.service.js', () => ({
  getCatalog: mockGetCatalog,
  invalidateCatalogCache: jest.fn(),
  setFallbackModel: jest.fn(),
  setSystemModel: jest.fn(),
  syncModelsFromGoogle: jest.fn(),
  updateCatalogModel: jest.fn(),
}));
jest.unstable_mockModule('../../../repositories/admin/aiUsage.repository.js', () => ({
  default: { getAvgAiTokenUsage: mockGetAvgAiTokenUsage },
}));
jest.unstable_mockModule('../aiUsage.service.js', () => ({
  getMeasuredCostByModel: mockGetMeasuredCostByModel,
}));

const { listModels } = await import('../adminAiModels.service.js');

const catalogModel = (modelId) => ({ modelId, displayName: modelId, isEnabled: false });

describe('adminAiModels.listModels - chi phi thuc do moi luot goi', () => {
  const originalRate = process.env.USD_VND_RATE;
  const originalPricing = process.env.AI_PRICING_JSON;

  beforeEach(() => {
    mockGetCatalog.mockReset();
    mockGetAvgAiTokenUsage.mockReset();
    mockGetMeasuredCostByModel.mockReset();
    process.env.USD_VND_RATE = '24000';
    delete process.env.AI_PRICING_JSON;
    mockGetAvgAiTokenUsage.mockResolvedValue({ calls: 0, avgPromptTokens: 0, avgOutputTokens: 0 });
  });

  afterAll(() => {
    if (originalRate === undefined) delete process.env.USD_VND_RATE;
    else process.env.USD_VND_RATE = originalRate;
    if (originalPricing === undefined) delete process.env.AI_PRICING_JSON;
    else process.env.AI_PRICING_JSON = originalPricing;
  });

  it('model co gia + co luot goi: pricing.measured lay tu service chi phi (calls + chi phi moi luot VND)', async () => {
    mockGetCatalog.mockResolvedValue([catalogModel('gemini-3.5-flash')]);
    mockGetMeasuredCostByModel.mockResolvedValue({
      range: '30d',
      byModel: { 'gemini-3.5-flash': { calls: 1593, costUsd: 87, costPerCallUsd: 0.0546, costPerCallVnd: 1311 } },
    });
    const { models } = await listModels();
    expect(mockGetMeasuredCostByModel).toHaveBeenCalledWith({ range: '30d' });
    expect(models[0].pricing).toMatchObject({
      configured: true,
      inputUsdPerM: 1.5,
      outputUsdPerM: 9,
      measured: { calls: 1593, costPerCallVnd: 1311 },
    });
  });

  it('model co gia nhung chua co luot goi: measured = null, van co so uoc tinh (token trung binh mac dinh 10.000/500 -> 468d)', async () => {
    mockGetCatalog.mockResolvedValue([catalogModel('gemini-3.5-flash'), catalogModel('gemini-3.8-flash')]);
    mockGetMeasuredCostByModel.mockResolvedValue({
      range: '30d',
      byModel: { 'gemini-3.8-flash': { calls: 305, costUsd: 6.4, costPerCallUsd: 0.021, costPerCallVnd: 504 } },
    });
    const { models, basis } = await listModels();
    expect(basis).toBe('estimate');
    const model35 = models.find((m) => m.modelId === 'gemini-3.5-flash');
    expect(model35.pricing.measured).toBeNull();
    expect(model35.pricing.costPerAnswerVnd).toBe(468);
    expect(models.find((m) => m.modelId === 'gemini-3.8-flash').pricing.measured).toEqual({ calls: 305, costPerCallVnd: 504 });
  });

  it('model chua co gia: khong co so nao (measured null, costPerAnswerVnd null) — tranh hien so tinh bang gia tam', async () => {
    mockGetCatalog.mockResolvedValue([catalogModel('gemini-9.9-flash')]);
    // du service co tra chi phi cho model nay (dong cu tinh bang gia _default), trang model KHONG duoc dung so do
    mockGetMeasuredCostByModel.mockResolvedValue({
      range: '30d',
      byModel: { 'gemini-9.9-flash': { calls: 3, costUsd: 1, costPerCallUsd: 0.33, costPerCallVnd: 8000 } },
    });
    const { models } = await listModels();
    expect(models[0].pricing).toEqual({
      inputUsdPerM: null,
      outputUsdPerM: null,
      costPerAnswerVnd: null,
      measured: null,
      configured: false,
    });
  });

  it('token trung binh thuc te (gom token suy nghi) di vao so uoc tinh: 700.000 vao / 143.333 ra tinh tien', async () => {
    mockGetCatalog.mockResolvedValue([catalogModel('gemini-3.5-flash')]);
    mockGetMeasuredCostByModel.mockResolvedValue({ range: '30d', byModel: {} });
    mockGetAvgAiTokenUsage.mockResolvedValue({ calls: 3, avgPromptTokens: 700000, avgOutputTokens: 143333.33 });
    const result = await listModels();
    expect(result).toMatchObject({ basis: 'actual', avgPromptTokens: 700000, avgOutputTokens: 143333 });
    // 0,7 x 1,5 + 0,143333 x 9 = 1,05 + 1,29 = 2,34 USD -> 56.160d
    expect(result.models[0].pricing.costPerAnswerVnd).toBe(56160);
  });
});
