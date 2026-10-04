/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — chiến dịch / Gửi nhanh / trợ lý AI / Studio / giám sát gửi tin dùng tài khoản
 * Zalo ĐƯỢC GIAO (CSDL thật, HTTP thật). SQL của bốn hàm repo trợ lý, `getRunForExecution`, danh sách Studio và truy vấn tín hiệu
 * giám sát được chạy trên Postgres thật — mock trọn DB từng để lọt SQL sai tên cột. Mọi nhóm có ca "chủ thấy hết".
 *
 * Engine chạy nền: chỉ ca BỊ CHẶN được chạy thật (dừng ngay đầu lượt, trước mọi lần gửi) — ca qua cổng đi vào pipeline gửi và
 * phụ thuộc giờ yên lặng 23h–6h nên để spec đơn vị (campaignRunZaloAccountAssignment) giữ đồng hồ cố định.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// Báo chủ qua email khi run hỏng là fire-and-forget; không gửi thật trong test.
const realNotify = await import('../../src/utils/campaignQuotaPauseNotify.util.js');
jest.unstable_mockModule('../../src/utils/campaignQuotaPauseNotify.util.js', () => ({
  ...realNotify,
  notifyCampaignRunFailed: jest.fn().mockResolvedValue(undefined),
}));

const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const aiCampaignRepository = (await import('../../src/repositories/ai/aiCampaign.repository.js')).default;
const aiCampaignDraftRepository = (await import('../../src/repositories/ai/aiCampaignDraft.repository.js')).default;
const chatbotZaloAccountRepository = (await import('../../src/repositories/chatbot/chatbotZaloAccount.repository.js')).default;
const campaignRunRepository = (await import('../../src/repositories/campaign/campaignRun.repository.js')).default;
const { buildZaloSilentDropHourlySql } = await import('../../src/utils/deliveryMonitorSignals.util.js');
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
let executeSpy;
let realExecuteCampaign;

beforeAll(() => {
  app = createApp();
  realExecuteCampaign = campaignRunService.executeCampaign.bind(campaignRunService);
  executeSpy = jest.spyOn(campaignRunService, 'executeCampaign').mockResolvedValue();
});

afterAll(() => {
  executeSpy.mockRestore();
});

beforeEach(async () => {
  await truncateAll();
  executeSpy.mockClear();
});

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login thất bại cho ${user.username}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

const EMPLOYEE_PERMISSIONS = {
  campaigns_view: true,
  campaigns_create: true,
  campaigns_run: true,
  zalo_settings: true,
  chatbot_channels_manage: true,
  ai_assistant_use: true,
};

async function addMembership(ownerId, employeeId, permissions = EMPLOYEE_PERMISSIONS) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin, accepted_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', 'created', NOW(), NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

async function createZalo(ownerId, name, { status = 'connected', isDefault = false } = {}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active, is_default)
     VALUES ($1, $2, $3, TRUE, $4) RETURNING id`,
    [ownerId, name, status, isDefault]
  );
  return Number(rows[0].id);
}

async function assign(ownerId, employeeId, accountId) {
  await db.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
     VALUES ($1, $2, 'zalo_personal', $3, 'assigned')`,
    [ownerId, employeeId, String(accountId)]
  );
}

async function insertCampaign({ ownerId, createdBy = ownerId, idUser = createdBy, status = 'active', type = 'zalo', name = `C ${Date.now()}${Math.random()}` }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [idUser, ownerId, createdBy, name, type, status]
  );
  return Number(rows[0].id);
}

async function insertNode(campaignId, subtype, config, order = 1) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', $2, $2, $3::jsonb, $4) RETURNING id`,
    [campaignId, subtype, JSON.stringify(config), order]
  );
  return Number(rows[0].id);
}

/** Một chủ có 3 tài khoản Zalo đang kết nối; nhân viên chỉ được giao `a`. */
async function setup() {
  const owner = await createUser({ username: 'chu_g3', role: 'user' });
  const employee = await createUser({ username: 'nv_g3', role: 'user' });
  await addMembership(owner.id, employee.id);
  const a = await createZalo(owner.id, 'Nick A', { isDefault: true });
  const b = await createZalo(owner.id, 'Nick B');
  const c = await createZalo(owner.id, 'Nick C');
  await assign(owner.id, employee.id, a);
  return { owner, employee, a, b, c, ownerToken: await loginAs(owner), employeeToken: await loginAs(employee) };
}

