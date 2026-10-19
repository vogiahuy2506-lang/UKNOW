/**
 * Integration — Marketplace chiến dịch kèm mẫu (PLAN_MARKETPLACE_CHIEN_DICH_KEM_MAU_2026-10-19).
 *
 * Trước đây chiến dịch mua về chỉ có sơ đồ khối: node gửi trỏ id mẫu của NGƯỜI BÁN mà đường gửi lọc mẫu theo chủ chiến dịch → người
 * mua không gửi được. Giờ: đăng bán chụp nội dung mẫu + gỡ dữ liệu gắn người bán; mua tạo bản sao mẫu thuộc người mua (+ chép tệp,
 * ghi sổ dung lượng) và đổi id mẫu ở cả campaign_nodes lẫn flow_json.
 *
 * Chạy trên Postgres thật. Kho tệp thay bằng kho trong bộ nhớ (chép/xoá/đo cỡ thật sự xảy ra, chỉ không chạm đĩa/GCS).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import aiCreditMeter from '../../src/services/ai/aiCreditMeter.service.js';
import zaloTemplateRepository from '../../src/repositories/zalo/zaloTemplate.repository.js';
import campaignEmailSenderRepository from '../../src/repositories/campaign/campaignEmailSender.repository.js';
import { validateCampaignPreflight } from '../../src/services/campaign/campaignPreflight.service.js';
import { resetStorageBackendForTest, setStorageBackendForTest } from '../../src/services/storage/storageBackend.js';
import { collectRequiredTemplateReferences } from '../../src/utils/campaignTemplateReference.util.js';
import { truncateAll } from './helpers/db.js';

let app;
let deductCreditsSpy;
let storage;

/** Kho tệp trong bộ nhớ, đúng hợp đồng backend đang dùng: getObjectInfo / copy / delete / exists. */
function createMemoryStorage() {
  const files = new Map();
  const state = { copyCalls: 0, failCopyOnCall: null };
  return {
    files,
    state,
    async put(key, content) {
      files.set(key, Buffer.from(content));
    },
    async getObjectInfo(key) {
      return files.has(key) ? { size: files.get(key).length, contentType: null } : null;
    },
    async exists(key) {
      return files.has(key);
    },
    async copy(source, destination) {
      state.copyCalls += 1;
      if (state.failCopyOnCall === state.copyCalls) throw new Error('GCS 503 (giả lập)');
      if (!files.has(source)) throw new Error(`không có tệp nguồn ${source}`);
      files.set(destination, Buffer.from(files.get(source)));
    },
    async delete(keys) {
      for (const key of [].concat(keys)) files.delete(key);
    },
  };
}

beforeAll(() => {
  app = createApp();
  deductCreditsSpy = jest
    .spyOn(aiCreditMeter, 'deductCredits')
    .mockResolvedValue({ success: true, deducted: 50, remaining: { plan: Infinity, wallet: 0 } });
  storage = createMemoryStorage();
  setStorageBackendForTest(storage);
});

afterAll(() => {
  resetStorageBackendForTest();
});

beforeEach(async () => {
  await truncateAll();
  deductCreditsSpy.mockClear();
  storage.files.clear();
  storage.state.copyCalls = 0;
  storage.state.failCopyOnCall = null;
});

async function createUser(username) {
  const passwordHash = await bcrypt.hash('Test123!', 10);
  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, role, status, subscription_expires_at)
     VALUES ($1, $2, $3, 'user', 'active', NOW() + INTERVAL '30 days')
     RETURNING *`,
    [username, `${username}@test.com`, passwordHash]
  );
  return { ...rows[0], plainPassword: 'Test123!' };
}

async function createPlan(code = 'pro') {
  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, ai_credits_per_period, is_active) VALUES ($1, $2, 199000, 1000, true) RETURNING *`,
    [code, code.toUpperCase()]
  );
  return rows[0];
}

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function createActor(username) {
  const user = await createUser(username);
  const plan = await createPlan(`plan-${username}`);
  await db.query('UPDATE users SET active_plan_id = $1 WHERE id = $2', [plan.id, user.id]);
  await db.query(
    `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end)
     VALUES ($1, 'ai_credit', 100, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second')`,
    [user.id]
  );
  return { user, token: await loginAs(user) };
}

async function insertEmailTemplate(userId, { name, subject = 'Tieu de', html = '<p>Noi dung</p>', text = 'Noi dung', attachments = [] }) {
  const { rows } = await db.query(
    `INSERT INTO email_templates (id_user, template_name, template_code, subject, body_html, body_text, attachments, variables, category)
     VALUES ($1, $2, 'MAIL-1', $3, $4, $5, $6, '["ten"]'::jsonb, 'khuyen mai') RETURNING id`,
    [userId, name, subject, html, text, JSON.stringify(attachments)]
  );
  return Number(rows[0].id);
}

