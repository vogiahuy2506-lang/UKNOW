/**
 * Integration tests cho `/api/campaigns`.
 *
 * Phạm vi (cover layer business + persistence):
 *   - Authorization (token).
 *   - GET / — filter (status/type/search), pagination, running_count/completed_count
 *     từ LATERAL join, tenant isolation, admin global view.
 *   - GET /:id — detail kèm nodes + connections, isolation.
 *   - POST / — create + nodes + connections + flow_json trong 1 transaction,
 *     validator (`campaignName`, `campaignType` enum), resource limit
 *     `max_campaigns`, rollback khi insert lỗi.
 *   - PUT /:id — partial update (COALESCE), replace nodes/connections,
 *     chặn (409) khi có run đang `running`, isolation.
 *   - DELETE /:id — xoá theo CASCADE, isolation.
 *   - POST /:id/publish — chỉ chuyển status draft/paused → active.
 *   - POST /:id/pause   — chỉ chuyển active → paused.
 *   - POST /:id/duplicate — clone đầy đủ nodes + connections (id_map đúng), status='draft'.
 *   - POST /:id/run — validation + tạo campaign_runs row. Mock `executeCampaign`
 *     (background job 6000+ dòng đụng BullMQ/email/zalo senders — không cover ở đây).
 *
 * KHÔNG cover:
 *   - executeCampaign / sender flow / continuous run loop.
 *   - sync-uknow (cần mock WooCommerce API).
 *   - upload attachments khi delete campaign.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import campaignRunService from '../../src/services/campaign/campaignRun.service.js';
import {
  truncateAll,
  createUser,
  createPlan,
  assignPlanToUser,
} from './helpers/db.js';

let app;
let executeCampaignSpy;

beforeAll(() => {
  app = createApp();
  // Patch executeCampaign trên singleton — controller gọi qua reference này.
  // Background job có 6000+ dòng đụng BullMQ + email/zalo senders, ngoài scope test này.
  executeCampaignSpy = jest
    .spyOn(campaignRunService, 'executeCampaign')
    .mockResolvedValue();
});

beforeEach(async () => {
  await truncateAll();
  executeCampaignSpy.mockClear();
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

/**
 * Tạo campaign trực tiếp vào DB. Trả về row.
 */
async function insertCampaign({
  ownerId,
  campaignName = `C ${Date.now()}`,
  description = null,
  campaignType = 'email',
  status = 'draft',
  flowJson = null,
  landingPageUrl = null,
  timezone = 'Asia/Ho_Chi_Minh',
  createdAt = null,
}) {
  const params = [ownerId, campaignName, description, campaignType, status, flowJson ? JSON.stringify(flowJson) : null, landingPageUrl, timezone];
  if (createdAt) {
    params.push(createdAt);
    const { rows } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, description, campaign_type, status, flow_json, landing_page_url, timezone, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      params
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, description, campaign_type, status, flow_json, landing_page_url, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    params
  );
  return rows[0];
}

async function insertNode({
  campaignId,
  nodeType = 'action',
  nodeSubtype = 'send_email',
  nodeName = 'Node',
  config = {},
  executionOrder = 1,
}) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [campaignId, nodeType, nodeSubtype, nodeName, JSON.stringify(config), executionOrder]
  );
  return rows[0];
}