const asEmployee = (req, token, ownerId) => req.set('Authorization', `Bearer ${token}`).set('X-Owner-Context', String(ownerId));
const asOwner = (req, token) => req.set('Authorization', `Bearer ${token}`);

const zaloNodes = (accountId) => [
  { tempId: 'n1', nodeType: 'action', nodeSubtype: 'select_zalo_account', nodeName: 'Chọn', config: { zaloAccountId: accountId } },
  { tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_zalo_personal', nodeName: 'Gửi', config: { zaloAccountId: accountId } },
];

describe('preview Zalo (HTTP) — tài khoản được giao', () => {
  it('GET /api/zalo/preview/friends: nhân viên chưa giao → 403 + code; đã giao → qua cổng (lỗi khác 403); chủ → qua cổng', async () => {
    const { owner, employee, a, b, ownerToken, employeeToken } = await setup();
    expect(employee.id).toBeTruthy();

    const denied = await asEmployee(request(app).get('/api/zalo/preview/friends').query({ accountId: b }), employeeToken, owner.id);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });

    const allowed = await asEmployee(request(app).get('/api/zalo/preview/friends').query({ accountId: a }), employeeToken, owner.id);
    expect(allowed.status).not.toBe(403);

    const ownerRes = await asOwner(request(app).get('/api/zalo/preview/groups').query({ accountId: b }), ownerToken);
    expect(ownerRes.status).not.toBe(403);
  });

  it('POST /api/zalo/preview/send-personal | send-group | send-friend-request: nhân viên chưa giao → 403', async () => {
    const { owner, b, employeeToken } = await setup();
    const personal = await asEmployee(
      request(app).post('/api/zalo/preview/send-personal').send({ accountId: b, recipients: ['0900000001'], message: 'hi' }),
      employeeToken, owner.id
    );
    expect(personal.status).toBe(403);
    expect(personal.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    const group = await asEmployee(
      request(app).post('/api/zalo/preview/send-group').send({ accountId: b, groupIds: ['g1'], message: 'hi' }),
      employeeToken, owner.id
    );
    expect(group.status).toBe(403);
    const friend = await asEmployee(
      request(app).post('/api/zalo/preview/send-friend-request').send({ accountId: b, recipients: ['0900000001'], message: 'hi' }),
      employeeToken, owner.id
    );
    expect(friend.status).toBe(403);
    const { rows } = await db.query('SELECT 1 FROM zalo_messages');
    expect(rows).toHaveLength(0);
  });

  it('POST /api/campaigns/quick-send/test-send (kênh Zalo): nhân viên chưa giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED', async () => {
    const { owner, b, employeeToken } = await setup();
    const res = await asEmployee(
      request(app).post('/api/campaigns/quick-send/test-send').send({ channel: 'zalo_personal', recipient: '0900000001', message: 'hi', accountId: b }),
      employeeToken, owner.id
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
  });
});

describe('lưu / sửa / nhân bản chiến dịch (HTTP)', () => {
  it('POST /api/campaigns: nhân viên dùng tài khoản chưa giao → 403, không có hàng chiến dịch; được giao → 201; chủ dùng tài khoản bất kỳ → 201', async () => {
    const { owner, a, b, employeeToken, ownerToken } = await setup();

    const denied = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'NV chưa giao', campaignType: 'zalo', nodes: zaloNodes(b), connections: [],
    }), employeeToken, owner.id);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    const { rows: none } = await db.query(`SELECT id FROM campaigns WHERE campaign_name = 'NV chưa giao'`);
    expect(none).toHaveLength(0);

    const ok = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'NV được giao', campaignType: 'zalo', nodes: zaloNodes(a), connections: [],
    }), employeeToken, owner.id);
    expect(ok.status).toBe(201);

    const ownerRes = await asOwner(request(app).post('/api/campaigns').send({
      campaignName: 'Chủ dùng B', campaignType: 'zalo', nodes: zaloNodes(b), connections: [],
    }), ownerToken);
    expect(ownerRes.status).toBe(201);
  });

  it('node get_all_friends mang tài khoản chưa giao cũng bị chặn; id sót lại khi pool tắt cũng bị chặn', async () => {
    const { owner, a, b, employeeToken } = await setup();
    const getAll = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'get_all', campaignType: 'zalo',
      nodes: [
        ...zaloNodes(a),
        { tempId: 'n3', nodeType: 'data', nodeSubtype: 'get_all_friends', nodeName: 'Bạn bè', config: { zaloAccountId: b } },
      ],
      connections: [],
    }), employeeToken, owner.id);
    expect(getAll.status).toBe(403);

    const stalePool = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'pool tắt', campaignType: 'zalo',
      nodes: [{ tempId: 'n1', nodeType: 'action', nodeSubtype: 'select_zalo_account', nodeName: 'Chọn', config: { zaloAccountId: a, zaloPoolMultiAccountEnabled: false, zaloPoolAccountIds: [b] } }],
      connections: [],
    }), employeeToken, owner.id);
    expect(stalePool.status).toBe(403);
  });

  it('PUT /api/campaigns/:id: nhân viên thay node bằng tài khoản chưa giao → 403 và node cũ còn nguyên', async () => {
    const { owner, employee, a, b, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, createdBy: employee.id, status: 'draft' });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: a });

    const res = await asEmployee(request(app).put(`/api/campaigns/${campaignId}`).send({
      nodes: zaloNodes(b), connections: [],
    }), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    const { rows } = await db.query('SELECT config FROM campaign_nodes WHERE id_campaign = $1', [campaignId]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].config.zaloAccountId)).toBe(a);
  });

  it('POST /api/campaigns/:id/duplicate: nhân viên nhân bản chiến dịch có tài khoản chưa giao → 403, không có bản sao; chủ nhân bản được', async () => {
    const { owner, b, employeeToken, ownerToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, name: 'Gốc', status: 'draft' });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: b });

    const denied = await asEmployee(request(app).post(`/api/campaigns/${campaignId}/duplicate`).send({ campaignName: 'Bản sao NV' }), employeeToken, owner.id);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    const { rows: copies } = await db.query(`SELECT id FROM campaigns WHERE campaign_name = 'Bản sao NV'`);
    expect(copies).toHaveLength(0);

    const ownerRes = await asOwner(request(app).post(`/api/campaigns/${campaignId}/duplicate`).send({ campaignName: 'Bản sao chủ' }), ownerToken);
    expect(ownerRes.status).toBe(201);
  });
});

