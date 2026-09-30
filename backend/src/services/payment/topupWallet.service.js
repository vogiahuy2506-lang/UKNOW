/**
 * Wallet debit helpers for consumable top-ups (emails / zalo_messages / telegram_messages / whatsapp_messages / ai_credits).
 * Debit must run inside an open transaction with the same client that records the send.
 */
import {
  acquireWalletLock,
  getWalletBalance,
  insertTopupDebit,
  sumWalletGrants,
  sumWalletDebits,
} from '../../repositories/payment/topup.repository.js';
import { EFFECTIVE_PLAN_ID_SQL } from '../../utils/billingCycle.util.js';
import { WALLET_ITEM_BY_QUOTA_CHANNEL } from '../../constants/sendQuotaChannels.js';

// P10 — thêm telegram_messages / whatsapp_messages; bảng gốc ở constants/sendQuotaChannels.js.
export const WALLET_ITEM_BY_CHANNEL = WALLET_ITEM_BY_QUOTA_CHANNEL;

/**
 * @param {import('pg').PoolClient} client
 * @param {{
 *   billingUserId: number|string,
 *   itemKey: string,
 *   sourceKey: string,
 *   planLimit: number|null|undefined,
 *   usageCountAfterSend: number,
 *   qty?: number,
 * }} input
 * @returns {Promise<{ debited: boolean, reason: string }>}
 */
export async function maybeDebitWalletForSend(client, {
  billingUserId,
  itemKey,
  sourceKey,
  planLimit,
  usageCountAfterSend,
  qty = 1,
}) {
  if (!billingUserId || !itemKey || !sourceKey) {
    return { debited: false, reason: 'missing_args' };
  }
  // Unlimited plan → never touch wallet
  if (planLimit == null || !Number.isFinite(Number(planLimit))) {
    return { debited: false, reason: 'unlimited_plan' };
  }
  const limit = Number(planLimit);
  if (limit <= 0) {
    return { debited: false, reason: 'plan_disabled' };
  }
  // Still within plan allowance (this send included)
  if (Number(usageCountAfterSend) <= limit) {
    return { debited: false, reason: 'within_plan' };
  }

  await acquireWalletLock(client, billingUserId, itemKey);
  const row = await insertTopupDebit({
    userId: billingUserId,
    itemKey,
    qty,
    sourceKey,
  }, client);
  return { debited: Boolean(row), reason: row ? 'debited' : 'duplicate_source' };
}

/**
 * Preflight: wallet has remaining display balance (> 0).
 * Uses live DB read (caller should avoid quota cache for this path).
 */
export async function hasWalletRemaining(billingUserId, itemKey, queryable) {
  const balance = await getWalletBalance(billingUserId, itemKey, queryable);
  return balance.remaining > 0;
}

export async function getWalletSnapshot(billingUserId, itemKey, queryable) {
  const granted = await sumWalletGrants(billingUserId, itemKey, queryable);
  const used = await sumWalletDebits(billingUserId, itemKey, queryable);
  const rawRemaining = granted - used;
  return {
    granted,
    used,
    remaining: Math.max(0, rawRemaining),
    rawRemaining,
  };
}

const ZPM_OWNER_PREDICATE = `(zpm.id_user = $1 OR zpm.id_user IN (
   SELECT um.employee_id FROM user_members um
   WHERE um.owner_id = $1 AND um.status = 'active'))`;

const CAMPAIGN_OWNER_PREDICATE = `(c.id_user = $1 OR c.id_user IN (
   SELECT um.employee_id FROM user_members um
   WHERE um.owner_id = $1 AND um.status = 'active'))`;

/**
 * Debit wallet for a manual-inbox Zalo Personal send (same count formula as checkSendQuota).
 * Must run in the same transaction that inserted zalo_personal_messages.
 * sourceKey = zpm:<id>
 *
 * @param {import('pg').PoolClient} client
 * @param {{ billingUserId: number|string, messageId: number|string }} input
 */
export async function debitZaloPersonalInboxIfNeeded(client, { billingUserId, messageId }) {
  if (!billingUserId || !messageId) return { debited: false, reason: 'missing_args' };

  const { rows: limitRows } = await client.query(
    `SELECT p.monthly_zalo_limit
     FROM users u
     JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1
     LIMIT 1`,
    [billingUserId]
  );
  const rawLimit = limitRows[0]?.monthly_zalo_limit;
  const planLimit = rawLimit == null || rawLimit === ''
    ? null
    : Number.parseInt(rawLimit, 10);

  const { getBillingCycle } = await import('../../utils/billingCycle.util.js');
  const { countZaloSentThisMonth } = await import('../../utils/userSendLimit.util.js');
  const cycle = await getBillingCycle(billingUserId, {}, client);
  const usageCountAfterSend = (cycle?.hasPlan && cycle.cycleStart && cycle.cycleEnd)
    ? await countZaloSentThisMonth(
        billingUserId,
        cycle.cycleStart,
        cycle.cycleEnd,
        client
      )
    : 0;

  return maybeDebitWalletForSend(client, {
    billingUserId,
    itemKey: 'zalo_messages',
    sourceKey: `zpm:${messageId}`,
    planLimit: Number.isFinite(planLimit) ? planLimit : null,
    usageCountAfterSend,
  });
}

