import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAcquireWalletLock = jest.fn();
const mockInsertTopupDebit = jest.fn();
const mockGetWalletBalance = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  acquireWalletLock: mockAcquireWalletLock,
  insertTopupDebit: mockInsertTopupDebit,
  getWalletBalance: mockGetWalletBalance,
  sumWalletGrants: jest.fn(),
  sumWalletDebits: jest.fn(),
}));

const { maybeDebitWalletForSend } = await import('../topupWallet.service.js');

describe('topupWallet.service', () => {
  const client = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquireWalletLock.mockResolvedValue(undefined);
    mockInsertTopupDebit.mockResolvedValue({ id: 1 });
  });

  it('không trừ khi còn trong hạn mức gói', async () => {
    const result = await maybeDebitWalletForSend(client, {
      billingUserId: 1,
      itemKey: 'emails',
      sourceKey: 'email_message:9',
      planLimit: 2000,
      usageCountAfterSend: 1500,
    });
    expect(result).toEqual({ debited: false, reason: 'within_plan' });
    expect(mockInsertTopupDebit).not.toHaveBeenCalled();
  });

  it('trừ khi vượt hạn mức gói', async () => {
    const result = await maybeDebitWalletForSend(client, {
      billingUserId: 1,
      itemKey: 'emails',
      sourceKey: 'email_message:9',
      planLimit: 2000,
      usageCountAfterSend: 2001,
    });
    expect(result.debited).toBe(true);
    expect(mockInsertTopupDebit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: 'email_message:9', itemKey: 'emails' }),
      client,
    );
  });

  it('không trừ khi gói unlimited', async () => {
    const result = await maybeDebitWalletForSend(client, {
      billingUserId: 1,
      itemKey: 'zalo_messages',
      sourceKey: 'zalo_message:1',
      planLimit: null,
      usageCountAfterSend: 99999,
    });
    expect(result.reason).toBe('unlimited_plan');
  });

  it('trừ ví inbox zpm khi vượt hạn mức gói', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('monthly_zalo_limit')) {
          return { rows: [{ monthly_zalo_limit: 10 }] };
        }
        if (String(sql).includes('effective_plan_id') || String(sql).includes('active_plan_id')) {
          return {
            rows: [{
              active_plan_id: 'pro',
              effective_plan_id: 'pro',
              plan_activated_at: new Date('2026-01-01T00:00:00Z'),
              subscription_expires_at: new Date('2099-01-01T00:00:00Z'),
              duration_days: 30,
            }],
          };
        }
        if (String(sql).includes('COUNT(*)')) {
          return { rows: [{ total: 11 }] };
        }
        return { rows: [] };
      }),
    };
    const { debitZaloPersonalInboxIfNeeded } = await import('../topupWallet.service.js');
    const result = await debitZaloPersonalInboxIfNeeded(client, {
      billingUserId: 7,
      messageId: 42,
    });
    expect(result.debited).toBe(true);
    expect(mockInsertTopupDebit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: 'zpm:42', itemKey: 'zalo_messages' }),
      client,
    );
  });
});
