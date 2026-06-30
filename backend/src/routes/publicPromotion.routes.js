import express from 'express';
import db from '../config/database.js';

const router = express.Router();

router.get('/promotions/active', async (req, res) => {
  try {
    const billingPeriod = ['monthly', 'yearly'].includes(req.query.billingPeriod)
      ? req.query.billingPeriod
      : 'monthly';

    const priceCol = billingPeriod === 'yearly' ? 'price_yearly' : 'price_monthly';
    const discountCol = billingPeriod === 'yearly' ? 'discount_yearly' : 'discount_monthly';

    const { rows: plans } = await db.query(
      `SELECT id, code, name, ${priceCol} as price, ${discountCol} as discount
       FROM plans WHERE is_active = true LIMIT 1`
    );

    let hasPromotion = false;
    let topPromotion = null;

    if (plans[0]) {
      const { rows: vouchers } = await db.query(
        `SELECT id, code, discount_type, discount_amount, discount_percent, max_discount, min_order_amount
         FROM vouchers
         WHERE is_active = true AND auto_apply = true
           AND (start_date IS NULL OR start_date <= NOW())
           AND (end_date IS NULL OR end_date >= NOW())
         ORDER BY
           CASE WHEN discount_type = 'percent' THEN discount_percent * $2 / 100
                ELSE discount_amount
           END DESC
         LIMIT 1`,
        [plans[0].id, plans[0].price]
      );

      if (vouchers[0]) {
        hasPromotion = true;
        const voucher = vouchers[0];
        let discountAmount = voucher.discount_type === 'percent'
          ? Math.min(voucher.discount_percent * plans[0].price / 100, voucher.max_discount || Infinity)
          : voucher.discount_amount;

        topPromotion = {
          code: voucher.code,
          discountType: voucher.discount_type,
          discountAmount: Math.round(discountAmount),
          discountPercent: voucher.discount_percent,
          maxDiscount: voucher.max_discount,
          minOrderAmount: voucher.min_order_amount,
        };
      }
    }

    return res.json({
      success: true,
      data: {
        hasPromotion,
        topPromotion,
        billingPeriod,
        plan: plans[0] || null,
      },
    });
  } catch (error) {
    console.error('Get active promotions error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
