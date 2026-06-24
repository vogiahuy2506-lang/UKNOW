import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import {
  AI_MODEL_TIERS,
  DEFAULT_AI_MODEL,
  clampModelToMax,
  listModelsUpToTier,
  normalizeModelId,
} from '../../utils/aiModelTier.util.js';

const ENV_DEFAULT_MODEL = normalizeModelId(process.env.GEMINI_MODEL) || DEFAULT_AI_MODEL;

/**
 * @param {number|string|null|undefined} userId
 * @returns {Promise<{ role: string|null, planMaxModel: string|null }>}
 */
async function getUserPlanModelRow(userId) {
  if (!userId) {
    return { role: null, planMaxModel: null };
  }
  const { rows } = await db.query(
    `SELECT u.role, p.ai_model
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  return {
    role: row?.role ?? null,
    planMaxModel: row?.ai_model ? normalizeModelId(row.ai_model) : null,
  };
}

/**
 * Model cao nhất user được phép (theo gói). Admin bypass → tier cao nhất.
 *
 * @param {number|string|null|undefined} userId
 * @returns {Promise<string>}
 */
export async function getUserMaxAllowedModel(userId) {
  const { role, planMaxModel } = await getUserPlanModelRow(userId);
  if (isAdminRole(role)) {
    return AI_MODEL_TIERS[AI_MODEL_TIERS.length - 1];
  }
  return planMaxModel || ENV_DEFAULT_MODEL;
}

/**
 * Clamp model theo gói — không throw, hạ êm nếu vượt tier.
 *
 * @param {number|string|null|undefined} userId
 * @param {string|null|undefined} requestedModel
 * @returns {Promise<string>}
 */
export async function resolveAllowedModel(userId, requestedModel = null) {
  const maxModel = await getUserMaxAllowedModel(userId);
  return clampModelToMax(requestedModel || maxModel, maxModel);
}

/**
 * @param {number|string|null|undefined} userId
 * @returns {Promise<{ maxModel: string, models: string[] }>}
 */
export async function getAllowedModelsForUser(userId) {
  const maxModel = await getUserMaxAllowedModel(userId);
  return {
    maxModel,
    models: listModelsUpToTier(maxModel),
  };
}
