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
}

export default new AiCreditMeterService();
