import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock database
const mockQuery = jest.fn();
const mockClient = {
  query: mockQuery,
  release: jest.fn(),
};
mockClient.query.mockImplementation((sql) => {
  if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
    return Promise.resolve({ rows: [] });
  }
  return Promise.resolve({ rows: [] });
});

const mockGetClient = jest.fn().mockResolvedValue(mockClient);

const mockDbQuery = jest.fn().mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    getClient: mockGetClient,
    query: mockDbQuery,
  },
}));

// Mock repositories
const mockFindByIdTx = jest.fn();
const mockFindByUserAndListingTx = jest.fn();
const mockCreateTx = jest.fn();
const mockIncrementPurchaseCountTx = jest.fn();

jest.unstable_mockModule('../../../repositories/marketplace/marketplaceListing.repository.js', () => ({
  default: {
    findByIdTx: mockFindByIdTx,
    incrementPurchaseCountTx: mockIncrementPurchaseCountTx,
  },
}));

jest.unstable_mockModule('../../../repositories/marketplace/marketplacePurchase.repository.js', () => ({
  default: {
    findByUserAndListingTx: mockFindByUserAndListingTx,
    createTx: mockCreateTx,
  },
}));

// Mock usageTrackingService — quan trọng: kiểm tra client được truyền
const mockDeductCredits = jest.fn();
const mockTrackUsage = jest.fn();

jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({
  default: {
    deductCredits: mockDeductCredits,
    trackUsage: mockTrackUsage,
    getUserPlanLimits: jest.fn(),
    getCreditUsageForCycle: jest.fn(),
  },
}));

const mockCheckCreditAvailability = jest.fn().mockResolvedValue({ allowed: true });
const mockAiDeductCredits = jest.fn().mockResolvedValue({ success: true });
jest.unstable_mockModule('../../ai/aiCreditMeter.service.js', () => ({
  default: {
    checkCreditAvailability: mockCheckCreditAvailability,
    resolveCreditContext: jest.fn().mockResolvedValue({ skip: true }),
    deductCredits: mockAiDeductCredits,
  },
  AI_CREDIT_RESOURCE: 'ai_credit',
}));

// Mock userResourceLimit util — luôn cho phép trong unit test
const mockCheckUserResourceLimit = jest.fn().mockResolvedValue({ allowed: true });
const mockEnforceResourceLimitTx = jest.fn();

jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: mockCheckUserResourceLimit,
  enforceResourceLimitTx: mockEnforceResourceLimitTx,
}));

const { default: marketplacePurchaseService } = await import('../marketplacePurchase.service.js');

describe('marketplacePurchase.service.purchase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockClient.query.mockClear();
    mockClient.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetClient.mockResolvedValue(mockClient);
    mockCreateTx.mockResolvedValue({ id: 999, cloned_resource_type: 'campaign' });
    mockIncrementPurchaseCountTx.mockResolvedValue(undefined);
  });

  it('mua listing miễn phí KHÔNG gọi deductCredits', async () => {
    mockFindByIdTx.mockResolvedValue({
      id: 1, status: 'published', price_credits: 0, resource_type: 'campaign',
      id_user: 5, title: 'Free Listing', snapshot_data: {},
    });
    mockFindByUserAndListingTx.mockResolvedValue(null);

    mockClient.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('INSERT INTO campaigns')) {
        return Promise.resolve({ rows: [{ id: 100 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await marketplacePurchaseService.purchase(1, 10);

    expect(mockAiDeductCredits).not.toHaveBeenCalled();
    expect(mockTrackUsage).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('truyền client xuống deductCredits khi mua có phí', async () => {
    mockFindByIdTx.mockResolvedValue({
      id: 1, status: 'published', price_credits: 100, resource_type: 'campaign',
      id_user: 5, title: 'Paid Listing', snapshot_data: {},
    });
    mockFindByUserAndListingTx.mockResolvedValue(null);
    mockAiDeductCredits.mockResolvedValue({ success: true });

    mockClient.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('INSERT INTO campaigns')) {
        return Promise.resolve({ rows: [{ id: 100 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await marketplacePurchaseService.purchase(1, 10);

    expect(mockAiDeductCredits).toHaveBeenCalledTimes(1);
    const deductCall = mockAiDeductCredits.mock.calls[0];
    expect(deductCall[0]).toBe(10); // buyerId
    expect(deductCall[1]).toBe(100); // price
    // 4th là options chứa externalClient
    expect(deductCall[2]?.externalClient).toBe(mockClient);
  });

  it('cộng tiền vào marketplace_seller_stats và KHÔNG tiêu credit của seller', async () => {
    mockFindByIdTx.mockResolvedValue({
      id: 1, status: 'published', price_credits: 100, resource_type: 'campaign',
      id_user: 5, title: 'Paid Listing', snapshot_data: {},
    });
    mockFindByUserAndListingTx.mockResolvedValue(null);
    mockAiDeductCredits.mockResolvedValue({ success: true });

    let sellerStatsQuery = null;
    let sellerStatsParams = null;
    mockClient.query.mockImplementation((sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === 'string' && sql.includes('marketplace_seller_stats')) {
        sellerStatsQuery = sql;
        sellerStatsParams = params;
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO campaigns')) {
        return Promise.resolve({ rows: [{ id: 100 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await marketplacePurchaseService.purchase(1, 10);

    // KHÔNG tiêu credit người bán qua trackUsage
    expect(mockTrackUsage).not.toHaveBeenCalled();

    // CÓ cộng tiền vào marketplace_seller_stats cho seller 5 số tiền 90
    expect(sellerStatsQuery).toBeTruthy();
    expect(sellerStatsParams).toEqual([5, 90]);
  });

  it('ROLLBACK khi listing không published', async () => {
    mockFindByIdTx.mockResolvedValue({ id: 1, status: 'draft' });

    await expect(marketplacePurchaseService.purchase(1, 10)).rejects.toMatchObject({
      status: 404,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('ROLLBACK khi buyer đã mua rồi', async () => {
    mockFindByIdTx.mockResolvedValue({
      id: 1, status: 'published', price_credits: 0, id_user: 5,
    });
    mockFindByUserAndListingTx.mockResolvedValue({ id: 99 });

    await expect(marketplacePurchaseService.purchase(1, 10)).rejects.toMatchObject({
      status: 400,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('ROLLBACK khi buyer == seller', async () => {
    mockFindByIdTx.mockResolvedValue({
      id: 1, status: 'published', price_credits: 0, id_user: 10,
    });

    await expect(marketplacePurchaseService.purchase(1, 10)).rejects.toMatchObject({
      status: 400,
    });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('giải phóng client kể cả khi lỗi', async () => {
    mockFindByIdTx.mockResolvedValue(null); // listing không tồn tại

    await expect(marketplacePurchaseService.purchase(1, 10)).rejects.toBeTruthy();

    expect(mockClient.release).toHaveBeenCalled();
  });
});
