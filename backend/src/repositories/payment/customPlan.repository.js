import db from '../../config/database.js';

const PRICING_COLS = `
  id,
  item_key AS "itemKey",
  plan_column AS "planColumn",
  unit_price AS "unitPrice",
  unit_size AS "unitSize",
  included_qty AS "includedQty",
  min_qty AS "minQty",
  max_qty AS "maxQty",
  step_qty AS "stepQty",
  is_active AS "isActive",
  sort_order AS "sortOrder",
  updated_at AS "updatedAt"
`;

/** Raw rows (snake_case) for the pricing util. */
export async function findAllPricingRows(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, item_key, plan_column, unit_price, unit_size, included_qty,
            min_qty, max_qty, step_qty, is_active, sort_order, updated_at
     FROM custom_plan_pricing
     ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

/** CamelCase rows for admin / public config APIs. */
export async function findAllPricingConfig(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ${PRICING_COLS} FROM custom_plan_pricing ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function findPricingRowByKey(itemKey, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ${PRICING_COLS} FROM custom_plan_pricing WHERE item_key = $1`,
    [itemKey]
  );
  return rows[0] || null;
}

export async function updatePricingRow(itemKey, patch, queryable = db) {
  const fields = [];
  const values = [];
  let i = 1;

  const map = {
    unitPrice: 'unit_price',
    unitSize: 'unit_size',
    includedQty: 'included_qty',
    minQty: 'min_qty',
    maxQty: 'max_qty',
    stepQty: 'step_qty',
    isActive: 'is_active',
    sortOrder: 'sort_order',
    planColumn: 'plan_column',
  };

  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(patch[key]);
    }
  }

  if (!fields.length) {
    const { rows } = await queryable.query(
      `SELECT ${PRICING_COLS} FROM custom_plan_pricing WHERE item_key = $1`,
      [itemKey]
    );
    return rows[0] || null;
  }

  fields.push('updated_at = NOW()');
  values.push(itemKey);

  const { rows } = await queryable.query(
    `UPDATE custom_plan_pricing
     SET ${fields.join(', ')}
     WHERE item_key = $${i}
     RETURNING ${PRICING_COLS}`,
    values
  );
  return rows[0] || null;
}

export async function findCustomPlanOwnedByUser(planId, userId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT * FROM plans
     WHERE id = $1 AND is_custom = TRUE AND custom_owner_user_id = $2`,
    [planId, userId]
  );
  return rows[0] || null;
}

export async function updateCustomPlanLimits(planId, {
  name, price, priceYearly, customConfig,
  monthlyEmailLimit, monthlyZaloLimit, aiCreditsPerPeriod,
  maxEmployees, maxLandingPages, maxCampaigns,
  maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
  maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
  maxChatbots, messagesPerPeriod = null, dailyEmailLimit = null, dailyZaloLimit = null,
  isFupEnabled = false, durationDays = 30, gracePeriodDays = 0,
}, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE plans SET
       name = COALESCE($2, name),
       price = $3,
       price_yearly = $4,
       custom_config = $5::jsonb,
       monthly_email_limit = $6,
       monthly_zalo_limit = $7,
       ai_credits_per_period = $8,
       max_employees = $9,
       max_landing_pages = $10,
       max_campaigns = $11,
       max_zalo_campaigns = $12,
       max_zalo_group_campaigns = $13,
       max_email_campaigns = $14,
       max_zalo_accounts = $15,
       max_email_accounts = $16,
       max_email_templates = $17,
       max_zalo_templates = $18,
       max_chatbots = $19,
       messages_per_period = $20,
       daily_email_limit = $21,
       daily_zalo_limit = $22,
       is_fup_enabled = $23,
       duration_days = $24,
       grace_period_days = $25,
       updated_at = NOW()
     WHERE id = $1 AND is_custom = TRUE
     RETURNING *`,
    [
      planId, name, price, priceYearly,
      JSON.stringify(customConfig || {}),
      monthlyEmailLimit ?? null, monthlyZaloLimit ?? null, aiCreditsPerPeriod ?? null,
      maxEmployees ?? 0, maxLandingPages ?? null, maxCampaigns ?? null,
      maxZaloCampaigns ?? null, maxZaloGroupCampaigns ?? null, maxEmailCampaigns ?? null,
      maxZaloAccounts ?? null, maxEmailAccounts ?? null,
      maxEmailTemplates ?? null, maxZaloTemplates ?? null,
      maxChatbots ?? null, messagesPerPeriod, dailyEmailLimit, dailyZaloLimit,
      Boolean(isFupEnabled), durationDays ?? 30, gracePeriodDays ?? 0,
    ]
  );
  return rows[0] || null;
}

/**
 * Delete orphan self-serve custom plans that never completed payment
 * and are older than the PayOS pending window.
 */
export async function deleteOrphanCustomPlans(olderThanMinutes = 15, queryable = db) {
  const minutes = Math.max(1, Number(olderThanMinutes) || 15);
  const { rows } = await queryable.query(
    `DELETE FROM plans p
     WHERE p.is_custom = TRUE
       AND p.custom_owner_user_id IS NOT NULL
       AND p.created_at < NOW() - ($1::text || ' minutes')::interval
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.plan_id = p.id AND o.status = 'success'
       )
       AND NOT EXISTS (
         SELECT 1 FROM users u WHERE u.active_plan_id = p.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.plan_id = p.id
           AND o.status = 'pending'
           AND o.created_at >= NOW() - ($1::text || ' minutes')::interval
       )
     RETURNING p.id, p.name, p.custom_owner_user_id`,
    [String(minutes)]
  );
  return rows;
}
