/**
 * Wallet debit helpers for consumable top-ups (emails / zalo_messages / ai_credits).
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

export const WALLET_ITEM_BY_CHANNEL = Object.freeze({
  email: 'emails',
  zalo: 'zalo_messages',
});

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
  const usageCountAfterSend = await countZaloSentThisMonth(
    billingUserId,
    cycle?.hasPlan ? cycle.cycleStart : null,
    cycle?.hasPlan ? cycle.cycleEnd : null,
    client
  );

  return maybeDebitWalletForSend(client, {
    billingUserId,
    itemKey: 'zalo_messages',
    sourceKey: `zpm:${messageId}`,
    planLimit: Number.isFinite(planLimit) ? planLimit : null,
    usageCountAfterSend,
  });
}
