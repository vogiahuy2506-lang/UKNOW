import api from '../../../services/api.js';

/**
 * Gọi GET /api/leads — danh sách khách đăng ký từ form landing (có phân trang + lọc).
 *
 * @param {object} params
 * @param {number} [params.page]
 * @param {number} [params.pageSize]
 * @param {boolean} [params.landingLeadsUseDateRange]
 * @param {string} [params.landingLeadsDateFrom]
 * @param {string} [params.landingLeadsDateTo]
 * @param {string[]} [params.landingLeadsOccupations]
 * @param {string[]} [params.landingLeadsInterests]
 * @param {import('axios').AxiosRequestConfig} [options]
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
export async function fetchLandingLeadsAdminList(params = {}, options = {}) {
  const q = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    landingLeadsUseDateRange:
      params.landingLeadsUseDateRange === true
      || params.landingLeadsUseDateRange === 'true'
      || params.landingLeadsUseDateRange === '1'
        ? 'true'
        : 'false',
    landingLeadsDateFrom: params.landingLeadsDateFrom || '',
    landingLeadsDateTo: params.landingLeadsDateTo || '',
    landingLeadsOccupations: JSON.stringify(
      Array.isArray(params.landingLeadsOccupations) ? params.landingLeadsOccupations : []
    ),
    landingLeadsInterests: JSON.stringify(
      Array.isArray(params.landingLeadsInterests) ? params.landingLeadsInterests : []
    ),
  };

  const { data } = await api.get('/leads', { params: q, ...options });
  if (!data?.success) {
    const err = new Error(data?.message || 'Không tải được danh sách');
    throw err;
  }
  return data.data;
}