describe('chạy chiến dịch (HTTP) — preflight theo người bấm chạy + người tạo', () => {
  it('nhân viên bấm chạy chiến dịch của CHỦ dùng tài khoản chưa giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, không có run, không gọi engine', async () => {
    const { owner, b, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: b });

    const res = await asEmployee(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(res.body.message).toMatch(/Tài khoản Zalo "Nick B" chưa được giao cho nhân viên/);
    const { rows } = await db.query('SELECT id FROM campaign_runs WHERE id_campaign = $1', [campaignId]);
    expect(rows).toHaveLength(0);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('nhân viên bấm chạy khi mọi tài khoản đã giao → chạy, run ghi triggered_by = nhân viên', async () => {
    const { owner, employee, a, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: a });

    const res = await asEmployee(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), employeeToken, owner.id);
    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT triggered_by, run_metadata FROM campaign_runs WHERE id_campaign = $1', [campaignId]);
    expect(Number(rows[0].triggered_by)).toBe(Number(employee.id));
    expect(Number(rows[0].run_metadata.triggeredBy)).toBe(Number(employee.id));
  });

  it('CHỦ chạy chiến dịch của chủ dùng tài khoản bất kỳ → chạy, không đọc việc giao', async () => {
    const { owner, b, ownerToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: b });
    const res = await asOwner(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), ownerToken);
    expect(res.status).toBe(200);
  });

  it('CHỦ bấm chạy chiến dịch do NHÂN VIÊN tạo mà nhân viên đã bị gỡ tài khoản → 403 (kiểm theo người tạo)', async () => {
    const { owner, employee, a, ownerToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, createdBy: employee.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: a });
    await db.query('DELETE FROM member_channel_accounts WHERE employee_id = $1', [employee.id]);

    const res = await asOwner(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), ownerToken);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
  });

  it('bật lịch (POST /api/campaign-schedules): nhân viên + tài khoản chưa giao → 403, không tạo lịch', async () => {
    const { owner, b, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: b });

    const res = await asEmployee(request(app).post('/api/campaign-schedules').send({
      campaignId, scheduleName: 'Lịch NV', scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true,
    }), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    const { rows } = await db.query('SELECT id FROM campaign_schedules WHERE id_campaign = $1', [campaignId]);
    expect(rows).toHaveLength(0);
  });
});

