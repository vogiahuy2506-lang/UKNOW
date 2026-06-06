import api from '../../../services/api';

export const templateLabelApiService = {
  getLabels() {
    return api.get('/template-labels');
  },
  createLabel(payload) {
    return api.post('/template-labels', payload);
  },
  deleteLabel(id) {
    return api.delete(`/template-labels/${id}`);
  },
};

export default templateLabelApiService;
