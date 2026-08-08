/**
 * Pure Gemini text-token pricing helpers.
 * USD / 1M tokens — source: Google Gemini pricing (re-check periodically).
 * Override without redeploy via AI_PRICING_JSON. USD→VND via USD_VND_RATE.
 */

export const DEFAULT_USD_VND_RATE = 24000;

/** Fallback when usage_logs has no usable token averages. */
export const DEFAULT_AVG_PROMPT_TOKENS = 10000;
export const DEFAULT_AVG_OUTPUT_TOKENS = 500;

// gemini-2.5-pro uses the base tier (prompt ≤200k); >200k is higher ($2.50/$15)
// and rare here because average prompts are ~10k tokens.
export const DEFAULT_PRICING = Object.freeze({
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  _default: { input: 0.3, output: 2.5 },
});

const toNumber = (value) => Number(value || 0);

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
    return {
      ...DEFAULT_PRICING,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      _default: parsed?._default || DEFAULT_PRICING._default,
    };
  } catch (error) {
    console.warn(`[aiPricing] Invalid AI_PRICING_JSON, using defaults: ${error?.message || error}`);
    return { ...DEFAULT_PRICING };
  }
}

/** Always returns a price row (falls back to _default / Flash). */
export function pricingForModel(pricing, model) {
  return pricing?.[model] || pricing?._default || DEFAULT_PRICING._default;
}

/** True only when this exact model id has an entry (not via _default). */
export function hasConfiguredPrice(pricing, model) {
  if (!model || model === '_default') return false;
  return Boolean(pricing?.[model]);
}

export function estimateCost(pricing, { model, promptTokens = 0, outputTokens = 0 } = {}) {
  const price = pricingForModel(pricing, model);
  return ((toNumber(promptTokens) / 1_000_000) * toNumber(price.input))
    + ((toNumber(outputTokens) / 1_000_000) * toNumber(price.output));
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
  } = {}
) {
  if (!hasConfiguredPrice(pricing, model)) return null;
  const usd = estimateCost(pricing, {
    model,
    promptTokens: avgPromptTokens,
    outputTokens: avgOutputTokens,
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
