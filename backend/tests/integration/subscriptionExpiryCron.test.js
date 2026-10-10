/**
 * Integration tests cho logic cron xử lý hết hạn gói (PR-2a, Ca 12 & 13 mục 5).
 * Chạy trên PostgreSQL thật (cổng 5433).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test-msg-id>' });
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const db = (await import('../../src/config/database.js')).default;
const {
  findExpiredUsers,
} = await import('../../src/repositories/subscription/subscription.repository.js');
const { recordRun } = await import('../../src/repositories/admin/cronJobRun.repository.js');
const {
  processExpiredSubscriptions,
  sendExpiringReminders,
} = await import('../../src/services/payment/subscriptionExpiry.service.js');
const {
  truncateAll,
  createUser,
  createPlan,
} = await import('./helpers/db.js');
const { saveSettings } = await import('../../src/repositories/admin/subscriptionReminderSettings.repository.js');
const { clearEventSettingsCache } = await import('../../src/services/notification/notificationDispatch.service.js');

async function setSentRecord(userId, sentRecord) {
  await db.query('UPDATE users SET subscription_reminders_sent = $2::jsonb WHERE id = $1', [
    userId,
    JSON.stringify(sentRecord),
  ]);
}

let origTestSendEmail;

beforeAll(() => {
  origTestSendEmail = process.env.TEST_SEND_EMAIL;
  process.env.TEST_SEND_EMAIL = '1';
});

afterAll(() => {
  if (origTestSendEmail !== undefined) {
    process.env.TEST_SEND_EMAIL = origTestSendEmail;
  } else {
    delete process.env.TEST_SEND_EMAIL;
  }
});

beforeEach(async () => {
  await truncateAll();
  mockSendMail.mockClear();
  // PR-6: thư hết hạn / nhắc hạn đi qua dispatcher. truncateAll xoá notification_event_settings → dùng MẶC ĐỊNH catalog, trong đó
  // plan_expired / plan_expiring bật email (ngoại lệ "chỉ chuông", quyết định 10/10) — nên các ca dưới đo đúng đường email mặc định.
  clearEventSettingsCache();
});

async function setSubscription(userId, planId, expiresAt, reminderCount = 0) {
  await db.query(
    `UPDATE users
     SET active_plan_id = $1,
         subscription_expires_at = $2,
         subscription_reminder_count = $3
     WHERE id = $4`,
    [planId, expiresAt, reminderCount, userId]
  );
}

describe('Subscription Expiry Cron Integration (PR-2a — Ca 12 & 13 mục 5)', () => {
  it('findExpiredUsers trả về đúng subscription_expires_at và subscription_reminder_count', async () => {
    const plan = await createPlan({ code: 'test-pro', name: 'Gói Thử Nghiệm' });
    const user = await createUser({ username: 'expired-fields-check', email: 'check@example.com' });
    const pastDate = new Date(Date.now() - 2 * 86400000);

    await setSubscription(user.id, plan.id, pastDate, 2);

    const expiredList = await findExpiredUsers();
    expect(expiredList.length).toBe(1);
    const target = expiredList.find((u) => Number(u.id) === Number(user.id));
    expect(target).toBeDefined();
    expect(target.email).toBe('check@example.com');
    expect(target.plan_name).toBe('Gói Thử Nghiệm');
    expect(target.subscription_expires_at).toBeDefined();
    expect(new Date(target.subscription_expires_at).getTime()).toBe(pastDate.getTime());
    expect(Number(target.subscription_reminder_count)).toBe(2);
  });

  it('Ca 12: Cron chạy ngày T-0 → gửi đúng 1 thư, thu hồi gói, và ghi nhận 1 dòng cron_job_runs job_code = "subscription_reminder"', async () => {
    const plan = await createPlan({ code: 'p-t0', name: 'Gói Pro T-0' });
    const user = await createUser({
      username: 'user-t0',
      email: 'user-t0@example.com',
      full_name: 'Khách Hàng T-0',
    });
    const pastDate = new Date(Date.now() - 86400000); // Đã hết hạn 1 ngày
    await setSubscription(user.id, plan.id, pastDate, 2); // Đã có reminder_count = 2 (nhắc 7 ngày & 3 ngày)

    // Giả lập bước chạy trong cron subscription của scheduler.js
    const cronResult = await recordRun('subscription_reminder', async () => {
      const expiryResult = await processExpiredSubscriptions({
        renewalUrl: 'https://app.uknow.vn/app/billing',
      });
      return {
        expired: expiryResult.expiredCount,
        emailsSent: expiryResult.emailsSent,
        synced: expiryResult.expiredCount,
      };
    });

    // 1. Kiểm tra email đã được gửi qua nodemailer đúng 1 lần với nội dung phù hợp
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockSendMail.mock.calls[0][0];
    expect(mailArgs.to).toBe('user-t0@example.com');
    expect(mailArgs.subject).toContain('Gói Pro T-0 của bạn đã hết hạn');
    expect(mailArgs.html).toContain('Gói <strong>Gói Pro T-0</strong> của bạn đã hết hạn');
    expect(mailArgs.html).toContain('Các chiến dịch marketing đang chạy đã dừng');

    // 1b. PR-6: chuông plan_expired nằm trong DB thật, khoá theo chu kỳ (ngày hết hạn)
    const bell = await db.query('SELECT event_type, link, severity FROM user_notifications WHERE user_id = $1', [user.id]);
    expect(bell.rows).toEqual([{ event_type: 'plan_expired', link: '/app/billing', severity: 'error' }]);

    // 2. Kiểm tra trạng thái DB của user sau khi thu hồi
    const userRes = await db.query(
      `SELECT active_plan_id, subscription_expires_at, subscription_reminder_count
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(userRes.rows[0].active_plan_id).toBeNull(); // Đã bị thu hồi gói
    expect(userRes.rows[0].subscription_expires_at).not.toBeNull(); // Vẫn giữ ngày hết hạn để làm mốc

    // 3. Kiểm tra bản ghi trong bảng cron_job_runs (Yêu cầu ca 12)
    const runRes = await db.query(
      `SELECT job_code, status, result
       FROM cron_job_runs
       WHERE job_code = 'subscription_reminder'
       ORDER BY started_at DESC
       LIMIT 1`
    );
    expect(runRes.rows.length).toBe(1);
    expect(runRes.rows[0].job_code).toBe('subscription_reminder');
    expect(runRes.rows[0].status).toBe('success');
    expect(runRes.rows[0].result).toMatchObject({
      expired: 1,
      emailsSent: 1,
      synced: 1,
    });
  });

  it('Ca 13: Cron chạy lại hôm sau (T+1) → 0 thư gửi thêm cho cùng người đó', async () => {
    const plan = await createPlan({ code: 'p-t1', name: 'Gói Pro T+1' });
    const user = await createUser({
      username: 'user-t1',
      email: 'user-t1@example.com',
      full_name: 'Khách Hàng T+1',
    });
    const pastDate = new Date(Date.now() - 2 * 86400000);
    await setSubscription(user.id, plan.id, pastDate, 2);

    // Lần chạy 1 (T-0)
    const run1 = await processExpiredSubscriptions();
    expect(run1.expiredCount).toBe(1);
    expect(run1.emailsSent).toBe(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Lần chạy 2 (T+1 - ngày hôm sau cron chạy lại)
    const run2 = await processExpiredSubscriptions();
    expect(run2.expiredCount).toBe(0);
    expect(run2.emailsSent).toBe(0);
    expect(mockSendMail).toHaveBeenCalledTimes(1); // Không gửi thêm thư nào (vẫn chỉ 1 thư cũ)
  });
});

/**
 * Ghim SỰ THẬT của nhánh gửi thư thất bại.
 *
 * subscriptionExpiry.service.js:44-45 ghi: "KHÔNG incrementReminderCount để tránh mất thư vĩnh
 * viễn". Câu đó không đúng, và đây là phép thử chứng minh: gói vẫn bị thu hồi ngay ở lượt đó
 * (service:55), mà findExpiredUsers thì JOIN plans ON u.active_plan_id = p.id
 * (subscription.repository.js:37) — nên người vừa hỏng thư KHÔNG BAO GIỜ quay lại danh sách.
 * Thư mất thật, bất kể reminder_count.
 *
 * Ca này KHÔNG đòi đổi hành vi. Thu hồi vô điều kiện là lựa chọn an toàn về tiền: nếu bỏ qua
 * thu hồi khi thư hỏng thì một địa chỉ email hỏng vĩnh viễn = dùng dịch vụ miễn phí vĩnh viễn.
 * Nó tồn tại để ai định "sửa" theo hướng đó sẽ thấy ngay cái giá.
 */
