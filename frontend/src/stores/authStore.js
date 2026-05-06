import { create } from 'zustand';
import api from '../services/api';

/**
 * Lấy token từ storage (ưu tiên localStorage, fallback sessionStorage).
 * Dùng khi khởi tạo để hỗ trợ cả 2 chế độ remember me.
 *
 * @param {string} key - tên key
 * @returns {string|null}
 */
const getStoredToken = (key) =>
  localStorage.getItem(key) || sessionStorage.getItem(key);

/**
 * Lưu token vào storage tương ứng với chế độ remember me.
 *
 * @param {string} key - tên key
 * @param {string} value - giá trị token
 * @param {boolean} rememberMe - true → localStorage, false → sessionStorage
 */
const storeToken = (key, value, rememberMe) => {
  if (rememberMe) {
    localStorage.setItem(key, value);
  } else {
    sessionStorage.setItem(key, value);
  }
};

/**
 * Xóa token khỏi cả hai storage (đảm bảo logout sạch bất kể storage nào đang dùng).
 *
 * @param {string} key - tên key
 */
const removeToken = (key) => {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
};

/**
 * Chuẩn hóa thông tin user từ backend để phù hợp với frontend store.
 */
const normalizeUser = (user) => {
  if (!user) return null;
  
  // Map backend roles to frontend roleCode
  let roleCode = user.roleCode || 'employee';
  let roleName = user.roleName || 'Nhân viên';

  if (!user.roleCode && user.role) {
    if (user.role === 'super_admin' || user.role === 'user_admin') {
      roleCode = 'admin';
      roleName = user.role === 'super_admin' ? 'Super Admin' : 'Quản trị viên';
    } else if (user.role === 'employee') {
      roleCode = 'employee';
      roleName = 'Nhân viên';
    }
  }

  return {
    ...user,
    roleCode,
    roleName,
  };
};

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  /**
   * Khởi tạo trạng thái auth từ storage khi load app.
   * Kiểm tra cả localStorage và sessionStorage để hỗ trợ remember me.
   */
  initialize: async () => {
    const token = getStoredToken('accessToken');
    if (token) {
      try {
        const response = await api.get('/auth/me');
        const rawUser = response.data.data.user;
        set({
          user: normalizeUser(rawUser),
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        console.error('Auth initialization failed:', error);
        removeToken('accessToken');
        removeToken('refreshToken');
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } else {
      set({ isLoading: false, isAuthenticated: false });
    }
  },

  /**
   * Đăng nhập bằng username/password.
   * Mặc định bật ghi nhớ đăng nhập để phiên có thể dùng lại trên tab mới.
   *
   * @param {string} username - tên đăng nhập
   * @param {string} password - mật khẩu
   * @param {boolean} rememberMe - ghi nhớ đăng nhập
   * @returns {object} response data
   */
  login: async (username, password, rememberMe = true) => {
    const response = await api.post('/auth/login', { username, password });
    const { user, accessToken, refreshToken } = response.data.data;

    storeToken('accessToken', accessToken, rememberMe);
    storeToken('refreshToken', refreshToken, rememberMe);

    set({
      user: normalizeUser(user),
      isAuthenticated: true,
    });

    return response.data;
  },

  /**
   * Đăng nhập / đăng ký bằng Google.
   */
  googleLogin: async (credential, rememberMe = true) => {
    const response = await api.post('/auth/google-login', { credential });
    const { user, accessToken, refreshToken } = response.data.data;

    storeToken('accessToken', accessToken, rememberMe);
    storeToken('refreshToken', refreshToken, rememberMe);

    set({
      user: normalizeUser(user),
      isAuthenticated: true,
    });

    return response.data;
  },

  // Register (giữ lại cho trường hợp backend dùng nội bộ)
  register: async (data) => {
    const response = await api.post('/auth/register', data);
    const { user, accessToken, refreshToken } = response.data.data;

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    set({
      user: normalizeUser(user),
      isAuthenticated: true,
    });

    return response.data;
  },

  /**
   * Đăng xuất: thu hồi refresh token, xóa tokens khỏi mọi storage.
   *
   * @param {{skipServer?: boolean}} [options] cấu hình logout
   * @param {boolean} [options.skipServer=false] true để chỉ logout local, không gọi API server
   */
  logout: async (options = {}) => {
    const shouldSkipServerLogout = Boolean(options?.skipServer);
    try {
      if (!shouldSkipServerLogout) {
        const refreshToken = getStoredToken('refreshToken');
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Bỏ qua lỗi logout phía server, vẫn xóa local state
    } finally {
      removeToken('accessToken');
      removeToken('refreshToken');
      set({
        user: null,
        isAuthenticated: false,
      });
    }
  },

  /** Cập nhật thông tin user trong store. */
  updateUser: (user) => {
    set({ user: normalizeUser(user) });
  },

  /** Xác định user hiện tại có phải admin hay không. */
  isAdmin: () => String(get().user?.roleCode || '').trim().toLowerCase() === 'admin',
}));

// Khởi tạo auth khi app load
useAuthStore.getState().initialize();
