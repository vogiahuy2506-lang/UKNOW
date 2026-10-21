/**
 * Integration — chiến dịch mua từ Marketplace có khối "chọn khách cụ thể" bị gỡ danh sách: chạy / ước tính / xem trước ra 0 người.
 *
 * Người bán chọn tay vài khách (`interestedSelectionMode: 'fixed'` + id khách của người bán). Lúc đăng bán id đó bị gỡ (chúng thuộc người bán),
 * nên khối của người mua là `fixed` + danh sách RỖNG. Trước đây engine hiểu "chưa chọn" là TẤT CẢ khách → người mua bấm chạy là gửi cho toàn bộ
 * khách của mình. Giờ: 0 khách, không gửi ai. Chạy trên Postgres thật; mua qua đúng endpoint mua; đọc dữ liệu qua `getCustomersFromDataNode`
 * (hàm mà chạy thật, ước tính và xem trước cùng dùng) và `estimateForCampaign`.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import campaignNodeDataService from '../../src/services/campaign/campaignNodeData.service.js';
import { estimateForCampaign } from '../../src/services/campaign/campaignEstimate.service.js';
import { truncateAll } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function createActor(username) {
  const passwordHash = await bcrypt.hash('Test123!', 10);
  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, role, status, subscription_expires_at)
     VALUES ($1, $2, $3, 'user', 'active', NOW() + INTERVAL '30 days') RETURNING *`,
    [username, `${username}@test.com`, passwordHash]
  );
  const user = rows[0];
  const { rows: plans } = await db.query(
    `INSERT INTO plans (code, name, price, ai_credits_per_period, is_active) VALUES ($1, $2, 199000, 1000, true) RETURNING id`,
    [`plan-${username}`, username.toUpperCase()]
  );
  await db.query('UPDATE users SET active_plan_id = $1 WHERE id = $2', [plans[0].id, user.id]);
  const login = await request(app).post('/api/auth/login').send({ username, password: 'Test123!' });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  return { user, token: login.body.data.accessToken };
}

async function insertCustomers(ownerId, prefix, count) {
  const ids = [];
  for (let i = 1; i <= count; i += 1) {
    const { rows } = await db.query(
      `INSERT INTO customers (id_user, workspace_owner_id, email, full_name) VALUES ($1, $1, $2, $3) RETURNING id`,
      [ownerId, `${prefix}${i}@example.com`, `${prefix} ${i}`]
    );
    ids.push(Number(rows[0].id));
  }
  return ids;
}

/** Chiến dịch người bán: trigger → đọc khách (chọn tay `sellerCustomerIds`) → gửi email theo nguồn khối đọc khách. */
async function seedSellerCampaign(sellerId, sellerCustomerIds) {
  const { rows: tpl } = await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html) VALUES ($1, 'Mail', 'Chao', '<p>x</p>') RETURNING id`,
    [sellerId]
  );
  const { rows: camp } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, flow_json) VALUES ($1, 'Gui khach chon tay', 'email', 'draft', '{"nodes":[],"edges":[]}') RETURNING id`,
    [sellerId]
  );
  const campaignId = Number(camp[0].id);
  const insertNode = async (type, subtype, name, config, order) => Number((await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [campaignId, type, subtype, name, JSON.stringify(config), order]
  )).rows[0].id);
  const triggerId = await insertNode('trigger', 'manual_trigger', 'Bat dau', {}, 1);
  const readId = await insertNode('action', 'read_interested_customers', 'Khach da chon', {
    interestedCustomerType: 'all',
    interestedSelectionMode: 'fixed',
    interestedSelectedCustomerIds: sellerCustomerIds,
  }, 2);
  const sendId = await insertNode('action', 'send_email', 'Gui mail', {
    recipientSource: 'node',
    recipientNodeId: String(readId),
    recipientField: 'email',
    emailSteps: [{ templateId: Number(tpl[0].id) }],
  }, 3);
  await db.query(
    `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id) VALUES ($1, $2, $3), ($1, $3, $4)`,
    [campaignId, triggerId, readId, sendId]
  );
  return campaignId;
}

async function buyCampaign(seller, buyer, campaignId) {
  const listing = await request(app)
    .post('/api/marketplace/listings')
    .set('Authorization', `Bearer ${seller.token}`)
    .send({ campaignId, title: 'Chien dich chon tay' });
  expect(listing.status).toBe(201);
  const bought = await request(app).post(`/api/marketplace/purchase/${listing.body.data.id}`).set('Authorization', `Bearer ${buyer.token}`);
  expect(bought.status).toBe(200);
  return Number(bought.body.data.clonedResource.id);
}

