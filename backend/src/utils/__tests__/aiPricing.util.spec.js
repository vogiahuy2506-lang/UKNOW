import { jest } from '@jest/globals';
import {
  DEFAULT_PRICING,
  DEFAULT_AVG_PROMPT_TOKENS,
  DEFAULT_AVG_OUTPUT_TOKENS,
  parsePricing,
  resolvePricing,
  upcomingPricing,
  toVnDay,
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
    // resolvePricing still falls back for cost aggregation on the usage page
    expect(resolvePricing(pricing, 'gemini-3.1-pro')).toEqual(DEFAULT_PRICING._default);
  });

  // 30/09/2026 (PLAN_SO_LIEU_DUNG_GON_KHOP, PR-8): bảng giá niêm yết Google, USD / 1 triệu token.
  test('gemini-3.5-flash 1,50/9,00 - gemini-3.8-flash 0,75/3,75 (khuyen mai toi 31/12/2026) - embedding-001 0,15: deu co gia', () => {
    const pricing = parsePricing();
    expect(pricing['gemini-3.5-flash']).toEqual({ input: 1.5, output: 9.0 });
    // 3.8-flash đổi giá theo ngày (xem describe "giá theo ngày hiệu lực" bên dưới) — ghim mức KM tại một ngày cố định
    expect(resolvePricing(pricing, 'gemini-3.8-flash', '2026-10-03')).toMatchObject({ input: 0.75, output: 3.75 });
    expect(pricing['gemini-embedding-001']).toEqual({ input: 0.15, output: 0 });
    for (const model of ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-embedding-001']) {
      expect(hasConfiguredPrice(pricing, model)).toBe(true);
      // giá riêng của model, KHÔNG phải _default
      expect(resolvePricing(pricing, model, '2026-10-03')).not.toEqual(DEFAULT_PRICING._default);
    }
  });

  test('costPerAnswerVnd cho 3 model moi: 3.5-flash 10k/500 = 468d, 3.8-flash = 225d; embedding khong co token ra', () => {
    const pricing = parsePricing();
    const opts = { avgPromptTokens: 10000, avgOutputTokens: 500, usdVndRate: 24000 };
    // 10.000/1e6 x 1,5 + 500/1e6 x 9 = 0,0195 USD x 24.000
    expect(costPerAnswerVnd(pricing, 'gemini-3.5-flash', opts)).toBe(468);
    // 10.000/1e6 x 0,75 + 500/1e6 x 3,75 = 0,009375 USD x 24.000 = 225 (giá khuyến mãi: ghim ngày, hết KM thì 450)
    expect(costPerAnswerVnd(pricing, 'gemini-3.8-flash', { ...opts, at: '2026-10-03' })).toBe(225);
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

  // 03/10/2026 (PLAN_GOP_MAU_TIN_MEDIA_VA_VIEC_LE, PR-L / L1): gemini-3.8-flash khuyen mai 0,75 / 3,75 toi het 31/12/2026 (gio VN),
  // tu 01/01/2027 Google tinh 1,50 / 7,50. Gia ghi theo NGAY HIEU LUC, moi dong usage tinh theo gia cua ngay do.
  describe('gia theo ngay hieu luc (gemini-3.8-flash het khuyen mai 31/12/2026)', () => {
    const MODEL = 'gemini-3.8-flash';
    // 1tr vao + 0,1tr ra + tong 1,2tr (0,1tr suy nghi) -> dau ra tinh tien 0,2tr
    //   gia KM  : 1 x 0,75 + 0,2 x 3,75 = 0,75 + 0,75 = 1,5 USD
    //   gia moi : 1 x 1,50 + 0,2 x 7,50 = 1,50 + 1,50 = 3,0 USD
    const row = (at) => estimateCost(parsePricing(), {
      model: MODEL, promptTokens: 1_000_000, outputTokens: 100_000, totalTokens: 1_200_000, at,
    });

    test('toVnDay: ngay VN cua mot moc - 23:59:59 ngay 31/12 (VN) van la 31/12, 00:00:00 ngay 01/01 (VN) la 01/01', () => {
      expect(toVnDay('2026-12-31')).toBe('2026-12-31'); // chuoi ngay giu nguyen (SQL tra ngay VN san)
      expect(toVnDay(new Date('2026-12-31T16:59:59.999Z'))).toBe('2026-12-31'); // 23:59:59.999 VN
      expect(toVnDay(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01-01'); // 00:00:00 VN
      expect(toVnDay(Date.parse('2026-12-31T17:00:00.000Z'))).toBe('2027-01-01'); // so (ms)
      expect(toVnDay('2026-12-31T17:30:00Z')).toBe('2027-01-01'); // chuoi gio -> doi sang gio VN
      expect(toVnDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/); // bo trong = hom nay
    });

    test('bang gia mac dinh co 2 muc: KM toi 31/12/2026, sau do 1,50 / 7,50', () => {
      const pricing = parsePricing();
      expect(Array.isArray(pricing[MODEL])).toBe(true);
      expect(resolvePricing(pricing, MODEL, '2026-10-03')).toMatchObject({ input: 0.75, output: 3.75 });
      expect(resolvePricing(pricing, MODEL, '2026-12-31')).toMatchObject({ input: 0.75, output: 3.75 });
      expect(resolvePricing(pricing, MODEL, '2027-01-01')).toMatchObject({ input: 1.5, output: 7.5 });
      expect(resolvePricing(pricing, MODEL, '2030-06-01')).toMatchObject({ input: 1.5, output: 7.5 });
    });

    test('moc tinh theo GIO VN: 31/12 23:30 VN van gia KM; 01/01 00:30 VN (= 31/12 17:30 UTC) la gia moi', () => {
      const pricing = parsePricing();
      expect(resolvePricing(pricing, MODEL, new Date('2026-12-31T16:30:00Z'))).toMatchObject({ output: 3.75 }); // 23:30 VN 31/12
      expect(resolvePricing(pricing, MODEL, new Date('2026-12-31T17:30:00Z'))).toMatchObject({ output: 7.5 }); // 00:30 VN 01/01
      expect(row(new Date('2026-12-31T16:30:00Z'))).toBeCloseTo(1.5, 8);
      expect(row(new Date('2026-12-31T17:30:00Z'))).toBeCloseTo(3.0, 8);
    });

    test('estimateCost theo ngay cua dong: cung token, 31/12 = 1,5 USD, 01/01 = 3,0 USD; khong truyen ngay = gia hom nay', () => {
      expect(row('2026-12-31')).toBeCloseTo(1.5, 8);
      expect(row('2027-01-01')).toBeCloseTo(3.0, 8);
      expect(row()).toBeCloseTo(row(toVnDay()), 8);
    });

    test('ky 25/12/2026 - 05/01/2027 co token o ca hai phia: tong = phan truoc x gia KM + phan sau x gia moi = 9,0 USD', () => {
      // moi dong 1,2tr token nhu tren: 25/12 + 31/12 (KM: 1,5 + 1,5) + 01/01 + 05/01 (gia moi: 3,0 + 3,0)
      const total = ['2026-12-25', '2026-12-31', '2027-01-01', '2027-01-05'].reduce((sum, day) => sum + row(day), 0);
      expect(total).toBeCloseTo(9.0, 8);
      // Tinh het bang gia moi se ra 12,0; het bang gia KM se ra 6,0 - ca hai deu SAI
      expect(total).not.toBeCloseTo(12.0, 4);
      expect(total).not.toBeCloseTo(6.0, 4);
    });

    test('costPerAnswerVnd (so uoc tinh 10k/500) theo gia cua ngay: 225d truoc 01/01/2027, 450d tu do', () => {
      const opts = { avgPromptTokens: 10000, avgOutputTokens: 500, usdVndRate: 24000 };
      const pricing = parsePricing();
      expect(costPerAnswerVnd(pricing, MODEL, { ...opts, at: '2026-12-31' })).toBe(225);
      // 10.000/1e6 x 1,5 + 500/1e6 x 7,5 = 0,015 + 0,00375 = 0,01875 USD x 24.000 = 450
      expect(costPerAnswerVnd(pricing, MODEL, { ...opts, at: '2027-01-01' })).toBe(450);
    });

    test('model gia phang (3.5-flash) khong doi theo ngay', () => {
      const pricing = parsePricing();
      expect(resolvePricing(pricing, 'gemini-3.5-flash', '2026-10-03')).toEqual({ input: 1.5, output: 9.0 });
      expect(resolvePricing(pricing, 'gemini-3.5-flash', '2030-01-01')).toEqual({ input: 1.5, output: 9.0 });
    });

    test('AI_PRICING_JSON gia PHANG {input, output} = mot muc cho MOI ngay: ghi de ca hai phia cua moc 31/12/2026', () => {
      process.env.AI_PRICING_JSON = JSON.stringify({ [MODEL]: { input: 2, output: 4 } });
      const pricing = parsePricing();
      expect(pricing[MODEL]).toEqual({ input: 2, output: 4 });
      expect(resolvePricing(pricing, MODEL, '2026-12-31')).toEqual({ input: 2, output: 4 });
      expect(resolvePricing(pricing, MODEL, '2027-01-01')).toEqual({ input: 2, output: 4 });
      // 1 x 2 + 0,2 x 4 = 2,8 USD o CA HAI phia
      expect(row('2026-12-31')).toBeCloseTo(2.8, 8);
      expect(row('2027-01-01')).toBeCloseTo(2.8, 8);
      expect(upcomingPricing(pricing, MODEL, '2026-10-03')).toBeNull();
    });

    test('AI_PRICING_JSON dat duoc nhieu muc theo ngay (viet sai thu tu van duoc sap lai); muc cuoi khong co until ap dung ve sau', () => {
      process.env.AI_PRICING_JSON = JSON.stringify({
        'gemini-9.9-flash': [
          { input: 5, output: 5 },
          { input: 1, output: 1, until: '2027-03-31' },
          { input: 2, output: 2, until: '2027-01-31' },
        ],
      });
      const pricing = parsePricing();
      expect(resolvePricing(pricing, 'gemini-9.9-flash', '2027-01-31')).toMatchObject({ input: 2 });
      expect(resolvePricing(pricing, 'gemini-9.9-flash', '2027-02-01')).toMatchObject({ input: 1 });
      expect(resolvePricing(pricing, 'gemini-9.9-flash', '2027-03-31')).toMatchObject({ input: 1 });
      expect(resolvePricing(pricing, 'gemini-9.9-flash', '2027-04-01')).toMatchObject({ input: 5 });
      expect(hasConfiguredPrice(pricing, 'gemini-9.9-flash')).toBe(true);
    });

    test('moi muc deu co until: qua muc cuoi van giu gia cuoi (khong rot ve _default)', () => {
      process.env.AI_PRICING_JSON = JSON.stringify({ 'gemini-9.9-flash': [{ input: 1, output: 1, until: '2026-01-31' }] });
      expect(resolvePricing(parsePricing(), 'gemini-9.9-flash', '2027-06-01')).toMatchObject({ input: 1, output: 1 });
    });

    test('muc theo ngay viet sai (until sai dang / hai muc khong until / trung until / mang rong) bi bo qua, dung gia mac dinh + canh bao', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const bad = {
          'gemini-9.1-flash': [{ input: 1, output: 1, until: '31/12/2026' }],
          'gemini-9.2-flash': [{ input: 1, output: 1 }, { input: 2, output: 2 }],
          'gemini-9.3-flash': [{ input: 1, output: 1, until: '2027-01-31' }, { input: 2, output: 2, until: '2027-01-31' }],
          'gemini-9.4-flash': [],
          [MODEL]: [{ input: 9, output: 9, until: 'sau-tet' }],
        };
        process.env.AI_PRICING_JSON = JSON.stringify(bad);
        const pricing = parsePricing();
        ['gemini-9.1-flash', 'gemini-9.2-flash', 'gemini-9.3-flash', 'gemini-9.4-flash'].forEach((model) => {
          expect(hasConfiguredPrice(pricing, model)).toBe(false);
        });
        // model co san trong bang mac dinh giu nguyen gia mac dinh (2 muc), khong bi muc sai de
        expect(resolvePricing(pricing, MODEL, '2027-01-01')).toMatchObject({ input: 1.5, output: 7.5 });
        expect(warn).toHaveBeenCalledTimes(5);
      } finally {
        warn.mockRestore();
      }
    });

    test('upcomingPricing: tra muc sap toi {from, input, output} cho toi het ngay cuoi cua muc dang ap dung; het muc thi null', () => {
      const pricing = parsePricing();
      expect(upcomingPricing(pricing, MODEL, '2026-10-03')).toEqual({ from: '2027-01-01', input: 1.5, output: 7.5 });
      expect(upcomingPricing(pricing, MODEL, '2026-12-31')).toEqual({ from: '2027-01-01', input: 1.5, output: 7.5 });
      expect(upcomingPricing(pricing, MODEL, '2027-01-01')).toBeNull();
      expect(upcomingPricing(pricing, 'gemini-3.5-flash', '2026-10-03')).toBeNull(); // gia phang
      expect(upcomingPricing(pricing, 'gemini-9.9-flash', '2026-10-03')).toBeNull(); // chua co gia
    });
  });
});
