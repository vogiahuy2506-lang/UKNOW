/**
 * WhatsApp (Baileys) dùng cấu hình của chatbot được gán (29/09/2026).
 *
 * Trước: findEnabledChatbots / resolveChatbotSettingsForBatch lấy temperature/max_tokens/response_style/
 * ai_model/welcome từ dòng chatbot_whatsapp_baileys_settings (chỉ mang DEFAULT) và ưu tiên bản CHỤP
 * system_instruction. Sau: chatbot thắng, dòng `s` chỉ dự phòng. Mỗi hàm một ca riêng (hai câu SQL riêng).
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import {
  findEnabledChatbots,
  resolveChatbotSettingsForBatch,
} from '../../src/services/chatbot/whatsappBaileysInbox.service.js';
import { createUser, truncateAll } from './helpers/db.js';

let user;
let sessionKey;

async function seed({ instruction, welcome, snapshot }) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots
       (id_user, name, widget_key, system_instruction, welcome_message,
        temperature, max_tokens, response_style, ai_model)
     VALUES ($1, 'Bot WA', $2, $3, $4, 0.20, 512, 'concise', 'gemini-2.5-pro')
     RETURNING id`,
    [user.id, `wa_${Date.now()}_${Math.random()}`, instruction, welcome]
  );
  const chatbotId = rows[0].id;
  // Dòng s mang DEFAULT (0.7 / 2048 / friendly / gemini-2.5-flash) + bản chụp cũ.
  await db.query(
    `INSERT INTO chatbot_whatsapp_baileys_settings
       (id_user, session_key, id_chatbot, is_enabled, system_instruction, welcome_message)
     VALUES ($1, $2, $3, true, $4, 'WELCOME_CU')`,
    [user.id, sessionKey, chatbotId, snapshot]
  );
  return chatbotId;
}

beforeEach(async () => {
  await truncateAll();
  user = await createUser({ username: `wa-cfg-${Date.now()}` });
  sessionKey = `${user.id}-default`;
});

describe('WhatsApp Baileys — cấu hình lấy từ chatbot được gán', () => {
  it('findEnabledChatbots: chatbot thắng dòng s (0.2/512/concise/welcome X/instruction MOI)', async () => {
    const chatbotId = await seed({ instruction: 'MOI', welcome: 'X', snapshot: 'CU' });
    const rows = await findEnabledChatbots(sessionKey);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id_chatbot).toBe(String(chatbotId));
    expect(Number(r.temperature)).toBe(0.2);
    expect(r.max_tokens).toBe(512);
    expect(r.response_style).toBe('concise');
    expect(r.ai_model).toBe('gemini-2.5-pro');
    expect(r.welcome_message).toBe('X');
    expect(r.system_instruction).toBe('MOI');
  });

  it('resolveChatbotSettingsForBatch: chatbot thắng dòng s (0.2/512/concise/welcome X/instruction MOI)', async () => {
    const chatbotId = await seed({ instruction: 'MOI', welcome: 'X', snapshot: 'CU' });
    const r = await resolveChatbotSettingsForBatch({ ownerUserId: user.id, sessionKey, chatbotId });
    expect(r).not.toBeNull();
    expect(Number(r.temperature)).toBe(0.2);
    expect(r.max_tokens).toBe(512);
    expect(r.response_style).toBe('concise');
    expect(r.ai_model).toBe('gemini-2.5-pro');
    expect(r.welcome_message).toBe('X');
    expect(r.system_instruction).toBe('MOI');
  });

  it('findEnabledChatbots: chatbot instruction rỗng thì dự phòng bản của s (CU)', async () => {
    await seed({ instruction: '   ', welcome: '', snapshot: 'CU' });
    const [r] = await findEnabledChatbots(sessionKey);
    expect(r.system_instruction).toBe('CU');
    expect(r.welcome_message).toBe('WELCOME_CU');
  });

  it('resolveChatbotSettingsForBatch: chatbot instruction rỗng thì dự phòng bản của s (CU)', async () => {
    const chatbotId = await seed({ instruction: '', welcome: '', snapshot: 'CU' });
    const r = await resolveChatbotSettingsForBatch({ ownerUserId: user.id, sessionKey, chatbotId });
    expect(r.system_instruction).toBe('CU');
    expect(r.welcome_message).toBe('WELCOME_CU');
  });
});
