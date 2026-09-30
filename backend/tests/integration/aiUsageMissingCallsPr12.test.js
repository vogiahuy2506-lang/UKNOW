/**
 * PR-12 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, audit_ai.md C-4) - ghi `usage_logs` cho cac loi goi Gemini truoc day "vo hinh"
 * (Google tinh tien nhung so khong co dong nao), chay tren Postgres THAT. Gemini duoc gia lap bang global.fetch.
 *
 * Vi sao can file nay: unit test mock `usageTrackingService`/DB nen KHONG thay duoc (a) `id_user = NULL` co that su ghi duoc vao
 * bang (migration 273 nho NOT NULL), (b) cac truy van admin (JOIN users, DISTINCT id_user, percentile...) xu ly dong NULL dung,
 * (c) han muc credit cua khach khong lech khi co dong NULL. Chi phi cong tay nam trong tung ca.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../src/config/database.js';
import aiCreditMeter from '../../src/services/ai/aiCreditMeter.service.js';
import usageTrackingService from '../../src/services/payment/usageTracking.service.js';
import customChatService from '../../src/services/ai/customChat.service.js';
import chatRouterService from '../../src/services/chatbot/chatRouter.service.js';
import heroConsultationService from '../../src/services/heroConsultation.service.js';
import { fillContentSlots } from '../../src/services/ai/campaignSlotFiller.service.js';
import { compileCampaign } from '../../src/services/ai/campaignCompiler.service.js';
import { getAiUsageOverview } from '../../src/services/admin/aiUsage.service.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_273 = path.resolve(__dirname, '../../migrations/273_usage_logs_id_user_nullable.sql');

const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const originalPricing = process.env.AI_PRICING_JSON;
const originalRate = process.env.USD_VND_RATE;

/** Google tra text + usageMetadata (token that: vao / ra / tong). */
const geminiReply = (text, usage) => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({
    candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    ...(usage ? { usageMetadata: usage } : {}),
  }),
});

const embeddingReply = () => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ embedding: { values: Array(768).fill(0.01) }, usageMetadata: { promptTokenCount: 30, totalTokenCount: 30 } }),
});

/**
 * Gia lap Google: `:embedContent` -> vector; `:generateContent` -> lan luot cac phan hoi trong `replies`.
 * Tra ve mang URL da goi (de doi chieu model that).
 */
function installGemini(replies = []) {
  const queue = [...replies];
  const urls = [];
  global.fetch = jest.fn(async (url) => {
    const target = String(url);
    urls.push(target);
    if (target.includes(':embedContent')) return embeddingReply();
    if (target.includes(':generateContent')) {
      const next = queue.shift();
      if (!next) throw new Error(`Gemini gia lap het phan hoi cho ${target}`);
      return next;
    }
    throw new Error(`fetch khong duoc gia lap: ${target}`);
  });
  return urls;
}

const modelInUrl = (url) => decodeURIComponent(String(url).match(/models\/([^:]+):generateContent/)?.[1] || '');

async function tokenRows(feature) {
  const { rows } = await db.query(
    `SELECT id_user, actor_user_id, delta, metadata
       FROM usage_logs
      WHERE resource_type = 'ai_token' AND metadata->>'feature' = $1
      ORDER BY id`,
    [feature]
  );
  return rows;
}

const creditRows = async () => (await db.query(
  `SELECT id_user, delta, metadata FROM usage_logs WHERE resource_type = 'ai_credit' ORDER BY id`
)).rows;

/** Doi den khi co du `count` dong (ghi khong await o luong cong khai - chat trang chu). */
async function waitForTokenRows(feature, count = 1, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let rows = await tokenRows(feature);
  while (rows.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    rows = await tokenRows(feature);
  }
  return rows;
}

