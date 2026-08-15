import api from '../../services/api';

export const getStorageUsage = async () => {
  const response = await api.get('/storage/usage');
  return response?.data?.data || null;
};
