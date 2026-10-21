/**
 * Integration — Marketplace, phần còn lại sau 9ad67fc6 (PLAN_GOM_MUC_NHE_2026-10-20 PR-3). Postgres + Express thật; kho tệp thay bằng kho trong bộ nhớ.
 *
 *  3a. visibility chỉ nhận 'public' (tạo / sửa listing; giá trị khác → 400).
 *  3b. GET /marketplace/listings (tab "Của tôi") lọc theo loại: `resource_type` hoặc `type`.
 *  3c. Mua chiến dịch kèm mẫu không vượt trần số mẫu email / Zalo của gói — kiểm TRƯỚC khi trừ credit.
 *  3d. Tệp đính kèm cấp khối (email attachments, Zalo nhóm zaloGroupAttachments, Telegram steps[].attachments) được chép sang người mua.
 *  3e. Landing mua về: link `<a href=".../f/<key>">` của người bán → "#"; host ngoài giữ nguyên.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import aiCreditMeter from '../../src/services/ai/aiCreditMeter.service.js';
import { resetStorageBackendForTest, setStorageBackendForTest } from '../../src/services/storage/storageBackend.js';
import { truncateAll } from './helpers/db.js';

let app;
let deductCreditsSpy;
let storage;
let savedFrontendUrl;

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
  savedFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://app.gom-muc-nhe.test';
  app = createApp();
  deductCreditsSpy = jest
    .spyOn(aiCreditMeter, 'deductCredits')
    .mockResolvedValue({ success: true, deducted: 50, remaining: { plan: Infinity, wallet: 0 } });
  storage = createMemoryStorage();
  setStorageBackendForTest(storage);
});

afterAll(() => {
  resetStorageBackendForTest();
  if (savedFrontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = savedFrontendUrl;
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

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function createActor(username) {
  const user = await createUser(username);
  const { rows: plan } = await db.query(
    `INSERT INTO plans (code, name, price, ai_credits_per_period, is_active) VALUES ($1, $1, 199000, 1000, true) RETURNING id`,
    [`plan-${username}`]
  );
  await db.query('UPDATE users SET active_plan_id = $1 WHERE id = $2', [plan[0].id, user.id]);
  await db.query(
    `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end)
     VALUES ($1, 'ai_credit', 100, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second')`,
    [user.id]
  );
  return { user, token: await loginAs(user) };
}

const bearer = (actor) => ({ Authorization: `Bearer ${actor.token}` });
const countRows = async (table, where = 'TRUE', params = []) => (await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, params)).rows[0].n;
const purchase = (buyer, listingId) => request(app).post(`/api/marketplace/purchase/${listingId}`).set(bearer(buyer));
const snapshotOf = async (listingId) => (await db.query('SELECT snapshot_data FROM marketplace_listings WHERE id = $1', [listingId])).rows[0].snapshot_data;

async function insertCampaign(sellerId, { name = 'Chien dich', nodes = [], flowNodes = [] } = {}) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, flow_json) VALUES ($1, $2, 'mixed', 'draft', $3) RETURNING *`,
    [sellerId, name, JSON.stringify({ nodes: flowNodes, edges: [] })]
  );
  let order = 1;
  for (const [type, subtype, nodeName, config] of [['trigger', 'manual_trigger', 'Bat dau', {}], ...nodes]) {
    await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [rows[0].id, type, subtype, nodeName, JSON.stringify(config), order++]
    );
  }
  return rows[0];
}

const publish = (seller, body) => request(app).post('/api/marketplace/listings').set(bearer(seller)).send(body);

describe('3a — visibility chỉ nhận public', () => {
  it('tạo listing: "team" / giá trị lạ → 400 (không tạo gì); thiếu hoặc "public" → 201 và lưu public', async () => {
    const seller = await createActor('seller');
    const campaign = await insertCampaign(seller.user.id);

    for (const visibility of ['team', 'private', 'PUBLIC', 0]) {
      const res = await publish(seller, { campaignId: campaign.id, title: 'x', visibility });
      expect(res.status).toBe(400);
    }
    expect(await countRows('marketplace_listings')).toBe(0);

    const missing = await publish(seller, { campaignId: campaign.id, title: 'khong gui visibility' });
    expect(missing.status).toBe(201);
    expect(missing.body.data.visibility).toBe('public');

    const campaign2 = await insertCampaign(seller.user.id, { name: 'Chien dich 2' });
    const explicit = await publish(seller, { campaignId: campaign2.id, title: 'public', visibility: 'public' });
    expect(explicit.status).toBe(201);
    expect(explicit.body.data.visibility).toBe('public');
  });

  it('đăng bán chatbot / landing với "team" → 400 TRƯỚC khi tra tài nguyên (id không tồn tại vẫn ra 400); "public" thì tới bước tra tài nguyên (404)', async () => {
    const seller = await createActor('seller');
    for (const [path, body] of [
      ['/api/marketplace/chatbots', { chatbotId: 987654 }],
      ['/api/marketplace/landing-pages', { landingPageId: 987654 }],
    ]) {
      const team = await request(app).post(path).set(bearer(seller)).send({ ...body, visibility: 'team' });
      expect(team.status).toBe(400);
      const pub = await request(app).post(path).set(bearer(seller)).send({ ...body, visibility: 'public' });
      expect(pub.status).toBe(404);
    }
  });

  it('sửa listing: visibility "team" → 400 và listing KHÔNG đổi; "public" và sửa các trường khác vẫn được', async () => {
    const seller = await createActor('seller');
    const campaign = await insertCampaign(seller.user.id);
    const listing = (await publish(seller, { campaignId: campaign.id, title: 'Goc' })).body.data;

    const team = await request(app).put(`/api/marketplace/listings/${listing.id}`).set(bearer(seller)).send({ visibility: 'team', title: 'Doi ten' });
    expect(team.status).toBe(400);
    const row = (await db.query('SELECT title, visibility FROM marketplace_listings WHERE id = $1', [listing.id])).rows[0];
    expect(row).toEqual({ title: 'Goc', visibility: 'public' });

    const ok = await request(app).put(`/api/marketplace/listings/${listing.id}`).set(bearer(seller)).send({ visibility: 'public', title: 'Doi ten' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.title).toBe('Doi ten');
  });
});

describe('3b — tab "Của tôi" lọc theo loại', () => {
  async function seedListings(sellerId) {
    const insert = async (type, title, status = 'published') =>
      (await db.query(
        `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, price_credits, status, snapshot_data)
         VALUES ($1, $2, $3, $4, 0, $5, '{}'::jsonb) RETURNING id`,
        [sellerId, type, Math.floor(Math.random() * 1e6), title, status]
      )).rows[0].id;
    return {
      c1: await insert('campaign', 'Chien dich 1'),
      c2: await insert('campaign', 'Chien dich 2', 'draft'),
      b1: await insert('chatbot', 'Chatbot 1'),
      l1: await insert('landing_page', 'Landing 1'),
    };
  }

  const titles = (res) => res.body.data.map((l) => l.title).sort();

  it('resource_type (tên frontend gửi) và type đều lọc; không gửi thì trả đủ; phân trang đếm đúng theo bộ lọc', async () => {
    const seller = await createActor('seller');
    const stranger = await createActor('stranger');
    await seedListings(seller.user.id);
    await seedListings(stranger.user.id);
    const get = (query) => request(app).get('/api/marketplace/listings').query(query).set(bearer(seller));

    const all = await get({});
    expect(all.body.data).toHaveLength(4);
    expect(all.body.pagination.total).toBe(4);

    const byResourceType = await get({ resource_type: 'chatbot' });
    expect(titles(byResourceType)).toEqual(['Chatbot 1']);
    expect(byResourceType.body.pagination.total).toBe(1);

    expect(titles(await get({ type: 'landing_page' }))).toEqual(['Landing 1']);
    const campaigns = await get({ resource_type: 'campaign' });
    expect(titles(campaigns)).toEqual(['Chien dich 1', 'Chien dich 2']);
    expect(campaigns.body.pagination.total).toBe(2);

    // loại + trạng thái cùng lúc
    expect(titles(await get({ resource_type: 'campaign', status: 'draft' }))).toEqual(['Chien dich 2']);
    // loại lạ → bỏ qua bộ lọc (như browse), vẫn chỉ listing của chính mình
    expect(await get({ resource_type: 'khong-co' })).toMatchObject({ status: 200 });
    expect((await get({ resource_type: 'khong-co' })).body.data).toHaveLength(4);
  });

  it('dashboard người bán GET /marketplace/seller/listings cũng nhận resource_type', async () => {
    const seller = await createActor('seller');
    await seedListings(seller.user.id);
    const res = await request(app).get('/api/marketplace/seller/listings').query({ resource_type: 'landing_page' }).set(bearer(seller));
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Landing 1']);
  });
});

describe('3c — mua chiến dịch kèm mẫu không vượt trần số mẫu của gói', () => {
  async function insertZaloTemplate(userId, name) {
    return Number((await db.query(
      `INSERT INTO zalo_templates (id_user, template_name, subject, body_text, attachments, variables) VALUES ($1, $2, 'T', 'Noi dung', '[]'::jsonb, '[]'::jsonb) RETURNING id`,
      [userId, name]
    )).rows[0].id);
  }
  async function insertEmailTemplate(userId, name) {
    return Number((await db.query(
      `INSERT INTO email_templates (id_user, template_name, subject, body_html, body_text, attachments, variables) VALUES ($1, $2, 'T', '<p>x</p>', 'x', '[]'::jsonb, '[]'::jsonb) RETURNING id`,
      [userId, name]
    )).rows[0].id);
  }

  /** Chiến dịch dùng 3 mẫu Zalo (cá nhân A+B, nhóm B+C → 3 mẫu khác nhau) + 1 mẫu email. */
  async function listCampaign(seller, price = 50) {
    const zaloA = await insertZaloTemplate(seller.user.id, 'Zalo A');
    const zaloB = await insertZaloTemplate(seller.user.id, 'Zalo B');
    const zaloC = await insertZaloTemplate(seller.user.id, 'Zalo C');
    const email = await insertEmailTemplate(seller.user.id, 'Mail');
    const campaign = await insertCampaign(seller.user.id, {
      nodes: [
        ['action', 'send_zalo_personal', 'Gui ca nhan', { zaloPersonalTemplateSteps: [{ templateId: zaloA }, { templateId: zaloB }] }],
        ['action', 'send_zalo_group', 'Gui nhom', { zaloGroupTemplateSteps: [{ templateId: String(zaloB) }, { templateId: zaloC }] }],
        ['action', 'send_email', 'Gui mail', { emailSteps: [{ templateId: email }], emailTemplateId: email }],
      ],
    });
    return (await publish(seller, { campaignId: campaign.id, title: 'Co mau', priceCredits: price })).body.data;
  }

  it('đang có + số mẫu sắp tạo > trần → 400 TEMPLATE_LIMIT_EXCEEDED nêu cần/còn; KHÔNG trừ credit, KHÔNG tạo mẫu/chiến dịch/purchase', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const listing = await listCampaign(seller);
    await db.query('UPDATE users SET max_zalo_templates = 3 WHERE id = $1', [buyer.user.id]);
    await insertZaloTemplate(buyer.user.id, 'Mau co san cua nguoi mua'); // 1 + 3 mẫu mới > 3

    const res = await purchase(buyer, listing.id);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TEMPLATE_LIMIT_EXCEEDED');
    expect(res.body.limitReached).toBe(true);
    expect(res.body.message).toContain('cần tạo thêm 3');
    expect(res.body.message).toContain('còn chỗ cho 2');
    expect(deductCreditsSpy).not.toHaveBeenCalled();
    expect(await countRows('marketplace_purchases')).toBe(0);
    expect(await countRows('campaigns', 'id_user = $1', [buyer.user.id])).toBe(0);
    expect(await countRows('zalo_templates', 'id_user = $1', [buyer.user.id])).toBe(1);
    expect(await countRows('email_templates', 'id_user = $1', [buyer.user.id])).toBe(0);
  });

  it('trần mẫu EMAIL = 0 (gói không hỗ trợ) → 400 dù Zalo còn chỗ; không trừ credit', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const listing = await listCampaign(seller);
    await db.query('UPDATE users SET max_email_templates = 0 WHERE id = $1', [buyer.user.id]);

    const res = await purchase(buyer, listing.id);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TEMPLATE_LIMIT_EXCEEDED');
    expect(res.body.message).toContain('không được hỗ trợ');
    expect(deductCreditsSpy).not.toHaveBeenCalled();
    expect(await countRows('zalo_templates', 'id_user = $1', [buyer.user.id])).toBe(0);
  });

  it('vừa đủ trần (đang có 0, cần 3 Zalo + 1 email, trần 3 và 1) → mua được; không trần (NULL) → mua được', async () => {
    const seller = await createActor('seller');
    const exact = await createActor('exact');
    const unlimited = await createActor('unlimited');
    const listing = await listCampaign(seller);
    await db.query('UPDATE users SET max_zalo_templates = 3, max_email_templates = 1 WHERE id = $1', [exact.user.id]);

    expect((await purchase(exact, listing.id)).status).toBe(200);
    expect(await countRows('zalo_templates', 'id_user = $1', [exact.user.id])).toBe(3);
    expect((await purchase(unlimited, listing.id)).status).toBe(200);
    expect(await countRows('zalo_templates', 'id_user = $1', [unlimited.user.id])).toBe(3);
  });

  it('chiến dịch KHÔNG dùng mẫu nào thì trần mẫu không chặn (kể cả trần 0)', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const campaign = await insertCampaign(seller.user.id, { nodes: [['action', 'send_email', 'Gui', { emailSubject: 'Chao', emailBody: '<p>x</p>' }]] });
    const listing = (await publish(seller, { campaignId: campaign.id, title: 'Khong mau', priceCredits: 10 })).body.data;
    await db.query('UPDATE users SET max_zalo_templates = 0, max_email_templates = 0 WHERE id = $1', [buyer.user.id]);

    expect((await purchase(buyer, listing.id)).status).toBe(200);
  });
});