async function createChatbot(ownerId) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, 'Bot PR-12', $2) RETURNING *`,
    [ownerId, `pr12_${Date.now()}_${Math.floor(Math.random() * 1000)}`]
  );
  return rows[0];
}

async function setupLimitedOwner() {
  const plan = await createPlan({ code: `pr12_${Date.now()}`, name: 'Goi PR-12', aiCreditsPerPeriod: 100 });
  const owner = await createUser({ username: `pr12owner${Date.now()}`, planId: plan.id });
  await assignPlanToUser(owner.id, plan.id);
  return { plan, owner };
}

beforeEach(async () => {
  await truncateAll();
  process.env.GEMINI_API_KEY = 'test-key-pr12';
  process.env.USD_VND_RATE = '24000';
  delete process.env.AI_PRICING_JSON;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  if (originalPricing === undefined) delete process.env.AI_PRICING_JSON;
  else process.env.AI_PRICING_JSON = originalPricing;
  if (originalRate === undefined) delete process.env.USD_VND_RATE;
  else process.env.USD_VND_RATE = originalRate;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('migration 273: usage_logs.id_user cho phep NULL, khoa ngoai giu nguyen', () => {
  it('cot id_user nullable; van co khoa ngoai toi users ON DELETE CASCADE', async () => {
    const { rows: cols } = await db.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usage_logs' AND column_name = 'id_user'`
    );
    expect(cols[0].is_nullable).toBe('YES');

    const { rows: fks } = await db.query(
      `SELECT c.confdeltype, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
        WHERE c.conrelid = 'usage_logs'::regclass AND c.contype = 'f'
          AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (id_user)%'`
    );
    expect(fks).toHaveLength(1);
    expect(fks[0].confdeltype).toBe('c'); // c = CASCADE
  });

  it('xoa user van cascade dong cua user do, dong NULL (khach vang lai) o lai', async () => {
    const user = await createUser({ username: 'pr12del', withPlan: false });
    await usageTrackingService.trackUsage(user.id, 'ai_token', 10, { feature: 'smart_chat' });
    await usageTrackingService.trackUsage(null, 'ai_token', 20, { feature: 'hero_consultation' });

    await db.query('DELETE FROM users WHERE id = $1', [user.id]);

    const { rows } = await db.query(`SELECT id_user, delta FROM usage_logs ORDER BY id`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id_user).toBeNull();
    expect(rows[0].delta).toBe(20);
  });

  it('chay lai FILE migration tren cot dang NOT NULL: cot thanh nullable (idempotent), khong mat dong nao', async () => {
    const owner = await createUser({ username: 'pr12mig', withPlan: false });
    await usageTrackingService.trackUsage(owner.id, 'ai_token', 5, { feature: 'smart_chat' });
    const sql = fs.readFileSync(MIGRATION_273, 'utf8');
    try {
      await db.query('ALTER TABLE usage_logs ALTER COLUMN id_user SET NOT NULL');
      await expect(usageTrackingService.trackUsage(null, 'ai_token', 1, {})).rejects.toThrow(/null value in column "id_user"/);

      await db.query(sql);
      await db.query(sql); // chay lai khong loi

      const { rows } = await db.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'usage_logs' AND column_name = 'id_user'`
      );
      expect(rows[0].is_nullable).toBe('YES');
      await usageTrackingService.trackUsage(null, 'ai_token', 1, {});
      const { rows: all } = await db.query(`SELECT count(*)::int AS n FROM usage_logs`);
      expect(all[0].n).toBe(2);
    } finally {
      await db.query(sql); // tra lai trang thai bootstrap cho cac suite sau
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('OCR khi nap tai lieu vao kho kien thuc: ghi token kb_ocr cho chu chatbot, KHONG tru credit', () => {
  const OCR_USAGE = { promptTokenCount: 2500, candidatesTokenCount: 120, totalTokenCount: 2620 };

  it('nap ANH: dung 1 dong kb_ocr (id_user = chu, token that, model that), khong co dong ai_credit nao', async () => {
    const { owner } = await setupLimitedOwner();
    const chatbot = await createChatbot(owner.id);
    const urls = installGemini([geminiReply('Bang gia: Goi A 100.000d, Goi B 200.000d cho moi thang', OCR_USAGE)]);

    const res = await customChatService.uploadDocument({
      chatbotId: chatbot.id,
      userId: owner.id,
      file: { originalname: 'bang-gia.png', buffer: Buffer.from('fake-png-bytes') },
    });
    expect(res.chunks).toBeGreaterThan(0);

    const rows = await tokenRows('kb_ocr');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
    expect(rows[0].delta).toBe(2620);
    expect(rows[0].metadata).toMatchObject({
      feature: 'kb_ocr', promptTokens: 2500, outputTokens: 120, totalTokens: 2620,
    });
    // model ghi tren dong = model that da goi (khong phai chuoi rong / khong ghim ten)
    expect(rows[0].metadata.model).toBeTruthy();
    expect(rows[0].metadata.model).toBe(modelInUrl(urls.find((u) => u.includes(':generateContent'))));
    // chinh sach credit: nap tai lieu = lap chi muc, KHONG tru credit
    expect(await creditRows()).toEqual([]);
  });

  it('nap PDF quet (khong trich duoc chu): fallback Gemini cung ghi 1 dong kb_ocr cho chu, khong tru credit', async () => {
    const { owner } = await setupLimitedOwner();
    const chatbot = await createChatbot(owner.id);
    installGemini([geminiReply('Noi dung cua tai lieu quet: chinh sach doi tra trong 7 ngay', OCR_USAGE)]);
    jest.spyOn(console, 'error').mockImplementation(() => {}); // pdf-parse bao loi tren byte gia -> di tiep sang Gemini

    await customChatService.uploadDocument({
      chatbotId: chatbot.id,
      userId: owner.id,
      file: { originalname: 'scan.pdf', buffer: Buffer.from('%PDF-1.4 khong-phai-pdf-that') },
    });

    const rows = await tokenRows('kb_ocr');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
    expect(rows[0].delta).toBe(2620);
    expect(await creditRows()).toEqual([]);
  });

  it('anh chi co "NO_RELEVANT_TEXT_FOUND": Google van tinh tien nen VAN ghi kb_ocr (file khong duoc nap: 400)', async () => {
    const { owner } = await setupLimitedOwner();
    const chatbot = await createChatbot(owner.id);
    installGemini([geminiReply('NO_RELEVANT_TEXT_FOUND', OCR_USAGE)]);

    await expect(customChatService.uploadDocument({
      chatbotId: chatbot.id,
      userId: owner.id,
      file: { originalname: 'trang-tri.png', buffer: Buffer.from('fake') },
    })).rejects.toMatchObject({ status: 400 });

    expect(await tokenRows('kb_ocr')).toHaveLength(1);
    expect(await creditRows()).toEqual([]);
  });

  it('tai lieu chu thuong (txt): khong goi Gemini, khong co dong kb_ocr', async () => {
    const { owner } = await setupLimitedOwner();
    const chatbot = await createChatbot(owner.id);
    installGemini([]);

    await customChatService.uploadDocument({
      chatbotId: chatbot.id,
      userId: owner.id,
      file: { originalname: 'ghi-chu.txt', buffer: Buffer.from('Noi dung van ban thuan, khong can OCR gi ca.') },
    });

    expect(await tokenRows('kb_ocr')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('dien noi dung chien dich (slot filler): ghi token campaign_slots co id_user', () => {
  const intent = {
    version: 1,
    channel: 'zalo_group',
    sender: { type: 'zalo_account', id: 8 },
    audience: { type: 'zalo_contacts', groupIds: ['g1'] },
    schedule: { type: 'once' },
    contentBrief: { topic: 'Khai giang khoa AI', targetAudience: 'Hoc vien', tone: 'Hao hung', locale: 'vi' },
  };

  it('1 dong campaign_slots cho userId, token that; khong tru them credit (luot chien dich da tru o tang tren)', async () => {
    const { owner } = await setupLimitedOwner();
    const compiled = compileCampaign(intent);
    installGemini([geminiReply(
      JSON.stringify({ slots: [{ slotId: compiled.contentSlots[0].slotId, message: 'Chao ca nha, khoa AI khai giang toi thu 6 nhe!' }] }),
      { promptTokenCount: 900, candidatesTokenCount: 70, totalTokenCount: 1100 }
    )]);

    const res = await fillContentSlots({ compiledGraph: compiled, campaignIntent: intent, userId: owner.id, requestedModel: null });

    expect(res.success).toBe(true);
    const rows = await tokenRows('campaign_slots');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
    expect(rows[0].delta).toBe(1100);
    expect(rows[0].metadata).toMatchObject({ promptTokens: 900, outputTokens: 70, totalTokens: 1100 });
    expect(rows[0].metadata.model).toBeTruthy();
    expect(await creditRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('chat tu van trang chu (khach vang lai): ghi token id_user NULL', () => {
  it('dong hero_consultation co id_user NULL, token that, khong co dong credit; khach van nhan cau tra loi', async () => {
    heroConsultationService._resetForTests();
    installGemini([geminiReply('Chao ban, Founder AI co 4 goi.', { promptTokenCount: 1500, candidatesTokenCount: 90, totalTokenCount: 1590 })]);

    const res = await heroConsultationService.processChat({ visitorId: 'pr12_visitor_1', message: 'Co nhung goi nao?', ip: '10.9.0.1' });
    expect(res).toMatchObject({ success: true, reply: 'Chao ban, Founder AI co 4 goi.' });

    const rows = await waitForTokenRows('hero_consultation', 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id_user).toBeNull();
    expect(rows[0].actor_user_id).toBeNull();
    expect(rows[0].delta).toBe(1590);
    expect(rows[0].metadata).toMatchObject({ feature: 'hero_consultation', promptTokens: 1500, outputTokens: 90 });
    expect(rows[0].metadata.model).toBeTruthy();
    expect(await creditRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('bot tra loi RONG: ghi token TRUOC khi nem loi, khong tru credit', () => {
  const routeArgs = (ownerId) => ({
    channel: 'web',
    userId: ownerId,
    message: 'Xin chao',
    conversationId: null,
    chatbotSettings: { is_enabled: true, ai_model: 'gemini-x', temperature: 0.7, max_tokens: 512 },
    chatbotId: null,
  });
  const USAGE = { promptTokenCount: 800, candidatesTokenCount: 0, totalTokenCount: 830 };

  it('doi chung: tra loi binh thuong -> 1 dong token chatbot_reply + 1 credit chatbot_web', async () => {
    const { owner } = await setupLimitedOwner();
    installGemini([geminiReply('Chao ban!', { promptTokenCount: 800, candidatesTokenCount: 20, totalTokenCount: 820 })]);

    const res = await chatRouterService.routeMessageWithSettings(routeArgs(owner.id));

    expect(res.content).toContain('Chao ban!');
    expect(await tokenRows('chatbot_reply')).toHaveLength(1);
    const credits = await creditRows();
    expect(credits).toHaveLength(1);
    expect(credits[0].metadata.feature).toBe('chatbot_web');
  });

  it('Gemini tra cau rong (het token vao suy nghi / bi loc): DONG token chatbot_reply van co, KHONG co dong ai_credit', async () => {
    const { owner } = await setupLimitedOwner();
    installGemini([geminiReply('', USAGE)]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await chatRouterService.routeMessageWithSettings(routeArgs(owner.id));

    // khach nhan cau xin loi co dinh (luong chinh khong vo)
    expect(res.content).toContain('Xin lỗi');
    const rows = await tokenRows('chatbot_reply');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(owner.id));
    expect(rows[0].delta).toBe(830);
    expect(await creditRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('trang Chi phi AI admin voi dong id_user NULL', () => {
  const HOUR = 3600 * 1000;

  async function insertToken({ idUser, feature, model = 'gemini-3.5-flash', prompt, output, total, kind }) {
    const meta = {
      feature, model, promptTokens: prompt, outputTokens: output, totalTokens: total, ...(kind ? { kind } : {}),
    };
    const at = new Date(Date.now() - HOUR);
    await db.query(
      `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end, metadata, created_at)
       VALUES ($1, 'ai_token', $2, $3, $4, $5::jsonb, $6)`,
      [idUser, total, at, new Date(at.getTime() + 30 * 24 * HOUR), JSON.stringify(meta), at]
    );
  }

  /**
   * Cong tay (gia niem yet 3.5-flash: vao 1,5 USD/1tr, ra 9 USD/1tr; 1 USD = 24.000d):
   *   u1 (co goi):
   *     chatbot_reply  vao 1tr / ra 0,1tr / tong 1,2tr (0,1tr suy nghi -> dau ra tinh tien 0,2tr) = 1,5 + 0,2 x 9 = 3,30 USD =  79.200d
   *     kb_ocr         vao 1tr / ra 0    / tong 1tr                                                = 1,5 USD           =  36.000d  (nap tai lieu: khong tinh luot)
   *   NULL (khach vang lai, he thong):
   *     hero_consultation vao 1tr / ra 0,1tr / tong 1,2tr                                          = 3,30 USD          =  79.200d
   *     help_answer       vao 0,1tr / ra 0,01tr / tong 0,13tr -> ra tinh tien 0,03tr = 0,15 + 0,27 = 0,42 USD          =  10.080d
   * Tong = 79.200 + 36.000 + 79.200 + 10.080 = 204.480d. Luot goi = chatbot + hero + help = 3 (kb_ocr la nap tai lieu).
   */
  async function seed() {
    const planP = await createPlan({ code: 'pr12_p', name: 'Goi P', price: 900000, aiCreditsPerPeriod: 100 });
    const u1 = await createUser({ username: 'pr12u1', planId: planP.id, phone: '0900000101' });
    await insertToken({ idUser: u1.id, feature: 'chatbot_reply', prompt: 1_000_000, output: 100_000, total: 1_200_000 });
    await insertToken({ idUser: u1.id, feature: 'kb_ocr', prompt: 1_000_000, output: 0, total: 1_000_000 });
    await insertToken({ idUser: null, feature: 'hero_consultation', prompt: 1_000_000, output: 100_000, total: 1_200_000 });
    await insertToken({ idUser: null, feature: 'help_answer', prompt: 100_000, output: 10_000, total: 130_000 });
    return { planP, u1 };
  }

  it('TONG chi phi + luot goi + bieu do GOM dong NULL: 204.480d, 3 luot', async () => {
    await seed();
    const { summary, timeline } = await getAiUsageOverview({ range: '30d' });

    expect(summary).toMatchObject({
      estimatedCostUsd: 8.52,
      estimatedCostVnd: 204480,
      calls: 3,
      logCount: 4,
    });
    // bieu do cung nguon voi tong: dong NULL cung nam trong cot ngay
    expect(timeline.reduce((sum, day) => sum + day.estimatedCostVnd, 0)).toBe(204480);
  });

  it('bang theo tinh nang co dong MOI: hero (chat trang chu) + nap tai lieu (kb_ocr) + tro giup (dong NULL)', async () => {
    await seed();
    const { byFeature } = await getAiUsageOverview({ range: '30d' });
    const byGroup = Object.fromEntries(byFeature.map((item) => [item.group, item]));

    expect(byGroup.hero).toMatchObject({
      calls: 1, estimatedCostVnd: 79200, costPerCallVnd: 79200, features: ['hero_consultation'], countsAsCall: true,
    });
    expect(byGroup.embedding).toMatchObject({
      countsAsCall: false, estimatedCostVnd: 36000, costPerCallVnd: null, features: ['kb_ocr'],
    });
    expect(byGroup.help).toMatchObject({ calls: 1, estimatedCostVnd: 10080 });
    expect(byGroup.chatbot).toMatchObject({ calls: 1, estimatedCostVnd: 79200 });
  });

  it('"khach dang dung AI" va "user dung AI" KHONG dem dong NULL (chi u1)', async () => {
    await seed();
    // them mot dong NULL o nhom TINH la khach dung AI (ma la -> "other"): van khong duoc dem la khach
    await insertToken({ idUser: null, feature: 'tinh_nang_la', prompt: 1000, output: 100, total: 1100 });

    const { summary } = await getAiUsageOverview({ range: '30d' });
    expect(summary.customers).toBe(1); // u1 (chatbot_reply); kb_ocr khong tinh; dong NULL khong tinh
    expect(summary.userCount).toBe(1); // KHONG phai 2 hay 3 ("null" khong phai mot user)
  });

  it('theo goi / top user / p90 chi gom khach that: dong NULL khong lot vao "Unknown plan" hay thanh mot user khong lo', async () => {
    const { u1 } = await seed();
    const { byPlan, topUsers } = await getAiUsageOverview({ range: '30d' });

    expect(byPlan.map((plan) => plan.planCode)).toEqual(['pr12_p']); // khong co dong 'unknown' do dong NULL sinh ra
    expect(byPlan[0].totalTokens).toBe(2_200_000); // 1,2tr + 1tr cua u1, khong gom 1,33tr cua dong NULL
    expect(byPlan[0].p90UserTokens).toBe(2_200_000);
    expect(topUsers).toHaveLength(1);
    expect(topUsers[0]).toMatchObject({ userId: Number(u1.id), totalTokens: 2_200_000 });
  });

  it('han muc credit cua khach KHONG doi khi co dong NULL (loc id_user = $1)', async () => {
    const { plan, owner } = await setupLimitedOwner();
    await usageTrackingService.trackUsage(owner.id, 'ai_credit', 1, { feature: 'chatbot_web' });
    await usageTrackingService.trackUsage(owner.id, 'ai_credit', 1, { feature: 'chatbot_web' });

    const before = await usageTrackingService.getCreditUsageForCycle(owner.id);
    expect(before.used).toBe(2);

    // dong NULL dung nghia (ai_token) + mot dong ai_credit NULL "phong ho" (khong duong nao ghi, nhung neu co cung khong duoc lam lech)
    await usageTrackingService.trackUsage(null, 'ai_token', 5000, { feature: 'hero_consultation' });
    await usageTrackingService.trackUsage(null, 'ai_credit', 50, { feature: 'phong_ho' });

    const after = await usageTrackingService.getCreditUsageForCycle(owner.id);
    expect(after.used).toBe(2);
    await expect(aiCreditMeter.assertAvailable(owner.id)).resolves.toMatchObject({ skip: false });
    expect(plan.ai_credits_per_period).toBe(100);
  });
});
