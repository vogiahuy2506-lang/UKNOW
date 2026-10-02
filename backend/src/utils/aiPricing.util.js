/**
 * Pure Gemini text-token pricing helpers.
 * USD / 1M tokens — source: Google Gemini pricing (re-check periodically).
 * Override without redeploy via AI_PRICING_JSON. USD→VND via USD_VND_RATE.
 *
 * Giá của một model là MỘT mức phẳng `{ input, output }` (áp cho mọi ngày) HOẶC một mảng các mức theo ngày hiệu lực:
 * `[{ input, output, until: 'YYYY-MM-DD' }, { input, output }]` — `until` là ngày CUỐI cùng (giờ VN, gồm cả ngày đó) mức
 * này còn áp dụng; mức cuối không có `until` = áp dụng từ đó về sau. Chi phí của một dòng usage phải tính theo giá của
 * NGÀY dòng đó được ghi (`at`), không theo giá hôm nay — xem `resolvePricing`.
 */

export const DEFAULT_USD_VND_RATE = 24000;

/** Fallback when usage_logs has no usable token averages. */
export const DEFAULT_AVG_PROMPT_TOKENS = 10000;
export const DEFAULT_AVG_OUTPUT_TOKENS = 500;

// gemini-2.5-pro uses the base tier (prompt ≤200k); >200k is higher ($2.50/$15)
// and rare here because average prompts are ~10k tokens.
//
// 24/09/2026: gỡ 'gemini-2.0-flash' — Google ngừng liệt kê từ 10/08, và usage_logs trên production
// không có dòng nào dùng nó (đo: 3.5-flash 2.558, 2.5-pro 257, 2.5-flash 105, embedding-001 3.227).
// Giá của model đã khai tử CHỈ được gỡ khi không còn dòng lịch sử nào, không thì báo cáo chi phí quá
// khứ bị tính lại bằng _default.
//
// 30/09/2026: điền giá 3.5-flash, 3.8-flash và embedding. Nguồn: bảng giá niêm yết của Google
// (https://ai.google.dev/gemini-api/docs/pricing), tra ngày 30/09/2026, gói trả phí, USD / 1 triệu token.
// Giá "output" của các model flash ĐÃ gồm token suy nghĩ (thinking) — xem estimateCost.
//   - gemini-3.5-flash: 1,50 vào / 9,00 ra (model hệ thống).
//   - gemini-3.8-flash: 0,75 vào / 3,75 ra là GIÁ KHUYẾN MÃI tới 31/12/2026 (giờ VN, gồm cả ngày 31). Từ 01/01/2027
//     Google tính 1,50 / 7,50. Bảng giá ghi CẢ HAI mức kèm ngày hiệu lực nên không phải sửa tay đúng ngày 01/01/2027, và
//     kỳ báo cáo vắt qua mốc đó vẫn tính từng dòng theo giá của ngày dòng đó (không bị tính lại cả quá khứ bằng giá mới).
//   - gemini-embedding-001: trang giá không còn liệt kê ("Gemini Embedding 2" giá 0,20). Dùng 0,15 là
//     GIÁ CŨ của embedding-001; embedding không có token ra nên output = 0.
// Model nào chưa có dòng ở đây vẫn rơi về _default và bị cờ "giá tạm" trên trang Chi phí AI.
/** Danh sách mức giá theo ngày hiệu lực, đã đóng băng; viết theo thứ tự `until` tăng dần, mức không có `until` ở cuối. */
const tiers = (...list) => Object.freeze(list.map((tier) => Object.freeze(tier)));

export const DEFAULT_PRICING = Object.freeze({
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-3.5-flash': { input: 1.5, output: 9.0 },
  'gemini-3.8-flash': tiers(
    { input: 0.75, output: 3.75, until: '2026-12-31' },
    { input: 1.5, output: 7.5 },
  ),
  'gemini-embedding-001': { input: 0.15, output: 0 },
  _default: { input: 0.3, output: 2.5 },
});

