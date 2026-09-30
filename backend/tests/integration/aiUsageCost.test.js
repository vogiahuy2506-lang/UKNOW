/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-8 - trang Chi phi AI admin chay SQL THAT tren Postgres.
 *
 * Vi sao can file nay: unit test cua getAiUsageOverview mock ca DB nen KHONG thay duoc (a) moc "Thang nay" / "30 ngay qua"
 * tinh dung 00:00 gio Viet Nam, (b) SQL gom nhom / ten cot (plans.price, metadata.kind...), (c) ngay bieu do theo gio VN.
 * Moc thoi gian cua phep thu duoc tinh o day bang JS thuan tu UTC+7 co dinh (VN khong co gio mua he) - khong lap lai
 * bieu thuc SQL dang thu, va khong phu thuoc mui gio cua phien Postgres hay cua Node (script dat TZ=UTC).
 * Chi phi cong tay nam trong tung ca.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import db from '../../src/config/database.js';
import aiUsageRepository from '../../src/repositories/admin/aiUsage.repository.js';
import { getAiUsageOverview, getMeasuredCostByModel } from '../../src/services/admin/aiUsage.service.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MINUTE = 60 * 1000;

/** Moc theo gio Viet Nam (UTC+7 co dinh), tinh tu dong ho hien tai bang so hoc UTC. */
function vietnamBoundaries(now = Date.now()) {
  const vn = new Date(now + 7 * HOUR);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();
  const monthStart = new Date(Date.UTC(y, m, 1) - 7 * HOUR);
  const todayStart = new Date(Date.UTC(y, m, d) - 7 * HOUR);
  const start30 = new Date(todayStart.getTime() - 29 * DAY);
  return {
    monthStart,
    todayStart,
    start30,
    todayVn: vn.toISOString().slice(0, 10),
    start30Vn: new Date(start30.getTime() + 7 * HOUR).toISOString().slice(0, 10),
    monthStartVn: new Date(monthStart.getTime() + 7 * HOUR).toISOString().slice(0, 10),
  };
}

async function insertToken({
  idUser, feature, model, prompt, output, total, kind, createdAt = new Date(), metadata,
}) {
  const meta = metadata ?? {
    ...(feature ? { feature } : {}),
    ...(model ? { model } : {}),
    ...(kind ? { kind } : {}),
    promptTokens: prompt,
    outputTokens: output,
    totalTokens: total,
  };
  await db.query(
    `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end, metadata, created_at)
     VALUES ($1, 'ai_token', $2, $3, $4, $5::jsonb, $6)`,
    [idUser, total, createdAt, new Date(createdAt.getTime() + 30 * DAY), JSON.stringify(meta), createdAt]
  );
}

/** 1 lượt chatbot 3.5-flash: vao 1tr, ra 0,1tr, tong 1,2tr (0,1tr suy nghi) -> 1,5 + 0,2 x 9 = 3,3 USD = 79.200d */
const chatCall = (idUser, createdAt) => insertToken({
  idUser, feature: 'chatbot_reply', model: 'gemini-3.5-flash', prompt: 1_000_000, output: 100_000, total: 1_200_000, createdAt,
});

let originalRate;
let originalPricing;

beforeEach(async () => {
  await truncateAll();
  originalRate = process.env.USD_VND_RATE;
  originalPricing = process.env.AI_PRICING_JSON;
  process.env.USD_VND_RATE = '24000';
  delete process.env.AI_PRICING_JSON;
});

afterEach(() => {
  if (originalRate === undefined) delete process.env.USD_VND_RATE;
  else process.env.USD_VND_RATE = originalRate;
  if (originalPricing === undefined) delete process.env.AI_PRICING_JSON;
  else process.env.AI_PRICING_JSON = originalPricing;
});

