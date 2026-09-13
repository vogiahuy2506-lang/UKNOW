/**
 * Integration tests cho `GET /api/delivery-monitor/overview` (user-facing).
 *
 * Endpoint này yêu cầu auth nhưng không cần admin role.
 * Service dùng safeQuery nên luôn trả kết quả ngay cả khi DB rỗng.
 *
 * Covered:
 *   - Authorization (cần auth, không cần admin)
 *   - Response shape đầy đủ
 *   - Tenant isolation — user chỉ thấy data của mình
 *   - windowDays param clamping
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, insertZaloMonitorMessages } from './helpers/db.js';
import { ZALO_SILENT_DROP_SIGNAL_CODE } from '../../src/utils/deliveryMonitorSignals.util.js';
import { ZALO_SILENT_DROP_CATEGORY } from '../../src/utils/zaloDispatchDelivery.util.js';

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
  return res.body.data.accessToken;
}

async function createCampaign({ userId, name = 'C', type = 'email' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, $3, 'running', NOW()) RETURNING id`,
    [userId, name, type]
  );
  return rows[0];
}

async function createRun({
  campaignId,
  status = 'completed',
  errorMessage = null,
  totalRecipients = 10,
  successfulSends = 9,
  failedSends = 1,
}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (
       id_campaign, status, started_at, completed_at,
       total_recipients, successful_sends, failed_sends, error_message
     )
     VALUES ($1, $2, NOW(), NOW(), $3, $4, $5, $6) RETURNING id`,
    [campaignId, status, totalRecipients, successfulSends, failedSends, errorMessage]
  );
  return rows[0];
}

// ─── Authorization ──────────────────────────────────────────────────────────
describe('Authorization — /api/delivery-monitor/overview', () => {
  it('không có token → 401', async () => {
    const res = await request(app).get('/api/delivery-monitor/overview');
    expect(res.status).toBe(401);
  });

  it('user role thường có token → 200 (không cần admin)', async () => {
    const user = await createUser({ role: 'user', username: 'plain' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('admin role cũng truy cập được', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ─── Response shape ─────────────────────────────────────────────────────────
describe('GET /api/delivery-monitor/overview — response shape', () => {
  it('trả đầy đủ top-level fields', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('generatedAt');
    expect(data).toHaveProperty('windowDays');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('channels');
    expect(data).toHaveProperty('timeline');
    expect(data).toHaveProperty('topRuns');
    expect(data).toHaveProperty('recentErrors');
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('signals');
    expect(Array.isArray(data.signals)).toBe(true);
  });

  it('summary counter mặc định = 0 khi user chưa có campaign', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const { summary } = res.body.data;
    expect(summary).toMatchObject({
      sent: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      totalRuns: 0,
    });
  });

  it('channels trả 3 kênh (email, zalo, zalo_group)', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const channels = res.body.data.channels;
    expect(Array.isArray(channels)).toBe(true);
    expect(channels).toHaveLength(3);
    const codes = channels.map((c) => c.channel);
    expect(codes).toContain('email');
    expect(codes).toContain('zalo');
    expect(codes).toContain('zalo_group');
  });

  it('health có zaloQuietHours', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const { health } = res.body.data;
    expect(health).toHaveProperty('zaloQuietHours');
    expect(typeof health.zaloQuietHours.inQuietHours).toBe('boolean');
  });

  it('health.zaloDisconnectedCount đọc từ zalo_settings của chính user (PR-1/PR-4: zalo_accounts rỗng trên production)', async () => {
    const user = await createUser({ username: 'uZs' });
    await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active, restore_fail_count)
       VALUES ($1, 'Acc connected', 'connected', true, 0),
              ($1, 'Acc disconnected', 'disconnected', true, 0),
              ($1, 'Acc flaky-but-connected', 'connected', true, 3)`,
      [user.id]
    );

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // disconnected (active) + connected-nhưng-restore_fail_count>0 (active) = 2.
    expect(res.body.data.health.zaloDisconnectedCount).toBe(2);
  });

  it('timeline là mảng', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body.data.timeline)).toBe(true);
    expect(Array.isArray(res.body.data.topRuns)).toBe(true);
    expect(Array.isArray(res.body.data.recentErrors)).toBe(true);
  });
});

// ─── Tenant isolation ───────────────────────────────────────────────────────
describe('Tenant isolation — /api/delivery-monitor/overview', () => {
  it('totalRuns chỉ đếm campaign_runs thuộc user đang login', async () => {
    const userA = await createUser({ username: 'uA' });
    const userB = await createUser({ username: 'uB' });

    const campA = await createCampaign({ userId: userA.id, name: 'A campaign' });
    const campB = await createCampaign({ userId: userB.id, name: 'B campaign' });

    await createRun({ campaignId: campA.id });
    await createRun({ campaignId: campA.id });
    await createRun({ campaignId: campB.id });

    const tokenA = await loginAs(userA);
    const resA = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.data.summary.totalRuns).toBe(2);

    const tokenB = await loginAs(userB);
    const resB = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.data.summary.totalRuns).toBe(1);
  });

  it('health.zaloDisconnectedCount chỉ đếm tài khoản Zalo của chính user, không lộ sang user khác', async () => {
    const userA = await createUser({ username: 'zsA' });
    const userB = await createUser({ username: 'zsB' });

    // User A có 2 tài khoản bất thường, user B chỉ có 1 tài khoản đang connected sạch.
    await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active, restore_fail_count)
       VALUES ($1, 'A disconnected 1', 'disconnected', true, 0),
              ($1, 'A disconnected 2', 'disconnected', true, 0)`,
      [userA.id]
    );
    await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active, restore_fail_count)
       VALUES ($1, 'B connected', 'connected', true, 0)`,
      [userB.id]
    );

    const tokenA = await loginAs(userA);
    const resA = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.data.health.zaloDisconnectedCount).toBe(2);

    const tokenB = await loginAs(userB);
    const resB = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.data.health.zaloDisconnectedCount).toBe(0);
  });
});

// ─── Run-level (pre-flight) errors ───────────────────────────────────────────
describe('GET /api/delivery-monitor/overview — run-level recentErrors', () => {
  it('run failed pre-flight (có error_message, 0 execution lỗi) hiện trong recentErrors; KPI tin lỗi vẫn 0', async () => {
    const user = await createUser({ username: 'uRunErr' });
    const camp = await createCampaign({ userId: user.id, name: 'Zalo preflight fail', type: 'zalo' });
    const run = await createRun({
      campaignId: camp.id,
      status: 'failed',
      errorMessage: 'Tài khoản Zalo chưa sẵn sàng',
      totalRecipients: 0,
      successfulSends: 0,
      failedSends: 0,
    });
    // Pre-flight: không tạo campaign_executions failed

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const { summary, recentErrors } = res.body.data;
    expect(summary.failed).toBe(0);
    expect(summary.failedRuns).toBe(1);

    const match = recentErrors.find((e) => e.id === `run-${run.id}`);
    expect(match).toBeTruthy();
    expect(match.campaignName).toBe('Zalo preflight fail');
    expect(match.errorMessage).toMatch(/Tài khoản Zalo/);
    expect(match.nodeName).toBeNull();
  });

  it('run vừa có error_message vừa có execution failed → chỉ hiện lỗi execution (không nhân đôi)', async () => {
    const user = await createUser({ username: 'uDedup' });
    const camp = await createCampaign({ userId: user.id, name: 'Node fail', type: 'email' });
    const run = await createRun({
      campaignId: camp.id,
      status: 'failed',
      errorMessage: 'Run also has message',
    });
    await db.query(
      `INSERT INTO campaign_executions (
         id_campaign, id_run, node_id, node_name, status, error_message, updated_at, created_at
       ) VALUES ($1, $2, 'n1', 'Send email', 'failed', 'SMTP bounce', NOW(), NOW())`,
      [camp.id, run.id]
    );

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const { recentErrors } = res.body.data;
    expect(recentErrors.some((e) => e.id === `run-${run.id}`)).toBe(false);
    expect(recentErrors.some((e) => String(e.errorMessage || '').includes('SMTP bounce'))).toBe(true);
  });
});

// ─── windowDays param ────────────────────────────────────────────────────────
describe('GET /api/delivery-monitor/overview — windowDays param', () => {
  it('?windowDays=14 → windowDays=14 trong response', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview?windowDays=14')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(14);
  });

  it('?windowDays=999 → clamp về 90', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview?windowDays=999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(90);
  });

  it('không có windowDays → default 7', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(7);
  });
});

function silentDropSignals(data) {
  return (data?.signals || []).filter((item) => item.code === ZALO_SILENT_DROP_SIGNAL_CODE);
}

describe('GET /api/delivery-monitor/overview — Zalo silent drop tenant', () => {
  it('chỉ user sở hữu campaign mới thấy tín hiệu; user khác cùng lúc không thấy', async () => {
    const userA = await createUser({ username: 'sdOwner' });
    const userB = await createUser({ username: 'sdOther' });
    const campA = await createCampaign({ userId: userA.id, name: 'A zalo', type: 'zalo' });
    const campB = await createCampaign({ userId: userB.id, name: 'B zalo', type: 'zalo' });

    await insertZaloMonitorMessages({
      campaignId: campA.id, accountId: 11, accountName: 'Acc A',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10,
    });
    await insertZaloMonitorMessages({
      campaignId: campB.id, accountId: 22, accountName: 'Acc B',
      status: 'sent', count: 10,
    });

    const tokenA = await loginAs(userA);
    const resA = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);
    const silentA = silentDropSignals(resA.body.data);
    expect(silentA).toHaveLength(1);
    expect(silentA[0]).toMatchObject({
      accountId: 11,
      accountName: 'Acc A',
      silentDrops: 10,
      attempts: 10,
      value: 100,
      level: 'critical',
    });

    const tokenB = await loginAs(userB);
    const resB = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);
    expect(silentDropSignals(resB.body.data)).toHaveLength(0);
  });
});

// ─── Run Failures Endpoint ──────────────────────────────────────────────────
describe('GET /api/delivery-monitor/runs/:runId/failures', () => {
  it('không có token → 401', async () => {
    const res = await request(app).get('/api/delivery-monitor/runs/1/failures');
    expect(res.status).toBe(401);
  });

  it('run của user khác hoặc không tồn tại → 404', async () => {
    const userA = await createUser({ username: 'uFailOwner' });
    const userB = await createUser({ username: 'uFailStranger' });
    const campA = await createCampaign({ userId: userA.id, name: 'Camp A', type: 'zalo' });
    const runA = await createRun({ campaignId: campA.id });

    const tokenB = await loginAs(userB);
    const res = await request(app)
      .get(`/api/delivery-monitor/runs/${runA.id}/failures`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('trả đúng nhóm failures và recipientAudit của chính user', async () => {
    const user = await createUser({ username: 'uFailSelf' });
    const camp = await createCampaign({ userId: user.id, name: 'Zalo Fail Test', type: 'zalo' });
    const auditData = {
      sourceRows: 6,
      withRecipient: 3,
      deduped: 3,
      skippedNoRecipient: 3,
      skippedAlreadySent: 0,
      skippedNotDue: 0,
      skippedCompleted: 0,
      attempted: 2,
    };
    const { rows: runRows } = await db.query(
      `INSERT INTO campaign_runs (
         id_campaign, status, started_at, completed_at,
         total_recipients, successful_sends, failed_sends, run_metadata
       )
       VALUES ($1, 'completed', NOW(), NOW(), 6, 0, 2, $2) RETURNING id`,
      [camp.id, JSON.stringify({ recipientAudit: auditData })]
    );
    const runId = runRows[0].id;

    await db.query(
      `INSERT INTO zalo_messages (
         id_campaign, id_run, recipient_value, status, channel,
         tracking_metadata, created_at, sent_at, is_preview
       ) VALUES
       ($1, $2, '0388180856', 'failed', 'zalo', '{"error":"Tham số không hợp lệ"}'::jsonb, NOW(), NOW(), false),
       ($1, $2, '0388180856', 'failed', 'zalo', '{"error":"Tham số không hợp lệ"}'::jsonb, NOW(), NOW(), false)`,
      [camp.id, runId]
    );

    await db.query(
      `INSERT INTO campaign_run_recipient_steps (
         id_run, channel, recipient_key, last_completed_step, meta, updated_at
       ) VALUES ($1, 'zalo_personal', '0388180856', 0, '{"lastFailureReason":"invalid_parameter"}'::jsonb, NOW())`,
      [runId]
    );

    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/delivery-monitor/runs/${runId}/failures`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.runId).toBe(Number(runId));
    expect(res.body.data.recipientAudit).toMatchObject(auditData);
    expect(res.body.data.failures).toHaveLength(1);
    expect(res.body.data.failures[0]).toMatchObject({
      channel: 'zalo',
      recipient: '0388180856',
      reason: 'invalid_parameter',
      error: 'Tham số không hợp lệ',
      count: 2,
    });
  });
});
