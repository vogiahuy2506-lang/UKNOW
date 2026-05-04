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
  assignPlan(id, userEmail) { return api.post(`/admin/plans/${id}/assign`, { userEmail }); },
};

export default adminPlansApiService;
