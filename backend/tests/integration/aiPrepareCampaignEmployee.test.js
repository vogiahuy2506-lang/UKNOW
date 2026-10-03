/**
 * Integration test cho G3a.3 (C P1-7) — thẻ xác nhận chiến dịch AI của NHÂN VIÊN.
 *
 * POST /api/ai/prepare-campaign chạy prepareScript + buildConfirmationView THẬT trên Postgres thật: SQL của
 * findEmailSettingsById / findCampaignZaloAccount / findDefault*SettingId / emailTemplate+zaloTemplate.findById lọc
 * `id_user = $x`. Tài khoản + mẫu thuộc CHỦ workspace; nhân viên thao tác trong workspace của chủ phải chọn được chúng
 * (trước đây bị hỏi bằng id nhân viên → missing_sender / template_not_found → không tạo được chiến dịch Email/Zalo qua trợ lý).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
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

const tokenOf = (user) => jwt.sign(
  { userId: user.id, email: user.email, role: user.role || 'user' },
  process.env.JWT_SECRET || 'test-jwt-secret'
);

async function addEmployee(owner, employee) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
    [owner.id, employee.id, JSON.stringify({ campaigns_view: true, campaigns_create: true, ai_assistant_use: true })]
  );
}

/** Tài nguyên của CHỦ: một tài khoản email, một tài khoản Zalo đang kết nối, một mẫu email, một mẫu Zalo. */
async function seedOwnerResources(ownerId) {
  const email = (await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, status, email_mode)
     VALUES ($1, 'Email của chủ', 'chu@example.test', 'chu@example.test', 'active', 'smtp') RETURNING id`,
    [ownerId]
  )).rows[0];
  const zalo = (await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active, is_default)
     VALUES ($1, 'Zalo của chủ', 'connected', true, true) RETURNING id`,
    [ownerId]
  )).rows[0];
  const emailTemplate = (await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html)
     VALUES ($1, 'Mẫu email của chủ', 'Chào bạn', '<p>Nội dung</p>') RETURNING id`,
    [ownerId]
  )).rows[0];
  const zaloTemplate = (await db.query(
    `INSERT INTO zalo_templates (id_user, template_name, subject, body_text)
     VALUES ($1, 'Mẫu Zalo của chủ', 'Chào', 'Xin chào bạn') RETURNING id`,
    [ownerId]
  )).rows[0];
  return { emailId: email.id, zaloId: zalo.id, emailTemplateId: emailTemplate.id, zaloTemplateId: zaloTemplate.id };
}

const emailScript = ({ fromEmailId, templateId }) => ({
  campaignName: 'Email của nhân viên',
  nodes: [
    { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', config: {} },
    {
      id: 'n2', tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Gửi email',
      config: { ...(fromEmailId ? { fromEmailId } : {}), recipientSource: 'manual', emailSteps: [{ templateId }] },
    },
    { id: 'n3', tempId: 'n3', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', config: {} },
  ],
  connections: [{ sourceNodeId: 'n1', targetNodeId: 'n2' }, { sourceNodeId: 'n2', targetNodeId: 'n3' }],
});

const zaloScript = ({ zaloAccountId, templateId }) => ({
  campaignName: 'Zalo của nhân viên',
  nodes: [
    { id: 'n1', tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', config: {} },
    {
      id: 'n2', tempId: 'n2', nodeType: 'action', nodeSubtype: 'send_zalo_personal', nodeName: 'Gửi Zalo',
      config: { ...(zaloAccountId ? { zaloAccountId } : {}), zaloRecipientSource: 'manual', zaloPersonalTemplateSteps: [{ templateId }] },
    },
    { id: 'n3', tempId: 'n3', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', config: {} },
  ],
  connections: [{ sourceNodeId: 'n1', targetNodeId: 'n2' }, { sourceNodeId: 'n2', targetNodeId: 'n3' }],
});

// Người nhận nhập trực tiếp phải đúng kênh của script (Email chỉ nhận email; Zalo cá nhân chỉ nhận SĐT/UID).
/** Node sau canonicalize có thể mang node_subtype hoặc nodeSubtype — tìm theo cả hai. */
const findNode = (script, subtype) => script.nodes.find((n) => (n.node_subtype || n.nodeSubtype) === subtype);

const emailRecipients = () => ({ emails: ['khach@example.test'] });
const zaloRecipients = () => ({ phones: ['0900000001'] });

const prepareAsEmployee = (employee, owner, script, directRecipients) => request(app)
  .post('/api/ai/prepare-campaign')
  .set('Authorization', `Bearer ${tokenOf(employee)}`)
  .set('X-Owner-Context', String(owner.id))
  .send({ script, directRecipients });

describe('POST /api/ai/prepare-campaign — nhân viên dùng tài khoản + mẫu của CHỦ', () => {
  it('Email: tài khoản gửi + mẫu của chủ chọn được → readyToCreate, không missing_sender / template_not_found', async () => {
    const owner = await createUser({ email: 'g3a-conf-owner@test.com', username: 'g3a_conf_owner' });
    const employee = await createUser({ email: 'g3a-conf-emp@test.com', username: 'g3a_conf_emp', role: 'employee' });
    await addEmployee(owner, employee);
    const r = await seedOwnerResources(owner.id);

    const res = await prepareAsEmployee(employee, owner, emailScript({ fromEmailId: r.emailId, templateId: r.emailTemplateId }), emailRecipients());

    expect(res.status).toBe(200);
    const view = res.body.data.confirmationView;
    expect(view.blockingIssues).toEqual([]);
    expect(view.readyToCreate).toBe(true);
    expect(view.steps[0].content.templateName).toBe('Mẫu email của chủ');
  });

  it('Email: node chưa chọn tài khoản → prepareScript điền tài khoản mặc định CỦA CHỦ và thẻ sẵn sàng', async () => {
    const owner = await createUser({ email: 'g3a-conf-owner2@test.com', username: 'g3a_conf_owner2' });
    const employee = await createUser({ email: 'g3a-conf-emp2@test.com', username: 'g3a_conf_emp2', role: 'employee' });
    await addEmployee(owner, employee);
    const r = await seedOwnerResources(owner.id);

    const res = await prepareAsEmployee(employee, owner, emailScript({ fromEmailId: null, templateId: r.emailTemplateId }), emailRecipients());

    expect(res.status).toBe(200);
    expect(res.body.data.confirmationView.readyToCreate).toBe(true);
    const sendNode = findNode(res.body.data.preparedScript, 'send_email');
    expect(Number(sendNode.config.fromEmailId)).toBe(Number(r.emailId));
  });

  it('Zalo cá nhân: tài khoản + mẫu của chủ chọn được (explicit), và mặc định của chủ được điền khi để trống', async () => {
    const owner = await createUser({ email: 'g3a-conf-owner3@test.com', username: 'g3a_conf_owner3' });
    const employee = await createUser({ email: 'g3a-conf-emp3@test.com', username: 'g3a_conf_emp3', role: 'employee' });
    await addEmployee(owner, employee);
    const r = await seedOwnerResources(owner.id);

    const explicit = await prepareAsEmployee(employee, owner, zaloScript({ zaloAccountId: r.zaloId, templateId: r.zaloTemplateId }), zaloRecipients());
    expect(explicit.status).toBe(200);
    expect(explicit.body.data.confirmationView.blockingIssues).toEqual([]);
    expect(explicit.body.data.confirmationView.readyToCreate).toBe(true);

    const byDefault = await prepareAsEmployee(employee, owner, zaloScript({ zaloAccountId: null, templateId: r.zaloTemplateId }), zaloRecipients());
    expect(byDefault.status).toBe(200);
    expect(byDefault.body.data.confirmationView.readyToCreate).toBe(true);
    const sendNode = findNode(byDefault.body.data.preparedScript, 'send_zalo_personal');
    expect(Number(sendNode.config.zaloAccountId)).toBe(Number(r.zaloId));
    // Node select_zalo_account do patchDeterministicCampaignScript chèn cũng mang tài khoản mặc định của CHỦ.
    const selectNode = findNode(byDefault.body.data.preparedScript, 'select_zalo_account');
    expect(Number(selectNode.config.zaloAccountId)).toBe(Number(r.zaloId));
  });

  it('fail-closed: người ngoài (workspace khác) dùng id tài khoản + mẫu của chủ → bị chặn missing_sender + template_not_found', async () => {
    const owner = await createUser({ email: 'g3a-conf-owner4@test.com', username: 'g3a_conf_owner4' });
    const outsider = await createUser({ email: 'g3a-conf-out4@test.com', username: 'g3a_conf_out4' });
    const r = await seedOwnerResources(owner.id);

    const res = await request(app)
      .post('/api/ai/prepare-campaign')
      .set('Authorization', `Bearer ${tokenOf(outsider)}`)
      .send({
        script: emailScript({ fromEmailId: r.emailId, templateId: r.emailTemplateId }),
        directRecipients: emailRecipients(),
      });

    expect(res.status).toBe(200);
    const view = res.body.data.confirmationView;
    expect(view.readyToCreate).toBe(false);
    expect(view.blockingIssues.map((i) => i.code)).toEqual(expect.arrayContaining(['missing_sender', 'template_not_found']));
  });
});
