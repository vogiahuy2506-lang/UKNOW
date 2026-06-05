import api from '../../../services/api';

const courseApiService = {
  getCourses(params = {}) {
    return api.get('/courses', { params });
  },

  syncCourses() {
    return api.post('/courses/sync');
  },
};

export default courseApiService;