const loadNodes = async (campaignId) => (await db.query(
  'SELECT id, node_subtype, node_name, config, execution_order FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order',
  [campaignId]
)).rows;

const sendNodeRecipients = (estimate) => estimate.perNode.find((node) => node.channel === 'email');

describe('chiến dịch mua từ Marketplace — khối chọn khách cụ thể bị gỡ danh sách', () => {
  async function setup() {
    const seller = await createActor('seller');
    const buyer = await createActor('buyer');
    const sellerCustomers = await insertCustomers(seller.user.id, 'ban', 2);
    const buyerCustomers = await insertCustomers(buyer.user.id, 'mua', 3);
    const sellerCampaign = await seedSellerCampaign(seller.user.id, sellerCustomers);
    const clonedId = await buyCampaign(seller, buyer, sellerCampaign);
    return { seller, buyer, sellerCustomers, buyerCustomers, clonedId };
  }

  it("khối đọc khách của người mua là 'fixed' + danh sách rỗng (id khách của người bán đã gỡ) — và engine đọc ra 0 khách dù người mua CÓ 3 khách", async () => {
    const { buyer, buyerCustomers, clonedId } = await setup();
    const nodes = await loadNodes(clonedId);
    const read = nodes.find((node) => node.node_subtype === 'read_interested_customers');
    expect(read.config.interestedSelectionMode).toBe('fixed');
    expect(read.config.interestedSelectedCustomerIds).toEqual([]);
    expect(buyerCustomers).toHaveLength(3);

    const pack = await campaignNodeDataService.getCustomersFromDataNode(read, buyer.user.id, nodes);

    expect(pack.items).toEqual([]);
  });

  it('ước tính chiến dịch của người mua: khối gửi email có 0 người nhận, 0 tin', async () => {
    const { buyer, clonedId } = await setup();

    const estimate = await estimateForCampaign({ campaignId: clonedId, ownerUserId: buyer.user.id });

    expect(sendNodeRecipients(estimate).recipients).toBe(0);
    expect(estimate.totalActions).toBe(0);
  });

  it("đối chứng: người mua chọn lại chế độ 'tất cả' (bỏ chế độ tường minh) thì ra đủ 3 khách của MÌNH, ước tính 3 người — và không lẫn khách của người bán", async () => {
    const { buyer, clonedId } = await setup();
    const nodes = await loadNodes(clonedId);
    const read = nodes.find((node) => node.node_subtype === 'read_interested_customers');
    await db.query(
      `UPDATE campaign_nodes SET config = $1 WHERE id = $2`,
      [JSON.stringify({ interestedCustomerType: 'all', interestedSelectedCustomerIds: [] }), read.id]
    );

    const refreshed = await loadNodes(clonedId);
    const pack = await campaignNodeDataService.getCustomersFromDataNode(refreshed.find((node) => node.id === read.id), buyer.user.id, refreshed);
    expect(pack.items.map((item) => item.email).sort()).toEqual(['mua1@example.com', 'mua2@example.com', 'mua3@example.com']);

    const estimate = await estimateForCampaign({ campaignId: clonedId, ownerUserId: buyer.user.id });
    expect(sendNodeRecipients(estimate).recipients).toBe(3);
  });

  it("đối chứng: người mua chọn cụ thể 2 khách của MÌNH (fixed + có id) thì ra đúng 2 khách đó", async () => {
    const { buyer, buyerCustomers, clonedId } = await setup();
    const nodes = await loadNodes(clonedId);
    const read = nodes.find((node) => node.node_subtype === 'read_interested_customers');
    await db.query(
      `UPDATE campaign_nodes SET config = $1 WHERE id = $2`,
      [JSON.stringify({ ...read.config, interestedSelectedCustomerIds: [buyerCustomers[0], buyerCustomers[2]] }), read.id]
    );

    const refreshed = await loadNodes(clonedId);
    const pack = await campaignNodeDataService.getCustomersFromDataNode(refreshed.find((node) => node.id === read.id), buyer.user.id, refreshed);
    expect(pack.items.map((item) => item.email).sort()).toEqual(['mua1@example.com', 'mua3@example.com']);

    const estimate = await estimateForCampaign({ campaignId: clonedId, ownerUserId: buyer.user.id });
    expect(sendNodeRecipients(estimate).recipients).toBe(2);
  });
});