async function insertRun({ campaignId, status = 'running', runType = 'manual' }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, run_type) VALUES ($1, $2, $3) RETURNING *`,
    [campaignId, status, runType]
  );
  return rows[0];
}

// ===========================================================================
// AUTHORIZATION
// ===========================================================================

describe('Authorization — /api/campaigns', () => {
  it('không token → 401 cho mọi route', async () => {
    const responses = await Promise.all([
      request(app).get('/api/campaigns'),
      request(app).get('/api/campaigns/1'),
      request(app).post('/api/campaigns').send({}),
      request(app).put('/api/campaigns/1').send({}),
      request(app).delete('/api/campaigns/1'),
      request(app).post('/api/campaigns/1/publish'),
      request(app).post('/api/campaigns/1/pause'),
      request(app).post('/api/campaigns/1/run').send({}),
      request(app).post('/api/campaigns/1/duplicate').send({}),
    ]);
    responses.forEach((r) => expect(r.status).toBe(401));
  });
});

// ===========================================================================
// GET /api/campaigns (list)
// ===========================================================================

describe('GET /api/campaigns', () => {
  it('owner chỉ thấy campaign của chính mình', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    await insertCampaign({ ownerId: a.id, campaignName: 'A1' });
    await insertCampaign({ ownerId: a.id, campaignName: 'A2' });
    await insertCampaign({ ownerId: b.id, campaignName: 'B1' });

    const t = await loginAs(a);
    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((x) => x.campaignName).sort()).toEqual(['A1', 'A2']);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('admin (role=admin) thấy campaign của tất cả user', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    await insertCampaign({ ownerId: a.id, campaignName: 'A1' });
    await insertCampaign({ ownerId: b.id, campaignName: 'B1' });

    const t = await loginAs(admin);
    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items.map((x) => x.campaignName).sort()).toEqual(['A1', 'B1']);
  });

  it('filter status=active', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    await insertCampaign({ ownerId: o.id, campaignName: 'draft1', status: 'draft' });
    await insertCampaign({ ownerId: o.id, campaignName: 'active1', status: 'active' });
    await insertCampaign({ ownerId: o.id, campaignName: 'active2', status: 'active' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/campaigns?status=active')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items.map((x) => x.campaignName).sort()).toEqual(['active1', 'active2']);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('filter type=zalo', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    await insertCampaign({ ownerId: o.id, campaignName: 'em', campaignType: 'email' });
    await insertCampaign({ ownerId: o.id, campaignName: 'zl', campaignType: 'zalo' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/campaigns?type=zalo')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].campaignName).toBe('zl');
  });

  it('search ILIKE campaign_name', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    await insertCampaign({ ownerId: o.id, campaignName: 'Welcome flow' });
    await insertCampaign({ ownerId: o.id, campaignName: 'Black Friday Sale' });
    await insertCampaign({ ownerId: o.id, campaignName: 'Welcome back' });

    const t = await loginAs(o);
    const res = await request(app)
      .get('/api/campaigns?search=welcome')
      .set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items.every((x) => x.campaignName.toLowerCase().includes('welcome'))).toBe(true);
  });

  it('pagination — limit=2 + page=2', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    for (let i = 0; i < 5; i += 1) {
      await insertCampaign({ ownerId: o.id, campaignName: `C${i}` });
    }
    const t = await loginAs(o);
    const p2 = await request(app)
      .get('/api/campaigns?limit=2&page=2')
      .set('Authorization', `Bearer ${t}`);

    expect(p2.body.data.items).toHaveLength(2);
    expect(p2.body.data.pagination.total).toBe(5);
    expect(p2.body.data.pagination.totalPages).toBe(3);
  });

  it('running_count + completed_count tính đúng từ campaign_runs', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });
    await insertRun({ campaignId: c.id, status: 'running' });
    await insertRun({ campaignId: c.id, status: 'completed' });
    await insertRun({ campaignId: c.id, status: 'completed' });
    await insertRun({ campaignId: c.id, status: 'failed' }); // không tính

    const t = await loginAs(o);
    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${t}`);

    const item = res.body.data.items[0];
    expect(item.runningCount).toBe(1);
    expect(item.completedCount).toBe(2);
  });

  it('sort created_at DESC', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    await insertCampaign({ ownerId: o.id, campaignName: 'old', createdAt: new Date('2024-01-01') });
    await insertCampaign({ ownerId: o.id, campaignName: 'new', createdAt: new Date('2025-01-01') });
    const t = await loginAs(o);
    const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${t}`);

    expect(res.body.data.items[0].campaignName).toBe('new');
    expect(res.body.data.items[1].campaignName).toBe('old');
  });
});

// ===========================================================================
// GET /api/campaigns/:id (detail)
// ===========================================================================

describe('GET /api/campaigns/:id', () => {
  it('trả về detail kèm nodes + connections theo execution_order', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({
      ownerId: o.id,
      campaignName: 'C1',
      description: 'desc',
      flowJson: { nodes: [{ id: 'n1' }] },
    });
    const n1 = await insertNode({ campaignId: c.id, nodeName: 'first', executionOrder: 1 });
    const n2 = await insertNode({ campaignId: c.id, nodeName: 'second', executionOrder: 2 });
    await db.query(
      `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id, connection_type)
       VALUES ($1, $2, $3, 'default')`,
      [c.id, n1.id, n2.id]
    );

    const t = await loginAs(o);
    const res = await request(app).get(`/api/campaigns/${c.id}`).set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      campaignName: 'C1',
      description: 'desc',
      campaignType: 'email',
    });
    expect(res.body.data.flowJson).toEqual({ nodes: [{ id: 'n1' }] });
    expect(res.body.data.nodes).toHaveLength(2);
    expect(res.body.data.nodes[0].nodeName).toBe('first');
    expect(res.body.data.nodes[1].nodeName).toBe('second');
    expect(res.body.data.connections).toHaveLength(1);
    expect(Number(res.body.data.connections[0].sourceNodeId)).toBe(Number(n1.id));
    expect(Number(res.body.data.connections[0].targetNodeId)).toBe(Number(n2.id));
  });

  it('user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const c = await insertCampaign({ ownerId: a.id });

    const t = await loginAs(b);
    const res = await request(app).get(`/api/campaigns/${c.id}`).set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('id không tồn tại → 404', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(o);
    const res = await request(app).get('/api/campaigns/999999').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('admin xem được campaign của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, campaignName: 'others' });

    const t = await loginAs(admin);
    const res = await request(app).get(`/api/campaigns/${c.id}`).set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data.campaignName).toBe('others');
  });
});

// ===========================================================================
// POST /api/campaigns (create)
// ===========================================================================

describe('POST /api/campaigns', () => {
  it('tạo campaign + nodes + connections trong 1 transaction', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(o);

    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignName: 'Onboard',
        description: 'On boarding',
        campaignType: 'email',
        landingPageUrl: 'https://uknow.vn/onboard',
        flowJson: { foo: 'bar' },
        nodes: [
          { tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'data', nodeName: 'Start', positionX: 0, positionY: 0, config: {} },
          { tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Send', positionX: 100, positionY: 0, config: { subject: 'Hi' } },
        ],
        connections: [{ sourceNodeId: 'n1', targetNodeId: 'n2', connectionType: 'default' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      campaignName: 'Onboard',
      campaignType: 'email',
      status: 'draft',
    });

    const { rows: nodes } = await db.query(
      'SELECT node_name, execution_order FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order',
      [res.body.data.id]
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0].node_name).toBe('Start');
    expect(nodes[1].node_name).toBe('Send');

    const { rows: conns } = await db.query(
      'SELECT source_node_id, target_node_id FROM campaign_connections WHERE id_campaign = $1',
      [res.body.data.id]
    );
    expect(conns).toHaveLength(1);
  });

  it('thiếu campaignName → 400 (validator)', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignType: 'email' });
    expect(res.status).toBe(400);
  });

  it('campaignType ngoài enum → 400', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'X', campaignType: 'sms' });
    expect(res.status).toBe(400);
  });

  it('vượt max_campaigns trong plan → 400', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const plan = await createPlan({ code: 'starter' });
    await assignPlanToUser(o.id, plan.id);
    await db.query('UPDATE users SET max_campaigns = 1 WHERE id = $1', [o.id]);
    await insertCampaign({ ownerId: o.id });

    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'second', campaignType: 'email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/giới hạn|tối đa|đã đạt/i);
  });

  it('connection có sourceNodeId/targetNodeId không khớp tempId → bị skip (không tạo)', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(o);

    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${t}`)
      .send({
        campaignName: 'Skip Conn',
        campaignType: 'email',
        nodes: [
          { tempId: 'n1', nodeType: 'trigger', nodeName: 'A' },
        ],
        connections: [
          { sourceNodeId: 'n1', targetNodeId: 'missing', connectionType: 'default' },
          { sourceNodeId: 'missing', targetNodeId: 'n1', connectionType: 'default' },
        ],
      });

    expect(res.status).toBe(201);

    const { rows } = await db.query(
      'SELECT COUNT(*) FROM campaign_connections WHERE id_campaign = $1',
      [res.body.data.id]
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it('lưu flowJson nguyên vẹn (JSONB)', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(o);
    const payload = { nodes: [{ id: 'a', config: { x: 1 } }], edges: [] };

    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'F', campaignType: 'email', flowJson: payload });

    expect(res.status).toBe(201);

    const { rows } = await db.query('SELECT flow_json FROM campaigns WHERE id = $1', [res.body.data.id]);
    expect(rows[0].flow_json).toEqual(payload);
  });
});

