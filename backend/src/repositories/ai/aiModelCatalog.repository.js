import db from '../../config/database.js';

const MODEL_COLS = `
  model_id AS "modelId",
  display_name AS "displayName",
  tier_rank AS "tierRank",
  is_enabled AS "isEnabled",
  supports_generate_content AS "supportsGenerateContent",
  source,
  last_seen_at AS "lastSeenAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

export async function listAiModels({ enabledOnly = false, generateContentOnly = false } = {}) {
  const where = [];
  if (enabledOnly) where.push('is_enabled = TRUE');
  if (generateContentOnly) where.push('supports_generate_content = TRUE');
  const { rows } = await db.query(
    `SELECT ${MODEL_COLS}
     FROM ai_models
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY tier_rank ASC, model_id ASC`
  );
  return rows;
}

export async function upsertGoogleModel({
  modelId,
  displayName,
  supportsGenerateContent = true,
  seenAt = new Date(),
}) {
  const { rows } = await db.query(
    `INSERT INTO ai_models
       (model_id, display_name, tier_rank, is_enabled, supports_generate_content, source, last_seen_at, created_at, updated_at)
     VALUES (
       $1,
       $2,
       COALESCE((SELECT MAX(tier_rank) + 10 FROM ai_models), 100),
       FALSE,
       $3,
       'google',
       $4,
       NOW(),
       NOW()
     )
     ON CONFLICT (model_id) DO UPDATE SET
       display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), ai_models.display_name),
       supports_generate_content = EXCLUDED.supports_generate_content,
       source = CASE WHEN ai_models.source = 'manual' THEN ai_models.source ELSE 'google' END,
       last_seen_at = EXCLUDED.last_seen_at,
       updated_at = NOW()
     RETURNING ${MODEL_COLS}`,
    [modelId, displayName || modelId, Boolean(supportsGenerateContent), seenAt]
  );
  return rows[0] || null;
}

export async function markGoogleModelsMissing({ seenModelIds = [], seenAt = new Date() } = {}) {
  const { rowCount } = await db.query(
    `UPDATE ai_models
     SET supports_generate_content = FALSE,
         updated_at = NOW()
     WHERE source = 'google'
       AND last_seen_at IS DISTINCT FROM $2
       AND NOT (model_id = ANY($1::text[]))`,
    [seenModelIds, seenAt]
  );
  return rowCount || 0;
}

export async function updateAiModel(modelId, patch = {}) {
  const allowed = {
    displayName: 'display_name',
    tierRank: 'tier_rank',
    isEnabled: 'is_enabled',
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (patch[key] !== undefined) {
      values.push(patch[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) {
    const { rows } = await db.query(`SELECT ${MODEL_COLS} FROM ai_models WHERE model_id = $1`, [modelId]);
    return rows[0] || null;
  }
  values.push(modelId);
  const { rows } = await db.query(
    `UPDATE ai_models
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE model_id = $${values.length}
     RETURNING ${MODEL_COLS}`,
    values
  );
  return rows[0] || null;
}

export async function getUserPreferredModel(userId) {
  const { rows } = await db.query(
    `SELECT preferred_ai_model AS "preferredModel"
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return rows[0]?.preferredModel || null;
}

export async function updateUserPreferredModel(userId, modelId) {
  const { rows } = await db.query(
    `UPDATE users
     SET preferred_ai_model = $2
     WHERE id = $1
     RETURNING preferred_ai_model AS "preferredModel"`,
    [userId, modelId]
  );
  return rows[0]?.preferredModel || null;
}
