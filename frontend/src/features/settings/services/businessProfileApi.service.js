import api from '../../../services/api';
import aiApi from '../../../services/aiApi';

const businessProfileApiService = {
  getBusinessProfile() {
    return aiApi.getBusinessProfile();
  },

  saveBusinessProfile(payload) {
    return aiApi.saveBusinessProfile(payload);
  },

  uploadLogo(formData) {
    return api.post('/uploads/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default businessProfileApiService;
