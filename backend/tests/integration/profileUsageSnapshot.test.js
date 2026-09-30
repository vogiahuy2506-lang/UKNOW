/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — trang Thanh toán: mọi đồng hồ "đã dùng" đi qua hàm của cổng chặn.
 *
 * Sự cố gốc (đo production 30/09): GET /users/profile tự đếm "đã dùng" bằng SQL riêng — email/Zalo từ
 * `customer_journey` JOIN qua cột `campaign_id` (chưa từng được ghi), chatbot từ bảng `chatbots` và landing từ cột
 * `landing_pages.owner_user_id` (đều KHÔNG tồn tại), nhân viên đếm mọi dòng `user_members` — lỗi bị `.catch` nuốt nên
 * trang luôn hiện 0 trong khi cổng vẫn chặn. Mọi unit test của phần này giả lập DB nên không thấy: file này chạy SQL
 * THẬT trên Postgres và so số trên hồ sơ với (a) bảng chân lý cộng TAY ngay trong ca, (b) chính hàm của cổng chặn.
 *
 * Bảng chân lý tin gửi (chủ 'sender', kỳ = [kích hoạt + 30 ngày, kích hoạt + 60 ngày] = [-15 ngày, +15 ngày]):
 *   email_messages : 7/10 trạng thái được đếm ở -1 ngày (bỏ pending, queued, failed), + 1 thư `opened` HÔM NAY
 *                    = 8; loại: preview, thư -20 ngày (ngoài kỳ), thư của chủ khác.
 *   gửi nhanh email: usage_logs email_direct_send 3 (-2 ngày) + 2 (hôm nay) = 5.
 *   => EMAIL_KỲ = 8 + 5 = 13; EMAIL_HÔM_NAY = 1 + 2 = 3.
 *   zalo_messages  : sent 3 (-1 ngày) + 2 (hôm nay) = 5; loại: failed, aborted, preview, sent -20 ngày.
 *   kênh adapter   : campaign_channel_messages sent telegram 2 + whatsapp 1 (-2 ngày) + telegram 1 (hôm nay) = 4;
 *                    loại: failed, preview.
 *   gửi nhanh Zalo : usage_logs zalo_direct_send 4 (-3 ngày).
 *   => NHẮN_TIN_KỲ = 5 + 4 + 4 = 13; NHẮN_TIN_HÔM_NAY = 2 + 1 = 3.
 *   => TỔNG_KỲ (countCombinedSentInCycle) = 13 + 13 = 26.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';
import { checkUserResourceLimit } from '../../src/utils/userResourceLimit.util.js';
import {
  _clearQuotaCache,
  countEmailSentInCycle,
  countZaloSentInCycle,
  countCombinedSentInCycle,
  countEmailSentToday,
  countZaloSentToday,
} from '../../src/utils/userSendLimit.util.js';
import { getBillingCycle } from '../../src/utils/billingCycle.util.js';

const DAY = 86400000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);

// Bảng chân lý cộng tay (xem đầu file) — KHÔNG tính từ mã đang test.
const EMAIL_KY = 13;
const EMAIL_HOM_NAY = 3;
const NHAN_TIN_KY = 13;
const NHAN_TIN_HOM_NAY = 3;
const TONG_KY = 26;

const EMAIL_STATUSES = [
  'pending', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'spam', 'unsubscribed',
];

let app;
let seq = 0;
const uniq = (prefix) => `${prefix}_${Date.now()}_${seq++}`;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  // Bảng creds WhatsApp không có khoá ngoại tới users nên truncateAll không dọn.
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

/** Gọi hồ sơ với cache đếm của cổng xoá sạch, để mỗi lần gọi đếm mới từ DB. */
async function getProfile(token) {
  _clearQuotaCache();
  const res = await request(app).get('/api/users/profile').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.data;
}

async function setPlanActivatedAt(userId, date) {
  await db.query('UPDATE users SET plan_activated_at = $1 WHERE id = $2', [date, userId]);
}

/** Chủ có gói kích hoạt cách đây 45 ngày → kỳ hiện tại = [-15 ngày, +15 ngày]. */
async function customerOnPlan(username, planOverrides = {}) {
  const plan = await createPlan({ isActive: true, ...planOverrides });
  const user = await createUser({ username, planId: plan.id });
  await setPlanActivatedAt(user.id, daysAgo(45));
  return { user, plan };
}