async function insertZaloTemplate(userId, { name, text, attachments = [] }) {
  const { rows } = await db.query(
    `INSERT INTO zalo_templates (id_user, template_name, subject, body_text, attachments, variables) VALUES ($1, $2, 'Tieu de', $3, $4, '[]'::jsonb) RETURNING id`,
    [userId, name, text, JSON.stringify(attachments)]
  );
  return Number(rows[0].id);
}

/** Tệp đính kèm của người bán: có thật trong kho (đúng khoá `uploads/<người bán>/…`). */
async function sellerAttachment(sellerId, fileName, sizeBytes) {
  const key = `uploads/${sellerId}/1700000000000_aaaa_${fileName}`;
  await storage.put(key, Buffer.alloc(sizeBytes, 7));
  return { key, url: `https://old.example/${key}`, originalName: fileName, displayName: `Hien thi ${fileName}`, size: sizeBytes, contentType: 'application/pdf', storageObjectId: 4242 };
}

const SELLER_ZALO_ACCOUNT = 55;
const SELLER_EMAIL_ACCOUNT = 3;

/**
 * Chiến dịch người bán: 2 node Zalo dùng 3 mẫu (cá nhân A+B, nhóm B+C) + 1 node email dùng 1 mẫu, mang đủ dữ liệu gắn người bán.
 */
