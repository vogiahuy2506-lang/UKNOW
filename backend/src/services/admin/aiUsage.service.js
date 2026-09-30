import aiUsageRepository from '../../repositories/admin/aiUsage.repository.js';
import usageTrackingRepository from '../../repositories/payment/usageTracking.repository.js';
import { getBillingCycle } from '../../utils/billingCycle.util.js';
import {
  parsePricing,
  estimateCost,
  hasConfiguredPrice,
} from '../../utils/aiPricing.util.js';

const AI_CREDIT_RESOURCE = 'ai_credit';
// Khách có lượt AI trong kỳ hiện tại chắc chắn có ≥ 1 dòng trong 30 ngày qua (kỳ dài đúng 30 ngày); 31 = dư một ngày.
const CREDIT_CUSTOMER_LOOKBACK_DAYS = 31;
// Số khách tra kỳ + "đã dùng" song song: mỗi khách 2-3 truy vấn nhẹ, đủ nhanh mà không chiếm hết pool.
const CREDIT_LOOKUP_CONCURRENCY = 8;
// "Sắp chạm trần" = đã dùng từ 80% hạn mức của kỳ hiện tại trở lên.
const NEAR_LIMIT_PERCENT = 80;

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
const round1 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 10) / 10;

const planKey = (row) => String(row.plan_id || row.plan_code || 'unknown');

/** Ánh xạ mảng có giới hạn đồng thời (số worker cố định kéo việc từ cùng một con trỏ). */
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** percentile_cont của Postgres: nội suy tuyến tính giữa hai giá trị kề rank; đầu vào ĐÃ sắp tăng dần. */
function percentileCont(sortedAsc, fraction) {
  if (sortedAsc.length === 0) return 0;
  const rank = fraction * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedAsc[lower];
  return sortedAsc[lower] + (rank - lower) * (sortedAsc[upper] - sortedAsc[lower]);
}

/**
 * Thống kê lượt AI của MỘT gói từ "đã dùng trong kỳ hiện tại" của từng khách thuộc gói.
 * Mẫu = khách có đã dùng > 0 (đúng nghĩa "p90 trong số người đang dùng AI"); khách đã dùng 0 không kéo p90 xuống.
 *
 * @param {number[]} [usedByCustomer] đã dùng trong kỳ hiện tại của từng khách (mỗi phần tử một khách)
 * @param {number|null} quota `plans.ai_credits_per_period`; ≤ 0 hoặc null = không giới hạn
 */
export function summarizeCreditUsage(usedByCustomer = [], quota = null) {
  const used = usedByCustomer.filter((value) => value > 0).sort((a, b) => a - b);
  const limited = quota > 0;
  const p90UserCredits = round1(percentileCont(used, 0.9));
  return {
    creditUserCount: used.length,
    totalCredits: used.reduce((sum, value) => sum + value, 0),
    p90UserCredits,
    // used ≥ 80% quota, viết bằng phép nhân số nguyên để không dính sai số dấu phẩy động (80/100 đúng 80% vẫn tính).
    usersNearLimit: limited ? used.filter((value) => value * 100 >= quota * NEAR_LIMIT_PERCENT).length : 0,
    quotaUsagePctAtP90: limited ? Math.round((p90UserCredits / quota) * 1000) / 10 : null,
  };
}

/**
 * Lượt AI đã dùng theo GÓI, tính trong KỲ HIỆN TẠI của từng khách — CÙNG hàm cổng chặn dùng
 * (getBillingCycle + usageTrackingRepository.getUsageInRange, loại dòng bán Marketplace), không theo bộ lọc 7/30/90 ngày.
 * Bản cũ lấy tổng N ngày của cửa sổ rồi chia cho hạn mức MỘT kỳ 30 ngày nên cùng dữ liệu cho ba con số theo ba nút lọc.
 *
 * @returns {Promise<Map<string, { planId: number|null, planCode: string, planName: string,
 *   aiCreditsPerPeriod: number|null, usedByCustomer: number[] }>>}
 */
