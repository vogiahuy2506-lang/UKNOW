/**
 * Plan + feature translation helpers, shared between PricingSection and the
 * admin plan edit form (features/admin/plans/planUtils.jsx). Keep both in
 * sync when changing the alias table or feature regexes.
 */

const PLAN_ALIASES = { professional: 'pro' };

const KNOWN_PLAN_KEYS = [
  'starter', 'trial', 'basic', 'pro', 'team', 'business', 'enterprise', 'custom',
];

const KNOWN_PLAN_DESCRIPTIONS = {
  // Starter
  'gói cơ bản dành cho cá nhân và freelancer quản lý khách hàng': 'starter',
  'essential plan for individuals and freelancers managing customers': 'starter',

  // Trial
  'trải nghiệm đầy đủ tính năng trong 14 ngày. không cần thẻ tín dụng': 'trial',
  'trải nghiệm đầy đủ tính năng trong 14 ngày': 'trial',
  'dùng thử miễn phí với tính năng cơ bản': 'trial',
  'free trial with essential features': 'trial',
  'experience full features for 14 days. no credit card required': 'trial',
  'experience full features for 14 days': 'trial',

  // Basic
  'gói basic dành cho shop nhỏ và doanh nghiệp vừa phải mở rộng quy mô tiếp cận khách hàng': 'basic',
  'dành cho cá nhân bắt đầu tự động hóa': 'basic',
  'for individuals starting with automation': 'basic',
  'basic plan for small shops and medium businesses to expand customer outreach': 'basic',

  // Pro
  'gói professional dành cho doanh nghiệp vừa cần quản lý đa kênh chuyên nghiệp': 'pro',
  'cho doanh nghiệp đang tăng trưởng': 'pro',
  'for growing businesses': 'pro',
  'professional plan for medium businesses needing professional omnichannel management': 'pro',

  // Team
  'cho đội nhóm cần mở rộng vận hành': 'team',
  'for teams scaling operations': 'team',

  // Enterprise
  'gói enterprise không giới hạn dành cho tổ chức lớn với nhu cầu cao cấp': 'enterprise',
  'cho doanh nghiệp cần cấu hình linh hoạt': 'enterprise',
  'for businesses that need flexible configuration': 'enterprise',
  'unlimited enterprise plan for large organizations with advanced needs': 'enterprise',

  // Custom
  'tự chọn số tin zalo, email, ai, tài khoản… và thanh toán ngay': 'custom',
  'tự chọn số tin zalo, email, ai, tài khoản... và thanh toán ngay': 'custom',
  'pick zalo, email, ai, accounts… and pay instantly': 'custom',
  'pick zalo, email, ai, accounts... and pay instantly': 'custom',
};