describe('bo loc "Thang nay": 00:00 ngay 1 gio Viet Nam', () => {
  it('dong luc 23:59 cuoi thang truoc (VN) bi loai, dong luc 00:01 ngay 1 (VN) duoc tinh - du cach nhau 2 phut', async () => {
    const { monthStart } = vietnamBoundaries();
    const user = await createUser({ username: 'm1' });
    await chatCall(user.id, new Date(monthStart.getTime() - MINUTE)); // 23:59 ngày cuối tháng trước (VN)
    await chatCall(user.id, new Date(monthStart.getTime() + MINUTE)); // 00:01 ngày 1 (VN)

    const { summary, range, rangeStart } = await getAiUsageOverview({ range: 'month' });
    expect(range).toBe('month');
    expect(rangeStart).toBe(vietnamBoundaries().monthStartVn);
    // Chỉ dòng thứ hai: 1 lượt, 3,3 USD = 79.200d. Mốc tính bằng UTC (lệch 7 giờ) sẽ loại luôn dòng này.
    expect(summary.calls).toBe(1);
    expect(summary.estimatedCostUsd).toBe(3.3);
    expect(summary.estimatedCostVnd).toBe(79200);
  });

  it('bieu do "Thang nay" bat dau dung ngay 1 (VN) va ket thuc hom nay (VN)', async () => {
    const { timeline, rangeEnd } = await getAiUsageOverview({ range: 'month' });
    const { todayVn, monthStartVn } = vietnamBoundaries();
    expect(timeline[0].bucket).toBe(monthStartVn);
    expect(timeline[timeline.length - 1].bucket).toBe(todayVn);
    expect(rangeEnd).toBe(todayVn);
  });
});

describe('bo loc "30 ngay qua": du 30 ngay lich (ke ca hom nay) theo gio Viet Nam', () => {
  it('dong ngay 00:00 cua ngay dau khung - 1 phut bi loai, + 1 phut duoc tinh', async () => {
    const { start30 } = vietnamBoundaries();
    const user = await createUser({ username: 'w1' });
    await chatCall(user.id, new Date(start30.getTime() - MINUTE));
    await chatCall(user.id, new Date(start30.getTime() + MINUTE));

    const { summary, timeline, range } = await getAiUsageOverview({ range: '30d' });
    expect(range).toBe('30d');
    expect(summary.calls).toBe(1);
    expect(summary.estimatedCostVnd).toBe(79200);
    expect(timeline).toHaveLength(30);
    const { start30Vn, todayVn } = vietnamBoundaries();
    expect(timeline[0].bucket).toBe(start30Vn);
    expect(timeline[29].bucket).toBe(todayVn);
    expect(timeline[0].estimatedCostVnd).toBe(79200);
  });

  it('gia tri khong hop le -> "30 ngay qua" (cua so 7/90 ngay cu khong con)', async () => {
    const { start30 } = vietnamBoundaries();
    const user = await createUser({ username: 'w2' });
    await chatCall(user.id, new Date(start30.getTime() - MINUTE));
    await chatCall(user.id, new Date(start30.getTime() + MINUTE));
    const result = await getAiUsageOverview({ range: '90' });
    expect(result.range).toBe('30d');
    expect(result.summary.calls).toBe(1);
  });
});

describe('ngay cua bieu do tinh theo gio Viet Nam', () => {
  it('dong luc 00:30 sang nay (VN) nam trong cot "hom nay" (VN) - khong roi vao hom qua nhu bucket UTC', async () => {
    const { todayStart, todayVn } = vietnamBoundaries();
    const user = await createUser({ username: 'd1' });
    await chatCall(user.id, new Date(todayStart.getTime() + 30 * MINUTE));

    const { timeline } = await getAiUsageOverview({ range: '30d' });
    const today = timeline.find((day) => day.bucket === todayVn);
    expect(today.estimatedCostVnd).toBe(79200);
    // cac ngay con lai deu 0 -> tong bieu do = 79.200d
    expect(timeline.reduce((sum, day) => sum + day.estimatedCostVnd, 0)).toBe(79200);
  });

  it('tong chi phi cac cot bieu do = chi phi KPI (moi dong nam trong khung, cung mot mui gio)', async () => {
    const { todayStart } = vietnamBoundaries();
    const user = await createUser({ username: 'd2' });
    await chatCall(user.id, new Date(todayStart.getTime() + 5 * MINUTE)); // 00:05 hôm nay VN
    await chatCall(user.id, new Date(todayStart.getTime() - 5 * MINUTE)); // 23:55 hôm qua VN
    await chatCall(user.id, new Date(todayStart.getTime() - 10 * DAY + 20 * HOUR)); // 10 ngày trước, 20:00 VN
    const { timeline, summary } = await getAiUsageOverview({ range: '30d' });
    expect(summary.calls).toBe(3);
    expect(timeline.reduce((sum, day) => sum + day.estimatedCostVnd, 0)).toBe(summary.estimatedCostVnd);
    expect(summary.estimatedCostVnd).toBe(3 * 79200);
  });
});

