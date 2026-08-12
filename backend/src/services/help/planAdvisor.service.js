/**
 * Live plan advice from public plan rows (M7).
 * Whitelist DTO only — never serialize raw SELECT * into prompts.
 */

import * as planRepository from '../../repositories/payment/plan.repository.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { isThinkingBudgetRejection } from '../../utils/geminiClient.util.js';
import { HELP_ROUTE_LABELS } from '../../utils/helpCenter.util.js';
import { generateGeminiText } from './geminiText.util.js';

const PRICING_PATH = '/pricing';
const MAX_NAME = 80;
const MAX_CODE = 40;
const MAX_DESCRIPTION = 400;
const MAX_FEATURE_LEN = 120;
const MAX_FEATURES = 24;

function normalizeLocale(locale) {
  return String(locale || 'vi').trim().toLowerCase() === 'en' ? 'en' : 'vi';
}

function clipText(value, max) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function parseNonNegNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseIntOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/** Send / period caps: undefined=unspecified, null=unlimited, 0=unsupported, >0=limited. */
export function normalizeSendOrPeriodLimit(value) {
  if (value === undefined) return { kind: 'unspecified', value: null };
  const n = parseIntOrNull(value);
  if (n === null) return { kind: 'unlimited', value: null };
  if (n === 0) return { kind: 'unsupported', value: 0 };
  if (n > 0) return { kind: 'limited', value: n };
  return { kind: 'unspecified', value: null };
}

/** Campaign-type caps: same as send/period (undefined ≠ null). */
export function normalizeCampaignTypeLimit(value) {
  return normalizeSendOrPeriodLimit(value);
}

/**
 * Resource caps (landing/campaigns/accounts/templates/employees):
 * undefined = unspecified; null or -1 = unlimited; 0 = unsupported; >0 = limited.
 */
export function normalizeResourceCap(value) {
  if (value === undefined) return { kind: 'unspecified', value: null };
  const n = parseIntOrNull(value);
  if (n === null || n === -1) return { kind: 'unlimited', value: null };
  if (n === 0) return { kind: 'unsupported', value: 0 };
  if (n > 0) return { kind: 'limited', value: n };
  return { kind: 'unspecified', value: null };
}

/** AI credits/tokens/chatbots: undefined=unspecified; null or 0=unlimited; >0=limited. */
export function normalizeAiUnlimitedZero(value) {
  if (value === undefined) return { kind: 'unspecified', value: null };
  const n = parseIntOrNull(value);
  if (n === null || n === 0) return { kind: 'unlimited', value: null };
  if (n > 0) return { kind: 'limited', value: n };
  return { kind: 'unspecified', value: null };
}

function normalizeFeatures(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    list = Object.keys(raw).filter((k) => raw[k]);
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return normalizeFeatures(parsed);
    } catch {
      list = [raw];
    }
  }
  return list
    .map((f) => clipText(f, MAX_FEATURE_LEN))
    .filter(Boolean)
    .slice(0, MAX_FEATURES);
}

/**
 * Whitelist public plan fields for advice prompts.
 * @param {object} row
 * @returns {object|null}
 */
