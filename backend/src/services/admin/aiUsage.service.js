import aiUsageRepository from '../../repositories/admin/aiUsage.repository.js';

const DEFAULT_PRICING = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  _default: { input: 0.30, output: 2.50 },
};

const TOKEN_SQL = {
  prompt: "CASE WHEN COALESCE(metadata->>'promptTokens', '') ~ '^[0-9]+$' THEN (metadata->>'promptTokens')::bigint ELSE 0 END",
  output: "CASE WHEN COALESCE(metadata->>'outputTokens', '') ~ '^[0-9]+$' THEN (metadata->>'outputTokens')::bigint ELSE 0 END",
  model: "COALESCE(NULLIF(metadata->>'model', ''), '_unknown')",
  feature: "COALESCE(NULLIF(metadata->>'feature', ''), '_unknown')",
};

const UL_TOKEN_SQL = {
  prompt: "CASE WHEN COALESCE(ul.metadata->>'promptTokens', '') ~ '^[0-9]+$' THEN (ul.metadata->>'promptTokens')::bigint ELSE 0 END",
  output: "CASE WHEN COALESCE(ul.metadata->>'outputTokens', '') ~ '^[0-9]+$' THEN (ul.metadata->>'outputTokens')::bigint ELSE 0 END",
  model: "COALESCE(NULLIF(ul.metadata->>'model', ''), '_unknown')",
};

const clampWindowDays = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.min(parsed, 90);
};

const toNumber = (value) => Number(value || 0);
const toNullableNumber = (value) => (value === null || value === undefined ? null : Number(value));
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;

const parsePricing = () => {
  const raw = String(process.env.AI_PRICING_JSON || '').trim();
  if (!raw) return DEFAULT_PRICING;
  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PRICING,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      _default: parsed?._default || DEFAULT_PRICING._default,
    };
  } catch (error) {
    console.warn(`[AdminAiUsage] Invalid AI_PRICING_JSON, using defaults: ${error?.message || error}`);
    return DEFAULT_PRICING;
  }
};

const pricingForModel = (pricing, model) => pricing[model] || pricing._default || DEFAULT_PRICING._default;

const estimateCost = (pricing, { model, promptTokens = 0, outputTokens = 0 }) => {
  const price = pricingForModel(pricing, model);
  return ((toNumber(promptTokens) / 1000000) * toNumber(price.input))
    + ((toNumber(outputTokens) / 1000000) * toNumber(price.output));
};

const aggregateRows = (rows, keyFn, seedFn, pricing) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, seedFn(row));
    const item = map.get(key);
    const promptTokens = toNumber(row.prompt_tokens);
    const outputTokens = toNumber(row.output_tokens);
    const totalTokens = toNumber(row.total_tokens);
    item.promptTokens += promptTokens;
    item.outputTokens += outputTokens;
    item.totalTokens += totalTokens;
    item.estimatedCostUsd += estimateCost(pricing, {
      model: row.model,
      promptTokens,
      outputTokens,
    });
    if (row.user_count !== undefined) item.userCount = Math.max(item.userCount || 0, toNumber(row.user_count));
  });
  return Array.from(map.values()).map((item) => ({
    ...item,
    estimatedCostUsd: roundMoney(item.estimatedCostUsd),
  }));
};

