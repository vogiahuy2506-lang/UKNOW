/**
 * Trần chatbot của gói phải chặn CẢ BA đường làm tăng số chatbot: tạo mới, sao chép khi chia sẻ, mua trên Marketplace
 * (fix 30/09/2026). Trước đó clone + Marketplace đi qua RESOURCE_LIMIT_MAP.chatbots đọc cột `users.max_chatbots` không
 * tồn tại → trần luôn null = không giới hạn; đếm cả chatbot xoá mềm; không cộng slot mua thêm.
 *
 * Chạy trên CSDL thật (không mock DB): con số đếm/trần là thứ cần đo.
 *
 * Phạm vi:
 *  - Chia sẻ (clone) cho người nhận đã có tài khoản: chặn khi hết suất; xoá mềm không tính; slot mua thêm còn hạn được
 *    cộng; không giới hạn thì được; super admin được; lỗi 400 + code cho FE; rollback sạch (không còn dòng chia sẻ).
 *  - Mua chatbot Marketplace: chặn khi hết suất TRƯỚC khi trừ credit / ghi đơn; các ca trên; listing campaign không bị
 *    kiểm suất chatbot.
 *  - Cổng tạo giữ nguyên (403 kèm used/limit/upgradeRequired).
 *  - Hai lượt song song của cùng một chủ không cùng lọt qua "còn 1 suất" (khoá tư vấn).
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

// Chia sẻ gửi mail thông báo — chặn SMTP thật.
const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<sys@test>' });
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});
jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const aiCreditMeter = (await import('../../src/services/ai/aiCreditMeter.service.js')).default;
const { assertChatbotSlotAvailable } = await import('../../src/services/ai/chatbotSlot.service.js');
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
let deductCreditsSpy;

beforeAll(() => {
  app = createApp();
  process.env.TEST_SEND_EMAIL = '1';
  // Trừ credit là việc của aiCreditMeter — ở đây chỉ cần biết NÓ CÓ ĐƯỢC GỌI hay không (thứ tự: kiểm suất trước khi trừ).
  deductCreditsSpy = jest
    .spyOn(aiCreditMeter, 'deductCredits')
    .mockResolvedValue({ success: true, deducted: 50, remaining: { plan: Infinity, wallet: 0 } });
});

beforeEach(async () => {
  await truncateAll();
  deductCreditsSpy.mockClear();
  mockSendMail.mockClear();
});

// ─── helpers ────────────────────────────────────────────────────────────────

let seq = 0;
const uniq = (prefix) => `${prefix}${Date.now()}${++seq}`;

/** Gói có trần chatbot tự đặt (`null` = không giới hạn). */
async function makePlan({ maxChatbots, aiCredits = 1000 }) {
  const code = uniq('plan_');
  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, ai_credits_per_period, max_chatbots, is_active)
     VALUES ($1, $1, 0, $2, $3, true) RETURNING id`,
    [code, aiCredits, maxChatbots]
  );
  return rows[0].id;
}

/**
 * User có gói với trần chatbot riêng. `role: 'admin'` → không gói (super admin bỏ qua cổng gói).
 * `maxChatbots` chỉ có nghĩa khi có gói.
 */
async function makeUser(prefix, { maxChatbots, role = 'user' } = {}) {
  const user = await createUser({ username: uniq(prefix), role, withPlan: false });
  if (role !== 'admin') {
    const planId = await makePlan({ maxChatbots });
    await db.query(
      `UPDATE users SET active_plan_id = $1, subscription_expires_at = NOW() + INTERVAL '365 days' WHERE id = $2`,
      [planId, user.id]
    );
  }
  return user;
}

/** Người chia sẻ / người bán: gói mặc định của helper (trần lớn), không phải đối tượng bị đo. */
const makeOwner = (prefix) => createUser({ username: uniq(prefix) });

async function addChatbots(userId, { active = 0, deleted = 0 } = {}) {
  const ids = [];
  for (let i = 0; i < active + deleted; i += 1) {
    const { rows } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, is_active) VALUES ($1, $2, $3) RETURNING id`,
      [userId, `Bot ${i}`, i < active]
    );
    ids.push(Number(rows[0].id));
  }
  return ids;
}

