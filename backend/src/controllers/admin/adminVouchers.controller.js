import * as voucherService from '../../services/voucher.service.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../services/audit.service.js';
import { getSystemAuditContext } from '../../utils/auditContext.util.js';
import { auditVoucherMeta } from '../../utils/voucherOffer.util.js';

const handleError = (res, err) => {
  const body = { success: false, message: err.message || 'Lỗi server' };
  if (err.code) body.code = err.code;
  res.status(err.status || 500).json(body);
};

export async function list(req, res) {
  try {
    const offerMode = req.query.offerMode || null;
    const vouchers = await voucherService.listAdminVouchers({ offerMode });
    res.json({ success: true, data: vouchers });
  } catch (err) {
    handleError(res, err);
  }
}

export async function create(req, res) {
  try {
    const voucher = await voucherService.createAdminVoucher(req.body);
    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.VOUCHER_CREATED,
      AUDIT_ENTITY_TYPES.VOUCHER,
      voucher.id,
      auditVoucherMeta(voucher)
    );
    res.status(201).json({ success: true, data: voucher, message: 'Tạo voucher thành công' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function update(req, res) {
  try {
    const voucher = await voucherService.updateAdminVoucher(Number(req.params.id), req.body);
    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.VOUCHER_UPDATED,
      AUDIT_ENTITY_TYPES.VOUCHER,
      voucher.id,
      auditVoucherMeta(voucher)
    );
    res.json({ success: true, data: voucher, message: 'Cập nhật voucher thành công' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function remove(req, res) {
  try {
    await voucherService.deleteAdminVoucher(Number(req.params.id));
    await logSystem(getSystemAuditContext(req), AUDIT_ACTIONS.VOUCHER_DELETED, AUDIT_ENTITY_TYPES.VOUCHER, Number(req.params.id), { soft: true });
    res.json({ success: true, message: 'Đã ngừng dùng voucher' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function hardRemove(req, res) {
  try {
    await voucherService.hardDeleteAdminVoucher(Number(req.params.id));
    await logSystem(getSystemAuditContext(req), AUDIT_ACTIONS.VOUCHER_DELETED, AUDIT_ENTITY_TYPES.VOUCHER, Number(req.params.id), { hard: true });
    res.json({ success: true, message: 'Đã xoá vĩnh viễn voucher' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function restore(req, res) {
  try {
    const voucher = await voucherService.restoreAdminVoucher(Number(req.params.id), req.body || {});
    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.VOUCHER_UPDATED,
      AUDIT_ENTITY_TYPES.VOUCHER,
      voucher.id,
      auditVoucherMeta(voucher, { restored: true })
    );
    res.json({ success: true, data: voucher, message: 'Đã khôi phục voucher' });
  } catch (err) {
    handleError(res, err);
  }
}
