import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindOrderByCode = jest.fn();
const mockSetOrderCancelled = jest.fn();
const mockPayosCancel = jest.fn();
const mockMarkPaidAfterCancelledHandled = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/adminOrders.repository.js', () => ({
  findOrders: jest.fn(),
  getOrdersKpi: jest.fn(),
  findOrderByCode: mockFindOrderByCode,
  setOrderCancelled: mockSetOrderCancelled,
  markPaidAfterCancelledHandled: mockMarkPaidAfterCancelledHandled,
}));
jest.unstable_mockModule('../../../utils/payos.util.js', () => ({
  default: { paymentRequests: { cancel: mockPayosCancel } },
}));

const { cancelOrder, markOrderPaidAfterCancelledHandled } = await import('../adminOrders.service.js');

// PR-4 (đợt rà soát 26/09) — check-then-act giữa findOrderByCode (kiểm) và setOrderCancelled
// (ghi) không atomic; webhook có thể claim đơn thành 'success' đúng lúc giữa hai bước.
describe('adminOrders.service.cancelOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPayosCancel.mockResolvedValue({});
  });

  it('huỷ thành công khi đơn đang pending', async () => {
    mockFindOrderByCode.mockResolvedValue({ id: 1, order_code: '999', status: 'pending' });
    mockSetOrderCancelled.mockResolvedValue({ id: 1, order_code: '999', status: 'cancelled' });

    const res = await cancelOrder('999');

    expect(res).toEqual({ orderCode: '999' });
    expect(mockSetOrderCancelled).toHaveBeenCalledWith('999');
  });

  it('từ chối ngay ở bước kiểm khi đơn không còn pending', async () => {
    mockFindOrderByCode.mockResolvedValue({ id: 1, order_code: '999', status: 'success' });

    await expect(cancelOrder('999')).rejects.toMatchObject({ status: 400 });
    expect(mockSetOrderCancelled).not.toHaveBeenCalled();
  });

  it('404 khi không tìm thấy đơn', async () => {
    mockFindOrderByCode.mockResolvedValue(null);
    await expect(cancelOrder('999')).rejects.toMatchObject({ status: 404 });
  });

  // Đây là ca chính PR-4 sửa: bước kiểm thấy 'pending', nhưng ngay sau đó (trước khi
  // setOrderCancelled chạy) webhook claim đơn thành 'success' — setOrderCancelled giờ chỉ
  // UPDATE được hàng còn 'pending' nên trả về null; service phải báo lỗi 409 rõ ràng, KHÔNG
  // được coi là huỷ thành công (trước đây sẽ im lặng đè 'success' xuống 'cancelled').
  it('409 khi bị webhook race claim thành success ngay giữa lúc kiểm và lúc ghi', async () => {
    mockFindOrderByCode.mockResolvedValue({ id: 1, order_code: '999', status: 'pending' });
    mockSetOrderCancelled.mockResolvedValue(null);

    await expect(cancelOrder('999')).rejects.toMatchObject({ status: 409 });
  });

  it('vẫn huỷ được trong DB dù PayOS cancel lỗi (best-effort, không chặn)', async () => {
    mockFindOrderByCode.mockResolvedValue({ id: 1, order_code: '999', status: 'pending' });
    mockPayosCancel.mockRejectedValue(new Error('link expired'));
    mockSetOrderCancelled.mockResolvedValue({ id: 1, order_code: '999', status: 'cancelled' });

    const res = await cancelOrder('999');
    expect(res).toEqual({ orderCode: '999' });
  });
});

// "Nợ nhỏ" PR-4 (26/09) — đánh dấu đã xử lý tay, KHÔNG đổi status, KHÔNG kích hoạt gói.
describe('adminOrders.service.markOrderPaidAfterCancelledHandled', () => {
  beforeEach(() => jest.clearAllMocks());

  it('nối tag PAID_AFTER_CANCELLED_HANDLED kèm người/giờ vào note', async () => {
    mockFindOrderByCode.mockResolvedValue({ id: 5, order_code: '999', status: 'cancelled' });
    mockMarkPaidAfterCancelledHandled.mockResolvedValue({
      id: 5, order_code: '999', status: 'cancelled', note: 'PAID_AFTER_CANCELLED\n[OPS] PAID_AFTER_CANCELLED_HANDLED by admin@test.local at ...',
    });

    const res = await markOrderPaidAfterCancelledHandled('999', 'admin@test.local');

    expect(res.orderCode).toBe('999');
    expect(res.order.status).toBe('cancelled'); // KHÔNG đổi status
    const [orderCode, note] = mockMarkPaidAfterCancelledHandled.mock.calls[0];
    expect(orderCode).toBe('999');
    expect(note).toContain('PAID_AFTER_CANCELLED_HANDLED');
    expect(note).toContain('admin@test.local');
  });

  it('404 khi không tìm thấy đơn', async () => {
    mockFindOrderByCode.mockResolvedValue(null);
    await expect(markOrderPaidAfterCancelledHandled('999', 'admin@test.local')).rejects.toMatchObject({ status: 404 });
    expect(mockMarkPaidAfterCancelledHandled).not.toHaveBeenCalled();
  });

  it('400 khi đơn không có tag gốc hoặc đã được đánh dấu xử lý trước đó (repository trả null)', async () => {
    mockFindOrderByCode.mockResolvedValue({ id: 5, order_code: '999', status: 'cancelled' });
    mockMarkPaidAfterCancelledHandled.mockResolvedValue(null);

    await expect(markOrderPaidAfterCancelledHandled('999', 'admin@test.local')).rejects.toMatchObject({ status: 400 });
  });
});
