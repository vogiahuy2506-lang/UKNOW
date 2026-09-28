/**
 * PLAN_GUI_NHANH_ZALO_GIAN_CACH_2026-09-28 PR-1 Việc 3 — gửi nhanh Zalo cá nhân phải ghi được
 * lịch sử vào zalo_messages. Trước bản vá này, `trackingToken: null` làm INSERT lỗi vì
 * bootstrap.sql:1074 (giờ NOT NULL, giống production) — lỗi bị nuốt ở nhánh shadow
 * (zaloSettings.controller.js) nên `zalo_messages` KHÔNG BAO GIỜ có dòng `is_preview` dù
 * `usage_logs` có ghi nhận đã gửi.
 *
 * process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce' ở đầu file (cùng mẫu
 * synchronousSendQuota.test.js) để đi qua nhánh consumeSendQuota().persistSource. Nhánh CÒN
 * LẠI (shadow/off, insert trực tiếp — nhánh production đang chạy) có ca riêng ở cuối file:
 * dùng chung biến KHÔNG đủ, đột biến chỉ nhánh đó từng sống sót.
 */
process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

const zaloAccountSessionService = (await import('../../src/services/zalo/zaloAccountSession.service.js')).default;

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function createConnectedZaloAccount(ownerId) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
     VALUES ($1, true, 'connected', 'Zalo Bot gửi nhanh')
     RETURNING id`,
    [ownerId]
  );
  return rows[0].id;
}

describe('POST /api/zalo/preview/send-personal — ghi lịch sử zalo_messages (PR-1 Việc 3)', () => {
  const activeFakeSessionAccountIds = [];

  afterEach(() => {
    while (activeFakeSessionAccountIds.length > 0) {
      zaloAccountSessionService.clearAccountApi(activeFakeSessionAccountIds.pop());
    }
  });

  it('gửi thành công -> zalo_messages có 1 dòng is_preview=true, tracking_token bắt đầu "zpv_"', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const accountId = await createConnectedZaloAccount(user.id);

    const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '111222333' } });
    zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
    activeFakeSessionAccountIds.push(accountId);

    const res = await request(app)
      .post('/api/zalo/preview/send-personal')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        recipients: ['fake-uid-001'],
        recipientType: 'uid',
        message: 'Xin chào từ gửi nhanh',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].status).toBe('success');

    const { rows } = await db.query(
      `SELECT is_preview, tracking_token, channel, account_id, status
       FROM zalo_messages WHERE account_id = $1`,
      [accountId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_preview).toBe(true);
    expect(rows[0].tracking_token).toMatch(/^zpv_/);
    expect(rows[0].channel).toBe('zalo_personal');
  });

  it('gửi 2 người trong 1 request -> mỗi dòng zalo_messages có tracking_token RIÊNG (UNIQUE), không đụng nhau', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const accountId = await createConnectedZaloAccount(user.id);

    const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '444555666' } });
    zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
    activeFakeSessionAccountIds.push(accountId);

    const res = await request(app)
      .post('/api/zalo/preview/send-personal')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        recipients: ['fake-uid-001', 'fake-uid-002'],
        recipientType: 'uid',
        message: 'Xin chào',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.items.every((item) => item.status === 'success')).toBe(true);

    const { rows } = await db.query(
      `SELECT tracking_token FROM zalo_messages WHERE account_id = $1 ORDER BY id`,
      [accountId]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].tracking_token).toMatch(/^zpv_/);
    expect(rows[1].tracking_token).toMatch(/^zpv_/);
    expect(rows[0].tracking_token).not.toBe(rows[1].tracking_token);
  });

  // Review PR-1 — production chạy hạn mức KHÔNG enforce, tức đi nhánh insert trực tiếp (không qua
  // persistSource). Đột biến "nhánh đó truyền trackingToken: null" SỐNG SÓT qua 2 ca enforce ở trên —
  // "phủ gián tiếp qua cùng biến" là sai, phải có ca riêng.
  describe.each(['shadow', 'off'])('chế độ hạn mức %s (nhánh production đang chạy)', (mode) => {
    beforeEach(() => {
      process.env.SEND_QUOTA_RESERVATION_MODE = mode;
    });

    afterEach(() => {
      process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
    });

    it('gửi thành công -> zalo_messages có 1 dòng is_preview=true, tracking_token bắt đầu "zpv_"', async () => {
      const user = await createUser();
      const token = await loginAs(user);
      const accountId = await createConnectedZaloAccount(user.id);

      const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '777888999' } });
      zaloAccountSessionService.setAccountApi(accountId, { sendMessage: fakeSendMessage });
      activeFakeSessionAccountIds.push(accountId);

      const res = await request(app)
        .post('/api/zalo/preview/send-personal')
        .set('Authorization', `Bearer ${token}`)
        .send({
          accountId,
          recipients: ['fake-uid-003'],
          recipientType: 'uid',
          message: 'Xin chào từ gửi nhanh',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items[0].status).toBe('success');

      const { rows } = await db.query(
        `SELECT is_preview, tracking_token, quota_reservation_id FROM zalo_messages WHERE account_id = $1`,
        [accountId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].is_preview).toBe(true);
      expect(rows[0].tracking_token).toMatch(/^zpv_/);
      expect(rows[0].quota_reservation_id).toBeNull();
    });
  });
});
