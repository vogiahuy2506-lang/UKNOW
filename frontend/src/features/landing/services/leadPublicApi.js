import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

/**
 * Client axios chỉ gọi API công khai (không gắn token).
 */
const publicClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

/**
 * Gửi lead từ form landing lên backend.
 *
 * Luồng hoạt động:
 * 1. POST JSON tới `/api/public/leads`.
 * 2. Trả về response axios (caller xử lý success/error).
 *
 * @param {object} payload
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function postPublicLead(payload) {
  return publicClient.post('/public/leads', payload);
}
