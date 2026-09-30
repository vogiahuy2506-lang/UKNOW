/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — `debitAdapterMessageIfNeeded`: trừ ví `<kênh>_messages` cho một tin chiến dịch
 * Telegram/WhatsApp đã gửi (đường legacy). Chỉ trừ khi VƯỢT hạn mức gói của CHÍNH kênh (cột monthly_<kênh>_limit),
 * idempotent theo `ccm:<id>`, không bao giờ ném lỗi ra ngoài.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockGetClient = jest.fn();
const mockAcquireLock = jest.fn();
const mockInsertDebit = jest.fn();
const mockGetCycle = jest.fn();
const mockCountChannel = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: mockGetClient, query: jest.fn() },
}));
jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  acquireWalletLock: mockAcquireLock,
  getWalletBalance: jest.fn(),
  insertTopupDebit: mockInsertDebit,
  sumWalletGrants: jest.fn(),
  sumWalletDebits: jest.fn(),
}));
jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  EFFECTIVE_PLAN_ID_SQL: 'u.active_plan_id',
  getBillingCycle: mockGetCycle,
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  countChannelSentInCycle: mockCountChannel,
  _clearQuotaCache: jest.fn(),
}));

const { debitAdapterMessageIfNeeded } = await import('../topupWallet.service.js');

const CYCLE = { hasPlan: true, cycleStart: new Date('2025-12-31T17:00:00.000Z'), cycleEnd: new Date('2026-01-31T17:00:00.000Z') };

function setPlanLimit(limit) {
  mockClientQuery.mockImplementation(async (sql) => {
    const text = String(sql);
    if (/JOIN plans p/.test(text)) return { rows: [{ plan_limit: limit }] };
    return { rows: [] }; // BEGIN / COMMIT / ROLLBACK
  });
}

describe('debitAdapterMessageIfNeeded (P10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
    mockGetCycle.mockResolvedValue(CYCLE);
    mockInsertDebit.mockResolvedValue({ id: 1 });
    setPlanLimit(100);
  });

  it.each([
    ['telegram', 'telegram_messages', 'monthly_telegram_limit'],
    ['whatsapp', 'whatsapp_messages', 'monthly_whatsapp_limit'],
  ])('%s: vượt hạn mức gói → ghi debit ví %s với source ccm:<id>; đọc đúng cột %s', async (channel, item, column) => {
    mockCountChannel.mockResolvedValue(101);
    const result = await debitAdapterMessageIfNeeded({ billingUserId: 10, channel, messageId: 501 });
    expect(result).toMatchObject({ debited: true });
    const planSql = mockClientQuery.mock.calls.map((c) => String(c[0])).find((s) => /JOIN plans p/.test(s));
    expect(planSql).toContain(`p.${column} AS plan_limit`);
    expect(mockCountChannel).toHaveBeenCalledWith(10, channel, CYCLE.cycleStart, CYCLE.cycleEnd, expect.anything(), { cache: false });
    expect(mockInsertDebit).toHaveBeenCalledWith({ userId: 10, itemKey: item, qty: 1, sourceKey: 'ccm:501' }, expect.anything());
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('còn trong hạn mức gói → không trừ ví', async () => {
    mockCountChannel.mockResolvedValue(100);
    const result = await debitAdapterMessageIfNeeded({ billingUserId: 10, channel: 'telegram', messageId: 1 });
    expect(result).toMatchObject({ debited: false, reason: 'within_plan' });
    expect(mockInsertDebit).not.toHaveBeenCalled();
  });

  it('gói không giới hạn (NULL) → không đụng ví', async () => {
    setPlanLimit(null);
    mockCountChannel.mockResolvedValue(9999);
    const result = await debitAdapterMessageIfNeeded({ billingUserId: 10, channel: 'whatsapp', messageId: 1 });
    expect(result).toMatchObject({ debited: false, reason: 'unlimited_plan' });
    expect(mockInsertDebit).not.toHaveBeenCalled();
  });

  it('kênh không phải adapter / thiếu tham số → bỏ qua, không mở kết nối', async () => {
    expect(await debitAdapterMessageIfNeeded({ billingUserId: 10, channel: 'zalo', messageId: 1 })).toMatchObject({ reason: 'missing_args' });
    expect(await debitAdapterMessageIfNeeded({ billingUserId: 10, channel: 'telegram', messageId: null })).toMatchObject({ reason: 'missing_args' });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('lỗi giữa chừng → ROLLBACK, không ném, trả reason=error và luôn trả kết nối', async () => {
    mockCountChannel.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await debitAdapterMessageIfNeeded({ billingUserId: 10, channel: 'telegram', messageId: 7 });
    expect(result).toEqual({ debited: false, reason: 'error' });
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