async function activeChatbotCount(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM custom_chatbots WHERE id_user = $1 AND is_active = true`,
    [userId]
  );
  return rows[0].n;
}

/** Slot chatbot mua thêm còn hạn (đọc từ topup_grants.item_key = 'chatbots'). */
async function grantChatbotSlot(userId, qty, { daysLeft = 20 } = {}) {
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, note, topup_config)
     VALUES ($1, NULL, 50000, $2, $3, 'success', 'payos', 'topup', '{}'::jsonb) RETURNING id`,
    [Date.now() * 100 + Math.floor(Math.random() * 99), `grant-${userId}@test.local`, userId]
  );
  await db.query(
    `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
     VALUES ($1, 'chatbots', $2, $3, NOW() + ($4::text || ' days')::interval)`,
    [userId, qty, rows[0].id, String(daysLeft)]
  );
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function shareChatbot(sharerToken, chatbotId, recipient) {
  return request(app)
    .post(`/api/ai/chatbot/custom-chatbots/${chatbotId}/share`)
    .set('Authorization', `Bearer ${sharerToken}`)
    .send({ recipientEmail: recipient.email });
}

async function insertListing({ sellerId, resourceType = 'chatbot', priceCredits = 0, title = 'Listing' }) {
  const snapshot = resourceType === 'chatbot'
    ? { chatbotName: 'Bot từ chợ' }
    : { campaignName: 'Camp từ chợ', campaignType: 'email', flowJson: { nodes: [], connections: [] }, nodes: [], connections: [] };
  const { rows } = await db.query(
    `INSERT INTO marketplace_listings
       (id_user, resource_type, resource_id, title, description, price_credits, status, snapshot_data, rating_avg)
     VALUES ($1, $2, 1, $3, 'mô tả', $4, 'published', $5, 0)
     RETURNING *`,
    [sellerId, resourceType, title, priceCredits, JSON.stringify(snapshot)]
  );
  return rows[0];
}

async function buy(token, listingId) {
  return request(app)
    .post(`/api/marketplace/purchase/${listingId}`)
    .set('Authorization', `Bearer ${token}`);
}

async function purchaseCount(buyerId) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM marketplace_purchases WHERE id_user = $1`, [buyerId]);
  return rows[0].n;
}

async function shareRowCount(recipientId) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM chatbot_shares WHERE id_recipient = $1`, [recipientId]);
  return rows[0].n;
}

// ─── Chia sẻ (clone) ────────────────────────────────────────────────────────