describe('3d — tệp đính kèm cấp khối được chép sang người mua', () => {
  const FILE_SIZE = 64;
  async function sellerFile(sellerId, name) {
    const key = `uploads/${sellerId}/1700000000000_aaaa_${name}`;
    await storage.put(key, Buffer.alloc(FILE_SIZE, 7));
    return { key, url: `https://old.example/${key}`, originalName: name, displayName: `Hien thi ${name}`, size: FILE_SIZE, contentType: 'application/pdf', tempId: 'tmp-1', storageObjectId: 4242 };
  }

  async function seedBlockCampaign(seller, { strangerKey = `uploads/${seller.user.id + 999}/cua-nguoi-khac.pdf` } = {}) {
    const email = await sellerFile(seller.user.id, 'bang-gia.pdf');
    const group = await sellerFile(seller.user.id, 'nhom.pdf');
    const telegram = await sellerFile(seller.user.id, 'telegram.pdf');
    const stranger = { key: strangerKey, url: `https://old.example/${strangerKey}`, originalName: 'cua-nguoi-khac.pdf', size: 5 };
    const configs = {
      mail: { emailSubject: 'Chao', emailBody: '<p>x</p>', attachments: [email, stranger] },
      group: { zaloGroupAttachments: [group, email] }, // `email` dùng chung hai khối → chép MỘT lần
      tele: { steps: [{ content: 'Buoc 1', attachments: [telegram] }, { content: 'Buoc 2', attachments: [] }] },
    };
    const campaign = await insertCampaign(seller.user.id, {
      nodes: [
        ['action', 'send_email', 'Gui mail', configs.mail],
        ['action', 'send_zalo_group', 'Gui nhom', configs.group],
        ['action', 'send_telegram', 'Gui telegram', configs.tele],
      ],
      flowNodes: [
        { id: 'n-mail', type: 'task', data: { nodeType: 'send_email', label: 'Gui mail', config: configs.mail } },
        { id: 'n-group', type: 'task', data: { nodeType: 'send_zalo_group', label: 'Gui nhom', config: configs.group } },
        { id: 'n-tele', type: 'task', data: { nodeType: 'send_telegram', label: 'Gui telegram', config: configs.tele } },
      ],
    });
    return { campaign, files: { email, group, telegram, stranger } };
  }

  const clonedConfigs = async (clonedId) => {
    const rows = (await db.query('SELECT id, node_subtype, config FROM campaign_nodes WHERE id_campaign = $1', [clonedId])).rows;
    const bySubtype = Object.fromEntries(rows.map((r) => [r.node_subtype, r]));
    const flow = (await db.query('SELECT flow_json FROM campaigns WHERE id = $1', [clonedId])).rows[0].flow_json;
    return { bySubtype, flow, flowConfig: (id) => flow.nodes.find((n) => n.id === id).data.config };
  };

  it('đăng bán: snapshot (nodes + flowJson) chỉ giữ tệp của người bán, khoá chủ khác bị bỏ; chiến dịch gốc không đổi', async () => {
    const seller = await createActor('seller');
    const { campaign, files } = await seedBlockCampaign(seller);

    const res = await publish(seller, { campaignId: campaign.id, title: 'Co tep khoi' });
    expect(res.status).toBe(201);

    const snapshot = await snapshotOf(res.body.data.id);
    const mailNode = snapshot.nodes.find((n) => n.nodeSubtype === 'send_email');
    expect(mailNode.config.attachments.map((a) => a.key)).toEqual([files.email.key]);
    const raw = JSON.stringify({ nodes: snapshot.nodes, flowJson: snapshot.flowJson });
    expect(raw).not.toContain(files.stranger.key);
    expect(snapshot.flowJson.nodes.find((n) => n.id === 'n-mail').data.config.attachments.map((a) => a.key)).toEqual([files.email.key]);
    // chiến dịch gốc của người bán vẫn nguyên (kể cả tệp lạ do chính họ nhập)
    const original = (await db.query(`SELECT config FROM campaign_nodes WHERE id_campaign = $1 AND node_subtype = 'send_email'`, [campaign.id])).rows[0].config;
    expect(original.attachments).toHaveLength(2);
  });

  it('mua: tệp chép sang uploads/<người mua>/ (mỗi khoá một lần), config + flow_json trỏ khoá người mua, ghi sổ dung lượng, tệp người bán còn nguyên, khoá chủ khác không lọt vào', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const { campaign, files } = await seedBlockCampaign(seller);
    const listing = (await publish(seller, { campaignId: campaign.id, title: 'Co tep khoi', priceCredits: 20 })).body.data;
    const sellerFilesBefore = [...storage.files.keys()];

    const res = await purchase(buyer, listing.id);

    expect(res.status).toBe(200);
    const clonedId = res.body.data.clonedResource.id;
    // 3 tệp khác nhau của người bán (email dùng chung hai khối) → chép đúng 3 lần
    expect(storage.state.copyCalls).toBe(3);
    const buyerKeys = [...storage.files.keys()].filter((k) => k.startsWith(`uploads/${buyer.user.id}/`));
    expect(buyerKeys).toHaveLength(3);
    sellerFilesBefore.forEach((k) => expect(storage.files.has(k)).toBe(true));

    const { bySubtype, flow, flowConfig } = await clonedConfigs(clonedId);
    const mail = bySubtype.send_email.config;
    const group = bySubtype.send_zalo_group.config;
    const tele = bySubtype.send_telegram.config;
    expect(mail.attachments).toHaveLength(1); // tệp chủ khác đã bị bỏ
    expect(mail.attachments[0]).toMatchObject({ originalName: 'bang-gia.pdf', displayName: 'Hien thi bang-gia.pdf', size: FILE_SIZE });
    expect(mail.attachments[0].key.startsWith(`uploads/${buyer.user.id}/`)).toBe(true);
    expect(mail.attachments[0].tempId).toBeUndefined();
    expect(mail.attachments[0].storageObjectId).toBeUndefined();
    expect(group.zaloGroupAttachments.map((a) => a.originalName).sort()).toEqual(['bang-gia.pdf', 'nhom.pdf']);
    // tệp dùng chung hai khối → CÙNG khoá người mua
    expect(group.zaloGroupAttachments.find((a) => a.originalName === 'bang-gia.pdf').key).toBe(mail.attachments[0].key);
    expect(tele.steps[0].attachments[0]).toMatchObject({ originalName: 'telegram.pdf' });
    expect(tele.steps[0].attachments[0].key.startsWith(`uploads/${buyer.user.id}/`)).toBe(true);
    expect(tele.steps[1].attachments).toEqual([]);
    expect(tele.steps[0].content).toBe('Buoc 1');

    // flow_json (nguồn hiển thị của trình dựng) cũng vậy
    expect(flowConfig('n-mail').attachments.map((a) => a.key)).toEqual([mail.attachments[0].key]);
    expect(flowConfig('n-tele').steps[0].attachments[0].key).toBe(tele.steps[0].attachments[0].key);

    // không còn dấu vết khoá người bán / chủ khác
    const raw = JSON.stringify({ bySubtype, flow });
    expect(raw).not.toContain(`uploads/${seller.user.id}/`);
    expect(raw).not.toContain(files.stranger.key);

    // sổ dung lượng của NGƯỜI MUA: 3 dòng, đúng khoá + cỡ, gắn vào khối dùng tệp
    const ledger = (await db.query(
      `SELECT storage_key, size_bytes, category, state, reference_type, reference_id FROM storage_objects WHERE owner_user_id = $1 ORDER BY storage_key`,
      [buyer.user.id]
    )).rows;
    expect(ledger.map((r) => r.storage_key).sort()).toEqual([...buyerKeys].sort());
    ledger.forEach((row) => {
      expect(Number(row.size_bytes)).toBe(FILE_SIZE);
      expect(row.category).toBe('campaign');
      expect(row.state).toBe('active');
      expect(row.reference_type).toBe('campaign_node');
      expect(row.reference_id).not.toBeNull();
    });
    const nodeIds = new Set((await db.query('SELECT id FROM campaign_nodes WHERE id_campaign = $1', [clonedId])).rows.map((r) => String(r.id)));
    ledger.forEach((row) => expect(nodeIds.has(String(row.reference_id))).toBe(true));
    // người bán không bị ghi thêm sổ
    expect(await countRows('storage_objects', 'owner_user_id = $1', [seller.user.id])).toBe(0);
  });

  it('chép tệp lỗi giữa chừng → rollback sạch: không còn tệp đã chép, chiến dịch, dòng sổ; mua lại được sau khi kho hồi phục', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const { campaign } = await seedBlockCampaign(seller);
    const listing = (await publish(seller, { campaignId: campaign.id, title: 'Co tep khoi', priceCredits: 20 })).body.data;
    const filesBefore = new Set(storage.files.keys());
    storage.state.failCopyOnCall = 2;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await purchase(buyer, listing.id);

    errorSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(new Set(storage.files.keys())).toEqual(filesBefore);
    expect(await countRows('marketplace_purchases')).toBe(0);
    expect(await countRows('campaigns', 'id_user = $1', [buyer.user.id])).toBe(0);
    expect(await countRows('storage_objects', 'owner_user_id = $1', [buyer.user.id])).toBe(0);

    storage.state.failCopyOnCall = null;
    expect((await purchase(buyer, listing.id)).status).toBe(200);
  });

  it('tệp cấp khối của người bán đã mất khỏi kho → 400 LISTING_CONTENT_UNAVAILABLE, không trừ credit, không tạo chiến dịch', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const { campaign, files } = await seedBlockCampaign(seller);
    const listing = (await publish(seller, { campaignId: campaign.id, title: 'Co tep khoi', priceCredits: 20 })).body.data;
    storage.files.delete(files.group.key);

    const res = await purchase(buyer, listing.id);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LISTING_CONTENT_UNAVAILABLE');
    expect(deductCreditsSpy).not.toHaveBeenCalled();
    expect(await countRows('campaigns', 'id_user = $1', [buyer.user.id])).toBe(0);
    expect(storage.state.copyCalls).toBe(0);
  });

  it('listing CŨ (snapshot còn tệp lẫn khoá chủ khác): mua → tệp của người bán được chép, khoá chủ khác bị bỏ, không còn khoá người bán', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const { campaign } = await seedBlockCampaign(seller);
    const nodes = (await db.query('SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id', [campaign.id])).rows;
    const oldSnapshot = {
      campaignName: campaign.campaign_name,
      campaignType: 'mixed',
      flowJson: campaign.flow_json,
      nodes: nodes.map((n) => ({ id: n.id, nodeType: n.node_type, nodeSubtype: n.node_subtype, nodeName: n.node_name, positionX: 0, positionY: 0, config: n.config, executionOrder: n.execution_order })),
      connections: [],
      templates: { email: {}, zalo: {} },
    };
    const { rows } = await db.query(
      `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, price_credits, status, snapshot_data)
       VALUES ($1, 'campaign', $2, 'Listing cu', 0, 'published', $3) RETURNING id`,
      [seller.user.id, campaign.id, JSON.stringify(oldSnapshot)]
    );

    const res = await purchase(buyer, rows[0].id);

    expect(res.status).toBe(200);
    const { bySubtype, flow } = await clonedConfigs(res.body.data.clonedResource.id);
    expect(bySubtype.send_email.config.attachments).toHaveLength(1);
    expect(JSON.stringify({ bySubtype, flow })).not.toContain(`uploads/${seller.user.id}/`);
    expect(JSON.stringify({ bySubtype, flow })).not.toContain(`uploads/${seller.user.id + 999}/`);
  });
});

