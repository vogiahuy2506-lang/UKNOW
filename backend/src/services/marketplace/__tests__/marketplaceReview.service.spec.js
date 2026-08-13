import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock database client (transaction)
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

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: mockGetClient, query: jest.fn() },
}));

const mockFindByUserAndListingTx = jest.fn();
const mockCreateTx = jest.fn();
const mockGetAverageRatingTx = jest.fn();
const mockUpdateRating = jest.fn();

jest.unstable_mockModule('../../../repositories/marketplace/marketplaceReview.repository.js', () => ({
  default: {
    createTx: mockCreateTx,
    getAverageRatingTx: mockGetAverageRatingTx,
  },
}));

jest.unstable_mockModule('../../../repositories/marketplace/marketplacePurchase.repository.js', () => ({
  default: {
    findByUserAndListingTx: mockFindByUserAndListingTx,
  },
}));

jest.unstable_mockModule('../../../repositories/marketplace/marketplaceListing.repository.js', () => ({
  default: {
    updateRating: mockUpdateRating,
  },
}));

const { default: marketplaceReviewService } = await import('../marketplaceReview.service.js');

describe('marketplaceReview.service.createOrUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetClient.mockResolvedValue(mockClient);
  });

  it('chạy trong transaction (BEGIN → COMMIT)', async () => {
    mockFindByUserAndListingTx.mockResolvedValue({ id: 1 });
    mockCreateTx.mockResolvedValue({ id: 1, rating: 5 });
    mockGetAverageRatingTx.mockResolvedValue({ avg: 5, count: 1 });
    mockUpdateRating.mockResolvedValue(undefined);

    await marketplaceReviewService.createOrUpdate(10, 5, { rating: 5, reviewText: 'OK' });

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('ROLLBACK + throw 403 khi user chưa mua listing', async () => {
    mockFindByUserAndListingTx.mockResolvedValue(null);

    await expect(
      marketplaceReviewService.createOrUpdate(10, 5, { rating: 5 })
    ).rejects.toMatchObject({ status: 403 });

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
    expect(mockCreateTx).not.toHaveBeenCalled();
  });

  it('ROLLBACK + throw khi create() throw', async () => {
    mockFindByUserAndListingTx.mockResolvedValue({ id: 1 });
    mockCreateTx.mockRejectedValue(new Error('DB error'));

    await expect(
      marketplaceReviewService.createOrUpdate(10, 5, { rating: 5 })
    ).rejects.toThrow('DB error');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('verify purchase trong transaction (findByUserAndListingTx chứ không phải findByUserAndListing)', async () => {
    mockFindByUserAndListingTx.mockResolvedValue({ id: 1 });
    mockCreateTx.mockResolvedValue({ id: 1 });
    mockGetAverageRatingTx.mockResolvedValue({ avg: 5, count: 1 });

    await marketplaceReviewService.createOrUpdate(10, 5, { rating: 5 });

    // Verify đã dùng bản Tx
    expect(mockFindByUserAndListingTx).toHaveBeenCalledWith(
      expect.anything(), 5, 10
    );
  });

  it('cập nhật rating_avg trên listing sau khi review', async () => {
    mockFindByUserAndListingTx.mockResolvedValue({ id: 1 });
    mockCreateTx.mockResolvedValue({ id: 1, rating: 4 });
    mockGetAverageRatingTx.mockResolvedValue({ avg: 4.5, count: 2 });

    await marketplaceReviewService.createOrUpdate(10, 5, { rating: 4, reviewText: 'Good' });

    expect(mockUpdateRating).toHaveBeenCalledWith(10, 4.5, 2);
  });
});
