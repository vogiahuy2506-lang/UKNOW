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
  });

  test('gemini-2.0-flash đã gỡ khỏi bảng giá (Google khai tử 10/08, 0 dòng usage_logs dùng nó)', () => {
    expect(hasConfiguredPrice(parsePricing(), 'gemini-2.0-flash')).toBe(false);
  });

  test('hasConfiguredPrice is false for unknown models (not fooled by _default)', () => {
    const pricing = parsePricing();
    expect(hasConfiguredPrice(pricing, 'gemini-2.5-flash')).toBe(true);
    expect(hasConfiguredPrice(pricing, 'gemini-3.1-pro')).toBe(false);
    expect(hasConfiguredPrice(pricing, '_unknown')).toBe(false);
    expect(costPerAnswerVnd(pricing, 'gemini-3.1-pro', {
      avgPromptTokens: 10000,
      avgOutputTokens: 500,
      usdVndRate: 24000,
    })).toBeNull();
    // pricingForModel still falls back for cost aggregation on the usage page
    expect(pricingForModel(pricing, 'gemini-3.1-pro')).toEqual(DEFAULT_PRICING._default);
  });

  // 30/09/2026 (PLAN_SO_LIEU_DUNG_GON_KHOP, PR-8): bảng giá niêm yết Google, USD / 1 triệu token.
  test('gemini-3.5-flash 1,50/9,00 - gemini-3.8-flash 0,75/3,75 (khuyen mai toi 31/12/2026) - embedding-001 0,15: deu co gia', () => {
    const pricing = parsePricing();
    expect(pricing['gemini-3.5-flash']).toEqual({ input: 1.5, output: 9.0 });
    expect(pricing['gemini-3.8-flash']).toEqual({ input: 0.75, output: 3.75 });
    expect(pricing['gemini-embedding-001']).toEqual({ input: 0.15, output: 0 });
    for (const model of ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-embedding-001']) {
      expect(hasConfiguredPrice(pricing, model)).toBe(true);
      // giá riêng của model, KHÔNG phải _default
      expect(pricingForModel(pricing, model)).not.toEqual(DEFAULT_PRICING._default);
    }
  });

  test('costPerAnswerVnd cho 3 model moi: 3.5-flash 10k/500 = 468d, 3.8-flash = 225d; embedding khong co token ra', () => {
    const pricing = parsePricing();
    const opts = { avgPromptTokens: 10000, avgOutputTokens: 500, usdVndRate: 24000 };
    // 10.000/1e6 x 1,5 + 500/1e6 x 9 = 0,0195 USD x 24.000
    expect(costPerAnswerVnd(pricing, 'gemini-3.5-flash', opts)).toBe(468);
    // 10.000/1e6 x 0,75 + 500/1e6 x 3,75 = 0,009375 USD x 24.000 = 225
    expect(costPerAnswerVnd(pricing, 'gemini-3.8-flash', opts)).toBe(225);
    // 10.000/1e6 x 0,15 = 0,0015 USD x 24.000 = 36
    expect(costPerAnswerVnd(pricing, 'gemini-embedding-001', opts)).toBe(36);
  });

  test('AI_PRICING_JSON van ghi de duoc gia cua model moi', () => {
    process.env.AI_PRICING_JSON = JSON.stringify({ 'gemini-3.5-flash': { input: 2, output: 20 } });
    const pricing = parsePricing();
    expect(pricing['gemini-3.5-flash']).toEqual({ input: 2, output: 20 });
    expect(pricing['gemini-3.8-flash']).toEqual(DEFAULT_PRICING['gemini-3.8-flash']);
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

  describe('estimateCost - token suy nghi tinh theo gia dau ra', () => {
    test('prompt 1.000.000, output 100.000, total 1.200.000 voi 3.5-flash = 1,5 + 0,2 x 9 = 3,3 USD', () => {
      const usd = estimateCost(parsePricing(), {
        model: 'gemini-3.5-flash',
        promptTokens: 1_000_000,
        outputTokens: 100_000,
        totalTokens: 1_200_000,
      });
      expect(usd).toBeCloseTo(3.3, 8);
    });

    test('phan suy nghi (total - prompt - output = 100.000) dang tinh 0,9 USD: bo no di thi chi con 2,4 USD', () => {
      const withThinking = estimateCost(parsePricing(), {
        model: 'gemini-3.5-flash', promptTokens: 1_000_000, outputTokens: 100_000, totalTokens: 1_200_000,
      });
      const withoutTotal = estimateCost(parsePricing(), {
        model: 'gemini-3.5-flash', promptTokens: 1_000_000, outputTokens: 100_000,
      });
      expect(withoutTotal).toBeCloseTo(2.4, 8);
      expect(withThinking - withoutTotal).toBeCloseTo(0.9, 8);
    });

    test('total <= prompt + output (dong thieu/sai total) khong bao gio tinh dau ra thap hon output', () => {
      const pricing = parsePricing();
      // total - prompt = 50.000 < output 100.000 -> van tinh 100.000
      expect(estimateCost(pricing, {
        model: 'gemini-3.5-flash', promptTokens: 1_000_000, outputTokens: 100_000, totalTokens: 1_050_000,
      })).toBeCloseTo(1.5 + 0.1 * 9, 8);
      // total = 0 (khong co) -> nhu cu: prompt + output
      expect(estimateCost(pricing, {
        model: 'gemini-3.5-flash', promptTokens: 1_000_000, outputTokens: 100_000, totalTokens: 0,
      })).toBeCloseTo(2.4, 8);
    });

    test('embedding: total = prompt, khong co dau ra -> chi tinh gia vao 0,15', () => {
      const usd = estimateCost(parsePricing(), {
        model: 'gemini-embedding-001', promptTokens: 4_000_000, outputTokens: 0, totalTokens: 4_000_000,
      });
      expect(usd).toBeCloseTo(0.6, 8);
    });

    test('model chua co gia van tinh theo _default (va bi hasConfiguredPrice bao false)', () => {
      const pricing = parsePricing();
      const usd = estimateCost(pricing, {
        model: 'gemini-9.9-flash', promptTokens: 1_000_000, outputTokens: 0, totalTokens: 1_200_000,
      });
      // _default 0,30 / 2,50: 0,3 + 0,2 x 2,5
      expect(usd).toBeCloseTo(0.8, 8);
      expect(hasConfiguredPrice(pricing, 'gemini-9.9-flash')).toBe(false);
    });
  });
});
