/**
 * Integration — script bù dữ liệu cũ Marketplace chiến dịch kèm mẫu (PLAN_MARKETPLACE_CHIEN_DICH_KEM_MAU_2026-10-19, PR-3).
 *
 * Dữ liệu dựng TAY đúng như production trước PR-1: listing có snapshot KHÔNG có `templates` và còn nguyên khoá người bán; chiến dịch người mua
 * chép nguyên văn config (id mẫu của người bán). Kiểm: dry-run không ghi gì; --apply đúng kết quả; chạy --apply lần hai không đổi gì.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import db from '../../src/config/database.js';
import zaloTemplateRepository from '../../src/repositories/zalo/zaloTemplate.repository.js';
import { formatBackfillReport, runMarketplaceCampaignBackfill } from '../../src/services/marketplace/marketplaceCampaignBackfill.service.js';
import { resetStorageBackendForTest, setStorageBackendForTest } from '../../src/services/storage/storageBackend.js';
import { collectRequiredTemplateReferences } from '../../src/utils/campaignTemplateReference.util.js';
import { truncateAll } from './helpers/db.js';

let storage;

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
  storage = createMemoryStorage();
  setStorageBackendForTest(storage);
});

afterAll(() => {
  resetStorageBackendForTest();
});

beforeEach(async () => {
  await truncateAll();
  storage.files.clear();
  storage.state.copyCalls = 0;
  storage.state.failCopyOnCall = null;
});

async function createUser(username) {
  const passwordHash = await bcrypt.hash('Test123!', 10);
  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, role, status, subscription_expires_at)
     VALUES ($1, $2, $3, 'user', 'active', NOW() + INTERVAL '30 days') RETURNING *`,
    [username, `${username}@test.com`, passwordHash]
  );
  return rows[0];
}

async function insertZaloTemplate(userId, name, text, attachments = []) {
  const { rows } = await db.query(
    `INSERT INTO zalo_templates (id_user, template_name, body_text, attachments) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, name, text, JSON.stringify(attachments)]
  );
  return Number(rows[0].id);
}

async function insertEmailTemplate(userId, name, attachments = []) {
  const { rows } = await db.query(
    `INSERT INTO email_templates (id_user, template_name, subject, body_html, attachments) VALUES ($1, $2, 'Tieu de', '<p>x</p>', $3) RETURNING id`,
    [userId, name, JSON.stringify(attachments)]
  );
  return Number(rows[0].id);
}

async function sellerAttachment(sellerId, fileName, size) {
  const key = `uploads/${sellerId}/1700000000000_aaaa_${fileName}`;
  await storage.put(key, Buffer.alloc(size, 9));
  return { key, url: `https://old/${key}`, originalName: fileName, displayName: fileName, size, contentType: 'application/pdf', storageObjectId: 1 };
}

/** Khối + flow_json của chiến dịch người bán (cùng dữ liệu cho snapshot cũ và cho chiến dịch người mua chép nguyên văn). */
function sellerGraph({ zaloA, zaloB, email }) {
  const withTemplates = zaloA != null;
  const configs = [
    ['trigger', 'manual_trigger', 'Bat dau', {}],
    ['action', 'select_zalo_account', 'Chon nick', { zaloAccountId: 55, zaloPoolAccountIds: ['55'] }],
    ['action', 'send_zalo_group', 'Gui nhom', {
      zaloAccountId: 55,
      zaloGroupSource: 'manual',
      zaloGroupIds: 'group-cua-nguoi-ban',
      zaloGroupTemplateSteps: withTemplates ? [{ templateId: zaloA }, { templateId: String(zaloB) }] : [],
    }],
    ['action', 'send_email', 'Gui mail', {
      fromEmailId: 3,
      recipientSource: 'manual',
      recipientEmails: ['khach@example.com'],
      emailSteps: withTemplates ? [{ templateId: email }] : [],
    }],
  ];
  const flowNodes = configs.slice(1).map(([, subtype, name, config], index) => ({
    id: `n${index}`, type: 'task', data: { nodeType: subtype, label: name, config },
  }));
  return { configs, flowJson: { nodes: flowNodes, edges: [] } };
}

