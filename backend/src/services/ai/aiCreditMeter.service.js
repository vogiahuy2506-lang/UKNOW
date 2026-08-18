import db from '../../config/database.js';
import usageTrackingService from '../payment/usageTracking.service.js';
import usageTrackingRepository from '../../repositories/payment/usageTracking.repository.js';
import { getBillingCycle } from '../../utils/billingCycle.util.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import { getSubscriptionStatus } from '../../utils/subscriptionStatus.util.js';
import {
  acquireWalletLock,
  getWalletBalance,
  insertTopupDebit,
} from '../../repositories/payment/topup.repository.js';

export const AI_CREDIT_RESOURCE = 'ai_credit';

/** Message shown to end-customers when bot cannot reply (no billing jargon). */
export const VISITOR_CHAT_UNAVAILABLE_MESSAGE =
  'Xin lỗi, hiện chưa thể trả lời tin nhắn của bạn. Vui lòng để lại thông tin liên hệ, chúng tôi sẽ phản hồi sớm nhất.';

export const VISITOR_CHAT_ERROR_MESSAGE =
  'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.';

async function acquireUsageTrackingLock(client, userId, resourceType) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
    [`usage:${userId}`, String(resourceType)]
  );
}

class AiCreditMeterService {
  /**
   * Resolve billing context once (admin/unlimited/expired/plan limit/used).
   * Top-up AI credits are a separate wallet — NOT added to plan ceiling.
   */
  async resolveCreditContext(userId, { ownerContextId, forceBillable = false } = {}) {
    if (!userId) return { skip: true };

    const role = await this._getUserRole(userId);
    if (isAdminRole(role) && !forceBillable) return { skip: true };

    const billingOptions = ownerContextId != null && ownerContextId !== ''
      ? { ownerContextId }
      : {};

    const subscription = await getSubscriptionStatus(userId, billingOptions);
    if (subscription.hasPlan && subscription.isExpired) {
      throw this._subscriptionExpired();
    }

    const cycle = await getBillingCycle(userId, billingOptions);
    const billingUserId = cycle.billingUserId || userId;
    const limits = await usageTrackingService.getUserPlanLimits(billingUserId);
    const baseLimit = Number(limits?.ai_credits_per_period) || 0;
    const creditUsage = await usageTrackingService.getCreditUsageForCycle(billingUserId, cycle);
    const used = Number(creditUsage.used) || 0;

    if (baseLimit <= 0) {
      if (forceBillable) {
        return {
          skip: false,
          billingUserId,
          cycle,
          limit: 0,
          used,
          billOnly: true,
        };
      }
      return { skip: true, billingUserId, cycle, limit: 0, used: 0 };
    }

    const wallet = await getWalletBalance(billingUserId, 'ai_credits');

    return {
      skip: false,
      billingUserId,
      cycle,
      limit: baseLimit,
      used,
      walletRemaining: wallet.remaining,
    };
  }

  /**
   * Pre-flight check — does NOT charge. Call before running AI.
   */
  async assertAvailable(userId, { ownerContextId, forceBillable = false } = {}) {
    const ctx = await this.resolveCreditContext(userId, { ownerContextId, forceBillable });
    if (ctx.skip) return ctx;
    if (ctx.billOnly) return ctx;
    if (ctx.used < ctx.limit) return ctx;
    if (Number(ctx.walletRemaining) > 0) return ctx;
    throw this._exhausted({ used: ctx.used, limit: ctx.limit });
  }

