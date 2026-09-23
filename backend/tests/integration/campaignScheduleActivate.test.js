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

async function insertCampaign({ ownerId, status, campaignName = 'CSKH sau hội thảo', withNode = true }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, $3) RETURNING *`,
    [ownerId, campaignName, status],
  );
  const campaign = rows[0];
  if (withNode) {
    await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_name, position_x, position_y, config, execution_order)
       VALUES ($1, 'send_zalo_group', 'Gửi nhóm', 0, 0, '{}'::jsonb, 0)`,
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

  it('chiến dịch 0 node + activateCampaign:true → 409 CANNOT_ACTIVATE_EMPTY_CAMPAIGN, trạng thái VẪN draft, KHÔNG có lịch nào được tạo (chứng minh nguyên tử)', async () => {
    const user = await createUser({ email: 'act-empty@test.com', username: 'act_empty' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft', withNode: false });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id, { activateCampaign: true }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CANNOT_ACTIVATE_EMPTY_CAMPAIGN');

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

  it('chiến dịch 0 node + PATCH activateCampaign:true → 409 CANNOT_ACTIVATE_EMPTY_CAMPAIGN, lịch vẫn tắt (nguyên tử)', async () => {
    const user = await createUser({ email: 'act-patch-empty@test.com', username: 'act_patch_empty' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft', withNode: false });
    const schedule = await insertDisabledSchedule({ campaignId: campaign.id });

    const res = await request(app)
      .patch(`/api/campaign-schedules/${schedule.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true, activateCampaign: true });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CANNOT_ACTIVATE_EMPTY_CAMPAIGN');
    const { rows: scheduleRows } = await db.query('SELECT enabled FROM campaign_schedules WHERE id = $1', [schedule.id]);
    expect(scheduleRows[0].enabled).toBe(false);
    const { rows: campaignRows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    expect(campaignRows[0].status).toBe('draft');
  });
});

/**
 * Bổ sung lúc review (Claude, người viết plan — 23/09/2026).
 *
 * 8 test ở trên KHÔNG ca nào đi qua nhánh ROLLBACK: ca "0 node" ném lỗi TRƯỚC khi có lần ghi nào,
 * nên đổi `ROLLBACK` thành `COMMIT` trong `activateCampaignAndWriteScheduleTx` vẫn xanh cả 8 —
 * đã đo. Tức điều kiện số 3 của plan (kích hoạt và tạo lịch cùng thành công hoặc cùng không) chưa
 * có gì canh. Ca dưới đây ép đúng thứ tự nguy hiểm: kích hoạt XONG rồi ghi lịch mới hỏng.
 *
 * Cách ép mà không phải mock: `campaign_schedules.schedule_name` là VARCHAR(255) còn validator
 * không chặn độ dài (`.trim().notEmpty()` thôi) → tên 300 ký tự qua được cổng, ném 22001 ngay tại
 * INSERT. Nếu rollback hỏng, chiến dịch sẽ nằm lại `active` mà không có lịch nào chờ — đúng
 * "mầm gửi nhầm" mục 3.3 của plan cảnh báo.
 */
describe('Nguyên tử THẬT — ghi lịch hỏng SAU khi đã kích hoạt', () => {
  it('INSERT lịch ném lỗi → chiến dịch phải quay lại draft, published_at vẫn NULL, không có lịch nào', async () => {
    const user = await createUser({ email: 'act-rollback@test.com', username: 'act_rollback' });
    const token = await loginAs(user);
    const campaign = await insertCampaign({ ownerId: user.id, status: 'draft' });

    const res = await request(app)
      .post('/api/campaign-schedules')
      .set('Authorization', `Bearer ${token}`)
      .send(schedulePayload(campaign.id, { activateCampaign: true, scheduleName: 'x'.repeat(300) }));

    expect(res.status).toBeGreaterThanOrEqual(400);

    const { rows } = await db.query('SELECT status, published_at FROM campaigns WHERE id = $1', [campaign.id]);
    expect(rows[0].status).toBe('draft');
    expect(rows[0].published_at).toBeNull();
    expect(await countSchedules(campaign.id)).toBe(0);
    expect(await countRuns(campaign.id)).toBe(0);
  });
});