async function insertOldListing(sellerId, title, graph) {
  const snapshot = {
    campaignName: title,
    campaignType: 'mixed',
    flowJson: graph.flowJson,
    nodes: graph.configs.map(([type, subtype, name, config], index) => ({
      id: 100 + index, nodeType: type, nodeSubtype: subtype, nodeName: name, positionX: 0, positionY: 0, config, executionOrder: index + 1,
    })),
    connections: [],
  };
  const { rows } = await db.query(
    `INSERT INTO marketplace_listings (id_user, resource_type, resource_id, title, price_credits, status, snapshot_data)
     VALUES ($1, 'campaign', 1, $2, 0, 'published', $3) RETURNING id`,
    [sellerId, title, JSON.stringify(snapshot)]
  );
  return Number(rows[0].id);
}

/** Chiến dịch người mua kiểu cũ: chép nguyên văn config + flow_json của người bán. */
async function insertOldPurchasedCampaign({ buyerId, sellerId, listingId, graph, status = 'draft', withRun = false }) {
  const { rows: purchases } = await db.query(
    `INSERT INTO marketplace_purchases (id_user, listing_id, seller_id, credits_spent, transaction_type, cloned_resource_type)
     VALUES ($1, $2, $3, 0, 'purchase', 'campaign') RETURNING id`,
    [buyerId, listingId, sellerId]
  );
  const { rows: campaigns } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, flow_json, marketplace_purchase_id)
     VALUES ($1, 'Da mua', 'mixed', $2, $3, $4) RETURNING id`,
    [buyerId, status, JSON.stringify(graph.flowJson), purchases[0].id]
  );
  const campaignId = Number(campaigns[0].id);
  let order = 1;
  for (const [type, subtype, name, config] of graph.configs) {
    await db.query(
      `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order) VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaignId, type, subtype, name, JSON.stringify(config), order++]
    );
  }
  if (withRun) {
    await db.query(`INSERT INTO campaign_runs (id_campaign, workspace_owner_id, status) VALUES ($1, $2, 'completed')`, [campaignId, buyerId]);
  }
  return campaignId;
}

/** Ảnh chụp các bảng liên quan — so trước/sau để chứng minh dry-run / chạy lần hai không ghi gì. */
async function fingerprint() {
  const dump = async (sql) => (await db.query(sql)).rows;
  return JSON.stringify({
    listings: await dump('SELECT id, snapshot_data FROM marketplace_listings ORDER BY id'),
    campaigns: await dump('SELECT id, flow_json, status FROM campaigns ORDER BY id'),
    nodes: await dump('SELECT id, config, id_email_template, id_zalo_template FROM campaign_nodes ORDER BY id'),
    zalo: await dump('SELECT id, id_user, template_name, attachments FROM zalo_templates ORDER BY id'),
    email: await dump('SELECT id, id_user, template_name, attachments FROM email_templates ORDER BY id'),
    ledger: await dump('SELECT storage_key, owner_user_id, size_bytes, state FROM storage_objects ORDER BY id'),
    templateFiles: await dump('SELECT storage_key FROM template_files ORDER BY id'),
    files: [...storage.files.keys()].sort(),
  });
}

const entryOf = (entries, key, id) => entries.find((entry) => entry[key] === String(id));

/**
 * Bối cảnh: người bán S có mẫu Zalo A (có tệp), Zalo B, mẫu email E (có tệp).
 *  L1 dùng A+B+E (như listing 8/9); L2 không dùng mẫu (như listing 1/6); L3 trỏ mẫu đã xoá (như listing 5).
 */
