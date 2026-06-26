import db from '../../config/database.js';
import usageTrackingService from '../payment/usageTracking.service.js';
import { getBillingCycle } from '../../utils/billingCycle.util.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import { getSubscriptionStatus } from '../../utils/subscriptionStatus.util.js';

export const AI_CREDIT_RESOURCE = 'ai_credit';

/** Message shown to end-customers when bot cannot reply (no billing jargon). */
export const VISITOR_CHAT_UNAVAILABLE_MESSAGE =
  'Xin lỗi, hiện chưa thể trả lời tin nhắn của bạn. Vui lòng để lại thông tin liên hệ, chúng tôi sẽ phản hồi sớm nhất.';

export const VISITOR_CHAT_ERROR_MESSAGE =
  'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.';

class AiCreditMeterService {
  /**
   * Resolve billing context once (admin/unlimited/expired/limit/used).
   *
   * @param {number|string|null|undefined} userId
   * @returns {Promise<{
   *   skip: boolean,
   *   billingUserId?: number|string,
   *   cycle?: object,
   *   limit?: number,
   *   used?: number,
   * }>}
   */
  async resolveCreditContext(userId) {
    if (!userId) return { skip: true };

    const role = await this._getUserRole(userId);
    if (isAdminRole(role)) return { skip: true };

    const subscription = await getSubscriptionStatus(userId);
    if (subscription.hasPlan && subscription.isExpired) {
      throw this._subscriptionExpired();
    }

    const cycle = await getBillingCycle(userId);
    const billingUserId = cycle.billingUserId || userId;
    const limits = await usageTrackingService.getUserPlanLimits(billingUserId);
    const limit = Number(limits?.ai_credits_per_period) || 0;
    if (limit <= 0) {
      return { skip: true, billingUserId, cycle, limit: 0, used: 0 };
    }

    const creditUsage = await usageTrackingService.getCreditUsageForCycle(billingUserId, cycle);
    const used = Number(creditUsage.used) || 0;
    return { skip: false, billingUserId, cycle, limit, used };
  }

  /**
   * Pre-flight check — does NOT charge. Call before running AI.
   */
  async assertAvailable(userId) {
    const ctx = await this.resolveCreditContext(userId);
    if (ctx.skip) return ctx;
    if (ctx.used >= ctx.limit) {
      throw this._exhausted({ used: ctx.used, limit: ctx.limit });
    }
    return ctx;
  }

  /**
   * Charge 1 credit after a successful AI action.
   *
   * @param {number|string|null|undefined} userId
   * @param {{ feature?: string, creditContext?: object }} [options]
   */
  async consume(userId, { feature, creditContext } = {}) {
    const ctx = creditContext || await this.resolveCreditContext(userId);
    if (ctx.skip) return;

    await usageTrackingService.trackUsage(ctx.billingUserId, AI_CREDIT_RESOURCE, 1, {
      feature: feature || null,
      periodStart: ctx.cycle?.cycleStart?.toISOString() || null,
      periodEnd: ctx.cycle?.cycleEnd?.toISOString() || null,
      actorUserId: userId,
    });
  }

  isLimitError(error) {
    return error?.code === 'RESOURCE_LIMIT_EXCEEDED'
      && (error?.resource === AI_CREDIT_RESOURCE || error?.resource === 'ai_token');
  }

  _exhausted({ used = 0, limit = 0 } = {}) {
    const error = new Error('Bạn đã dùng hết lượt AI trong kỳ — nâng cấp gói để tiếp tục');
    error.status = 403;
    error.code = 'RESOURCE_LIMIT_EXCEEDED';
    error.resource = AI_CREDIT_RESOURCE;
    error.used = used;
    error.limit = limit;
    error.upgradeRequired = true;
    return error;
  }

  _subscriptionExpired() {
    const error = new Error('Gói đã hết hạn — vui lòng gia hạn để dùng AI');
    error.status = 403;
    error.code = 'RESOURCE_LIMIT_EXCEEDED';
    error.resource = AI_CREDIT_RESOURCE;
    error.upgradeRequired = true;
    return error;
  }

  async _getUserRole(userId) {
    const { rows } = await db.query(`SELECT role FROM users WHERE id = $1 LIMIT 1`, [userId]);
    return rows[0]?.role ?? null;
  }
}

export default new AiCreditMeterService();
