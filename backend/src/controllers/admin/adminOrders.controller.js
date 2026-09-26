import * as adminOrdersService from '../../services/admin/adminOrders.service.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../services/audit.service.js';
import { getSystemAuditContext } from '../../utils/auditContext.util.js';

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

/** PATCH /api/admin/orders/:orderCode/paid-after-cancelled/handled — "Nợ nhỏ" PR-4 (26/09) */
export async function markPaidAfterCancelledHandled(req, res) {
  try {
    const handledByLabel = req.user?.email || req.user?.username || `user#${req.user?.id}`;
    const { orderCode, order } = await adminOrdersService.markOrderPaidAfterCancelledHandled(
      req.params.orderCode,
      handledByLabel
    );
    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.ORDER_PAID_AFTER_CANCELLED_HANDLED,
      AUDIT_ENTITY_TYPES.ORDER,
      order.id,
      { orderCode }
    );
    return res.json({ success: true, message: 'Đã đánh dấu đơn hàng là đã xử lý' });
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
