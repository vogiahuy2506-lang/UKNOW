import {
  getCatalog,
  invalidateCatalogCache,
  setFallbackModel,
  setSystemModel,
  syncModelsFromGoogle,
  updateCatalogModel,
} from '../ai/aiModelCatalog.service.js';
import aiUsageRepository from '../../repositories/admin/aiUsage.repository.js';
import { getMeasuredCostByModel } from './aiUsage.service.js';
import {
  parsePricing,
  hasConfiguredPrice,
  pricingForModel,
  costPerAnswerVnd,
  resolveAvgTokens,
  getUsdVndRate,
} from '../../utils/aiPricing.util.js';

/**
 * `measured` = chi phí THỰC ĐO mỗi lượt gọi Gemini của model này trong 30 ngày qua (cùng nguồn với trang Chi phí AI;
 * gồm token suy nghĩ; không kể embedding) — null khi model chưa có lượt gọi nào. `costPerAnswerVnd` là số ƯỚC TÍNH theo
 * token trung bình, chỉ để so sánh model chưa dùng. Cả hai là chi phí mỗi LƯỢT GỌI Gemini, không phải mỗi lượt AI (credit):
 * một credit có thể gọi nhiều lần (audit_ai.md C-16).
 */
function attachPricing(models, {
  avgPromptTokens, avgOutputTokens, usdVndRate, pricing, measuredByModel = {},
}) {
  return models.map((model) => {
    const modelId = model.modelId || model.model_id;
    const configured = hasConfiguredPrice(pricing, modelId);
    if (!configured) {
      return {
        ...model,
        pricing: {
          inputUsdPerM: null,
          outputUsdPerM: null,
          costPerAnswerVnd: null,
          measured: null,
          configured: false,
        },
      };
    }
    const measured = measuredByModel[modelId];
    const price = pricingForModel(pricing, modelId);
    return {
      ...model,
      pricing: {
        inputUsdPerM: Number(price.input),
        outputUsdPerM: Number(price.output),
        costPerAnswerVnd: costPerAnswerVnd(pricing, modelId, {
          avgPromptTokens,
          avgOutputTokens,
          usdVndRate,
        }),
        measured: measured
          ? { calls: measured.calls, costPerCallVnd: measured.costPerCallVnd }
          : null,
        configured: true,
      },
    };
  });
}

export async function listModels() {
  const [models, usage, measured] = await Promise.all([
    getCatalog({ enabledOnly: false }),
    aiUsageRepository.getAvgAiTokenUsage({ windowDays: 30 }),
    getMeasuredCostByModel({ range: '30d' }),
  ]);

  const resolved = resolveAvgTokens(usage);
  const pricing = parsePricing();
  const usdVndRate = getUsdVndRate();

  return {
    models: attachPricing(models, {
      avgPromptTokens: resolved.avgPromptTokens,
      avgOutputTokens: resolved.avgOutputTokens,
      usdVndRate,
      pricing,
      measuredByModel: measured.byModel,
    }),
    avgPromptTokens: resolved.avgPromptTokens,
    avgOutputTokens: resolved.avgOutputTokens,
    basis: resolved.basis,
    usdVndRate,
  };
}

export async function updateModel(modelId, patch = {}) {
  return updateCatalogModel(modelId, {
    displayName: patch.displayName ?? patch.display_name,
    isEnabled: patch.isEnabled ?? patch.is_enabled,
  });
}

export async function syncModels() {
  const result = await syncModelsFromGoogle();
  invalidateCatalogCache();
  return result;
}

export async function chooseSystemModel(modelId) {
  return setSystemModel(modelId);
}

export async function chooseFallbackModel(modelId) {
  return setFallbackModel(modelId);
}
