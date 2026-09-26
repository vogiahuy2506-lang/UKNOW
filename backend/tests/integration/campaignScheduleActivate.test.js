/**
 * PLAN_DAT_LICH_CHIEN_DICH_NHAP_2026-09-23, PR-1 — Postgres THẬT.
 *
 * Sếp phản ánh 22/09: đặt lịch cho chiến dịch Nháp bị chặn, câu báo lỗi bảo bấm «Chạy ngay» — tức
 * gửi thật ngay lập tức, đúng thứ người dùng đang tránh. Từ bản này: gửi kèm `activateCampaign: true`
 * thì hệ thống KÍCH HOẠT chiến dịch (draft/paused → active) và TẠO/BẬT lịch trong CÙNG một
 * transaction — không gửi gì ngay, không để lại "active nhưng không ai chờ" nếu một trong hai việc
 * hỏng (mục 3.3, 5 test bắt buộc — mục 5 của plan).
 *
 * TUYỆT ĐỐI không đụng: lượt chạy từ lịch (`source==='schedule'`) vẫn không được tự kích hoạt chiến
 * dịch — plan mục 4. File này không test lại chỗ đó (đã có `campaignScheduleNotActive.test.js`).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

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

// PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 3 — bật lịch giờ đi qua preflight
// (validateCampaignPreflight), đòi node PHẢI đúng node_subtype trong SEND_NODE_SUBTYPES.
// 'send_zalo_group' cũ không có node_subtype nên chỉ thoả CANNOT_ACTIVATE_EMPTY_CAMPAIGN
// (publishCampaignTx, chỉ đếm số node) chứ không thoả preflight — đổi sang send_email cho khớp cả hai.
async function insertCampaign({ ownerId, status, campaignName = 'CSKH sau hội thảo', withNode = true }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, $3) RETURNING *`,
    [ownerId, campaignName, status],
  );
  const campaign = rows[0];
  if (withNode) {
    await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, position_x, position_y, config, execution_order)
       VALUES ($1, 'action', 'send_email', 'Gửi email', 0, 0, '{}'::jsonb, 0)`,
      [campaign.id],
    );
  }
  return campaign;
}

async function addCampaignMembership(ownerId, employeeId, permissions) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employeeId, JSON.stringify(permissions)],
  );
}

const schedulePayload = (campaignId, extra = {}) => ({
  campaignId,
  scheduleName: 'Nhắc lịch',
  scheduleType: 'daily',
  cronExpression: '0 8 * * *',
  ...extra,
});

async function countSchedules(campaignId) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM campaign_schedules WHERE id_campaign = $1', [campaignId]);
  return rows[0].n;
}

async function countRuns(campaignId) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM campaign_runs WHERE id_campaign = $1', [campaignId]);
  return rows[0].n;
}

const auditRows = async (action, campaignId) => (await db.query(
  `SELECT * FROM audit_logs WHERE action = $1 AND entity_id = $2 ORDER BY id`,
  [action, campaignId],
)).rows;

describe('POST /api/campaign-schedules kèm activateCampaign — kích hoạt + tạo lịch nguyên tử', () => {
  it('draft + activateCampaign:true → 201, campaign active, published_at có giá trị, lịch bật, KHÔNG có campaign_runs mới (không gửi gì)', async () => {
    const user = await createUser({ email: 'act-draft@test.com', username: 'act_draft' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id, { activateCampaign: true }));

    expect(res.status).toBe(201);
    expect(res.body.data.campaignActivated).toBe(true);
    expect(res.body.data.campaignStatus).toBe('active');
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.message).toContain('kích hoạt');

    const { rows: campaignRows } = await db.query('SELECT status, published_at FROM campaigns WHERE id = $1', [campaign.id]);
    expect(campaignRows[0].status).toBe('active');
    expect(campaignRows[0].published_at).not.toBeNull();

    const { rows: scheduleRows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id_campaign = $1', [campaign.id]);
    expect(scheduleRows).toHaveLength(1);
    expect(scheduleRows[0].enabled).toBe(true);

    expect(await countRuns(campaign.id)).toBe(0);

    // Trước bản này publish() không ghi audit gì cả — soát bằng sự kiện DB thật, không tin "test xanh" suông.
    const activatedAudit = await auditRows('CAMPAIGN_ACTIVATED', campaign.id);
    expect(activatedAudit).toHaveLength(1);
    expect(activatedAudit[0].details).toMatchObject({ viaSchedule: true });
    const scheduleCreatedAudit = await auditRows('CAMPAIGN_SCHEDULE_CREATED', campaign.id);
    expect(scheduleCreatedAudit).toHaveLength(1);
  });

  it('draft + KHÔNG có cờ → vẫn 409 CAMPAIGN_NOT_ACTIVE như cũ, trạng thái chiến dịch không đổi, không tạo lịch', async () => {
    const user = await createUser({ email: 'act-noflag@test.com', username: 'act_noflag' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAMPAIGN_NOT_ACTIVE');
    expect(res.body.message).toContain('Kích hoạt & tạo lịch');

    const { rows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(rows[0].status).toBe('draft');
    expect(await countSchedules(campaign.id)).toBe(0);
  });

  it('paused + activateCampaign:true → active trở lại, lịch được tạo', async () => {
    const user = await createUser({ email: 'act-paused@test.com', username: 'act_paused' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'paused' });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id, { activateCampaign: true }));

    expect(res.status).toBe(201);
    const { rows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(rows[0].status).toBe('active');
    expect(await countSchedules(campaign.id)).toBe(1);
  });

  // PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 3 — "preflight vẫn chạy trước khi kích
  // hoạt", kể cả nhánh activateCampaign:true. Chiến dịch 0 node giờ bị preflight (NO_SEND_NODE)
  // chặn TRƯỚC khi chạm tới activateCampaignAndWriteScheduleTx, nên không bao giờ còn tới lượt
  // CANNOT_ACTIVATE_EMPTY_CAMPAIGN (publishCampaignTx) nổ ra nữa — vẫn cùng một bất biến "nguyên
  // tử" (không kích hoạt, không tạo lịch), chỉ đổi mã lỗi/thông điệp cho đúng nguyên nhân gốc hơn.
  it('chiến dịch 0 node + activateCampaign:true → 400 NO_SEND_NODE (preflight chặn trước khi kích hoạt), trạng thái VẪN draft, KHÔNG có lịch nào được tạo (chứng minh nguyên tử)', async () => {
    const user = await createUser({ email: 'act-empty@test.com', username: 'act_empty' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft', withNode: false });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id, { activateCampaign: true }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_SEND_NODE');

    const { rows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(rows[0].status).toBe('draft');
    expect(await countSchedules(campaign.id)).toBe(0);
    expect(await auditRows('CAMPAIGN_ACTIVATED', campaign.id)).toHaveLength(0);
  });

  it('nhân viên chỉ có campaigns_create (không có campaigns_run) + activateCampaign:true → 403, chiến dịch vẫn draft, không tạo lịch', async () => {
    const owner = await createUser({ email: 'act-owner@test.com', username: 'act_owner' });
    const employee = await createUser({ email: 'act-employee@test.com', username: 'act_employee' });
    await addCampaignMembership(owner.id, employee.id, {
      campaigns_view: true,
      campaigns_create: true,
      campaigns_run: false,
    });
    const campaign = await insertCampaign({ ownerId: owner.id, status: 'draft' });

    const token = await loginAs(employee);
    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id))
      .send(schedulePayload(campaign.id, { activateCampaign: true }));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');

    const { rows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(rows[0].status).toBe('draft');
    expect(await countSchedules(campaign.id)).toBe(0);
  });
});

describe('PATCH /api/campaign-schedules/:id kèm activateCampaign — bẫy "hai chỗ chặn" (plan mục 9)', () => {
  async function insertDisabledSchedule({ campaignId }) {
    const { rows } = await db.query(
      `INSERT INTO campaign_schedules (id_campaign, schedule_name, schedule_type, cron_expression, enabled)
       VALUES ($1, 'Nhắc lịch', 'daily', '0 9 * * *', false) RETURNING *`,
      [campaignId],
    );
    return rows[0];
  }

  it('bật lại lịch TẮT của chiến dịch draft + activateCampaign:true → 200, chiến dịch active, lịch bật', async () => {
    const user = await createUser({ email: 'act-patch@test.com', username: 'act_patch' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });
    const schedule = await insertDisabledSchedule({ campaignId: campaign.id });

    const res = await request(app)
      .patch(`/api/campaign-schedules/${schedule.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true, activateCampaign: true });

    expect(res.status).toBe(200);
    expect(res.body.data.campaignActivated).toBe(true);
    expect(res.body.data.enabled).toBe(true);

    const { rows: campaignRows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(campaignRows[0].status).toBe('active');
    expect(await countRuns(campaign.id)).toBe(0);

    const activatedAudit = await auditRows('CAMPAIGN_ACTIVATED', campaign.id);
    expect(activatedAudit).toHaveLength(1);
    expect(activatedAudit[0].details).toMatchObject({ viaSchedule: true });
  });

  it('bật lại lịch TẮT của chiến dịch draft KHÔNG kèm cờ → vẫn 409 như cũ, lịch vẫn tắt', async () => {
    const user = await createUser({ email: 'act-patch-noflag@test.com', username: 'act_patch_noflag' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });
    const schedule = await insertDisabledSchedule({ campaignId: campaign.id });

    const res = await request(app)
      .patch(`/api/campaign-schedules/${schedule.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAMPAIGN_NOT_ACTIVE');
    const { rows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(rows[0].enabled).toBe(false);
  });

  // PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 3 — cùng lý do ở POST phía trên: preflight
  // (NO_SEND_NODE) chặn trước khi tới activateCampaignAndWriteScheduleTx.
  it('chiến dịch 0 node + PATCH activateCampaign:true → 400 NO_SEND_NODE (preflight chặn trước khi kích hoạt), lịch vẫn tắt (nguyên tử)', async () => {
    const user = await createUser({ email: 'act-patch-empty@test.com', username: 'act_patch_empty' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft', withNode: false });
    const schedule = await insertDisabledSchedule({ campaignId: campaign.id });

    const res = await request(app)
      .patch(`/api/campaign-schedules/${schedule.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true, activateCampaign: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_SEND_NODE');
    const { rows: scheduleRows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(scheduleRows[0].enabled).toBe(false);
    const { rows: campaignRows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(campaignRows[0].status).toBe('draft');
  });
});

/**
 * Bổ sung lúc review (Claude, người viết plan — 23/09/2026).
 *
 * 8 test ở trên KHÔNG ca nào đi qua nhánh ROLLBACK: ca "chiến dịch 0 node" ném lỗi TRƯỚC khi có lần
 * ghi nào. Đo bằng đột biến "chốt sổ phần kích hoạt trước rồi mới ghi lịch" (mô phỏng bản KHÔNG
 * nguyên tử): cả 8 vẫn xanh. Tức điều kiện số 3 của plan (kích hoạt và tạo lịch cùng thành công hoặc
 * cùng không) chưa có gì canh.
 *
 * Ca dưới đây ép đúng thứ tự nguy hiểm — kích hoạt XONG rồi ghi lịch mới hỏng — bằng một trigger tạm
 * trên chính bảng `campaign_schedules`. Chọn trigger thay vì mock: nó chặn ở tầng DB nên đi qua đúng
 * đường mà lỗi thật sẽ đi (vd vi phạm unique index lịch trùng khi hai request đua nhau), và không
 * phụ thuộc vào bất kỳ lỗ hổng validator nào — bản trước dùng tên lịch 300 ký tự, và đã chết ngay khi
 * thêm chặn độ dài 255 ở route.
 *
 * Nếu rollback hỏng, chiến dịch sẽ nằm lại `active` mà không có lịch nào chờ — đúng "mầm gửi nhầm"
 * mục 3.3 của plan cảnh báo.
 */
