import usageTrackingService from '../payment/usageTracking.service.js';
import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import * as policyService from './aiModelPolicy.service.js';
import { normalizeModelId } from '../../utils/aiModelTier.util.js';
import {
  recordAiCallEvent,
  AI_CALL_LAYER,
  AI_CALL_OUTCOME,
  USAGE_WRITE_FAILED_CODE,
} from './aiCallEvents.service.js';

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
   * Model dự phòng do super admin chọn (hoặc null). KHÔNG BAO GIỜ ném lỗi: tra danh mục model là việc phụ,
   * hỏng (CSDL chập chờn) thì chỉ mất dự phòng chứ không được làm hỏng câu trả lời của khách.
   * Kiểm typeof vì nhiều unit test spec mock policyService mà không khai báo hàm getFallbackModel.
   * @returns {Promise<string|null>}
   */
  async resolveFallbackModel() {
    if (typeof policyService.getFallbackModel !== 'function') return null;
    try {
      return (await policyService.getFallbackModel()) || null;
    } catch (error) {
      console.warn(`[aiUsageMeter] không tra được model dự phòng, gọi không dự phòng: ${error?.message || error}`);
      return null;
    }
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
    // Token "suy nghĩ" của model = total − prompt − output (Google tính theo giá đầu ra, không nằm trong candidatesTokenCount;
    // estimateCost đã tính đúng qua total − prompt). Ghi riêng để phân tích chi phí không phải tự trừ ngược (D-OLD-C6). Tính ở ĐÂY
    // (cổng ghi duy nhất của `ai_token`) chứ không nhét vào `usage` của lõi: mọi nơi gọi đều hưởng, và đối tượng usage giữ nguyên
    // hình dạng. Chỉ ghi khi > 0 — model không suy nghĩ (thinkingBudget 0) thì metadata không có thêm trường nào; không bao giờ âm.
    const thinkingTokens = totalTokens - usageMetadata.promptTokens - usageMetadata.outputTokens;
    if (thinkingTokens > 0) usageMetadata.thinkingTokens = thinkingTokens;

    try {
      await usageTrackingService.trackUsage(ownerId, AI_TOKEN_RESOURCE, totalTokens, usageMetadata);
    } catch (error) {
      // console.error (không phải warn): ghi hụt = chi phí Google có mà sổ không có. Kèm feature/model để tìm ra đường gọi.
      console.error(
        `[aiUsageMeter] ghi usage thất bại feature=${baseMeta.feature ?? 'null'} model=${baseMeta.model ?? 'null'} `
        + `user=${ownerId ?? 'null'} tokens=${totalTokens}: ${error?.message || 'Unknown error'}`
      );
      // Thành SỔ BỀN (D-OLD-C4 / D-22): trước đây ghi hụt chỉ ở docker log (mất mỗi lần deploy) nên không ai đếm được "bao nhiêu lượt Google đã tính
      // tiền mà sổ token không có" — cảnh báo `ai_usage_write_failed` đọc đúng mã này. Không `await` và không bao giờ ném (recordAiCallEvent tự nuốt).
      // Chỉ số đếm + mã, KHÔNG câu lỗi của CSDL (có thể mang tên bảng/giá trị).
      try {
        void recordAiCallEvent({
          layer: AI_CALL_LAYER.APP,
          feature: baseMeta.feature,
          model: baseMeta.model,
          outcome: AI_CALL_OUTCOME.ERROR,
          errorCode: USAGE_WRITE_FAILED_CODE,
          ownerUserId: ownerId,
          actorUserId,
          meta: { totalTokens, pgCode: error?.code },
        });
      } catch {
        // `record` không bao giờ ném lỗi — kể cả khi chính sổ bền hỏng.
      }
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
    const fallbackModel = await this.resolveFallbackModel();

    const result = await generateGeminiContent({
      parts,
      model: resolvedModel,
      fallbackModel,
      systemInstruction,
      maxOutputTokens: reserved.maxOutputTokens,
      // Chỉ để GHI SỔ BỀN `ai_call_events` (PR-10): tên tính năng + chủ/người thao tác của lượt gọi.
      feature: feature ?? undefined,
      ownerUserId: userId ?? null,
      actorUserId: metadata?.actorUserId ?? null,
      ...options,
    });
    await this.record(userId, result.usage, {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      feature,
      model: result.modelUsed || resolvedModel,
      // Chỉ ghi khi dự phòng THẬT đã trả lời (model ghi ở trên là model dự phòng): lọc được "bao nhiêu lượt phải nhờ dự phòng".
      ...(result.fallbackUsed ? { fallbackUsed: true } : {}),
    });
    return result;
  }

  isLimitError(error) {
    return error?.code === 'RESOURCE_LIMIT_EXCEEDED'
      && (error?.resource === AI_TOKEN_RESOURCE || error?.resource === 'ai_credit');
  }
}

export default new AiUsageMeterService();
