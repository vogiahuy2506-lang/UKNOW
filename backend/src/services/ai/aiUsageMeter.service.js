import usageTrackingService from '../payment/usageTracking.service.js';
import {
  countGeminiTokens,
  generateGeminiContent,
} from '../../utils/geminiClient.util.js';
import { resolveAllowedModel } from './aiModelPolicy.service.js';
import { normalizeModelId } from '../../utils/aiModelTier.util.js';

export const AI_TOKEN_RESOURCE = 'ai_token';

const DEFAULT_MIN_OUTPUT_TOKENS = 256;
const MIN_OUTPUT_TOKENS = Number.parseInt(process.env.AI_MIN_OUTPUT_TOKENS || '', 10) || DEFAULT_MIN_OUTPUT_TOKENS;
const HARD_CAP = Number.parseInt(process.env.AI_MAX_TOKENS_PER_REQUEST || '', 10) || 0;

class AiUsageMeterService {
  async _resolveModel(userId, model) {
    if (!userId) {
      return normalizeModelId(model) || normalizeModelId(process.env.GEMINI_MODEL) || 'gemini-2.0-flash';
    }
    return resolveAllowedModel(userId, model);
  }

  async reserve(userId, {
    contents,
    systemInstruction = null,
    model = null,
    requestedMaxOutputTokens = 2048,
  } = {}) {
    const resolvedModel = await this._resolveModel(userId, model);
    const requested = Number.parseInt(requestedMaxOutputTokens, 10);
    let maxOutputTokens = Number.isFinite(requested) && requested > 0 ? requested : 2048;
    if (HARD_CAP > 0) {
      maxOutputTokens = Math.min(maxOutputTokens, HARD_CAP);
    }

    if (!userId) {
      return { maxOutputTokens, inputTokens: 0, remaining: null, limit: null, used: 0, model: resolvedModel };
    }

    const currentUsage = await usageTrackingService.getResourceUsage(userId, AI_TOKEN_RESOURCE);
    const limit = Number(currentUsage.limit) || 0;
    if (limit <= 0) {
      return { maxOutputTokens, inputTokens: 0, remaining: null, limit, used: currentUsage.used, model: resolvedModel };
    }

    const used = Number(currentUsage.used) || 0;
    const remaining = Math.max(0, limit - used);
    if (remaining <= 0) {
      throw this._exhausted(currentUsage);
    }

    let inputTokens = await countGeminiTokens({ model: resolvedModel, contents, systemInstruction });
    if (inputTokens === null || inputTokens === undefined) {
      inputTokens = this._estimateLocalTokens(contents, systemInstruction);
    }

    if (inputTokens >= remaining) {
      throw this._exhausted(currentUsage);
    }

    const allowedOutput = remaining - inputTokens;
    if (allowedOutput < MIN_OUTPUT_TOKENS) {
      throw this._exhausted(currentUsage);
    }

    return {
      maxOutputTokens: Math.min(maxOutputTokens, allowedOutput),
      inputTokens,
      remaining,
      limit,
      used,
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
    const contents = [{ role: 'user', parts }];
    const reserved = await this.reserve(userId, {
      contents,
      systemInstruction,
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
    return error?.code === 'RESOURCE_LIMIT_EXCEEDED' && error?.resource === AI_TOKEN_RESOURCE;
  }

  _exhausted(usage = {}) {
    const error = new Error('Đã hết token AI trong gói dịch vụ kỳ này');
    error.status = 403;
    error.code = 'RESOURCE_LIMIT_EXCEEDED';
    error.resource = AI_TOKEN_RESOURCE;
    error.used = usage.used;
    error.limit = usage.limit;
    error.upgradeRequired = true;
    return error;
  }

  _estimateLocalTokens(contents, systemInstruction) {
    const serialized = JSON.stringify({ contents, systemInstruction });
    return Math.ceil(String(serialized || '').length / 3);
  }
}

export default new AiUsageMeterService();
