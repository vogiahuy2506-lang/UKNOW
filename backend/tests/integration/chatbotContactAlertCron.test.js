/**
 * Integration tests cho cron thông báo liên hệ khách để lại trong hội thoại chatbot (PR-1, Việc 6).
 * Chạy trên PostgreSQL thật (cổng 5433).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test-alert-msg-id>' });
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
  scanAndNotify,
} = await import('../../src/services/chatbot/chatbotContactAlert.service.js');
const {
  getCursor,
} = await import('../../src/repositories/chatbot/chatbotContactAlert.repository.js');
const {
  truncateAll,
  createUser,
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
  await db.query('TRUNCATE TABLE chatbot_contact_alerts, chatbot_contact_scan_cursors CASCADE');
  mockSendMail.mockClear();
});

describe('Chatbot Contact Alert Cron Integration (PR-1, Việc 6)', () => {
  it('quét tin visitor có số điện thoại, ghi nhận vào sổ, cập nhật cursor và gửi email thông báo', async () => {
    const user = await createUser({
      username: 'shop-owner-1',
      email: 'owner1@example.com',
      phone: '0901234567',
    });

    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_1`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.id, widgetId, 'sess_1', 'Khách Hoàng']
    );
    const convId = convRows[0].id;

    const { rows: msgRows } = await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', 'Tư vấn cho mình qua SĐT 0912345678 nhé shop', NOW())
       RETURNING id`,
      [convId, user.id]
    );
    const firstMsgId = Number(msgRows[0].id);

    // Lần 1: Chạy scanAndNotify
    const result1 = await scanAndNotify();
    expect(result1.scannedCount).toBe(1);
    expect(result1.alertsCreatedOrUpdated).toBe(1);
    expect(result1.emailsSent).toBe(1);

    // Kiểm tra sổ chatbot_contact_alerts
    const { rows: alertRows } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(alertRows.length).toBe(1);
    expect(alertRows[0].contact_type).toBe('phone');
    expect(alertRows[0].contact_value).toBe('0912345678');
    expect(alertRows[0].pending_notify).toBe(false);
    expect(alertRows[0].last_notified_at).not.toBeNull();
    expect(Number(alertRows[0].seen_count)).toBe(1);
    expect(alertRows[0].suppressed_reason).toBeNull();

    // Kiểm tra email được gửi
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe('owner1@example.com');
    expect(mailOptions.subject).toContain('khách để lại liên hệ trong chatbot');
    expect(mailOptions.html).toContain('0912345678');
    expect(mailOptions.html).toContain('Khách Hoàng');
    expect(mailOptions.html).toContain('/app/settings/inbox');

    // Kiểm tra cursor đã lưu id tin nhắn
    const cursor = await getCursor('web');
    expect(cursor).toBe(firstMsgId);

    // Lần 2: Chạy lại scanAndNotify -> không quét tin cũ, không gửi thêm mail
    const result2 = await scanAndNotify();
    expect(result2.scannedCount).toBe(0);
    expect(result2.emailsSent).toBe(0);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Thêm tin agent trong vòng 120 phút (human active)
    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'agent', 'Shop đã nhận được số của bạn nhé', NOW())`,
      [convId, user.id]
    );

    // Thêm tin visitor mới có email
    const { rows: newMsgRows } = await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', 'Gửi thêm vào mail khach@gmail.com', NOW())
       RETURNING id`,
      [convId, user.id]
    );
    const secondMsgId = Number(newMsgRows[0].id);

    // Lần 3: Chạy scanAndNotify
    const result3 = await scanAndNotify();
    expect(result3.scannedCount).toBe(1);
    expect(result3.alertsCreatedOrUpdated).toBe(1);
    // Không gửi email vì human_active
    expect(result3.emailsSent).toBe(0);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Kiểm tra dòng email trong chatbot_contact_alerts
    const { rows: emailAlertRows } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1 AND contact_type = 'email'`,
      [user.id]
    );
    expect(emailAlertRows.length).toBe(1);
    expect(emailAlertRows[0].contact_value).toBe('khach@gmail.com');
    expect(emailAlertRows[0].suppressed_reason).toBe('human_active');
    expect(emailAlertRows[0].pending_notify).toBe(false);
    expect(emailAlertRows[0].last_notified_at).toBeNull();

    // Cursor đã cập nhật đến tin mới nhất
    const updatedCursor = await getCursor('web');
    expect(updatedCursor).toBe(secondMsgId);
  });

  it('bỏ qua nếu khách nhắn số điện thoại trùng số của chủ shop (owner_own_contact)', async () => {
    const user = await createUser({
      username: 'shop-owner-2',
      email: 'owner2@example.com',
      phone: '0988776655',
    });

    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_2`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [user.id, widgetId, 'sess_2']
    );
    const convId = convRows[0].id;

    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', 'Hotline của bạn là 0988776655 đúng không?', NOW())`,
      [convId, user.id]
    );

    const result = await scanAndNotify();
    expect(result.scannedCount).toBe(1);
    expect(result.alertsCreatedOrUpdated).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();

    const { rows } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].suppressed_reason).toBe('owner_own_contact');
    expect(rows[0].pending_notify).toBe(false);
  });
});
