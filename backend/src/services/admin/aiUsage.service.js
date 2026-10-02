import aiUsageRepository from '../../repositories/admin/aiUsage.repository.js';
import usageTrackingRepository from '../../repositories/payment/usageTracking.repository.js';
import { getBillingCycle } from '../../utils/billingCycle.util.js';
import {
  parsePricing,
  estimateCost,
  hasConfiguredPrice,
  getUsdVndRate,
} from '../../utils/aiPricing.util.js';
import {
  resolveAiFeatureGroup,
  groupCountsAsCall,
  groupCountsAsCustomerUse,
} from '../../constants/aiFeatureCatalog.js';

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
  kind: "COALESCE(NULLIF(metadata->>'kind', ''), '')",
};

const UL_TOKEN_SQL = {
  prompt: "CASE WHEN COALESCE(ul.metadata->>'promptTokens', '') ~ '^[0-9]+$' THEN (ul.metadata->>'promptTokens')::bigint ELSE 0 END",
  output: "CASE WHEN COALESCE(ul.metadata->>'outputTokens', '') ~ '^[0-9]+$' THEN (ul.metadata->>'outputTokens')::bigint ELSE 0 END",
  model: "COALESCE(NULLIF(ul.metadata->>'model', ''), '_unknown')",
};

// Bộ lọc thời gian: "Tháng này" | "30 ngày qua". Mốc tính TRONG SQL theo giờ Việt Nam (audit_ai.md C-20): bản cũ dựng
// khung ngày bằng `new Date()` (UTC) còn bucket ngày lại tính theo giờ VN nên từ 00:00 đến 07:00 giờ VN cột "hôm nay"
// biến mất và tổng biểu đồ ≠ tổng KPI. Không dùng múi giờ của phiên/Node — ghi rõ 'Asia/Ho_Chi_Minh' ở từng biểu thức.
const VN_TZ = 'Asia/Ho_Chi_Minh';

// Ngày (giờ VN, chuỗi YYYY-MM-DD) của dòng usage. Mọi truy vấn có TÍNH CHI PHÍ gom thêm theo ngày này để áp giá của đúng ngày
// (giá một model có thể đổi theo ngày — xem aiPricing.util.js, vd gemini-3.8-flash hết khuyến mãi 31/12/2026). Chọn gom theo
// ngày thay vì tách theo mốc đổi giá: một cách duy nhất cho mọi bảng giá (kể cả AI_PRICING_JSON tự đặt mốc), không cần dựng
// biểu thức mốc trong SQL; số dòng nhân tối đa 31 (khoảng lọc dài nhất là 30 ngày) trên bảng chỉ vài nghìn dòng / tháng.
const PRICE_DAY_SQL = `to_char(created_at AT TIME ZONE '${VN_TZ}', 'YYYY-MM-DD')`;
const UL_PRICE_DAY_SQL = `to_char(ul.created_at AT TIME ZONE '${VN_TZ}', 'YYYY-MM-DD')`;
export const USAGE_RANGES = Object.freeze({ MONTH: 'month', LAST_30_DAYS: '30d' });
export const USAGE_RANGE_START_SQL = Object.freeze({
  // 00:00 ngày 1 của tháng hiện tại (giờ VN)
  [USAGE_RANGES.MONTH]: `(date_trunc('month', NOW() AT TIME ZONE '${VN_TZ}') AT TIME ZONE '${VN_TZ}')`,
  // 00:00 của ngày cách hôm nay 29 ngày (giờ VN) → đủ 30 ngày lịch kể cả hôm nay, khớp 30 cột của biểu đồ
  [USAGE_RANGES.LAST_30_DAYS]: `((date_trunc('day', NOW() AT TIME ZONE '${VN_TZ}') - INTERVAL '29 days') AT TIME ZONE '${VN_TZ}')`,
});

/** Giá trị lạ/thiếu → "30 ngày qua". */
export const normalizeUsageRange = (value) => (
  String(value || '') === USAGE_RANGES.MONTH ? USAGE_RANGES.MONTH : USAGE_RANGES.LAST_30_DAYS
);

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
 *   aiCreditsPerPeriod: number|null, planPrice: number|null, usedByCustomer: number[] }>>}
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
        planPrice: toNullableNumber(entry.customer.plan_price),
        usedByCustomer: [],
      });
    }
    plans.get(key).usedByCustomer.push(entry.used);
  });
  return plans;
}

