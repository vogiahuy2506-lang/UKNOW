/**
 * Integration: job đếm lượt khách hỏi chatbot về từng sản phẩm (PLAN_PHEU_NGUOI_GIA_SO_HOI_CHATBOT PR-D).
 * Chạy trên PostgreSQL thật (cổng 5433).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { scanProductMentions } = await import('../../src/services/products/productMentionScan.service.js');
const productChatMentionRepo = (await import('../../src/repositories/products/productChatMention.repository.js')).default;
const chatbotContactAlertRepo = (await import('../../src/repositories/chatbot/chatbotContactAlert.repository.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

async function insertProduct(userId, name, code = null) {
  const { rows } = await db.query(
    `INSERT INTO products (id_user, workspace_owner_id, product_name, product_code, status)
     VALUES ($1::int, $1::bigint, $2, $3, 'active') RETURNING id`,
    [userId, name, code]
  );
  return rows[0].id;
}

async function insertWebMessage(userId, text, { createdAt = new Date(), convId = null, role = 'visitor' } = {}) {
  let conversationId = convId;
  if (!conversationId) {
    const { rows: w } = await db.query(
      `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
      [userId, `k_${Math.random().toString(36).slice(2)}`]
    );
    const { rows: c } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, $3, 'Khách') RETURNING id`,
      [userId, w[0].id, `s_${Math.random().toString(36).slice(2)}`]
    );
    conversationId = c[0].id;
  }
  const { rows } = await db.query(
    `INSERT INTO webchat_messages (id_conversation, id_user, role, content, created_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [conversationId, userId, role, text, createdAt]
  );
  return { convId: conversationId, msgId: Number(rows[0].id) };
}

async function insertChannelMessage(userId, text) {
  const { rows: ch } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name)
     VALUES ($1, 'telegram', $2, 'Bot') RETURNING id`,
    [userId, `ext_${Math.random().toString(36).slice(2)}`]
  );
  const { rows: c } = await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name)
     VALUES ($1, $2, 'telegram', 'u1', 'Khách TG') RETURNING id`,
    [userId, ch[0].id]
  );
  const { rows } = await db.query(
    `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content)
     VALUES ($1, $2, $3, 'visitor', $4) RETURNING id`,
    [c[0].id, userId, ch[0].id, text]
  );
  return { convId: c[0].id, msgId: Number(rows[0].id) };
}

async function insertZaloMessage(userId, text) {
  const { rows: z } = await db.query(
    `INSERT INTO zalo_settings (id_user, is_active, display_name) VALUES ($1, true, 'Zalo') RETURNING id`,
    [userId]
  );
  const { rows: c } = await db.query(
    `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name)
     VALUES ($1, $2, '111', 'Khách Zalo') RETURNING id`,
    [userId, z[0].id]
  );
  const { rows } = await db.query(
    `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content)
     VALUES ($1, $2, $3, 'visitor', $4) RETURNING id`,
    [c[0].id, userId, z[0].id, text]
  );
  return { convId: c[0].id, msgId: Number(rows[0].id) };
}

const startAt = new Date(Date.now() - 24 * 3600 * 1000);
const endExclusive = new Date(Date.now() + 24 * 3600 * 1000);

beforeEach(async () => {
  await truncateAll();
  await db.query('TRUNCATE TABLE product_chat_mentions, product_mention_scan_cursors, chatbot_contact_scan_cursors CASCADE');
});

describe('Job đếm lượt hỏi chatbot về sản phẩm', () => {
  it('quét tin visitor ở web/channel/zalo_personal, ghi dòng nhắc, đẩy con trỏ riêng', async () => {
    const owner = await createUser({ username: 'shop-pm-1', email: 'pm1@example.com' });
    const productId = await insertProduct(owner.id, 'Khóa học AI thực chiến', 'AIX-01');

    // Khởi tạo con trỏ trước (lần đầu quét cuộn 30 ngày, tin dưới đây nằm trong 30 ngày).
    const web = await insertWebMessage(owner.id, 'khoá học ai thực chiến giá bao nhiêu shop?');
    const channel = await insertChannelMessage(owner.id, 'Cho mình hỏi mã AIX-01 nhé');
    const zalo = await insertZaloMessage(owner.id, 'KHOA HOC AI THUC CHIEN còn chỗ không');
    await insertWebMessage(owner.id, 'chào shop', { convId: web.convId }); // không nhắc sản phẩm
    await insertWebMessage(owner.id, 'khóa học ai thực chiến', { convId: web.convId, role: 'agent' }); // agent: bỏ

    const result = await scanProductMentions();
    expect(result.initializedSources.sort()).toEqual(['channel', 'web', 'zalo_personal']);
    expect(result.mentions).toBe(3);

    const { rows } = await db.query(
      `SELECT source, message_id, conversation_key, workspace_owner_id, product_id
       FROM product_chat_mentions ORDER BY source`
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.conversation_key).sort()).toEqual(
      [`channel:${channel.convId}`, `web:${web.convId}`, `zalo_personal:${zalo.convId}`].sort()
    );
    for (const r of rows) {
      expect(Number(r.workspace_owner_id)).toBe(Number(owner.id));
      expect(r.product_id).toBe(productId);
    }

    // Con trỏ riêng đã đẩy, con trỏ của job liên hệ không bị đụng.
    expect(await productChatMentionRepo.getCursor('zalo_personal')).toBe(zalo.msgId);
    expect(await chatbotContactAlertRepo.getCursor('zalo_personal')).toBeNull();
    expect(await chatbotContactAlertRepo.getCursor('web')).toBeNull();
  });

  it('chạy lại không nhân đôi dòng nhắc', async () => {
    const owner = await createUser({ username: 'shop-pm-2', email: 'pm2@example.com' });
    const productId = await insertProduct(owner.id, 'Combo Marketing');
    const { msgId } = await insertWebMessage(owner.id, 'tư vấn combo marketing giúp mình');
    await scanProductMentions();

    // Ép quét lại cùng tin: lùi con trỏ về trước tin đó.
    await productChatMentionRepo.setCursor('web', msgId - 1);
    const again = await scanProductMentions();
    expect(again.scanned).toBe(1);
    expect(again.mentions).toBe(0);

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM product_chat_mentions WHERE product_id = $1`,
      [productId]
    );
    expect(rows[0].n).toBe(1);
  });

  it('lần đầu chỉ lấy tin trong 30 ngày gần nhất', async () => {
    const owner = await createUser({ username: 'shop-pm-3', email: 'pm3@example.com' });
    await insertProduct(owner.id, 'Combo Marketing');
    const old = await insertWebMessage(owner.id, 'combo marketing', {
      createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000),
    });
    await insertWebMessage(owner.id, 'combo marketing', {
      convId: old.convId,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    });
    const result = await scanProductMentions();
    expect(result.mentions).toBe(1);
  });

  it('aggregate đếm hội thoại riêng biệt và tin, theo khoảng ngày, workspace khác không thấy', async () => {
    const owner = await createUser({ username: 'shop-pm-4', email: 'pm4@example.com' });
    const other = await createUser({ username: 'shop-pm-5', email: 'pm5@example.com' });
    const productId = await insertProduct(owner.id, 'Combo Marketing');
    await insertProduct(other.id, 'Combo Marketing');

    const first = await insertWebMessage(owner.id, 'combo marketing giá sao');
    await insertWebMessage(owner.id, 'combo marketing có ưu đãi không', { convId: first.convId }); // cùng hội thoại
    await insertWebMessage(owner.id, 'combo marketing còn không'); // hội thoại khác
    await insertWebMessage(other.id, 'combo marketing nè'); // workspace khác
    await insertWebMessage(owner.id, 'combo marketing hôm xưa', {
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000), // ngoài khoảng ngày
    });
    await scanProductMentions();

    const agg = await productChatMentionRepo.aggregateChatMentionsByProduct({
      workspaceOwnerId: owner.id,
      startAt,
      endExclusive,
    });
    expect(agg).toEqual([{ productId, chatConversations: 2, chatMessages: 3 }]);

    const wide = await productChatMentionRepo.aggregateChatMentionsByProduct({
      workspaceOwnerId: owner.id,
      startAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      endExclusive,
    });
    expect(wide[0].chatConversations).toBe(3);

    // Phễu "Mọi lúc" truyền mốc null = không chặn ngày (không phải "không có dòng nào").
    const allTime = await productChatMentionRepo.aggregateChatMentionsByProduct({
      workspaceOwnerId: owner.id,
      startAt: null,
      endExclusive: null,
    });
    expect(allTime).toEqual([{ productId, chatConversations: 3, chatMessages: 4 }]);

    const none = await productChatMentionRepo.aggregateChatMentionsByProduct({
      workspaceOwnerId: 999999,
      startAt,
      endExclusive,
    });
    expect(none).toEqual([]);
  });

  it('bỏ qua sản phẩm ngừng bán và tin của hội thoại nhóm Zalo', async () => {
    const owner = await createUser({ username: 'shop-pm-6', email: 'pm6@example.com' });
    const { rows } = await db.query(
      `INSERT INTO products (id_user, workspace_owner_id, product_name, status)
       VALUES ($1::int, $1::bigint, 'Sản phẩm ngừng bán', 'inactive') RETURNING id`,
      [owner.id]
    );
    expect(rows[0].id).toBeTruthy();
    await insertProduct(owner.id, 'Combo Marketing');
    await insertWebMessage(owner.id, 'sản phẩm ngừng bán còn không');

    const { rows: z } = await db.query(
      `INSERT INTO zalo_settings (id_user, is_active, display_name) VALUES ($1, true, 'Z') RETURNING id`,
      [owner.id]
    );
    const { rows: g } = await db.query(
      `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, visitor_info)
       VALUES ($1, $2, 'group_1', 'Nhóm', $3) RETURNING id`,
      [owner.id, z[0].id, JSON.stringify({ is_group: true })]
    );
    await db.query(
      `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content)
       VALUES ($1, $2, $3, 'visitor', 'combo marketing hay quá')`,
      [g[0].id, owner.id, z[0].id]
    );

    const result = await scanProductMentions();
    expect(result.mentions).toBe(0);
  });
});