const PLAN_CO_TRAN = {
  monthlyEmailLimit: 10000,
  monthlyZaloLimit: 5000,
  dailyEmailLimit: 500,
  dailyZaloLimit: 200,
  messagesPerPeriod: 100,
  aiCreditsPerPeriod: 100,
  maxEmployees: 3,
  maxChatbots: 2,
};

async function insertEmail({ ownerId, status, isPreview = false, daysBack = 1 }) {
  await db.query(
    `INSERT INTO email_messages (workspace_owner_id, actor_user_id, recipient_email, sender_email, subject, status, is_preview, sent_at)
     VALUES ($1, $1, 'cust@example.com', 'sender@example.com', 'Sub', $2, $3, NOW() - ($4::numeric * INTERVAL '1 day'))`,
    [ownerId, status, isPreview, daysBack]
  );
}

async function insertZalo({ ownerId, status = 'sent', isPreview = false, daysBack = 1 }) {
  await db.query(
    `INSERT INTO zalo_messages (workspace_owner_id, actor_user_id, channel, status, is_preview, sent_at, tracking_token, tracking_metadata)
     VALUES ($1, $1, 'zalo_personal', $2, $3, NOW() - ($4::numeric * INTERVAL '1 day'), $5, $6::jsonb)`,
    [ownerId, status, isPreview, daysBack, uniq('tok'), JSON.stringify({ status })]
  );
}

async function insertAdapter({ ownerId, channel, status = 'sent', isPreview = false, daysBack = 2 }) {
  await db.query(
    `INSERT INTO campaign_channel_messages (channel, recipient_key, status, is_preview, workspace_owner_id, actor_user_id, sent_at)
     VALUES ($1, $2, $3, $4, $5, $5, NOW() - ($6::numeric * INTERVAL '1 day'))`,
    [channel, uniq('rk'), status, isPreview, ownerId, daysBack]
  );
}

async function insertDirectSend({ ownerId, resourceType, delta, daysBack }) {
  await db.query(
    `INSERT INTO usage_logs (id_user, actor_user_id, resource_type, delta, period_start, period_end, metadata, created_at)
     VALUES ($1, $1, $2, $3, NOW(), NOW() + INTERVAL '30 days', '{"source":"quick_send"}'::jsonb,
             NOW() - ($4::numeric * INTERVAL '1 day'))`,
    [ownerId, resourceType, delta, daysBack]
  );
}

/** Dựng đúng bộ dữ liệu ở bảng chân lý đầu file cho chủ `ownerId`. */
async function seedSendHistory(ownerId, otherOwnerId) {
  // email_messages: 10 trạng thái ở -1 ngày (7 được đếm) …
  for (const status of EMAIL_STATUSES) await insertEmail({ ownerId, status });
  await insertEmail({ ownerId, status: 'sent', isPreview: true }); // preview: loại
  await insertEmail({ ownerId, status: 'sent', daysBack: 20 }); // ngoài kỳ: loại
  await insertEmail({ ownerId: otherOwnerId, status: 'sent' }); // chủ khác: loại
  await insertEmail({ ownerId, status: 'opened', daysBack: 0 }); // hôm nay: đã mở vẫn được đếm
  // … gửi nhanh email
  await insertDirectSend({ ownerId, resourceType: 'email_direct_send', delta: 3, daysBack: 2 });
  await insertDirectSend({ ownerId, resourceType: 'email_direct_send', delta: 2, daysBack: 0 });

  // zalo_messages
  for (let i = 0; i < 3; i += 1) await insertZalo({ ownerId });
  for (let i = 0; i < 2; i += 1) await insertZalo({ ownerId, daysBack: 0 });
  await insertZalo({ ownerId, status: 'failed' }); // lỗi: loại
  await insertZalo({ ownerId, status: 'aborted' }); // chưa từng gửi: loại
  await insertZalo({ ownerId, isPreview: true }); // preview: loại
  await insertZalo({ ownerId, daysBack: 20 }); // ngoài kỳ: loại
  // kênh adapter (Telegram / WhatsApp) — cùng hạn mức với Zalo
  await insertAdapter({ ownerId, channel: 'telegram' });
  await insertAdapter({ ownerId, channel: 'telegram' });
  await insertAdapter({ ownerId, channel: 'whatsapp' });
  await insertAdapter({ ownerId, channel: 'telegram', daysBack: 0 });
  await insertAdapter({ ownerId, channel: 'telegram', status: 'failed' }); // lỗi: loại
  await insertAdapter({ ownerId, channel: 'whatsapp', isPreview: true }); // preview: loại
  // gửi nhanh Zalo
  await insertDirectSend({ ownerId, resourceType: 'zalo_direct_send', delta: 4, daysBack: 3 });
}