async function collectCreditUsageByPlan() {
  const customers = await aiUsageRepository.listCreditCustomers({ lookbackDays: CREDIT_CUSTOMER_LOOKBACK_DAYS });

  const usages = await mapWithConcurrency(customers, CREDIT_LOOKUP_CONCURRENCY, async (customer) => {
    const userId = Number(customer.user_id);
    // ownerContextId = chính khách: `id_user` của dòng credit LÀ tài khoản thanh toán. Không để getBillingCycle nhảy sang
    // chủ khác khi khách này tình cờ cũng là nhân viên nơi khác (và không có gói riêng nữa).
    const cycle = await getBillingCycle(userId, { ownerContextId: userId });
    if (!cycle?.hasPlan || !cycle.cycleStart) return null;
    const used = await usageTrackingRepository.getUsageInRange(
      userId,
      AI_CREDIT_RESOURCE,
      cycle.cycleStart,
      new Date()
    );
    return { customer, used: Number(used) || 0 };
  });

  const plans = new Map();
  usages.forEach((entry) => {
    if (!entry) return;
    const key = planKey(entry.customer);
    if (!plans.has(key)) {
      plans.set(key, {
        planId: entry.customer.plan_id || null,
        planCode: entry.customer.plan_code || 'unknown',
        planName: entry.customer.plan_name || entry.customer.plan_code || 'Unknown plan',
        aiCreditsPerPeriod: toNullableNumber(entry.customer.ai_credits_per_period),
        usedByCustomer: [],
      });
    }
    plans.get(key).usedByCustomer.push(entry.used);
  });
  return plans;
}

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
    creditPlans,
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
         p.ai_credits_per_period,
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
       GROUP BY p.id, p.code, p.name, p.ai_credits_per_period, model`,
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
    // Hạn mức chặn thật theo LƯỢT AI (credit), không phải token: 1 credit / lượt trả lời. Khối này KHÔNG theo cửa sổ
    // windowDays — là "đã dùng trong KỲ HIỆN TẠI của từng khách", cùng hàm với cổng chặn (xem collectCreditUsageByPlan).
    collectCreditUsageByPlan(),
  ]);

  const byModel = aggregateRows(
    modelRows,
    (row) => row.model || '_unknown',
    (row) => ({ model: row.model || '_unknown', promptTokens: 0, outputTokens: 0, totalTokens: 0, userCount: 0, estimatedCostUsd: 0 }),
    pricing
  )
    // priceConfigured=false → chi phí đang tính bằng giá _default (Flash), KHÔNG
    // phải giá thật của model này. Frontend đánh dấu để không ai tin nhầm con số.
    .map((item) => ({ ...item, priceConfigured: hasConfiguredPrice(pricing, item.model) }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const tokenPlans = aggregateRows(
    planRows,
    planKey,
    (row) => ({
      planId: row.plan_id || null,
      planCode: row.plan_code || 'unknown',
      planName: row.plan_name || row.plan_code || 'Unknown plan',
      aiCreditsPerPeriod: toNullableNumber(row.ai_credits_per_period),
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      userCount: 0,
      estimatedCostUsd: 0,
    }),
    pricing
  );
  const p90TokensByPlan = new Map(p90Rows.map((row) => [planKey(row), toNumber(row.p90_user_tokens)]));
  const planItems = new Map(tokenPlans.map((item) => [String(item.planId || item.planCode || 'unknown'), item]));
  // Gói chỉ có lượt AI (chưa có dòng token) vẫn phải hiện — nhưng chỉ khi có khách đã dùng > 0 trong kỳ hiện tại;
  // gói mà mọi khách đều đã dùng 0 trong kỳ này không thêm dòng trống.
  creditPlans.forEach((plan, key) => {
    if (planItems.has(key)) return;
    if (!plan.usedByCustomer.some((used) => used > 0)) return;
    planItems.set(key, {
      planId: plan.planId,
      planCode: plan.planCode,
      planName: plan.planName,
      aiCreditsPerPeriod: plan.aiCreditsPerPeriod,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      userCount: 0,
      estimatedCostUsd: 0,
    });
  });

  // Cột token/chi phí theo cửa sổ windowDays; cột lượt AI (creditUserCount, totalCredits, p90UserCredits,
  // usersNearLimit, quotaUsagePctAtP90) theo KỲ HIỆN TẠI của từng khách — hai mốc thời gian khác nhau có chủ ý.
  // `userCount` giữ nguyên nghĩa cũ (quần thể có dòng token); quần thể lượt AI là `creditUserCount`.
  const byPlan = Array.from(planItems.entries()).map(([key, item]) => ({
    ...item,
    p90UserTokens: p90TokensByPlan.get(key) || 0,
    ...summarizeCreditUsage(creditPlans.get(key)?.usedByCustomer, item.aiCreditsPerPeriod),
  })).sort((a, b) => b.totalTokens - a.totalTokens);

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
    pricingNote: 'Estimated Gemini text-token cost only. Prices can change; countTokens requests are not included. Embedding usage is included when callers pass userId.',
    summary,
    byPlan,
    byFeature,
    byModel,
    topUsers,
    timeline: buildTimeline(timelineRows, windowDays, pricing),
  };
}
