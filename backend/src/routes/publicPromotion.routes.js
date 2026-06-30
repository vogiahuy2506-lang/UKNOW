import express from 'express';
import db from '../config/database.js';

const router = express.Router();

router.get('/promotions/active', async (req, res) => {
  try {
    const billingPeriod = ['monthly', 'yearly'].includes(req.query.billingPeriod)
      ? req.query.billingPeriod
      : 'monthly';

    const { rows: plans } = await db.query(
      `SELECT id, code, name, price, price_yearly
       FROM plans WHERE is_active = true LIMIT 1`
    );

    let hasPromotion = false;
    let topPromotion = null;

    const byPlanCode = {};

    if (plans[0]) {
      const price = billingPeriod === 'yearly' ? (plans[0].price_yearly || plans[0].price) : plans[0].price;
      byPlanCode[plans[0].code] = { price };

      const { rows: vouchers } = await db.query(
        `SELECT id, code, discount_type, discount_value, max_discount_amount, min_order_amount
         FROM vouchers
         WHERE is_active = true AND auto_apply = true
           AND (starts_at IS NULL OR starts_at <= NOW())
           AND (ends_at IS NULL OR ends_at >= NOW())
         ORDER BY id ASC`
      );

      if (vouchers.length > 0) {
        let topVoucher = null;
        let maxDiscountAmount = 0;

        for (const voucher of vouchers) {
          let discountAmount = voucher.discount_type === 'percentage'
            ? Math.min(voucher.discount_value * price / 100, voucher.max_discount_amount || Infinity)
            : voucher.discount_value;

          if (discountAmount > maxDiscountAmount) {
            maxDiscountAmount = discountAmount;
            topVoucher = voucher;
          }
        }

        if (topVoucher) {
          hasPromotion = true;
          topPromotion = {
            code: topVoucher.code,
            discountType: topVoucher.discount_type,
            discountAmount: Math.round(maxDiscountAmount),
            discountPercent: topVoucher.discount_type === 'percentage' ? topVoucher.discount_value : null,
            maxDiscount: topVoucher.max_discount_amount,
            minOrderAmount: topVoucher.min_order_amount,
          };
        }
      }
    }

    return res.json({
      success: true,
      data: {
        hasPromotion,
        topPromotion,
        billingPeriod,
        plan: plans[0] || null,
        byPlanCode,
      },
    });
  } catch (error) {
    console.error('Get active promotions error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
