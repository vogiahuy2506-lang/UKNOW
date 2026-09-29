/**
 * PLAN_GUI_NHANH_ZALO_PR3_DON_NOT_2026-09-29 Việc 1 + 2 — gửi nhanh Zalo NHÓM và KẾT BẠN:
 *
 * Việc 1: gửi thành công phải ghi lịch sử vào zalo_messages (is_preview = true, token `zpv_…`).
 *   Trước PR-3 chỉ nhánh cá nhân ghi; nhóm/kết bạn chỉ có usage_logs.
 * Việc 2: Zalo báo tra số quá nhiều (cá nhân + kết bạn) phải ghi khoá xuống
 *   zalo_settings.phone_lookup_cooldown_until (không chỉ RAM — deploy là mất khoá).
 *
 * Chạy CẢ 3 chế độ hạn mức: `shadow`/`off` đi nhánh insert trực tiếp (production đang chạy),
 * `enforce` đi nhánh consumeSendQuota().persistSource. Bài học PR-1: test chỉ enforce để lọt
 * đột biến ở nhánh production.
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

const LOOKUP_RATE_LIMIT_MESSAGE = 'Bạn đã tìm số điện thoại quá nhiều lần trong 1 giờ, hành vi bất thường';

describe.each(['shadow', 'off', 'enforce'])('gửi nhanh nhóm/kết bạn — chế độ hạn mức %s', (mode) => {
  const activeFakeSessionAccountIds = [];

  beforeEach(() => {
    process.env.SEND_QUOTA_RESERVATION_MODE = mode;
  });

  afterEach(() => {
    process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
    while (activeFakeSessionAccountIds.length > 0) {
      zaloAccountSessionService.clearAccountApi(activeFakeSessionAccountIds.pop());
    }
  });

  async function setup(fakeApi) {
    const user = await createUser();
    const token = await loginAs(user);
    const accountId = await createConnectedZaloAccount(user.id);
    zaloAccountSessionService.setAccountApi(accountId, fakeApi);
    activeFakeSessionAccountIds.push(accountId);
    return { user, token, accountId };
  }

  it('gửi nhóm thành công -> 1 dòng zalo_messages: is_preview, channel zalo_group, recipient_type group, group_id đúng, token zpv_', async () => {
    const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '900100' } });
    const { token, accountId } = await setup({
      getAllGroups: jest.fn().mockResolvedValue({ gridVerMap: { 'grp-001': '1' } }),
      sendMessage: fakeSendMessage,
    });

    const res = await request(app)
      .post('/api/zalo/preview/send-group')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, groupIds: ['grp-001'], message: 'Thông báo nhóm' });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].status).toBe('success');

    const { rows } = await db.query(
      `SELECT is_preview, channel, recipient_type, recipient_value, group_id, uid, tracking_token,
              quota_reservation_id, message_text
       FROM zalo_messages WHERE account_id = $1`,
      [accountId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_preview).toBe(true);
    expect(rows[0].channel).toBe('zalo_group');
    expect(rows[0].recipient_type).toBe('group');
    expect(rows[0].recipient_value).toBe('grp-001');
    expect(rows[0].group_id).toBe('grp-001');
    expect(rows[0].uid).toBeNull();
    expect(rows[0].tracking_token).toMatch(/^zpv_/);
    expect(rows[0].message_text).toBe('Thông báo nhóm');
    if (mode === 'enforce') {
      expect(rows[0].quota_reservation_id).not.toBeNull();
    } else {
      expect(rows[0].quota_reservation_id).toBeNull();
    }
  });

  it('gửi nhóm: người thứ 2 bị hoãn (deferred) -> KHÔNG có dòng mới cho nó, chỉ 1 dòng của nhóm đã gửi', async () => {
    const fakeSendMessage = jest.fn().mockResolvedValue({ message: { msgId: '900200' } });
    const { token, accountId } = await setup({
      getAllGroups: jest.fn().mockResolvedValue({ gridVerMap: { 'grp-001': '1', 'grp-002': '1' } }),
      sendMessage: fakeSendMessage,
    });

    const res = await request(app)
      .post('/api/zalo/preview/send-group')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, groupIds: ['grp-001', 'grp-002'], message: 'Thông báo nhóm' });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].status).toBe('success');
    expect(res.body.data.items[1].status).toBe('deferred');
    expect(fakeSendMessage).toHaveBeenCalledTimes(1);

    const { rows } = await db.query(
      `SELECT group_id FROM zalo_messages WHERE account_id = $1`,
      [accountId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].group_id).toBe('grp-001');
  });

  it('gửi kết bạn thành công -> 1 dòng zalo_messages: is_preview, channel zalo_friend_request, recipient_type phone, uid, token zpv_', async () => {
    const fakeSendFriendRequest = jest.fn().mockResolvedValue({});
    const { token, accountId } = await setup({
      findUser: jest.fn().mockResolvedValue({ uid: 'uid-friend-1', zalo_name: 'Khách A' }),
      sendFriendRequest: fakeSendFriendRequest,
    });

    const res = await request(app)
      .post('/api/zalo/preview/send-friend-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, recipients: ['0912345678'], message: 'Kết bạn nhé' });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].status).toBe('success');
    expect(fakeSendFriendRequest).toHaveBeenCalledTimes(1);

    const { rows } = await db.query(
      `SELECT is_preview, channel, recipient_type, recipient_value, uid, group_id, tracking_token,
              quota_reservation_id
       FROM zalo_messages WHERE account_id = $1`,
      [accountId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_preview).toBe(true);
    expect(rows[0].channel).toBe('zalo_friend_request');
    expect(rows[0].recipient_type).toBe('phone');
    expect(rows[0].recipient_value).toBe('0912345678');
    expect(rows[0].uid).toBe('uid-friend-1');
    expect(rows[0].group_id).toBeNull();
    expect(rows[0].tracking_token).toMatch(/^zpv_/);
    if (mode === 'enforce') {
      expect(rows[0].quota_reservation_id).not.toBeNull();
    } else {
      expect(rows[0].quota_reservation_id).toBeNull();
    }
  });

  it('Zalo báo tra số quá nhiều khi KẾT BẠN -> phone_lookup_cooldown_until được ghi xuống CSDL (≈ 00:00 giờ VN kế tiếp)', async () => {
    const { token, accountId } = await setup({
      findUser: jest.fn().mockRejectedValue(new Error(LOOKUP_RATE_LIMIT_MESSAGE)),
      sendFriendRequest: jest.fn(),
    });
    const before = Date.now();

    const res = await request(app)
      .post('/api/zalo/preview/send-friend-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, recipients: ['0912345678'], message: 'Kết bạn nhé' });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].status).toBe('failed');

    const { rows } = await db.query(
      `SELECT phone_lookup_cooldown_until FROM zalo_settings WHERE id = $1`,
      [accountId]
    );
    expect(rows[0].phone_lookup_cooldown_until).not.toBeNull();
    const untilMs = new Date(rows[0].phone_lookup_cooldown_until).getTime();
    expect(untilMs).toBeGreaterThan(before);
    expect(untilMs - before).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    // Đúng 00:00:00 giờ VN (UTC+7).
    const vn = new Date(untilMs + 7 * 60 * 60 * 1000);
    expect([vn.getUTCHours(), vn.getUTCMinutes(), vn.getUTCSeconds()]).toEqual([0, 0, 0]);
  });

  it('Zalo báo tra số quá nhiều khi gửi CÁ NHÂN theo số -> phone_lookup_cooldown_until được ghi xuống CSDL', async () => {
    const { token, accountId } = await setup({
      findUser: jest.fn().mockRejectedValue(new Error(LOOKUP_RATE_LIMIT_MESSAGE)),
      sendMessage: jest.fn(),
    });
    const before = Date.now();

    const res = await request(app)
      .post('/api/zalo/preview/send-personal')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, recipients: ['0912345678'], recipientType: 'phone', message: 'Xin chào' });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].status).toBe('failed');

    const { rows } = await db.query(
      `SELECT phone_lookup_cooldown_until FROM zalo_settings WHERE id = $1`,
      [accountId]
    );
    expect(rows[0].phone_lookup_cooldown_until).not.toBeNull();
    const untilMs = new Date(rows[0].phone_lookup_cooldown_until).getTime();
    expect(untilMs).toBeGreaterThan(before);
    expect(untilMs - before).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    const vn = new Date(untilMs + 7 * 60 * 60 * 1000);
    expect([vn.getUTCHours(), vn.getUTCMinutes(), vn.getUTCSeconds()]).toEqual([0, 0, 0]);
  });
});
