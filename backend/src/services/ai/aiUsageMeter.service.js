import usageTrackingService from '../payment/usageTracking.service.js';
import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';
import { normalizeModelId } from '../../utils/aiModelTier.util.js';

export const AI_TOKEN_RESOURCE = 'ai_token';

const HARD_CAP = Number.parseInt(process.env.AI_MAX_TOKENS_PER_REQUEST || '', 10) || 0;

class AiUsageMeterService {
  async _resolveModel(userId, model) {
    if (!userId) {
      return normalizeModelId(model) || normalizeModelId(process.env.GEMINI_MODEL) || 'gemini-2.5-flash';
    }
    return resolveAllowedModel(userId, model);
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

  async record(userId, usage, metadata = {}) {
    if (!userId) return;
    const totalTokens = Number(usage?.totalTokens) || 0;
    if (totalTokens <= 0) return;

    const usageMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      promptTokens: Number(usage?.promptTokens) || 0,
      outputTokens: Number(usage?.outputTokens) || 0,
      totalTokens,
    };

    try {
      await usageTrackingService.trackUsage(userId, AI_TOKEN_RESOURCE, totalTokens, usageMetadata);
    } catch (error) {
      console.warn(`[aiUsageMeter] Failed to record token usage for user=${userId}: ${error?.message || 'Unknown error'}`);
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

    const result = await generateGeminiContent({
      parts,
      model: resolvedModel,
      systemInstruction,
      maxOutputTokens: reserved.maxOutputTokens,
      ...options,
    });
    await this.record(userId, result.usage, {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      feature,
      model: resolvedModel,
    });
    return result;
  }

  isLimitError(error) {
    return error?.code === 'RESOURCE_LIMIT_EXCEEDED'
      && (error?.resource === AI_TOKEN_RESOURCE || error?.resource === 'ai_credit');
  }
}

export default new AiUsageMeterService();
