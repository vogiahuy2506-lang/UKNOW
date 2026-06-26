import { normalizeMoneyValue } from './planUtils.jsx';

// eslint-disable-next-line react-refresh/only-export-components
export const PLAN_PRESETS = [
  {
    code: 'trial',
    name: 'Gói Dùng thử',
    price: 0,
    priceYearly: '',
    durationDays: 10,
    maxEmployees: 1,
    dailyEmailLimit: -1,
    monthlyEmailLimit: -1,
    dailyZaloLimit: '',
    monthlyZaloLimit: 100,
    messagesPerPeriod: 100,
    isFupEnabled: false,
    maxLandingPages: 5,
    maxCampaigns: '',
    maxZaloCampaigns: 5,
    maxZaloGroupCampaigns: 5,
    maxEmailCampaigns: -1,
    maxZaloAccounts: 1,
    maxEmailAccounts: -1,
    maxEmailTemplates: '',
    maxZaloTemplates: '',
    maxChatbots: 1,
    aiCreditsPerPeriod: 50,
    aiTokensPerPeriod: 50000,
  },
  {
    code: 'basic',
    name: 'Gói Basic',
    price: 199000,
    priceYearly: 1990000,
    durationDays: 30,
    maxEmployees: 1,
    dailyEmailLimit: -1,
    monthlyEmailLimit: -1,
    dailyZaloLimit: '',
    monthlyZaloLimit: 100,
    messagesPerPeriod: 100,
    isFupEnabled: false,
    maxLandingPages: 5,
    maxCampaigns: '',
    maxZaloCampaigns: 5,
    maxZaloGroupCampaigns: 5,
    maxEmailCampaigns: -1,
    maxZaloAccounts: 1,
    maxEmailAccounts: -1,
    maxEmailTemplates: '',
    maxZaloTemplates: '',
    maxChatbots: 1,
    aiCreditsPerPeriod: 3000,
    aiTokensPerPeriod: 3000000,
  },
  {
    code: 'pro',
    name: 'Gói Pro',
    price: 499000,
    priceYearly: 4990000,
    durationDays: 30,
    maxEmployees: 1,
    dailyEmailLimit: '',
    monthlyEmailLimit: 500,
    dailyZaloLimit: '',
    monthlyZaloLimit: 2000,
    messagesPerPeriod: 2500,
    isFupEnabled: false,
    maxLandingPages: 15,
    maxCampaigns: '',
    maxZaloCampaigns: 30,
    maxZaloGroupCampaigns: 30,
    maxEmailCampaigns: 30,
    maxZaloAccounts: 5,
    maxEmailAccounts: 5,
    maxEmailTemplates: '',
    maxZaloTemplates: '',
    maxChatbots: 5,
    aiCreditsPerPeriod: '',
    aiTokensPerPeriod: '',
  },
  {
    code: 'team',
    name: 'Gói Team',
    price: 999000,
    priceYearly: 9990000,
    durationDays: 30,
    maxEmployees: -1,
    dailyEmailLimit: '',
    monthlyEmailLimit: 30000,
    dailyZaloLimit: '',
    monthlyZaloLimit: '',
    messagesPerPeriod: '',
    isFupEnabled: false,
    maxLandingPages: '',
    maxCampaigns: '',
    maxZaloCampaigns: '',
    maxZaloGroupCampaigns: '',
    maxEmailCampaigns: '',
    maxZaloAccounts: '',
    maxEmailAccounts: '',
    maxEmailTemplates: '',
    maxZaloTemplates: '',
    maxChatbots: '',
    aiCreditsPerPeriod: '',
    aiTokensPerPeriod: '',
  },
  {
    code: 'custom',
    name: 'Gói Tùy chọn',
    price: 0,
    priceYearly: '',
    durationDays: 30,
    maxEmployees: -1,
    dailyEmailLimit: '',
    monthlyEmailLimit: '',
    dailyZaloLimit: '',
    monthlyZaloLimit: '',
    messagesPerPeriod: '',
    isFupEnabled: false,
    maxLandingPages: '',
    maxCampaigns: '',
    maxZaloCampaigns: '',
    maxZaloGroupCampaigns: '',
    maxEmailCampaigns: '',
    maxZaloAccounts: '',
    maxEmailAccounts: '',
    maxEmailTemplates: '',
    maxZaloTemplates: '',
    maxChatbots: '',
    aiCreditsPerPeriod: '',
    aiTokensPerPeriod: '',
  },
];

export const Field = ({ label, children, note, className = '' }) => (
  <div className={className}>
    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
    {children}
    {note && <p className="mt-1.5 text-xs text-slate-400">{note}</p>}
  </div>
);

export const FormSection = ({ kicker, title, description, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-5">
      {kicker && <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-600">{kicker}</p>}
      <h3 className="mt-1 text-base font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
);

// eslint-disable-next-line react-refresh/only-export-components
export const normalizePlanPayload = (form) => {
  const price = normalizeMoneyValue(form.price);
  const priceYearly = normalizeMoneyValue(form.priceYearly);
  return {
    ...form,
    price: price === '' ? 0 : price,
    priceYearly: priceYearly && priceYearly > 0 ? priceYearly : '',
  };
};

export const ModalShell = ({ title, subtitle, children, footer, onSubmit }) => (
  <form onSubmit={onSubmit} className="flex max-h-[92vh] flex-col">
    <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
      <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-5">
      <div className="space-y-5">{children}</div>
    </div>
    <div className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
      {footer}
    </div>
  </form>
);
