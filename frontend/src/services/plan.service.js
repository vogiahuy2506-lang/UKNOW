import api from './api';

export const getPlans = () => api.get('/plans');

export const createPayment = (planCode, userEmail) => api.post('/payments/create-payment', { planCode, userEmail });

export const getPaymentStatus = (orderCode) => api.get(`/payments/status/${orderCode}`);