/** Token suy nghĩ = tổng Google tính − prompt − output (không ghi riêng trong metadata). */
const thoughtsOf = ({ totalTokens, promptTokens, outputTokens }) => (
  Math.max(0, toNumber(totalTokens) - toNumber(promptTokens) - toNumber(outputTokens))
);

const toVnd = (usd, usdVndRate) => Math.round(toNumber(usd) * toNumber(usdVndRate));

/**
 * Cộng dồn các dòng token theo khoá. Chi phí tính theo model GHI TRÊN DÒNG (không theo model hiện tại), theo giá của NGÀY
 * ghi trên dòng (`price_day`, giờ VN — giá đổi theo ngày thì kỳ vắt qua mốc đổi giá vẫn đúng) và gồm token suy nghĩ (xem
 * estimateCost). Chi phí làm tròn ở bước cuối (USD 4 chữ số, VND nguyên) — không cộng số đã tròn.
 * Khi các dòng có `call_count`: thêm `calls` và chi phí mỗi lượt gọi (tính từ số chưa tròn).
 */
const aggregateRows = (rows, keyFn, seedFn, pricing, usdVndRate = getUsdVndRate()) => {
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
      totalTokens,
      at: row.price_day,
    });
    if (row.call_count !== undefined) item.calls = (item.calls || 0) + toNumber(row.call_count);
  });
  return Array.from(map.values()).map((item) => ({
    ...item,
    thoughtsTokens: thoughtsOf(item),
    estimatedCostUsd: roundMoney(item.estimatedCostUsd),
    estimatedCostVnd: toVnd(item.estimatedCostUsd, usdVndRate),
    ...(item.calls > 0 ? {
      costPerCallUsd: roundMoney(item.estimatedCostUsd / item.calls),
      costPerCallVnd: toVnd(item.estimatedCostUsd / item.calls, usdVndRate),
    } : {}),
  }));
};

/**
 * Các ngày lịch `YYYY-MM-DD` từ `startDay` đến `endDay` (gồm cả hai). Chỉ cộng ngày trên lịch (UTC thuần) — mốc
 * đầu/cuối do SQL trả theo giờ VN, nên kết quả không phụ thuộc múi giờ của Node.
 */
const enumerateDays = (startDay, endDay) => {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(String(startDay || '')) || !pattern.test(String(endDay || ''))) return [];
  const [sy, sm, sd] = startDay.split('-').map(Number);
  const [ey, em, ed] = endDay.split('-').map(Number);
  const last = Date.UTC(ey, em - 1, ed);
  const days = [];
  for (let cursor = Date.UTC(sy, sm - 1, sd); cursor <= last && days.length < 400; cursor += 86400000) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
};

