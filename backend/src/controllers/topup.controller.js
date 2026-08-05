import {
  getTopupConfig,
  quoteTopup,
  createTopupPaymentLink,
  ownerContextFromReqUser,
} from '../services/payment/topup.service.js';

function ownerContextId(req) {
  return ownerContextFromReqUser(req.user).ownerContextId ?? null;
}

export const getConfig = async (req, res) => {
  try {
    const result = await getTopupConfig({
      userId: req.user.id,
      ownerContextId: ownerContextId(req),
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Lỗi server',
      code: err.code,
    });
  }
};

export const quote = async (req, res) => {
  try {
    const { quantities } = req.body || {};
    if (!quantities || typeof quantities !== 'object') {
      return res.status(400).json({ success: false, message: 'Thiếu quantities' });
    }
    const result = await quoteTopup({
      userId: req.user.id,
      ownerContextId: ownerContextId(req),
      quantities,
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Lỗi server',
      code: err.code,
      errors: err.errors,
      capacity: err.capacity,
      shortfall: err.shortfall,
      minOrderAmount: err.minOrderAmount,
    });
  }
};

export const createPayment = async (req, res) => {
  try {
    const { quantities } = req.body || {};
    if (!quantities || typeof quantities !== 'object') {
      return res.status(400).json({ success: false, message: 'Thiếu quantities' });
    }
    // Ignore client amount — server recomputes inside createTopupPaymentLink.
    const result = await createTopupPaymentLink({
      userId: req.user.id,
      userEmail: req.user.email,
      ownerContextId: ownerContextId(req),
      quantities,
    });
    res.json({ success: true, message: 'Tạo liên kết thanh toán mua thêm thành công', result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Lỗi server',
      code: err.code,
      errors: err.errors,
      capacity: err.capacity,
      shortfall: err.shortfall,
      minOrderAmount: err.minOrderAmount,
    });
  }
};
