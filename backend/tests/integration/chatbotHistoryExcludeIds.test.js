/**
 * Lịch sử hội thoại WhatsApp (Baileys) + Telegram cá nhân với `excludeMessageIds` — CHẠM POSTGRES THẬT.
 * (PLAN_SUA_AI_DOT1_2026-10-03 F1.1; A P0-2, A P1-1)
 *
 * Trước: `AND id NOT IN ($n)` với $n là MẢNG → node-pg gửi chuỗi '{1,2}' → Postgres ném
 *   `invalid input syntax for type integer`. WhatsApp: ném trước khi gọi AI, MỌI khách nhận câu xin lỗi.
 *   Telegram: `catch` trả [] → bot mất trí nhớ + chào lại ở mọi câu.
 * Test cũ mock trọn DB nên xanh trong khi Postgres ném lỗi — nên ca này KHÔNG mock DB.
 * Sau: `<> ALL($n::bigint[])` và lấy 20 tin MỚI nhất (không phải 20 tin CŨ nhất).
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import { getHistory as getWhatsappHistory } from '../../src/services/chatbot/whatsappBaileysInbox.service.js';
import chatRouterService from '../../src/services/chatbot/chatRouter.service.js';
import chatbotRepository from '../../src/repositories/ai/chatbot.repository.js';
import { createUser, truncateAll } from './helpers/db.js';

let user;

beforeEach(async () => {
  await truncateAll();
  user = await createUser({ username: `hist-${Date.now()}` });
});

/** 30 tin xen kẽ visitor/bot, nội dung "m1".."m30" theo thứ tự thời gian. Trả mảng id (tăng dần). */
async function seedWhatsappConversation(total = 30) {
  const { rows: conn } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name)
     VALUES ($1, 'whatsapp_baileys', $2, 'WA') RETURNING id`,
    [user.id, `wa_${Date.now()}`]
  );
  const { rows: conv } = await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name)
     VALUES ($1, $2, 'whatsapp_baileys', 'kh_1', 'Khách') RETURNING id`,
    [user.id, conn[0].id]
  );
  const ids = [];
  for (let i = 1; i <= total; i += 1) {
    const { rows } = await db.query(
      `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [conv[0].id, user.id, conn[0].id, i % 2 === 1 ? 'visitor' : 'bot', `m${i}`]
    );
    ids.push(Number(rows[0].id));
  }
  return { conversationId: conv[0].id, ids };
}

async function seedTelegramConversation(total = 30) {
  const { rows: acc } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id) VALUES ($1, $2) RETURNING id`,
    [user.id, 900000000 + Math.floor(Math.random() * 1e6)]
  );
  const { rows: conv } = await db.query(
    `INSERT INTO telegram_personal_conversations (id_user, id_telegram_account, external_id, visitor_name)
     VALUES ($1, $2, 'peer_1', 'Khách TG') RETURNING id`,
    [user.id, acc[0].id]
  );
  const ids = [];
  for (let i = 1; i <= total; i += 1) {
    const { rows } = await db.query(
      `INSERT INTO telegram_personal_messages (id_conversation, id_user, role, content)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [conv[0].id, user.id, i % 2 === 1 ? 'visitor' : 'bot', `m${i}`]
    );
    ids.push(Number(rows[0].id));
  }
  return { conversationId: conv[0].id, ids };
}

describe('WhatsApp Baileys getHistory — chạm Postgres thật', () => {
  it('có excludeMessageIds KHÔNG ném lỗi (trước: invalid input syntax for type integer)', async () => {
    const { conversationId, ids } = await seedWhatsappConversation(30);
    const rows = await getWhatsappHistory(conversationId, {
      throughMessageId: ids[29],
      excludeMessageIds: [ids[28], ids[29]],
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('trả 20 tin MỚI nhất theo thứ tự cũ → mới và loại đúng các id bị loại', async () => {
    const { conversationId, ids } = await seedWhatsappConversation(30);
    // Mô phỏng một đợt gom: 2 tin khách cuối (m29, m30) là tin của đợt này.
    const batchIds = [ids[28], ids[29]];
    const rows = await getWhatsappHistory(conversationId, {
      throughMessageId: Math.min(...batchIds),
      excludeMessageIds: batchIds,
    });
    // through = id của m29, loại m29 → còn m1..m28; 20 tin mới nhất = m9..m28 (không phải m1..m20).
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.content)).toEqual(Array.from({ length: 20 }, (_, i) => `m${9 + i}`));
    const got = rows.map((r) => Number(r.id));
    expect(got).toEqual([...got].sort((a, b) => a - b));
    expect(got).not.toContain(ids[28]);
    expect(got).not.toContain(ids[29]);
  });

  it('loại đúng id nằm GIỮA lịch sử (không chỉ tin cuối)', async () => {
    const { conversationId, ids } = await seedWhatsappConversation(10);
    const rows = await getWhatsappHistory(conversationId, { excludeMessageIds: [ids[4], ids[5]] });
    expect(rows.map((r) => r.content)).toEqual(['m1', 'm2', 'm3', 'm4', 'm7', 'm8', 'm9', 'm10']);
  });

  it('không có excludeMessageIds vẫn chạy (đối chứng)', async () => {
    const { conversationId } = await seedWhatsappConversation(5);
    const rows = await getWhatsappHistory(conversationId, {});
    expect(rows.map((r) => r.content)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });
});

describe('Telegram _getTelegramPersonalHistory — chạm Postgres thật', () => {
  it('có excludeMessageIds trả lịch sử (trước: ném lỗi rồi catch trả [] → bot mất trí nhớ)', async () => {
    const { conversationId, ids } = await seedTelegramConversation(30);
    const rows = await chatRouterService._getTelegramPersonalHistory(conversationId, 20, {
      throughMessageId: ids[29],
      excludeMessageIds: [ids[29]],
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('trả 20 tin MỚI nhất (m10..m29), đúng thứ tự, loại tin của đợt hiện tại', async () => {
    const { conversationId, ids } = await seedTelegramConversation(30);
    const rows = await chatRouterService._getTelegramPersonalHistory(conversationId, 20, {
      throughMessageId: ids[29],
      excludeMessageIds: [ids[29]],
    });
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.content)).toEqual(Array.from({ length: 20 }, (_, i) => `m${10 + i}`));
    expect(rows.map((r) => r.id)).not.toContain(ids[29]);
    expect(rows[0]).toEqual(expect.objectContaining({ role: expect.any(String), id: expect.any(Number) }));
  });

  it('isFirstMessage chỉ đúng khi hội thoại thật sự trống: có tin cũ thì history khác rỗng', async () => {
    const { conversationId, ids } = await seedTelegramConversation(2);
    // Tin 1 là tin khách của đợt hiện tại → loại; tin 2 cũ hơn không có → còn lại 0 tin => lần đầu.
    const first = await chatRouterService._getTelegramPersonalHistory(conversationId, 20, {
      throughMessageId: ids[0],
      excludeMessageIds: [ids[0]],
    });
    expect(first).toEqual([]);
    // Đợt sau: tin khách thứ 3 vừa tới → lịch sử là m1,m2.
    const { rows } = await db.query(
      `INSERT INTO telegram_personal_messages (id_conversation, id_user, role, content)
       VALUES ($1, $2, 'visitor', 'm3') RETURNING id`,
      [conversationId, user.id]
    );
    const later = await chatRouterService._getTelegramPersonalHistory(conversationId, 20, {
      throughMessageId: Number(rows[0].id),
      excludeMessageIds: [Number(rows[0].id)],
    });
    expect(later.map((r) => r.content)).toEqual(['m1', 'm2']);
  });
});

describe('chatbotRepository.getChannelMessages — cùng lỗi NOT IN với mảng', () => {
  it('có excludeMessageIds không ném lỗi và loại đúng id', async () => {
    const { conversationId, ids } = await seedWhatsappConversation(6);
    const rows = await chatbotRepository.getChannelMessages(conversationId, {
      limit: 20,
      excludeMessageIds: [ids[0], ids[5]],
    });
    expect(rows.map((r) => r.content)).toEqual(['m2', 'm3', 'm4', 'm5']);
  });
});
