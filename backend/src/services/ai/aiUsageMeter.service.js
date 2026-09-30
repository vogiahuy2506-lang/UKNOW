import usageTrackingService from '../payment/usageTracking.service.js';
import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import * as policyService from './aiModelPolicy.service.js';
import { normalizeModelId } from '../../utils/aiModelTier.util.js';

export const AI_TOKEN_RESOURCE = 'ai_token';

const HARD_CAP = Number.parseInt(process.env.AI_MAX_TOKENS_PER_REQUEST || '', 10) || 0;

class AiUsageMeterService {
  async _resolveModel(userId, model) {
    if (!userId) {
      return normalizeModelId(model) || normalizeModelId(process.env.GEMINI_MODEL) || 'gemini-2.5-flash';
    }
    return policyService.resolveAllowedModel(userId, model);
  }

  /**
   * Resolve model + output cap. Token quota gate removed — credit meter gates user actions.
   */
  async reserve(userId, {
    model = null,
    requestedMaxOutputTokens = 2048,
  } = {}) {
    const resolvedModel = await this._resolveModel(userId, model);
    const requested = Number.parseInt(requestedMaxOutputTokens, 10);
    let maxOutputTokens = Number.isFinite(requested) && requested > 0 ? requested : 2048;
    if (HARD_CAP > 0) {
      maxOutputTokens = Math.min(maxOutputTokens, HARD_CAP);
    }

    return {
      maxOutputTokens,
      inputTokens: 0,
      remaining: null,
      limit: null,
      used: 0,
      model: resolvedModel,
    };
  }

  /**
   * Ghi token của MỘT lời gọi Gemini vào `usage_logs` (`resource_type = 'ai_token'`). Không bao giờ ném lỗi.
   *
   * `userId` rỗng = lời gọi KHÔNG CÓ CHỦ (khách vãng lai chat tư vấn trang chủ, trợ giúp cho khách chưa đăng nhập): vẫn ghi,
   * `id_user = NULL` (migration 273). Google tính tiền các lượt này nên bản cũ `return` sớm làm trang Chi phí AI thấp hơn
   * hoá đơn. Dòng NULL CÓ trong tổng chi phí nhưng không thuộc gói / khách nào (xem aiUsage.service.js).
   */
  async record(userId, usage, metadata = {}) {
    const ownerId = userId || null;
    const totalTokens = Number(usage?.totalTokens) || 0;
    if (totalTokens <= 0) return;

    const baseMeta = metadata && typeof metadata === 'object' ? metadata : {};
    const actorUserId = baseMeta.actorUserId ?? ownerId;
    const usageMetadata = {
      ...baseMeta,
      actorUserId,
      promptTokens: Number(usage?.promptTokens) || 0,
      outputTokens: Number(usage?.outputTokens) || 0,
      totalTokens,
    };

    try {
      await usageTrackingService.trackUsage(ownerId, AI_TOKEN_RESOURCE, totalTokens, usageMetadata);
    } catch (error) {
      // console.error (không phải warn): ghi hụt = chi phí Google có mà sổ không có. Kèm feature/model để tìm ra đường gọi.
      console.error(
        `[aiUsageMeter] ghi usage thất bại feature=${baseMeta.feature ?? 'null'} model=${baseMeta.model ?? 'null'} `
        + `user=${ownerId ?? 'null'} tokens=${totalTokens}: ${error?.message || 'Unknown error'}`
      );
    }
  }

  async generateWithBudget(userId, {
    parts,
    model = null,
    maxOutputTokens = 2048,
    systemInstruction = null,
    feature = null,
    metadata = {},
    ...options
  } = {}) {
    const reserved = await this.reserve(userId, {
      model,
      requestedMaxOutputTokens: maxOutputTokens,
    });
    const resolvedModel = reserved.model;
    // Kiểm tra typeof vì 15 unit test spec mock policyService mà không khai báo hàm getFallbackModel
    const fallbackModel = typeof policyService.getFallbackModel === 'function'
      ? await policyService.getFallbackModel()
      : null;

    const result = await generateGeminiContent({
      parts,
      model: resolvedModel,
      fallbackModel,
      systemInstruction,
      maxOutputTokens: reserved.maxOutputTokens,
      ...options,
    });
    await this.record(userId, result.usage, {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      feature,
      model: result.modelUsed || resolvedModel,
    });
    return result;
  }

  isLimitError(error) {
    return error?.code === 'RESOURCE_LIMIT_EXCEEDED'
      && (error?.resource === AI_TOKEN_RESOURCE || error?.resource === 'ai_credit');
  }
}

export default new AiUsageMeterService();
