import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindOrderByCode = jest.fn();
const mockSetOrderCancelled = jest.fn();
const mockPayosCancel = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/adminOrders.repository.js', () => ({
  findOrders: jest.fn(),
  getOrdersKpi: jest.fn(),
  findOrderByCode: mockFindOrderByCode,
  setOrderCancelled: mockSetOrderCancelled,
}));
jest.unstable_mockModule('../../../utils/payos.util.js', () => ({
  default: { paymentRequests: { cancel: mockPayosCancel } },
}));

const { cancelOrder } = await import('../adminOrders.service.js');

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
