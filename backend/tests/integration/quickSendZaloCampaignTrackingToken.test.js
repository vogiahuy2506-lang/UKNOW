/**
 * PLAN_RA_SOAT_DOT3 PR-Q1 việc 2 — POST /api/campaigns/quick-send/test-send (kênh zalo_personal) ghi lịch sử vào
 * zalo_messages với tracking_token hợp lệ.
 *
 * Trước bản vá, campaignQuickSend.service.js truyền `trackingToken: null` vào persistSource của consumeSendQuota;
 * zalo_messages.tracking_token là NOT NULL UNIQUE (production + bootstrap.sql) nên INSERT lỗi, transaction consume rollback,
 * reservation rơi 'uncertain' dù tin ĐÃ gửi — chỉ lộ ra khi hạn mức chạy enforce (cùng lỗi từng xảy ra ở
 * zaloSettings.controller.js, xem quickSendZaloPersonalTracking.test.js).
 */
process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

const zaloAccountSessionService = (await import('../../src/services/zalo/zaloAccountSession.service.js')).default;
const campaignZaloSenderService = (await import('../../src/services/campaign/campaignZaloSender.service.js')).default;
const { getSharedZaloRateLimiter } = await import('../../src/services/campaign/zaloOutboundRateLimiterSingleton.js');

let app;
let originalQuietStart;
let originalQuietEnd;

// Giờ yên lặng Zalo (23:00–06:00 VN) là giờ THẬT — tắt trên singleton cho cả file, trả lại ở afterAll
// (cùng khuôn quickSendZaloPersonalTracking.test.js).
beforeAll(() => {
  app = createApp();
  const limiter = getSharedZaloRateLimiter();
  originalQuietStart = limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
  originalQuietEnd = limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
  limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 24;
  limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 0;
});

afterAll(() => {
  const limiter = getSharedZaloRateLimiter();
  limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = originalQuietStart;
  limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = originalQuietEnd;
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
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

describe('POST /api/campaigns/quick-send/test-send — zalo_personal, hạn mức enforce', () => {
  it('gửi thành công -> reservation consumed + zalo_messages có dòng với tracking_token "zpv_..." (không NULL)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const accountId = await createConnectedZaloAccount(user.id);
    zaloAccountSessionService.setAccountApi(accountId, { sendMessage: jest.fn() });
    jest.spyOn(campaignZaloSenderService, 'sendPersonalMessage')
      .mockResolvedValue({ status: 'success', uid: 'uid-quick-1', response: { message: { msgId: '123' } } });

    const res = await request(app)
      .post('/api/campaigns/quick-send/test-send')
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'zalo_personal', recipient: '0912345678', message: 'Xin chào gửi nhanh', accountId });
    zaloAccountSessionService.clearAccountApi(accountId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { rows } = await db.query(
      `SELECT tracking_token, channel, is_preview, quota_reservation_id FROM zalo_messages WHERE account_id = $1`,
      [accountId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tracking_token).toMatch(/^zpv_[0-9a-f-]{36}$/);
    expect(rows[0].channel).toBe('zalo_personal');
    expect(rows[0].quota_reservation_id).not.toBeNull();

    const { rows: reservations } = await db.query(
      `SELECT status FROM send_quota_reservations WHERE billing_user_id = $1 AND channel = 'zalo'`,
      [user.id]
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe('consumed');
  });
});