describe('3e — landing mua về: link /f/<key> của người bán', () => {
  const html = [
    '<h1>Trang bán hàng</h1>',
    '<a href="/f/SELLERKEY" class="btn">Đăng ký ngay</a>',
    '<a href="https://app.gom-muc-nhe.test/f/SELLERKEY?ref=1">Mở biểu mẫu</a>',
    '<a href="https://nguoi-khac.example/f/SELLERKEY">Link ngoài</a>',
    '<a href="https://zalo.me/abc">Zalo</a>',
  ].join('\n');

  async function insertLandingListing(sellerId) {
    const { rows } = await db.query(
      `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, price_credits, status, snapshot_data)
       VALUES ($1, 'landing_page', 1, 'Landing ban', 0, 'published', $2) RETURNING id`,
      [sellerId, JSON.stringify({ title: 'Landing ban', slug: 'landing-ban', htmlContent: html, customConfig: {} })]
    );
    return rows[0].id;
  }

  it('clone: link trỏ /f/<key> (tương đối hoặc host của ứng dụng) → href="#", giữ chữ; host ngoài và link khác giữ nguyên', async () => {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const listingId = await insertLandingListing(seller.user.id);

    const res = await purchase(buyer, listingId);

    expect(res.status).toBe(200);
    const clonedHtml = (await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [res.body.data.clonedResource.id])).rows[0].html_content;
    expect(clonedHtml).toBe([
      '<h1>Trang bán hàng</h1>',
      '<a href="#" class="btn">Đăng ký ngay</a>',
      '<a href="#">Mở biểu mẫu</a>',
      '<a href="https://nguoi-khac.example/f/SELLERKEY">Link ngoài</a>',
      '<a href="https://zalo.me/abc">Zalo</a>',
    ].join('\n'));
    expect(clonedHtml).not.toContain('app.gom-muc-nhe.test');
  });
});