// ===========================================================================
// 1. Tin gửi: theo KỲ của gói, đúng số hàm cổng chặn đếm
// ===========================================================================
describe('GET /api/users/profile — tin gửi theo kỳ, bằng số cổng chặn', () => {
  it('email / nhắn tin / tổng kỳ / hôm nay = bảng chân lý cộng tay VÀ = hàm của cổng với cùng kỳ', async () => {
    const { user } = await customerOnPlan('sender', PLAN_CO_TRAN);
    const other = await createUser({ username: 'sender_other' });
    await seedSendHistory(user.id, other.id);

    const data = await getProfile(await loginAs(user));

    // (a) bảng chân lý cộng tay
    expect(data.emailSentCycle).toBe(EMAIL_KY);
    expect(data.messagingSentCycle).toBe(NHAN_TIN_KY);
    expect(data.combinedSentCycle).toBe(TONG_KY);
    expect(data.emailSentToday).toBe(EMAIL_HOM_NAY);
    expect(data.messagingSentToday).toBe(NHAN_TIN_HOM_NAY);

    // (b) chính hàm của cổng, cùng kỳ: kỳ trên hồ sơ = getBillingCycle của cổng
    const cycle = await getBillingCycle(user.id);
    expect(data.sendCycleStart).toBe(cycle.cycleStart.toISOString());
    expect(data.sendCycleEnd).toBe(cycle.cycleEnd.toISOString());
    // kỳ 30 ngày neo ngày kích hoạt (-45 ngày) → kỳ hiện tại kết thúc sau 15 ngày
    expect(new Date(data.sendCycleEnd).getTime() - Date.now()).toBeGreaterThan(14 * DAY);
    expect(new Date(data.sendCycleEnd).getTime() - Date.now()).toBeLessThan(16 * DAY);

    _clearQuotaCache();
    expect(data.emailSentCycle).toBe(await countEmailSentInCycle(user.id, cycle.cycleStart, cycle.cycleEnd));
    _clearQuotaCache();
    expect(data.messagingSentCycle).toBe(await countZaloSentInCycle(user.id, cycle.cycleStart, cycle.cycleEnd));
    _clearQuotaCache();
    expect(data.combinedSentCycle).toBe(await countCombinedSentInCycle(user.id, cycle.cycleStart, cycle.cycleEnd));
    _clearQuotaCache();
    expect(data.emailSentToday).toBe(await countEmailSentToday(user.id));
    _clearQuotaCache();
    expect(data.messagingSentToday).toBe(await countZaloSentToday(user.id));

    // trần trên hồ sơ lấy từ chính dòng gói mà cổng đọc
    expect(data).toMatchObject({
      monthlyEmailLimit: 10000,
      monthlyZaloLimit: 5000,
      dailyEmailLimit: 500,
      dailyZaloLimit: 200,
      messagesPerPeriod: 100,
    });
  });

  it('tên cũ (emailSentMonth, zaloSentMonth, zaloSentToday) vẫn có mặt và mang số MỚI theo kỳ, không phải số journey', async () => {
    const { user } = await customerOnPlan('legacy_alias', PLAN_CO_TRAN);
    const other = await createUser({ username: 'legacy_alias_other' });
    await seedSendHistory(user.id, other.id);

    const data = await getProfile(await loginAs(user));

    expect(data.emailSentMonth).toBe(EMAIL_KY);
    expect(data.zaloSentMonth).toBe(NHAN_TIN_KY);
    expect(data.zaloSentToday).toBe(NHAN_TIN_HOM_NAY);
    expect(data.emailSentToday).toBe(EMAIL_HOM_NAY);
  });

  it('gói dùng thử (chỉ trần TỔNG kỳ, trần theo kênh NULL): có số tổng kỳ, KHÔNG có số hôm nay', async () => {
    const { user } = await customerOnPlan('trial_like', { messagesPerPeriod: 100 });
    const other = await createUser({ username: 'trial_like_other' });
    await seedSendHistory(user.id, other.id);

    const data = await getProfile(await loginAs(user));

    expect(data.messagesPerPeriod).toBe(100);
    expect(data.combinedSentCycle).toBe(TONG_KY);
    // trần theo kênh không đặt → hồ sơ không có thanh tháng/ngày cho kênh, số hôm nay là null (không phải 0)
    expect(data.monthlyEmailLimit).toBeNull();
    expect(data.dailyEmailLimit).toBeNull();
    expect(data.emailSentToday).toBeNull();
    expect(data.messagingSentToday).toBeNull();
    // số theo kỳ của từng kênh vẫn có (FE hiện "đã dùng · Không giới hạn")
    expect(data.emailSentCycle).toBe(EMAIL_KY);
    expect(data.messagingSentCycle).toBe(NHAN_TIN_KY);
  });

  it('gói không đặt trần tổng kỳ → combinedSentCycle = null', async () => {
    const { user } = await customerOnPlan('no_combined', { monthlyEmailLimit: 1000 });
    const data = await getProfile(await loginAs(user));
    expect(data.messagesPerPeriod).toBeNull();
    expect(data.combinedSentCycle).toBeNull();
    expect(data.emailSentCycle).toBe(0); // chưa gửi gì trong kỳ: 0 thật (đếm được), khác null (không đọc được)
  });

  it('chưa có gói → không có kỳ, mọi số theo kỳ null', async () => {
    const user = await createUser({ username: 'no_plan_sender', withPlan: false });
    const data = await getProfile(await loginAs(user));
    expect(data.sendCycleStart).toBeNull();
    expect(data.sendCycleEnd).toBeNull();
    expect(data.emailSentCycle).toBeNull();
    expect(data.messagingSentCycle).toBeNull();
    expect(data.combinedSentCycle).toBeNull();
  });
});