async function seedSellerCampaign(sellerId, { zaloA, zaloB, zaloC, email }) {
  const configs = {
    select: { zaloAccountId: SELLER_ZALO_ACCOUNT, zaloPoolAccountIds: ['55', '56'] },
    personal: {
      zaloAccountId: SELLER_ZALO_ACCOUNT,
      zaloRecipientSource: 'manual',
      zaloRecipientPhones: '0901234567',
      zaloPersonalTemplateSteps: [{ templateId: zaloA }, { templateId: zaloB, delayValue: 1, delayUnit: 'days' }],
    },
    group: {
      zaloAccountId: SELLER_ZALO_ACCOUNT,
      zaloGroupSource: 'manual',
      zaloGroupIds: 'group-cua-nguoi-ban',
      zaloGroupTemplateSteps: [{ templateId: String(zaloB) }, { templateId: zaloC }],
    },
    mail: {
      fromEmailId: SELLER_EMAIL_ACCOUNT,
      recipientSource: 'manual',
      recipientEmails: ['khach-cua-nguoi-ban@example.com'],
      emailSteps: [{ templateId: email }],
      emailTemplateId: email,
    },
  };
  const flowNodes = [
    { id: 'n-select', type: 'task', data: { nodeType: 'select_zalo_account', label: 'Chon nick', config: configs.select } },
    { id: 'n-personal', type: 'task', data: { nodeType: 'send_zalo_personal', label: 'Gui ca nhan', config: configs.personal } },
    { id: 'n-group', type: 'task', data: { nodeType: 'send_zalo_group', label: 'Gui nhom', config: configs.group } },
    { id: 'n-mail', type: 'task', data: { nodeType: 'send_email', label: 'Gui mail', config: configs.mail } },
  ];
  const { rows: campaignRows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, description, campaign_type, status, flow_json)
     VALUES ($1, 'Chien dich ban hang', 'mo ta', 'mixed', 'draft', $2) RETURNING *`,
    [sellerId, JSON.stringify({ nodes: flowNodes, edges: [] })]
  );
  const campaign = campaignRows[0];
  const nodeRows = [
    ['trigger', 'manual_trigger', 'Bat dau', {}],
    ['action', 'select_zalo_account', 'Chon nick', configs.select],
    ['action', 'send_zalo_personal', 'Gui ca nhan', configs.personal],
    ['action', 'send_zalo_group', 'Gui nhom', configs.group],
    ['action', 'send_email', 'Gui mail', configs.mail],
  ];
  let order = 1;
  for (const [type, subtype, name, config] of nodeRows) {
    await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaign.id, type, subtype, name, JSON.stringify(config), order++]
    );
  }
  return campaign;
}

async function seedSellerWithTemplates(sellerId) {
  return {
    zaloA: await insertZaloTemplate(sellerId, { name: 'Zalo A', text: 'Chao {{ten}}, noi dung A' }),
    zaloB: await insertZaloTemplate(sellerId, { name: 'Zalo B', text: 'Noi dung B' }),
    zaloC: await insertZaloTemplate(sellerId, { name: 'Zalo C', text: 'Noi dung C' }),
    email: await insertEmailTemplate(sellerId, { name: 'Mail chao', subject: 'Chao {{ten}}', html: '<p>Xin chao {{ten}}</p>', text: 'Xin chao' }),
  };
}

async function publishListing(seller, campaignId, priceCredits = 0) {
  return request(app)
    .post('/api/marketplace/listings')
    .set('Authorization', `Bearer ${seller.token}`)
    .send({ campaignId, title: 'Chien dich ban hang', priceCredits });
}

const purchase = (buyer, listingId) => request(app).post(`/api/marketplace/purchase/${listingId}`).set('Authorization', `Bearer ${buyer.token}`);
const snapshotOf = async (listingId) => (await db.query('SELECT snapshot_data FROM marketplace_listings WHERE id = $1', [listingId])).rows[0].snapshot_data;
const countRows = async (table, where = 'TRUE', params = []) => (await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, params)).rows[0].n;

describe('Marketplace chiến dịch kèm mẫu', () => {
  describe('đăng bán: snapshot chụp nội dung mẫu, không mang dữ liệu gắn người bán', () => {
    it('2 node Zalo dùng 3 mẫu + 1 node email dùng 1 mẫu → snapshot.templates đủ 3 Zalo + 1 email có nội dung; không còn tài khoản/nhóm/người nhận của người bán', async () => {
      const seller = await createActor('seller');
      const ids = await seedSellerWithTemplates(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);

      const res = await publishListing(seller, campaign.id);
      expect(res.status).toBe(201);

      const snapshot = await snapshotOf(res.body.data.id);
      expect(Object.keys(snapshot.templates.zalo).sort()).toEqual([ids.zaloA, ids.zaloB, ids.zaloC].map(String).sort());
      expect(Object.keys(snapshot.templates.email)).toEqual([String(ids.email)]);
      expect(snapshot.templates.zalo[String(ids.zaloA)]).toMatchObject({ name: 'Zalo A', bodyText: 'Chao {{ten}}, noi dung A' });
      expect(snapshot.templates.email[String(ids.email)]).toMatchObject({
        name: 'Mail chao', code: 'MAIL-1', subject: 'Chao {{ten}}', bodyHtml: '<p>Xin chao {{ten}}</p>', bodyText: 'Xin chao', variables: ['ten'], category: 'khuyen mai',
      });

      // cả `nodes` lẫn `flowJson` đều sạch dữ liệu gắn người bán
      const rawSnapshot = JSON.stringify({ nodes: snapshot.nodes, flowJson: snapshot.flowJson });
      expect(rawSnapshot).not.toContain('group-cua-nguoi-ban');
      expect(rawSnapshot).not.toContain('0901234567');
      expect(rawSnapshot).not.toContain('khach-cua-nguoi-ban@example.com');
      expect(rawSnapshot).not.toContain('"zaloAccountId"');
      expect(rawSnapshot).not.toContain('"fromEmailId"');
      const personalNode = snapshot.nodes.find((n) => n.nodeSubtype === 'send_zalo_personal');
      expect(personalNode.config.zaloPersonalTemplateSteps.map((s) => Number(s.templateId))).toEqual([ids.zaloA, ids.zaloB]); // id mẫu giữ nguyên làm khoá tra
      expect(snapshot.nodes.find((n) => n.nodeSubtype === 'select_zalo_account').config.zaloPoolAccountIds).toEqual([]);
      // chiến dịch gốc của người bán KHÔNG bị sửa
      const sellerNode = (await db.query(`SELECT config FROM campaign_nodes WHERE id_campaign = $1 AND node_subtype = 'send_zalo_group'`, [campaign.id])).rows[0];
      expect(sellerNode.config.zaloGroupIds).toBe('group-cua-nguoi-ban');
      expect(sellerNode.config.zaloAccountId).toBe(SELLER_ZALO_ACCOUNT);
    });

    it('đăng bán chiến dịch trỏ mẫu đã xoá → 400 nêu tên khối, không có listing', async () => {
      const seller = await createActor('seller');
      const ids = await seedSellerWithTemplates(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      await db.query('DELETE FROM zalo_templates WHERE id = $1', [ids.zaloC]);

      const res = await publishListing(seller, campaign.id);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Gui nhom');
      expect(res.body.message).toContain(`#${ids.zaloC}`);
      expect(await countRows('marketplace_listings')).toBe(0);
    });

    it('mẫu thuộc người KHÁC cũng bị từ chối (truy vấn lọc theo người bán)', async () => {
      const seller = await createActor('seller');
      const stranger = await createUser('stranger');
      const ids = await seedSellerWithTemplates(seller.user.id);
      ids.zaloA = await insertZaloTemplate(stranger.id, { name: 'Cua nguoi la', text: 'bi mat' });
      const campaign = await seedSellerCampaign(seller.user.id, ids);

      const res = await publishListing(seller, campaign.id);

      expect(res.status).toBe(400);
      expect(await countRows('marketplace_listings')).toBe(0);
    });

    it('chiến dịch không dùng mẫu nào (nội dung soạn thẳng) vẫn đăng bán được, templates rỗng', async () => {
      const seller = await createActor('seller');
      const { rows } = await db.query(
        `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, flow_json) VALUES ($1, 'Soan thang', 'email', 'draft', '{"nodes":[],"edges":[]}') RETURNING id`,
        [seller.user.id]
      );
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
         VALUES ($1, 'action', 'send_email', 'Gui', '{"emailSubject":"Chao","emailBody":"<p>x</p>","fromEmailId":3}'::jsonb, 1)`,
        [rows[0].id]
      );
      const res = await publishListing(seller, rows[0].id);
      expect(res.status).toBe(201);
      const snapshot = await snapshotOf(res.body.data.id);
      expect(snapshot.templates).toEqual({ email: {}, zalo: {} });
      expect(snapshot.nodes[0].config.emailSubject).toBe('Chao'); // nội dung soạn thẳng giữ nguyên
      expect('fromEmailId' in snapshot.nodes[0].config).toBe(false);
    });
  });

  describe('mua: người mua nhận bản sao mẫu của riêng mình', () => {
    async function listAndBuy({ price = 0 } = {}) {
      const seller = await createActor('seller');
      const buyer = await createActor('buyer');
      const ids = await seedSellerWithTemplates(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      const listing = (await publishListing(seller, campaign.id, price)).body.data;
      const res = await purchase(buyer, listing.id);
      return { seller, buyer, ids, campaign, listing, res };
    }

    it('B mua → có 4 mẫu MỚI (id_user = B, nội dung = lúc đăng bán); mọi tham chiếu ở campaign_nodes + flow_json trỏ id mới; không còn id mẫu của người bán', async () => {
      const { seller, buyer, ids, res } = await listAndBuy();
      expect(res.status).toBe(200);
      const clonedId = res.body.data.clonedResource.id;

      const buyerZalo = (await db.query('SELECT id, template_name, body_text FROM zalo_templates WHERE id_user = $1 ORDER BY id', [buyer.user.id])).rows;
      const buyerEmail = (await db.query('SELECT id, template_name, subject, body_html, body_text, template_code, variables, category FROM email_templates WHERE id_user = $1', [buyer.user.id])).rows;
      expect(buyerZalo.map((t) => t.template_name).sort()).toEqual(['Zalo A', 'Zalo B', 'Zalo C']);
      expect(buyerEmail).toHaveLength(1);
      expect(buyerEmail[0]).toMatchObject({ template_name: 'Mail chao', subject: 'Chao {{ten}}', body_html: '<p>Xin chao {{ten}}</p>', template_code: 'MAIL-1', category: 'khuyen mai' });
      const sellerOwnedIds = new Set([ids.zaloA, ids.zaloB, ids.zaloC].map(String));
      buyerZalo.forEach((t) => expect(sellerOwnedIds.has(String(t.id))).toBe(false));
      expect(String(buyerEmail[0].id)).not.toBe(String(ids.email));
      // mẫu của người bán còn nguyên
      expect(await countRows('zalo_templates', 'id_user = $1', [seller.user.id])).toBe(3);

      const zaloNameById = new Map(buyerZalo.map((t) => [String(t.id), t.template_name]));
      const nodeRows = (await db.query('SELECT node_subtype, config FROM campaign_nodes WHERE id_campaign = $1', [clonedId])).rows;
      const personal = nodeRows.find((n) => n.node_subtype === 'send_zalo_personal').config;
      const group = nodeRows.find((n) => n.node_subtype === 'send_zalo_group').config;
      const mail = nodeRows.find((n) => n.node_subtype === 'send_email').config;
      expect(personal.zaloPersonalTemplateSteps.map((s) => zaloNameById.get(String(s.templateId)))).toEqual(['Zalo A', 'Zalo B']);
      expect(group.zaloGroupTemplateSteps.map((s) => zaloNameById.get(String(s.templateId)))).toEqual(['Zalo B', 'Zalo C']);
      expect(typeof group.zaloGroupTemplateSteps[0].templateId).toBe('string'); // giữ kiểu như cũ
      expect(String(mail.emailSteps[0].templateId)).toBe(String(buyerEmail[0].id));
      expect(String(mail.emailTemplateId)).toBe(String(buyerEmail[0].id));

      // flow_json (nguồn hiển thị của trình dựng) cũng vậy
      const flow = (await db.query('SELECT flow_json FROM campaigns WHERE id = $1', [clonedId])).rows[0].flow_json;
      const flowConfig = (nodeId) => flow.nodes.find((n) => n.id === nodeId).data.config;
      expect(flowConfig('n-personal').zaloPersonalTemplateSteps.map((s) => zaloNameById.get(String(s.templateId)))).toEqual(['Zalo A', 'Zalo B']);
      expect(flowConfig('n-group').zaloGroupTemplateSteps.map((s) => zaloNameById.get(String(s.templateId)))).toEqual(['Zalo B', 'Zalo C']);
      expect(String(flowConfig('n-mail').emailSteps[0].templateId)).toBe(String(buyerEmail[0].id));

      // cùng một định nghĩa "ô nào bắt buộc": mọi tham chiếu của chiến dịch người mua đều nằm trong mẫu của người mua
      const refs = collectRequiredTemplateReferences(nodeRows);
      expect(refs).toHaveLength(5);
      refs.forEach((ref) => {
        const owned = ref.channel === 'email'
          ? String(buyerEmail[0].id) === String(ref.id)
          : zaloNameById.has(String(ref.id));
        expect(owned).toBe(true);
      });
    });

    it('config người mua không còn tài khoản gửi / người nhận / nhóm của người bán — cả campaign_nodes lẫn flow_json', async () => {
      const { res } = await listAndBuy();
      const clonedId = res.body.data.clonedResource.id;
      const nodes = (await db.query('SELECT config FROM campaign_nodes WHERE id_campaign = $1', [clonedId])).rows;
      const flow = (await db.query('SELECT flow_json FROM campaigns WHERE id = $1', [clonedId])).rows[0].flow_json;
      const raw = JSON.stringify({ nodes, flow });
      expect(raw).not.toContain('group-cua-nguoi-ban');
      expect(raw).not.toContain('0901234567');
      expect(raw).not.toContain('khach-cua-nguoi-ban@example.com');
      expect(raw).not.toContain('"zaloAccountId"');
      expect(raw).not.toContain('"fromEmailId"');
      expect(raw).not.toContain('"55"');
    });

    it('đường gửi của người mua đọc được nội dung mẫu mới; mẫu của người bán thì KHÔNG đọc được (lọc theo chủ vẫn đúng)', async () => {
      const { buyer, ids, res } = await listAndBuy();
      const clonedId = res.body.data.clonedResource.id;
      const group = (await db.query(`SELECT config FROM campaign_nodes WHERE id_campaign = $1 AND node_subtype = 'send_zalo_group'`, [clonedId])).rows[0].config;
      const newId = Number(group.zaloGroupTemplateSteps[1].templateId);

      // đúng hàm `getZaloTemplateContent` của campaignRun dùng
      const forBuyer = await zaloTemplateRepository.findContentByIdForUser(newId, buyer.user.id);
      expect(forBuyer.body_text).toBe('Noi dung C');
      expect(await zaloTemplateRepository.findContentByIdForUser(ids.zaloC, buyer.user.id)).toBeNull();

      // preflight email: mẫu thuộc chủ chiến dịch
      const mail = (await db.query(`SELECT config FROM campaign_nodes WHERE id_campaign = $1 AND node_subtype = 'send_email'`, [clonedId])).rows[0].config;
      const available = await campaignEmailSenderRepository.findAvailableEmailTemplateIdsForCampaign([Number(mail.emailSteps[0].templateId)], clonedId);
      expect(available.has(Number(mail.emailSteps[0].templateId))).toBe(true);
    });

    it('preflight của chiến dịch người mua: hết lỗi mẫu email; còn đòi chọn tài khoản Zalo (lời báo nguyên văn)', async () => {
      const { buyer, res } = await listAndBuy();
      await expect(validateCampaignPreflight({
        campaignId: res.body.data.clonedResource.id,
        workspaceOwnerId: buyer.user.id,
        assertChannelEntitledFn: async () => {},
      })).rejects.toMatchObject({
        code: 'SENDER_DISCONNECTED',
        statusCode: 400,
        message: 'Chưa chọn tài khoản Zalo gửi tin hoặc tài khoản đã không còn khả dụng. Vui lòng chọn và kết nối lại tài khoản trước khi chạy.',
      });
    });

    it('chiến dịch chỉ gửi email: người mua qua preflight (trước đây EMAIL_TEMPLATE_UNAVAILABLE vì mẫu của người bán)', async () => {
      const seller = await createActor('seller');
      const buyer = await createActor('buyer');
      const emailId = await insertEmailTemplate(seller.user.id, { name: 'Mail ban hang' });
      const { rows } = await db.query(
        `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, flow_json) VALUES ($1, 'Mail', 'email', 'draft', '{"nodes":[],"edges":[]}') RETURNING id`,
        [seller.user.id]
      );
      await db.query(
        `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order) VALUES
          ($1, 'trigger', 'manual_trigger', 'Bat dau', '{}'::jsonb, 1),
          ($1, 'action', 'send_email', 'Gui', $2, 2)`,
        [rows[0].id, JSON.stringify({ emailSteps: [{ templateId: emailId }], recipientSource: 'manual', recipientEmails: ['a@x.vn'], fromEmailId: 3 })]
      );
      const listing = (await publishListing(seller, rows[0].id)).body.data;
      const bought = await purchase(buyer, listing.id);
      expect(bought.status).toBe(200);

      const result = await validateCampaignPreflight({ campaignId: bought.body.data.clonedResource.id, workspaceOwnerId: buyer.user.id });
      expect(result.valid).toBe(true);
    });

    it('người bán sửa/xoá mẫu gốc SAU khi đăng bán, rồi C mua → C nhận nội dung lúc đăng bán', async () => {
      const seller = await createActor('seller');
      const c = await createActor('buyer-c');
      const ids = await seedSellerWithTemplates(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      const listing = (await publishListing(seller, campaign.id)).body.data;

      await db.query(`UPDATE zalo_templates SET body_text = 'DA SUA SAU KHI DANG BAN' WHERE id = $1`, [ids.zaloA]);
      await db.query('DELETE FROM zalo_templates WHERE id = $1', [ids.zaloB]);
      await db.query('DELETE FROM email_templates WHERE id = $1', [ids.email]);

      const res = await purchase(c, listing.id);
      expect(res.status).toBe(200);
      const bodies = (await db.query('SELECT template_name, body_text FROM zalo_templates WHERE id_user = $1 ORDER BY template_name', [c.user.id])).rows;
      expect(bodies).toEqual([
        { template_name: 'Zalo A', body_text: 'Chao {{ten}}, noi dung A' },
        { template_name: 'Zalo B', body_text: 'Noi dung B' },
        { template_name: 'Zalo C', body_text: 'Noi dung C' },
      ]);
      expect(await countRows('email_templates', 'id_user = $1', [c.user.id])).toBe(1);
    });

    it('listing CŨ (snapshot chưa có templates): đọc mẫu sống của người bán làm nguồn, và vẫn gỡ dữ liệu người bán ở snapshot cũ', async () => {
      const seller = await createActor('seller');
      const buyer = await createActor('buyer');
      const ids = await seedSellerWithTemplates(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      // dựng snapshot kiểu cũ: nguyên văn config + flow_json người bán, KHÔNG có `templates`
      const nodes = (await db.query('SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id', [campaign.id])).rows;
      const oldSnapshot = {
        campaignName: campaign.campaign_name,
        campaignType: 'mixed',
        flowJson: campaign.flow_json,
        nodes: nodes.map((n) => ({ id: n.id, nodeType: n.node_type, nodeSubtype: n.node_subtype, nodeName: n.node_name, positionX: 0, positionY: 0, config: n.config, executionOrder: n.execution_order })),
        connections: [],
      };
      const { rows } = await db.query(
        `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, price_credits, status, snapshot_data)
         VALUES ($1, 'campaign', $2, 'Listing cu', 0, 'published', $3) RETURNING id`,
        [seller.user.id, campaign.id, JSON.stringify(oldSnapshot)]
      );

      const res = await purchase(buyer, rows[0].id);

      expect(res.status).toBe(200);
      expect(await countRows('zalo_templates', 'id_user = $1', [buyer.user.id])).toBe(3);
      expect(await countRows('email_templates', 'id_user = $1', [buyer.user.id])).toBe(1);
      const cloned = (await db.query('SELECT config FROM campaign_nodes WHERE id_campaign = $1', [res.body.data.clonedResource.id])).rows;
      expect(JSON.stringify(cloned)).not.toContain('group-cua-nguoi-ban');
      expect(JSON.stringify(cloned)).not.toContain('"zaloAccountId"');
      // flow_json của snapshot cũ cũng mang dữ liệu người bán → bản của người mua phải sạch (trình dựng mở sơ đồ từ flow_json)
      const flow = (await db.query('SELECT flow_json FROM campaigns WHERE id = $1', [res.body.data.clonedResource.id])).rows[0].flow_json;
      expect(JSON.stringify(flow)).not.toContain('group-cua-nguoi-ban');
      expect(JSON.stringify(flow)).not.toContain('0901234567');
      expect(JSON.stringify(flow)).not.toContain('"zaloAccountId"');
      expect(JSON.stringify(flow)).not.toContain('"fromEmailId"');
      const buyerZaloIds = new Set((await db.query('SELECT id FROM zalo_templates WHERE id_user = $1', [buyer.user.id])).rows.map((r) => String(r.id)));
      flow.nodes.find((n) => n.id === 'n-group').data.config.zaloGroupTemplateSteps.forEach((step) => {
        expect(buyerZaloIds.has(String(step.templateId))).toBe(true);
      });
    });
  });

  describe('tệp đính kèm của mẫu', () => {
    async function seedWithAttachments(sellerId) {
      const zaloFile = await sellerAttachment(sellerId, 'bang-gia.pdf', 3000);
      const emailFile = await sellerAttachment(sellerId, 'brochure.pdf', 2000);
      const ids = await seedSellerWithTemplates(sellerId);
      await db.query('UPDATE zalo_templates SET attachments = $1 WHERE id = $2', [JSON.stringify([zaloFile]), ids.zaloC]);
      await db.query('UPDATE email_templates SET attachments = $1 WHERE id = $2', [JSON.stringify([emailFile]), ids.email]);
      return { ids, zaloFile, emailFile };
    }

    it('tệp của B nằm dưới uploads/<B>/…, có dòng storage_objects của B, mẫu mới trỏ khoá của B; xoá tệp gốc của người bán không ảnh hưởng B', async () => {
      const seller = await createActor('seller');
      const buyer = await createActor('buyer');
      const { ids, zaloFile, emailFile } = await seedWithAttachments(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      const listing = (await publishListing(seller, campaign.id)).body.data;

      const res = await purchase(buyer, listing.id);

      expect(res.status).toBe(200);
      const zaloTpl = (await db.query(`SELECT id, attachments FROM zalo_templates WHERE id_user = $1 AND template_name = 'Zalo C'`, [buyer.user.id])).rows[0];
      const emailTpl = (await db.query('SELECT id, attachments FROM email_templates WHERE id_user = $1', [buyer.user.id])).rows[0];
      expect(zaloTpl.attachments).toHaveLength(1);
      const zaloKey = zaloTpl.attachments[0].key;
      const emailKey = emailTpl.attachments[0].key;
      expect(zaloKey.startsWith(`uploads/${buyer.user.id}/`)).toBe(true);
      expect(emailKey.startsWith(`uploads/${buyer.user.id}/`)).toBe(true);
      expect(zaloKey).not.toBe(zaloFile.key);
      expect(zaloTpl.attachments[0]).toMatchObject({ originalName: 'bang-gia.pdf', displayName: 'Hien thi bang-gia.pdf', size: 3000, contentType: 'application/pdf' });
      expect(zaloTpl.attachments[0].storageObjectId).toBeUndefined();
      expect(JSON.stringify([zaloTpl, emailTpl])).not.toContain(`uploads/${seller.user.id}/`);
      // tệp thật đã được chép
      expect(storage.files.get(zaloKey).length).toBe(3000);
      expect(storage.files.get(emailKey).length).toBe(2000);

      // sổ dung lượng của NGƯỜI MUA (người bán không bị đụng)
      const ledger = (await db.query(`SELECT storage_key, owner_user_id, state, size_bytes, category, reference_type, reference_id FROM storage_objects WHERE owner_user_id = $1 ORDER BY size_bytes`, [buyer.user.id])).rows;
      expect(ledger).toEqual([
        { storage_key: emailKey, owner_user_id: String(buyer.user.id), state: 'active', size_bytes: '2000', category: 'email_template', reference_type: 'email_template', reference_id: String(emailTpl.id) },
        { storage_key: zaloKey, owner_user_id: String(buyer.user.id), state: 'active', size_bytes: '3000', category: 'zalo_template', reference_type: 'zalo_template', reference_id: String(zaloTpl.id) },
      ]);
      expect(await countRows('storage_objects', 'owner_user_id = $1', [seller.user.id])).toBe(0);
      // template_files của mẫu email người mua (tải theo id kiểm quyền qua mẫu)
      const tf = (await db.query('SELECT storage_key, template_id FROM template_files WHERE storage_key = $1', [emailKey])).rows[0];
      expect(String(tf.template_id)).toBe(String(emailTpl.id));

      // người bán xoá tệp gốc → bản của B còn nguyên
      await storage.delete([zaloFile.key, emailFile.key]);
      expect(storage.files.has(zaloKey)).toBe(true);
      expect(storage.files.has(emailKey)).toBe(true);
    });

    it('B vượt dung lượng → 400 MARKETPLACE_STORAGE_QUOTA_EXCEEDED, không trừ credit, không cộng người bán, không có mẫu/chiến dịch/tệp rác', async () => {
      const prev = process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
      process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = 'true';
      try {
        const seller = await createActor('seller');
        const buyer = await createActor('buyer');
        await db.query('UPDATE users SET storage_quota_override_bytes = 4000 WHERE id = $1', [buyer.user.id]); // chỗ cho 4000 byte, tệp cần 5000
        const { ids } = await seedWithAttachments(seller.user.id);
        const campaign = await seedSellerCampaign(seller.user.id, ids);
        const listing = (await publishListing(seller, campaign.id, 50)).body.data;
        const filesBefore = storage.files.size;

        const res = await purchase(buyer, listing.id);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MARKETPLACE_STORAGE_QUOTA_EXCEEDED');
        expect(res.body.message).toContain('dung lượng');
        expect(deductCreditsSpy).not.toHaveBeenCalled();
        expect(await countRows('marketplace_seller_stats')).toBe(0);
        expect(await countRows('marketplace_purchases')).toBe(0);
        expect(await countRows('campaigns', 'id_user = $1', [buyer.user.id])).toBe(0);
        expect(await countRows('zalo_templates', 'id_user = $1', [buyer.user.id])).toBe(0);
        expect(await countRows('email_templates', 'id_user = $1', [buyer.user.id])).toBe(0);
        expect(await countRows('storage_objects', 'owner_user_id = $1', [buyer.user.id])).toBe(0);
        expect(storage.files.size).toBe(filesBefore);
        expect(storage.state.copyCalls).toBe(0);
      } finally {
        if (prev === undefined) delete process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
        else process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = prev;
      }
    });

    it('đủ dung lượng thì mua được (cùng kịch bản, hạn mức đủ)', async () => {
      const prev = process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
      process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = 'true';
      try {
        const seller = await createActor('seller');
        const buyer = await createActor('buyer');
        await db.query('UPDATE users SET storage_quota_override_bytes = 5000 WHERE id = $1', [buyer.user.id]);
        const { ids } = await seedWithAttachments(seller.user.id);
        const campaign = await seedSellerCampaign(seller.user.id, ids);
        const listing = (await publishListing(seller, campaign.id)).body.data;

        const res = await purchase(buyer, listing.id);

        expect(res.status).toBe(200);
      } finally {
        if (prev === undefined) delete process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
        else process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = prev;
      }
    });

    it('chép tệp thứ hai lỗi giữa chừng → rollback sạch: không còn tệp đã chép, mẫu, chiến dịch, dòng sổ, tiền người bán', async () => {
      const seller = await createActor('seller');
      const buyer = await createActor('buyer');
      const { ids } = await seedWithAttachments(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      const listing = (await publishListing(seller, campaign.id, 50)).body.data;
      const filesBefore = new Set(storage.files.keys());
      storage.state.failCopyOnCall = 2;
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await purchase(buyer, listing.id);

      errorSpy.mockRestore();
      expect(res.status).toBe(500);
      expect(storage.state.copyCalls).toBe(2);
      expect(new Set(storage.files.keys())).toEqual(filesBefore); // tệp chép được đã bị dọn
      expect([...storage.files.keys()].some((key) => key.startsWith(`uploads/${buyer.user.id}/`))).toBe(false);
      expect(await countRows('marketplace_seller_stats')).toBe(0);
      expect(await countRows('marketplace_purchases')).toBe(0);
      expect(await countRows('campaigns', 'id_user = $1', [buyer.user.id])).toBe(0);
      expect(await countRows('zalo_templates', 'id_user = $1', [buyer.user.id])).toBe(0);
      expect(await countRows('email_templates', 'id_user = $1', [buyer.user.id])).toBe(0);
      expect(await countRows('storage_objects', 'owner_user_id = $1', [buyer.user.id])).toBe(0);
      expect(await countRows('template_files')).toBe(0);
      // mua lại sau khi kho hồi phục → thành công (không kẹt do lượt lỗi)
      storage.state.failCopyOnCall = null;
      const retry = await purchase(buyer, listing.id);
      expect(retry.status).toBe(200);
    });

    it('tệp đính kèm của người bán đã mất khỏi kho → 400 (không bán hàng thiếu tệp), ví người mua/người bán không đổi', async () => {
      const seller = await createActor('seller');
      const buyer = await createActor('buyer');
      const { ids, zaloFile } = await seedWithAttachments(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      const listing = (await publishListing(seller, campaign.id, 50)).body.data;
      await storage.delete(zaloFile.key);

      const res = await purchase(buyer, listing.id);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('thiếu nội dung');
      expect(deductCreditsSpy).not.toHaveBeenCalled();
      expect(await countRows('marketplace_seller_stats')).toBe(0);
      expect(await countRows('marketplace_purchases')).toBe(0);
    });
  });

  describe('không bán hàng hỏng (mẫu đã mất)', () => {
    it('mua listing cũ có khối trỏ mẫu không còn (như listing 5) → 400, ví người mua không đổi, người bán không được cộng, không có chiến dịch', async () => {
      const seller = await createActor('seller');
      const buyer = await createActor('buyer');
      const ids = await seedSellerWithTemplates(seller.user.id);
      const campaign = await seedSellerCampaign(seller.user.id, ids);
      const nodes = (await db.query('SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id', [campaign.id])).rows;
      const oldSnapshot = {
        campaignName: 'Listing hong',
        campaignType: 'mixed',
        flowJson: campaign.flow_json,
        nodes: nodes.map((n) => ({ id: n.id, nodeType: n.node_type, nodeSubtype: n.node_subtype, nodeName: n.node_name, config: n.config })),
        connections: [],
      };
      const { rows } = await db.query(
        `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, price_credits, status, snapshot_data)
         VALUES ($1, 'campaign', $2, 'Listing 5', 60, 'published', $3) RETURNING id`,
        [seller.user.id, campaign.id, JSON.stringify(oldSnapshot)]
      );
      await db.query('DELETE FROM zalo_templates WHERE id = $1', [ids.zaloB]); // người bán đã xoá mẫu

      const res = await purchase(buyer, rows[0].id);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('thiếu nội dung');
      expect(deductCreditsSpy).not.toHaveBeenCalled();
      expect(await countRows('marketplace_seller_stats')).toBe(0);
      expect(await countRows('marketplace_purchases')).toBe(0);
      expect(await countRows('campaigns', 'id_user = $1', [buyer.user.id])).toBe(0);
      expect(await countRows('zalo_templates', 'id_user = $1', [buyer.user.id])).toBe(0);
      expect((await db.query('SELECT purchase_count FROM marketplace_listings WHERE id = $1', [rows[0].id])).rows[0].purchase_count).toBe(0);
    });
  });
});