async function seedWorld() {
  const seller = await createUser('seller');
  const buyer1 = await createUser('buyer1');
  const buyer2 = await createUser('buyer2');
  const buyer3 = await createUser('buyer3');
  const fileA = await sellerAttachment(seller.id, 'bang-gia.pdf', 3000);
  const fileE = await sellerAttachment(seller.id, 'brochure.pdf', 2000);
  const zaloA = await insertZaloTemplate(seller.id, 'Zalo A', 'Noi dung A', [fileA]);
  const zaloB = await insertZaloTemplate(seller.id, 'Zalo B', 'Noi dung B');
  const email = await insertEmailTemplate(seller.id, 'Mail E', [fileE]);
  const goneZalo = await insertZaloTemplate(seller.id, 'Zalo da xoa', 'x');
  const graph1 = sellerGraph({ zaloA, zaloB, email });
  const graph2 = sellerGraph({});
  const graph3 = sellerGraph({ zaloA: goneZalo, zaloB: goneZalo, email });
  const listing1 = await insertOldListing(seller.id, 'L1 co mau', graph1);
  const listing2 = await insertOldListing(seller.id, 'L2 khong mau', graph2);
  const listing3 = await insertOldListing(seller.id, 'L3 mau da mat', graph3);
  await db.query('DELETE FROM zalo_templates WHERE id = $1', [goneZalo]);
  const campaigns = {
    c1: await insertOldPurchasedCampaign({ buyerId: buyer1.id, sellerId: seller.id, listingId: listing1, graph: graph1 }),
    c2: await insertOldPurchasedCampaign({ buyerId: buyer2.id, sellerId: seller.id, listingId: listing2, graph: graph2 }),
    c3: await insertOldPurchasedCampaign({ buyerId: buyer1.id, sellerId: seller.id, listingId: listing3, graph: graph3 }),
    active: await insertOldPurchasedCampaign({ buyerId: buyer2.id, sellerId: seller.id, listingId: listing1, graph: graph1, status: 'active' }),
    ran: await insertOldPurchasedCampaign({ buyerId: buyer3.id, sellerId: seller.id, listingId: listing1, graph: graph1, withRun: true }),
  };
  return { seller, buyer1, buyer2, buyer3, ids: { zaloA, zaloB, email }, files: { fileA, fileE }, listings: { listing1, listing2, listing3 }, campaigns };
}