describe('Thư T-0 hỏng — ghim hệ quả thật, không phải lời hứa trong bình luận', () => {
  it('gửi thư lỗi → gói VẪN bị thu hồi, và lượt sau không còn ai để gửi lại', async () => {
    const plan = await createPlan({ code: 'p-fail', name: 'Gói Hỏng Thư' });
    const user = await createUser({
      username: 'user-mail-fail',
      email: 'mail-fail@example.com',
      full_name: 'Khách Hỏng Thư',
    });
    await setSubscription(user.id, plan.id, new Date(Date.now() - 2 * 86400000), 2);

    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection timeout'));

    const run1 = await processExpiredSubscriptions();
    expect(run1.emailsSent).toBe(0);      // thư hỏng
    expect(run1.expiredCount).toBe(1);    // nhưng gói vẫn bị thu hồi

    const sau = await db.query('SELECT active_plan_id FROM users WHERE id = $1', [user.id]);
    expect(sau.rows[0].active_plan_id).toBeNull();

    // Lượt sau: không còn trong danh sách → không có cơ hội gửi lại. Thư mất vĩnh viễn.
    mockSendMail.mockClear();
    const run2 = await processExpiredSubscriptions();
    expect(run2.totalFound).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('sendExpiringReminders — Nhắc hạn còn 7 ngày & 3 ngày (PR tách vòng lặp)', () => {
  // PR-6 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO) ĐỔI NGỮ NGHĨA của "Bẫy 2": nhắc hạn đi qua dispatcher (chuông + email). Dispatcher chỉ
  // gửi email cho người MỚI được chèn dòng chuông, nên khi email lỗi mà chuông đã ghi được thì lượt sau KHÔNG còn đường gửi lại email
  // (dedupe chặn) — đóng mốc ngay để cron không quét lại. Mốc chỉ KHÔNG đóng khi cả hai kênh hỏng (unit: subscriptionExpiry.service.spec).
  it('Bẫy 2 (PR-6) — email nhắc hạn lỗi nhưng chuông đã ghi được: mốc được đóng, gói KHÔNG bị thu hồi, lượt sau không quét lại; chuông plan_expiring nằm trong DB', async () => {
    const plan = await createPlan({ code: 'p-remind-retry', name: 'Gói Nhắc Retry' });
    const user = await createUser({
      username: 'user-remind-retry',
      email: 'remind-retry@example.com',
      full_name: 'Khách Nhắc Retry',
    });
    // Còn 6.8 ngày (nằm trong khoảng 6 đến 7 ngày)
    const expiresAt = new Date(Date.now() + 6.8 * 86400000);
    await setSubscription(user.id, plan.id, expiresAt, 0);

    // Lượt 1: Giả lập SMTP lỗi
    mockSendMail.mockRejectedValueOnce(new Error('SMTP temporary error'));

    const res1 = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/billing' });
    expect(res1.remindedWeek).toBe(1);
    expect(res1.failed).toBe(0);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Gói VẪN CÒN; mốc 7 đã được ghi nhớ cho đúng chu kỳ hiện tại (PLAN_CAU_HINH_LICH_NHAC_HAN: cột JSONB subscription_reminders_sent).
    const userDb1 = await db.query('SELECT active_plan_id, subscription_reminders_sent FROM users WHERE id = $1', [user.id]);
    expect(userDb1.rows[0].active_plan_id).toBe(plan.id);
    expect(userDb1.rows[0].subscription_reminders_sent.days).toEqual([7]);

    // Chuông thật trong DB: đúng sự kiện, link billing, khoá theo mốc ngày.
    const bell = await db.query('SELECT event_type, link, dedupe_key FROM user_notifications WHERE user_id = $1', [user.id]);
    expect(bell.rows).toHaveLength(1);
    expect(bell.rows[0]).toMatchObject({ event_type: 'plan_expiring', link: '/app/billing' });
    expect(bell.rows[0].dedupe_key).toMatch(/^plan_expiring:\d+:\d{8}:d7$/);

    // Lượt 2 cùng ngày: mốc 7 đã đóng → không quét lại, không gửi thêm gì.
    mockSendMail.mockClear();
    const res2 = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/billing' });
    expect(res2.remindedWeek).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect((await db.query('SELECT 1 FROM user_notifications WHERE user_id = $1', [user.id])).rows).toHaveLength(1);
  });

  it('PR-6 — admin TẮT email của plan_expiring: nhắc hạn chỉ ghi chuông, vẫn đóng mốc, không gửi thư', async () => {
    await db.query(
      `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
       VALUES ('plan_expiring', true, false, false)
       ON CONFLICT (event_type) DO UPDATE SET email_enabled = false`
    );
    clearEventSettingsCache();
    const plan = await createPlan({ code: 'p-remind-bell', name: 'Gói Chỉ Chuông' });
    const user = await createUser({ username: 'user-remind-bell', email: 'remind-bell@example.com', full_name: 'Khách Chuông' });
    await setSubscription(user.id, plan.id, new Date(Date.now() + 6.8 * 86400000), 0);

    const res = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/billing' });

    expect(res.remindedWeek).toBe(1);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect((await db.query('SELECT 1 FROM user_notifications WHERE user_id = $1', [user.id])).rows).toHaveLength(1);
    const userDb = await db.query('SELECT subscription_reminders_sent FROM users WHERE id = $1', [user.id]);
    expect(userDb.rows[0].subscription_reminders_sent.days).toEqual([7]);
  });

  it('Ca 8: Cron chạy đầy đủ ghi vào cron_job_runs với cấu trúc đủ 5 khoá giám sát trên DB thật', async () => {
    const plan = await createPlan({ code: 'p-cron-shape', name: 'Gói Cron Shape' });
    const user = await createUser({
      username: 'user-cron-shape',
      email: 'cron-shape@example.com',
      full_name: 'Khách Cron Shape',
    });
    // Còn 2.5 ngày (nằm trong khoảng 2 đến 3 ngày), reminder_count = 1
    const expiresAt = new Date(Date.now() + 2.5 * 86400000);
    await setSubscription(user.id, plan.id, expiresAt, 1);

    await recordRun('subscription_reminder', async () => {
      const expiryResult = await processExpiredSubscriptions({ renewalUrl: 'https://app.uknow.vn/billing' });
      const reminderResult = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/billing' });
      const lockedUsers = 0;
      const reminderWeek = 0;
      const reminderThree = 0;
      const processed = expiryResult.expiredCount + reminderResult.remindedWeek + reminderResult.remindedThreeDay
        + lockedUsers + reminderWeek + reminderThree;
      return {
        expired: expiryResult.expiredCount,
        remindedWeek: reminderResult.remindedWeek,
        remindedThreeDay: reminderResult.remindedThreeDay,
        lockedUsers,
        reminderWeek,
        reminderThree,
        synced: processed,
      };
    });

    const runRes = await db.query(
      `SELECT job_code, status, result
       FROM cron_job_runs
       WHERE job_code = 'subscription_reminder'
       ORDER BY started_at DESC
       LIMIT 1`
    );
    expect(runRes.rows.length).toBe(1);
    expect(runRes.rows[0].status).toBe('success');
    expect(runRes.rows[0].result).toEqual({
      expired: 0,
      remindedWeek: 0,
      remindedThreeDay: 1,
      lockedUsers: 0,
      reminderWeek: 0,
      reminderThree: 0,
      synced: 1,
    });
  });

  // Ca 4 của PLAN_CAU_HINH_LICH_NHAC_HAN mục 4 — QUAN TRỌNG NHẤT: đây đúng là ca mà cơ chế đếm số
  // lần (subscription_reminder_count) cũ sẽ hỏng (mục 1.3 của plan). Chốt trên Postgres thật.
  it('Ca 4 — khách đã nhận mốc 7, sếp đổi cấu hình thành [3] → khách VẪN nhận thư 3 ngày', async () => {
    const plan = await createPlan({ code: 'p-cfg-4', name: 'Gói Đổi Cấu Hình' });
    const user = await createUser({
      username: 'user-cfg-4',
      email: 'cfg4@example.com',
      full_name: 'Khách Đổi Cấu Hình',
    });
    // Còn 2.5 ngày (nằm trong khoảng 2-3), ĐÃ nhận mốc 7 trong CÙNG chu kỳ này.
    const expiresAt = new Date(Date.now() + 2.5 * 86400000);
    await setSubscription(user.id, plan.id, expiresAt, 0);
    const userRow = await db.query('SELECT subscription_expires_at FROM users WHERE id = $1', [user.id]);
    const cycleIso = new Date(userRow.rows[0].subscription_expires_at).toISOString();
    await setSentRecord(user.id, { cycle: cycleIso, days: [7] });

    await saveSettings({ daysBefore: [3], updatedBy: null });

    const result = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/billing' });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(result.remindedWeek + result.remindedThreeDay).toBe(1);
    const after = await db.query('SELECT subscription_reminders_sent FROM users WHERE id = $1', [user.id]);
    expect(after.rows[0].subscription_reminders_sent.days.sort()).toEqual([3, 7]);
  });

  // Ca 6 của PLAN_CAU_HINH_LICH_NHAC_HAN mục 4 — khách gia hạn thì cột ghi nhớ tự dọn (cycle không
  // khớp expires_at mới), không cần cron dọn dẹp riêng.
  it('Ca 6 — khách gia hạn rồi lại sắp hết hạn → nhận lại đủ mốc của chu kỳ mới', async () => {
    const plan = await createPlan({ code: 'p-cfg-6', name: 'Gói Gia Hạn Lại' });
    const user = await createUser({
      username: 'user-cfg-6',
      email: 'cfg6@example.com',
      full_name: 'Khách Gia Hạn Lại',
    });
    const oldCycle = new Date(Date.now() - 40 * 86400000).toISOString();
    await setSentRecord(user.id, { cycle: oldCycle, days: [7, 3] });

    // Gia hạn: subscription_expires_at nhảy sang một mốc MỚI, còn 6.9 ngày (nằm trong 6-7).
    const newExpiresAt = new Date(Date.now() + 6.9 * 86400000);
    await setSubscription(user.id, plan.id, newExpiresAt, 0);

    const result = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/billing' });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(result.remindedWeek).toBe(1);
    const after = await db.query('SELECT subscription_reminders_sent FROM users WHERE id = $1', [user.id]);
    // Chu kỳ mới, KHÔNG cộng dồn [7,3] cũ của chu kỳ trước.
    expect(after.rows[0].subscription_reminders_sent.days).toEqual([7]);
  });
});

