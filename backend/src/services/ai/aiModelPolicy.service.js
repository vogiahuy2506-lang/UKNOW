import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import {
  DEFAULT_AI_MODEL,
  clampToTiers,
  normalizeModelId,
} from '../../utils/aiModelTier.util.js';
import { capabilityScore } from '../../utils/aiModelMetadata.util.js';
import {
  getCatalog,
  getDefaultModel,
  getEnabledModelIds,
} from './aiModelCatalog.service.js';
import {
  updateUserPreferredModel,
} from '../../repositories/ai/aiModelCatalog.repository.js';

const ENV_DEFAULT_MODEL = normalizeModelId(process.env.GEMINI_MODEL) || DEFAULT_AI_MODEL;

/**
 * @param {number|string|null|undefined} userId
 * @returns {Promise<{ role: string|null, planMaxModel: string|null, preferredModel: string|null }>}
 */
async function getUserPlanModelRow(userId) {
  if (!userId) {
    return { role: null, planMaxModel: null, preferredModel: null };
  }
  const { rows } = await db.query(
    `SELECT u.role, u.preferred_ai_model, p.ai_model
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  return {
    role: row?.role ?? null,
    planMaxModel: row?.ai_model ? normalizeModelId(row.ai_model) : null,
    preferredModel: row?.preferred_ai_model ? normalizeModelId(row.preferred_ai_model) : null,
  };
}

function findCatalogRow(catalog = [], modelId) {
  const normalized = normalizeModelId(modelId);
  return catalog.find((row) => normalizeModelId(row.modelId) === normalized) || null;
}

function sortByCapability(rows = []) {
  return [...rows].sort((a, b) => {
    const diff = capabilityScore(a) - capabilityScore(b);
    if (diff !== 0) return diff;
    return String(a.modelId).localeCompare(String(b.modelId));
  });
}

function pickEnabledAtOrBelow(planMaxModel, enabledCatalog = [], fullCatalog = []) {
  if (!enabledCatalog.length) return DEFAULT_AI_MODEL;

  const sortedEnabled = sortByCapability(enabledCatalog);
  const planRow = findCatalogRow(fullCatalog, planMaxModel) || findCatalogRow(fullCatalog, ENV_DEFAULT_MODEL);
  const planLimit = capabilityScore(planRow);

  if (!planLimit) {
    return sortedEnabled[sortedEnabled.length - 1]?.modelId || DEFAULT_AI_MODEL;
  }

  const eligible = sortedEnabled.filter((row) => capabilityScore(row) <= planLimit);
  return (eligible[eligible.length - 1] || sortedEnabled[0])?.modelId || DEFAULT_AI_MODEL;
}

function rowsUpToMax(maxModel, enabledCatalog = []) {
  const sortedEnabled = sortByCapability(enabledCatalog);
  const maxRow = findCatalogRow(sortedEnabled, maxModel) || sortedEnabled[sortedEnabled.length - 1];
  const maxLimit = capabilityScore(maxRow);
  if (!maxLimit) return sortedEnabled;

  return sortedEnabled.filter((row) => capabilityScore(row) <= maxLimit);
}

/**
 * Model cao nhất user được phép (theo gói). Admin bypass → tier cao nhất.
 *
 * @param {number|string|null|undefined} userId
 * @returns {Promise<string>}
 */
export async function getUserMaxAllowedModel(userId) {
  const [{ role, planMaxModel }, enabledCatalog, fullCatalog] = await Promise.all([
    getUserPlanModelRow(userId),
    getCatalog({ enabledOnly: true }),
    getCatalog({ enabledOnly: false }),
  ]);
  if (isAdminRole(role)) {
    return enabledCatalog[enabledCatalog.length - 1]?.modelId || await getDefaultModel();
  }
  return pickEnabledAtOrBelow(planMaxModel, enabledCatalog, fullCatalog);
}

/**
 * Clamp model theo gói — không throw, hạ êm nếu vượt capability.
 *
 * @param {number|string|null|undefined} userId
 * @param {string|null|undefined} requestedModel
 * @returns {Promise<string>}
 */
export async function resolveAllowedModel(userId, requestedModel = null) {
  const [{ preferredModel }, maxModel, enabledModelIds, defaultModel] = await Promise.all([
    getUserPlanModelRow(userId),
    getUserMaxAllowedModel(userId),
    getEnabledModelIds(),
    getDefaultModel(),
  ]);
  const tiers = enabledModelIds.length ? enabledModelIds : [defaultModel || DEFAULT_AI_MODEL];
  const requested = normalizeModelId(requestedModel) || preferredModel || maxModel;
  return clampToTiers(requested, maxModel, tiers);
}

/**
 * @param {number|string|null|undefined} userId
 * @returns {Promise<{ maxModel: string, models: object[], modelIds: string[], preferredModel: string|null }>}
 */
export async function getAllowedModelsForUser(userId) {
  const [{ preferredModel }, maxModel, enabledCatalog] = await Promise.all([
    getUserPlanModelRow(userId),
    getUserMaxAllowedModel(userId),
    getCatalog({ enabledOnly: true }),
  ]);
  const allowedRows = rowsUpToMax(maxModel, enabledCatalog);
  const modelIds = allowedRows.map((row) => row.modelId);
  const resolvedPreferred = modelIds.includes(preferredModel) ? preferredModel : maxModel;
  return {
    maxModel,
    models: allowedRows.map((row) => ({
      model_id: row.modelId,
      modelId: row.modelId,
      display_name: row.displayName,
      displayName: row.displayName,
      input_token_limit: row.inputTokenLimit,
      inputTokenLimit: row.inputTokenLimit,
      output_token_limit: row.outputTokenLimit,
      outputTokenLimit: row.outputTokenLimit,
      description: row.description,
      thinking: row.thinking,
    })),
    modelIds,
    preferredModel: resolvedPreferred,
  };
}

export async function savePreferredModelForUser(userId, modelId) {
  const allowed = await getAllowedModelsForUser(userId);
  const normalized = normalizeModelId(modelId);
  if (!allowed.modelIds.includes(normalized)) {
    const err = new Error('Model AI không nằm trong gói của bạn');
    err.status = 403;
    throw err;
  }
  return updateUserPreferredModel(userId, normalized);
}