describe('script bù dữ liệu Marketplace chiến dịch kèm mẫu', () => {
  it('DRY-RUN: in đúng kế hoạch và KHÔNG ghi gì (DB, kho tệp)', async () => {
    const world = await seedWorld();
    const before = await fingerprint();

    const report = await runMarketplaceCampaignBackfill({ apply: false });

    expect(await fingerprint()).toBe(before);
    // listing
    const l1 = entryOf(report.listings, 'listingId', world.listings.listing1);
    expect(l1).toMatchObject({ action: 'se_ghi', zaloTemplates: 2, emailTemplates: 1, attachments: 2, stripped: true, purchases: 3 });
    expect(entryOf(report.listings, 'listingId', world.listings.listing2)).toMatchObject({ action: 'se_ghi', zaloTemplates: 0, emailTemplates: 0, stripped: true });
    expect(entryOf(report.listings, 'listingId', world.listings.listing3)).toMatchObject({ action: 'bo_qua' });
    expect(entryOf(report.listings, 'listingId', world.listings.listing3).reason).toContain('thiếu mẫu');
    // chiến dịch
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.c1)).toMatchObject({ action: 'se_ghi', templatesCopied: 3, filesCopied: 2, flowChanged: true });
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.c1).nodesChanged).toBeGreaterThan(0);
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.c2)).toMatchObject({ action: 'se_ghi', templatesCopied: 0, filesCopied: 0, flowChanged: true });
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.c3)).toMatchObject({ action: 'bo_qua' });
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.c3).reason).toContain('listing nguồn');
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.active).reason).toContain('active');
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.ran).reason).toContain('lượt chạy');
    expect(report.totals).toMatchObject({ listingsUpdated: 2, listingsSkipped: 1, campaignsUpdated: 2, campaignsSkipped: 3, templatesCopied: 3, filesCopied: 2, errors: 0 });

    const text = formatBackfillReport(report);
    expect(text).toContain('DRY-RUN');
    expect(text).toContain('BỎ QUA');
    // eslint-disable-next-line no-console
    console.log(`\n${text}\n`);
  });

  it('--apply: listing nhúng mẫu + sạch khoá; chiến dịch đã mua có bản sao mẫu của người mua, tệp, sổ dung lượng, id mới ở nodes + flow_json', async () => {
    const world = await seedWorld();
    const report = await runMarketplaceCampaignBackfill({ apply: true });
    expect(report.totals.errors).toBe(0);

    // --- listing
    const l1 = (await db.query('SELECT snapshot_data FROM marketplace_listings WHERE id = $1', [world.listings.listing1])).rows[0].snapshot_data;
    expect(Object.keys(l1.templates.zalo).sort()).toEqual([world.ids.zaloA, world.ids.zaloB].map(String).sort());
    expect(Object.keys(l1.templates.email)).toEqual([String(world.ids.email)]);
    expect(l1.templates.zalo[String(world.ids.zaloA)].attachments[0].key).toBe(world.files.fileA.key); // vẫn trỏ tệp người bán (chép lúc MUA)
    const rawL1 = JSON.stringify({ nodes: l1.nodes, flowJson: l1.flowJson });
    ['group-cua-nguoi-ban', '"zaloAccountId"', '"fromEmailId"', 'khach@example.com'].forEach((needle) => expect(rawL1).not.toContain(needle));
    const l2 = (await db.query('SELECT snapshot_data FROM marketplace_listings WHERE id = $1', [world.listings.listing2])).rows[0].snapshot_data;
    expect(l2.templates).toEqual({ email: {}, zalo: {} });
    expect(JSON.stringify(l2.nodes)).not.toContain('"zaloAccountId"');
    // listing 3 (mẫu đã mất) KHÔNG bị sửa
    const l3 = (await db.query('SELECT snapshot_data FROM marketplace_listings WHERE id = $1', [world.listings.listing3])).rows[0].snapshot_data;
    expect(l3.templates).toBeUndefined();
    expect(JSON.stringify(l3.nodes)).toContain('"zaloAccountId"');

    // --- chiến dịch c1 của buyer1
    const buyer1Zalo = (await db.query('SELECT id, template_name, body_text, attachments FROM zalo_templates WHERE id_user = $1 ORDER BY template_name', [world.buyer1.id])).rows;
    const buyer1Email = (await db.query('SELECT id, template_name, attachments FROM email_templates WHERE id_user = $1', [world.buyer1.id])).rows;
    expect(buyer1Zalo.map((row) => row.template_name)).toEqual(['Zalo A', 'Zalo B']);
    expect(buyer1Email.map((row) => row.template_name)).toEqual(['Mail E']);
    const zaloAttachment = buyer1Zalo[0].attachments[0];
    expect(zaloAttachment.key.startsWith(`uploads/${world.buyer1.id}/`)).toBe(true);
    expect(buyer1Email[0].attachments[0].key.startsWith(`uploads/${world.buyer1.id}/`)).toBe(true);
    expect(storage.files.get(zaloAttachment.key).length).toBe(3000);
    const ledger = (await db.query('SELECT storage_key, size_bytes, state, category FROM storage_objects WHERE owner_user_id = $1 ORDER BY size_bytes', [world.buyer1.id])).rows;
    expect(ledger.map((row) => [row.category, row.size_bytes, row.state])).toEqual([['email_template', '2000', 'active'], ['zalo_template', '3000', 'active']]);
    expect(await db.query('SELECT COUNT(*)::int AS n FROM template_files WHERE storage_key = $1', [buyer1Email[0].attachments[0].key]).then((r) => r.rows[0].n)).toBe(1);

    const nodes = (await db.query('SELECT node_subtype, config FROM campaign_nodes WHERE id_campaign = $1', [world.campaigns.c1])).rows;
    const refs = collectRequiredTemplateReferences(nodes);
    expect(refs).toHaveLength(3);
    const buyerZaloIds = new Set(buyer1Zalo.map((row) => String(row.id)));
    refs.forEach((ref) => {
      expect(ref.channel === 'email' ? String(ref.id) === String(buyer1Email[0].id) : buyerZaloIds.has(String(ref.id))).toBe(true);
    });
    const rawNodes = JSON.stringify(nodes);
    ['group-cua-nguoi-ban', '"zaloAccountId"', '"fromEmailId"', 'khach@example.com'].forEach((needle) => expect(rawNodes).not.toContain(needle));
    const flow = (await db.query('SELECT flow_json FROM campaigns WHERE id = $1', [world.campaigns.c1])).rows[0].flow_json;
    expect(JSON.stringify(flow)).not.toContain('"zaloAccountId"');
    flow.nodes.find((node) => node.id === 'n1').data.config.zaloGroupTemplateSteps.forEach((step) => expect(buyerZaloIds.has(String(step.templateId))).toBe(true));
    // đường gửi của người mua đọc được mẫu mới
    const newGroupStep = nodes.find((node) => node.node_subtype === 'send_zalo_group').config.zaloGroupTemplateSteps[0];
    expect((await zaloTemplateRepository.findContentByIdForUser(newGroupStep.templateId, world.buyer1.id)).body_text).toBe('Noi dung A');
    expect(await zaloTemplateRepository.findContentByIdForUser(world.ids.zaloA, world.buyer1.id)).toBeNull();

    // --- chiến dịch c2 (listing không mẫu): chỉ gỡ khoá người bán
    const c2Nodes = (await db.query('SELECT config FROM campaign_nodes WHERE id_campaign = $1', [world.campaigns.c2])).rows;
    expect(JSON.stringify(c2Nodes)).not.toContain('"zaloAccountId"');
    expect(JSON.stringify(c2Nodes)).not.toContain('group-cua-nguoi-ban');
    expect(await db.query('SELECT COUNT(*)::int AS n FROM zalo_templates WHERE id_user = $1', [world.buyer2.id]).then((r) => r.rows[0].n)).toBe(0);

    // --- những chiến dịch bị bỏ qua nguyên vẹn
    for (const key of ['c3', 'active', 'ran']) {
      const skipped = (await db.query('SELECT config FROM campaign_nodes WHERE id_campaign = $1', [world.campaigns[key]])).rows;
      expect(JSON.stringify(skipped)).toContain('"zaloAccountId"');
    }
    expect(await db.query('SELECT COUNT(*)::int AS n FROM zalo_templates WHERE id_user = $1', [world.buyer3.id]).then((r) => r.rows[0].n)).toBe(0);
  });

  it('chạy --apply LẦN HAI không đổi gì (không nhân đôi mẫu, không chép tệp lại), dry-run sau đó cũng báo không còn gì', async () => {
    await seedWorld();
    await runMarketplaceCampaignBackfill({ apply: true });
    const afterFirst = await fingerprint();
    const copiesAfterFirst = storage.state.copyCalls;

    const second = await runMarketplaceCampaignBackfill({ apply: true });

    expect(await fingerprint()).toBe(afterFirst);
    expect(storage.state.copyCalls).toBe(copiesAfterFirst);
    expect(second.totals).toMatchObject({ listingsUpdated: 0, campaignsUpdated: 0, templatesCopied: 0, filesCopied: 0, errors: 0 });
    expect(second.campaigns.filter((entry) => entry.action === 'khong_doi').length).toBe(2);
    const dry = await runMarketplaceCampaignBackfill({ apply: false });
    expect(dry.totals).toMatchObject({ listingsUpdated: 0, campaignsUpdated: 0 });
    expect(await fingerprint()).toBe(afterFirst);
  });

  it('lỗi chép tệp ở một chiến dịch → rollback sạch chiến dịch đó (mẫu, tệp, sổ), chiến dịch khác vẫn xong; chạy lại thì hoàn tất', async () => {
    const world = await seedWorld();
    storage.state.failCopyOnCall = 2; // tệp thứ hai của c1 lỗi
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const report = await runMarketplaceCampaignBackfill({ apply: true });

    errorSpy.mockRestore();
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.c1).action).toBe('loi');
    expect(entryOf(report.campaigns, 'campaignId', world.campaigns.c2).action).toBe('da_ghi'); // không bị chặn lây
    expect(report.totals.errors).toBe(1);
    // c1 như chưa đụng tới
    expect(await db.query('SELECT COUNT(*)::int AS n FROM zalo_templates WHERE id_user = $1', [world.buyer1.id]).then((r) => r.rows[0].n)).toBe(0);
    expect(await db.query('SELECT COUNT(*)::int AS n FROM email_templates WHERE id_user = $1', [world.buyer1.id]).then((r) => r.rows[0].n)).toBe(0);
    expect(await db.query('SELECT COUNT(*)::int AS n FROM storage_objects WHERE owner_user_id = $1', [world.buyer1.id]).then((r) => r.rows[0].n)).toBe(0);
    expect([...storage.files.keys()].some((key) => key.startsWith(`uploads/${world.buyer1.id}/`))).toBe(false);
    expect(JSON.stringify((await db.query('SELECT config FROM campaign_nodes WHERE id_campaign = $1', [world.campaigns.c1])).rows)).toContain('"zaloAccountId"');

    storage.state.failCopyOnCall = null;
    const retry = await runMarketplaceCampaignBackfill({ apply: true });
    expect(entryOf(retry.campaigns, 'campaignId', world.campaigns.c1).action).toBe('da_ghi');
    expect(retry.totals.errors).toBe(0);
    expect(await db.query('SELECT COUNT(*)::int AS n FROM zalo_templates WHERE id_user = $1', [world.buyer1.id]).then((r) => r.rows[0].n)).toBe(2);
  });

  it('tệp đính kèm của người bán đã mất → chiến dịch bị bỏ qua có lý do, không chép nửa chừng', async () => {
    const world = await seedWorld();
    await storage.delete(world.files.fileA.key);

    const report = await runMarketplaceCampaignBackfill({ apply: true });

    const c1 = entryOf(report.campaigns, 'campaignId', world.campaigns.c1);
    expect(c1.action).toBe('bo_qua');
    expect(c1.reason).toContain('thiếu nội dung');
    expect(await db.query('SELECT COUNT(*)::int AS n FROM zalo_templates WHERE id_user = $1', [world.buyer1.id]).then((r) => r.rows[0].n)).toBe(0);
    expect(storage.state.copyCalls).toBe(0);
  });

  it('chiến dịch người mua đã tự chọn lại mẫu của MÌNH → giữ nguyên mẫu đó, chỉ gỡ khoá người bán còn sót', async () => {
    const world = await seedWorld();
    const ownTemplate = await insertZaloTemplate(world.buyer2.id, 'Mau cua toi', 'Noi dung rieng');
    const config = { zaloAccountId: 55, zaloGroupTemplateSteps: [{ templateId: ownTemplate }], zaloGroupIds: 'group-cua-nguoi-ban' };
    await db.query(`UPDATE campaign_nodes SET config = $1 WHERE id_campaign = $2 AND node_subtype = 'send_zalo_group'`, [JSON.stringify(config), world.campaigns.c2]);

    await runMarketplaceCampaignBackfill({ apply: true });

    const group = (await db.query(`SELECT config FROM campaign_nodes WHERE id_campaign = $1 AND node_subtype = 'send_zalo_group'`, [world.campaigns.c2])).rows[0].config;
    expect(group.zaloGroupTemplateSteps).toEqual([{ templateId: ownTemplate }]);
    expect(group.zaloGroupIds).toBe('');
    expect('zaloAccountId' in group).toBe(false);
    expect(await db.query('SELECT COUNT(*)::int AS n FROM zalo_templates WHERE id_user = $1', [world.buyer2.id]).then((r) => r.rows[0].n)).toBe(1);
  });

  it('chiến dịch trỏ mẫu KHÔNG rõ nguồn (không phải của người bán, cũng không của người mua) → bỏ qua, không đoán', async () => {
    const world = await seedWorld();
    const stranger = await createUser('stranger');
    const foreign = await insertZaloTemplate(stranger.id, 'Cua nguoi la', 'bi mat');
    await db.query(
      `UPDATE campaign_nodes SET config = $1 WHERE id_campaign = $2 AND node_subtype = 'send_zalo_group'`,
      [JSON.stringify({ zaloGroupTemplateSteps: [{ templateId: foreign }] }), world.campaigns.c2]
    );

    const report = await runMarketplaceCampaignBackfill({ apply: true });

    const c2 = entryOf(report.campaigns, 'campaignId', world.campaigns.c2);
    expect(c2.action).toBe('bo_qua');
    expect(c2.reason).toContain('không rõ nguồn');
  });

  it('giới hạn phạm vi: --listing chỉ đụng listing đó và chiến dịch của nó; --campaign chỉ đụng listing nguồn của chiến dịch đó', async () => {
    const world = await seedWorld();
    const byListing = await runMarketplaceCampaignBackfill({ apply: false, listingIds: [world.listings.listing2] });
    expect(byListing.listings.map((entry) => entry.listingId)).toEqual([String(world.listings.listing2)]);
    expect(byListing.campaigns.map((entry) => entry.campaignId)).toEqual([String(world.campaigns.c2)]);

    const byCampaign = await runMarketplaceCampaignBackfill({ apply: false, campaignIds: [world.campaigns.c1] });
    expect(byCampaign.listings.map((entry) => entry.listingId)).toEqual([String(world.listings.listing1)]);
    expect(byCampaign.campaigns.map((entry) => entry.campaignId)).toEqual([String(world.campaigns.c1)]);
  });
});
