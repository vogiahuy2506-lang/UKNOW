import { findOrders, getOrdersKpi, findOrderByCode, setOrderCancelled } from '../../repositories/admin/adminOrders.repository.js';
import payosClient from '../../utils/payos.util.js';

export async function listOrders({ status, search, dateFrom, dateTo, page, limit }) {
  const [{ rows, total }, kpi] = await Promise.all([
    findOrders({ status, search, dateFrom, dateTo, page, limit }),
    getOrdersKpi(),
  ]);
  return { orders: rows, total, kpi };
}

export async function cancelOrder(orderCode) {
  const order = await findOrderByCode(orderCode);
  if (!order) throw { status: 404, message: 'Không tìm thấy đơn hàng' };
  if (order.status !== 'pending') throw { status: 400, message: 'Chỉ có thể huỷ đơn đang chờ thanh toán' };

  // Vô hiệu hoá link/QR phía PayOS trước
  try {
    await payosClient.paymentRequests.cancel(Number(orderCode));
  } catch (err) {
    // PayOS có thể trả lỗi nếu link đã hết hạn — vẫn tiếp tục huỷ trong DB
    console.warn('[cancelOrder] PayOS cancel error (ignored):', err?.message);
  }

  // PR-4 (đợt rà soát 26/09) — có thể vừa bị webhook claim thành 'success' giữa lúc kiểm
  // ở trên và lúc UPDATE này chạy (check-then-act không atomic); setOrderCancelled giờ chỉ
  // đổi được hàng còn 'pending' và trả về null nếu đã bị race mất. Đừng báo thành công giả.
  const cancelled = await setOrderCancelled(orderCode);
  if (!cancelled) {
    throw { status: 409, message: 'Đơn hàng vừa được xử lý (có thể vừa thanh toán thành công) — không thể huỷ, vui lòng tải lại' };
  }
  return { orderCode };
}
