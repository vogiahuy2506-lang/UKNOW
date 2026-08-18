import * as adminEinvoiceService from '../../services/admin/adminEinvoice.service.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../services/audit.service.js';
import { getSystemAuditContext } from '../../utils/auditContext.util.js';

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error('Admin einvoices error:', err);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
}

/** GET /api/admin/einvoices?status=&search=&dateFrom=&dateTo=&page=&limit= */
export async function list(req, res) {
  try {
    const { status, search, dateFrom, dateTo } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));

    const result = await adminEinvoiceService.listEinvoices({
      status,
      search,
      dateFrom,
      dateTo,
      page,
      limit,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /api/admin/einvoices/:id/retry */
export async function retry(req, res) {
  try {
    const id = Number(req.params.id);
    const result = await adminEinvoiceService.retryEinvoice(id);

    // Sanitize audit details: KHÔNG ghi full row để tránh rò rỉ CCCD, MST, địa chỉ khách hàng
    const auditDetails = {
      ok: result?.ok,
      skipped: result?.skipped,
      reason: result?.reason,
      errorCode: result?.errorCode,
      status: result?.row?.status || result?.status,
    };
    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.EINVOICE_RETRIED,
      AUDIT_ENTITY_TYPES.EINVOICE,
      id,
      auditDetails,
    );

    const message = result?.skipped
      ? `Bỏ qua phát hành lại (${result.reason || 'không hợp lệ'})`
      : result?.ok === false
        ? `Phát hành lại thất bại (mã lỗi ${result.errorCode || 'không xác định'})`
        : 'Phát hành lại hoá đơn thành công';

    return res.json({ success: true, data: result, message });
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /api/admin/einvoices/:id/resend-email */
export async function resendEmail(req, res) {
  try {
    const id = Number(req.params.id);
    const result = await adminEinvoiceService.resendEinvoiceEmail(id);

    // Sanitize audit details
    const auditDetails = {
      ok: result?.ok,
      skipped: result?.skipped,
      reason: result?.reason,
      status: result?.status,
    };
    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.EINVOICE_EMAIL_RESENT,
      AUDIT_ENTITY_TYPES.EINVOICE,
      id,
      auditDetails,
    );

    const message = result?.skipped
      ? `Bỏ qua gửi email (${result.reason || 'không hợp lệ'})`
      : result?.ok === false
        ? `Gửi email thất bại (${result.reason || 'lỗi'})`
        : 'Gửi lại email hoá đơn thành công';

    return res.json({ success: true, data: result, message });
  } catch (err) {
    return handleError(res, err);
  }
}
