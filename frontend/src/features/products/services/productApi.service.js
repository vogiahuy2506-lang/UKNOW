import api from '../../../services/api';

const productApiService = {
  getProducts(params = {}) {
    return api.get('/products', { params });
  },

  /** Phễu theo sản phẩm (cần quyền reports_view): { filters, rows: [{ productId, submitted, registered, paid, revenue, formIds }] }. */
  getFunnel(params = {}) {
    return api.get('/products/funnel', { params });
  },

  getCategories() {
    return api.get('/products/categories');
  },

  uploadThumbnail(formData) {
    return api.post('/uploads/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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