const toNumber = (value) => Number(value || 0);

/** VN không có giờ mùa hè: UTC+7 cố định. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ngày lịch `YYYY-MM-DD` THEO GIỜ VN của một mốc. Chuỗi đã đúng dạng ngày được coi là ngày VN sẵn (SQL trả ra như vậy, xem
 * `to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')` ở aiUsage.service.js); Date / số / chuỗi giờ được đổi
 * sang giờ VN; bỏ trống = hôm nay. Không dùng múi giờ của Node.
 */
export function toVnDay(at) {
  if (typeof at === 'string' && DAY_PATTERN.test(at)) return at;
  const ms = at === undefined || at === null ? Date.now() : new Date(at).getTime();
  return new Date((Number.isFinite(ms) ? ms : Date.now()) + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const addOneDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * Chuẩn hoá giá của MỘT model đọc từ AI_PRICING_JSON. Mức phẳng giữ nguyên (một mức cho mọi ngày). Mảng mức theo ngày: mọi
 * phần tử phải là object, `until` (nếu có) đúng dạng YYYY-MM-DD, tối đa một mức không có `until` và không trùng `until`;
 * sắp theo `until` tăng dần, mức không có `until` ở cuối. Sai → null (bỏ qua, dùng giá mặc định của model đó).
 */
function normalizeModelPrice(value) {
  if (!Array.isArray(value)) return value && typeof value === 'object' ? value : null;
  if (value.length === 0) return null;
  if (!value.every((tier) => tier && typeof tier === 'object' && !Array.isArray(tier))) return null;
  if (!value.every((tier) => tier.until === undefined || (typeof tier.until === 'string' && DAY_PATTERN.test(tier.until)))) return null;
  const dated = value.filter((tier) => tier.until !== undefined).sort((a, b) => a.until.localeCompare(b.until));
  const open = value.filter((tier) => tier.until === undefined);
  if (open.length > 1) return null;
  if (new Set(dated.map((tier) => tier.until)).size !== dated.length) return null;
  return [...dated, ...open].map((tier) => ({ ...tier }));
}

export function getUsdVndRate() {
  const raw = Number(process.env.USD_VND_RATE);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_USD_VND_RATE;
}

export function parsePricing() {
  const raw = String(process.env.AI_PRICING_JSON || '').trim();
  if (!raw) return { ...DEFAULT_PRICING };
  try {
    const parsed = JSON.parse(raw);
    const overrides = {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([model, value]) => {
        const normalized = normalizeModelPrice(value);
        if (normalized) overrides[model] = normalized;
        else console.warn(`[aiPricing] AI_PRICING_JSON: giá của "${model}" không hợp lệ, bỏ qua (dùng giá mặc định).`);
      });
    }
    return {
      ...DEFAULT_PRICING,
      ...overrides,
      _default: overrides._default || DEFAULT_PRICING._default,
    };
  } catch (error) {
    console.warn(`[aiPricing] Invalid AI_PRICING_JSON, using defaults: ${error?.message || error}`);
    return { ...DEFAULT_PRICING };
  }
}

/** Mức giá áp dụng vào `day` (đã đổi sang ngày VN): mức đầu tiên chưa hết hạn; quá mọi `until` thì giữ mức cuối. */
function pickTier(entry, day) {
  if (!Array.isArray(entry)) return entry;
  return entry.find((tier) => !tier.until || day <= tier.until) || entry[entry.length - 1];
}

/**
 * Always returns a flat price row `{ input, output }` (falls back to _default / Flash), đúng mức của NGÀY `at`
 * (Date / số / chuỗi `YYYY-MM-DD` giờ VN; bỏ trống = hôm nay).
 */
export function resolvePricing(pricing, model, at) {
  return pickTier(pricing?.[model] || pricing?._default || DEFAULT_PRICING._default, toVnDay(at));
}

/**
 * Mức giá SẮP TỚI của một model đã có giá: `{ from, input, output }` với `from` = ngày đầu tiên (giờ VN) mức đó áp dụng;
 * null khi giá không đổi theo ngày hoặc không còn mức nào phía sau mức đang áp dụng tại `at`.
 */
export function upcomingPricing(pricing, model, at) {
  const entry = pricing?.[model];
  if (!Array.isArray(entry)) return null;
  const day = toVnDay(at);
  const index = entry.findIndex((tier) => !tier.until || day <= tier.until);
  const current = entry[index];
  const next = index >= 0 ? entry[index + 1] : null;
  if (!current?.until || !next) return null;
  return { from: addOneDay(current.until), input: toNumber(next.input), output: toNumber(next.output) };
}

/** True only when this exact model id has an entry (not via _default). */
export function hasConfiguredPrice(pricing, model) {
  if (!model || model === '_default') return false;
  return Boolean(pricing?.[model]);
}

/**
 * USD cost of some tokens: `prompt × giá_vào + max(output, total − prompt) × giá_ra`.
 *
 * Token "suy nghĩ" (thinking) KHÔNG nằm trong `outputTokens` (`candidatesTokenCount`) nhưng Google tính nó theo
 * giá đầu ra, và nó nằm trong `totalTokens` (= `delta` của dòng usage_logs). Nên phần đầu ra tính tiền là
 * `total − prompt` (= output + suy nghĩ); `max` để dòng thiếu/sai `total` không bị tính đầu ra thấp hơn `output`.
 * Không truyền `totalTokens` (ước lượng theo token trung bình) thì tính như cũ: chỉ prompt + output.
 *
 * `at` = ngày của dòng usage (xem resolvePricing): giá đổi theo ngày thì mỗi dòng phải tính theo giá của ngày nó được ghi.
 * Bỏ trống = giá đang áp dụng hôm nay (ước lượng theo token trung bình).
 */
export function estimateCost(pricing, {
  model, promptTokens = 0, outputTokens = 0, totalTokens = null, at,
} = {}) {
  const price = resolvePricing(pricing, model, at);
  const prompt = toNumber(promptTokens);
  const output = toNumber(outputTokens);
  const total = toNumber(totalTokens);
  const billableOutput = total > 0 ? Math.max(output, total - prompt) : output;
  return ((prompt / 1_000_000) * toNumber(price.input))
    + ((billableOutput / 1_000_000) * toNumber(price.output));
}

/**
 * VND cost for one average answer. Returns null when the model has no configured price.
 */
export function costPerAnswerVnd(
  pricing,
  model,
  {
    avgPromptTokens = DEFAULT_AVG_PROMPT_TOKENS,
    avgOutputTokens = DEFAULT_AVG_OUTPUT_TOKENS,
    usdVndRate = getUsdVndRate(),
    at,
  } = {}
) {
  if (!hasConfiguredPrice(pricing, model)) return null;
  const usd = estimateCost(pricing, {
    model,
    promptTokens: avgPromptTokens,
    outputTokens: avgOutputTokens,
    at,
  });
  return Math.round(usd * toNumber(usdVndRate));
}

/**
 * Resolve average tokens for cost-per-answer display.
 * Missing/zero averages → use the full default pair (never mix real + default).
 */
export function resolveAvgTokens({ calls = 0, avgPromptTokens = 0, avgOutputTokens = 0 } = {}) {
  const callsN = toNumber(calls);
  const prompt = toNumber(avgPromptTokens);
  const output = toNumber(avgOutputTokens);
  if (callsN > 0 && prompt > 0 && output > 0) {
    return {
      avgPromptTokens: Math.round(prompt),
      avgOutputTokens: Math.round(output),
      basis: 'actual',
    };
  }
  return {
    avgPromptTokens: DEFAULT_AVG_PROMPT_TOKENS,
    avgOutputTokens: DEFAULT_AVG_OUTPUT_TOKENS,
    basis: 'estimate',
  };
}
