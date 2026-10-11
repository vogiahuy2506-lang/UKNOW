/**
 * Integration tests — chốt đồng ý trước khi gửi phải đọc CẢ Biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING PR-2,
 * Nghị định 330 về đồng ý dữ liệu).
 *
 * Trước PR này `isLeadConsentRefusedOrWithdrawn` / `isLeadPhoneConsentRefused` CHỈ đọc `leads`
 * (`campaignEmailSender.repository.js`): người TỪ CHỐI qua Biểu mẫu vẫn bị gửi email / Zalo / WhatsApp.
 *
 * Quy tắc đang pin:
 *   - bản ghi MỚI NHẤT giữa `leads` và `form_submissions` (cùng workspace, khớp email lowercase / 9 số cuối SĐT) quyết định;
 *   - marketing_consent = FALSE → chặn; NULL (chưa hỏi) → KHÔNG chặn (chốt 19/09);
 *   - rút đồng ý qua link footer (cả lead lẫn Biểu mẫu) UPDATE TẠI CHỖ marketing_consent = FALSE + consent_withdrawn_at,
 *     không đổi created_at → "mới nhất" tính theo GREATEST(created_at, consent_withdrawn_at);
 *   - bài nộp của workspace KHÁC không ảnh hưởng.
 *
 * Không mock DB: truy vấn chạy trên Postgres thật; bản ghi dựng bằng SQL trực tiếp để đặt created_at tường minh.
 */
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import campaignEmailSenderRepository from '../../src/repositories/campaign/campaignEmailSender.repository.js';
import campaignEmailSenderService from '../../src/services/campaign/campaignEmailSender.service.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

const HOURS_AGO = (h) => new Date(Date.now() - h * 3600 * 1000);

async function createForm(ownerId) {
  const { rows } = await db.query(
    `INSERT INTO forms (workspace_owner_id, created_by_user_id, public_key, title, fields, settings, is_published)
     VALUES ($1, $1, $2, 'Biểu mẫu thử đồng ý', '[]'::jsonb, '{}'::jsonb, TRUE)
     RETURNING id`,
    [ownerId, crypto.randomBytes(12).toString('hex')]
  );
  return rows[0].id;
}

/** Bài nộp Biểu mẫu với created_at tường minh. consent: true | false | null. */
async function insertSubmission(formId, ownerId, { email = null, phone = null, consent = null, createdAt = new Date() }) {
  const { rows } = await db.query(
    `INSERT INTO form_submissions (
       form_id, workspace_owner_id, access_token, answers,
       respondent_name, respondent_email, respondent_phone, marketing_consent, created_at
     ) VALUES ($1, $2, $3, '{}'::jsonb, 'Người nộp', $4, $5, $6, $7)
     RETURNING id, unsubscribe_token`,
    [formId, ownerId, crypto.randomBytes(32).toString('hex'), email, phone, consent, createdAt]
  );
  return { id: rows[0].id, unsubscribeToken: rows[0].unsubscribe_token };
}

/** Lead (form cũ trên landing) với created_at tường minh. */
async function insertLead(ownerId, { email = null, phone = null, consent = null, createdAt = new Date() }) {
  const { rows } = await db.query(
    `INSERT INTO leads (id_user, workspace_owner_id, last_name, first_name, email, phone, marketing_consent, created_at)
     VALUES ($1, $1, 'Lead', 'Thử', $2, $3, $4, $5)
     RETURNING id, unsubscribe_token`,
    [ownerId, email, phone, consent, createdAt]
  );
  return { id: rows[0].id, unsubscribeToken: rows[0].unsubscribe_token };
}

const emailRefused = (ownerId, email) =>
  campaignEmailSenderRepository.isLeadConsentRefusedOrWithdrawn(ownerId, email);
const phoneRefused = (ownerId, phone) =>
  campaignEmailSenderRepository.isLeadPhoneConsentRefused(ownerId, phone);

