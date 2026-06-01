import * as voucherService from '../../services/voucher.service.js';

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
    res.status(201).json({ success: true, data: voucher, message: 'Tạo voucher thành công' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function update(req, res) {
  try {
    const voucher = await voucherService.updateAdminVoucher(Number(req.params.id), req.body);
    res.json({ success: true, data: voucher, message: 'Cập nhật voucher thành công' });
  } catch (err) {
    handleError(res, err);
  }
}

export async function remove(req, res) {
  try {
    await voucherService.deleteAdminVoucher(Number(req.params.id));
    res.json({ success: true, message: 'Đã xoá voucher' });
  } catch (err) {
    handleError(res, err);
  }
}