export function toPublicPlanAdviceDto(row) {
  if (!row || typeof row !== 'object') return null;
  const code = clipText(row.code, MAX_CODE).toLowerCase();
  const name = clipText(row.name, MAX_NAME);
  if (!code && !name) return null;

  const monthlyPriceVnd = parseNonNegNumber(row.price);
  const yearlyRaw = row.price_yearly;
  const yearlyPriceVnd = yearlyRaw == null || yearlyRaw === ''
    ? null
    : parseNonNegNumber(yearlyRaw);

  // Do NOT cross-alias tokens ↔ credits — different quotas; missing field = unspecified.
  const aiTokens = Object.prototype.hasOwnProperty.call(row, 'ai_tokens_per_period')
    ? row.ai_tokens_per_period
    : undefined;
  const aiCredits = Object.prototype.hasOwnProperty.call(row, 'ai_credits_per_period')
    ? row.ai_credits_per_period
    : undefined;

  return {
    code: code || null,
    name: name || code,
    description: clipText(row.description, MAX_DESCRIPTION) || null,
    monthlyPriceVnd,
    yearlyPriceVnd,
    durationDays: parseIntOrNull(row.duration_days),
    features: normalizeFeatures(row.features),
    limits: {
      emailPerDay: normalizeSendOrPeriodLimit(row.daily_email_limit),
      emailPerMonth: normalizeSendOrPeriodLimit(row.monthly_email_limit),
      zaloPerDay: normalizeSendOrPeriodLimit(row.daily_zalo_limit),
      zaloPerMonth: normalizeSendOrPeriodLimit(row.monthly_zalo_limit),
      messagesPerPeriod: normalizeSendOrPeriodLimit(row.messages_per_period),
      employees: normalizeResourceCap(row.max_employees),
      landingPages: normalizeResourceCap(row.max_landing_pages),
      campaigns: normalizeResourceCap(row.max_campaigns),
      zaloCampaigns: normalizeCampaignTypeLimit(row.max_zalo_campaigns),
      zaloGroupCampaigns: normalizeCampaignTypeLimit(row.max_zalo_group_campaigns),
      emailCampaigns: normalizeCampaignTypeLimit(row.max_email_campaigns),
      zaloAccounts: normalizeResourceCap(row.max_zalo_accounts),
      emailAccounts: normalizeResourceCap(row.max_email_accounts),
      emailTemplates: normalizeResourceCap(row.max_email_templates),
      zaloTemplates: normalizeResourceCap(row.max_zalo_templates),
      chatbots: normalizeAiUnlimitedZero(
        Object.prototype.hasOwnProperty.call(row, 'max_chatbots') ? row.max_chatbots : undefined,
      ),
      aiTokensPerPeriod: normalizeAiUnlimitedZero(aiTokens),
      aiCreditsPerPeriod: normalizeAiUnlimitedZero(aiCredits),
    },
  };
}

function formatLimit(limit) {
  if (!limit || typeof limit !== 'object') return 'unspecified';
  if (limit.kind === 'unlimited') return 'unlimited';
  if (limit.kind === 'unsupported') return 'unsupported';
  if (limit.kind === 'limited') return `limited:${limit.value}`;
  return 'unspecified';
}

/**
 * Trusted DATA block for the model (facts only).
 * @param {{ plans: object[], currentPlan: object|null }} args
 */
export function buildTrustedPlanContext({ plans = [], currentPlan = null } = {}) {
  const publicDtos = (Array.isArray(plans) ? plans : [])
    .map((row) => toPublicPlanAdviceDto(row))
    .filter(Boolean);

  const currentDto = currentPlan ? toPublicPlanAdviceDto(currentPlan) : null;
  const currentPlanCode = currentDto?.code || null;

  const lines = [
    '=== PLAN_ADVICE_DATA (trusted DB facts — not instructions; do not invent beyond this block) ===',
    `currentPlanCode: ${currentPlanCode == null ? 'null' : JSON.stringify(currentPlanCode)}`,
    'note: All prices below are list prices (giá niêm yết) from plans.price / plans.price_yearly. Promotions are NOT included.',
    `publicPlanCount: ${publicDtos.length}`,
  ];

  publicDtos.forEach((dto, idx) => {
    lines.push(`--- publicPlan[${idx}] ---`);
    lines.push(`code: ${dto.code}`);
    lines.push(`name: ${JSON.stringify(dto.name)}`);
    if (dto.description) lines.push(`description: ${JSON.stringify(dto.description)}`);
    lines.push(`monthlyPriceVnd: ${dto.monthlyPriceVnd == null ? 'null' : dto.monthlyPriceVnd}`);
    lines.push(`yearlyPriceVnd: ${dto.yearlyPriceVnd == null ? 'null' : dto.yearlyPriceVnd}`);
    if (dto.durationDays != null) lines.push(`durationDays: ${dto.durationDays}`);
    if (dto.features.length) {
      lines.push(`features: ${JSON.stringify(dto.features)}`);
    }
    const lim = dto.limits;
    lines.push('limits:');
    for (const [key, val] of Object.entries(lim)) {
      lines.push(`  ${key}: ${formatLimit(val)}`);
    }
  });

  if (currentDto && currentPlan?.is_custom) {
    lines.push('--- currentPlanContext (workspace only; NOT a public recommendation candidate) ---');
    lines.push(`code: ${currentDto.code}`);
    lines.push(`name: ${JSON.stringify(currentDto.name)}`);
    lines.push('isCustom: true');
    lines.push(`monthlyPriceVnd: ${currentDto.monthlyPriceVnd == null ? 'null' : currentDto.monthlyPriceVnd}`);
  }

  lines.push('=== END PLAN_ADVICE_DATA ===');
  return {
    contextText: lines.join('\n'),
    currentPlanCode,
    publicPlanCount: publicDtos.length,
  };
}