/**
 * P10 — trừ ví top-up (telegram_messages / whatsapp_messages) cho MỘT tin chiến dịch Telegram/WhatsApp đã gửi xong, ở đường
 * legacy (SEND_QUOTA_RESERVATION_MODE off/shadow — production hiện là shadow). Ở mode enforce việc trừ ví đi qua
 * `consumeSendQuota` (reservation) nên KHÔNG gọi hàm này. Trước P10 tin adapter không hề trừ ví (đếm chung vào Zalo, cổng cho
 * qua khi ví Zalo còn số dư nhưng không ghi debit) — từ khi có ví riêng, thiếu bước này ví sẽ dùng mãi không hết.
 *
 * Tự mở giao dịch riêng (dòng ccm đã markSent trước đó, không có TX chung để nối vào). Idempotent theo `ccm:<messageId>`
 * (UNIQUE item_key+source_key) — gọi lại không trừ hai lần. Không ném lỗi ra ngoài: tin đã đi, ví lệch chỉ ghi log.
 *
 * @param {{ billingUserId: number|string, channel: 'telegram'|'whatsapp', messageId: number|string }} input
 */
export async function debitAdapterMessageIfNeeded({ billingUserId, channel, messageId }) {
  const itemKey = WALLET_ITEM_BY_QUOTA_CHANNEL[channel];
  if (!billingUserId || !messageId || !itemKey || (channel !== 'telegram' && channel !== 'whatsapp')) {
    return { debited: false, reason: 'missing_args' };
  }
  const { default: db } = await import('../../config/database.js');
  const { PLAN_MONTHLY_LIMIT_COLUMN } = await import('../../constants/sendQuotaChannels.js');
  const { getBillingCycle } = await import('../../utils/billingCycle.util.js');
  const { countChannelSentInCycle, _clearQuotaCache } = await import('../../utils/userSendLimit.util.js');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const limitColumn = PLAN_MONTHLY_LIMIT_COLUMN[channel];
    const { rows: limitRows } = await client.query(
      `SELECT p.${limitColumn} AS plan_limit
       FROM users u
       JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
       WHERE u.id = $1
       LIMIT 1`,
      [billingUserId]
    );
    const rawLimit = limitRows[0]?.plan_limit;
    const planLimit = rawLimit == null || rawLimit === '' ? null : Number.parseInt(rawLimit, 10);
    const cycle = await getBillingCycle(billingUserId, {}, client);
    _clearQuotaCache();
    const usageCountAfterSend = (cycle?.hasPlan && cycle.cycleStart && cycle.cycleEnd)
      ? await countChannelSentInCycle(billingUserId, channel, cycle.cycleStart, cycle.cycleEnd, client, { cache: false })
      : 0;
    const result = await maybeDebitWalletForSend(client, {
      billingUserId,
      itemKey,
      sourceKey: `ccm:${messageId}`,
      planLimit: Number.isFinite(planLimit) ? planLimit : null,
      usageCountAfterSend,
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    console.warn(`[TopupWallet] debitAdapterMessageIfNeeded ${channel}#${messageId} lỗi:`, error?.message);
    return { debited: false, reason: 'error' };
  } finally {
    client.release();
  }
}

/**
 * Debit wallet for a direct / custom / test email send in legacy / mode-off paths.
 * Must run in the same transaction that inserts or settles email_messages.
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   billingUserId: number|string,
 *   emailMessageId: number|string,
 *   totalRecipients?: number,
 *   isPreview?: boolean,
 * }} input
 */
export async function debitDirectEmailIfNeeded(client, {
  billingUserId,
  emailMessageId,
  totalRecipients = 1,
  isPreview = false,
}) {
  if (!billingUserId || !emailMessageId) return { debited: false, reason: 'missing_args' };

  const { rows: limitRows } = await client.query(
    `SELECT p.monthly_email_limit
     FROM users u
     JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1
     LIMIT 1`,
    [billingUserId]
  );
  const rawLimit = limitRows[0]?.monthly_email_limit;
  const planLimit = rawLimit == null || rawLimit === ''
    ? null
    : Number.parseInt(rawLimit, 10);

  const { getBillingCycle } = await import('../../utils/billingCycle.util.js');
  const { countEmailSentThisMonth } = await import('../../utils/userSendLimit.util.js');
  const cycle = await getBillingCycle(billingUserId, {}, client);
  const usageCountAfterSend = (cycle?.hasPlan && cycle.cycleStart && cycle.cycleEnd)
    ? await countEmailSentThisMonth(
        billingUserId,
        cycle.cycleStart,
        cycle.cycleEnd,
        client
      )
    : 0;

  return maybeDebitWalletForSend(client, {
    billingUserId,
    itemKey: 'emails',
    sourceKey: isPreview ? `email_preview:${emailMessageId}` : `email_message:${emailMessageId}`,
    planLimit: Number.isFinite(planLimit) ? planLimit : null,
    usageCountAfterSend,
    qty: totalRecipients,
  });
}
