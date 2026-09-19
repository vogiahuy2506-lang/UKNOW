/**
 * Integration tests cho PR-N3b:
 * 1. Đường rút lại đồng ý cho lead (GET /api/leads/unsubscribe/:token)
 * 2. Cột nguồn đồng ý cho khách hàng (customers.consent_source)
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import leadRepository from '../../src/repositories/lead.repository.js';
import customerMutationService from '../../src/services/customer/customerMutation.service.js';
import leadService from '../../src/services/lead/lead.service.js';
import campaignEmailSenderRepository from '../../src/repositories/campaign/campaignEmailSender.repository.js';
import campaignEmailSenderService from '../../src/services/campaign/campaignEmailSender.service.js';
import { CAMPAIGN_EMAIL_SKIP_LABELS } from '../../src/services/campaign/campaignRun.service.js';

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

describe('PR-N3b: Lead Consent Withdrawal & Customer Consent Source', () => {
  describe('Việc 1: Lead Consent Withdrawal (GET /api/leads/unsubscribe/:token)', () => {
    it('lead tạo mới tự sinh unsubscribe_token kiểu UUID hợp lệ', async () => {
      const owner = await createUser({ username: 'lead_owner_1' });
      const lead = await leadRepository.insertLead({
        lastName: 'Tran',
        firstName: 'Van B',
        email: 'tranvanb@example.com',
        phone: '0912345678',
        occupation: 'teacher',
        interestArea: 'education',
        marketingConsent: true,
        landingPageSlug: 'khoa-hoc-ai',
        idUser: owner.id,
      });

      expect(lead).toBeDefined();
      expect(lead.unsubscribeToken).toBeDefined();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(lead.unsubscribeToken)).toBe(true);
      expect(lead.consentWithdrawnAt).toBeNull();
      expect(lead.marketingConsent).toBe(true);
    });

    it('mở link huỷ với token hợp lệ: trả HTML 200, marketing_consent = FALSE, consent_withdrawn_at có giá trị', async () => {
      const owner = await createUser({ username: 'lead_owner_2' });
      const lead = await leadRepository.insertLead({
        lastName: 'Le',
        firstName: 'Thi C',
        email: 'lethic@example.com',
        phone: '0987654321',
        occupation: 'designer',
        interestArea: 'design',
        marketingConsent: true,
        landingPageSlug: 'design-master',
        idUser: owner.id,
      });

      const res = await request(app).get(`/api/leads/unsubscribe/${lead.unsubscribeToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('Rút lại đồng ý thành công');
      expect(res.text).toContain('Consent withdrawn successfully');

      // Kiểm tra DB
      const dbCheck = await db.query('SELECT marketing_consent, consent_withdrawn_at FROM leads WHERE id = $1', [lead.id]);
      expect(dbCheck.rows[0].marketing_consent).toBe(false);
      expect(dbCheck.rows[0].consent_withdrawn_at).not.toBeNull();
    });

    it('mở lại đúng link đó lần hai: vẫn 200, idempotent, không đổi consent_withdrawn_at', async () => {
      const owner = await createUser({ username: 'lead_owner_3' });
      const lead = await leadRepository.insertLead({
        lastName: 'Pham',
        firstName: 'D',
        email: 'phamd@example.com',
        phone: '0933333333',
        occupation: 'marketing',
        interestArea: 'seo',
        marketingConsent: true,
        landingPageSlug: 'seo-pro',
        idUser: owner.id,
      });

      // Lần 1
      const res1 = await request(app).get(`/api/leads/unsubscribe/${lead.unsubscribeToken}`);
      expect(res1.status).toBe(200);

      const dbCheck1 = await db.query('SELECT marketing_consent, consent_withdrawn_at FROM leads WHERE id = $1', [lead.id]);
      const initialTimestamp = new Date(dbCheck1.rows[0].consent_withdrawn_at).getTime();

      // Đợi ngắn
      await new Promise((r) => setTimeout(r, 50));

      // Lần 2
      const res2 = await request(app).get(`/api/leads/unsubscribe/${lead.unsubscribeToken}`);
      expect(res2.status).toBe(200);
      expect(res2.text).toContain('Yêu cầu đã được ghi nhận trước đó');
      expect(res2.text).toContain('Request already recorded');

      const dbCheck2 = await db.query('SELECT marketing_consent, consent_withdrawn_at FROM leads WHERE id = $1', [lead.id]);
      const secondTimestamp = new Date(dbCheck2.rows[0].consent_withdrawn_at).getTime();

      expect(dbCheck2.rows[0].marketing_consent).toBe(false);
      expect(secondTimestamp).toBe(initialTimestamp);
    });

    it('token không tồn tại (UUID ngẫu nhiên): trả HTML 404 thân thiện, không 500', async () => {
      const nonExistentToken = 'a0000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/leads/unsubscribe/${nonExistentToken}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('Không tìm thấy thông tin đăng ký tương ứng');
      expect(res.text).toContain('Link not found');
    });

    it('token sai cú pháp (không phải UUID): trả HTML 404 thân thiện, không 500', async () => {
      const malformedToken = 'malformed-token-123';
      const res = await request(app).get(`/api/leads/unsubscribe/${malformedToken}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('Liên kết không hợp lệ');
      expect(res.text).toContain('Invalid link');
    });
  });

  describe('Việc 2: Customer Consent Source', () => {
    it('tạo khách hàng thủ công: consent_source mặc định là manual', async () => {
      const owner = await createUser({ username: 'cust_owner_1' });
      const token = await loginAs(owner);

      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'manual@test.local',
          phone: '0911222333',
          fullName: 'Khach Thu Cong',
          customerSource: 'uknow_campaign',
        });

      expect(res.status).toBe(201);
      const customerId = res.body.data.id;

      const dbRow = await db.query('SELECT consent_source, email_subscribed FROM customers WHERE id = $1', [customerId]);
      expect(dbRow.rows[0].consent_source).toBe('manual');
      expect(dbRow.rows[0].email_subscribed).toBe(true);
    });

    it('bulkUpsert: item từ lead landing có consent_source = landing_lead, item thường có consent_source = import', async () => {
      const owner = await createUser({ username: 'cust_owner_2' });

      await customerMutationService.bulkUpsert({
        workspaceOwnerId: owner.id,
        actorUserId: owner.id,
        payload: {
          items: [
            {
              email: 'landing_lead@test.local',
              fullName: 'Khach Landing',
              sourceLandingPage: 'chien-dich-mua-he',
            },
            {
              email: 'regular_import@test.local',
              fullName: 'Khach Import',
            },
          ],
        },
      });

      const rows = await db.query(
        `SELECT email, consent_source, email_subscribed FROM customers WHERE id_user = $1 ORDER BY email ASC`,
        [owner.id]
      );

      expect(rows.rows).toHaveLength(2);
      const landingLead = rows.rows.find((r) => r.email === 'landing_lead@test.local');
      const regularImport = rows.rows.find((r) => r.email === 'regular_import@test.local');

      expect(landingLead.consent_source).toBe('landing_lead');
      expect(landingLead.email_subscribed).toBe(true);

      expect(regularImport.consent_source).toBe('import');
      expect(regularImport.email_subscribed).toBe(true);
    });

    it('GET /api/customers với bộ lọc consentSource trả đúng danh sách', async () => {
      const owner = await createUser({ username: 'cust_owner_3' });
      const token = await loginAs(owner);

      // Tạo 1 manual, 1 landing_lead, 1 import
      await db.query(
        `INSERT INTO customers (id_user, workspace_owner_id, email, full_name, consent_source, customer_source)
         VALUES
           ($1, $1, 'c1@test.local', 'Khach 1', 'manual', 'uknow_campaign'),
           ($1, $1, 'c2@test.local', 'Khach 2', 'landing_lead', 'uknow_campaign'),
           ($1, $1, 'c3@test.local', 'Khach 3', 'import', 'uknow_campaign')`,
        [owner.id]
      );

      // Lọc consentSource = landing_lead
      const resLanding = await request(app)
        .get('/api/customers?consentSource=landing_lead')
        .set('Authorization', `Bearer ${token}`);

      expect(resLanding.status).toBe(200);
      expect(resLanding.body.data.items).toHaveLength(1);
      expect(resLanding.body.data.items[0].email).toBe('c2@test.local');
      expect(resLanding.body.data.items[0].consentSource).toBe('landing_lead');

      // Lọc consentSource = manual
      const resManual = await request(app)
        .get('/api/customers?consentSource=manual')
        .set('Authorization', `Bearer ${token}`);

      expect(resManual.status).toBe(200);
      expect(resManual.body.data.items).toHaveLength(1);
      expect(resManual.body.data.items[0].email).toBe('c1@test.local');
      expect(resManual.body.data.items[0].consentSource).toBe('manual');
    });
  });

  describe('Việc 3: Chiến dịch tôn trọng đồng ý (PR-1)', () => {
    it('Node read_landing_leads: 1 lead TRUE + 1 FALSE + 1 NULL → chỉ lấy 2 người (TRUE + NULL), total = 2, excludedRefusedConsent = 1', async () => {
      const owner = await createUser({ username: 'lead_owner_consent_1' });

      // Lead TRUE
      await leadRepository.insertLead({
        lastName: 'Nguyen',
        firstName: 'Dong Y',
        email: 'dongy@test.local',
        phone: '0911111111',
        marketingConsent: true,
        landingPageSlug: 'landing-1',
        idUser: owner.id,
      });

      // Lead FALSE (từ chối)
      await leadRepository.insertLead({
        lastName: 'Tran',
        firstName: 'Tu Choi',
        email: 'tuchoi@test.local',
        phone: '0922222222',
        marketingConsent: false,
        landingPageSlug: 'landing-1',
        idUser: owner.id,
      });

      // Lead NULL (chưa hỏi / form cũ)
      await leadRepository.insertLead({
        lastName: 'Le',
        firstName: 'Chua Hoi',
        email: 'chuahoi@test.local',
        phone: '0933333333',
        marketingConsent: null,
        landingPageSlug: 'landing-1',
        idUser: owner.id,
      });

      const config = { workspaceOwnerId: owner.id };
      const result = await leadService.getLeadsForCampaignConfig(config);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.excludedRefusedConsent).toBe(1);

      const emails = result.items.map((i) => i.email).sort();
      expect(emails).toEqual(['chuahoi@test.local', 'dongy@test.local']);
      expect(emails).not.toContain('tuchoi@test.local');
    });

    it('GET /api/leads/preview: items.length = 2, total = 2, excludedRefusedConsent = 1', async () => {
      const owner = await createUser({ username: 'lead_owner_consent_2' });
      const token = await loginAs(owner);

      await leadRepository.insertLead({
        lastName: 'A',
        firstName: '1',
        email: 'a1@test.local',
        marketingConsent: true,
        landingPageSlug: 'landing-prev',
        idUser: owner.id,
      });
      await leadRepository.insertLead({
        lastName: 'B',
        firstName: '2',
        email: 'b2@test.local',
        marketingConsent: false,
        landingPageSlug: 'landing-prev',
        idUser: owner.id,
      });
      await leadRepository.insertLead({
        lastName: 'C',
        firstName: '3',
        email: 'c3@test.local',
        marketingConsent: null,
        landingPageSlug: 'landing-prev',
        idUser: owner.id,
      });

      const res = await request(app)
        .get('/api/leads/preview')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.pagination.excludedRefusedConsent).toBe(1);

      const emails = res.body.data.items.map((i) => i.email).sort();
      expect(emails).toEqual(['a1@test.local', 'c3@test.local']);
      expect(emails).not.toContain('b2@test.local');
    });

    it('Lead đã bấm link huỷ (marketing_consent = FALSE + consent_withdrawn_at) không nằm trong danh sách gửi', async () => {
      const owner = await createUser({ username: 'lead_owner_consent_3' });

      const lead = await leadRepository.insertLead({
        lastName: 'Vo',
        firstName: 'Huy',
        email: 'huy@test.local',
        marketingConsent: true,
        landingPageSlug: 'landing-unsub',
        idUser: owner.id,
      });

      // Bấm link huỷ
      const unsubRes = await request(app).get(`/api/leads/unsubscribe/${lead.unsubscribeToken}`);
      expect(unsubRes.status).toBe(200);

      const result = await leadService.getLeadsForCampaignConfig({ workspaceOwnerId: owner.id });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.excludedRefusedConsent).toBe(1);
    });

    it('GET /api/leads (bảng quản lý) và export: vẫn đủ 3 dòng, KHÔNG bị lọc', async () => {
      const owner = await createUser({ username: 'lead_owner_consent_4' });
      const token = await loginAs(owner);

      await leadRepository.insertLead({
        lastName: 'A',
        firstName: '1',
        email: 'm1@test.local',
        marketingConsent: true,
        landingPageSlug: 'l1',
        idUser: owner.id,
      });
      await leadRepository.insertLead({
        lastName: 'B',
        firstName: '2',
        email: 'm2@test.local',
        marketingConsent: false,
        landingPageSlug: 'l1',
        idUser: owner.id,
      });
      await leadRepository.insertLead({
        lastName: 'C',
        firstName: '3',
        email: 'm3@test.local',
        marketingConsent: null,
        landingPageSlug: 'l1',
        idUser: owner.id,
      });

      // GET /api/leads
      const resList = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${token}`);

      expect(resList.status).toBe(200);
      expect(resList.body.data.items).toHaveLength(3);
      expect(resList.body.data.pagination.total).toBe(3);

      // GET /api/leads/export
      const resExport = await request(app)
        .get('/api/leads/export')
        .set('Authorization', `Bearer ${token}`);

      expect(resExport.status).toBe(200);
      expect(resExport.headers['content-type']).toContain('spreadsheetml');
    });

    it('Người rút đồng ý giữa lượt chạy: lúc gửi bị bỏ qua với reason=consent_withdrawn', async () => {
      const owner = await createUser({ username: 'lead_owner_consent_5' });

      // Lead trong DB có marketing_consent = false
      await leadRepository.insertLead({
        lastName: 'Dang',
        firstName: 'Rut',
        email: 'rutdongy@test.local',
        marketingConsent: false,
        consentWithdrawnAt: new Date(),
        landingPageSlug: 'l-rut',
        idUser: owner.id,
      });

      // Tra trực tiếp DB qua repository
      const isRefused = await campaignEmailSenderRepository.isLeadConsentRefusedOrWithdrawn(
        owner.id,
        'rutdongy@test.local'
      );
      expect(isRefused).toBe(true);

      // Lead TRUE không bị từ chối
      await leadRepository.insertLead({
        lastName: 'Khong',
        firstName: 'Rut',
        email: 'khongrut@test.local',
        marketingConsent: true,
        landingPageSlug: 'l-rut',
        idUser: owner.id,
      });
      const notRefused = await campaignEmailSenderRepository.isLeadConsentRefusedOrWithdrawn(
        owner.id,
        'khongrut@test.local'
      );
      expect(notRefused).toBe(false);

      // Cấu hình email settings mặc định cho user
      await db.query(
        `INSERT INTO email_settings (id_user, name, email, reply_to, smtp_host, smtp_port, is_verified, status)
         VALUES ($1, 'Tester', 'sender@test.local', 'sender@test.local', 'smtp.test', 587, true, 'active')`,
        [owner.id]
      );

      // Gửi thử qua campaignEmailSenderService.sendEmailToCustomerDirect
      const actionNode = {
        id: 'node_send_email',
        data: {
          emailSubject: 'Tiêu đề thử',
          emailBody: '<p>Nội dung thử</p>',
          emailFromAddress: 'sender@example.com',
        },
      };
      const customer = { email: 'rutdongy@test.local', full_name: 'Dang Rut' };
      const campaign = { id: 999, id_user: owner.id };
      const sendResult = await campaignEmailSenderService.sendEmailToCustomerDirect(
        actionNode,
        customer,
        campaign,
        1001,
        null,
        { emailStep: 1 }
      );

      expect(sendResult).toEqual({
        to: 'rutdongy@test.local',
        status: 'skipped',
        reason: 'consent_withdrawn',
      });

      // Nhãn tiếng Việt cho lý do consent_withdrawn (dùng cho ledger/execution log)
      expect(CAMPAIGN_EMAIL_SKIP_LABELS.consent_withdrawn).toBe('Khách đã rút lại đồng ý nhận tin');
    });
  });
});
