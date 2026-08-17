import api from './api';

export const getCustomPlanConfig = () => api.get('/plans/custom/config');

export const getMyCustomPlan = () => api.get('/plans/custom/mine');

export const quoteCustomPlan = ({ quantities, billingPeriod }) => (
  api.post('/plans/custom/quote', { quantities, billingPeriod })
);

export const createCustomPayment = (payload) => (
  api.post('/payments/create-custom-payment', payload)
);
