import {
  getCatalog,
  invalidateCatalogCache,
  setSystemModel,
  syncModelsFromGoogle,
  updateCatalogModel,
} from '../ai/aiModelCatalog.service.js';

export async function listModels() {
  return getCatalog({ enabledOnly: false });
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
