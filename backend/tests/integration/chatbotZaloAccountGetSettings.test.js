import { beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import chatbotZaloAccountRepository from '../../src/repositories/chatbot/chatbotZaloAccount.repository.js';

/**
 * PLAN_DON_CAI_DAT_KENH_CHATBOT PR-B — getSettings phải trả cấu hình AI của chatbot ĐƯỢC GÁN
 * (alias chatbot_*), tách khỏi các cột AI DEFAULT của chatbot_zalo_account_settings.
 */
beforeEach(async () => {
  await truncateAll();
});

describe('chatbotZaloAccount.getSettings — cột chatbot_* của chatbot được gán', () => {
  it('trả temperature/max_tokens/response_style/ai_model/welcome_message/system_instruction thật của chatbot', async () => {
    const owner = await createUser({ username: `zalo_gs_${Date.now()}` });
    const { rows: cb } = await db.query(
      `INSERT INTO custom_chatbots
         (id_user, name, widget_key, is_active, system_instruction, temperature, max_tokens, response_style, welcome_message, ai_model)
       VALUES ($1, 'Bot', $2, true, 'HD THAT', 1.0, 1024, 'concise', 'Chao X', 'gemini-2.5-flash')
       RETURNING id`,
      [owner.id, `bot_gs_${Date.now()}`]
    );
    const { rows: zs } = await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, 'Zalo', 'connected', true) RETURNING id`,
      [owner.id]
    );
    await chatbotZaloAccountRepository.setEnabled(owner.id, zs[0].id, cb[0].id, true);

    const row = await chatbotZaloAccountRepository.getSettings(owner.id, zs[0].id, { idChatbot: cb[0].id });

    expect(row.chatbot_system_instruction).toBe('HD THAT');
    expect(Number(row.chatbot_temperature)).toBe(1);
    expect(Number(row.chatbot_max_tokens)).toBe(1024);
    expect(row.chatbot_response_style).toBe('concise');
    expect(row.chatbot_welcome_message).toBe('Chao X');
    expect(row.chatbot_ai_model).toBe('gemini-2.5-flash');
  });
});