describe('bon so + bang theo tinh nang + co gia tren du lieu that', () => {
  /**
   * Cong tay (gia niem yet mac dinh, 1 USD = 24.000d):
   *   u1 (goi P: han muc 100, gia 900.000d):
   *     chatbot_reply 3.5-flash   vao 1tr / ra 0,1tr / tong 1,2tr -> 1,5 + 0,2 x 9        = 3,30 USD
   *     smart_chat    3.8-flash   vao 1tr / ra 0,1tr / tong 1,2tr -> 0,75 + 0,2 x 3,75     = 1,50 USD
   *   u2: embedding_rag_query (kind embedding) embedding-001 vao 1tr, tong 1tr -> 0,15 x 1 = 0,15 USD
   *   u3: help_answer 3.5-flash   vao 0,1tr / ra 0,01tr / tong 0,13tr -> 0,15 + 0,03 x 9   = 0,42 USD
   *   u4: dong cu khong co feature/model (vao 1tr, ra 0): _unknown -> gia tam 0,30 x 1     = 0,30 USD
   * Tong = 3,3 + 1,5 + 0,15 + 0,42 + 0,3 = 5,67 USD = 136.080d.
   * Luot goi = 4 (chatbot, smart_chat, help, dong cu) - KHONG ke dong embedding.
   * Chi phi moi luot = 5,67 / 4 = 1,4175 USD = 34.020d.
   * Khach dang dung AI = u1, u4 = 2 (u2 chi co embedding, u3 chi co tro giup). User co dong token = 4.
   * Goi P: dung het han muc = 100 x 34.020d = 3.402.000d, so voi gia goi 900.000d = 378,0%.
   */
  async function seed() {
    const planP = await createPlan({
      code: 'plan_p', name: 'Goi P', price: 900000, aiCreditsPerPeriod: 100,
    });
    const u1 = await createUser({ username: 'u1', planId: planP.id, phone: '0900000001' });
    const u2 = await createUser({ username: 'u2', phone: '0900000002' });
    const u3 = await createUser({ username: 'u3', phone: '0900000003' });
    const u4 = await createUser({ username: 'u4', phone: '0900000004' });
    await chatCall(u1.id);
    await insertToken({
      idUser: u1.id, feature: 'smart_chat', model: 'gemini-3.8-flash', prompt: 1_000_000, output: 100_000, total: 1_200_000,
    });
    await insertToken({
      idUser: u2.id, feature: 'embedding_rag_query', model: 'gemini-embedding-001', kind: 'embedding', prompt: 1_000_000, output: 0, total: 1_000_000,
    });
    await insertToken({
      idUser: u3.id, feature: 'help_answer', model: 'gemini-3.5-flash', prompt: 100_000, output: 10_000, total: 130_000,
    });
    await insertToken({
      idUser: u4.id, total: 1_000_000, metadata: { promptTokens: 1_000_000, outputTokens: 0 },
    });
    return { planP, u1, u2, u3, u4 };
  }

  it('bon so: 136.080d, 4 luot, 34.020d / luot, 2 khach', async () => {
    await seed();
    const { summary } = await getAiUsageOverview({ range: '30d' });
    expect(summary).toMatchObject({
      estimatedCostUsd: 5.67,
      estimatedCostVnd: 136080,
      calls: 4,
      costPerCallVnd: 34020,
      customers: 2,
      userCount: 4,
      logCount: 5,
    });
  });

  it('bang theo tinh nang: nhom + luot + chi phi + chi phi moi luot; nap tai lieu khong phai luot', async () => {
    await seed();
    const { byFeature } = await getAiUsageOverview({ range: '30d' });
    expect(byFeature.map((item) => item.group)).toEqual(['chatbot', 'assistant', 'help', 'other', 'embedding']);
    const byGroup = Object.fromEntries(byFeature.map((item) => [item.group, item]));
    expect(byGroup.chatbot).toMatchObject({ calls: 1, estimatedCostVnd: 79200, costPerCallVnd: 79200, features: ['chatbot_reply'] });
    expect(byGroup.assistant).toMatchObject({ calls: 1, estimatedCostVnd: 36000, costPerCallVnd: 36000 });
    expect(byGroup.help).toMatchObject({ calls: 1, estimatedCostVnd: 10080, costPerCallVnd: 10080 });
    expect(byGroup.other).toMatchObject({ calls: 1, estimatedCostVnd: 7200, features: ['_unknown'] });
    expect(byGroup.embedding).toMatchObject({
      countsAsCall: false, estimatedCostVnd: 3600, costPerCallVnd: null,
    });
  });

  it('co gia: chi dong cu khong ghi model (_unknown) bi tinh gia tam - 5,3% chi phi; 3 model niem yet thi khong', async () => {
    await seed();
    const { pricingWarning, byModel } = await getAiUsageOverview({ range: '30d' });
    expect(pricingWarning).toEqual({
      unpricedCostSharePct: 5.3,
      models: [{
        model: '_unknown', calls: 1, estimatedCostUsd: 0.3, costSharePct: 5.3,
      }],
    });
    expect(byModel.filter((item) => !item.priceConfigured).map((item) => item.model)).toEqual(['_unknown']);
    expect(byModel.find((item) => item.model === 'gemini-3.5-flash')).toMatchObject({
      priceConfigured: true, calls: 2, estimatedCostUsd: 3.72,
    });
  });

  it('khong co dong nao dung gia tam thi khong co canh bao (3 model moi da co gia)', async () => {
    const u1 = await createUser({ username: 'p1' });
    await chatCall(u1.id);
    await insertToken({
      idUser: u1.id, feature: 'smart_chat', model: 'gemini-3.8-flash', prompt: 1_000_000, output: 100_000, total: 1_200_000,
    });
    await insertToken({
      idUser: u1.id, feature: 'embedding_kb_ingest', model: 'gemini-embedding-001', kind: 'embedding', prompt: 1_000_000, output: 0, total: 1_000_000,
    });
    const { pricingWarning } = await getAiUsageOverview({ range: '30d' });
    expect(pricingWarning).toBeNull();
  });

  it('cot "neu dung het han muc": 100 x 34.020d = 3.402.000d = 378% gia goi 900.000d (plans.price doc dung cot)', async () => {
    await seed();
    const { byPlan } = await getAiUsageOverview({ range: '30d' });
    const planP = byPlan.find((plan) => plan.planCode === 'plan_p');
    expect(planP).toMatchObject({
      aiCreditsPerPeriod: 100,
      planPriceVnd: 900000,
      fullQuotaCostVnd: 3402000,
      fullQuotaCostVsPricePct: 378,
    });
  });

  it('chi phi thuc do moi luot theo model (trang Quan ly model AI): 3.5-flash 2 luot 44.640d, 3.8-flash 36.000d, embedding khong co', async () => {
    await seed();
    const { byModel, range } = await getMeasuredCostByModel({ range: '30d' });
    expect(range).toBe('30d');
    // 3.5-flash: chatbot 3,3 + help 0,42 = 3,72 USD / 2 luot = 1,86 USD = 44.640d
    expect(byModel['gemini-3.5-flash']).toMatchObject({ calls: 2, costPerCallVnd: 44640 });
    expect(byModel['gemini-3.8-flash']).toMatchObject({ calls: 1, costPerCallVnd: 36000 });
    expect(byModel._unknown).toMatchObject({ calls: 1, costPerCallVnd: 7200 });
    expect(byModel['gemini-embedding-001']).toBeUndefined();
  });

  it('token trung binh (uoc tinh model chua dung): dau ra tinh tien gom token suy nghi', async () => {
    await seed();
    const avg = await aiUsageRepository.getAvgAiTokenUsage({ windowDays: 30 });
    // Chi tinh dong co prompt > 0 VA output > 0: chatbot, smart_chat, help (embedding va dong cu co output 0 bi loai).
    // vao = (1tr + 1tr + 0,1tr) / 3 = 700.000; ra tinh tien = (0,2tr + 0,2tr + 0,03tr) / 3 = 143.333,33
    // (bao gom suy nghi; neu chi tinh candidates thi la 70.000)
    expect(avg.calls).toBe(3);
    expect(avg.avgPromptTokens).toBeCloseTo(700_000, 3);
    expect(avg.avgOutputTokens).toBeCloseTo(143_333.333, 2);
  });
});