  /**
   * Charge 1 credit after a successful AI action — atomic lock + optional wallet debit.
   */
  async consume(userId, { feature, creditContext, forceBillable = false } = {}) {
    const ctx = creditContext || await this.resolveCreditContext(userId, { forceBillable });
    if (ctx.skip) return;

    const billingUserId = ctx.billingUserId || userId;
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await acquireUsageTrackingLock(client, billingUserId, AI_CREDIT_RESOURCE);

      const cycle = ctx.cycle || await getBillingCycle(billingUserId);
      const limits = await usageTrackingService.getUserPlanLimits(billingUserId, client);
      const baseLimit = Number(limits?.ai_credits_per_period) || 0;
      const usedBefore = cycle?.hasPlan && cycle.cycleStart
        ? Number(await usageTrackingRepository.getUsageInRange(
          billingUserId,
          AI_CREDIT_RESOURCE,
          cycle.cycleStart,
          new Date(),
          client
        )) || 0
        : 0;

      const usageRow = await usageTrackingRepository.trackUsage(
        billingUserId,
        AI_CREDIT_RESOURCE,
        1,
        {
          feature: feature || null,
          periodStart: cycle?.cycleStart?.toISOString() || null,
          periodEnd: cycle?.cycleEnd?.toISOString() || null,
          actorUserId: userId,
        },
        client
      );

      // Hết hạn mức gói → trừ ví (cho phép âm nhẹ nếu race in-flight)
      if (baseLimit > 0 && usedBefore >= baseLimit && usageRow?.id) {
        await acquireWalletLock(client, billingUserId, 'ai_credits');
        await insertTopupDebit({
          userId: billingUserId,
          itemKey: 'ai_credits',
          qty: 1,
          sourceKey: `ai_credit:${usageRow.id}`,
        }, client);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  isLimitError(error) {
    return error?.code === 'RESOURCE_LIMIT_EXCEEDED'
      && (error?.resource === AI_CREDIT_RESOURCE || error?.resource === 'ai_token');
  }

  _exhausted({ used = 0, limit = 0 } = {}) {
    const error = new Error('Bạn đã dùng hết lượt AI trong kỳ — nâng cấp gói để tiếp tục');
    error.status = 402; // Payment Required - hết credits
    error.code = 'RESOURCE_LIMIT_EXCEEDED';
    error.resource = AI_CREDIT_RESOURCE;
    error.used = used;
    error.limit = limit;
    error.upgradeRequired = true;
    return error;
  }

  _subscriptionExpired() {
    const error = new Error('Gói đã hết hạn. Vui lòng gia hạn để tiếp tục dùng AI.');
    error.status = 402;
    // Giữ RESOURCE_LIMIT_EXCEEDED + resource để chatRouter.isLimitError() bắt được
    // → visitor nhận câu lịch sự, không HTTP 500. Phân biệt hết-gói bằng subscriptionExpired.
    error.code = 'RESOURCE_LIMIT_EXCEEDED';
    error.resource = AI_CREDIT_RESOURCE;
    error.subscriptionExpired = true;
    error.upgradeRequired = true;
    return error;
  }

  async _getUserRole(userId) {
    // users.role là VARCHAR trên production/bootstrap — không có role_id / id_role.
    const { rows } = await db.query(
      `SELECT role FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return rows[0]?.role || null;
  }

  /**
   * Deduct multiple credits (for marketplace purchase).
   * Uses same logic as consume() but for arbitrary amount.
   *
   * @param {number} userId
   * @param {number} amount - Number of credits to deduct
   * @param {object} options
   * @param {string} [options.feature] - Feature name for audit trail
   * @param {object} [options.ctx] - Pre-resolved credit context
   * @param {object} [options.externalClient] - External DB client for transaction participation
   * @returns {Promise<{success: boolean, deducted: number, remaining: object}>}
   */
  async deductCredits(userId, amount, { feature, ctx: preCtx, externalClient } = {}) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const resolvedCtx = preCtx || await this.resolveCreditContext(userId, { forceBillable: true });
    if (resolvedCtx.skip) {
      return { success: true, deducted: amount, remaining: { plan: Infinity, wallet: 0 } };
    }

    const billingUserId = resolvedCtx.billingUserId || userId;
    const ownsClient = !externalClient;
    const client = externalClient || await db.getClient();

    try {
      if (ownsClient) await client.query('BEGIN');
      await acquireUsageTrackingLock(client, billingUserId, AI_CREDIT_RESOURCE);

      const cycle = resolvedCtx.cycle || await getBillingCycle(billingUserId);
      const limits = await usageTrackingService.getUserPlanLimits(billingUserId, client);
      const baseLimit = Number(limits?.ai_credits_per_period) || 0;

      // Calculate current usage within cycle
      let currentUsed = 0;
      if (resolvedCtx.hasPlan && cycle?.cycleStart) {
        currentUsed = Number(await usageTrackingRepository.getUsageInRange(
          billingUserId,
          AI_CREDIT_RESOURCE,
          cycle.cycleStart,
          new Date(),
          client
        )) || 0;
      }

      // Calculate what to deduct from plan vs wallet
      let remaining = amount;
      let planDeducted = 0;
      let walletDeducted = 0;
      const planAvailable = Math.max(0, baseLimit - currentUsed);

      // First deduct from plan allowance
      if (remaining > 0 && planAvailable > 0) {
        planDeducted = Math.min(remaining, planAvailable);
        remaining -= planDeducted;
      }

      // Then deduct from wallet if needed
      if (remaining > 0) {
        const wallet = await getWalletBalance(billingUserId, 'ai_credits');
        const walletAvailable = Number(wallet?.remaining || 0);
        walletDeducted = Math.min(remaining, walletAvailable);
        remaining -= walletDeducted;
      }

      // If still remaining, not enough credits
      if (remaining > 0) {
        const totalAvailable = planAvailable + Number(resolvedCtx.walletRemaining || 0);
        const error = new Error(
          `Không đủ credits. Bạn có ${totalAvailable} credits, cần ${amount} credits.`
        );
        error.status = 400;
        error.code = 'INSUFFICIENT_CREDITS';
        error.available = totalAvailable;
        error.required = amount;
        throw error;
      }

      // Track plan deduction if any
      if (planDeducted > 0) {
        await usageTrackingRepository.trackUsage(
          billingUserId,
          AI_CREDIT_RESOURCE,
          planDeducted,
          {
            feature: feature || 'marketplace_purchase',
            periodStart: cycle?.cycleStart?.toISOString() || null,
            periodEnd: cycle?.cycleEnd?.toISOString() || null,
            actorUserId: userId,
          },
          client
        );
      }

      // Deduct from wallet if any
      if (walletDeducted > 0) {
        await acquireWalletLock(client, billingUserId, 'ai_credits');
        await insertTopupDebit({
          userId: billingUserId,
          itemKey: 'ai_credits',
          qty: walletDeducted,
          sourceKey: `marketplace_purchase:${Date.now()}`,
        }, client);
      }

      if (ownsClient) await client.query('COMMIT');
      return {
        success: true,
        deducted: amount,
        breakdown: { planDeducted, walletDeducted },
        remaining: {
          plan: baseLimit - (currentUsed + planDeducted),
          wallet: Number(resolvedCtx.walletRemaining || 0) - walletDeducted,
        },
      };
    } catch (error) {
      if (ownsClient) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownsClient) client.release();
    }
  }
}

export default new AiCreditMeterService();
