/**
 * Plan + feature translation helpers, shared between PricingSection and the
 * admin plan edit form (features/admin/plans/planUtils.jsx). Keep both in
 * sync when changing the alias table or feature regexes.
 *
 * Notes:
 *  - Plan description coming from the DB always wins. Hard-coded
 *    `pricing.planDescriptions.<code>` is only a fallback for plans the
 *    admin hasn't customised yet.
 *  - For features we use regex templates first (so "500 email/tháng"
 *    becomes the right translation regardless of locale), then a known
 *    feature map for hard-coded VI copy.
 */

const PLAN_ALIASES = { professional: 'pro' };

const KNOWN_PLAN_KEYS = [
  'starter', 'trial', 'basic', 'pro', 'team', 'business', 'enterprise', 'custom',
];

const KNOWN_FEATURE_KEYS = {
  'ai viết content nâng cao': 'advancedAiWriting',
  'hỗ trợ ưu tiên 24/7': 'prioritySupport247',
  'hỗ trợ 24/7': 'support247',
  'hỗ trợ qua email': 'emailSupport',
  multi_language: 'multiLanguage',
  'không giới hạn': 'unlimited',
  'không hỗ trợ': 'notSupported',
  'nhắn tin zalo oa không giới hạn': 'unlimitedZaloMessages',
  'nhắn tin zalo không giới hạn': 'unlimitedZaloMessages',
  'không giới hạn tin zalo': 'unlimitedZalo',
  'gửi email không giới hạn': 'unlimitedEmailSending',
  'không giới hạn email': 'unlimitedEmail',
  'không giới hạn chiến dịch': 'unlimitedCampaigns',
  'không giới hạn landing pages': 'unlimitedLandingPages',
  'không giới hạn landing page': 'unlimitedLandingPages',
  'không giới hạn tài khoản': 'unlimitedAccounts',
  'tạo chiến dịch zalo & email': 'zaloEmailCampaigns',
  'hỗ trợ qua chat': 'chatSupport',
  'báo cáo chi tiết': 'detailedReports',
  'tự động hoá zalo': 'zaloAutomation',
  'tự động hóa zalo': 'zaloAutomation',
  'api truy cập': 'apiAccess',
  'ưu tiên hỗ trợ': 'prioritySupport',
  'hỗ trợ ưu tiên': 'prioritySupport',
};

const FEATURE_REGEX_TEMPLATES = [
  // Email per month
  { re: /^([\d.,]+)\s*emails?\s*\/\s*tháng$/i, key: 'emailPerMonth', named: 'n' },
  { re: /^([\d.,]+)\s*emails?\s*\/\s*month$/i, key: 'emailPerMonth', named: 'n' },
  // Zalo per month
  { re: /^([\d.,]+)\s*(?:tin(?:\s*nhắn)?\s*)?zalo\s*\/\s*tháng$/i, key: 'zaloPerMonth', named: 'n' },
  // Members
  { re: /^([\d.,]+)\s*thành viên(?:\s*tham gia)?$/i, key: 'members', named: 'n' },
  // Campaigns
  { re: /^([\d.,]+)\s*chiến dịch$/i, key: 'campaigns', named: 'n' },
  // Landing pages
  { re: /^([\d.,]+)\s*landing pages?$/i, key: 'landingPages', named: 'n' },
  // Zalo OA accounts
  { re: /^([\d.,]+)\s*tài khoản\s*zalo(?:\s*oa)?$/i, key: 'zaloAccounts', named: 'n' },
  // Email accounts
  { re: /^([\d.,]+)\s*tài khoản\s*email$/i, key: 'emailAccounts', named: 'n' },
];

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const isContactPlan = (plan) => {
  const code = String(plan?.code || '').trim().toLowerCase();
  const name = String(plan?.name || '').trim().toLowerCase();
  return code === 'custom' || code === 'contact' || name.includes('tùy chọn') || name.includes('tuỳ chọn');
};

export const isFreePlan = (plan) => Number(plan?.price || 0) <= 0 && !isContactPlan(plan);

export const getPlanCtaLabel = (plan, t, isCurrentCustom = false) => {
  if (isCurrentCustom) return t('pricing.editCustomPlan');
  if (isContactPlan(plan)) return t('customPlan.cardCta');
  if (isFreePlan(plan)) return t('pricing.startTrial');
  return t('pricing.choosePlan');
};

export const getPlanTranslationKey = (plan) => {
  const code = normalizeText(plan?.code);
  if (code) return PLAN_ALIASES[code] || code;

  const name = normalizeText(plan?.name)
    .replace(/^gói\s+/, '')
    .replace(/\s+plan$/, '');

  const resolved = PLAN_ALIASES[name] || name;
  if (KNOWN_PLAN_KEYS.includes(resolved)) return resolved;
  if (name.includes('tùy chọn') || name.includes('tuỳ chọn')) return 'custom';
  return '';
};

export const getTranslatedPlanName = (plan, t) => {
  const key = getPlanTranslationKey(plan);
  const translated = key ? t(`pricing.planNames.${key}`) : '';
  return translated && translated !== `pricing.planNames.${key}` ? translated : plan.name;
};

export const getTranslatedPlanDescription = (plan, t) => {
  if (String(plan?.description || '').trim()) return plan.description;
  const key = getPlanTranslationKey(plan);
  const translated = key ? t(`pricing.planDescriptions.${key}`) : '';
  return translated && translated !== `pricing.planDescriptions.${key}` ? translated : plan.description;
};

export const getTranslatedFeature = (feature, t) => {
  const text = String(feature || '').trim();
  const normalized = normalizeText(text);

  for (const { re, key } of FEATURE_REGEX_TEMPLATES) {
    const m = text.match(re);
    if (m) return t(`pricing.featureTemplates.${key}`, { n: m[1] });
  }

  const key = KNOWN_FEATURE_KEYS[normalized];
  return key ? t(`pricing.features.${key}`) : text;
};