describe('chia sẻ chatbot (clone) — trần chatbot của NGƯỜI NHẬN', () => {
  let sharer;
  let sharerToken;
  let sourceBotId;

  beforeEach(async () => {
    sharer = await makeOwner('sharer');
    sharerToken = await loginAs(sharer);
    [sourceBotId] = await addChatbots(sharer.id, { active: 1 });
  });

  it('người nhận đã đủ trần (1/1) → 400 CHATBOT_LIMIT_EXCEEDED, KHÔNG clone, rollback sạch (không còn dòng chia sẻ)', async () => {
    const recipient = await makeUser('rcpt', { maxChatbots: 1 });
    await addChatbots(recipient.id, { active: 1 });

    const res = await shareChatbot(sharerToken, sourceBotId, recipient);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
    expect(res.body.message).toContain('Người nhận');
    expect(await activeChatbotCount(recipient.id)).toBe(1); // không có bản sao
    expect(await shareRowCount(recipient.id)).toBe(0); // transaction rollback cả dòng chia sẻ
  });

  it('gói không có chatbot (trần 0) → chặn ngay cả khi người nhận chưa có chatbot nào', async () => {
    const recipient = await makeUser('rcpt0', { maxChatbots: 0 });

    const res = await shareChatbot(sharerToken, sourceBotId, recipient);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
    expect(await activeChatbotCount(recipient.id)).toBe(0);
  });

  it('chatbot ĐÃ XOÁ MỀM không tính vào trần → chia sẻ được', async () => {
    const recipient = await makeUser('rcptsoft', { maxChatbots: 1 });
    await addChatbots(recipient.id, { active: 0, deleted: 1 });

    const res = await shareChatbot(sharerToken, sourceBotId, recipient);

    expect(res.status).toBe(200);
    expect(res.body.data.clonedChatbot).toBeTruthy();
    expect(await activeChatbotCount(recipient.id)).toBe(1);
  });

  it('còn 1 suất (0/1) → chia sẻ được đúng 1 bản, bản thứ hai bị chặn', async () => {
    const recipient = await makeUser('rcptone', { maxChatbots: 1 });
    const [secondBotId] = await addChatbots(sharer.id, { active: 1 });

    const first = await shareChatbot(sharerToken, sourceBotId, recipient);
    const second = await shareChatbot(sharerToken, secondBotId, recipient);

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
    expect(await activeChatbotCount(recipient.id)).toBe(1);
  });

  it('có slot chatbot MUA THÊM còn hạn → được cộng vào trần (1 + 1 = 2)', async () => {
    const recipient = await makeUser('rcptslot', { maxChatbots: 1 });
    await addChatbots(recipient.id, { active: 1 });
    await grantChatbotSlot(recipient.id, 1);

    const res = await shareChatbot(sharerToken, sourceBotId, recipient);

    expect(res.status).toBe(200);
    expect(await activeChatbotCount(recipient.id)).toBe(2);
  });

  it('slot mua thêm ĐÃ HẾT HẠN không được cộng', async () => {
    const recipient = await makeUser('rcptexp', { maxChatbots: 1 });
    await addChatbots(recipient.id, { active: 1 });
    await grantChatbotSlot(recipient.id, 1, { daysLeft: -1 });

    const res = await shareChatbot(sharerToken, sourceBotId, recipient);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
  });

  it('gói không giới hạn (max_chatbots NULL) → được dù đang có nhiều chatbot', async () => {
    const recipient = await makeUser('rcptinf', { maxChatbots: null });
    await addChatbots(recipient.id, { active: 5 });

    const res = await shareChatbot(sharerToken, sourceBotId, recipient);

    expect(res.status).toBe(200);
    expect(await activeChatbotCount(recipient.id)).toBe(6);
  });

  it('người nhận là super admin (không gói) → bỏ qua trần như cổng tạo', async () => {
    const recipient = await makeUser('rcptadmin', { role: 'admin' });
    await addChatbots(recipient.id, { active: 3 });

    const res = await shareChatbot(sharerToken, sourceBotId, recipient);

    expect(res.status).toBe(200);
    expect(await activeChatbotCount(recipient.id)).toBe(4);
  });
});

// ─── Marketplace ────────────────────────────────────────────────────────────