const KNOWN_FEATURE_KEYS = {
  'ai viết content nâng cao': 'advancedAiWriting',
  'advanced ai content writing': 'advancedAiWriting',
  'hỗ trợ ưu tiên 24/7': 'prioritySupport247',
  'priority 24/7 support': 'prioritySupport247',
  'hỗ trợ 24/7': 'support247',
  '24/7 support': 'support247',
  'hỗ trợ qua email': 'emailSupport',
  'email support': 'emailSupport',
  multi_language: 'multiLanguage',
  'đa ngôn ngữ': 'multiLanguage',
  'multiple languages': 'multiLanguage',
  'không giới hạn': 'unlimited',
  unlimited: 'unlimited',
  'không hỗ trợ': 'notSupported',
  'not supported': 'notSupported',
  'nhắn tin zalo oa không giới hạn': 'unlimitedZaloMessages',
  'nhắn tin zalo không giới hạn': 'unlimitedZaloMessages',
  'unlimited zalo oa messages': 'unlimitedZaloMessages',
  'không giới hạn tin zalo': 'unlimitedZalo',
  'unlimited zalo messages': 'unlimitedZalo',
  'gửi email không giới hạn': 'unlimitedEmailSending',
  'unlimited email sending': 'unlimitedEmailSending',
  'không giới hạn email': 'unlimitedEmail',
  'unlimited emails': 'unlimitedEmail',
  'không giới hạn chiến dịch': 'unlimitedCampaigns',
  'unlimited campaigns': 'unlimitedCampaigns',
  'không giới hạn landing pages': 'unlimitedLandingPages',
  'không giới hạn landing page': 'unlimitedLandingPages',
  'unlimited landing pages': 'unlimitedLandingPages',
  'unlimited landing page': 'unlimitedLandingPages',
  'không giới hạn tài khoản': 'unlimitedAccounts',
  'unlimited accounts': 'unlimitedAccounts',
  'tạo chiến dịch zalo & email': 'zaloEmailCampaigns',
  'tạo chiến dịch zalo va email': 'zaloEmailCampaigns',
  'zalo & email campaigns': 'zaloEmailCampaigns',
  'hỗ trợ qua chat': 'chatSupport',
  'chat support': 'chatSupport',
  'báo cáo chi tiết': 'detailedReports',
  'detailed reports': 'detailedReports',
  'tự động hoá zalo': 'zaloAutomation',
  'tự động hóa zalo': 'zaloAutomation',
  'zalo automation': 'zaloAutomation',
  'api truy cập': 'apiAccess',
  'api access': 'apiAccess',
  'ưu tiên hỗ trợ': 'prioritySupport',
  'hỗ trợ ưu tiên': 'prioritySupport',
  'priority support': 'prioritySupport',
  'nhãn trắng (white-label)': 'whiteLabel',
  'nhãn trắng': 'whiteLabel',
  'white-label': 'whiteLabel',
  'hỗ trợ chuyên biệt': 'dedicatedSupport',
  'dedicated support': 'dedicatedSupport',
  'cam kết uptime 99.9%': 'slaUptime',
  'sla 99.9%': 'slaUptime',
  'sla 99.9% uptime': 'slaUptime',
  'tích hợp tùy chỉnh': 'customIntegrations',
  'tích hợp tuỳ chỉnh': 'customIntegrations',
  'custom integrations': 'customIntegrations',

  // Enterprise & Pro features (User reported)
  'không giới hạn tin nhắn zalo/tháng': 'unlimitedZaloPerMonth',
  'không giới hạn tin nhắn zalo / tháng': 'unlimitedZaloPerMonth',
  'không giới hạn tin zalo/tháng': 'unlimitedZaloPerMonth',
  'không giới hạn tin zalo / tháng': 'unlimitedZaloPerMonth',
  'unlimited zalo messages/month': 'unlimitedZaloPerMonth',
  'unlimited zalo messages / month': 'unlimitedZaloPerMonth',

  'không giới hạn tin nhắn email/tháng': 'unlimitedEmailPerMonth',
  'không giới hạn tin nhắn email / tháng': 'unlimitedEmailPerMonth',
  'không giới hạn email/tháng': 'unlimitedEmailPerMonth',
  'không giới hạn email / tháng': 'unlimitedEmailPerMonth',
  'unlimited emails/month': 'unlimitedEmailPerMonth',
  'unlimited emails / month': 'unlimitedEmailPerMonth',
  'unlimited email messages/month': 'unlimitedEmailPerMonth',

  'không giới hạn tài khoản email': 'unlimitedEmailAccounts',
  'unlimited email accounts': 'unlimitedEmailAccounts',
  'unlimited email account(s)': 'unlimitedEmailAccounts',

  'không giới hạn tài khoản zalo': 'unlimitedZaloAccounts',
  'không giới hạn tài khoản zalo oa': 'unlimitedZaloAccounts',
  'unlimited zalo accounts': 'unlimitedZaloAccounts',
  'unlimited zalo oa accounts': 'unlimitedZaloAccounts',

  'không giới hạn mẫu template tin nhắn': 'unlimitedMessageTemplates',
  'không giới hạn mẫu template tin nhắn zalo': 'unlimitedMessageTemplates',
  'unlimited message templates': 'unlimitedMessageTemplates',
  'unlimited messaging templates': 'unlimitedMessageTemplates',

  'không giới hạn mẫu template email': 'unlimitedEmailTemplates',
  'unlimited email templates': 'unlimitedEmailTemplates',

  'không giới hạn nhân viên': 'unlimitedStaff',
  'unlimited staff': 'unlimitedStaff',
  'unlimited employees': 'unlimitedStaff',
  'unlimited users': 'unlimitedStaff',

  'không giới hạn lưu trữ': 'unlimitedStorage',
  'unlimited storage': 'unlimitedStorage',

  'không giới hạn credits ai': 'unlimitedAiCredits',
  'không giới hạn credit ai': 'unlimitedAiCredits',
  'không giới hạn ai credits': 'unlimitedAiCredits',
  'unlimited ai credits': 'unlimitedAiCredits',

  'xuất hóa đơn vat': 'vatInvoiceExport',
  'xuat hoa don vat': 'vatInvoiceExport',
  'vat invoice export': 'vatInvoiceExport',

  'video hướng dẫn sử dụng': 'videoTutorials',
  'video tutorials': 'videoTutorials',

  'hỗ trợ kỹ thuật qua zalo/email': 'technicalSupportZaloEmail',
  'hỗ trợ kỹ thuật qua zalo / email': 'technicalSupportZaloEmail',
  'technical support via zalo/email': 'technicalSupportZaloEmail',
  'technical support via zalo / email': 'technicalSupportZaloEmail',
  'zalo/email technical support': 'technicalSupportZaloEmail',
  'zalo/email support': 'technicalSupportZaloEmail',

  'tư vấn online 1:1 khi mua gói năm': 'consultationAnnualPlan',
  '1:1 online consultation with annual plan purchase': 'consultationAnnualPlan',
  '1:1 online consultation for annual plan purchase': 'consultationAnnualPlan',

  'tư vấn chiến lược ai automation trực tiếp tại doanh nghiệp khi mua gói năm': 'onsiteAiConsultingAnnualPlan',
  'on-site ai automation strategy consulting for annual plans': 'onsiteAiConsultingAnnualPlan',
};