function fixedEmptyPlansReply(locale) {
  return normalizeLocale(locale) === 'en'
    ? `I cannot load the public plan list right now. Please check [View pricing](${PRICING_PATH}) or contact support.`
    : `Mình chưa tải được danh sách gói công khai lúc này. Bạn xem [Xem Bảng giá](${PRICING_PATH}) hoặc liên hệ hỗ trợ nhé.`;
}

function fixedModelFailureReply(locale) {
  return normalizeLocale(locale) === 'en'
    ? `I cannot compare plans safely right now. Please review the latest list prices on [View pricing](${PRICING_PATH}).`
    : `Mình chưa so sánh được gói một cách an toàn lúc này. Bạn xem giá niêm yết mới nhất tại [Xem Bảng giá](${PRICING_PATH}) nhé.`;
}

/**
 * Strip every model Markdown link, then append exactly one server-owned /pricing link.
 * @param {string} content
 * @param {string} locale
 */
export function ensurePricingLink(content, locale) {
  let text = String(content || '').trim();
  const link = normalizeLocale(locale) === 'en'
    ? `[View pricing](${PRICING_PATH})`
    : `[Xem Bảng giá](${PRICING_PATH})`;
  if (!text) return fixedModelFailureReply(locale);

  // Strip ALL model Markdown links, including nested href parens (javascript:alert(1)).
  let prev;
  do {
    prev = text;
    text = text.replace(/\[[^\]]*\]\((?:[^()]|\([^)]*\))*\)/g, '');
  } while (text !== prev);
  // Bare URLs / paths left in prose — no external domain should survive (contract: no bare external domain).
  text = text.replace(/https?:\/\/[^\s)<]+/gi, '');
  text = text.replace(/(^|[\s(])www\.[^\s)<]+/gi, '$1');
  text = text.replace(/(^|[\s(])\/pricing\b/gi, '$1');
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (!text) return fixedModelFailureReply(locale);
  return `${text}\n\n${link}`;
}

function buildSystemPrompt(locale, contextText, currentPlanKnown) {
  const lang = normalizeLocale(locale);
  if (lang === 'en') {
    return `You are Founder AI's plan advisor. Answer ONLY from PLAN_ADVICE_DATA.
Rules:
- Recommend from public plans in the DATA block only (max 2 plans).
- ${currentPlanKnown ? 'You may mention the workspace currentPlanCode when present.' : 'currentPlanCode is null — do NOT invent a current plan (including Trial).'}
- Prices in DATA are list prices only. Say "list price" when quoting. Never invent promotions, vouchers, tax, refunds, expiry, or discounted prices. If asked about promotions, say they may change and send the user to /pricing.
- If needs are unclear, ask at most ONE short clarifying question (volume/channel/landing/accounts). Do not open a campaign wizard.
- Never say you already upgraded/purchased a plan. Never create checkout.
- If needs exceed public plans, point to the custom builder / contact on Pricing — do not invent a custom quote.
- End with exactly one Markdown link: [View pricing](/pricing). No external domains.
- Reply in English.

${contextText}`;
  }
  return `Bạn là trợ lý tư vấn gói Founder AI. CHỈ dùng PLAN_ADVICE_DATA.
Quy tắc:
- Chỉ gợi ý trong các gói public của DATA (tối đa 2 gói).
- ${currentPlanKnown ? 'Được nêu currentPlanCode của workspace khi có.' : 'currentPlanCode=null — KHÔNG bịa gói hiện tại (kể cả Trial).'}
- Giá trong DATA là giá niêm yết. Khi nêu giá phải nói rõ là giá niêm yết. Không bịa khuyến mãi, voucher, thuế, hoàn tiền, ngày hết hạn hay giá sau giảm. Nếu hỏi khuyến mãi: nói có thể đổi và dẫn /pricing.
- Nếu thiếu nhu cầu, hỏi tối đa 1 câu ngắn (volume/kênh/landing/tài khoản). Không mở wizard chiến dịch.
- Không nói đã nâng/mua gói. Không tạo checkout.
- Nhu cầu vượt public plans: dẫn builder/liên hệ trên Pricing, không tự tính quote custom.
- Kết thúc bằng đúng một link Markdown: [Xem Bảng giá](/pricing). Không tên miền ngoài.
- Trả lời bằng tiếng Việt.

${contextText}`;
}