describe('mua chatbot trên Marketplace — trần chatbot của NGƯỜI MUA', () => {
  let seller;

  beforeEach(async () => {
    seller = await makeOwner('seller');
  });

  it('người mua đã đủ trần (1/1) → 400 CHATBOT_LIMIT_EXCEEDED; KHÔNG trừ credit, KHÔNG ghi đơn, KHÔNG cộng người bán, KHÔNG clone', async () => {
    const buyer = await makeUser('buyer', { maxChatbots: 1 });
    await addChatbots(buyer.id, { active: 1 });
    const listing = await insertListing({ sellerId: seller.id, priceCredits: 50 });
    const token = await loginAs(buyer);

    const res = await buy(token, listing.id);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
    expect(res.body.limitReached).toBe(true);
    expect(deductCreditsSpy).not.toHaveBeenCalled(); // kiểm suất PHẢI đứng trước bước trừ credit
    expect(await purchaseCount(buyer.id)).toBe(0);
    expect(await activeChatbotCount(buyer.id)).toBe(1);
    const { rows: stats } = await db.query(
      `SELECT COALESCE(SUM(total_earnings), 0)::int AS earned, COALESCE(SUM(total_sales), 0)::int AS sales
         FROM marketplace_seller_stats WHERE id_user = $1`,
      [seller.id]
    );
    expect(stats[0]).toEqual({ earned: 0, sales: 0 }); // người bán không được cộng tiền cho đơn bị chặn
    const { rows: listingRows } = await db.query(`SELECT purchase_count FROM marketplace_listings WHERE id = $1`, [listing.id]);
    expect(Number(listingRows[0].purchase_count || 0)).toBe(0);
  });

  it('gói không có chatbot (trần 0) → chặn khi mua chatbot MIỄN PHÍ', async () => {
    const buyer = await makeUser('buyer0', { maxChatbots: 0 });
    const listing = await insertListing({ sellerId: seller.id, priceCredits: 0 });

    const res = await buy(await loginAs(buyer), listing.id);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
    expect(await purchaseCount(buyer.id)).toBe(0);
  });

  it('chatbot đã xoá mềm không tính → mua được, trừ credit đúng 1 lần', async () => {
    const buyer = await makeUser('buyersoft', { maxChatbots: 1 });
    await addChatbots(buyer.id, { active: 0, deleted: 1 });
    const listing = await insertListing({ sellerId: seller.id, priceCredits: 50 });
    await db.query(
      `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end)
       VALUES ($1, 'ai_credit', 100, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second')`,
      [buyer.id]
    );

    const res = await buy(await loginAs(buyer), listing.id);

    expect(res.status).toBe(200);
    expect(deductCreditsSpy).toHaveBeenCalledTimes(1);
    expect(await activeChatbotCount(buyer.id)).toBe(1);
    expect(await purchaseCount(buyer.id)).toBe(1);
  });

  it('có slot chatbot mua thêm còn hạn → mua được (1 + 1 = 2)', async () => {
    const buyer = await makeUser('buyerslot', { maxChatbots: 1 });
    await addChatbots(buyer.id, { active: 1 });
    await grantChatbotSlot(buyer.id, 1);
    const listing = await insertListing({ sellerId: seller.id, priceCredits: 0 });

    const res = await buy(await loginAs(buyer), listing.id);

    expect(res.status).toBe(200);
    expect(await activeChatbotCount(buyer.id)).toBe(2);
  });

  it('gói không giới hạn (NULL) → mua được', async () => {
    const buyer = await makeUser('buyerinf', { maxChatbots: null });
    await addChatbots(buyer.id, { active: 4 });
    const listing = await insertListing({ sellerId: seller.id, priceCredits: 0 });

    const res = await buy(await loginAs(buyer), listing.id);

    expect(res.status).toBe(200);
    expect(await activeChatbotCount(buyer.id)).toBe(5);
  });

  it('super admin mua (không gói) → bỏ qua trần', async () => {
    const buyer = await makeUser('buyeradmin', { role: 'admin' });
    await addChatbots(buyer.id, { active: 2 });
    const listing = await insertListing({ sellerId: seller.id, priceCredits: 0 });

    const res = await buy(await loginAs(buyer), listing.id);

    expect(res.status).toBe(200);
    expect(await activeChatbotCount(buyer.id)).toBe(3);
  });

  it('listing CAMPAIGN không bị kiểm suất chatbot (người mua hết suất chatbot vẫn mua được campaign)', async () => {
    const buyer = await makeUser('buyercamp', { maxChatbots: 0 });
    const listing = await insertListing({ sellerId: seller.id, resourceType: 'campaign', priceCredits: 0 });

    const res = await buy(await loginAs(buyer), listing.id);

    expect(res.status).toBe(200);
  });
});

// ─── Cổng tạo giữ nguyên ────────────────────────────────────────────────────