// ===========================================================================
// PUT /api/campaigns/:id (update)
// ===========================================================================

describe('PUT /api/campaigns/:id', () => {
  it('partial update — chỉ field gửi mới đổi (COALESCE)', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({
      ownerId: o.id,
      campaignName: 'Original',
      description: 'old desc',
      campaignType: 'email',
    });

    const t = await loginAs(o);
    const res = await request(app)
      .put(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.data.campaignName).toBe('Renamed');

    const { rows } = await db.query('SELECT * FROM campaigns WHERE id = $1', [c.id]);
    expect(rows[0].description).toBe('old desc');
  });

  it('replace nodes + connections khi gửi nodes', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id });
    const oldN = await insertNode({ campaignId: c.id, nodeName: 'old' });
    await db.query(
      `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id, connection_type)
       VALUES ($1, $2, $2, 'default')`,
      [c.id, oldN.id]
    );

    const t = await loginAs(o);
    const res = await request(app)
      .put(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({
        nodes: [
          { tempId: 'a', nodeType: 'trigger', nodeName: 'fresh-A' },
          { tempId: 'b', nodeType: 'action', nodeName: 'fresh-B' },
        ],
        connections: [{ sourceNodeId: 'a', targetNodeId: 'b' }],
      });

    expect(res.status).toBe(200);

    const { rows: nodes } = await db.query(
      'SELECT node_name FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id',
      [c.id]
    );
    expect(nodes.map((x) => x.node_name).sort()).toEqual(['fresh-A', 'fresh-B']);

    const { rows: conns } = await db.query(
      'SELECT COUNT(*) FROM campaign_connections WHERE id_campaign = $1',
      [c.id]
    );
    expect(Number(conns[0].count)).toBe(1);
  });

  it('chặn (409) khi có campaign_run đang running và là content update', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });
    await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(o);
    const res = await request(app)
      .put(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'try-rename' });

    expect(res.status).toBe(409);
    const { rows } = await db.query('SELECT campaign_name FROM campaigns WHERE id = $1', [c.id]);
    expect(rows[0].campaign_name).not.toBe('try-rename');
  });

  it('status-only update KHÔNG bị chặn dù có run running', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });
    await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(o);
    const res = await request(app)
      .put(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ status: 'paused' });

    expect(res.status).toBe(200);
  });

  it('user khác không update được → 404', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const c = await insertCampaign({ ownerId: a.id });

    const t = await loginAs(b);
    const res = await request(app)
      .put(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'hijack' });
    expect(res.status).toBe(404);
  });

  it('admin update được campaign của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, campaignName: 'org' });

    const t = await loginAs(admin);
    const res = await request(app)
      .put(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'by-admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.campaignName).toBe('by-admin');
  });
});

