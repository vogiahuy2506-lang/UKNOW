/**
 * Integration tests cho PR-2:
 * Sổ "Liên hệ khách để lại" trong hộp thư, công tắc thư, bảo mật multi-tenant, và dọn theo hạn 24 tháng.
 * Chạy trên PostgreSQL thật (DB test cổng 5433).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test-pr2-msg-id>' });
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const {
  scanAndNotify,
} = await import('../../src/services/chatbot/chatbotContactAlert.service.js');
const {
  setCursor,
} = await import('../../src/repositories/chatbot/chatbotContactAlert.repository.js');
const {
  runDataRetentionCleanup,
} = await import('../../src/services/admin/dataRetentionCleanup.service.js');
const {
  truncateAll,
  createUser,
} = await import('./helpers/db.js');

let app;
let origTestSendEmail;

beforeAll(() => {
  app = createApp();
  origTestSendEmail = process.env.TEST_SEND_EMAIL;
  process.env.TEST_SEND_EMAIL = '1';
});

afterAll(async () => {
  if (origTestSendEmail !== undefined) {
    process.env.TEST_SEND_EMAIL = origTestSendEmail;
  } else {
    delete process.env.TEST_SEND_EMAIL;
  }
  await db.pool.end();
});

beforeEach(async () => {
  await truncateAll();
  await db.query('TRUNCATE TABLE chatbot_contact_alerts, chatbot_contact_scan_cursors CASCADE');
  mockSendMail.mockClear();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

describe('Chatbot Contact Alert Inbox & Settings Integration (PR-2)', () => {
  it('quản lý danh sách liên hệ: lọc open, handled, all và đếm openCount', async () => {
    const owner = await createUser({ username: 'owner_list_test', email: 'owner_list@example.com' });
    const token = await loginAs(owner);

    // Tạo 2 widget & hội thoại
    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [owner.id, `key_${Date.now()}_list`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, 'sess_1', 'Khách A'), ($1, $2, 'sess_2', 'Khách B')
       RETURNING id, visitor_name`,
      [owner.id, widgetId]
    );

    // Chèn 2 alert: 1 chưa xử lý (open), 1 đã xử lý (handled)
    await db.query(
      `INSERT INTO chatbot_contact_alerts
         (id_user, contact_type, contact_value, first_seen_at, last_seen_at, seen_count,
          last_source, last_conversation_id, last_message_id, last_excerpt, handled_at, handled_by)
       VALUES
         ($1, 'phone', '0911111111', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 1,
          'web', $2, 101, '0911111111', NULL, NULL),
         ($1, 'email', 'khachb@example.com', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 1,
          'web', $3, 102, 'khachb@example.com', NOW() - INTERVAL '30 minutes', $1)`,
      [owner.id, convRows[0].id, convRows[1].id]
    );

    // 1. GET status=open (mặc định)
    const resOpen = await request(app)
      .get('/api/ai/chatbot/inbox/contact-alerts?status=open')
      .set('Authorization', `Bearer ${token}`);

    expect(resOpen.status).toBe(200);
    expect(resOpen.body.success).toBe(true);
    expect(resOpen.body.data.items.length).toBe(1);
    expect(resOpen.body.data.items[0].contact_value).toBe('0911111111');
    expect(resOpen.body.data.items[0].visitor_name).toBe('Khách A');
    expect(resOpen.body.data.total).toBe(1);
    expect(resOpen.body.data.openCount).toBe(1);

    // 2. GET status=handled
    const resHandled = await request(app)
      .get('/api/ai/chatbot/inbox/contact-alerts?status=handled')
      .set('Authorization', `Bearer ${token}`);

    expect(resHandled.status).toBe(200);
    expect(resHandled.body.data.items.length).toBe(1);
    expect(resHandled.body.data.items[0].contact_value).toBe('khachb@example.com');
    expect(resHandled.body.data.items[0].handled_at).not.toBeNull();
    expect(resHandled.body.data.openCount).toBe(1);

    // 3. GET status=all
    const resAll = await request(app)
      .get('/api/ai/chatbot/inbox/contact-alerts?status=all')
      .set('Authorization', `Bearer ${token}`);

    expect(resAll.status).toBe(200);
    expect(resAll.body.data.items.length).toBe(2);
    expect(resAll.body.data.total).toBe(2);
    expect(resAll.body.data.openCount).toBe(1);
  });

  it('bảo mật multi-tenant: user khác không thể markHandled hoặc unmarkHandled alert của chủ shop', async () => {
    const ownerA = await createUser({ username: 'owner_a', email: 'owner_a@example.com' });
    const ownerB = await createUser({ username: 'owner_b', email: 'owner_b@example.com' });
    const tokenA = await loginAs(ownerA);
    const tokenB = await loginAs(ownerB);

    const { rows } = await db.query(
      `INSERT INTO chatbot_contact_alerts
         (id_user, contact_type, contact_value, first_seen_at, last_seen_at, seen_count,
          last_source, last_conversation_id, last_message_id, last_excerpt)
       VALUES
         ($1, 'phone', '0988776655', NOW(), NOW(), 1, 'web', 1, 10, 'SĐT 0988776655')
       RETURNING id`,
      [ownerA.id]
    );
    const alertId = rows[0].id;

    // Owner B cố gắng markHandled alert của Owner A -> 404
    const resForbiddenMark = await request(app)
      .post(`/api/ai/chatbot/inbox/contact-alerts/${alertId}/handled`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resForbiddenMark.status).toBe(404);

    // Owner A markHandled thành công -> 200
    const resOwnerMark = await request(app)
      .post(`/api/ai/chatbot/inbox/contact-alerts/${alertId}/handled`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resOwnerMark.status).toBe(200);
    expect(resOwnerMark.body.data.handled_at).not.toBeNull();
    expect(String(resOwnerMark.body.data.handled_by)).toBe(String(ownerA.id));

    // Owner B cố gắng unmarkHandled alert của Owner A -> 404
    const resForbiddenUnmark = await request(app)
      .delete(`/api/ai/chatbot/inbox/contact-alerts/${alertId}/handled`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resForbiddenUnmark.status).toBe(404);

    // Owner A unmarkHandled thành công -> 200
    const resOwnerUnmark = await request(app)
      .delete(`/api/ai/chatbot/inbox/contact-alerts/${alertId}/handled`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resOwnerUnmark.status).toBe(200);
    expect(resOwnerUnmark.body.data.handled_at).toBeNull();
  });

  it('cài đặt thông báo email: chủ đổi được, nhân viên (employee context) bị 403', async () => {
    const owner = await createUser({ username: 'owner_settings_test', email: 'owner_set@example.com' });
    const employee = await createUser({ username: 'emp_settings_test', email: 'emp_set@example.com' });

    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
      [owner.id, employee.id, JSON.stringify({ inbox_manage: true, inbox_view: true, inbox_reply: true })]
    );

    const ownerToken = await loginAs(owner);
    const empToken = await loginAs(employee);

    // 1. Owner GET settings -> emailEnabled = true mặc định
    const getRes = await request(app)
      .get('/api/ai/chatbot/inbox/contact-alerts/settings')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.emailEnabled).toBe(true);

    // 2. Nhân viên gọi PUT đổi settings -> bị 403 Forbidden
    const empPutRes = await request(app)
      .put('/api/ai/chatbot/inbox/contact-alerts/settings')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id))
      .send({ emailEnabled: false });
    expect(empPutRes.status).toBe(403);

    // 3. Chủ gọi PUT đổi settings -> 200 thành công
    const ownerPutRes = await request(app)
      .put('/api/ai/chatbot/inbox/contact-alerts/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ emailEnabled: false });
    expect(ownerPutRes.status).toBe(200);
    expect(ownerPutRes.body.data.emailEnabled).toBe(false);

    // Kiểm tra DB users.chatbot_contact_alert_email = false
    const { rows } = await db.query(
      `SELECT chatbot_contact_alert_email FROM users WHERE id = $1`,
      [owner.id]
    );
    expect(rows[0].chatbot_contact_alert_email).toBe(false);
  });

  it('khi chủ tắt nhận thư: scan vẫn lưu vào sổ với suppressed_reason = owner_opted_out và KHÔNG gửi email', async () => {
    await setCursor('web', 0);

    const owner = await createUser({
      username: 'optout_owner',
      email: 'optout@example.com',
      phone: '0901234567',
    });

    // Tắt thông báo email
    await db.query(
      `UPDATE users SET chatbot_contact_alert_email = false WHERE id = $1`,
      [owner.id]
    );

    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [owner.id, `key_${Date.now()}_optout`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, 'sess_opt', 'Khách Tắt Thư') RETURNING id`,
      [owner.id, widgetId]
    );
    const convId = convRows[0].id;

    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', 'Số mình là 0933445566 nhé shop', NOW())`,
      [convId, owner.id]
    );

    const result = await scanAndNotify();
    expect(result.scannedCount).toBe(1);
    expect(result.alertsCreatedOrUpdated).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();

    // Kiểm tra dòng trong chatbot_contact_alerts
    const { rows: alertRows } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [owner.id]
    );
    expect(alertRows.length).toBe(1);
    expect(alertRows[0].contact_value).toBe('0933445566');
    expect(alertRows[0].suppressed_reason).toBe('owner_opted_out');
    expect(alertRows[0].pending_notify).toBe(false);
    expect(alertRows[0].last_notified_at).toBeNull();
  });

  it('data retention cleanup: dọn bản ghi quá 24 tháng theo last_seen_at', async () => {
    const owner = await createUser({ username: 'retention_user' });

    // Dòng 1: 25 tháng trước (hết hạn)
    const { rows: r1 } = await db.query(
      `INSERT INTO chatbot_contact_alerts
         (id_user, contact_type, contact_value, first_seen_at, last_seen_at, seen_count,
          last_source, last_conversation_id, last_message_id, last_excerpt)
       VALUES
         ($1, 'phone', '0911111111', NOW() - INTERVAL '26 months', NOW() - INTERVAL '25 months', 1,
          'web', 1, 1, 'quá hạn')
       RETURNING id`,
      [owner.id]
    );
    const oldId = r1[0].id;

    // Dòng 2: 23 tháng trước (còn hạn)
    const { rows: r2 } = await db.query(
      `INSERT INTO chatbot_contact_alerts
         (id_user, contact_type, contact_value, first_seen_at, last_seen_at, seen_count,
          last_source, last_conversation_id, last_message_id, last_excerpt)
       VALUES
         ($1, 'phone', '0922222222', NOW() - INTERVAL '24 months', NOW() - INTERVAL '23 months', 1,
          'web', 2, 2, 'còn hạn')
       RETURNING id`,
      [owner.id]
    );
    const freshId = r2[0].id;

    const cleanupResult = await runDataRetentionCleanup({ force: true });
    expect(cleanupResult.chatbotContactAlertsDeleted).toBe(1);

    // Kiểm tra DB
    const { rows: remainingRows } = await db.query(
      `SELECT id FROM chatbot_contact_alerts WHERE id_user = $1`,
      [owner.id]
    );
    expect(remainingRows.length).toBe(1);
    expect(Number(remainingRows[0].id)).toBe(Number(freshId));
    expect(remainingRows.map((r) => Number(r.id))).not.toContain(Number(oldId));
  });
});