describe('PR-2 — chốt đồng ý đọc cả Biểu mẫu', () => {
  describe('1. Chỉ có bài nộp Biểu mẫu', () => {
    it('marketing_consent = FALSE → chặn cả email lẫn SĐT (mọi định dạng SĐT)', async () => {
      const owner = await createUser({ username: 'cg_owner_1' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, {
        email: 'tuchoi@test.local',
        phone: '0912345678',
        consent: false,
      });

      expect(await emailRefused(owner.id, 'tuchoi@test.local')).toBe(true);
      expect(await phoneRefused(owner.id, '0912345678')).toBe(true);
      // Cùng người, SĐT viết kiểu quốc tế / có dấu: so 9 chữ số cuối như đường leads.
      expect(await phoneRefused(owner.id, '+84912345678')).toBe(true);
      expect(await phoneRefused(owner.id, '091-234-5678')).toBe(true);
    });

    it('khớp email không phân biệt hoa/thường ở phía bài nộp (dòng cũ lưu hoa)', async () => {
      const owner = await createUser({ username: 'cg_owner_1b' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, { email: 'Hoa.Thuong@Test.Local', consent: false });

      expect(await emailRefused(owner.id, 'hoa.thuong@test.local')).toBe(true);
    });

    it('bài nộp từ chối KHÔNG có email → không chặn một email lạ; chỉ chặn đúng SĐT của nó', async () => {
      const owner = await createUser({ username: 'cg_owner_1c' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, { email: null, phone: '0987654321', consent: false });

      expect(await emailRefused(owner.id, 'khac@test.local')).toBe(false);
      expect(await emailRefused(owner.id, '')).toBe(false);
      expect(await phoneRefused(owner.id, '0987654321')).toBe(true);
      expect(await phoneRefused(owner.id, '0900000000')).toBe(false);
    });

    it('marketing_consent = TRUE → không chặn', async () => {
      const owner = await createUser({ username: 'cg_owner_1d' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, { email: 'dongy@test.local', phone: '0911111111', consent: true });

      expect(await emailRefused(owner.id, 'dongy@test.local')).toBe(false);
      expect(await phoneRefused(owner.id, '0911111111')).toBe(false);
    });
  });

  describe('2. Bản ghi MỚI NHẤT giữa leads và form_submissions quyết định', () => {
    it('lead cũ từ chối → bài nộp Biểu mẫu MỚI HƠN đồng ý → KHÔNG chặn', async () => {
      const owner = await createUser({ username: 'cg_owner_2a' });
      const formId = await createForm(owner.id);
      await insertLead(owner.id, { email: 'a@test.local', phone: '0922222222', consent: false, createdAt: HOURS_AGO(3) });
      await insertSubmission(formId, owner.id, {
        email: 'a@test.local', phone: '0922222222', consent: true, createdAt: HOURS_AGO(1),
      });

      expect(await emailRefused(owner.id, 'a@test.local')).toBe(false);
      expect(await phoneRefused(owner.id, '0922222222')).toBe(false);
    });

    it('lead cũ đồng ý → bài nộp Biểu mẫu MỚI HƠN từ chối → CHẶN', async () => {
      const owner = await createUser({ username: 'cg_owner_2b' });
      const formId = await createForm(owner.id);
      await insertLead(owner.id, { email: 'b@test.local', phone: '0933333333', consent: true, createdAt: HOURS_AGO(3) });
      await insertSubmission(formId, owner.id, {
        email: 'b@test.local', phone: '0933333333', consent: false, createdAt: HOURS_AGO(1),
      });

      expect(await emailRefused(owner.id, 'b@test.local')).toBe(true);
      expect(await phoneRefused(owner.id, '0933333333')).toBe(true);
    });

    it('bài nộp Biểu mẫu cũ từ chối → lead MỚI HƠN đồng ý → KHÔNG chặn', async () => {
      const owner = await createUser({ username: 'cg_owner_2c' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, {
        email: 'c@test.local', phone: '0944444444', consent: false, createdAt: HOURS_AGO(3),
      });
      await insertLead(owner.id, { email: 'c@test.local', phone: '0944444444', consent: true, createdAt: HOURS_AGO(1) });

      expect(await emailRefused(owner.id, 'c@test.local')).toBe(false);
      expect(await phoneRefused(owner.id, '0944444444')).toBe(false);
    });

    it('bài nộp Biểu mẫu cũ đồng ý → lead MỚI HƠN từ chối → CHẶN', async () => {
      const owner = await createUser({ username: 'cg_owner_2d' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, {
        email: 'd@test.local', phone: '0955555555', consent: true, createdAt: HOURS_AGO(3),
      });
      await insertLead(owner.id, { email: 'd@test.local', phone: '0955555555', consent: false, createdAt: HOURS_AGO(1) });

      expect(await emailRefused(owner.id, 'd@test.local')).toBe(true);
      expect(await phoneRefused(owner.id, '0955555555')).toBe(true);
    });

    it('hai bài nộp Biểu mẫu cùng email: bài mới nhất thắng (cũ FALSE/mới TRUE → gửi; cũ TRUE/mới FALSE → chặn)', async () => {
      const owner = await createUser({ username: 'cg_owner_2e' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, { email: 'e1@test.local', consent: false, createdAt: HOURS_AGO(3) });
      await insertSubmission(formId, owner.id, { email: 'e1@test.local', consent: true, createdAt: HOURS_AGO(1) });
      await insertSubmission(formId, owner.id, { email: 'e2@test.local', consent: true, createdAt: HOURS_AGO(3) });
      await insertSubmission(formId, owner.id, { email: 'e2@test.local', consent: false, createdAt: HOURS_AGO(1) });

      expect(await emailRefused(owner.id, 'e1@test.local')).toBe(false);
      expect(await emailRefused(owner.id, 'e2@test.local')).toBe(true);
    });
  });

  describe('3. marketing_consent IS NULL = chưa hỏi = KHÔNG chặn (chốt 19/09)', () => {
    it('NULL ở cả lead lẫn bài nộp → không chặn', async () => {
      const owner = await createUser({ username: 'cg_owner_3a' });
      const formId = await createForm(owner.id);
      await insertLead(owner.id, { email: 'n@test.local', phone: '0966666666', consent: null, createdAt: HOURS_AGO(3) });
      await insertSubmission(formId, owner.id, {
        email: 'n@test.local', phone: '0966666666', consent: null, createdAt: HOURS_AGO(1),
      });

      expect(await emailRefused(owner.id, 'n@test.local')).toBe(false);
      expect(await phoneRefused(owner.id, '0966666666')).toBe(false);
    });

    it('chỉ có bài nộp Biểu mẫu NULL → không chặn', async () => {
      const owner = await createUser({ username: 'cg_owner_3b' });
      const formId = await createForm(owner.id);
      await insertSubmission(formId, owner.id, { email: 'n2@test.local', phone: '0977777777', consent: null });

      expect(await emailRefused(owner.id, 'n2@test.local')).toBe(false);
      expect(await phoneRefused(owner.id, '0977777777')).toBe(false);
    });
  });

  describe('4. Workspace khác không ảnh hưởng', () => {
    it('bài nộp từ chối ở workspace B không chặn người đó ở workspace A (và ngược lại vẫn chặn đúng ở B)', async () => {
      const ownerA = await createUser({ username: 'cg_owner_4a' });
      const ownerB = await createUser({ username: 'cg_owner_4b' });
      const formB = await createForm(ownerB.id);
      await insertSubmission(formB, ownerB.id, { email: 'x@test.local', phone: '0988888888', consent: false });

      expect(await emailRefused(ownerA.id, 'x@test.local')).toBe(false);
      expect(await phoneRefused(ownerA.id, '0988888888')).toBe(false);
      expect(await emailRefused(ownerB.id, 'x@test.local')).toBe(true);
      expect(await phoneRefused(ownerB.id, '0988888888')).toBe(true);
    });

    it('bài nộp workspace B MỚI HƠN không đè lead từ chối của workspace A', async () => {
      const ownerA = await createUser({ username: 'cg_owner_4c' });
      const ownerB = await createUser({ username: 'cg_owner_4d' });
      const formB = await createForm(ownerB.id);
      await insertLead(ownerA.id, { email: 'y@test.local', phone: '0999000111', consent: false, createdAt: HOURS_AGO(3) });
      await insertSubmission(formB, ownerB.id, {
        email: 'y@test.local', phone: '0999000111', consent: true, createdAt: HOURS_AGO(1),
      });

      expect(await emailRefused(ownerA.id, 'y@test.local')).toBe(true);
      expect(await phoneRefused(ownerA.id, '0999000111')).toBe(true);
    });
  });

  describe('5. Huỷ đăng ký qua link footer', () => {
    it('Biểu mẫu: bấm link /api/public/forms/unsubscribe/:token → chặn email + SĐT', async () => {
      const owner = await createUser({ username: 'cg_owner_5a' });
      const formId = await createForm(owner.id);
      const sub = await insertSubmission(formId, owner.id, {
        email: 'rut@test.local', phone: '0901010101', consent: true,
      });
      expect(await emailRefused(owner.id, 'rut@test.local')).toBe(false);
      expect(await phoneRefused(owner.id, '0901010101')).toBe(false);

      const res = await request(app).get(`/api/public/forms/unsubscribe/${sub.unsubscribeToken}`);
      expect(res.status).toBe(200);

      const row = await db.query(
        'SELECT marketing_consent, consent_withdrawn_at FROM form_submissions WHERE id = $1',
        [sub.id]
      );
      expect(row.rows[0].marketing_consent).toBe(false);
      expect(row.rows[0].consent_withdrawn_at).not.toBeNull();

      expect(await emailRefused(owner.id, 'rut@test.local')).toBe(true);
      expect(await phoneRefused(owner.id, '0901010101')).toBe(true);
    });

    it('Biểu mẫu: bài nộp đồng ý bị rút SAU KHI có lead mới hơn đồng ý → vẫn CHẶN (lời rút đè bản ghi cũ-hơn-lúc-rút)', async () => {
      const owner = await createUser({ username: 'cg_owner_5b' });
      const formId = await createForm(owner.id);
      const sub = await insertSubmission(formId, owner.id, {
        email: 'rut2@test.local', phone: '0902020202', consent: true, createdAt: HOURS_AGO(3),
      });
      await insertLead(owner.id, { email: 'rut2@test.local', phone: '0902020202', consent: true, createdAt: HOURS_AGO(1) });
      // Trước khi rút: lead mới nhất đồng ý → gửi.
      expect(await emailRefused(owner.id, 'rut2@test.local')).toBe(false);

      const res = await request(app).get(`/api/public/forms/unsubscribe/${sub.unsubscribeToken}`);
      expect(res.status).toBe(200);

      expect(await emailRefused(owner.id, 'rut2@test.local')).toBe(true);
      expect(await phoneRefused(owner.id, '0902020202')).toBe(true);
    });

    it('Lead: rút qua /api/leads/unsubscribe/:token SAU KHI có bài nộp Biểu mẫu mới hơn đồng ý → vẫn CHẶN (không hồi quy so với trước PR)', async () => {
      const owner = await createUser({ username: 'cg_owner_5c' });
      const formId = await createForm(owner.id);
      const lead = await insertLead(owner.id, {
        email: 'rut3@test.local', phone: '0903030303', consent: true, createdAt: HOURS_AGO(3),
      });
      await insertSubmission(formId, owner.id, {
        email: 'rut3@test.local', phone: '0903030303', consent: true, createdAt: HOURS_AGO(1),
      });
      expect(await emailRefused(owner.id, 'rut3@test.local')).toBe(false);

      const res = await request(app).get(`/api/leads/unsubscribe/${lead.unsubscribeToken}`);
      expect(res.status).toBe(200);

      expect(await emailRefused(owner.id, 'rut3@test.local')).toBe(true);
      expect(await phoneRefused(owner.id, '0903030303')).toBe(true);
    });

    it('đăng ký lại SAU khi rút (bài nộp mới, đồng ý) → gửi lại được', async () => {
      const owner = await createUser({ username: 'cg_owner_5d' });
      const formId = await createForm(owner.id);
      const sub = await insertSubmission(formId, owner.id, {
        email: 'lai@test.local', consent: true, createdAt: HOURS_AGO(3),
      });
      await request(app).get(`/api/public/forms/unsubscribe/${sub.unsubscribeToken}`).expect(200);
      expect(await emailRefused(owner.id, 'lai@test.local')).toBe(true);

      await insertSubmission(formId, owner.id, { email: 'lai@test.local', consent: true, createdAt: new Date(Date.now() + 1000) });
      expect(await emailRefused(owner.id, 'lai@test.local')).toBe(false);
    });
  });

  describe('6. Hồi quy — dữ liệu chỉ có leads', () => {
    it('lead FALSE / TRUE / NULL / không có → true / false / false / false (email và SĐT)', async () => {
      const owner = await createUser({ username: 'cg_owner_6a' });
      await insertLead(owner.id, { email: 'lf@test.local', phone: '0911000001', consent: false });
      await insertLead(owner.id, { email: 'lt@test.local', phone: '0911000002', consent: true });
      await insertLead(owner.id, { email: 'ln@test.local', phone: '0911000003', consent: null });

      expect(await emailRefused(owner.id, 'lf@test.local')).toBe(true);
      expect(await emailRefused(owner.id, 'lt@test.local')).toBe(false);
      expect(await emailRefused(owner.id, 'ln@test.local')).toBe(false);
      expect(await emailRefused(owner.id, 'khongco@test.local')).toBe(false);

      expect(await phoneRefused(owner.id, '0911000001')).toBe(true);
      expect(await phoneRefused(owner.id, '0911000002')).toBe(false);
      expect(await phoneRefused(owner.id, '0911000003')).toBe(false);
      expect(await phoneRefused(owner.id, '0911999999')).toBe(false);
      // SĐT < 9 chữ số / rỗng / null: không chặn, không ném lỗi.
      expect(await phoneRefused(owner.id, '123456')).toBe(false);
      expect(await phoneRefused(owner.id, '')).toBe(false);
      expect(await phoneRefused(owner.id, null)).toBe(false);
    });

    it('hai lead cùng email: cũ FALSE/mới TRUE → gửi; cũ TRUE/mới FALSE → chặn (created_at DESC như trước)', async () => {
      const owner = await createUser({ username: 'cg_owner_6b' });
      await insertLead(owner.id, { email: 'r1@test.local', consent: false, createdAt: HOURS_AGO(3) });
      await insertLead(owner.id, { email: 'r1@test.local', consent: true, createdAt: HOURS_AGO(1) });
      await insertLead(owner.id, { email: 'r2@test.local', consent: true, createdAt: HOURS_AGO(3) });
      await insertLead(owner.id, { email: 'r2@test.local', consent: false, createdAt: HOURS_AGO(1) });

      expect(await emailRefused(owner.id, 'r1@test.local')).toBe(false);
      expect(await emailRefused(owner.id, 'r2@test.local')).toBe(true);
    });

    it('lead chỉ có id_user (workspace_owner_id NULL, dữ liệu cũ) vẫn được nhận ra', async () => {
      const owner = await createUser({ username: 'cg_owner_6c' });
      await db.query(
        `INSERT INTO leads (id_user, workspace_owner_id, last_name, first_name, email, phone, marketing_consent)
         VALUES ($1, NULL, 'Cu', 'Lead', 'cu@test.local', '0911222333', FALSE)`,
        [owner.id]
      );

      expect(await emailRefused(owner.id, 'cu@test.local')).toBe(true);
      expect(await phoneRefused(owner.id, '0911222333')).toBe(true);
    });

    it('hai lead cùng thời điểm (cùng transaction): id lớn hơn thắng như trước', async () => {
      const owner = await createUser({ username: 'cg_owner_6d' });
      const same = HOURS_AGO(2);
      await insertLead(owner.id, { email: 'tie@test.local', consent: true, createdAt: same });
      await insertLead(owner.id, { email: 'tie@test.local', consent: false, createdAt: same });
      await insertLead(owner.id, { email: 'tie2@test.local', consent: false, createdAt: same });
      await insertLead(owner.id, { email: 'tie2@test.local', consent: true, createdAt: same });

      expect(await emailRefused(owner.id, 'tie@test.local')).toBe(true);
      expect(await emailRefused(owner.id, 'tie2@test.local')).toBe(false);
    });
  });

  describe('7. Đường gửi thật: sendEmailToCustomerDirect', () => {
    async function setup(username) {
      const owner = await createUser({ username });
      await db.query(
        `INSERT INTO email_settings (id_user, name, email, reply_to, smtp_host, smtp_port, is_verified, status)
         VALUES ($1, 'Tester', 'sender@test.local', 'sender@test.local', 'smtp.test', 587, true, 'active')`,
        [owner.id]
      );
      const actionNode = {
        id: 'node_send_email_consent_form',
        data: {
          emailSubject: 'Tiêu đề thử',
          emailBody: '<p>Nội dung thử</p>',
          emailFromAddress: 'sender@example.com',
        },
      };
      const campaign = { id: 998, id_user: owner.id };
      return { owner, actionNode, campaign };
    }

    it('người từ chối qua Biểu mẫu nằm trong danh sách → bị bỏ qua (consent_withdrawn), KHÔNG gọi SMTP; đồng ý lại sau đó → gửi', async () => {
      const { owner, actionNode, campaign } = await setup('cg_owner_7a');
      const formId = await createForm(owner.id);
      const sendRawSpy = jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockResolvedValue({
        info: { messageId: 'test-form-consent-msg' },
      });

      try {
        const email = 'tuchoi.form@test.local';
        await insertSubmission(formId, owner.id, { email, consent: false, createdAt: HOURS_AGO(2) });

        const refused = await campaignEmailSenderService.sendEmailToCustomerDirect(
          actionNode,
          { email, full_name: 'Từ Chối' },
          campaign,
          1002,
          null,
          { emailStep: 1 }
        );
        expect(refused).toEqual({ to: email, status: 'skipped', reason: 'consent_withdrawn' });
        expect(sendRawSpy).not.toHaveBeenCalled();

        // Đồng ý lại ở bài nộp MỚI HƠN → gửi.
        await insertSubmission(formId, owner.id, { email, consent: true, createdAt: HOURS_AGO(1) });
        const sent = await campaignEmailSenderService.sendEmailToCustomerDirect(
          actionNode,
          { email, full_name: 'Từ Chối' },
          campaign,
          1002,
          null,
          { emailStep: 1 }
        );
        expect(sent.status).toBe('success');
        expect(sendRawSpy).toHaveBeenCalledTimes(1);
      } finally {
        sendRawSpy.mockRestore();
      }
    });
  });
});