// ===========================================================================
// 2. Tài nguyên: cùng hàm đếm & cùng trần với cổng tạo mới
// ===========================================================================
async function insertGrant({ userId, itemKey, qty, cycleEndDaysFromNow = 20 }) {
  const { rows } = await db.query(
    `INSERT INTO orders (user_id, order_code, status, amount) VALUES ($1, $2, 'success', 50000) RETURNING id`,
    [userId, Date.now() * 1000 + seq++]
  );
  await db.query(
    `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
     VALUES ($1, $2, $3, $4, NOW() + ($5::numeric * INTERVAL '1 day'))`,
    [userId, itemKey, qty, rows[0].id, cycleEndDaysFromNow]
  );
}

async function gate(userId, resourceKey) {
  return checkUserResourceLimit({ userId, roleCode: 'user', resourceKey });
}

describe('GET /api/users/profile — tài nguyên, bằng số cổng tạo mới', () => {
  it('landing page: đếm theo COALESCE(workspace_owner_id, id_user); trần = users.max_landing_pages + slot mua thêm CÒN HẠN', async () => {
    const { user } = await customerOnPlan('lp_owner', PLAN_CO_TRAN);
    const staff = await createUser({ username: 'lp_staff', withPlan: false });
    const stranger = await createUser({ username: 'lp_stranger' });
    await db.query('UPDATE users SET max_landing_pages = 5 WHERE id = $1', [user.id]);

    // 2 trang của chủ: một trang chủ tạo (workspace_owner_id NULL), một trang nhân viên tạo cho chủ; 1 trang người lạ.
    await db.query(`INSERT INTO landing_pages (id_user, workspace_owner_id, slug) VALUES ($1, NULL, $2)`, [user.id, uniq('lp')]);
    await db.query(`INSERT INTO landing_pages (id_user, workspace_owner_id, slug) VALUES ($1, $2, $3)`, [staff.id, user.id, uniq('lp')]);
    await db.query(`INSERT INTO landing_pages (id_user, workspace_owner_id, slug) VALUES ($1, NULL, $2)`, [stranger.id, uniq('lp')]);
    await insertGrant({ userId: user.id, itemKey: 'landing_pages', qty: 2 });
    await insertGrant({ userId: user.id, itemKey: 'landing_pages', qty: 10, cycleEndDaysFromNow: -1 }); // hết hạn: không cộng

    const data = await getProfile(await loginAs(user));

    expect(data.resourceUsage.landingPages).toEqual({ used: 2, limit: 7 });
    const check = await gate(user.id, 'landingPages');
    expect(check.limit).toBe(7);
    expect(check.currentCount).toBe(2);
  });

  it('chatbot: chỉ đếm chatbot is_active, trần = gói + slot mua thêm — đúng số cổng tạo chatbot trả ở 403', async () => {
    const { user } = await customerOnPlan('bot_owner', PLAN_CO_TRAN); // max_chatbots = 2
    const stranger = await createUser({ username: 'bot_stranger' });
    await insertGrant({ userId: user.id, itemKey: 'chatbots', qty: 1 }); // trần hiệu lực 3
    const addBot = (idUser, isActive) => db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key, is_active) VALUES ($1, 'Bot', $2, $3)`,
      [idUser, uniq('wk'), isActive]
    );
    await addBot(user.id, true);
    await addBot(user.id, true);
    await addBot(user.id, true);
    await addBot(user.id, false); // xoá mềm: cổng không đếm
    await addBot(stranger.id, true);

    const token = await loginAs(user);
    const data = await getProfile(token);
    expect(data.resourceUsage.chatbots).toEqual({ used: 3, limit: 3 });
    expect(data.maxChatbots).toBe(2); // trần gốc của gói (chưa gồm mua thêm) — trước đây luôn null

    // Cổng THẬT: tạo chatbot thứ 4 bị chặn, và thân 403 mang đúng cặp {used, limit} mà trang phải hiện.
    const blocked = await request(app)
      .post('/api/ai/chatbot/custom-chatbots')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bot thứ tư' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
    expect({ used: blocked.body.used, limit: blocked.body.limit }).toEqual(data.resourceUsage.chatbots);
  });

  it('chatbot: gói không giới hạn (max_chatbots NULL) → limit null; gói đặt 0 → limit 0', async () => {
    const unlimited = await customerOnPlan('bot_unlimited', {});
    const zero = await customerOnPlan('bot_zero', { maxChatbots: 0 });

    const unlimitedData = await getProfile(await loginAs(unlimited.user));
    const zeroData = await getProfile(await loginAs(zero.user));

    expect(unlimitedData.resourceUsage.chatbots).toEqual({ used: 0, limit: null });
    expect(zeroData.resourceUsage.chatbots).toEqual({ used: 0, limit: 0 });
  });

  it('nhân viên: chỉ đếm active và tài khoản chưa xoá; trần = gói + slot mua thêm — bằng meta trang Nhân viên', async () => {
    const { user } = await customerOnPlan('emp_owner', PLAN_CO_TRAN); // max_employees = 3
    await insertGrant({ userId: user.id, itemKey: 'employees', qty: 1 }); // trần hiệu lực 4
    const addMember = async (username, memberStatus, userStatus = 'active') => {
      const employee = await createUser({ username, withPlan: false });
      if (userStatus !== 'active') await db.query('UPDATE users SET status = $1 WHERE id = $2', [userStatus, employee.id]);
      await db.query(
        `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, '{}'::jsonb, $3)`,
        [user.id, employee.id, memberStatus]
      );
    };
    await addMember('emp_a', 'active');
    await addMember('emp_b', 'active');
    await addMember('emp_c', 'inactive'); // đã khoá: cổng không đếm
    await addMember('emp_d', 'active', 'deleted'); // tài khoản đã xoá: cổng không đếm

    const token = await loginAs(user);
    const data = await getProfile(token);
    expect(data.resourceUsage.employees).toEqual({ used: 2, limit: 4 });

    // Trang Nhân viên (getEmployeeLimitMeta) — cùng một câu hỏi, phải cùng một đáp án.
    const employeesPage = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);
    expect(employeesPage.status).toBe(200);
    expect({ used: employeesPage.body.meta.used, limit: employeesPage.body.meta.max })
      .toEqual(data.resourceUsage.employees);
  });

  it('tài khoản Zalo / Email / WhatsApp / Telegram: bằng checkUserResourceLimit (đếm + trần gồm mua thêm)', async () => {
    const { user } = await customerOnPlan('acct_owner', PLAN_CO_TRAN);
    const stranger = await createUser({ username: 'acct_stranger' });
    await db.query(
      `UPDATE users SET max_zalo_accounts = 3, max_email_accounts = NULL,
                        max_whatsapp_accounts = 2, max_telegram_accounts = 0 WHERE id = $1`,
      [user.id]
    );
    await insertGrant({ userId: user.id, itemKey: 'zalo_accounts', qty: 1 }); // 3 + 1 = 4
    // Zalo: 2 của chủ + 1 của người lạ
    await db.query(`INSERT INTO zalo_settings (id_user, display_name) VALUES ($1, 'Z1'), ($1, 'Z2'), ($2, 'Zx')`, [user.id, stranger.id]);
    // Email: 1 của chủ, trần NULL = không giới hạn
    await db.query(`INSERT INTO email_settings (id_user, name, email) VALUES ($1, 'M1', 'm1@x.test')`, [user.id]);
    // WhatsApp: đếm theo tiền tố session_key = "<userId>-…" (id 4 khác id 44)
    await db.query(
      `INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ($1, '{}'::jsonb), ($2, '{}'::jsonb)`,
      [`${user.id}-abc`, `${user.id}9-abc`]
    );
    // Telegram: 1 tài khoản nhưng gói đặt trần 0
    await db.query(`INSERT INTO telegram_accounts (id_user, telegram_user_id) VALUES ($1, $2)`, [user.id, 700000 + seq++]);

    const data = await getProfile(await loginAs(user));
    const usage = data.resourceUsage;

    expect(usage.zaloAccounts).toEqual({ used: 2, limit: 4 });
    expect(usage.emailAccounts).toEqual({ used: 1, limit: null });
    expect(usage.whatsappAccounts).toEqual({ used: 1, limit: 2 });
    expect(usage.telegramAccounts).toEqual({ used: 1, limit: 0 });

    // cùng hàm với cổng: giới hạn giống hệt; số đã dùng giống khi cổng có trần dương (cổng trả currentCount=0 khi
    // không giới hạn hoặc trần 0 nên chỉ so đếm ở các khoá có trần dương)
    for (const [dataKey, gateKey] of [
      ['zaloAccounts', 'zaloAccounts'],
      ['emailAccounts', 'emailAccounts'],
      ['whatsappAccounts', 'whatsappAccounts'],
      ['telegramAccounts', 'telegramAccounts'],
    ]) {
      const check = await gate(user.id, gateKey);
      expect(usage[dataKey].limit).toBe(check.limit);
      if (check.limit > 0) expect(usage[dataKey].used).toBe(check.currentCount);
    }
  });

  it('mọi khoá tài nguyên đều có mặt (không khoá nào bị bỏ sót)', async () => {
    const { user } = await customerOnPlan('all_keys', PLAN_CO_TRAN);
    const data = await getProfile(await loginAs(user));
    expect(Object.keys(data.resourceUsage).sort()).toEqual([
      'chatbots', 'emailAccounts', 'employees', 'landingPages', 'telegramAccounts', 'whatsappAccounts', 'zaloAccounts',
    ]);
    for (const value of Object.values(data.resourceUsage)) {
      expect(Number.isFinite(value.used)).toBe(true);
      expect(value.limit === null || Number.isFinite(value.limit)).toBe(true);
    }
  });
});

// ===========================================================================
// 3. PUT /users/profile không mang số "đã dùng"
// ===========================================================================
describe('PUT /api/users/profile — không kèm số đã dùng', () => {
  it('response chỉ có hồ sơ vừa lưu; không có trường đã dùng/kỳ để khỏi ghi đè số thật ở trang đang mở', async () => {
    const { user } = await customerOnPlan('put_profile', PLAN_CO_TRAN);
    const token = await loginAs(user);

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Tên Mới' });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Tên Mới');
    for (const key of [
      'resourceUsage', 'emailSentCycle', 'messagingSentCycle', 'combinedSentCycle', 'emailSentToday',
      'messagingSentToday', 'sendCycleStart', 'sendCycleEnd', 'aiCreditsUsed', 'aiCreditCycleEnd',
      'emailSentMonth', 'chatbotsUsed', 'employeesUsed',
    ]) {
      expect(res.body.data).not.toHaveProperty(key);
    }
  });
});