const buildTimeline = (rows, windowDays, pricing) => {
  const byDay = new Map();
  rows.forEach((row) => {
    const bucket = row.bucket instanceof Date ? row.bucket.toISOString().slice(0, 10) : String(row.bucket || '').slice(0, 10);
    if (!bucket) return;
    const item = byDay.get(bucket) || { bucket, promptTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
    const promptTokens = toNumber(row.prompt_tokens);
    const outputTokens = toNumber(row.output_tokens);
    item.promptTokens += promptTokens;
    item.outputTokens += outputTokens;
    item.totalTokens += toNumber(row.total_tokens);
    item.estimatedCostUsd += estimateCost(pricing, { model: row.model, promptTokens, outputTokens });
    byDay.set(bucket, item);
  });

  const result = [];
  const today = new Date();
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    const bucket = day.toISOString().slice(0, 10);
    const item = byDay.get(bucket) || { bucket, promptTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
    result.push({ ...item, estimatedCostUsd: roundMoney(item.estimatedCostUsd) });
  }
  return result;
};

export async function getAiUsageOverview({ windowDays: rawWindowDays } = {}) {
  const windowDays = clampWindowDays(rawWindowDays);
  const params = [windowDays];
  const pricing = parsePricing();

  const [
    summaryRows,
    planRows,
    featureRows,
    modelRows,
    topUserRows,
    p90Rows,
    timelineRows,
  ] = await Promise.all([
    aiUsageRepository.safeQuery(
      `SELECT
         COUNT(*)::int AS log_count,
         COUNT(DISTINCT id_user)::int AS user_count,
         COALESCE(SUM(delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      params,
      [{ log_count: 0, user_count: 0, total_tokens: 0, prompt_tokens: 0, output_tokens: 0 }]
    ),
    aiUsageRepository.safeQuery(
      `SELECT
         p.id AS plan_id,
         COALESCE(p.code, 'unknown') AS plan_code,
         COALESCE(p.name, p.code, 'Unknown plan') AS plan_name,
         p.ai_tokens_per_period,
         ${UL_TOKEN_SQL.model} AS model,
         COUNT(DISTINCT ul.id_user)::int AS user_count,
         COALESCE(SUM(ul.delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs ul
       LEFT JOIN users u ON u.id = ul.id_user
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ul.resource_type = 'ai_token'
         AND ul.created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY p.id, p.code, p.name, p.ai_tokens_per_period, model`,
      params
    ),
    aiUsageRepository.safeQuery(
      `SELECT
         ${TOKEN_SQL.feature} AS feature,
         ${TOKEN_SQL.model} AS model,
         COUNT(DISTINCT id_user)::int AS user_count,
         COALESCE(SUM(delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY feature, model`,
      params
    ),
    aiUsageRepository.safeQuery(
      `SELECT
         ${TOKEN_SQL.model} AS model,
         COUNT(DISTINCT id_user)::int AS user_count,
         COALESCE(SUM(delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY model`,
      params
    ),
    aiUsageRepository.safeQuery(
      `SELECT
         ul.id_user,
         COALESCE(u.email, u.username, CONCAT('User #', ul.id_user::text)) AS email,
         COALESCE(p.code, 'unknown') AS plan_code,
         COALESCE(p.name, p.code, 'Unknown plan') AS plan_name,
         ${UL_TOKEN_SQL.model} AS model,
         COALESCE(SUM(ul.delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs ul
       LEFT JOIN users u ON u.id = ul.id_user
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ul.resource_type = 'ai_token'
         AND ul.created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY ul.id_user, u.email, u.username, p.code, p.name, model`,
      params
    ),
    aiUsageRepository.safeQuery(
      `WITH per_user AS (
         SELECT
           p.id AS plan_id,
           COALESCE(p.code, 'unknown') AS plan_code,
           COALESCE(p.name, p.code, 'Unknown plan') AS plan_name,
           p.ai_tokens_per_period,
           ul.id_user,
           COALESCE(SUM(ul.delta), 0)::bigint AS total_tokens
         FROM usage_logs ul
         LEFT JOIN users u ON u.id = ul.id_user
         LEFT JOIN plans p ON p.id = u.active_plan_id
         WHERE ul.resource_type = 'ai_token'
           AND ul.created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY p.id, p.code, p.name, p.ai_tokens_per_period, ul.id_user
       )
       SELECT
         plan_id,
         plan_code,
         plan_name,
         ai_tokens_per_period,
         COUNT(*)::int AS user_count,
         (percentile_cont(0.9) WITHIN GROUP (ORDER BY total_tokens))::bigint AS p90_user_tokens
       FROM per_user
       GROUP BY plan_id, plan_code, plan_name, ai_tokens_per_period`,
      params
    ),
    aiUsageRepository.safeQuery(
      `SELECT
         date_trunc('day', created_at)::date AS bucket,
         ${TOKEN_SQL.model} AS model,
         COALESCE(SUM(delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY bucket, model
       ORDER BY bucket`,
      params
    ),
  ]);

  const byModel = aggregateRows(
    modelRows,
    (row) => row.model || '_unknown',
    (row) => ({ model: row.model || '_unknown', promptTokens: 0, outputTokens: 0, totalTokens: 0, userCount: 0, estimatedCostUsd: 0 }),
    pricing
  ).sort((a, b) => b.totalTokens - a.totalTokens);

  const p90ByPlan = new Map(p90Rows.map((row) => [String(row.plan_id || row.plan_code || 'unknown'), {
    p90UserTokens: toNumber(row.p90_user_tokens),
    p90UserCount: toNumber(row.user_count),
  }]));

  const byPlan = aggregateRows(
    planRows,
    (row) => String(row.plan_id || row.plan_code || 'unknown'),
    (row) => ({
      planId: row.plan_id || null,
      planCode: row.plan_code || 'unknown',
      planName: row.plan_name || row.plan_code || 'Unknown plan',
      aiTokensPerPeriod: toNullableNumber(row.ai_tokens_per_period),
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      userCount: 0,
      estimatedCostUsd: 0,
    }),
    pricing
  ).map((item) => {
    const p90 = p90ByPlan.get(String(item.planId || item.planCode || 'unknown')) || {};
    const quota = item.aiTokensPerPeriod;
    const p90UserTokens = p90.p90UserTokens || 0;
    return {
      ...item,
      p90UserTokens,
      quotaUsagePctAtP90: quota > 0 ? Math.round((p90UserTokens / quota) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.totalTokens - a.totalTokens);

  const byFeature = aggregateRows(
    featureRows,
    (row) => row.feature || '_unknown',
    (row) => ({ feature: row.feature || '_unknown', promptTokens: 0, outputTokens: 0, totalTokens: 0, userCount: 0, estimatedCostUsd: 0 }),
    pricing
  ).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  const topUsers = aggregateRows(
    topUserRows,
    (row) => String(row.id_user),
    (row) => ({
      userId: toNumber(row.id_user),
      email: row.email || `User #${row.id_user}`,
      planCode: row.plan_code || 'unknown',
      planName: row.plan_name || row.plan_code || 'Unknown plan',
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    }),
    pricing
  ).sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 20);

  const summaryRow = summaryRows[0] || {};
  const summary = {
    totalTokens: toNumber(summaryRow.total_tokens),
    promptTokens: toNumber(summaryRow.prompt_tokens),
    outputTokens: toNumber(summaryRow.output_tokens),
    userCount: toNumber(summaryRow.user_count),
    logCount: toNumber(summaryRow.log_count),
    estimatedCostUsd: roundMoney(byModel.reduce((sum, item) => sum + item.estimatedCostUsd, 0)),
  };

  return {
    windowDays,
    pricing,
    pricingNote: 'Estimated Gemini text-token cost only. Prices can change; embeddings and countTokens requests are not included.',
    summary,
    byPlan,
    byFeature,
    byModel,
    topUsers,
    timeline: buildTimeline(timelineRows, windowDays, pricing),
  };
}
