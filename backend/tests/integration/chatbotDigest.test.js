/**
 * Integration tests cho PR-3:
 * Thư tổng hợp hoạt động chatbot theo tuần/tháng (đa kênh, không Gemini),
 * thống kê tin nhắn từ 3 nguồn, idempotent ON CONFLICT DO NOTHING,
 * và cấu hình tần suất nhận thư qua API settings.
 * Chạy trên PostgreSQL test thật (DB test uknow_campaign_test).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test-digest-msg-id>' });
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
const { default: chatbotDigestService } = await import(
  '../../src/services/chatbot/chatbotDigest.service.js'
);
const { default: chatbotDigestRepository } = await import(
  '../../src/repositories/chatbot/chatbotDigest.repository.js'
);
const { truncateAll, createUser } = await import('./helpers/db.js');

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
  await db.query(
    'TRUNCATE TABLE chatbot_digest_log, chatbot_contact_alerts, chatbot_contact_scan_cursors CASCADE'
  );
  mockSendMail.mockClear();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

describe('Chatbot Digest Integration (PR-3)', () => {
  const testDate = new Date('2026-09-14T10:00:00.000Z'); // Thứ Hai 14/09/2026 (tuần trước: 07/09 - 14/09)
  const inPeriodTime = '2026-09-10T10:00:00.000Z'; // Nằm trong tuần trước
  const outPeriodTime = '2026-08-25T10:00:00.000Z'; // Ngoài kỳ

  it('thống kê đa kênh chính xác từng ô số từ 3 bảng tin nhắn + sổ liên hệ', async () => {
    const owner = await createUser({
      username: 'digest_stat_user',
      email: 'digest_stat@example.com',
    });
    await db.query(`UPDATE users SET chatbot_digest_frequency = 'weekly' WHERE id = $1`, [
      owner.id,
    ]);

    // 1. Web chat
    const { rows: widgetRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key)
       VALUES ($1, $2) RETURNING id`,
      [owner.id, `key_${Date.now()}`]
    );
    const widgetId = widgetRows[0].id;

    const { rows: webConvRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, 'sess_web_1', 'Khách Web 1') RETURNING id`,
      [owner.id, widgetId]
    );
    const webConvId = webConvRows[0].id;

    // Web messages: 2 visitor, 1 assistant, 1 bot (cả 2 đều tính là AI), 1 agent
    await db.query(
      `INSERT INTO webchat_messages (id_user, id_conversation, role, content, created_at)
       VALUES
         ($1, $2, 'visitor', 'Xin chào từ khách', $3),
         ($1, $2, 'visitor', 'Tôi muốn tư vấn', $3),
         ($1, $2, 'assistant', 'Dạ chào bạn (assistant)', $3),
         ($1, $2, 'bot', 'Dạ chào bạn (bot)', $3),
         ($1, $2, 'agent', 'Nhân viên hỗ trợ bạn ngay', $3)`,
      [owner.id, webConvId, inPeriodTime]
    );

    // 2. Zalo personal chat
    const { rows: zaloSettingRows } = await db.query(
      `INSERT INTO zalo_settings (id_user, zalo_user_id, display_name)
       VALUES ($1, 'zalo_uid_1', 'Zalo Sale 1') RETURNING id`,
      [owner.id]
    );
    const zaloSettingId = zaloSettingRows[0].id;

    const { rows: zaloConvRows } = await db.query(
      `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, ai_paused, ai_paused_at)
       VALUES ($1, $2, 'zalo_ext_1', 'Khách Zalo 1', true, NOW() - interval '30 hours')
       RETURNING id`,
      [owner.id, zaloSettingId]
    );
    const zaloConvId = zaloConvRows[0].id;

    // Zalo personal messages: 1 visitor, 1 AI (metadata->>'source'='ai_auto_reply'), 1 agent
    await db.query(
      `INSERT INTO zalo_personal_messages (id_user, id_zalo_setting, id_conversation, role, content, metadata, created_at)
       VALUES
         ($1, $2, $3, 'visitor', 'Chào bạn Zalo', '{}', $4),
         ($1, $2, $3, 'assistant', 'Bot Zalo tự rep', '{"source":"ai_auto_reply"}', $4),
         ($1, $2, $3, 'agent', 'Người thật Zalo rep', '{}', $4)`,
      [owner.id, zaloSettingId, zaloConvId, inPeriodTime]
    );

    // 3. Channel chat (Facebook/Zalo OA)
    const { rows: channelConnRows } = await db.query(
      `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name)
       VALUES ($1, 'facebook', 'fb_page_1', 'Fanpage Test') RETURNING id`,
      [owner.id]
    );
    const channelConnId = channelConnRows[0].id;

    const { rows: channelConvRows } = await db.query(
      `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name)
       VALUES ($1, $2, 'facebook', 'fb_conv_1', 'Khách FB 1') RETURNING id`,
      [owner.id, channelConnId]
    );
    const channelConvId = channelConvRows[0].id;

    // Channel messages: 1 visitor, 1 bot, 1 agent
    await db.query(
      `INSERT INTO channel_messages (id_user, id_channel, id_conversation, role, content, created_at)
       VALUES
         ($1, $2, $3, 'visitor', 'Chào từ FB', $4),
         ($1, $2, $3, 'bot', 'Bot FB trả lời', $4),
         ($1, $2, $3, 'agent', 'CSKH FB trả lời', $4)`,
      [owner.id, channelConnId, channelConvId, inPeriodTime]
    );

    // 4. Sổ liên hệ (chatbot_contact_alerts)
    // 1 liên hệ trong kỳ chưa xử lý, 1 liên hệ ngoài kỳ đã xử lý
    await db.query(
      `INSERT INTO chatbot_contact_alerts
         (id_user, contact_type, contact_value, first_seen_at, last_seen_at, seen_count,
          last_source, last_conversation_id, last_message_id, handled_at)
       VALUES
         ($1, 'phone', '0901234567', $2, $2, 1, 'web', $3, 101, NULL),
         ($1, 'email', 'old@example.com', $4, $4, 1, 'web', $3, 102, NOW())`,
      [owner.id, inPeriodTime, webConvId, outPeriodTime]
    );

    // Lấy stats tuần
    const range = (await import('../../src/utils/vnTimeFormat.util.js')).getVietnamWeekRange(
      testDate
    );
    const stats = await chatbotDigestRepository.getDigestStats(owner.id, {
      startIso: range.startIso,
      endIso: range.endIso,
    });

    // Kiểm tra từng ô số
    // Conversations: 1 web + 1 zalo + 1 channel = 3
    expect(stats.conversations).toBe(3);
    // Visitor messages: 2 web + 1 zalo + 1 channel = 4
    expect(stats.visitorMessages).toBe(4);
    // AI replies: 2 web (assistant + bot) + 1 zalo (ai_auto_reply) + 1 channel (bot) = 4
    expect(stats.aiReplies).toBe(4);
    // Human replies: 1 web + 1 zalo + 1 channel = 3
    expect(stats.humanReplies).toBe(3);

    // byChannel có đủ 3 kênh
    expect(stats.byChannel).toHaveLength(3);
    const webStat = stats.byChannel.find((c) => c.channel === 'web');
    expect(webStat).toBeDefined();
    expect(webStat.visitorMessages).toBe(2);
    expect(webStat.aiReplies).toBe(2); // Cả assistant lẫn bot đều được tính!

    // stalePaused: 1 zalo_personal_conversations bị pause > 24h
    expect(stats.stalePaused).toBe(1);

    // Contacts: 1 in-period (contactsLeft), 1 open (contactsOpen)
    expect(stats.contactsLeft).toBe(1);
    expect(stats.contactsOpen).toBe(1);

    // topConversations có hội thoại web nhiều tin khách nhất (2 tin)
    expect(stats.topConversations.length).toBeGreaterThanOrEqual(1);
    expect(stats.topConversations[0].visitorMessages).toBe(2);
    expect(stats.topConversations[0].visitorName).toBe('Khách Web 1');
  });

  it('gửi hai lần cùng kỳ → chỉ gửi 1 thư (idempotent ON CONFLICT DO NOTHING)', async () => {
    const owner = await createUser({
      username: 'digest_idempotent_user',
      email: 'digest_idempotent@example.com',
    });
    await db.query(`UPDATE users SET chatbot_digest_frequency = 'weekly' WHERE id = $1`, [
      owner.id,
    ]);

    // Seed 1 tin nhắn web khách trong kỳ để đủ điều kiện recipient
    const { rows: wRows } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, 'key_idem') RETURNING id`,
      [owner.id]
    );
    const { rows: cRows } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id) VALUES ($1, $2, 's1') RETURNING id`,
      [owner.id, wRows[0].id]
    );
    await db.query(
      `INSERT INTO webchat_messages (id_user, id_conversation, role, content, created_at)
       VALUES ($1, $2, 'visitor', 'Xin chào', $3)`,
      [owner.id, cRows[0].id, inPeriodTime]
    );

    // Lần 1: gửi thành công
    const res1 = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: testDate,
    });
    expect(res1.recipients).toBe(1);
    expect(res1.sent).toBe(1);
    expect(res1.skipped).toBe(0);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Lần 2: chạy lại cùng kỳ → bị skip do ON CONFLICT DO NOTHING
    const res2 = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: testDate,
    });
    expect(res2.recipients).toBe(1);
    expect(res2.sent).toBe(0);
    expect(res2.skipped).toBe(1);
    // Vẫn chỉ gọi sendMail đúng 1 lần!
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Kiểm tra bảng log chỉ có đúng 1 dòng
    const { rows: logRows } = await db.query(
      `SELECT * FROM chatbot_digest_log WHERE id_user = $1`,
      [owner.id]
    );
    expect(logRows).toHaveLength(1);
    expect(logRows[0].period_key).toBe('2026-W37');
  });

  it('người dùng có status != active hoặc frequency = none không nằm trong danh sách gửi', async () => {
    // 1 user inactive
    const inactiveUser = await createUser({
      username: 'digest_inactive',
      email: 'digest_inactive@example.com',
    });
    await db.query(
      `UPDATE users SET status = 'inactive', chatbot_digest_frequency = 'weekly' WHERE id = $1`,
      [inactiveUser.id]
    );

    // 1 user có frequency = 'none'
    const noneUser = await createUser({
      username: 'digest_none',
      email: 'digest_none@example.com',
    });
    await db.query(
      `UPDATE users SET status = 'active', chatbot_digest_frequency = 'none' WHERE id = $1`,
      [noneUser.id]
    );

    // Cả 2 đều có tin nhắn khách trong kỳ
    for (const u of [inactiveUser, noneUser]) {
      const { rows: w } = await db.query(
        `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
        [u.id, `k_${u.id}`]
      );
      const { rows: c } = await db.query(
        `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id) VALUES ($1, $2, 's') RETURNING id`,
        [u.id, w[0].id]
      );
      await db.query(
        `INSERT INTO webchat_messages (id_user, id_conversation, role, content, created_at)
         VALUES ($1, $2, 'visitor', 'alo', $3)`,
        [u.id, c[0].id, inPeriodTime]
      );
    }

    const res = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: testDate,
    });

    // Không có ai được gửi
    expect(res.recipients).toBe(0);
    expect(res.sent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('GET / PUT /inbox/contact-alerts/settings hỗ trợ digestFrequency, chặn nhân viên sửa', async () => {
    const owner = await createUser({
      username: 'digest_settings_owner',
      email: 'digest_settings@example.com',
    });
    const token = await loginAs(owner);

    // 1. GET settings mặc định
    const getRes = await request(app)
      .get('/api/ai/chatbot/inbox/contact-alerts/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.digestFrequency).toBe('weekly');
    expect(getRes.body.data.emailEnabled).toBe(true);

    // 2. PUT đổi sang monthly
    const putRes = await request(app)
      .put('/api/ai/chatbot/inbox/contact-alerts/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ digestFrequency: 'monthly' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.data.digestFrequency).toBe('monthly');

    // Kiểm tra trong DB
    const { rows } = await db.query(
      `SELECT chatbot_digest_frequency FROM users WHERE id = $1`,
      [owner.id]
    );
    expect(rows[0].chatbot_digest_frequency).toBe('monthly');

    // 3. PUT với giá trị không hợp lệ -> 400
    const invalidRes = await request(app)
      .put('/api/ai/chatbot/inbox/contact-alerts/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ digestFrequency: 'yearly' });
    expect(invalidRes.status).toBe(400);

    // 4. Nhân viên PUT -> 403
    const employee = await createUser({
      username: 'digest_employee',
      email: 'digest_employee@example.com',
    });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
      [owner.id, employee.id, JSON.stringify({ inbox_manage: true, inbox_view: true })]
    );

    const empToken = await loginAs(employee);
    const empPutRes = await request(app)
      .put('/api/ai/chatbot/inbox/contact-alerts/settings')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id))
      .send({ digestFrequency: 'none' });
    expect(empPutRes.status).toBe(403);
  });

  it('chạy với onlyUserIds: 2 user có hoạt động, onlyUserIds=[user1] → chỉ gửi 1 thư cho user1, log chỉ có user1', async () => {
    const user1 = await createUser({
      username: 'digest_only_1',
      email: 'digest_only_1@example.com',
    });
    const user2 = await createUser({
      username: 'digest_only_2',
      email: 'digest_only_2@example.com',
    });

    await db.query(
      `UPDATE users SET chatbot_digest_frequency = 'weekly' WHERE id IN ($1, $2)`,
      [user1.id, user2.id]
    );

    // Cả 2 đều có tin nhắn khách trong kỳ
    for (const u of [user1, user2]) {
      const { rows: w } = await db.query(
        `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
        [u.id, `k_only_${u.id}`]
      );
      const { rows: c } = await db.query(
        `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id) VALUES ($1, $2, 's') RETURNING id`,
        [u.id, w[0].id]
      );
      await db.query(
        `INSERT INTO webchat_messages (id_user, id_conversation, role, content, created_at)
         VALUES ($1, $2, 'visitor', 'tin nhan khach', $3)`,
        [u.id, c[0].id, inPeriodTime]
      );
    }

    const res = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: testDate,
      onlyUserIds: [user1.id],
    });

    // Chỉ có user1 được gửi
    expect(res.recipients).toBe(1);
    expect(res.sent).toBe(1);
    expect(res.onlyUserIds).toEqual([Number(user1.id)]);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'digest_only_1@example.com' })
    );

    // Kiểm tra DB log chỉ có đúng 1 dòng cho user1
    const { rows: logRows } = await db.query(`SELECT * FROM chatbot_digest_log`);
    expect(logRows).toHaveLength(1);
    expect(Number(logRows[0].id_user)).toBe(Number(user1.id));
  });
});