const FEATURE_REGEX_TEMPLATES = [
  // Email per month
  { re: /^([\d.,]+)\s*emails?\s*\/\s*tháng$/i, key: 'emailPerMonth' },
  { re: /^([\d.,]+)\s*emails?\s*\/\s*month$/i, key: 'emailPerMonth' },
  { re: /^([\d.,]+)\s*email\s*messages?$/i, key: 'emailPerMonth' },

  // Zalo per month
  { re: /^([\d.,]+)\s*(?:tin(?:\s*nhắn)?\s*)?zalo\s*\/\s*tháng$/i, key: 'zaloPerMonth' },
  { re: /^([\d.,]+)\s*zalo\s*messages?\s*\/\s*month$/i, key: 'zaloPerMonth' },
  { re: /^([\d.,]+)\s*(?:tin\s*nhắn\s*)?zalo$/i, key: 'zaloPerMonth' },
  { re: /^([\d.,]+)\s*zalo\s*messages?$/i, key: 'zaloPerMonth' },

  // Members / users / staff
  { re: /^([\d.,]+)\s*thành viên(?:\s*tham gia)?$/i, key: 'members' },
  { re: /^([\d.,]+)\s*nhân viên(?:\s*tham gia)?$/i, key: 'members' },
  { re: /^([\d.,]+)\s*(?:members?|users?|staff|employees?)$/i, key: 'members' },

  // Campaigns
  { re: /^([\d.,]+)\s*chiến dịch(?:\s*gửi\s*tin)?$/i, key: 'campaigns' },
  { re: /^([\d.,]+)\s*(?:messaging\s*)?campaigns?$/i, key: 'campaigns' },

  // Landing pages
  { re: /^([\d.,]+)\s*landing pages?$/i, key: 'landingPages' },

  // Zalo OA accounts
  { re: /^([\d.,]+)\s*tài khoản\s*zalo(?:\s*oa)?$/i, key: 'zaloAccounts' },
  { re: /^([\d.,]+)\s*zalo(?:\s*oa)?\s*accounts?$/i, key: 'zaloAccounts' },

  // Email accounts
  { re: /^([\d.,]+)\s*tài khoản\s*email$/i, key: 'emailAccounts' },
  { re: /^([\d.,]+)\s*email\s*accounts?(?:\(s\))?$/i, key: 'emailAccounts' },

  // Message templates
  { re: /^([\d.,]+)\s*mẫu\s*template\s*tin\s*nhắn(?:\s*zalo)?$/i, key: 'messageTemplates' },
  { re: /^([\d.,]+)\s*(?:messaging|message)\s*templates?$/i, key: 'messageTemplates' },
  { re: /^([\d.,]+)\s*templates$/i, key: 'messageTemplates' },

  // Email templates
  { re: /^([\d.,]+)\s*mẫu\s*template\s*email$/i, key: 'emailTemplates' },
  { re: /^([\d.,]+)\s*email\s*templates?$/i, key: 'emailTemplates' },

  // AI Credits
  { re: /^([\d.,]+)\s*credits?\s*ai$/i, key: 'aiCredits' },
  { re: /^([\d.,]+)\s*ai\s*credits?$/i, key: 'aiCredits' },

  // Storage
  { re: /^([\d.,]+)\s*(?:gb|mb)\s*(?:lưu\s*trữ|data\s*storage|storage)$/i, key: 'storage' },
];

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFC')
    .trim();

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

