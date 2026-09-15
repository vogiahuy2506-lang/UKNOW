import api from '../../../services/api';

const adminFormsApiService = {
  list(params) { return api.get('/admin/forms', { params }); },
  disable(id) { return api.put(`/admin/forms/${id}/disable`); },
  enable(id) { return api.put(`/admin/forms/${id}/enable`); },
};

export default adminFormsApiService;
