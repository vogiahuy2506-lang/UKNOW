import { create } from 'zustand';
import api, { setAuthStore } from '../services/api';
import { buildBillingStatusFromProfile } from '../utils/billingProfile.util.js';
import { notifyStorageQuotaClear, notifyStorageQuotaRefresh } from '../features/storage/storageEvents';
import { clearQueryCache } from '../lib/queryClient';

const CONTEXT_STORAGE_KEY = 'founder_ai_active_context';

export const trialWelcomeKey = (userId) => `founderai_trial_welcome_${userId}`;

// Storage guard: an toàn cho SSR / test env không có window. Không throw nếu storage
// bị chặn (private mode, cookie-less sandbox) — trả fallback để app vẫn chạy.
const hasWindowStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeGetItem = (storage, key) => {
  if (!hasWindowStorage()) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetItem = (storage, key, value) => {
  if (!hasWindowStorage()) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* storage full / disabled — ignore */
  }
};

const safeRemoveItem = (storage, key) => {
  if (!hasWindowStorage()) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
};

const getStoredToken = (key) =>
  safeGetItem(window.localStorage, key) || safeGetItem(window.sessionStorage, key);

const storeToken = (key, value, rememberMe) => {
  if (rememberMe) {
    safeSetItem(window.localStorage, key, value);
  } else {
    safeSetItem(window.sessionStorage, key, value);
  }
};

const removeToken = (key) => {
  safeRemoveItem(window.localStorage, key);
  safeRemoveItem(window.sessionStorage, key);
};

/**
 * Khôi phục activeContext từ sessionStorage (mất khi đóng tab, không persist qua logout).
 * Trả về null nếu không có hoặc đã stale.
 */