describe('cổng tạo chatbot — giữ nguyên hành vi + hình dạng lỗi', () => {
  const create = (token) =>
    request(app)
      .post('/api/ai/chatbot/custom-chatbots')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bot mới' });

  it('đủ trần (1/1) → 403 kèm message, code, used, limit, upgradeRequired', async () => {
    const user = await makeUser('creator', { maxChatbots: 1 });
    await addChatbots(user.id, { active: 1 });

    const res = await create(await loginAs(user));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: 'Bạn đã đạt giới hạn 1 chatbot của gói dịch vụ hiện tại.',
      code: 'CHATBOT_LIMIT_EXCEEDED',
      used: 1,
      limit: 1,
      upgradeRequired: true,
    });
    expect(await activeChatbotCount(user.id)).toBe(1);
  });

  it('chatbot xoá mềm không tính → tạo được (201); slot mua thêm được cộng', async () => {
    const user = await makeUser('creatorsoft', { maxChatbots: 1 });
    await addChatbots(user.id, { active: 0, deleted: 1 });
    const token = await loginAs(user);

    expect((await create(token)).status).toBe(201);
    expect((await create(token)).status).toBe(403); // 1/1

    await grantChatbotSlot(user.id, 1);
    expect((await create(token)).status).toBe(201); // 2/2
  });
});

// ─── Song song ──────────────────────────────────────────────────────────────

describe('hai lượt song song của cùng một chủ không cùng lọt qua "còn 1 suất"', () => {
  it('khoá tư vấn: lượt B phải ĐỢI lượt A commit, rồi thấy chatbot của A và bị chặn', async () => {
    const user = await makeUser('racer', { maxChatbots: 1 });
    const a = await db.getClient();
    const b = await db.getClient();
    try {
      await a.query('BEGIN');
      await assertChatbotSlotAvailable(user.id, { client: a }); // A qua (0/1) và giữ khoá tới khi commit

      await b.query('BEGIN');
      let bSettled = false;
      const bResult = assertChatbotSlotAvailable(user.id, { client: b })
        .then(() => 'passed', (err) => err.code)
        .finally(() => { bSettled = true; });

      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(bSettled).toBe(false); // B đang xếp hàng chờ khoá của A — KHÔNG được đọc "0/1" rồi lọt qua

      await a.query(`INSERT INTO custom_chatbots (id_user, name) VALUES ($1, 'A clone')`, [user.id]);
      await a.query('COMMIT');

      expect(await bResult).toBe('CHATBOT_LIMIT_EXCEEDED');
      await b.query('ROLLBACK');
    } finally {
      a.release();
      b.release();
    }
    expect(await activeChatbotCount(user.id)).toBe(1);
  });

  it('hai lượt chia sẻ đồng thời cho người nhận còn 1 suất → đúng 1 thành công', async () => {
    const sharer = await makeOwner('psharer');
    const token = await loginAs(sharer);
    const [botA, botB] = await addChatbots(sharer.id, { active: 2 });
    const recipient = await makeUser('prcpt', { maxChatbots: 1 });

    const results = await Promise.all([
      shareChatbot(token, botA, recipient),
      shareChatbot(token, botB, recipient),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await activeChatbotCount(recipient.id)).toBe(1);
  });

  it('hai lượt mua Marketplace đồng thời cho người mua còn 1 suất → đúng 1 thành công', async () => {
    const seller = await makeOwner('pseller');
    const buyer = await makeUser('pbuyer', { maxChatbots: 1 });
    const l1 = await insertListing({ sellerId: seller.id, priceCredits: 0, title: 'L1' });
    const l2 = await insertListing({ sellerId: seller.id, priceCredits: 0, title: 'L2' });
    const token = await loginAs(buyer);

    const results = await Promise.all([buy(token, l1.id), buy(token, l2.id)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await activeChatbotCount(buyer.id)).toBe(1);
    expect(await purchaseCount(buyer.id)).toBe(1);
  });
});
