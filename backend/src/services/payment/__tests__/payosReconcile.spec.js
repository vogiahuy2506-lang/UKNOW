import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockGet = jest.fn();
const mockClaim = jest.fn();
const mockMarkFailed = jest.fn();
const mockCancelNote = jest.fn();
const mockFindByCode = jest.fn();
const mockFindPending = jest.fn();
const mockFindStale = jest.fn();
const mockFulfill = jest.fn();
const mockGetClient = jest.fn();

const client = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../../utils/payos.util.js', () => ({
  default: { paymentRequests: { get: mockGet, cancel: jest.fn() } },
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: mockGetClient },
}));

jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => ({
  claimOrderSuccess: mockClaim,
  markOrderFailedForReview: mockMarkFailed,
  findPendingPayosOrdersSinceHours: mockFindPending,
  findStalePendingPayosOrders: mockFindStale,
  cancelPendingOrderWithNote: mockCancelNote,
  findOrderByCode: mockFindByCode,
}));

jest.unstable_mockModule('../payosOrderFulfillment.service.js', () => ({
  fulfillPaidOrder: mockFulfill,
}));

const {
  applyPayosLinkToPendingOrder,
  reconcileRecentPendingOrders,
} = await import('../payosReconcile.service.js');

describe('applyPayosLinkToPendingOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue(client);
    client.query.mockResolvedValue({});
  });

  it('PAID + matching amount → claim + fulfill', async () => {
    const order = { order_code: 111, status: 'pending', amount: 99000 };
    mockGet.mockResolvedValue({ status: 'PAID', amountPaid: 99000 });
    mockFindByCode.mockResolvedValue(order);
    mockClaim.mockResolvedValue({ ...order, status: 'success' });

    const out = await applyPayosLinkToPendingOrder(order, { source: 'test' });
    expect(out).toBe('fulfilled');
    expect(mockClaim).toHaveBeenCalled();
    expect(mockFulfill).toHaveBeenCalled();
  });

  it('PAID + amount mismatch → mark failed, no fulfill', async () => {
    const order = { order_code: 112, status: 'pending', amount: 99000 };
    mockGet.mockResolvedValue({ status: 'PAID', amountPaid: 50000 });
    mockFindByCode.mockResolvedValue(order);

    const out = await applyPayosLinkToPendingOrder(order, { source: 'test' });
    expect(out).toBe('amount_mismatch');
    expect(mockMarkFailed).toHaveBeenCalled();
    expect(mockFulfill).not.toHaveBeenCalled();
  });

  it('CANCELLED → local cancelled', async () => {
    const order = { order_code: 113, status: 'pending', amount: 99000 };
    mockGet.mockResolvedValue({ status: 'CANCELLED' });
    mockCancelNote.mockResolvedValue({ order_code: 113 });

    const out = await applyPayosLinkToPendingOrder(order, { source: 'test' });
    expect(out).toBe('cancelled');
    expect(mockCancelNote).toHaveBeenCalled();
  });

  it('UNDERPAID → skipped (keep pending)', async () => {
    const order = { order_code: 114, status: 'pending', amount: 99000 };
    mockGet.mockResolvedValue({ status: 'UNDERPAID', amountPaid: 1000 });

    const out = await applyPayosLinkToPendingOrder(order, { source: 'test' });
    expect(out).toBe('skipped');
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('already success locally → skipped without PayOS call when status not pending', async () => {
    const out = await applyPayosLinkToPendingOrder(
      { order_code: 115, status: 'success', amount: 1 },
      { source: 'test' }
    );
    expect(out).toBe('skipped');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('reconcileRecentPendingOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue(client);
    client.query.mockResolvedValue({});
  });

  it('counts rescued and is idempotent-friendly when claim returns null', async () => {
    mockFindPending.mockResolvedValue([
      { order_code: 201, status: 'pending', amount: 1000 },
    ]);
    mockGet.mockResolvedValue({ status: 'PAID', amountPaid: 1000 });
    mockFindByCode.mockResolvedValue({ order_code: 201, status: 'pending', amount: 1000 });
    mockClaim.mockResolvedValue(null); // already claimed by webhook race

    const summary = await reconcileRecentPendingOrders({ withinHours: 48 });
    expect(summary.scanned).toBe(1);
    expect(summary.rescued).toBe(0);
    expect(mockFulfill).not.toHaveBeenCalled();
  });
});
