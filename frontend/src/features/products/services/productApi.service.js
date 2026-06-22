import api from '../../../services/api';

const productApiService = {
  getProducts(params = {}) {
    return api.get('/products', { params });
  },

  getProduct(id) {
    return api.get(`/products/${id}`);
  },

  createProduct(payload) {
    return api.post('/products', payload);
  },

  updateProduct(id, payload) {
    return api.put(`/products/${id}`, payload);
  },

  deleteProduct(id) {
    return api.delete(`/products/${id}`);
  },
};

export default productApiService;
