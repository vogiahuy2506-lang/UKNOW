import api from '../../../services/api';
import { queryClient } from '../../../lib/queryClient';
import { PLANS_QUERY_KEY } from '../../../hooks/queries/usePlansQuery';

const adminPlansApiService = {
  getPlans()                { return api.get('/admin/plans'); },
  getCustomPlans(showHidden = false) { return api.get('/admin/plans/custom-list', { params: showHidden ? { showHidden: 'true' } : {} }); },
  searchUsers(q, excludeWithPlan = false) {
    return api.get('/admin/plans/search-users', { params: { q, ...(excludeWithPlan && { excludeWithPlan: 'true' }) } });
  },
  async createPlan(payload) {
    const res = await api.post('/admin/plans', payload);
    queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY }).catch(() => {});
    return res;
  },
  createCustomPlan(payload)              { return api.post('/admin/plans/custom', payload); },
  createCustomPlanWithPayment(payload)   { return api.post('/admin/plans/custom-with-payment', payload); },
  async updatePlan(id, payload) {
    const res = await api.patch(`/admin/plans/${id}`, payload);
    queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY }).catch(() => {});
    return res;
  },
  async deletePlan(id) {
    const res = await api.delete(`/admin/plans/${id}`);
    queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY }).catch(() => {});
    return res;
  },
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
  async updateCustomPricing(itemKey, payload) {
    const res = await api.patch(`/admin/plans/custom-pricing/${encodeURIComponent(itemKey)}`, payload);
    queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY }).catch(() => {});
    return res;
  },
};


export default adminPlansApiService;
