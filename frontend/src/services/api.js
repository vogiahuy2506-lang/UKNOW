import axios from 'axios';
import React from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { getStoredLocale } from '../utils/i18n';
import vi from '../i18n/vi';
import en from '../i18n/en';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  withCredentials: true,
});

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh-token', '/auth/logout'];
let isForcingLogout = false;

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
  if (isForcingLogout) return;
  isForcingLogout = true;
  try {
    // Dọn local auth state khi interceptor bắt phiên hết hạn, không gọi lại API logout
    // để tránh vòng lặp 401 -> logout -> 401 -> logout.
    await useAuthStore.getState().logout({ skipServer: true });
  } catch {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
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

    // Tự động gắn X-Owner-Context khi user đang ở ngữ cảnh employee
    const { activeContext } = useAuthStore.getState();
    if (activeContext?.type === 'employee' && activeContext.ownerId) {
      config.headers['X-Owner-Context'] = String(activeContext.ownerId);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const getLimitReachedLabel = () => {
  const locale = getStoredLocale();
  const tr = locale === 'en' ? en : vi;
  return tr?.plans?.upgrade || 'Nâng cấp';
};

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const statusCode = error.response?.status;
    const requestUrl = originalRequest?.url;
    const isAuthRequest = isAuthEndpointRequest(requestUrl);

    // Khi server báo đạt giới hạn tài nguyên → show upgrade toast toàn app
    if (error.response?.data?.limitReached) {
      const msg = error.response.data.message;
      toast.custom(
        (tst) => React.createElement(
          'div',
          {
            style: {
              display: 'flex', flexDirection: 'column', gap: 6,
              background: '#fff', borderRadius: 8, padding: '12px 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              opacity: tst.visible ? 1 : 0, transition: 'opacity 0.2s',
            },
          },
          React.createElement('p', { style: { fontSize: 14, color: '#1f2937', margin: 0 } }, msg),
          React.createElement(
            'button',
            {
              onClick: () => { toast.dismiss(tst.id); window.location.href = '/pricing'; },
              style: {
                alignSelf: 'flex-start', fontSize: 12, fontWeight: 600,
                color: '#f97316', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0,
              },
            },
            `${getLimitReachedLabel()} →`
          )
        ),
        { duration: 8000 }
      );
      error._upgradeToastShown = true;
      return Promise.reject(error);
    }

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

    if (statusCode === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;

      try {
        const response = await axios.post(`${API_URL}/auth/refresh-token`, {}, {
          withCredentials: true,
        });

        const { accessToken } = response.data.data;
        updateStoredToken('accessToken', accessToken);

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
