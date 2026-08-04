import {
  DEFAULT_PRICING,
  DEFAULT_AVG_PROMPT_TOKENS,
  DEFAULT_AVG_OUTPUT_TOKENS,
  parsePricing,
  pricingForModel,
  hasConfiguredPrice,
  estimateCost,
  costPerAnswerVnd,
  resolveAvgTokens,
} from '../aiPricing.util.js';

describe('aiPricing.util', () => {
  const originalPricingJson = process.env.AI_PRICING_JSON;
  const originalRate = process.env.USD_VND_RATE;

  afterEach(() => {
    if (originalPricingJson === undefined) delete process.env.AI_PRICING_JSON;
    else process.env.AI_PRICING_JSON = originalPricingJson;
    if (originalRate === undefined) delete process.env.USD_VND_RATE;
    else process.env.USD_VND_RATE = originalRate;
  });

  test('costPerAnswerVnd matches acceptance numbers at 10k/500 and 24000 FX', () => {
    const pricing = parsePricing();
    const opts = {
      avgPromptTokens: 10000,
      avgOutputTokens: 500,
      usdVndRate: 24000,
    };
    expect(costPerAnswerVnd(pricing, 'gemini-2.5-pro', opts)).toBe(420);
    expect(costPerAnswerVnd(pricing, 'gemini-2.5-flash', opts)).toBe(102);
    expect(costPerAnswerVnd(pricing, 'gemini-2.5-flash-lite', opts)).toBe(29);
    expect(costPerAnswerVnd(pricing, 'gemini-2.0-flash', opts)).toBe(29);
  });

  test('hasConfiguredPrice is false for unknown models (not fooled by _default)', () => {
    const pricing = parsePricing();
    expect(hasConfiguredPrice(pricing, 'gemini-2.5-flash')).toBe(true);
    expect(hasConfiguredPrice(pricing, 'gemini-3.5-flash')).toBe(false);
    expect(hasConfiguredPrice(pricing, 'gemini-3.1-pro')).toBe(false);
    expect(costPerAnswerVnd(pricing, 'gemini-3.5-flash', {
      avgPromptTokens: 10000,
      avgOutputTokens: 500,
      usdVndRate: 24000,
    })).toBeNull();
    // pricingForModel still falls back for cost aggregation on the usage page
    expect(pricingForModel(pricing, 'gemini-3.5-flash')).toEqual(DEFAULT_PRICING._default);
  });

  test('AI_PRICING_JSON overrides defaults; invalid JSON falls back', () => {
    process.env.AI_PRICING_JSON = JSON.stringify({
      'gemini-2.5-flash': { input: 1, output: 1 },
    });
    const overridden = parsePricing();
    expect(overridden['gemini-2.5-flash']).toEqual({ input: 1, output: 1 });
    expect(overridden['gemini-2.5-pro']).toEqual(DEFAULT_PRICING['gemini-2.5-pro']);

    process.env.AI_PRICING_JSON = '{not-json';
    const fallback = parsePricing();
    expect(fallback['gemini-2.5-flash']).toEqual(DEFAULT_PRICING['gemini-2.5-flash']);
  });

  test('resolveAvgTokens falls back to full default pair when avg is zero', () => {
    expect(resolveAvgTokens({ calls: 12, avgPromptTokens: 0, avgOutputTokens: 0 })).toEqual({
      avgPromptTokens: DEFAULT_AVG_PROMPT_TOKENS,
      avgOutputTokens: DEFAULT_AVG_OUTPUT_TOKENS,
      basis: 'estimate',
    });
    expect(resolveAvgTokens({ calls: 12, avgPromptTokens: 8700, avgOutputTokens: 0 })).toEqual({
      avgPromptTokens: DEFAULT_AVG_PROMPT_TOKENS,
      avgOutputTokens: DEFAULT_AVG_OUTPUT_TOKENS,
      basis: 'estimate',
    });
    expect(resolveAvgTokens({ calls: 12, avgPromptTokens: 8700, avgOutputTokens: 420 })).toEqual({
      avgPromptTokens: 8700,
      avgOutputTokens: 420,
      basis: 'actual',
    });
    expect(resolveAvgTokens({ calls: 0 })).toEqual({
      avgPromptTokens: DEFAULT_AVG_PROMPT_TOKENS,
      avgOutputTokens: DEFAULT_AVG_OUTPUT_TOKENS,
      basis: 'estimate',
    });
  });

  test('estimateCost smoke after util extraction (usage-page formula)', () => {
    const pricing = parsePricing();
    const usd = estimateCost(pricing, {
      model: 'gemini-2.5-flash',
      promptTokens: 10000,
      outputTokens: 500,
    });
    expect(usd).toBeCloseTo(0.00425, 8);
  });
});