// ===========================================================================
// DELETE /api/campaigns/:id
// ===========================================================================

describe('DELETE /api/campaigns/:id', () => {
  it('owner xóa được, nodes + connections + runs xoá theo CASCADE', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id });
    const n = await insertNode({ campaignId: c.id });
    await db.query(
      `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id) VALUES ($1, $2, $2)`,
      [c.id, n.id]
    );
    await insertRun({ campaignId: c.id, status: 'completed' });

    const t = await loginAs(o);
    const res = await request(app)
      .delete(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);

    const counts = await Promise.all([
      db.query('SELECT COUNT(*) FROM campaigns WHERE id = $1', [c.id]),
      db.query('SELECT COUNT(*) FROM campaign_nodes WHERE id_campaign = $1', [c.id]),
      db.query('SELECT COUNT(*) FROM campaign_connections WHERE id_campaign = $1', [c.id]),
      db.query('SELECT COUNT(*) FROM campaign_runs WHERE id_campaign = $1', [c.id]),
    ]);
    counts.forEach(({ rows }) => expect(Number(rows[0].count)).toBe(0));
  });

  it('user khác → 404 + DB không đổi', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const c = await insertCampaign({ ownerId: a.id });

    const t = await loginAs(b);
    const res = await request(app)
      .delete(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);

    const { rows } = await db.query('SELECT id FROM campaigns WHERE id = $1', [c.id]);
    expect(rows).toHaveLength(1);
  });

  it('admin xóa được campaign của user khác', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id });

    const t = await loginAs(admin);
    const res = await request(app)
      .delete(`/api/campaigns/${c.id}`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// POST /api/campaigns/:id/publish + pause
// ===========================================================================

describe('POST /api/campaigns/:id/publish + /pause', () => {
  it('publish: draft → active + set published_at', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'draft' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/publish`)
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');

    const { rows } = await db.query('SELECT status, published_at FROM campaigns WHERE id = $1', [c.id]);
    expect(rows[0].status).toBe('active');
    expect(rows[0].published_at).toBeTruthy();
  });

  it('publish: paused → active', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'paused' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/publish`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('publish: active → 404 (đã active, query không match)', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/publish`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('pause: active → paused', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/pause`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paused');
  });

  it('pause: draft → 404 (chỉ active mới pause được)', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'draft' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/pause`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('publish/pause của user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const c = await insertCampaign({ ownerId: a.id, status: 'draft' });

    const t = await loginAs(b);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/publish`)
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/campaigns/:id/duplicate
// ===========================================================================

describe('POST /api/campaigns/:id/duplicate', () => {
  it('clone đầy đủ nodes + connections, status reset về draft', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active', campaignName: 'Source' });
    const n1 = await insertNode({ campaignId: c.id, nodeName: 'first', executionOrder: 1 });
    const n2 = await insertNode({ campaignId: c.id, nodeName: 'second', executionOrder: 2 });
    await db.query(
      `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id) VALUES ($1, $2, $3)`,
      [c.id, n1.id, n2.id]
    );

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/duplicate`)
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'Cloned' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ campaignName: 'Cloned', status: 'draft' });

    const newId = res.body.data.id;
    expect(Number(newId)).not.toBe(Number(c.id));

    const { rows: nodes } = await db.query(
      'SELECT node_name FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order',
      [newId]
    );
    expect(nodes.map((x) => x.node_name)).toEqual(['first', 'second']);

    const { rows: conns } = await db.query(
      'SELECT COUNT(*) FROM campaign_connections WHERE id_campaign = $1',
      [newId]
    );
    expect(Number(conns[0].count)).toBe(1);
  });

  it('thiếu campaignName → 400 (validator)', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id });
    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/duplicate`)
      .set('Authorization', `Bearer ${t}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('vượt max_campaigns khi duplicate → 400', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const plan = await createPlan({ code: 'p' });
    await assignPlanToUser(o.id, plan.id);
    await db.query('UPDATE users SET max_campaigns = 1 WHERE id = $1', [o.id]);
    const c = await insertCampaign({ ownerId: o.id });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/duplicate`)
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'new-c' });
    expect(res.status).toBe(400);
  });

  it('campaign của user khác → 404', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const c = await insertCampaign({ ownerId: a.id });

    const t = await loginAs(b);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/duplicate`)
      .set('Authorization', `Bearer ${t}`)
      .send({ campaignName: 'x' });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/campaigns/:id/run
// ===========================================================================

describe('POST /api/campaigns/:id/run', () => {
  it('source thiếu hoặc sai → 400', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });
    const t = await loginAs(o);

    const r1 = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({});
    expect(r1.status).toBe(400);

    const r2 = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'cron' });
    expect(r2.status).toBe(400);
  });

  it('campaign không tồn tại → 404', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const t = await loginAs(o);
    const res = await request(app)
      .post('/api/campaigns/999999/run')
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'campaign_run' });
    expect(res.status).toBe(404);
  });

  it('campaign status != active → 400', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'draft' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'campaign_run' });
    expect(res.status).toBe(400);
  });

  it('đã có run đang running → 409', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });
    await insertRun({ campaignId: c.id, status: 'running' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'campaign_run' });
    expect(res.status).toBe(409);
  });

  it('source=campaign_run → tạo campaign_runs row run_type=manual, gọi executeCampaign', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active', campaignName: 'Live' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'campaign_run', runName: 'Lần 1' });

    expect(res.status).toBe(200);
    // Controller `parseInt(req.params.id, 10)` → campaignId là number trong response,
    // còn `c.id` từ helper insert là BIGINT string. So bằng Number() cho ổn định.
    expect(Number(res.body.data.campaignId)).toBe(Number(c.id));
    expect(res.body.data).toMatchObject({ runName: 'Lần 1', status: 'running' });

    const { rows } = await db.query(
      'SELECT run_type, status, run_name FROM campaign_runs WHERE id_campaign = $1',
      [c.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].run_type).toBe('manual');
    expect(rows[0].status).toBe('running');
    expect(rows[0].run_name).toBe('Lần 1');

    // executeCampaign được fire-and-forget. campaignId là number (parseInt trong controller),
    // runId là BIGINT string từ pg (không cast).
    expect(executeCampaignSpy).toHaveBeenCalledTimes(1);
    const callArgs = executeCampaignSpy.mock.calls[0];
    expect(Number(callArgs[0])).toBe(Number(c.id));
    expect(Number(callArgs[1])).toBe(Number(res.body.data.runId));
    expect(Number(callArgs[2])).toBe(Number(o.id));
    expect(callArgs[3]).toBe('user');
  });

  it('source=schedule → run_type=scheduled', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'schedule', scheduleId: 1 });

    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT run_type FROM campaign_runs WHERE id = $1', [
      res.body.data.runId,
    ]);
    expect(rows[0].run_type).toBe('scheduled');
  });

  it('continueRunId yêu cầu source=campaign_run + continuousMode=true → các combo khác bị 400', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });

    const t = await loginAs(o);

    // continueRunId với source=schedule → 400
    const r1 = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'schedule', continueRunId: 1 });
    expect(r1.status).toBe(400);

    // continueRunId không có continuousMode → 400
    const r2 = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'campaign_run', continueRunId: 1 });
    expect(r2.status).toBe(400);
  });

  it('campaign của user khác → 404 (không leak qua executeCampaign)', async () => {
    const a = await createUser({ role: 'user', username: 'oa' });
    const b = await createUser({ role: 'user', username: 'ob' });
    const c = await insertCampaign({ ownerId: a.id, status: 'active' });

    const t = await loginAs(b);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'campaign_run' });
    expect(res.status).toBe(404);
    expect(executeCampaignSpy).not.toHaveBeenCalled();
  });

  it('adjacentZaloNodeDelayMs được ghi vào run_metadata', async () => {
    const o = await createUser({ role: 'user', username: 'o1' });
    const c = await insertCampaign({ ownerId: o.id, status: 'active' });

    const t = await loginAs(o);
    const res = await request(app)
      .post(`/api/campaigns/${c.id}/run`)
      .set('Authorization', `Bearer ${t}`)
      .send({ source: 'campaign_run', adjacentZaloNodeDelayMs: 3000 });

    expect(res.status).toBe(200);
    const { rows } = await db.query(
      'SELECT run_metadata FROM campaign_runs WHERE id = $1',
      [res.body.data.runId]
    );
    expect(rows[0].run_metadata).toMatchObject({
      adjacentZaloNodeDelayMs: 3000,
      source: 'campaign_run',
    });
  });
});
