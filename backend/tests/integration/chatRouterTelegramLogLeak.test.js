/**
 * Telegram KHÔNG được ghi tin vào hội thoại của kênh khác (PLAN_SUA_AI_DOT1_2026-10-03 F1.2; A P0-1).
 *
 * Trước: routeMessageWithSettings(channel:'telegram_personal', conversationId = id bảng
 * telegram_personal_conversations) → _logMessage nhánh `else` lấy CHÍNH số id đó tra `channel_conversations`
 * rồi INSERT channel_messages. Hai bảng đều id tuần tự nên trùng số là chuyện thường → tin của khách Telegram
 * shop A (cả câu bot trả) hiện trong hội thoại WhatsApp/Telegram của shop B.
 * Sau: (1) danh sách kênh tường minh — Telegram/WhatsApp bỏ qua; (2) addChannelMessage đòi người ghi = chủ hội thoại.
 * Hai lớp độc lập nên mỗi lớp có ca riêng (ca "cùng chủ" chỉ lớp 1 chặn được; ca "khác chủ" gọi thẳng repo chỉ lớp 2).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import db from '../../src/config/database.js';
import chatRouterService from '../../src/services/chatbot/chatRouter.service.js';
import ragEngineService from '../../src/services/chatbot/ragEngine.service.js';
import chatbotRepository from '../../src/repositories/ai/chatbot.repository.js';
import { createUser, truncateAll } from './helpers/db.js';

const SHARED_ID = 7;

let shopA;
let shopB;
let waConnB;

async function seedWhatsappConversation(owner, conversationId) {
  const { rows: conn } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name)
     VALUES ($1, 'whatsapp_baileys', $2, 'WA') RETURNING id`,
    [owner.id, `wa_${owner.id}_${conversationId}`]
  );
  await db.query(
    `INSERT INTO channel_conversations (id, id_user, id_channel, channel, external_id, visitor_name)
     VALUES ($1, $2, $3, 'whatsapp_baileys', 'kh_wa', 'Khách WA') RETURNING id`,
    [conversationId, owner.id, conn[0].id]
  );
  return conn[0].id;
}

async function seedTelegramConversation(owner, conversationId) {
  const { rows: acc } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id) VALUES ($1, $2) RETURNING id`,
    [owner.id, 910000000 + owner.id]
  );
  await db.query(
    `INSERT INTO telegram_personal_conversations (id, id_user, id_telegram_account, external_id, visitor_name)
     VALUES ($1, $2, $3, 'peer_tg', 'Khách TG')`,
    [conversationId, owner.id, acc[0].id]
  );
}

async function channelMessageCount() {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM channel_messages`);
  return rows[0].n;
}

function routeTelegram(userId, conversationId) {
  return chatRouterService.routeMessageWithSettings({
    channel: 'telegram_personal',
    userId,
    chatbotId: null,
    message: 'em ở 12 Lê Lợi, sđt hỏi giá giúp em',
    conversationId,
    chatbotSettings: { is_enabled: true, ai_model: 'gemini-2.5-flash', temperature: 0.7, max_tokens: 512 },
  });
}

beforeEach(async () => {
  await truncateAll();
  jest.restoreAllMocks();
  // Không gọi Gemini / embedding / trừ credit thật: chỉ kiểm chỗ GHI TIN.
  jest.spyOn(chatRouterService, '_prepareChatCredit').mockResolvedValue({ creditContext: {} });
  jest.spyOn(chatRouterService, '_chargeChatCredit').mockResolvedValue(undefined);
  jest.spyOn(chatRouterService, '_callAI').mockResolvedValue({ text: 'Dạ shop xin chào ạ' });
  jest.spyOn(ragEngineService, 'buildContext').mockResolvedValue('');
  shopA = await createUser({ username: `shopA${Date.now()}` });
  shopB = await createUser({ username: `shopB${Date.now()}` });
});

describe('routeMessageWithSettings(telegram_personal) không ghi channel_messages', () => {
  it('khác chủ: id hội thoại Telegram của shop A trùng id hội thoại WhatsApp của shop B → channel_messages không thêm dòng', async () => {
    waConnB = await seedWhatsappConversation(shopB, SHARED_ID);
    await seedTelegramConversation(shopA, SHARED_ID);
    await db.query(`UPDATE channel_conversations SET last_message_at = '2020-01-01T00:00:00Z' WHERE id = $1`, [SHARED_ID]);

    const result = await routeTelegram(shopA.id, SHARED_ID);

    expect(result).toEqual({ type: 'text', content: 'Dạ shop xin chào ạ' });
    expect(await channelMessageCount()).toBe(0);
    // hội thoại của B không bị đẩy lên đầu (addChannelMessage từng UPDATE last_message_at = NOW()).
    const { rows } = await db.query(`SELECT last_message_at FROM channel_conversations WHERE id = $1`, [SHARED_ID]);
    expect(new Date(rows[0].last_message_at).toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });

  it('CÙNG chủ: shop A có cả hội thoại WhatsApp lẫn Telegram cùng số id → vẫn không ghi nhầm (chỉ danh sách kênh chặn được ca này)', async () => {
    await seedWhatsappConversation(shopA, SHARED_ID);
    await seedTelegramConversation(shopA, SHARED_ID);

    await routeTelegram(shopA.id, SHARED_ID);

    expect(await channelMessageCount()).toBe(0);
  });
});

describe('chatbotRepository.addChannelMessage đòi người ghi là chủ hội thoại', () => {
  it('khác chủ → không ghi, trả null', async () => {
    waConnB = await seedWhatsappConversation(shopB, SHARED_ID);

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const row = await chatbotRepository.addChannelMessage(SHARED_ID, shopA.id, waConnB, {
      role: 'visitor',
      content: 'tin lạc',
      message_type: 'text',
    });

    expect(row).toBeNull();
    expect(await channelMessageCount()).toBe(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('addChannelMessage bị từ chối'));
  });

  it('đối chứng: đúng chủ + đúng kênh → ghi được và cập nhật last_message_at', async () => {
    waConnB = await seedWhatsappConversation(shopB, SHARED_ID);

    const row = await chatbotRepository.addChannelMessage(SHARED_ID, shopB.id, waConnB, {
      role: 'visitor',
      content: 'tin đúng chỗ',
      message_type: 'text',
    });

    expect(row).toEqual(expect.objectContaining({ content: 'tin đúng chỗ' }));
    expect(await channelMessageCount()).toBe(1);
  });

  it('đối chứng: kênh nằm trong danh sách tường minh (zalo_oa) vẫn ghi qua _logMessage', async () => {
    const { rows: conn } = await db.query(
      `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name)
       VALUES ($1, 'zalo_oa', 'oa_1', 'OA') RETURNING id`,
      [shopB.id]
    );
    await db.query(
      `INSERT INTO channel_conversations (id, id_user, id_channel, channel, external_id, visitor_name)
       VALUES ($1, $2, $3, 'zalo_oa', 'kh_oa', 'Khách OA')`,
      [SHARED_ID, shopB.id, conn[0].id]
    );

    await chatRouterService._logMessage('zalo_oa', SHARED_ID, shopB.id, { role: 'visitor', content: 'xin chào OA' });

    const { rows } = await db.query(`SELECT content FROM channel_messages WHERE id_conversation = $1`, [SHARED_ID]);
    expect(rows.map((r) => r.content)).toEqual(['xin chào OA']);
  });
});
