import * as voucherService from '../services/voucher.service.js';

export async function active(req, res) {
  try {
    const billingPeriod = ['monthly', 'yearly'].includes(req.query.billingPeriod)
      ? req.query.billingPeriod
      : 'monthly';
    const data = await voucherService.listPublicActivePromotions({ billingPeriod });
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}
