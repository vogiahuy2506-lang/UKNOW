import api from './api';

export const getTopupConfig = () => api.get('/topup/config');

export const quoteTopup = ({ quantities }) => (
  api.post('/topup/quote', { quantities })
);

export const createTopupPayment = (payload) => (
  api.post('/topup/create-payment', payload)
);

export const getTopupLocks = () => api.get('/topup/locks');

export const putTopupLocks = ({ resourceKey, keepIds }) => (
  api.put('/topup/locks', { resourceKey, keepIds })
);