describe('engine chạy nền (CSDL thật) — dừng ngay đầu lượt, không gửi tin', () => {
  async function createRun({ campaignId, ownerId, triggeredBy = null, scheduleId = null, source = 'campaign_run' }) {
    const { rows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, id_schedule, run_type, status, started_at, run_metadata, triggered_by)
       VALUES ($1, $2, $3, $4, 'running', NOW(), $5::jsonb, $6) RETURNING id`,
      [campaignId, ownerId, scheduleId, scheduleId ? 'scheduled' : 'manual', JSON.stringify({ source, ...(triggeredBy ? { triggeredBy } : {}) }), triggeredBy]
    );
    return Number(rows[0].id);
  }

  it('chiến dịch do NHÂN VIÊN tạo, tài khoản chưa giao (chủ bấm chạy) → run failed kèm lý do rõ, không có tin nào', async () => {
    const { owner, employee, b } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, createdBy: employee.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: b });
    const runId = await createRun({ campaignId, ownerId: owner.id, triggeredBy: owner.id });

    await realExecuteCampaign(campaignId, runId, owner.id);

    const { rows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message).toMatch(/Tài khoản Zalo "Nick B" chưa được giao cho nhân viên/);
    const { rows: messages } = await db.query('SELECT id FROM zalo_messages');
    expect(messages).toHaveLength(0);
  });

  it('chiến dịch của CHỦ nhưng NHÂN VIÊN bấm chạy và chưa được giao → run failed', async () => {
    const { owner, employee, b } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: b });
    const runId = await createRun({ campaignId, ownerId: owner.id, triggeredBy: employee.id });

    await realExecuteCampaign(campaignId, runId, owner.id);

    const { rows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message).toMatch(/chưa được giao cho nhân viên/);
  });

  it('LỊCH do nhân viên tạo (run lịch không có cột triggered_by) và chưa được giao → run failed theo created_by của lịch', async () => {
    const { owner, employee, b } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: b });
    const { rows: sched } = await db.query(
      `INSERT INTO campaign_schedules (id_campaign, schedule_name, schedule_type, cron_expression, enabled, workspace_owner_id, created_by)
       VALUES ($1, 'Lịch NV', 'daily', '0 9 * * *', TRUE, $2, $3) RETURNING id`,
      [campaignId, owner.id, employee.id]
    );
    // Run lịch: triggered_by NULL và metadata không có triggeredBy — chỉ còn người tạo lịch để biết ai.
    const runId = await createRun({ campaignId, ownerId: owner.id, scheduleId: Number(sched[0].id), source: 'schedule' });

    await realExecuteCampaign(campaignId, runId, owner.id, null, { isResume: true, resumedBy: 'per_minute' });

    const { rows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message).toMatch(/chưa được giao cho nhân viên/);
  });

  it('getRunForExecution trả triggered_by + schedule_created_by (SQL thật)', async () => {
    const { owner, employee, a } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_zalo_personal', { zaloAccountId: a });
    const { rows: sched } = await db.query(
      `INSERT INTO campaign_schedules (id_campaign, schedule_name, schedule_type, cron_expression, enabled, workspace_owner_id, created_by)
       VALUES ($1, 'L', 'daily', '0 9 * * *', TRUE, $2, $3) RETURNING id`,
      [campaignId, owner.id, employee.id]
    );
    const runId = await createRun({ campaignId, ownerId: owner.id, triggeredBy: employee.id, scheduleId: Number(sched[0].id) });
    const row = await campaignRunRepository.getRunForExecution(runId);
    expect(Number(row.triggered_by)).toBe(Number(employee.id));
    expect(Number(row.schedule_created_by)).toBe(Number(employee.id));
    expect(row.run_metadata.source).toBe('campaign_run');
  });
});

describe('trợ lý AI (SQL thật) — bốn hàm repo lọc theo việc giao, trước LIMIT', () => {
  it('getZaloAccounts / getZaloAccountsFull / getDefaultZaloAccountId / findDefaultZaloSettingId', async () => {
    const { owner, a, b, c } = await setup();
    // 6 tài khoản kết nối khác của chủ, MỚI hơn: nếu lọc sau LIMIT 5 thì nhân viên được giao `a` (cũ nhất) sẽ không thấy gì.
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createZalo(owner.id, `Nick mới ${i}`);
    }
    await db.query(`UPDATE zalo_settings SET is_default = FALSE WHERE id = ANY($1::bigint[])`, [[a, b, c]]);

    const ownerList = await aiCampaignRepository.getZaloAccounts(owner.id, null);
    expect(ownerList).toHaveLength(5); // trần 5 của chủ giữ nguyên
    const employeeList = await aiCampaignRepository.getZaloAccounts(owner.id, [a]);
    expect(employeeList.map((row) => Number(row.id))).toEqual([a]);
    expect(await aiCampaignRepository.getZaloAccounts(owner.id, [])).toEqual([]);

    const full = await aiCampaignRepository.getZaloAccountsFull(owner.id, [a, c]);
    expect(full.map((row) => Number(row.id)).sort((x, y) => x - y)).toEqual([a, c]);
    expect((await aiCampaignRepository.getZaloAccountsFull(owner.id, null)).length).toBe(9);
    expect(await aiCampaignRepository.getZaloAccountsFull(owner.id, [])).toEqual([]);

    expect(Number(await aiCampaignRepository.getDefaultZaloAccountId(owner.id, [c]))).toBe(c);
    expect(await aiCampaignRepository.getDefaultZaloAccountId(owner.id, [])).toBeNull();
    expect(await aiCampaignRepository.getDefaultZaloAccountId(owner.id, null)).not.toBeNull();

    expect(Number(await aiCampaignDraftRepository.findDefaultZaloSettingId(owner.id, [b, c]))).toBe(b);
    expect(await aiCampaignDraftRepository.findDefaultZaloSettingId(owner.id, [])).toBeNull();
    expect(Number(await aiCampaignDraftRepository.findDefaultZaloSettingId(owner.id, null))).toBe(a);
  });

  it('POST /api/ai/prepare-campaign: nhân viên chưa được giao tài khoản nào → bản nháp KHÔNG mang tài khoản Zalo của chủ, thẻ xác nhận chặn tạo', async () => {
    const { owner, employee, employeeToken } = await setup();
    await db.query('DELETE FROM member_channel_accounts WHERE employee_id = $1', [employee.id]);
    const script = {
      campaignName: 'AI chiến dịch',
      nodes: [
        { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', config: {} },
        { id: 'n2', tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_zalo_personal', config: { zaloPersonalTemplateSteps: [], zaloMessage: 'Xin chào' } },
        { id: 'n3', tempId: 'n3', nodeType: 'end', nodeSubtype: 'end', config: {} },
      ],
      connections: [{ sourceNodeId: 'n1', targetNodeId: 'n2' }, { sourceNodeId: 'n2', targetNodeId: 'n3' }],
    };
    const res = await asEmployee(request(app).post('/api/ai/prepare-campaign').send({ script }), employeeToken, owner.id);
    expect(res.status).toBe(200);
    const prepared = res.body.data.preparedScript;
    const sendNode = prepared.nodes.find((n) => (n.nodeSubtype || n.node_subtype) === 'send_zalo_personal');
    expect(sendNode.config.zaloAccountId).toBeUndefined();
    expect(res.body.data.confirmationView.readyToCreate).toBe(false);
  });
});

describe('Studio (HTTP + SQL thật) — tài khoản Zalo cá nhân', () => {
  it('GET /api/ai/chatbot/zalo-accounts/chatbot: nhân viên chỉ thấy tài khoản được giao; chủ thấy hết', async () => {
    const { owner, a, ownerToken, employeeToken } = await setup();
    const employeeRes = await asEmployee(request(app).get('/api/ai/chatbot/zalo-accounts/chatbot'), employeeToken, owner.id);
    expect(employeeRes.status).toBe(200);
    expect(employeeRes.body.data.map((row) => Number(row.id))).toEqual([a]);

    const ownerRes = await asOwner(request(app).get('/api/ai/chatbot/zalo-accounts/chatbot'), ownerToken);
    expect(ownerRes.body.data).toHaveLength(3);
  });

  it('POST /api/ai/chatbot/zalo-account/:id/chatbot/toggle: nhân viên chưa giao → 403 và KHÔNG ghi; được giao → bật được; chủ bật tài khoản bất kỳ', async () => {
    const { owner, a, b, employeeToken, ownerToken } = await setup();

    const denied = await asEmployee(request(app).post(`/api/ai/chatbot/zalo-account/${b}/chatbot/toggle`).send({ enabled: true }), employeeToken, owner.id);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    const { rows: none } = await db.query('SELECT id FROM chatbot_zalo_account_settings WHERE id_zalo_setting = $1', [b]);
    expect(none).toHaveLength(0);

    const ok = await asEmployee(request(app).post(`/api/ai/chatbot/zalo-account/${a}/chatbot/toggle`).send({ enabled: true }), employeeToken, owner.id);
    expect(ok.status).toBe(200);
    const { rows: written } = await db.query('SELECT is_enabled FROM chatbot_zalo_account_settings WHERE id_zalo_setting = $1', [a]);
    expect(written[0].is_enabled).toBe(true);

    const ownerRes = await asOwner(request(app).post(`/api/ai/chatbot/zalo-account/${b}/chatbot/toggle`).send({ enabled: true }), ownerToken);
    expect(ownerRes.status).toBe(200);
  });

  it('assertOwnedConfiguration ở lớp repo cũng chặn (phòng thủ): tài khoản ngoài danh sách → 404', async () => {
    const { owner, a, b } = await setup();
    await expect(chatbotZaloAccountRepository.setEnabled(owner.id, b, null, true, { accessibleZaloIds: [a] }))
      .rejects.toMatchObject({ status: 404 });
    await expect(chatbotZaloAccountRepository.setEnabled(owner.id, a, null, true, { accessibleZaloIds: [a] }))
      .resolves.toMatchObject({ is_enabled: true });
  });
});

describe('giám sát gửi tin — tín hiệu theo tài khoản (HTTP + SQL thật)', () => {
  async function seedSilentDrops(ownerId, campaignId, accountId, name) {
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `INSERT INTO zalo_messages (id_campaign, channel, recipient_type, recipient_value, account_id, account_name, message_text,
                                    tracking_token, tracking_metadata, is_preview, status, created_at)
         VALUES ($1, 'zalo_personal', 'phone', $2, $3, $4, 'x', $5, $6::jsonb, FALSE, 'failed', NOW())`,
        [campaignId, `090000${i}`, accountId, name, `tok-${accountId}-${i}`, JSON.stringify({ status: 'failed', errorCategory: 'ZALO_SILENT_DROP' })]
      );
    }
  }

  it('truy vấn tín hiệu: accountScoped chạy được trên Postgres thật và chỉ trả tài khoản được giao', async () => {
    const { owner, a, b } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await seedSilentDrops(owner.id, campaignId, a, 'Nick A');
    await seedSilentDrops(owner.id, campaignId, b, 'Nick B');

    const all = await db.query(buildZaloSilentDropHourlySql({ userScoped: true }), [owner.id]);
    expect(all.rows.map((row) => Number(row.account_id)).sort((x, y) => x - y)).toEqual([a, b].sort((x, y) => x - y));
    const scoped = await db.query(buildZaloSilentDropHourlySql({ userScoped: true, accountScoped: true }), [owner.id, [a]]);
    expect(scoped.rows.map((row) => Number(row.account_id))).toEqual([a]);
    const none = await db.query(buildZaloSilentDropHourlySql({ userScoped: true, accountScoped: true }), [owner.id, []]);
    expect(none.rows).toEqual([]);
  });

  it('GET /api/delivery-monitor/overview: nhân viên chỉ thấy tín hiệu của tài khoản được giao; chủ thấy cả hai', async () => {
    const { owner, a, b, ownerToken, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await seedSilentDrops(owner.id, campaignId, a, 'Nick A');
    await seedSilentDrops(owner.id, campaignId, b, 'Nick B');

    const employeeRes = await asEmployee(request(app).get('/api/delivery-monitor/overview'), employeeToken, owner.id);
    expect(employeeRes.status).toBe(200);
    expect(employeeRes.body.data.signals.map((s) => s.accountId)).toEqual([a]);
    expect(JSON.stringify(employeeRes.body)).not.toContain('Nick B');

    const ownerRes = await asOwner(request(app).get('/api/delivery-monitor/overview'), ownerToken);
    expect(ownerRes.body.data.signals.map((s) => s.accountId).sort((x, y) => x - y)).toEqual([a, b].sort((x, y) => x - y));
  });
});
