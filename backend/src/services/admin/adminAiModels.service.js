import {
  getCatalog,
  invalidateCatalogCache,
  setSystemModel,
  syncModelsFromGoogle,
  updateCatalogModel,
} from '../ai/aiModelCatalog.service.js';
import aiUsageRepository from '../../repositories/admin/aiUsage.repository.js';
import {
  parsePricing,
  hasConfiguredPrice,
  pricingForModel,
  costPerAnswerVnd,
  resolveAvgTokens,
  getUsdVndRate,
} from '../../utils/aiPricing.util.js';

function attachPricing(models, { avgPromptTokens, avgOutputTokens, usdVndRate, pricing }) {
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
          configured: false,
        },
      };
    }
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
        configured: true,
      },
    };
  });
}

export async function listModels() {
  const [models, usage] = await Promise.all([
    getCatalog({ enabledOnly: false }),
    aiUsageRepository.getAvgAiTokenUsage({ windowDays: 30 }),
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
