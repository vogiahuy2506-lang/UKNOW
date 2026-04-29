import * as adminOrdersService from '../../services/admin/adminOrders.service.js';

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error('Admin orders error:', err);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
}

/** PATCH /api/admin/orders/:orderCode/cancel */
export async function cancel(req, res) {
  try {
    await adminOrdersService.cancelOrder(req.params.orderCode);
    return res.json({ success: true, message: 'Đã huỷ đơn hàng và vô hiệu hoá QR' });
  } catch (err) { return handleError(res, err); }
}

/** GET /api/admin/orders?status=&search=&dateFrom=&dateTo=&page=&limit= */
export async function list(req, res) {
  try {
    const { status, search, dateFrom, dateTo } = req.query;
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));

    const result = await adminOrdersService.listOrders({ status, search, dateFrom, dateTo, page, limit });
    return res.json({ success: true, data: result });
  } catch (err) { return handleError(res, err); }
}
