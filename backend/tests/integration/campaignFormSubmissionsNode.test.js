/**
 * Integration tests cho node chiến dịch "Lấy dữ liệu từ biểu mẫu" (`read_form_submissions`,
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-6a).
 *
 * Phạm vi:
 *   - Loader (`campaignNodeDataService.getCustomersFromDataNode`) gọi thẳng, không qua HTTP —
 *     dựng bài nộp bằng API public thật (PR-1), set marketing_consent/status bằng UPDATE trực
 *     tiếp cho các ca không tự làm được qua API (đã huỷ, chưa hỏi đồng ý).
 *   - API preview cho khung cấu hình node (PR-6b dùng): GET /api/forms/:id/campaign-preview.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';

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

async function createAndPublishForm(token, overrides = {}) {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Form đăng ký tư vấn',
      fields: [
        { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Email', type: 'email', required: true, role: 'email' },
        { label: 'Số điện thoại', type: 'phone', required: false, role: 'phone' },
        {
          label: 'Dịch vụ quan tâm',
          type: 'select',
          required: false,
          options: ['Gói cơ bản', 'Gói Pro'],
        },
      ],
      ...overrides,
    });
  expect(createRes.status).toBe(201);
  const form = createRes.body.data;

  const publishRes = await request(app)
    .put(`/api/forms/${form.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });
  expect(publishRes.status).toBe(200);

  return form;
}

async function submitPublic(form, { name, email, phone, service, marketingConsent }) {
  const nameField = form.fields.find((f) => f.role === 'name');
  const emailField = form.fields.find((f) => f.role === 'email');
  const phoneField = form.fields.find((f) => f.role === 'phone');
  const serviceField = form.fields.find((f) => f.type === 'select');

  const answers = {
    [nameField.key]: name,
    [emailField.key]: email,
  };
  if (phone && phoneField) answers[phoneField.key] = phone;
  if (service && serviceField) answers[serviceField.key] = service;

  const body = { answers };
  if (marketingConsent !== undefined) body.marketingConsent = marketingConsent;

  const res = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send(body);
  expect(res.status).toBe(201);

  const row = await db.query(
    'SELECT id FROM form_submissions WHERE form_id = $1 AND respondent_email = $2',
    [form.id, email.toLowerCase()]
  );
  return row.rows[0].id;
}

describe('Node chiến dịch "Lấy dữ liệu từ biểu mẫu" (read_form_submissions) — PR-6a', () => {
  it('A (đồng ý) + B (không đồng ý) + C (chưa hỏi/null) + D (đồng ý nhưng đã huỷ) → loader chỉ ra A', async () => {
    const owner = await createUser({ username: 'owner_node_1' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);

    await submitPublic(form, { name: 'A Đồng Ý', email: 'a@example.com', marketingConsent: 'true' });
    await submitPublic(form, { name: 'B Không Đồng Ý', email: 'b@example.com', marketingConsent: 'false' });
    await submitPublic(form, { name: 'C Chưa Hỏi', email: 'c@example.com' }); // không gửi marketingConsent -> null
    const submissionDId = await submitPublic(form, {
      name: 'D Đã Huỷ',
      email: 'd@example.com',
      marketingConsent: 'true',
    });
    await db.query(`UPDATE form_submissions SET status = 'cancelled' WHERE id = $1`, [submissionDId]);

    const node = {
      id: 'node_1',
      node_subtype: 'read_form_submissions',
      config: { formId: form.id },
    };
    const result = await campaignNodeDataService.getCustomersFromDataNode(node, owner.id, []);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('a@example.com');
    expect(result.items[0].fullName).toBe('A Đồng Ý');
  });

  it('formId của workspace khác → node throw lỗi rõ; gọi thẳng API preview → 404', async () => {
    const ownerA = await createUser({ username: 'owner_node_2a' });
    const ownerB = await createUser({ username: 'owner_node_2b' });
    const tokenA = await loginAs(ownerA);
    const tokenB = await loginAs(ownerB);
    const formOfA = await createAndPublishForm(tokenA);

    const node = {
      id: 'node_2',
      node_subtype: 'read_form_submissions',
      config: { formId: formOfA.id },
    };
    // ownerB (chủ workspace khác) gọi loader với form của A -> phải throw, không trả rỗng lặng lẽ
    await expect(campaignNodeDataService.getCustomersFromDataNode(node, ownerB.id, [])).rejects.toThrow();

    const previewRes = await request(app)
      .get(`/api/forms/${formOfA.id}/campaign-preview`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(previewRes.status).toBe(404);
  });

  it('form đã bị xoá → node throw lỗi rõ; preview → 404', async () => {
    const owner = await createUser({ username: 'owner_node_3' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);
    const formId = form.id;

    const deleteRes = await request(app)
      .delete(`/api/forms/${formId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const node = {
      id: 'node_3',
      node_subtype: 'read_form_submissions',
      config: { formId },
    };
    await expect(campaignNodeDataService.getCustomersFromDataNode(node, owner.id, [])).rejects.toThrow();

    const previewRes = await request(app)
      .get(`/api/forms/${formId}/campaign-preview`)
      .set('Authorization', `Bearer ${token}`);
    expect(previewRes.status).toBe(404);
  });

  it('chiến dịch do NHÂN VIÊN của chủ tạo, node trỏ form của chủ → đọc được (userId truyền vào là chủ workspace)', async () => {
    const owner = await createUser({ username: 'owner_node_4' });
    const ownerToken = await loginAs(owner);
    const form = await createAndPublishForm(ownerToken);
    await submitPublic(form, { name: 'Khách A', email: 'emp-owner@example.com', marketingConsent: 'true' });

    // campaign.controller.js:728-729 xác nhận executionUserId LUÔN là chủ workspace
    // (campaign_owner_id / workspaceContext.workspaceOwnerId), KHÔNG BAO GIỜ là id nhân viên,
    // dù chính nhân viên là người tạo/chạy chiến dịch — nên node chỉ cần test với owner.id là đủ
    // đại diện cho cả hai trường hợp (chủ hay nhân viên bấm chạy).
    const node = {
      id: 'node_4',
      node_subtype: 'read_form_submissions',
      config: { formId: form.id },
    };
    const result = await campaignNodeDataService.getCustomersFromDataNode(node, owner.id, []);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('emp-owner@example.com');
  });

  it('fieldMap.emailKey trỏ trường "Email công ty" khác role → item.email lấy giá trị trường đó', async () => {
    const owner = await createUser({ username: 'owner_node_5' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form 2 email',
        fields: [
          { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
          { label: 'Email cá nhân', type: 'email', required: true, role: 'email' },
          { label: 'Email công ty', type: 'email', required: false },
        ],
      });
    const form = createRes.body.data;
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const nameField = form.fields.find((f) => f.role === 'name');
    const personalEmailField = form.fields.find((f) => f.role === 'email');
    const companyEmailField = form.fields.find((f) => f.label === 'Email công ty');

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          [nameField.key]: 'Khách Hai Email',
          [personalEmailField.key]: 'personal@example.com',
          [companyEmailField.key]: 'Company@Example.com',
        },
        marketingConsent: 'true',
      });
    expect(submitRes.status).toBe(201);

    const node = {
      id: 'node_5',
      node_subtype: 'read_form_submissions',
      config: { formId: form.id, fieldMap: { emailKey: companyEmailField.key } },
    };
    const result = await campaignNodeDataService.getCustomersFromDataNode(node, owner.id, []);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('company@example.com');
  });

  it('dataSelectedColumns chỉ chọn trường "Dịch vụ" → item chỉ còn trường đó + khoá cố định', async () => {
    const owner = await createUser({ username: 'owner_node_6' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);
    await submitPublic(form, {
      name: 'Khách Chọn Cột',
      email: 'cols@example.com',
      phone: '0901234567',
      service: 'Gói Pro',
      marketingConsent: 'true',
    });

    const serviceField = form.fields.find((f) => f.type === 'select');
    const node = {
      id: 'node_6',
      node_subtype: 'read_form_submissions',
      config: { formId: form.id, dataSelectedColumns: [serviceField.key] },
    };
    const result = await campaignNodeDataService.getCustomersFromDataNode(node, owner.id, []);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];

    expect(item[serviceField.key]).toBe('Gói Pro');
    expect(item.submissionId).toBeDefined();
    expect(item.id).toBeDefined();
    expect(item.email).toBe('cols@example.com');
    expect(item.phone).toBe('0901234567');
    expect(item.fullName).toBe('Khách Chọn Cột');
    // createdAt/appointmentAt/marketingConsent KHÔNG nằm trong ALWAYS_KEEP_BY_KIND.form
    // (dataColumnSelection.util.js) nên đúng ra phải bị lọc bỏ khi có chọn cột — chỉ
    // submissionId/id/email/phone/fullName + cột được chọn mới sống sót.
    const keys = Object.keys(item).sort();
    expect(keys).toEqual(['email', 'fullName', 'id', 'phone', serviceField.key, 'submissionId'].sort());
  });

  it('API preview: columns đúng thứ tự fields của form, có label; items khớp bài đồng ý', async () => {
    const owner = await createUser({ username: 'owner_node_7' });
    const token = await loginAs(owner);
    const form = await createAndPublishForm(token);
    await submitPublic(form, { name: 'Preview A', email: 'preview-a@example.com', marketingConsent: 'true' });
    await submitPublic(form, { name: 'Preview B', email: 'preview-b@example.com', marketingConsent: 'false' });

    const previewRes = await request(app)
      .get(`/api/forms/${form.id}/campaign-preview`)
      .set('Authorization', `Bearer ${token}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.items).toHaveLength(1);
    expect(previewRes.body.data.items[0].email).toBe('preview-a@example.com');
    expect(previewRes.body.data.pagination).toEqual({ total: 1, limit: 1000, fetched: 1 });

    const columnKeys = previewRes.body.data.columns.map((c) => c.key);
    const expectedKeys = form.fields.map((f) => f.key);
    expect(columnKeys).toEqual(expectedKeys);
    expect(previewRes.body.data.columns[0]).toHaveProperty('label');
    expect(previewRes.body.data.columns[0]).toHaveProperty('type');
  });
});
