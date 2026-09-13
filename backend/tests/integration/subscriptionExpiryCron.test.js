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
const { processExpiredSubscriptions } = await import('../../src/services/payment/subscriptionExpiry.service.js');
const {
  truncateAll,
  createUser,
  createPlan,
} = await import('./helpers/db.js');

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
