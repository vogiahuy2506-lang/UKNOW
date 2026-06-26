import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import {
  DEFAULT_AI_MODEL,
  clampToTiers,
  listUpToTier,
  normalizeModelId,
} from '../../utils/aiModelTier.util.js';
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

function modelRankMap(catalog = []) {
  return new Map(catalog.map((row) => [normalizeModelId(row.modelId), Number(row.tierRank) || 0]));
}

function pickEnabledAtOrBelow(planMaxModel, enabledCatalog = [], fullCatalog = []) {
  if (!enabledCatalog.length) return DEFAULT_AI_MODEL;
  const fullRank = modelRankMap(fullCatalog);
  const enabledByRank = [...enabledCatalog].sort((a, b) => (Number(a.tierRank) || 0) - (Number(b.tierRank) || 0));
  const requested = normalizeModelId(planMaxModel) || ENV_DEFAULT_MODEL;
  const planRank = fullRank.has(requested)
    ? fullRank.get(requested)
    : fullRank.get(ENV_DEFAULT_MODEL) ?? enabledByRank[enabledByRank.length - 1]?.tierRank ?? 0;
  const eligible = enabledByRank.filter((row) => (Number(row.tierRank) || 0) <= planRank);
  return (eligible[eligible.length - 1] || enabledByRank[0])?.modelId || DEFAULT_AI_MODEL;
}

function rowsUpToMax(maxModel, enabledCatalog = []) {
  const tiers = enabledCatalog.map((row) => row.modelId);
  const ids = new Set(listUpToTier(maxModel, tiers));
  return enabledCatalog.filter((row) => ids.has(row.modelId));
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
 * Clamp model theo gói — không throw, hạ êm nếu vượt tier.
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
      tier_rank: row.tierRank,
      tierRank: row.tierRank,
    })),
    modelIds,
    preferredModel: resolvedPreferred,
  };
}

export async function savePreferredModelForUser(userId, requestedModel) {
  const modelId = normalizeModelId(requestedModel);
  if (!modelId) {
    const err = new Error('Model AI không hợp lệ');
    err.status = 400;
    throw err;
  }

  const allowed = await getAllowedModelsForUser(userId);
  if (!allowed.modelIds.includes(modelId)) {
    const err = new Error('Model AI không nằm trong gói hiện tại hoặc đã bị tắt');
    err.status = 400;
    throw err;
  }

  const preferredModel = await updateUserPreferredModel(userId, modelId);
  return { ...allowed, preferredModel };
}
