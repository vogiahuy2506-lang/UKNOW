import api from '../../../services/api.js';

/**
 * Lấy danh sách khóa học nổi bật từ API công khai.
 *
 * Dữ liệu là CỦA TỪNG tài khoản: server chỉ trả dòng của chủ landing ĐÃ XUẤT BẢN có `slug` này
 * (thiếu slug / chưa xuất bản → rỗng), không còn gộp mọi tài khoản.
 *
 * @param {string} slug slug landing đã xuất bản
 * @returns {Promise<object[]>}
 */
export async function fetchPublicLandingFeaturedCourses(slug) {
  const normalizedSlug = String(slug ?? '').trim();
  if (!normalizedSlug) return [];
  const { data } = await api.get('/public/landing-featured-courses', { params: { slug: normalizedSlug } });
  if (!data?.success || !Array.isArray(data.data)) return [];
  return data.data;
}

/**
 * Danh sách đầy đủ (admin).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchAdminLandingFeaturedCourses() {
  const { data } = await api.get('/admin/landing-featured-courses');
  if (!data?.success || !Array.isArray(data.data)) return [];
  return data.data;
}

/**
 * @param {object} payload
 */
export async function createLandingFeaturedCourse(payload) {
  const { data } = await api.post('/admin/landing-featured-courses', payload);
  return data?.data;
}

/**
 * @param {number|string} id
 * @param {object} payload
 */
export async function updateLandingFeaturedCourse(id, payload) {
  const { data } = await api.put(`/admin/landing-featured-courses/${id}`, payload);
  return data?.data;
}

/**
 * @param {number|string} id
 */
export async function deleteLandingFeaturedCourse(id) {
  await api.delete(`/admin/landing-featured-courses/${id}`);
}
