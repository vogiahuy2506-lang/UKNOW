import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock repository để verify service có truyền client xuống repository hay không.
// Bug: trước đây trackUsage/deductCredits không truyền `client` xuống repository
// → chạy ngoài transaction, gây mất tiền khi rollback.
const mockTrackUsage = jest.fn();
const mockDeductCredits = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/usageTracking.repository.js', () => ({
  default: {
    trackUsage: mockTrackUsage,
    deductCredits: mockDeductCredits,
  },
}));

const { default: usageTrackingService } = await import('../usageTracking.service.js');

describe('usageTracking.service transaction support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackUsage', () => {
    it('truyền client xuống repository khi được cung cấp', async () => {
      const fakeClient = { query: jest.fn() };
      mockTrackUsage.mockResolvedValue({ id: 1 });

      await usageTrackingService.trackUsage(
        10, 'ai_credit', 50, { type: 'marketplace_sale' }, fakeClient
      );

      expect(mockTrackUsage).toHaveBeenCalledWith(
        10, 'ai_credit', 50, { type: 'marketplace_sale' }, fakeClient
      );
    });

    it('chấp nhận gọi không có client (ghi ngoài transaction)', async () => {
      mockTrackUsage.mockResolvedValue({ id: 1 });

      await usageTrackingService.trackUsage(10, 'ai_credit', 1);

      expect(mockTrackUsage).toHaveBeenCalledWith(10, 'ai_credit', 1, {}, null);
    });

    it('chấp nhận client=null rõ ràng', async () => {
      mockTrackUsage.mockResolvedValue({ id: 1 });

      await usageTrackingService.trackUsage(10, 'ai_credit', 1, {}, null);

      expect(mockTrackUsage).toHaveBeenCalledWith(10, 'ai_credit', 1, {}, null);
    });
  });

  describe('deductCredits', () => {
    it('truyền client xuống repository khi được cung cấp', async () => {
      const fakeClient = { query: jest.fn() };
      mockDeductCredits.mockResolvedValue({ success: true });

      await usageTrackingService.deductCredits(
        10, 100, { listing_id: 5 }, fakeClient
      );

      expect(mockDeductCredits).toHaveBeenCalledWith(
        10, 100, { listing_id: 5 }, fakeClient
      );
    });

    it('chấp nhận gọi không có client', async () => {
      mockDeductCredits.mockResolvedValue({ success: true });

      await usageTrackingService.deductCredits(10, 100);

      expect(mockDeductCredits).toHaveBeenCalledWith(10, 100, {}, null);
    });
  });
});
