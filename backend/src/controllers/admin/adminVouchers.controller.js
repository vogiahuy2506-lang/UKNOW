import * as voucherService from '../../services/voucher.service.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../services/audit.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

export async function list(_req, res) {
  try {
    const vouchers = await voucherService.listAdminVouchers();
    res.json({ success: true, data: vouchers });
  } catch (err) {
    handleError(res, err);
  }
}

export async function create(req, res) {
  try {
    const voucher = await voucherService.createAdminVoucher(req.body);
    logSystem(req, AUDIT_ACTIONS.VOUCHER_CREATED, AUDIT_ENTITY_TYPES.VOUCHER, voucher.id, { code: voucher.code });
    res.status(201).json({ success: true, data: voucher, message: 'Tạo voucher thành công' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function update(req, res) {
  try {
    const voucher = await voucherService.updateAdminVoucher(Number(req.params.id), req.body);
    logSystem(req, AUDIT_ACTIONS.VOUCHER_UPDATED, AUDIT_ENTITY_TYPES.VOUCHER, voucher.id, { code: voucher.code });
    res.json({ success: true, data: voucher, message: 'Cập nhật voucher thành công' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function remove(req, res) {
  try {
    await voucherService.deleteAdminVoucher(Number(req.params.id));
    logSystem(req, AUDIT_ACTIONS.VOUCHER_DELETED, AUDIT_ENTITY_TYPES.VOUCHER, Number(req.params.id), {});
    res.json({ success: true, message: 'Đã xoá voucher' });
  } catch (err) {
    handleError(res, err);
  }
}
