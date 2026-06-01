import * as voucherService from '../services/voucher.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

export async function available(req, res) {
  try {
    const result = await voucherService.listAvailableVouchers({
      planCode: req.query.planCode,
      billingPeriod: req.query.billingPeriod || 'monthly',
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

export async function codeSuggestions(req, res) {
  try {
    const result = await voucherService.listCheckoutCodeVouchers({
      planCode: req.query.planCode,
      billingPeriod: req.query.billingPeriod || 'monthly',
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

export async function validate(req, res) {
  try {
    const result = await voucherService.validateVoucherForCheckout({
      planCode: req.body.planCode,
      billingPeriod: req.body.billingPeriod || 'monthly',
      code: req.body.code,
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
    });
    if (!result.voucher) {
      return res.status(404).json({ success: false, message: 'Voucher không hợp lệ hoặc không đủ điều kiện' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}
