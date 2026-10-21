/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-D (D4) — danh sách trường tuỳ chỉnh của lead luôn rỗng (lỗi cũ).
 *
 * `leadService.listCustomFieldDefinitions` gọi `listLeadFormConfigsInScope({ workspaceOwnerId, isSuperAdmin })` KHÔNG kèm `userId`;
 * `buildLandingScopeCondition` thiếu userId thì trả `1 = 0` -> 0 dòng. Hệ quả: tra KIỂU trường khi lọc lead (operator nào hợp lệ với
 * trường nào) và cột tuỳ chỉnh của CSV không chạy. Sửa: truyền `userId` = chủ workspace. Vẫn đúng phạm vi: chỉ landing của workspace đó.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import leadService from '../../src/services/lead/lead.service.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function createUserWithPlan(username) {
  const user = await createUser({ role: 'user', username });
  const plan = await createPlan({ code: `plan_${username}` });
  await assignPlanToUser(user.id, plan.id);
  return user;
}

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

const leadFormWith = (customFields) => ({
  leadForm: {
    version: 1,
    fixedFields: { occupation: { visible: true }, interestArea: { visible: true } },
    customFields,
  },
});

async function insertLanding(ownerId, slug, customConfig, { createdBy = null } = {}) {
  await db.query(
    `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, html_content, custom_config, is_published)
     VALUES ($1, $2, $3, 'T', '<p>x</p>', $4::jsonb, true)`,
    [createdBy ?? ownerId, ownerId, slug, JSON.stringify(customConfig)]
  );
}

const SELECT_FIELD = { key: 'cf_quy_mo', type: 'select', labelVi: 'Quy mô', options: [{ value: 'small', labelVi: 'Nhỏ' }] };
const TEXT_FIELD = { key: 'cf_ghi_chu', type: 'text', labelVi: 'Ghi chú' };
const OTHER_FIELD = { key: 'cf_cua_b_xx', type: 'text', labelVi: 'Cua B' };

describe('leadService.listCustomFieldDefinitions', () => {
  it('chủ A có landing với 2 trường tuỳ chỉnh -> trả 2 trường (trước: 0), không lẫn trường của B', async () => {
    const a = await createUserWithPlan('lead_a');
    const b = await createUserWithPlan('lead_b');
    await insertLanding(a.id, 'lead-a-1', leadFormWith([SELECT_FIELD, TEXT_FIELD]));
    await insertLanding(b.id, 'lead-b-1', leadFormWith([OTHER_FIELD]));

    const defsA = await leadService.listCustomFieldDefinitions({ workspaceOwnerId: a.id });
    const defsB = await leadService.listCustomFieldDefinitions({ workspaceOwnerId: b.id });

    expect(defsA.map((d) => d.key).sort()).toEqual(['cf_ghi_chu', 'cf_quy_mo']);
    expect(defsA.find((d) => d.key === 'cf_quy_mo')).toMatchObject({ type: 'select', labelVi: 'Quy mô' });
    expect(defsB.map((d) => d.key)).toEqual(['cf_cua_b_xx']);
  });

  it('gộp trường từ nhiều landing của cùng chủ, khoá trùng chỉ tính một lần', async () => {
    const a = await createUserWithPlan('lead_a2');
    await insertLanding(a.id, 'lead-a-2a', leadFormWith([SELECT_FIELD]));
    await insertLanding(a.id, 'lead-a-2b', leadFormWith([SELECT_FIELD, TEXT_FIELD]));

    const defs = await leadService.listCustomFieldDefinitions({ workspaceOwnerId: a.id });

    expect(defs.map((d) => d.key).sort()).toEqual(['cf_ghi_chu', 'cf_quy_mo']);
  });

  it('thiếu cả workspaceOwnerId/userId/idUser -> rỗng (đóng-khi-lỗi, không đọc landing của ai)', async () => {
    const a = await createUserWithPlan('lead_a3');
    await insertLanding(a.id, 'lead-a-3', leadFormWith([SELECT_FIELD]));

    expect(await leadService.listCustomFieldDefinitions({})).toEqual([]);
    expect(await leadService.listCustomFieldDefinitions({ isSuperAdmin: false })).toEqual([]);
  });

  it('landing do nhân viên tạo nhưng thuộc workspace của chủ -> chủ thấy trường đó', async () => {
    const owner = await createUserWithPlan('lead_owner');
    const employee = await createUserWithPlan('lead_emp');
    await insertLanding(owner.id, 'lead-emp-made', leadFormWith([TEXT_FIELD]), { createdBy: employee.id });

    const defs = await leadService.listCustomFieldDefinitions({ workspaceOwnerId: owner.id });

    expect(defs.map((d) => d.key)).toEqual(['cf_ghi_chu']);
  });
});

describe('tra kiểu trường khi lọc lead (resolveSharedLeadFilters)', () => {
  const containsOnSelect = (ownerId) => ({
    workspaceOwnerId: ownerId,
    landingLeadsCustomFilters: [{ key: 'cf_quy_mo', operator: 'contains', value: 'nho' }],
  });

  it('trường "cf_quy_mo" là select ở landing của A -> toán tử contains bị từ chối 400; ở workspace B (không có trường) vẫn chạy như trường đã xoá', async () => {
    const a = await createUserWithPlan('lead_a4');
    const b = await createUserWithPlan('lead_b4');
    await insertLanding(a.id, 'lead-a-4', leadFormWith([SELECT_FIELD]));

    await expect(leadService.resolveSharedLeadFilters(containsOnSelect(a.id))).rejects.toMatchObject({ statusCode: 400 });
    const forB = await leadService.resolveSharedLeadFilters(containsOnSelect(b.id));
    expect(forB.customFilters).toEqual([{ key: 'cf_quy_mo', operator: 'contains', values: ['nho'] }]);
  });

  it('toán tử hợp lệ với kiểu (eq trên select) -> chấp nhận', async () => {
    const a = await createUserWithPlan('lead_a5');
    await insertLanding(a.id, 'lead-a-5', leadFormWith([SELECT_FIELD]));

    const shared = await leadService.resolveSharedLeadFilters({
      workspaceOwnerId: a.id,
      landingLeadsCustomFilters: [{ key: 'cf_quy_mo', operator: 'eq', value: 'small' }],
    });

    expect(shared.customFilters).toEqual([{ key: 'cf_quy_mo', operator: 'eq', values: ['small'] }]);
  });
});

describe('GET /api/leads/custom-field-definitions', () => {
  it('chủ A -> 2 trường của mình; chủ B -> chỉ trường của B', async () => {
    const a = await createUserWithPlan('lead_http_a');
    const b = await createUserWithPlan('lead_http_b');
    await insertLanding(a.id, 'lead-http-a', leadFormWith([SELECT_FIELD, TEXT_FIELD]));
    await insertLanding(b.id, 'lead-http-b', leadFormWith([OTHER_FIELD]));

    const resA = await request(app).get('/api/leads/custom-field-definitions').set('Authorization', `Bearer ${await loginAs(a)}`);
    const resB = await request(app).get('/api/leads/custom-field-definitions').set('Authorization', `Bearer ${await loginAs(b)}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.items.map((d) => d.key).sort()).toEqual(['cf_ghi_chu', 'cf_quy_mo']);
    expect(resB.status).toBe(200);
    expect(resB.body.data.items.map((d) => d.key)).toEqual(['cf_cua_b_xx']);
  });
});
