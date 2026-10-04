/**
 * PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04, mục 5c / PR-5 — `GET /api/delivery-monitor/runs/:runId/estimate` trên
 * Postgres thật: thời gian CÒN LẠI của lượt đang chạy, tính từ sổ `campaign_run_recipient_steps` của lượt.
 *
 * Chiến dịch seed: trigger → Zalo cá nhân với 5 SĐT nhập tay (1 nick). Sổ của lượt: 2 người xong hết bước, 1 người bị
 * chốt bỏ (`zaloAbandonReason`) → còn 5 − 2 − 1 = 2 người = 2 thao tác. Số kỳ vọng VIẾT TAY.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { clearRunEstimateCache } from '../../src/services/user/userDeliveryMonitor.service.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  clearRunEstimateCache();
});

afterAll(async () => {
  await db.pool.end();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

const getEstimate = async (user, runId) => {
  const token = await loginAs(user);
  return request(app).get(`/api/delivery-monitor/runs/${runId}/estimate`).set('Authorization', `Bearer ${token}`);
};

async function seedRun(owner, { status = 'running', metadata = {} } = {}) {
  const { rows: zaloRows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active, is_default)
     VALUES ($1, 'Nick bán hàng', 'connected', true, true) RETURNING id`,
    [owner.id]
  );
  const { rows: campaignRows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'Chiến dịch giám sát', 'active') RETURNING id`,
    [owner.id]
  );
  const campaignId = campaignRows[0].id;
  const insertNode = async (subtype, config, order, type = 'action') => {
    const { rows } = await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
       VALUES ($1, $2, $3, $3, $4::jsonb, $5) RETURNING id`,
      [campaignId, type, subtype, JSON.stringify(config), order]
    );
    return rows[0].id;
  };
  const trigger = await insertNode('start', {}, 1, 'trigger');
  const personal = await insertNode('send_zalo_personal', {
    zaloAccountId: String(zaloRows[0].id),
    zaloRecipientType: 'phone',
    zaloRecipientSource: 'manual',
    zaloRecipientPhones: '0901000001\n0901000002\n0901000003\n0901000004\n0901000005',
  }, 2);
  await db.query(
    `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id) VALUES ($1, $2, $3)`,
    [campaignId, trigger, personal]
  );
  const { rows: runRows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, started_at, run_metadata)
     VALUES ($1, $2, 'manual', $3, NOW(), $4::jsonb) RETURNING id`,
    [campaignId, owner.id, status, JSON.stringify(metadata)]
  );
  const runId = Number(runRows[0].id);
  const ledger = (phone, { done = true, meta = {} } = {}) => db.query(
    `INSERT INTO campaign_run_recipient_steps
       (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, meta)
     VALUES ($1, $2, $3, 'zalo_personal', $4, 1, $5, $6::jsonb)`,
    [runId, campaignId, String(personal), phone, done, JSON.stringify(meta)]
  );
  await ledger('0901000001');
  await ledger('0901000002');
  await ledger('0901000003', { done: false, meta: { zaloAbandonReason: 'max_send_failures' } });
  return { runId, campaignId, personal };
}

describe('GET /api/delivery-monitor/runs/:runId/estimate', () => {
  it('lượt running: chỉ ước tính phần CÒN LẠI (5 − 2 xong − 1 chốt bỏ = 2 thao tác), đúng hợp đồng JSON', async () => {
    const owner = await createUser({ username: 'chugiamsat', role: 'user' });
    const { runId, personal } = await seedRun(owner);

    const res = await getEstimate(owner, runId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.runId).toBe(runId);
    expect(res.body.data.continuous).toBe(false);
    const { estimate } = res.body.data;
    expect(estimate.totalActions).toBe(2);
    expect(estimate.perNode.map((n) => [String(n.nodeId), n.channel, n.recipients, n.actions])).toEqual([
      [String(personal), 'zalo_personal', 2, 2],
    ]);
    expect(new Date(estimate.finishAtLatest).getTime()).toBeGreaterThanOrEqual(new Date(estimate.startAt).getTime());
    expect(Array.isArray(estimate.warnings)).toBe(true);
  });

  it('lượt của chủ khác → 404 (không lộ ước tính của người khác)', async () => {
    const owner = await createUser({ username: 'chugiamsat2', role: 'user' });
    const stranger = await createUser({ username: 'nguoila', role: 'user' });
    const { runId } = await seedRun(owner);

    const res = await getEstimate(stranger, runId);

    expect(res.status).toBe(404);
  });

  it('lượt completed → estimate null; lượt chạy liên tục → continuous true, estimate null', async () => {
    const owner = await createUser({ username: 'chugiamsat3', role: 'user' });
    const { runId } = await seedRun(owner, { status: 'completed' });
    const done = await getEstimate(owner, runId);
    expect(done.status).toBe(200);
    expect(done.body.data).toEqual({ runId, continuous: false, estimate: null });

    const owner2 = await createUser({ username: 'chugiamsat4', role: 'user' });
    const cont = await seedRun(owner2, { metadata: { continuousMode: true } });
    const res = await getEstimate(owner2, cont.runId);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ runId: cont.runId, continuous: true, estimate: null });
  });

  it('lượt không tồn tại → 404; runId rác → 400', async () => {
    const owner = await createUser({ username: 'chugiamsat5', role: 'user' });
    expect((await getEstimate(owner, 999999)).status).toBe(404);
    expect((await getEstimate(owner, 'abc')).status).toBe(400);
  });
});
