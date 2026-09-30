/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — cổng legacy `checkSendQuota` + `recordDirectSendUsage` cho kênh Telegram/WhatsApp:
 * hạn mức tin/tháng RIÊNG (cột `plans.monthly_<kênh>_limit`), đếm theo chu kỳ GÓI từ `campaign_channel_messages`
 * (loại preview) + `usage_logs` `<kênh>_direct_send`, ví top-up `<kênh>_messages`, KHÔNG mượn cột Zalo, KHÔNG áp trần
 * nhân viên/ngày. Bảng plan giữ 3 giá trị KHÁC NHAU cho zalo/telegram/whatsapp để đọc nhầm cột là đỏ.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const state = {};
const mockQuery = jest.fn();
const mockGetClient = jest.fn();
const mockGetSubscriptionStatus = jest.fn();
const mockResolveBillingUserId = jest.fn();
const mockGetBillingCycle = jest.fn();
const mockGetWalletSnapshot = jest.fn();
const mockMaybeDebit = jest.fn();
const mockTrackUsage = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery, getClient: mockGetClient },
}));
jest.unstable_mockModule('../subscriptionStatus.util.js', () => ({
  getSubscriptionStatus: mockGetSubscriptionStatus,
}));
jest.unstable_mockModule('../billingCycle.util.js', () => ({
  EFFECTIVE_PLAN_ID_SQL: 'u.active_plan_id',
  resolveBillingUserId: mockResolveBillingUserId,
  getBillingCycle: mockGetBillingCycle,
}));
jest.unstable_mockModule('../../services/payment/topupWallet.service.js', () => ({
  hasWalletRemaining: jest.fn(async () => false),
  WALLET_ITEM_BY_CHANNEL: { email: 'emails', zalo: 'zalo_messages' },
  maybeDebitWalletForSend: mockMaybeDebit,
  getWalletSnapshot: mockGetWalletSnapshot,
}));
jest.unstable_mockModule('../../repositories/payment/usageTracking.repository.js', () => ({
  default: { trackUsage: mockTrackUsage },
}));

const { checkSendQuota, recordDirectSendUsage, countAdapterSentInCycleUncached, _clearQuotaCache } =
  await import('../userSendLimit.util.js');

const CYCLE_START = new Date('2025-12-31T17:00:00.000Z');
const CYCLE_END = new Date('2026-01-31T17:00:00.000Z');

const planRow = (overrides = {}) => ({
  daily_email_limit: null,
  monthly_email_limit: null,
  daily_zalo_limit: null,
  monthly_zalo_limit: 5, // KHÁC telegram/whatsapp — đọc nhầm cột Zalo sẽ chặn ngay
  monthly_telegram_limit: 100,
  monthly_whatsapp_limit: 200,
  messages_per_period: null,
  ...overrides,
});

function installRouter() {
  const router = async (sql, params) => {
    const text = String(sql);
    if (/FROM user_members\s+WHERE owner_id/.test(text)) return { rows: state.empRow ? [state.empRow] : [] };
    if (text.includes('JOIN plans p')) return { rows: [state.plan] };
    if (text.includes('FROM email_messages em') && text.includes('campaign_channel_messages')) {
      state.combinedSql = text;
      state.combinedParams = params;
      return { rows: [{ total: state.combinedCount ?? 0 }] };
    }
    if (text.includes('campaign_channel_messages')) {
      state.adapterSql = text;
      state.adapterParams = params;
      state.adapterQueries += 1;
      return { rows: [{ total: state.adapterCount }] };
    }
    if (text.includes('FROM zalo_messages')) {
      state.zaloSql = text;
      state.zaloQueries += 1;
      return { rows: [{ total: state.zaloCount }] };
    }
    return { rows: [{ total: 0 }] };
  };
  mockQuery.mockImplementation(router);
  const client = { query: jest.fn(router), release: jest.fn() };
  mockGetClient.mockResolvedValue(client);
  return client;
}

