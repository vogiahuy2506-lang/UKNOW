import api from '../../../services/api';

const adminPlansApiService = {
  getPlans()                { return api.get('/admin/plans'); },
  getCustomPlans(showHidden = false) { return api.get('/admin/plans/custom-list', { params: showHidden ? { showHidden: 'true' } : {} }); },
  searchUsers(q, excludeWithPlan = false) {
    return api.get('/admin/plans/search-users', { params: { q, ...(excludeWithPlan && { excludeWithPlan: 'true' }) } });
  },
  createPlan(payload)       { return api.post('/admin/plans', payload); },
  createCustomPlan(payload)              { return api.post('/admin/plans/custom', payload); },
  createCustomPlanWithPayment(payload)   { return api.post('/admin/plans/custom-with-payment', payload); },
  updatePlan(id, payload)   { return api.patch(`/admin/plans/${id}`, payload); },
  deletePlan(id)            { return api.delete(`/admin/plans/${id}`); },
  assignPlan(id, userEmail, { paymentMethod = 'free', note = null, billingPeriod = 'monthly', quantity = 1 } = {}) {
    return api.post(`/admin/plans/${id}/assign`, { userEmail, paymentMethod, note, billingPeriod, quantity });
  },
  removeUserPlan(userId) {
    return api.delete(`/admin/plans/user/${userId}`);
  },
  translateFeatures(texts) {
    return api.post('/admin/plans/translate-features', { texts });
  },
  getCustomPricing() {
    return api.get('/admin/plans/custom-pricing');
  },
  updateCustomPricing(itemKey, payload) {
    return api.patch(`/admin/plans/custom-pricing/${encodeURIComponent(itemKey)}`, payload);
  },
};

export default adminPlansApiService;
