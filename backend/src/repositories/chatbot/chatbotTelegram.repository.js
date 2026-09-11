/**
 * chatbotTelegram.repository.js
 *
 * Data access for Telegram personal accounts + per-chatbot enable flags.
 * Mirrors the structure of `chatbotZaloAccount.repository.js` so that the
 * DeployTab toggle UI behaves consistently across channels.
 */
import db from '../../config/database.js';

class ChatbotTelegramRepository {
  // ── Ownership check ────────────────────────────────────────────────

  /**
   * Verify that `telegramAccountId` belongs to `userId`. Throws 404 if
   * not — used as a guard before any write that touches a Telegram row.
   */
  async assertOwned(userId, telegramAccountId) {
    const { rows } = await db.query(
      `SELECT 1 FROM telegram_accounts
       WHERE id = $1 AND id_user = $2`,
      [telegramAccountId, userId]
    );
    if (!rows[0]) {
      const err = new Error('Không tìm thấy tài khoản Telegram trong workspace');
      err.status = 404;
      throw err;
    }
  }

  // ── Account CRUD ───────────────────────────────────────────────────

  async createAccount({
    idUser,
    telegramUserId,
    phone = null,
    firstName = null,
    lastName = null,
    username = null,
  }) {
    const { rows } = await db.query(
      `INSERT INTO telegram_accounts
         (id_user, telegram_user_id, phone, first_name, last_name, username)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id_user, telegram_user_id) DO UPDATE SET
         phone      = EXCLUDED.phone,
         first_name = EXCLUDED.first_name,
         last_name  = EXCLUDED.last_name,
         username   = EXCLUDED.username,
         is_active  = true,
         updated_at = NOW()
       RETURNING *`,
      [idUser, telegramUserId, phone, firstName, lastName, username]
    );
    return rows[0];
  }

  async getAccountById(id, { userId } = {}) {
    const params = [id];
    let userClause = '';
    if (userId) {
      params.push(userId);
      userClause = 'AND id_user = $2';
    }
    const { rows } = await db.query(
      `SELECT * FROM telegram_accounts WHERE id = $1 ${userClause}`,
      params
    );
    return rows[0] || null;
  }

  async getAccountByTelegramUserId(telegramUserId, { userId } = {}) {
    const params = [telegramUserId];
    let userClause = '';
    if (userId) {
      params.push(userId);
      userClause = 'AND id_user = $2';
    }
    const { rows } = await db.query(
      `SELECT * FROM telegram_accounts WHERE telegram_user_id = $1 ${userClause}`,
      params
    );
    return rows[0] || null;
  }

  async listAccountsByUser(userId) {
    const { rows } = await db.query(
      `SELECT * FROM telegram_accounts
       WHERE id_user = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  async deleteAccount(userId, id) {
    const { rows } = await db.query(
      `DELETE FROM telegram_accounts
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  }

  async deactivateAccount(userId, id) {
    const { rows } = await db.query(
      `UPDATE telegram_accounts
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  }

  async touchActivity(id) {
    await db.query(
      `UPDATE telegram_accounts SET last_activity_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  // ── Per-chatbot enable (DeployTab) ────────────────────────────────

  /**
   * One row per (account, chatbot) with the enable flag + DM/group split.
   * Mirrors `chatbotZaloAccount.repository.js:listAccountsForUser` so the
   * toggle modal in the Studio can be built with minimal divergence.
   */
  async listAccountsForUser(userId, chatbotId = null) {
    const params = [userId];
    let chatbotJoin = '';
    if (chatbotId != null) {
      params.push(chatbotId);
      chatbotJoin = `LEFT JOIN telegram_chatbot_settings tcs
        ON tcs.id_telegram_account = ta.id AND tcs.id_chatbot = $2`;
    } else {
      chatbotJoin = `LEFT JOIN LATERAL (
        SELECT is_enabled, is_enabled_dm, is_enabled_group, id_chatbot
        FROM telegram_chatbot_settings
        WHERE id_telegram_account = ta.id
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      ) tcs ON true`;
    }

    const { rows } = await db.query(
      `SELECT
         ta.id,
         ta.id_user,
         ta.telegram_user_id,
         ta.phone,
         ta.first_name,
         ta.last_name,
         ta.username,
         ta.is_active,
         ta.last_activity_at,
         ta.created_at,
         tcs.is_enabled        AS chatbot_enabled,
         tcs.is_enabled_dm     AS chatbot_enabled_dm,
         tcs.is_enabled_group  AS chatbot_enabled_group,
         tcs.id_chatbot        AS settings_chatbot_id,
         cb.name               AS chatbot_name
       FROM telegram_accounts ta
       ${chatbotJoin}
       LEFT JOIN custom_chatbots cb
         ON cb.id = tcs.id_chatbot AND cb.id_user = ta.id_user AND cb.is_active = true
       WHERE ta.id_user = $1 AND ta.is_active = true
       ORDER BY ta.created_at DESC`,
      params
    );
    return rows;
  }

  async setEnabled(userId, telegramAccountId, chatbotId, enabled) {
    await this.assertOwned(userId, telegramAccountId);
    const { rows } = await db.query(
      `INSERT INTO telegram_chatbot_settings
         (id_telegram_account, id_chatbot, is_enabled,
          is_enabled_dm, is_enabled_group)
       VALUES ($1, $2, $3, true, false)
       ON CONFLICT (id_telegram_account, id_chatbot) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         updated_at = NOW()
       RETURNING *`,
      [telegramAccountId, chatbotId, enabled]
    );
    return rows[0];
  }

  async getEnabledChatbots(telegramAccountId, { isDm = false, isGroup = false } = {}) {
    const conditions = [
      'tcs.id_telegram_account = $1',
      'tcs.is_enabled = true',
      'ta.is_active = true',
    ];
    const params = [telegramAccountId];
    if (isDm) conditions.push('tcs.is_enabled_dm = true');
    if (isGroup) conditions.push('tcs.is_enabled_group = true');

    const { rows } = await db.query(
      `SELECT
         tcs.id_chatbot       AS id,
         tcs.id_chatbot,
         cb.name              AS chatbot_name,
         cb.system_instruction,
         cb.ai_model,
         cb.temperature,
         cb.max_tokens,
         cb.response_style,
         cb.welcome_message,
         cb.greeting_msg,
         ta.id_user
       FROM telegram_chatbot_settings tcs
       JOIN telegram_accounts ta ON ta.id = tcs.id_telegram_account
       JOIN custom_chatbots cb
         ON cb.id = tcs.id_chatbot AND cb.is_active = true
       WHERE ${conditions.join(' AND ')}
       ORDER BY cb.id ASC`,
      params
    );
    return rows;
  }

  async disableAllForUser(userId) {
    await db.query(
      `UPDATE telegram_chatbot_settings tcs
       SET is_enabled = false, updated_at = NOW()
       FROM telegram_accounts ta
       WHERE tcs.id_telegram_account = ta.id
         AND ta.id_user = $1`,
      [userId]
    );
  }
}

export default new ChatbotTelegramRepository();
