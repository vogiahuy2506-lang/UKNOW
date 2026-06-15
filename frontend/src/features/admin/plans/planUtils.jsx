import { createPortal } from 'react-dom';

// ── Plan translation helpers (shared with admin cards) ──────────────────────

const normalizeText = (s) => String(s || '').toLowerCase().normalize('NFC').trim();

const PLAN_ALIASES = { professional: 'pro' };

export const getPlanTranslationKey = (plan) => {
  const code = normalizeText(plan?.code);
  if (code) return PLAN_ALIASES[code] || code;
  const name = normalizeText(plan?.name).replace(/^gói\s+/, '').replace(/\s+plan$/, '');
  const resolved = PLAN_ALIASES[name] || name;
  if (['starter', 'trial', 'basic', 'pro', 'team', 'business', 'enterprise', 'custom'].includes(resolved)) return resolved;
  if (name.includes('tùy chọn') || name.includes('tuỳ chọn')) return 'custom';
  return '';
};

export const getTranslatedPlanDescription = (plan, t) => {
  const key = getPlanTranslationKey(plan);
  const translated = key ? t(`pricing.planDescriptions.${key}`) : '';
  return translated && translated !== `pricing.planDescriptions.${key}` ? translated : plan.description;
};

export const getTranslatedFeature = (feature, t) => {
  const text = String(feature || '').trim();
  const normalized = normalizeText(text);

  const emailMonthVi = text.match(/^([\d.,]+)\s*emails?\s*\/\s*tháng$/i);
  if (emailMonthVi) return t('pricing.featureTemplates.emailPerMonth', { n: emailMonthVi[1] });
  const emailMonthEn = text.match(/^([\d.,]+)\s*emails?\s*\/\s*month$/i);
  if (emailMonthEn) return t('pricing.featureTemplates.emailPerMonth', { n: emailMonthEn[1] });

  const zaloMonth = text.match(/^([\d.,]+)\s*(?:tin(?:\s*nhắn)?\s*)?zalo\s*\/\s*tháng$/i);
  if (zaloMonth) return t('pricing.featureTemplates.zaloPerMonth', { n: zaloMonth[1] });

  const members = text.match(/^([\d.,]+)\s*thành viên(?:\s*tham gia)?$/i);
  if (members) return t('pricing.featureTemplates.members', { n: members[1] });

  const campaigns = text.match(/^([\d.,]+)\s*chiến dịch$/i);
  if (campaigns) return t('pricing.featureTemplates.campaigns', { n: campaigns[1] });

  const landingPages = text.match(/^([\d.,]+)\s*landing pages?$/i);
  if (landingPages) return t('pricing.featureTemplates.landingPages', { n: landingPages[1] });

  const zaloAccounts = text.match(/^([\d.,]+)\s*tài khoản\s*zalo(?:\s*oa)?$/i);
  if (zaloAccounts) return t('pricing.featureTemplates.zaloAccounts', { n: zaloAccounts[1] });

  const emailAccounts = text.match(/^([\d.,]+)\s*tài khoản\s*email$/i);
  if (emailAccounts) return t('pricing.featureTemplates.emailAccounts', { n: emailAccounts[1] });

  const knownFeatureKeys = {
    'ai viết content nâng cao': 'advancedAiWriting',
    'hỗ trợ ưu tiên 24/7': 'prioritySupport247',
    'hỗ trợ 24/7': 'support247',
    'hỗ trợ qua email': 'emailSupport',
    'multi_language': 'multiLanguage',
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
    'nhãn trắng (white-label)': 'whiteLabel',
    'nhãn trắng': 'whiteLabel',
    'white-label': 'whiteLabel',
    'hỗ trợ chuyên biệt': 'dedicatedSupport',
    'cam kết uptime 99.9%': 'slaUptime',
    'sla 99.9%': 'slaUptime',
    'tích hợp tùy chỉnh': 'customIntegrations',
    'tích hợp tuỳ chỉnh': 'customIntegrations',
  };

  const key = knownFeatureKeys[normalized];
  return key ? t(`pricing.features.${key}`) : text;
};

// ── Format helpers ──────────────────────────────────────────────────────────

export const fmtVnd   = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
export const fmtEmp   = (n, t) => n === -1 ? t('planInputs.noLimit') : `${n} ${t('plans.employees')}`;
export const fmtLimit = (v) => {
  if (v == null || v === '') return '∞';
  if (Number(v) === -1) return 'N/A';
  return Number(v).toLocaleString('vi-VN');
};
export const fmtPeriodMessages = (v) => {
  if (v == null || v === '') return '∞';
  return Number(v).toLocaleString('vi-VN');
};

export const normalizeMoneyValue = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';

  const raw = String(value).trim();
  if (!raw) return '';

  const compact = raw.replace(/[^\d.,-]/g, '');
  if (!compact || compact === '-') return '';

  const hasDot = compact.includes('.');
  const hasComma = compact.includes(',');

  if (hasDot && hasComma) {
    const lastDot = compact.lastIndexOf('.');
    const lastComma = compact.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const groupSep = decimalSep === '.' ? ',' : '.';
    const [whole, decimal = ''] = compact.split(decimalSep);
    const normalized = `${whole.replaceAll(groupSep, '')}.${decimal}`;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : '';
  }

  if (hasDot) {
    const parts = compact.split('.');
    const isGrouped = parts.length > 1
      && parts[0].length >= 1
      && parts[0].length <= 3
      && parts.slice(1).every((part) => part.length === 3);
    const parsed = Number(isGrouped ? parts.join('') : compact);
    return Number.isFinite(parsed) ? Math.round(parsed) : '';
  }

  if (hasComma) {
    const parts = compact.split(',');
    const isGrouped = parts.length > 1
      && parts[0].length >= 1
      && parts[0].length <= 3
      && parts.slice(1).every((part) => part.length === 3);
    const parsed = Number(isGrouped ? parts.join('') : compact.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed) : '';
  }

  const parsed = Number(compact);
  return Number.isFinite(parsed) ? Math.round(parsed) : '';
};

export const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
export const MODAL_PANEL   = 'relative z-10 w-full max-w-lg max-h-[90vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
export const MODAL_SM      = 'relative z-10 w-full max-w-md  max-h-[90vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
export const MODAL_FORM    = 'relative z-10 w-full max-w-5xl max-h-[92vh] rounded-2xl bg-white shadow-2xl overflow-hidden';

export const renderModal = (content, onClose, cls = MODAL_PANEL) =>
  createPortal(
    <div className={MODAL_OVERLAY}>
      <div
        role="presentation"
        aria-hidden
        className="absolute inset-0 z-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className={cls}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>,
    document.body
  );

export const emptyForm = () => ({
  code: '', name: '', price: 0, priceYearly: '', description: '',
  maxEmployees: -1, isActive: true, features: [],
  durationDays: '',
  dailyEmailLimit: '', monthlyEmailLimit: '',
  dailyZaloLimit: '',  monthlyZaloLimit: '',
  messagesPerPeriod: '', isFupEnabled: false,
  maxLandingPages: '', maxCampaigns: '',
  maxZaloCampaigns: '', maxZaloGroupCampaigns: '', maxEmailCampaigns: '',
  maxZaloAccounts: '', maxEmailAccounts: '',
  maxEmailTemplates: '', maxZaloTemplates: '',
  maxChatbots: '', aiTokensPerPeriod: '',
});
