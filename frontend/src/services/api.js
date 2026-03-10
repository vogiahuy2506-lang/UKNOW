import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds timeout
});

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh-token'];

/**
 * Đọc token từ storage — ưu tiên localStorage, fallback sessionStorage.
 * Đồng bộ với authStore để hỗ trợ cả 2 chế độ remember me.
 * @param {string} key
 * @returns {string|null}
 */
const getStoredToken = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);

/**
 * Lưu token vào đúng storage đang chứa key hiện tại.
 * Nếu key chưa tồn tại ở đâu, mặc định lưu sessionStorage.
 * @param {string} key
 * @param {string} value
 */
const updateStoredToken = (key, value) => {
  if (localStorage.getItem(key) !== null) {
    localStorage.setItem(key, value);
  } else {
    sessionStorage.setItem(key, value);
  }
};

/**
 * Kiểm tra request có thuộc nhóm endpoint auth hay không.
 * Dùng để tránh redirect vòng lặp khi đang ở trang đăng nhập/đăng ký.
 * @param {string | undefined} requestUrl URL tương đối hoặc tuyệt đối của request
 * @returns {boolean} true nếu là auth endpoint
 */
const isAuthEndpointRequest = (requestUrl) => {
  if (!requestUrl) return false;
  return AUTH_ENDPOINTS.some((endpoint) => requestUrl.includes(endpoint));
};

/**
 * Đồng bộ trạng thái đăng xuất khi phiên không còn hợp lệ.
 * @returns {Promise<void>}
 */
const forceLogoutAndRedirect = async () => {
  try {
    await useAuthStore.getState().logout();
  } catch {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const statusCode = error.response?.status;
    const requestUrl = originalRequest?.url;
    const isAuthRequest = isAuthEndpointRequest(requestUrl);

    // Chỉ xử lý phiên cho các lỗi 401
    if (statusCode !== 401) {
      return Promise.reject(error);
    }

    // Không cưỡng bức logout với endpoint auth để giữ thông báo lỗi đăng nhập/đăng ký
    if (isAuthRequest) {
      return Promise.reject(error);
    }

    // Token lỗi sau khi đã retry hoặc request không hợp lệ -> logout cứng
    if (originalRequest?._retry) {
      await forceLogoutAndRedirect();
      return Promise.reject(error);
    }

    const refreshToken = getStoredToken('refreshToken');
    if (!refreshToken) {
      await forceLogoutAndRedirect();
      return Promise.reject(error);
    }

    if (statusCode === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;

      try {
        const response = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        updateStoredToken('accessToken', accessToken);
        updateStoredToken('refreshToken', newRefreshToken);

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        await forceLogoutAndRedirect();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
