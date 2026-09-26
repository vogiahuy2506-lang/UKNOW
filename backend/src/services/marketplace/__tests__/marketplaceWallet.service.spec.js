import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock database
const mockQuery = jest.fn();
const mockClient = {
  query: mockQuery,
  release: jest.fn(),
};

const mockGetClient = jest.fn().mockResolvedValue(mockClient);
const mockDbQuery = jest.fn().mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    getClient: mockGetClient,
    query: mockDbQuery,
  },
}));

const { default: marketplaceWalletService } = await import('../marketplaceWallet.service.js');

describe('marketplaceWallet.service requestWithdrawal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue(mockClient);
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it('từ chối khi số tiền rút < 50,000 credits', async () => {
    await expect(
      marketplaceWalletService.requestWithdrawal(1, 49999)
    ).rejects.toMatchObject({
      message: expect.stringContaining('50,000 credits'),
      status: 400,
    });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('từ chối khi số tiền rút không hợp lệ', async () => {
    await expect(
      marketplaceWalletService.requestWithdrawal(1, -100)
    ).rejects.toMatchObject({
      message: expect.stringContaining('không hợp lệ'),
      status: 400,
    });
  });

  it('từ chối và ROLLBACK khi số dư khả dụng không đủ', async () => {
    mockClient.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
        return { rows: [{ available_balance: 30000, pending_payout: 0 }] };
      }
      return { rows: [] };
    });

    await expect(
      marketplaceWalletService.requestWithdrawal(1, 50000)
    ).rejects.toMatchObject({
      message: expect.stringContaining('Số dư khả dụng không đủ'),
      status: 400,
    });

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('thành công: khoá FOR UPDATE, tạo lệnh rút, trừ số dư và COMMIT', async () => {
    let forUpdateLocked = false;
    let balanceUpdated = false;

    mockClient.query.mockImplementation(async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
        forUpdateLocked = true;
        return { rows: [{ available_balance: 50000, pending_payout: 0 }] };
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO marketplace_payout_requests')) {
        return { rows: [{ id: 101, id_user: 1, amount: 50000, status: 'pending' }] };
      }
      if (typeof sql === 'string' && sql.includes('UPDATE marketplace_seller_stats')) {
        expect(sql).toContain('available_balance >= $2');
        balanceUpdated = true;
        return { rowCount: 1, rows: [] };
      }
      return { rows: [] };
    });

    const result = await marketplaceWalletService.requestWithdrawal(1, 50000);

    expect(result).toEqual({ id: 101, id_user: 1, amount: 50000, status: 'pending' });
    expect(forUpdateLocked).toBe(true);
    expect(balanceUpdated).toBe(true);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('khi đua song song: lệnh đến sau thấy rowCount = 0 thì throw 400 và ROLLBACK', async () => {
    mockClient.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
        return { rows: [{ available_balance: 50000, pending_payout: 0 }] };
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO marketplace_payout_requests')) {
        return { rows: [{ id: 102 }] };
      }
      if (typeof sql === 'string' && sql.includes('UPDATE marketplace_seller_stats')) {
        // Giả lập lệnh 1 đã trừ trước khiến rowCount = 0
        return { rowCount: 0, rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      marketplaceWalletService.requestWithdrawal(1, 50000)
    ).rejects.toMatchObject({
      message: expect.stringContaining('Số dư khả dụng không đủ'),
      status: 400,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