export const getTranslatedPlanDescription = (plan, t, locale = '') => {
  // 1. If description is an object or JSON string with bilingual keys { vi, en }
  if (typeof plan?.description === 'object' && plan.description !== null) {
    return (locale && plan.description[locale]) || plan.description.vi || plan.description.en || '';
  }
  if (typeof plan?.description === 'string' && plan.description.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(plan.description);
      if (parsed && typeof parsed === 'object') {
        return (locale && parsed[locale]) || parsed.vi || parsed.en || plan.description;
      }
    } catch {
      // not JSON, continue
    }
  }

  // 2. Empty description fallback
  const rawDesc = String(plan?.description || '').trim();
  if (!rawDesc) {
    const key = getPlanTranslationKey(plan);
    const translated = key ? t(`pricing.planDescriptions.${key}`) : '';
    return translated && translated !== `pricing.planDescriptions.${key}` ? translated : '';
  }

  // 3. Match known default system descriptions
  const clean = normalizeText(rawDesc)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/, '')
    .trim();

  let matchedKey = KNOWN_PLAN_DESCRIPTIONS[clean];
  if (!matchedKey) {
    if (clean.includes('cá nhân và freelancer')) matchedKey = 'starter';
    else if (clean.includes('14 ngày') && (clean.includes('thẻ tín dụng') || clean.includes('dùng thử') || clean.includes('trải nghiệm'))) matchedKey = 'trial';
    else if (clean.includes('shop nhỏ và doanh nghiệp') || clean.includes('bắt đầu tự động hóa')) matchedKey = 'basic';
    else if (clean.includes('quản lý đa kênh') || clean.includes('doanh nghiệp vừa')) matchedKey = 'pro';
    else if (clean.includes('tổ chức lớn với nhu cầu cao cấp') || clean.includes('enterprise không giới hạn')) matchedKey = 'enterprise';
    else if (clean.includes('pick zalo') || clean.includes('tự chọn số tin zalo')) matchedKey = 'custom';
  }

  if (matchedKey) {
    const translated = t(`pricing.planDescriptions.${matchedKey}`);
    if (translated && translated !== `pricing.planDescriptions.${matchedKey}`) {
      return translated;
    }
  }

  // 4. Custom admin-entered description remains intact
  return plan.description;
};

export const getTranslatedFeature = (feature, t, locale = '') => {
  // If feature is a JSON string { en, vi }
  if (typeof feature === 'string' && feature.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(feature);
      if (parsed && typeof parsed === 'object') {
        if (locale && parsed[locale]) return parsed[locale];
        return getTranslatedFeature(parsed.vi || parsed.en || '', t, locale);
      }
    } catch {
      // not JSON, continue
    }
  }

  const text = String(feature || '').trim();
  const normalized = normalizeText(text);

  for (const { re, key } of FEATURE_REGEX_TEMPLATES) {
    const m = text.match(re);
    if (m) return t(`pricing.featureTemplates.${key}`, { n: m[1] });
  }

  const key = KNOWN_FEATURE_KEYS[normalized];
  return key ? t(`pricing.features.${key}`) : text;
};