describe('checkSendQuota — kênh adapter có hạn mức tin/tháng riêng (P10)', () => {
  beforeEach(() => {
    Object.assign(state, {
      plan: planRow(), empRow: null, adapterCount: 0, zaloCount: 0, adapterQueries: 0, zaloQueries: 0,
      adapterSql: '', adapterParams: [], zaloSql: '',
    });
    [mockQuery, mockGetClient, mockGetSubscriptionStatus, mockResolveBillingUserId, mockGetBillingCycle,
      mockGetWalletSnapshot, mockMaybeDebit, mockTrackUsage].forEach((m) => m.mockReset());
    mockGetSubscriptionStatus.mockResolvedValue({ hasPlan: true, isExpired: false });
    mockResolveBillingUserId.mockImplementation(async (userId) => userId);
    mockGetBillingCycle.mockResolvedValue({ hasPlan: true, cycleStart: CYCLE_START, cycleEnd: CYCLE_END, billingUserId: 10 });
    mockGetWalletSnapshot.mockResolvedValue({ remaining: 0 });
    mockTrackUsage.mockResolvedValue({ id: 77 });
    installRouter();
    _clearQuotaCache();
  });

  it.each([
    ['telegram', 100, 'Telegram'],
    ['whatsapp', 200, 'WhatsApp'],
  ])('%s: đọc cột monthly_<kênh>_limit (trần riêng %s, không phải cột Zalo) — 50 tin → cho phép dù đã vượt trần Zalo (5)', async (channel, limit) => {
    state.adapterCount = 50;
    const quota = await checkSendQuota({ userId: 10, channel });
    expect(quota.allowed).toBe(true);
    expect(limit).toBeGreaterThan(50);
    // Đếm đúng kênh + chu kỳ GÓI (không phải tháng lịch) + loại xem thử.
    // $6 = kênh HỘP THƯ (whatsapp → 'whatsapp_baileys') cho vế channel_messages — P11.
    const inboxChannel = channel === 'whatsapp' ? 'whatsapp_baileys' : channel;
    expect(state.adapterParams).toEqual([10, CYCLE_START.toISOString(), CYCLE_END.toISOString(), channel, `${channel}_direct_send`, inboxChannel]);
    expect(state.adapterSql).toContain('channel_messages');
    expect(state.adapterSql).toContain("cm.metadata->>'source' = 'manual_inbox'");
    expect(state.adapterSql).toContain("cm.metadata->'send'->>'status' = 'sent'");
    expect(state.adapterSql).toMatch(/ch\.channel = \$6/);
    expect(state.adapterSql).toMatch(/NOT ccm\.is_preview/);
    expect(state.adapterSql).toMatch(/ccm\.status = 'sent'/);
    expect(state.adapterSql).toMatch(/resource_type = \$5/);
  });

  it.each([
    ['telegram', 100, 'Telegram'],
    ['whatsapp', 200, 'WhatsApp'],
  ])('%s: chạm trần tháng → từ chối limitType=monthly, thông điệp nêu đúng kênh + đơn vị tin, resetAt = hết chu kỳ gói', async (channel, limit, label) => {
    state.adapterCount = limit;
    const quota = await checkSendQuota({ userId: 10, channel });
    expect(quota).toMatchObject({ allowed: false, limitType: 'monthly', limit, currentCount: limit });
    expect(quota.message).toBe(
      `Đã đạt giới hạn gửi ${label} trong tháng (${limit}/${limit} tin). Vui lòng mua thêm hoặc liên hệ admin để nâng gói.`
    );
    expect(quota.resetAt.toISOString()).toBe(CYCLE_END.toISOString());
  });

  it('Zalo KHÔNG còn cộng tin Telegram/WhatsApp: truy vấn đếm Zalo không chạm campaign_channel_messages', async () => {
    state.zaloCount = 3;
    const quota = await checkSendQuota({ userId: 10, channel: 'zalo' });
    expect(quota.allowed).toBe(true); // 3 + 1 <= 5
    expect(state.zaloQueries).toBe(1);
    expect(state.adapterQueries).toBe(0);
    expect(state.zaloSql).not.toMatch(/campaign_channel_messages/);
  });

  it('cột NULL = không giới hạn: cho phép và KHÔNG đếm', async () => {
    state.plan = planRow({ monthly_telegram_limit: null });
    const quota = await checkSendQuota({ userId: 10, channel: 'telegram' });
    expect(quota.allowed).toBe(true);
    expect(state.adapterQueries).toBe(0);
  });

  it('cột = 0: gói không có kênh → disabled, thông điệp nêu kênh', async () => {
    state.plan = planRow({ monthly_whatsapp_limit: 0 });
    const quota = await checkSendQuota({ userId: 10, channel: 'whatsapp' });
    expect(quota).toMatchObject({ allowed: false, limitType: 'disabled', limit: 0 });
    expect(quota.message).toMatch(/gửi WhatsApp không được hỗ trợ/);
    expect(state.adapterQueries).toBe(0);
  });

  it('không mượn trần NGÀY của Zalo: daily_zalo_limit=0 vẫn cho Telegram gửi', async () => {
    state.plan = planRow({ daily_zalo_limit: 0 });
    const quota = await checkSendQuota({ userId: 10, channel: 'telegram' });
    expect(quota.allowed).toBe(true);
  });

  it('hết hạn mức gói nhưng ví telegram_messages còn số dư → vẫn cho gửi; hỏi đúng ví của kênh', async () => {
    state.adapterCount = 100;
    mockGetWalletSnapshot.mockResolvedValue({ remaining: 5 });
    const quota = await checkSendQuota({ userId: 10, channel: 'telegram' });
    expect(quota.allowed).toBe(true);
    expect(mockGetWalletSnapshot).toHaveBeenCalledWith(10, 'telegram_messages', expect.anything());
  });

  it('nhân viên: trần nhân viên của Zalo (daily_zalo_limit=0) KHÔNG chặn Telegram; vẫn chặn Zalo', async () => {
    state.empRow = {
      id: 1, status: 'active', daily_email_limit: null, monthly_email_limit: null,
      daily_zalo_limit: 0, monthly_zalo_limit: null,
    };
    const tg = await checkSendQuota({ userId: 20, ownerContextId: 10, actorUserId: 20, channel: 'telegram' });
    expect(tg.allowed).toBe(true);
    _clearQuotaCache();
    const zalo = await checkSendQuota({ userId: 20, ownerContextId: 10, actorUserId: 20, channel: 'zalo' });
    expect(zalo).toMatchObject({ allowed: false, limitType: 'employee' });
  });

  it('nhân viên bị khoá (inactive) vẫn bị chặn cả ở kênh adapter', async () => {
    state.empRow = { id: 1, status: 'inactive' };
    const tg = await checkSendQuota({ userId: 20, ownerContextId: 10, actorUserId: 20, channel: 'telegram' });
    expect(tg).toMatchObject({ allowed: false, limitType: 'employee_inactive' });
  });

  it('trần TỔNG theo kỳ (messages_per_period) vẫn cộng cả tin Telegram/WhatsApp như trước P10', async () => {
    state.plan = planRow({ messages_per_period: 10, monthly_telegram_limit: null });
    state.combinedCount = 10;
    const quota = await checkSendQuota({ userId: 10, channel: 'telegram' });
    expect(quota).toMatchObject({ allowed: false, limitType: 'period', limit: 10, currentCount: 10 });
    expect(state.combinedParams[3]).toEqual(['telegram', 'whatsapp']);
    expect(state.combinedParams[4]).toEqual(
      expect.arrayContaining(['email_direct_send', 'zalo_direct_send', 'telegram_direct_send', 'whatsapp_direct_send'])
    );
  });

  it('kênh lạ vẫn ném lỗi (không âm thầm tính như Zalo)', async () => {
    await expect(checkSendQuota({ userId: 10, channel: 'viber' })).rejects.toThrow(/kênh không hợp lệ/);
  });
});

