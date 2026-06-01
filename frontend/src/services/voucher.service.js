import api from './api';

export const getAvailableVouchers = ({ planCode, billingPeriod }) => (
  api.get('/vouchers/available', { params: { planCode, billingPeriod } })
);

export const getVoucherCodeSuggestions = ({ planCode, billingPeriod }) => (
  api.get('/vouchers/code-suggestions', { params: { planCode, billingPeriod } })
);

export const validateVoucher = ({ planCode, billingPeriod, code }) => (
  api.post('/vouchers/validate', { planCode, billingPeriod, code })
);
