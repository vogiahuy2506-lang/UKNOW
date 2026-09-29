import { jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { updatePlan } = await import('../adminPlans.repository.js');

function payload(overrides = {}) {
  return {
    name: 'Starter',
    price: 199000,
    priceYearly: null,
    description: '',
    features: [],
    maxEmployees: 1,
    isActive: true,
    durationDays: 30,
    dailyEmailLimit: null,
    monthlyEmailLimit: null,
    dailyZaloLimit: null,
    monthlyZaloLimit: null,
    messagesPerPeriod: null,
    isFupEnabled: false,
    maxLandingPages: null,
    maxCampaigns: null,
    maxZaloCampaigns: null,
    maxZaloGroupCampaigns: null,
    maxEmailCampaigns: null,
    maxZaloAccounts: null,
    maxEmailAccounts: null,
    maxEmailTemplates: null,
    maxZaloTemplates: null,
    maxChatbots: null,
    aiTokensPerPeriod: null,
    aiCreditsPerPeriod: null,
    aiModel: null,
    gracePeriodDays: 0,
    storageLimitBytes: null,
    ...overrides,
  };
}

describe('adminPlans.repository.updatePlan — code backfill (PR-B)', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('SET clause only backfills code when currently NULL, never overwrites an existing code', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5, code: 'starter' }] });

    await updatePlan(5, payload({ code: 'attempted-override' }));

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/code\s*=\s*COALESCE\(code,\s*NULLIF\(\$33,\s*''\)\)/);
    expect(params[params.length - 1]).toBe('attempted-override');
    expect(params[params.length - 2]).toBe(5); // id still bound to $32
  });

  it('passes empty string through as NULLIF input when code is omitted, leaving an existing code untouched', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5, code: 'starter' }] });

    await updatePlan(5, payload({ code: undefined }));

    const [, params] = query.mock.calls[0];
    expect(params[params.length - 1]).toBe('');
  });
});

describe('adminPlans.repository.updatePlan — W5 hạn mức tài khoản WhatsApp/Telegram', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('ghi max_whatsapp_accounts=$30 / max_telegram_accounts=$31 đúng vị trí tham số; thiếu -> NULL (không giới hạn)', async () => {
    query.mockResolvedValue({ rows: [{ id: 5 }] });

    await updatePlan(5, payload({ maxWhatsappAccounts: 2, maxTelegramAccounts: 0 }));
    let [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/max_whatsapp_accounts = \$30, max_telegram_accounts = \$31/);
    expect(params[29]).toBe(2);
    expect(params[30]).toBe(0);

    query.mockClear();
    await updatePlan(5, payload());
    [sql, params] = query.mock.calls[0];
    expect(params[29]).toBeNull();
    expect(params[30]).toBeNull();
  });
});