const loadStoredContext = () => {
  const raw = safeGetItem(window.sessionStorage, CONTEXT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveContext = (ctx) => {
  if (ctx && ctx.type === 'employee') {
    safeSetItem(window.sessionStorage, CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
  } else {
    safeRemoveItem(window.sessionStorage, CONTEXT_STORAGE_KEY);
  }
};

/** Build employee context object từ membership row (snapshot dữ liệu hiện tại). */
const buildEmployeeContext = (membership) => ({
  type: 'employee',
  ownerId: membership.ownerId,
  ownerName: membership.ownerName || membership.ownerUsername,
  ownerAvatarUrl: membership.ownerAvatarUrl,
  permissions: membership.permissions,
  dailyEmailLimit: membership.dailyEmailLimit ?? null,
  monthlyEmailLimit: membership.monthlyEmailLimit ?? null,
  dailyZaloLimit: membership.dailyZaloLimit ?? null,
  monthlyZaloLimit: membership.monthlyZaloLimit ?? null,
});

/**
 * Chọn ngữ cảnh mặc định sau khi đăng nhập / khởi tạo:
 *   - Nếu user không có plan (active_plan_id null) NHƯNG là employee của ít nhất 1 owner
 *     → tự động vào context employee đầu tiên để họ thấy được dashboard
 *   - Nếu có plan → mặc định 'self'
 *   - Admin → luôn 'self'
 */
const pickDefaultContext = (user) => {
  if (!user || user.role === 'admin') return { type: 'self' };
  const memberships = user.memberships || [];
  const hasPlan = !!user.active_plan_id;
  if (!hasPlan && memberships.length > 0) {
    return buildEmployeeContext(memberships[0]);
  }
  return { type: 'self' };
};

/**
 * Chuẩn hóa thông tin user từ backend để phù hợp với frontend store.
 */
const normalizeUser = (user) => {
  if (!user) return null;

  let roleCode = user.roleCode || 'user';
  let roleName = user.roleName || 'Người dùng';

  if (!user.roleCode && user.role) {
    if (user.role === 'admin') {
      roleCode = 'admin';
      roleName = 'Super Admin';
    } else {
      roleCode = 'user';
      roleName = 'Người dùng';
    }
  }

  return {
    ...user,
    activePlanId: user.activePlanId ?? user.active_plan_id ?? null,
    activeBillingPeriod: user.activeBillingPeriod ?? user.active_billing_period ?? 'monthly',
    roleCode,
    roleName,
    memberships: user.memberships || [],
  };
};

const EMPTY_SEND_USAGE = {
  email: { used: 0, limit: null },
  zalo: { used: 0, limit: null },
};

const billingSliceFromProfile = (profile = {}) => ({
  aiCredits: {
    used: Number(profile.aiCreditsUsed || 0),
    limit: profile.aiCreditsPerPeriod ?? null,
  },
  sendUsage: {
    email: {
      used: Number(profile.emailSentMonth || 0),
      limit: profile.monthlyEmailLimit ?? null,
    },
    zalo: {
      used: Number(profile.zaloSentMonth || 0),
      limit: profile.monthlyZaloLimit ?? null,
    },
  },
  addons: profile.addons ?? null,
  billingStatus: buildBillingStatusFromProfile(profile),
});

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  aiCredits: { used: 0, limit: null },
  sendUsage: { ...EMPTY_SEND_USAGE },
  addons: null,
  billingStatus: null,
  /** Ngữ cảnh hoạt động hiện tại: { type: 'self' } hoặc { type: 'employee', ownerId, ownerName, ... } */
  activeContext: { type: 'self' },

  /**
   * Khởi tạo trạng thái auth từ storage khi load app.
   */
  initialize: async () => {
    const token = getStoredToken('accessToken');
    if (token) {
      try {
        const response = await api.get('/auth/me');
        const rawUser = response.data.data.user;
        const normalizedUser = normalizeUser(rawUser);

        // Khôi phục context đã lưu (nếu vẫn còn trong memberships); nếu không, chọn default thông minh
        const storedCtx = loadStoredContext();
        let activeContext = null;
        if (storedCtx?.type === 'employee' && normalizedUser?.memberships) {
          const membership = normalizedUser.memberships.find(
            (m) => String(m.ownerId) === String(storedCtx.ownerId)
          );
          if (membership) {
            activeContext = buildEmployeeContext(membership);
          }
        }
        if (!activeContext) {
          activeContext = pickDefaultContext(normalizedUser);
          saveContext(activeContext);
        }

        set({
          user: normalizedUser,
          isAuthenticated: true,
          isLoading: false,
          activeContext,
        });
      } catch (error) {
        console.error('Auth initialization failed:', error);
        removeToken('accessToken');
        removeToken('refreshToken');
        safeRemoveItem(window.sessionStorage, CONTEXT_STORAGE_KEY);
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          aiCredits: { used: 0, limit: null },
          sendUsage: { ...EMPTY_SEND_USAGE },
          addons: null,
          billingStatus: null,
          activeContext: { type: 'self' },
        });
      }
    } else {
      set({ isLoading: false, isAuthenticated: false });
    }
  },

  /**
   * Đăng nhập bằng username/password.
   */
  login: async (username, password, rememberMe = true) => {
    const response = await api.post('/auth/login', { username, password, rememberMe });
    const { user, accessToken } = response.data.data;

    storeToken('accessToken', accessToken, rememberMe);
    const normalizedUser = normalizeUser(user);
    const activeContext = pickDefaultContext(normalizedUser);
    saveContext(activeContext);

    set({ user: normalizedUser, isAuthenticated: true, activeContext });

    return response.data;
  },

  /**
   * Đăng nhập / đăng ký bằng Google.
   */
  googleLogin: async (tokenData, rememberMe = true) => {
    const response = await api.post('/auth/google-login', tokenData);
    const { user, accessToken, trial } = response.data.data;

    storeToken('accessToken', accessToken, rememberMe);
    const normalizedUser = normalizeUser(user);
    const activeContext = pickDefaultContext(normalizedUser);
    saveContext(activeContext);

    if (trial && normalizedUser?.id) {
      try {
        localStorage.setItem(trialWelcomeKey(normalizedUser.id), JSON.stringify(trial));
      } catch {
        // ignore localStorage quota error
      }
    }

    set({ user: normalizedUser, isAuthenticated: true, activeContext });

    return response.data;
  },

  register: async (data) => {
    const response = await api.post('/auth/register', data);
    const { user, accessToken, trial } = response.data.data;

    safeSetItem(window.localStorage, 'accessToken', accessToken);
    const normalizedUser = normalizeUser(user);
    const activeContext = pickDefaultContext(normalizedUser);
    saveContext(activeContext);

    if (trial && normalizedUser?.id) {
      try {
        localStorage.setItem(trialWelcomeKey(normalizedUser.id), JSON.stringify(trial));
      } catch {
        // ignore localStorage quota error
      }
    }

    set({ user: normalizedUser, isAuthenticated: true, activeContext });

    return response.data;
  },

  /**
   * Đăng xuất: thu hồi refresh token, xóa tokens khỏi mọi storage.
   */
  logout: async (options = {}) => {
    const shouldSkipServerLogout = Boolean(options?.skipServer);
    try {
      if (!shouldSkipServerLogout) {
        await api.post('/auth/logout', {});
      }
    } catch {
      // Bỏ qua lỗi logout phía server
    } finally {
      removeToken('accessToken');
      safeRemoveItem(window.sessionStorage, CONTEXT_STORAGE_KEY);
      notifyStorageQuotaClear();
      await clearQueryCache();
      set({

        user: null,
        isAuthenticated: false,
        aiCredits: { used: 0, limit: null },
        sendUsage: { ...EMPTY_SEND_USAGE },
        addons: null,
        billingStatus: null,
        activeContext: { type: 'self' },
      });
    }
  },

  /** Lấy credit AI + trạng thái gói từ profile tài khoản/billing owner. */
  fetchAiCredits: async () => {
    if (!get().isAuthenticated) {
      set({
        aiCredits: { used: 0, limit: null },
        sendUsage: { ...EMPTY_SEND_USAGE },
        addons: null,
        billingStatus: null,
      });
      return { used: 0, limit: null };
    }

    const response = await api.get('/users/profile');
    const profile = response?.data?.data || {};
    const slice = billingSliceFromProfile(profile);
    set(slice);
    return slice.aiCredits;
  },

  /** Đồng bộ billing từ payload profile đã có (tránh gọi API trùng). */
  syncBillingFromProfile: (profile = {}) => {
    set(billingSliceFromProfile(profile));
  },

  /**
   * Chuyển ngữ cảnh hoạt động.
   * @param {number|string|null} ownerId - null để về self context
   */
  switchContext: async (ownerId) => {
    const { user } = get();

    if (!ownerId) {
      const ctx = { type: 'self' };
      saveContext(ctx);
      notifyStorageQuotaClear();
      await clearQueryCache();
      set({ activeContext: ctx });
      notifyStorageQuotaRefresh();
      return;
    }

    const membership = user?.memberships?.find(
      (m) => String(m.ownerId) === String(ownerId)
    );

    if (!membership) {
      console.warn('[AuthStore] switchContext: membership not found for ownerId', ownerId);
      return;
    }

    const ctx = {
      type: 'employee',
      ownerId: membership.ownerId,
      ownerName: membership.ownerName || membership.ownerUsername,
      ownerAvatarUrl: membership.ownerAvatarUrl,
      permissions: membership.permissions,
      dailyEmailLimit: membership.dailyEmailLimit ?? null,
      monthlyEmailLimit: membership.monthlyEmailLimit ?? null,
      dailyZaloLimit: membership.dailyZaloLimit ?? null,
      monthlyZaloLimit: membership.monthlyZaloLimit ?? null,
    };

    saveContext(ctx);
    notifyStorageQuotaClear();
    await clearQueryCache();
    set({ activeContext: ctx });
    notifyStorageQuotaRefresh();
  },



  /** Cập nhật thông tin user trong store. */
  updateUser: (user) => {
    set({ user: normalizeUser(user) });
  },

  /** Xác định user hiện tại có phải admin hay không. */
  isAdmin: () => String(get().user?.roleCode || '').trim().toLowerCase() === 'admin',
}));

setAuthStore(useAuthStore);

// Khởi tạo auth khi app load
useAuthStore.getState().initialize();
