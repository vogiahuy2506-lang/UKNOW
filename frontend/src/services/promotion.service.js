import api from './api';

export const getActivePromotions = ({ billingPeriod = 'monthly' } = {}) => (
  api.get('/public/promotions/active', { params: { billingPeriod } })
);
