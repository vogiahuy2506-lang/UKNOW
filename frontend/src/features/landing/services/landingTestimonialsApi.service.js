import api from '../../../services/api.js';

/**
 * Lấy danh sách đánh giá từ API công khai (landing `/l`).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchPublicLandingTestimonials() {
  const { data } = await api.get('/public/landing-testimonials');
  if (!data?.success || !Array.isArray(data.data)) return [];
  return data.data;
}

/**
 * Danh sách đầy đủ (admin).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchAdminLandingTestimonials() {
  const { data } = await api.get('/admin/landing-testimonials');
  if (!data?.success || !Array.isArray(data.data)) return [];
  return data.data;
}

/**
 * @param {object} payload
 */
export async function createLandingTestimonial(payload) {
  const { data } = await api.post('/admin/landing-testimonials', payload);
  return data?.data;
}

/**
 * @param {number|string} id
 * @param {object} payload
 */
export async function updateLandingTestimonial(id, payload) {
  const { data } = await api.put(`/admin/landing-testimonials/${id}`, payload);
  return data?.data;
}

/**
 * @param {number|string} id
 */
export async function deleteLandingTestimonial(id) {
  await api.delete(`/admin/landing-testimonials/${id}`);
}
