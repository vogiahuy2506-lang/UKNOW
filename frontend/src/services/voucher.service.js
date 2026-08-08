import api from './api';

export const getAvailableVouchers = ({ planCode, billingPeriod, amount }) => (
  api.get('/vouchers/available', {
    params: {
      planCode,
      billingPeriod,
      ...(amount != null ? { amount } : {}),
    },
  })
);

export const getVoucherCodeSuggestions = ({ planCode, billingPeriod, amount }) => (
  api.get('/vouchers/code-suggestions', {
    params: {
      planCode,
      billingPeriod,
      ...(amount != null ? { amount } : {}),
    },
  })
);

export const validateVoucher = ({ planCode, billingPeriod, code, amount }) => (
  api.post('/vouchers/validate', {
    planCode,
    billingPeriod,
    code,
    ...(amount != null ? { amount } : {}),
  })
);