describe('Nguyên tử THẬT — ghi lịch hỏng SAU khi đã kích hoạt', () => {
  const FAIL_TRIGGER = 'trg_test_fail_schedule_insert';

  async function withFailingScheduleInsert(fn) {
    await db.query(`CREATE OR REPLACE FUNCTION test_fail_schedule_insert() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'ép lỗi ghi lịch để kiểm rollback'; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER ${FAIL_TRIGGER} BEFORE INSERT ON campaign_schedules
      FOR EACH ROW EXECUTE FUNCTION test_fail_schedule_insert()`);
    try {
      return await fn();
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${FAIL_TRIGGER} ON campaign_schedules`);
      await db.query('DROP FUNCTION IF EXISTS test_fail_schedule_insert()');
    }
  }

  it('INSERT lịch ném lỗi → chiến dịch phải quay lại draft, published_at vẫn NULL, không có lịch nào', async () => {
    const user = await createUser({ email: 'act-rollback@test.com', username: 'act_rollback' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });

    const res = await withFailingScheduleInsert(() => request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id, { activateCampaign: true })));

    expect(res.status).toBeGreaterThanOrEqual(400);

    const { rows } = await db.query('SELECT status, published_at FROM campaigns WHERE id = $1', [campaign.id]);
    expect(rows[0].status).toBe('draft');
    expect(rows[0].published_at).toBeNull();
    expect(await countSchedules(campaign.id)).toBe(0);
    expect(await countRuns(campaign.id)).toBe(0);
  });
});

/**
 * Nợ kỹ thuật lộ ra lúc review 23/09: `schedule_name` và `cron_expression` là VARCHAR(255) mà
 * validator chỉ `.trim().notEmpty()`, nên chuỗi quá dài lọt cổng rồi ném 22001 ở INSERT → người dùng
 * nhận 500 "Lỗi server" thay vì một câu nói rõ phải sửa gì.
 */
describe('Validator chặn độ dài — lỗi của người dùng phải là 400, không phải 500', () => {
  it.each([
    ['scheduleName', { scheduleName: 'x'.repeat(256) }],
    ['cronExpression', { cronExpression: '0 8 * * *'.padEnd(256, ' ') + '*' }],
  ])('%s dài quá 255 → 400, không tạo lịch, không đụng trạng thái chiến dịch', async (_field, extra) => {
    const user = await createUser({ email: `len-${_field}@test.com`, username: `len_${_field}`.toLowerCase() });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id, { ...extra, activateCampaign: true }));

    expect(res.status).toBe(400);
    expect(await countSchedules(campaign.id)).toBe(0);
    const { rows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(rows[0].status).toBe('draft');
  });
});

/**
 * Lỗi 500 lộ ra khi nghiệm thu trên PRODUCTION 23/09/2026: `PUT /api/campaigns/:id` kèm node mà
 * không có `nodeSubtype` → `null value in column "node_subtype" violates not-null constraint` →
 * người dùng nhận "Lỗi server".
 *
 * Gốc: `createCampaign` đặt mặc định `?? ''` cho nodeType/Subtype/Name/Description, còn
 * `updateCampaign` truyền thẳng. Giao diện thật luôn gửi đủ trường nên không ai thấy.
 */
describe('PUT /api/campaigns/:id — node thiếu trường không được thành 500', () => {
  it('lưu node chỉ có nodeType + vị trí → 200, node vào DB với node_subtype rỗng (không phải NULL)', async () => {
    const user = await createUser({ email: 'node-default@test.com', username: 'node_default' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft', withNode: false });

    const res = await request(app)
      .put(`/api/campaigns/${campaign.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        campaignName: 'Chiến dịch thử',
        campaignType: 'email',
        nodes: [{ tempId: 'n1', nodeType: 'send_email', positionX: 10, positionY: 20, config: {} }],
        connections: [],
      });

    expect(res.status).toBe(200);
    const { rows } = await db.query(
      'SELECT node_type, node_subtype, node_name FROM campaign_nodes WHERE id_campaign = $1', [campaign.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].node_subtype).toBe('');
    expect(rows[0].node_type).toBe('send_email');
    expect(rows[0].node_name).toBe('Node');
  });
});
