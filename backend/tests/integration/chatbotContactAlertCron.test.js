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
  setCursor,
} = await import('../../src/repositories/chatbot/chatbotContactAlert.repository.js');
const chatbotContactAlertRepo = (await import('../../src/repositories/chatbot/chatbotContactAlert.repository.js')).default;
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

describe('Chatbot Contact Alert Cron Integration (PR-1, Việc 6 & Review)', () => {
  it('quét tin visitor có số điện thoại, ghi nhận vào sổ, cập nhật cursor và gửi email thông báo', async () => {
    // Gọi setCursor('web', 0) trước khi chạy để giữ hành vi quét từ đầu
    await setCursor('web', 0);

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
    // Gọi setCursor('web', 0) trước khi chạy để giữ hành vi quét từ đầu
    await setCursor('web', 0);

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

  it('lần đầu chạy khi chưa có cursor: bỏ qua tin cũ, gán cursor = MAX(id), chỉ quét từ tin mới', async () => {
    const user = await createUser({
      username: 'shop-owner-init-cursor',
      email: 'owner-init@example.com',
    });

    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_init`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.id, widgetId, 'sess_init', 'Khách Cũ']
    );
    const convId = convRows[0].id;

    // Tin visitor cũ chứa số điện thoại từ trước khi hệ thống chạy cron lần đầu
    const { rows: oldMsgRows } = await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', 'Số cũ của tôi là 0912345678', NOW() - INTERVAL '1 day')
       RETURNING id`,
      [convId, user.id]
    );
    const oldMsgId = Number(oldMsgRows[0].id);

    // Lần 1: Chưa có cursor, chạy scanAndNotify
    const result1 = await scanAndNotify();
    expect(result1.scannedCount).toBe(0);
    expect(result1.alertsCreatedOrUpdated).toBe(0);
    expect(result1.emailsSent).toBe(0);
    expect(result1.initializedSources).toContain('web');
    expect(mockSendMail).not.toHaveBeenCalled();

    // Sổ chatbot_contact_alerts không có dòng nào
    const { rows: alertRows1 } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(alertRows1.length).toBe(0);

    // Cursor đã được set = id của tin cũ
    const cursor = await getCursor('web');
    expect(cursor).toBe(oldMsgId);

    // Chèn tin mới có số điện thoại
    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', 'Tôi gửi số mới 0987654321', NOW())`,
      [convId, user.id]
    );

    // Lần 2: Quét tin mới
    const result2 = await scanAndNotify();
    expect(result2.scannedCount).toBe(1);
    expect(result2.alertsCreatedOrUpdated).toBe(1);
    expect(result2.emailsSent).toBe(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    const { rows: alertRows2 } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(alertRows2.length).toBe(1);
    expect(alertRows2[0].contact_value).toBe('0987654321');
    expect(alertRows2[0].pending_notify).toBe(false);
  });

  it('ca (a): dòng đang pending=true, lần mới xuất hiện có human_active -> chuyển pending_notify = false', async () => {
    const user = await createUser({ username: 'shop-owner-case-a', email: 'owner-a@example.com' });
    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_a`]
    );
    const widgetId = widgetRows[0].id;
    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, widgetId, 'sess_a']
    );
    const convId = convRows[0].id;

    // 1. Khách nhắn số điện thoại khi chưa có agent -> upsert tạo dòng pending_notify = true
    await chatbotContactAlertRepo.upsertContact({
      idUser: user.id,
      contactType: 'phone',
      contactValue: '0912345678',
      seenAt: new Date(),
      source: 'web',
      conversationId: convId,
      messageId: 10,
      excerpt: 'SĐT 0912345678',
      pendingNotify: true,
      suppressedReason: null,
    });

    const { rows: before } = await db.query(
      `SELECT pending_notify, suppressed_reason FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(before[0].pending_notify).toBe(true);
    expect(before[0].suppressed_reason).toBeNull();

    // 2. Khách nhắn lại (messageId = 12), lần này có agent -> pendingNotify = false, suppressedReason = 'human_active'
    await chatbotContactAlertRepo.upsertContact({
      idUser: user.id,
      contactType: 'phone',
      contactValue: '0912345678',
      seenAt: new Date(),
      source: 'web',
      conversationId: convId,
      messageId: 12,
      excerpt: 'Em gửi lại 0912345678',
      pendingNotify: false,
      suppressedReason: 'human_active',
    });

    const { rows: after } = await db.query(
      `SELECT pending_notify, suppressed_reason FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(after[0].pending_notify).toBe(false);
    expect(after[0].suppressed_reason).toBe('human_active');
  });

  it('ca (b): dòng suppressed human_active, 3 giờ sau khách nhắn lại không có agent -> pending_notify = true và suppressed_reason = NULL', async () => {
    const user = await createUser({ username: 'shop-owner-case-b', email: 'owner-b@example.com' });
    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_b`]
    );
    const widgetId = widgetRows[0].id;
    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, widgetId, 'sess_b']
    );
    const convId = convRows[0].id;

    // 1. Dòng đang bị suppressed human_active từ trước (messageId = 20)
    await chatbotContactAlertRepo.upsertContact({
      idUser: user.id,
      contactType: 'phone',
      contactValue: '0933445566',
      seenAt: new Date(Date.now() - 3 * 3600 * 1000),
      source: 'web',
      conversationId: convId,
      messageId: 20,
      excerpt: 'SĐT 0933445566',
      pendingNotify: false,
      suppressedReason: 'human_active',
    });

    // 2. 3 giờ sau, khách nhắn lại (messageId = 25), không có agent -> pendingNotify = true, suppressedReason = null
    await chatbotContactAlertRepo.upsertContact({
      idUser: user.id,
      contactType: 'phone',
      contactValue: '0933445566',
      seenAt: new Date(),
      source: 'web',
      conversationId: convId,
      messageId: 25,
      excerpt: 'Shop ơi tư vấn 0933445566',
      pendingNotify: true,
      suppressedReason: null,
    });

    const { rows } = await db.query(
      `SELECT pending_notify, suppressed_reason FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(rows[0].pending_notify).toBe(true);
    expect(rows[0].suppressed_reason).toBeNull();
  });

  const REAL_SIM_SPAM_FIXTURE = `💐 💐 List sim đầu số 0979
⚡ 0979.891.896 =5tr0
⚡ 0979.888.255 =5tr0
⚡ 0979.096.296 =1tr8
⚡ 0979.678.858 =6tr0
⚡ 0979.855.998 =5tr0
⚡ 0979.388.138 =5tr0
⚡ 0979.581.699 =5tr0
⚡ 0979.8338.98 =8tr0
⚡ 0979.898.633 =3tr0
⚡ 0979.263.293 =3tr0
⚡ 0979.028.128 =8tr0
⚡ 0979.183.389 =5tr0
⚡ 0979.345.778 =5tr0
⚡ 0979.903.168 =4tr0
⚡ 0979.25.6839 =5tr5
⚡ 0979.255.639 =3tr5
⚡ 0979.310.368 =4tr5
⚡ 0979.51.6899 =6tr0
⚡ 0979.51.0299 =3tr0
⚡ 0979.212.588 =7tr5
⚡ 0979.131.599 =7tr0
⚡ 09.79.59.69.29 =5tr5
⚡ 0979.39.59.29 =5tr0
⚡ 0979.610.368 =5tr0`;

  it('bảng rao sim thật của hội thoại 14221 (≥20 số): scanAndNotify bỏ cả tin, 0 alert, không gửi email', async () => {
    await setCursor('web', 0);

    const user = await createUser({
      username: 'shop-owner-sim-spam',
      email: 'owner-sim@example.com',
    });

    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_sim`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.id, widgetId, 'sess_sim', 'Spammer Sim']
    );
    const convId = convRows[0].id;

    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', $3, NOW())`,
      [convId, user.id, REAL_SIM_SPAM_FIXTURE]
    );

    const result = await scanAndNotify();
    expect(result.scannedCount).toBe(1);
    expect(result.alertsCreatedOrUpdated).toBe(0);
    expect(result.emailsSent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();

    const { rows: alertRows } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(alertRows.length).toBe(0);
  });

  it('content là JSON hợp lệ có số: scanAndNotify bỏ qua tin, 0 alert, không gửi email', async () => {
    await setCursor('web', 0);

    const user = await createUser({
      username: 'shop-owner-json-msg',
      email: 'owner-json@example.com',
    });

    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_json`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.id, widgetId, 'sess_json', 'Zalo Bot']
    );
    const convId = convRows[0].id;

    const jsonPayload = JSON.stringify({
      title: 'Thông báo sự kiện tuyển dụng',
      hotline: '0912345678',
      description: 'Liên hệ tư vấn viên theo SĐT 0912345678',
    });

    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', $3, NOW())`,
      [convId, user.id, jsonPayload]
    );

    const result = await scanAndNotify();
    expect(result.scannedCount).toBe(1);
    expect(result.alertsCreatedOrUpdated).toBe(0);
    expect(result.emailsSent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();

    const { rows: alertRows } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(alertRows.length).toBe(0);
  });

  it('content bắt đầu bằng { nhưng không parse được (người thật gõ): scanAndNotify vẫn quét và tạo cảnh báo', async () => {
    await setCursor('web', 0);

    const user = await createUser({
      username: 'shop-owner-invalid-json',
      email: 'owner-invalid-json@example.com',
    });

    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [user.id, `key_${Date.now()}_invalid_json`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: convRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.id, widgetId, 'sess_inv_json', 'Khách Thật']
    );
    const convId = convRows[0].id;

    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
       VALUES ($1, $2, 'visitor', '{ xin chào shop, số điện thoại của tôi là 0912345678 nhé', NOW())`,
      [convId, user.id]
    );

    const result = await scanAndNotify();
    expect(result.scannedCount).toBe(1);
    expect(result.alertsCreatedOrUpdated).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    const { rows: alertRows } = await db.query(
      `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
      [user.id]
    );
    expect(alertRows.length).toBe(1);
    expect(alertRows[0].contact_value).toBe('0912345678');
  });

  describe('PR-4 Integration — Bỏ nhóm Zalo, nhận danh thiếp, siết đầu số', () => {
    it('hội thoại nhóm Zalo có SĐT -> scanAndNotify bỏ qua, 0 alert, con trỏ vẫn nhảy', async () => {
      await setCursor('zalo_personal', 0);

      const user = await createUser({
        username: 'shop-owner-group-test',
        email: 'owner-group@example.com',
      });

      const { rows: zaloAcc } = await db.query(
        `INSERT INTO zalo_settings (id_user, is_active, display_name)
         VALUES ($1, true, 'Zalo Group Test') RETURNING id`,
        [user.id]
      );

      const { rows: groupConv } = await db.query(
        `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, visitor_info)
         VALUES ($1, $2, 'group_9999', 'Nhóm Học Tập', $3) RETURNING id`,
        [user.id, zaloAcc[0].id, JSON.stringify({ is_group: true, group_id: '9999' })]
      );
      const convId = groupConv[0].id;

      const { rows: msgRows } = await db.query(
        `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, created_at)
         VALUES ($1, $2, $3, 'visitor', 'Số mình nè 0912345678', NOW())
         RETURNING id`,
        [convId, user.id, zaloAcc[0].id]
      );
      const msgId = Number(msgRows[0].id);

      const result = await scanAndNotify();
      expect(result.scannedCount).toBe(1);
      expect(result.alertsCreatedOrUpdated).toBe(0);
      expect(result.emailsSent).toBe(0);
      expect(mockSendMail).not.toHaveBeenCalled();

      const { rows: alertRows } = await db.query(
        `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
        [user.id]
      );
      expect(alertRows.length).toBe(0);

      const cursor = await getCursor('zalo_personal');
      expect(cursor).toBe(msgId);
    });

    it('danh thiếp Zalo trong hội thoại 1-1 -> scanAndNotify nhận đúng số trên thiếp và gửi email', async () => {
      await setCursor('zalo_personal', 0);

      const user = await createUser({
        username: 'shop-owner-card-test',
        email: 'owner-card@example.com',
      });

      const { rows: zaloAcc } = await db.query(
        `INSERT INTO zalo_settings (id_user, is_active, display_name)
         VALUES ($1, true, 'Zalo Card Test') RETURNING id`,
        [user.id]
      );

      const { rows: directConv } = await db.query(
        `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, visitor_info)
         VALUES ($1, $2, 'user_8888', 'Khách Shiro', '{}') RETURNING id`,
        [user.id, zaloAcc[0].id]
      );
      const convId = directConv[0].id;

      const cardPayload = JSON.stringify({
        title: 'Shiro',
        description: JSON.stringify({
          phone: '0326886627',
          qrCodeUrl: 'https://qr-talk.zdn.vn/37/350435420/abc',
        }),
      });

      await db.query(
        `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, created_at)
         VALUES ($1, $2, $3, 'visitor', $4, NOW())`,
        [convId, user.id, zaloAcc[0].id, cardPayload]
      );

      const result = await scanAndNotify();
      expect(result.scannedCount).toBe(1);
      expect(result.alertsCreatedOrUpdated).toBe(1);
      expect(result.emailsSent).toBe(1);
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      const { rows: alertRows } = await db.query(
        `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
        [user.id]
      );
      expect(alertRows.length).toBe(1);
      expect(alertRows[0].contact_value).toBe('0326886627');
    });

    it('chuỗi số có mã số thuế (031...) hoặc hash ảnh (080...) -> scanAndNotify bỏ qua, 0 alert', async () => {
      await setCursor('web', 0);

      const user = await createUser({
        username: 'shop-owner-mst-test',
        email: 'owner-mst@example.com',
      });

      const { rows: widgetRows } = await db.query(
        `INSERT INTO web_widget_configs (id_user, widget_key)
         VALUES ($1, $2) RETURNING id`,
        [user.id, `key_${Date.now()}_mst`]
      );
      const widgetId = widgetRows[0].id;

      const { rows: convRows } = await db.query(
        `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [user.id, widgetId, 'sess_mst', 'Khách Doanh Nghiệp']
      );
      const convId = convRows[0].id;

      await db.query(
        `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
         VALUES ($1, $2, 'visitor', 'DIGISO (MST) 0318700853 và ảnh photo-stal-31.zdn.vn/no/jpg/0ebb982ddc0800565919/2aOboQ', NOW())`,
        [convId, user.id]
      );

      const result = await scanAndNotify();
      expect(result.scannedCount).toBe(1);
      expect(result.alertsCreatedOrUpdated).toBe(0);
      expect(result.emailsSent).toBe(0);

      const { rows: alertRows } = await db.query(
        `SELECT * FROM chatbot_contact_alerts WHERE id_user = $1`,
        [user.id]
      );
      expect(alertRows.length).toBe(0);
    });
  });
});