describe('countAdapterSentInCycleUncached', () => {
  it('từ chối kênh không phải adapter', async () => {
    await expect(countAdapterSentInCycleUncached(10, 'zalo', CYCLE_START, CYCLE_END)).rejects.toThrow(/không phải kênh adapter/);
  });
});

describe('recordDirectSendUsage — gửi nhanh Telegram/WhatsApp ghi đúng loại + trừ đúng ví (P10)', () => {
  let client;
  beforeEach(() => {
    Object.assign(state, {
      plan: planRow(), empRow: null, adapterCount: 0, zaloCount: 0, adapterQueries: 0, zaloQueries: 0,
      adapterSql: '', adapterParams: [], zaloSql: '',
    });
    [mockQuery, mockGetClient, mockGetSubscriptionStatus, mockResolveBillingUserId, mockGetBillingCycle,
      mockGetWalletSnapshot, mockMaybeDebit, mockTrackUsage].forEach((m) => m.mockReset());
    mockGetBillingCycle.mockResolvedValue({ hasPlan: true, cycleStart: CYCLE_START, cycleEnd: CYCLE_END, billingUserId: 10 });
    mockTrackUsage.mockResolvedValue({ id: 77 });
    mockMaybeDebit.mockResolvedValue({ debited: true });
    client = installRouter();
    _clearQuotaCache();
  });

  it.each([
    ['telegram', 'telegram_direct_send', 'telegram_messages', 100],
    ['whatsapp', 'whatsapp_direct_send', 'whatsapp_messages', 200],
  ])('%s: usage_logs=%s; vượt hạn mức gói → trừ ví %s (planLimit = cột của kênh)', async (channel, resourceType, walletItem, planLimit) => {
    state.adapterCount = planLimit + 1; // sau khi ghi: vượt trần 1 tin
    await recordDirectSendUsage({ billingUserId: 10, channel, amount: 1, actorUserId: 20, source: `${channel}_preview` });
    expect(mockTrackUsage).toHaveBeenCalledWith(10, resourceType, 1, { actorUserId: 20, source: `${channel}_preview` }, client);
    expect(mockMaybeDebit).toHaveBeenCalledWith(client, expect.objectContaining({
      itemKey: walletItem,
      planLimit,
      usageCountAfterSend: planLimit + 1,
      qty: 1,
    }));
  });

  it('trong hạn mức gói → không trừ ví', async () => {
    state.adapterCount = 10;
    await recordDirectSendUsage({ billingUserId: 10, channel: 'telegram', amount: 1 });
    expect(mockMaybeDebit).not.toHaveBeenCalled();
  });

  it('kênh không thuộc bảng hạn mức → bỏ qua (null)', async () => {
    expect(await recordDirectSendUsage({ billingUserId: 10, channel: 'viber' })).toBeNull();
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });
});