const buildTimeline = (rows, days, pricing, usdVndRate) => {
  const byDay = new Map();
  rows.forEach((row) => {
    const bucket = String(row.bucket || '').slice(0, 10);
    if (!bucket) return;
    const item = byDay.get(bucket) || { bucket, promptTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
    const promptTokens = toNumber(row.prompt_tokens);
    const outputTokens = toNumber(row.output_tokens);
    const totalTokens = toNumber(row.total_tokens);
    item.promptTokens += promptTokens;
    item.outputTokens += outputTokens;
    item.totalTokens += totalTokens;
    item.estimatedCostUsd += estimateCost(pricing, {
      model: row.model, promptTokens, outputTokens, totalTokens, at: bucket,
    });
    byDay.set(bucket, item);
  });

  return days.map((bucket) => {
    const item = byDay.get(bucket) || { bucket, promptTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
    return {
      ...item,
      estimatedCostUsd: roundMoney(item.estimatedCostUsd),
      estimatedCostVnd: toVnd(item.estimatedCostUsd, usdVndRate),
    };
  });
};

/**
 * Bảng gốc của chi phí: một dòng cho mỗi (tính năng, loại, model, ngày VN) trong khoảng đã chọn. Mọi số "chi phí" của trang
 * (KPI, theo tính năng, theo model) cùng cộng từ đây nên khớp nhau tuyệt đối; `created_at >= mốc` tính trong SQL.
 */
const featureModelSql = (startSql) => `SELECT
     ${TOKEN_SQL.feature} AS feature,
     ${TOKEN_SQL.kind} AS kind,
     ${TOKEN_SQL.model} AS model,
     ${PRICE_DAY_SQL} AS price_day,
     COUNT(*)::int AS call_count,
     COALESCE(SUM(delta), 0)::bigint AS total_tokens,
     COALESCE(SUM(${TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
     COALESCE(SUM(${TOKEN_SQL.output}), 0)::bigint AS output_tokens
   FROM usage_logs
   WHERE resource_type = 'ai_token'
     AND created_at >= ${startSql}
   GROUP BY 1, 2, 3, 4`;

/**
 * Chi phí thực đo theo từng model (cho trang Quản lý model AI — cùng nguồn với trang Chi phí AI).
 * `costPerCallVnd` = chi phí ÷ số lượt gọi, KHÔNG kể dòng embedding; model chưa có lượt gọi nào → không có khoá.
 *
 * @returns {Promise<{ range: string, byModel: Record<string, { calls: number, costUsd: number, costPerCallUsd: number,
 *   costPerCallVnd: number }> }>}
 */
export async function getMeasuredCostByModel({ range } = {}) {
  const normalizedRange = normalizeUsageRange(range);
  const pricing = parsePricing();
  const usdVndRate = getUsdVndRate();
  const rows = await aiUsageRepository.safeQuery(featureModelSql(USAGE_RANGE_START_SQL[normalizedRange]), []);

  const acc = new Map();
  rows.forEach((row) => {
    if (!groupCountsAsCall(resolveAiFeatureGroup(row.feature, row.kind))) return;
    const model = row.model || '_unknown';
    const item = acc.get(model) || { calls: 0, costUsd: 0 };
    item.calls += toNumber(row.call_count);
    item.costUsd += estimateCost(pricing, {
      model,
      promptTokens: toNumber(row.prompt_tokens),
      outputTokens: toNumber(row.output_tokens),
      totalTokens: toNumber(row.total_tokens),
      at: row.price_day,
    });
    acc.set(model, item);
  });

  const byModel = {};
  acc.forEach((item, model) => {
    if (item.calls <= 0) return;
    byModel[model] = {
      calls: item.calls,
      costUsd: roundMoney(item.costUsd),
      costPerCallUsd: roundMoney(item.costUsd / item.calls),
      costPerCallVnd: toVnd(item.costUsd / item.calls, usdVndRate),
    };
  });
  return { range: normalizedRange, byModel };
}

export async function getAiUsageOverview({ range: rawRange } = {}) {
  const range = normalizeUsageRange(rawRange);
  const startSql = USAGE_RANGE_START_SQL[range];
  const pricing = parsePricing();
  const usdVndRate = getUsdVndRate();
  const noParams = [];

  const [
    metaRows,
    featureModelRows,
    userFeatureRows,
    planRows,
    topUserRows,
    p90Rows,
    timelineRows,
    creditPlans,
  ] = await Promise.all([
    // Ngày đầu / ngày cuối của khoảng theo giờ VN (chuỗi YYYY-MM-DD) — dựng đủ các cột biểu đồ mà không cần múi giờ của Node.
    aiUsageRepository.safeQuery(
      `SELECT
         to_char(${startSql} AT TIME ZONE '${VN_TZ}', 'YYYY-MM-DD') AS start_day,
         to_char(NOW() AT TIME ZONE '${VN_TZ}', 'YYYY-MM-DD') AS end_day`,
      noParams,
      [{ start_day: null, end_day: null }]
    ),
    aiUsageRepository.safeQuery(featureModelSql(startSql), noParams),
    // Ai đã dùng tính năng nào: đủ để đếm "khách đang dùng AI" (bỏ người chỉ có embedding/trợ giúp) mà chỉ phân loại
    // tính năng ở MỘT nơi (aiFeatureCatalog), không lặp điều kiện trong SQL.
    // `id_user IS NOT NULL`: dòng không có chủ (khách vãng lai chat trang chủ / trợ giúp chưa đăng nhập, migration 273)
    // có trong TỔNG CHI PHÍ nhưng không phải một khách — không được đếm vào "khách đang dùng AI" / "user dùng AI".
    aiUsageRepository.safeQuery(
      `SELECT DISTINCT
         id_user,
         ${TOKEN_SQL.feature} AS feature,
         ${TOKEN_SQL.kind} AS kind
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND id_user IS NOT NULL
         AND created_at >= ${startSql}`,
      noParams
    ),
    // Ba truy vấn theo CHỦ (theo gói, top user, p90/user) bỏ dòng `id_user IS NULL`: chi phí của khách vãng lai / hệ thống
    // không thuộc gói hay user nào — để lẫn vào "Unknown plan" sẽ làm sai chi phí gói không có gói, và gom mọi khách vãng
    // lai thành MỘT "user" khổng lồ trong p90 / top user. Chúng vẫn có trong tổng, bảng theo tính năng / model và biểu đồ.
    aiUsageRepository.safeQuery(
      `SELECT
         p.id AS plan_id,
         COALESCE(p.code, 'unknown') AS plan_code,
         COALESCE(p.name, p.code, 'Unknown plan') AS plan_name,
         p.ai_credits_per_period,
         p.price AS plan_price,
         ${UL_TOKEN_SQL.model} AS model,
         ${UL_PRICE_DAY_SQL} AS price_day,
         COALESCE(SUM(ul.delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs ul
       LEFT JOIN users u ON u.id = ul.id_user
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ul.resource_type = 'ai_token'
         AND ul.id_user IS NOT NULL
         AND ul.created_at >= ${startSql}
       GROUP BY p.id, p.code, p.name, p.ai_credits_per_period, p.price, model, price_day`,
      noParams
    ),
    aiUsageRepository.safeQuery(
      `SELECT
         ul.id_user,
         COALESCE(u.email, u.username, CONCAT('User #', ul.id_user::text)) AS email,
         COALESCE(p.code, 'unknown') AS plan_code,
         COALESCE(p.name, p.code, 'Unknown plan') AS plan_name,
         ${UL_TOKEN_SQL.model} AS model,
         ${UL_PRICE_DAY_SQL} AS price_day,
         COALESCE(SUM(ul.delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${UL_TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs ul
       LEFT JOIN users u ON u.id = ul.id_user
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ul.resource_type = 'ai_token'
         AND ul.id_user IS NOT NULL
         AND ul.created_at >= ${startSql}
       GROUP BY ul.id_user, u.email, u.username, p.code, p.name, model, price_day`,
      noParams
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
           AND ul.id_user IS NOT NULL
           AND ul.created_at >= ${startSql}
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
      noParams
    ),
    // Ngày của dòng theo giờ VN (chuỗi), cùng múi giờ với mốc bắt đầu khoảng → tổng biểu đồ = tổng KPI.
    aiUsageRepository.safeQuery(
      `SELECT
         to_char(created_at AT TIME ZONE '${VN_TZ}', 'YYYY-MM-DD') AS bucket,
         ${TOKEN_SQL.model} AS model,
         COALESCE(SUM(delta), 0)::bigint AS total_tokens,
         COALESCE(SUM(${TOKEN_SQL.prompt}), 0)::bigint AS prompt_tokens,
         COALESCE(SUM(${TOKEN_SQL.output}), 0)::bigint AS output_tokens
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND created_at >= ${startSql}
       GROUP BY 1, 2
       ORDER BY 1`,
      noParams
    ),
    // Hạn mức chặn thật theo LƯỢT AI (credit), không phải token: 1 credit / lượt trả lời. Khối này KHÔNG theo bộ lọc
    // thời gian — là "đã dùng trong KỲ HIỆN TẠI của từng khách", cùng hàm với cổng chặn (xem collectCreditUsageByPlan).
    collectCreditUsageByPlan(),
  ]);

  // ── Nguồn gốc của chi phí: một dòng / (tính năng, loại, model) ───────────────────────────────────────────────
  const byModel = aggregateRows(
    featureModelRows,
    (row) => row.model || '_unknown',
    (row) => ({ model: row.model || '_unknown', promptTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, estimatedCostUsd: 0 }),
    pricing,
    usdVndRate
  )
    // priceConfigured=false → chi phí đang tính bằng giá _default, KHÔNG phải giá thật của model này.
    .map((item) => ({ ...item, priceConfigured: hasConfiguredPrice(pricing, item.model) }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  const groupOfRow = (row) => resolveAiFeatureGroup(row.feature, row.kind);
  const featureCodesByGroup = new Map();
  featureModelRows.forEach((row) => {
    const group = groupOfRow(row);
    if (!featureCodesByGroup.has(group)) featureCodesByGroup.set(group, new Set());
    featureCodesByGroup.get(group).add(row.feature || '_unknown');
  });
  const byFeature = aggregateRows(
    featureModelRows,
    groupOfRow,
    (row) => ({ group: groupOfRow(row), promptTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, estimatedCostUsd: 0 }),
    pricing,
    usdVndRate
  )
    .map((item) => {
      const countsAsCall = groupCountsAsCall(item.group);
      return {
        ...item,
        features: Array.from(featureCodesByGroup.get(item.group) || []).sort(),
        // Nạp tài liệu (embedding) có chi phí nhưng không phải "lượt" → không có chi phí mỗi lượt.
        countsAsCall,
        costPerCallUsd: countsAsCall ? (item.costPerCallUsd ?? null) : null,
        costPerCallVnd: countsAsCall ? (item.costPerCallVnd ?? null) : null,
      };
    })
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  // ── Bốn số trên cùng ──────────────────────────────────────────────────────────────────────────────────────
  const totalCostUsdRaw = featureModelRows.reduce((sum, row) => sum + estimateCost(pricing, {
    model: row.model,
    promptTokens: toNumber(row.prompt_tokens),
    outputTokens: toNumber(row.output_tokens),
    totalTokens: toNumber(row.total_tokens),
    at: row.price_day,
  }), 0);
  const calls = featureModelRows.reduce(
    (sum, row) => sum + (groupCountsAsCall(groupOfRow(row)) ? toNumber(row.call_count) : 0),
    0
  );
  const allUserIds = new Set();
  const customerIds = new Set();
  userFeatureRows.forEach((row) => {
    allUserIds.add(String(row.id_user));
    if (groupCountsAsCustomerUse(resolveAiFeatureGroup(row.feature, row.kind))) customerIds.add(String(row.id_user));
  });
  const promptTokens = featureModelRows.reduce((sum, row) => sum + toNumber(row.prompt_tokens), 0);
  const outputTokens = featureModelRows.reduce((sum, row) => sum + toNumber(row.output_tokens), 0);
  const totalTokens = featureModelRows.reduce((sum, row) => sum + toNumber(row.total_tokens), 0);
  const costPerCallUsdRaw = calls > 0 ? totalCostUsdRaw / calls : null;

  const summary = {
    estimatedCostUsd: roundMoney(totalCostUsdRaw),
    estimatedCostVnd: toVnd(totalCostUsdRaw, usdVndRate),
    calls,
    costPerCallUsd: costPerCallUsdRaw === null ? null : roundMoney(costPerCallUsdRaw),
    costPerCallVnd: costPerCallUsdRaw === null ? null : toVnd(costPerCallUsdRaw, usdVndRate),
    customers: customerIds.size,
    // Chi tiết kỹ thuật
    promptTokens,
    outputTokens,
    thoughtsTokens: thoughtsOf({ totalTokens, promptTokens, outputTokens }),
    totalTokens,
    logCount: featureModelRows.reduce((sum, row) => sum + toNumber(row.call_count), 0),
    userCount: allUserIds.size,
  };

  // ── Cờ giá: model đang có dòng dùng mà chưa có giá thì chi phí đang tính bằng giá tạm ────────────────────────
  const unpricedModels = byModel
    .filter((item) => !item.priceConfigured)
    .map((item) => ({
      model: item.model,
      calls: item.calls,
      estimatedCostUsd: item.estimatedCostUsd,
      costSharePct: totalCostUsdRaw > 0 ? round1((item.estimatedCostUsd / totalCostUsdRaw) * 100) : 0,
    }));
  const pricingWarning = unpricedModels.length === 0 ? null : {
    unpricedCostSharePct: totalCostUsdRaw > 0
      ? round1((unpricedModels.reduce((sum, item) => sum + item.estimatedCostUsd, 0) / totalCostUsdRaw) * 100)
      : 0,
    models: unpricedModels,
  };

  // ── Theo gói: token/chi phí theo khoảng đã chọn; cột lượt AI theo KỲ HIỆN TẠI của từng khách (chủ ý khác mốc) ──
  const tokenPlans = aggregateRows(
    planRows,
    planKey,
    (row) => ({
      planId: row.plan_id || null,
      planCode: row.plan_code || 'unknown',
      planName: row.plan_name || row.plan_code || 'Unknown plan',
      aiCreditsPerPeriod: toNullableNumber(row.ai_credits_per_period),
      planPrice: toNullableNumber(row.plan_price),
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      userCount: 0,
      estimatedCostUsd: 0,
    }),
    pricing,
    usdVndRate
  );
  const p90TokensByPlan = new Map(p90Rows.map((row) => [planKey(row), toNumber(row.p90_user_tokens)]));
  // Số khách có dòng token của gói = `user_count` của truy vấn p90 (một dòng / gói, COUNT(*) trên từng khách). Truy vấn chi
  // phí theo gói gom thêm theo ngày nên không tự đếm khách được nữa (khách dùng nhiều ngày sẽ bị đếm lệch).
  const tokenUsersByPlan = new Map(p90Rows.map((row) => [planKey(row), toNumber(row.user_count)]));
  const planItems = new Map(tokenPlans.map((item) => {
    const key = String(item.planId || item.planCode || 'unknown');
    return [key, { ...item, userCount: tokenUsersByPlan.get(key) || 0 }];
  }));
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
      planPrice: plan.planPrice ?? null,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      userCount: 0,
      estimatedCostUsd: 0,
      estimatedCostVnd: 0,
      thoughtsTokens: 0,
    });
  });

  // `userCount` giữ nguyên nghĩa cũ (quần thể có dòng token); quần thể lượt AI là `creditUserCount`.
  // "Nếu dùng hết hạn mức" = hạn mức × chi phí mỗi lượt (bốn số trên, theo khoảng đang chọn): trả lời "gói nào lỗ nếu
  // khách dùng hết". Xấp xỉ 1 lượt AI ≈ 1 lượt gọi (một lượt sinh chiến dịch có thể gọi 2 lần, lượt tự sửa landing
  // gọi mà không tính lượt). Gói không giới hạn → không có số. So với `plans.price` (giá gói một kỳ).
  const byPlan = Array.from(planItems.entries()).map(([key, item]) => {
    const quota = item.aiCreditsPerPeriod;
    const fullQuotaCostVnd = quota > 0 && costPerCallUsdRaw !== null
      ? toVnd(quota * costPerCallUsdRaw, usdVndRate)
      : null;
    const price = toNullableNumber(item.planPrice);
    return {
      ...item,
      planPriceVnd: price,
      fullQuotaCostVnd,
      fullQuotaCostVsPricePct: fullQuotaCostVnd !== null && price > 0 ? round1((fullQuotaCostVnd / price) * 100) : null,
      p90UserTokens: p90TokensByPlan.get(key) || 0,
      ...summarizeCreditUsage(creditPlans.get(key)?.usedByCustomer, item.aiCreditsPerPeriod),
    };
  }).sort((a, b) => b.totalTokens - a.totalTokens);

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
    pricing,
    usdVndRate
  ).sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 20);

  const { start_day: rangeStart = null, end_day: rangeEnd = null } = metaRows[0] || {};

  return {
    range,
    rangeStart,
    rangeEnd,
    usdVndRate,
    summary,
    pricingWarning,
    byFeature,
    byPlan,
    byModel,
    topUsers,
    timeline: buildTimeline(timelineRows, enumerateDays(rangeStart, rangeEnd), pricing, usdVndRate),
  };
}