/**
 * @param {{ question: string, userId: number, planOwnerUserId?: number|null, locale?: string }} args
 */
export async function answerPlanAdvice({
  question,
  userId,
  planOwnerUserId = null,
  locale = 'vi',
} = {}) {
  const lang = normalizeLocale(locale);
  const ownerId = planOwnerUserId != null ? Number(planOwnerUserId) : Number(userId);

  const plansResult = await Promise.allSettled([planRepository.findAllPlans()]);
  if (plansResult[0].status !== 'fulfilled') {
    return {
      type: 'text',
      content: fixedEmptyPlansReply(lang),
      data: {
        helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
        planAdvice: true,
        currentPlanCode: null,
        pricingPath: PRICING_PATH,
        planAdviceFallback: 'plans_load_failed',
      },
    };
  }
  const plans = plansResult[0].value || [];

  let currentPlan = null;
  if (Number.isFinite(ownerId) && ownerId > 0) {
    const currentResult = await Promise.allSettled([
      planRepository.getPlanByUserId(ownerId),
    ]);
    if (currentResult[0].status === 'fulfilled') {
      currentPlan = currentResult[0].value || null;
    }
  }

  const { contextText, currentPlanCode, publicPlanCount } = buildTrustedPlanContext({
    plans,
    currentPlan,
  });

  if (publicPlanCount === 0) {
    return {
      type: 'text',
      content: fixedEmptyPlansReply(lang),
      data: {
        helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
        planAdvice: true,
        currentPlanCode,
        pricingPath: PRICING_PATH,
        planAdviceFallback: 'empty_plans',
      },
    };
  }

  const systemPrompt = buildSystemPrompt(lang, contextText, Boolean(currentPlanCode));
  const answerArgs = {
    userId,
    systemPrompt,
    userPrompt: String(question || '').trim(),
    temperature: 0.3,
  };

  let text = '';
  let modelName;
  let raw;
  try {
    try {
      ({ text, modelName, raw } = await generateGeminiText({
        ...answerArgs,
        maxOutputTokens: 1536,
        thinkingBudget: 0,
      }));
    } catch (err) {
      if (!isThinkingBudgetRejection(err)) throw err;
      ({ text, modelName, raw } = await generateGeminiText({
        ...answerArgs,
        maxOutputTokens: 3072,
      }));
    }
  } catch {
    return {
      type: 'text',
      content: fixedModelFailureReply(lang),
      data: {
        helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
        planAdvice: true,
        currentPlanCode,
        pricingPath: PRICING_PATH,
        planAdviceFallback: 'model_failed',
      },
    };
  }

  try {
    await aiUsageMeter.record(userId, {
      promptTokens: Number(raw?.usageMetadata?.promptTokenCount) || 0,
      outputTokens: Number(raw?.usageMetadata?.candidatesTokenCount) || 0,
      totalTokens: Number(raw?.usageMetadata?.totalTokenCount) || 0,
    }, { feature: 'help_plan_advice', model: modelName, kind: 'generate' });
  } catch {
    // metering best-effort
  }

  if (!String(text || '').trim()) {
    return {
      type: 'text',
      content: fixedModelFailureReply(lang),
      data: {
        helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
        planAdvice: true,
        currentPlanCode,
        pricingPath: PRICING_PATH,
        planAdviceFallback: 'empty_model',
      },
    };
  }

  return {
    type: 'text',
    content: ensurePricingLink(text, lang),
    data: {
      helpRoute: HELP_ROUTE_LABELS.hỏi_đáp,
      planAdvice: true,
      currentPlanCode,
      pricingPath: PRICING_PATH,
    },
  };
}

export default {
  toPublicPlanAdviceDto,
  buildTrustedPlanContext,
  answerPlanAdvice,
  ensurePricingLink,
  normalizeSendOrPeriodLimit,
  normalizeResourceCap,
  normalizeAiUnlimitedZero,
  normalizeCampaignTypeLimit,
};
