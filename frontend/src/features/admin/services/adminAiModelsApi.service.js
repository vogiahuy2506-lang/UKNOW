import api from '../../../services/api';

const adminAiModelsApiService = {
  list() {
    return api.get('/admin/ai-models');
  },
  update(modelId, payload) {
    return api.patch(`/admin/ai-models/${encodeURIComponent(modelId)}`, payload);
  },
  sync() {
    return api.post('/admin/ai-models/sync');
  },
};

export default adminAiModelsApiService;
