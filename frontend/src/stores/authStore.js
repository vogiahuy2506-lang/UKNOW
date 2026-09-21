import { create } from 'zustand';
import api, { setAuthStore } from '../services/api';
import { buildBillingStatusFromProfile } from '../utils/billingProfile.util.js';
import { notifyStorageQuotaClear, notifyStorageQuotaRefresh } from '../features/storage/storageEvents';
import { clearQueryCache, queryClient } from '../lib/queryClient';

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

// Chữ ký để so hai ngữ cảnh nhân viên: chỉ những gì màn hình thật sự dùng (quyền, giới hạn, tên/ảnh
// công ty). So bằng chữ ký chứ không so từng khoá, để lần làm mới không đổi gì thì KHÔNG set lại store
// (set lại = render thừa cả app mỗi lần cửa sổ lấy lại focus).
const contextSignature = (ctx) => JSON.stringify([
  ctx?.ownerId == null ? null : String(ctx.ownerId), // tìm membership theo String — chữ ký cũng phải vậy
  ctx?.ownerName ?? null,
  ctx?.ownerAvatarUrl ?? null,
  ctx?.permissions ?? null,
  ctx?.dailyEmailLimit ?? null,
  ctx?.monthlyEmailLimit ?? null,
  ctx?.dailyZaloLimit ?? null,
  ctx?.monthlyZaloLimit ?? null,
]);

/**
 * Đối chiếu ngữ cảnh đang dùng với danh sách membership MỚI NHẤT của server (PLAN_NHAN_VIEN mục 5.3).
 * `activeContext.permissions` là ảnh chụp lúc đăng nhập — chủ đổi quyền/thêm/gỡ nhân viên xong thì
 * ảnh chụp đó cũ đi mà không ai cập nhật, tới khi nhân viên F5.
 *
 *   - 'unchanged'     — đang ở `self`, hoặc ngữ cảnh nhân viên vẫn khớp membership (không làm gì).
 *   - 'updated'       — cùng công ty nhưng quyền/giới hạn/tên đổi → thay ngữ cảnh, KHÔNG xoá cache
 *                       (dữ liệu vẫn của cùng một không gian, chỉ cần tải lại những request từng 403).
 *   - 'workspaceLost' — membership biến mất hoặc bị khoá (`isLocked`) → về ngữ cảnh mặc định; đây là
 *                       đổi không gian nên phải xoá cache như `switchContext`.
 */
export const reconcileActiveContext = (user, activeContext) => {
  if (activeContext?.type !== 'employee') return { kind: 'unchanged', context: activeContext };

  const membership = (user?.memberships || []).find(
    (m) => String(m.ownerId) === String(activeContext.ownerId)
  );
  if (!membership || membership.isLocked) {
    return { kind: 'workspaceLost', context: pickDefaultContext(user) };
  }

  const next = buildEmployeeContext(membership);
  return contextSignature(next) === contextSignature(activeContext)
    ? { kind: 'unchanged', context: activeContext }
    : { kind: 'updated', context: next };
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
    // Migration 229: server đã ghi "bỏ qua nhập mã giới thiệu" → cổng không hỏi lại ở máy nào.
    referralPromptDismissedAt: user.referralPromptDismissedAt ?? user.referral_prompt_dismissed_at ?? null,
    roleCode,
    roleName,
    memberships: user.memberships || [],
  };
};

const EMPTY_SEND_USAGE = {
  email: { used: 0, limit: null },
  zalo: { used: 0, limit: null },
};

// Single-flight cho refreshCurrentUser() — gộp các lần gọi chồng nhau (effect + CTA,
// StrictMode double-invoke) thành một request thay vì bắn trùng.
let refreshCurrentUserInFlight = null;

// Single-flight + cache cho fetchPhoneOtpEnabled() (PR-2, xác thực SĐT). Khác
// refreshCurrentUserInFlight: KHÔNG reset về null khi thành công — cờ tính năng gần như
// tĩnh (chỉ đổi khi backend restart với PHONE_OTP_PROVIDER khác), không cần fetch lại mỗi
// lần gọi. Chỉ reset khi lỗi, để một lần gọi sau (vd Register.jsx mount muộn hơn app khởi
// động) có cơ hội thử lại nếu lần đầu chỉ là mạng chập chờn.
let phoneOtpEnabledFetchPromise = null;

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
  // PR-2 (xác thực SĐT) — mặc định false: chưa fetch xong, lỗi mạng, hay backend tắt tính
  // năng đều cùng một giá trị an toàn. Không có "đang tải" riêng — false là trạng thái đúng
  // để hiển thị (ô SĐT hiện, modal một bước) cho tới khi biết chắc là true.
  phoneOtpEnabled: false,
  /** PR-B: Cờ tắt nhắc SĐT trong phiên hiện tại (không lưu storage, reset khi logout/login). */
  phoneReminderDismissed: false,
  /** Cờ tắt popup mã giới thiệu trong phiên hiện tại. */
  referralPromptDismissed: false,

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
   * Tải lại user hiện tại từ server (vd: ngay sau khi checkout thành công — gói/plan
   * có thể vừa đổi). Khác `initialize()`: lỗi mạng/5xx KHÔNG xoá token/đăng xuất, chỉ
   * cập nhật khi có response hợp lệ. 401 thật thì interceptor refresh-token của `api`
   * đã tự retry trước khi lỗi lọt tới đây — không cần xử lý logout riêng ở action này.
   * Single-flight: nhiều lời gọi chồng nhau (effect + CTA, StrictMode) dùng chung 1 promise.
   */
  refreshCurrentUser: async () => {
    if (!get().isAuthenticated) return { success: false };
    if (refreshCurrentUserInFlight) return refreshCurrentUserInFlight;

    refreshCurrentUserInFlight = (async () => {
      try {
        const response = await api.get('/auth/me');
        const rawUser = response.data.data.user;
        const normalizedUser = normalizeUser(rawUser);

        // Bỏ qua nếu đã logout hoặc đổi sang tài khoản khác trong lúc chờ response —
        // response này thuộc về phiên cũ, áp lại sẽ ghi đè sai user hiện tại.
        const isStale = () => {
          const now = get();
          return !now.isAuthenticated || String(now.user?.id) !== String(normalizedUser?.id);
        };
        const current = get();
        if (isStale()) return { success: false };

        // Nhân viên đang đăng nhập: chủ vừa cấp/đổi/gỡ quyền hoặc gỡ họ khỏi team → dựng lại
        // ngữ cảnh từ membership mới (trước đây chỉ `user` được cập nhật, `activeContext` đứng nguyên).
        const reconciled = reconcileActiveContext(normalizedUser, current.activeContext);

        if (reconciled.kind === 'workspaceLost') {
          // Đổi không gian → xoá cache TRƯỚC khi đổi ngữ cảnh, đúng thứ tự của switchContext.
          saveContext(reconciled.context);
          notifyStorageQuotaClear();
          await clearQueryCache();
          if (isStale()) return { success: false };
          set({ user: normalizedUser, activeContext: reconciled.context });
          notifyStorageQuotaRefresh();
          return { success: true, user: normalizedUser, contextChanged: true };
        }

        if (reconciled.kind === 'updated') {
          saveContext(reconciled.context);
          set({ user: normalizedUser, activeContext: reconciled.context });
          // Cùng không gian: KHÔNG xoá cache, chỉ đánh dấu cũ để các request từng 403 tự gọi lại.
          queryClient.invalidateQueries();
          return { success: true, user: normalizedUser, contextChanged: true };
        }

        // Không có gì đổi thì đừng set: user mới luôn là object mới, set lại làm mọi component
        // đang subscribe `user` render lại — mà lần làm mới này giờ chạy mỗi lần quay lại tab.
        if (JSON.stringify(current.user) !== JSON.stringify(normalizedUser)) {
          set({ user: normalizedUser });
        }
        return { success: true, user: normalizedUser, contextChanged: false };
      } catch (error) {
        console.error('[AuthStore] refreshCurrentUser failed:', error?.message || error);
        return { success: false, error };
      } finally {
        refreshCurrentUserInFlight = null;
      }
    })();

    return refreshCurrentUserInFlight;
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

    set({ user: normalizedUser, isAuthenticated: true, activeContext, phoneReminderDismissed: false, referralPromptDismissed: false });

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

    set({ user: normalizedUser, isAuthenticated: true, activeContext, phoneReminderDismissed: false, referralPromptDismissed: false });

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

    set({ user: normalizedUser, isAuthenticated: true, activeContext, phoneReminderDismissed: false, referralPromptDismissed: false });

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
        phoneReminderDismissed: false,
        referralPromptDismissed: false,
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

  /** Tắt nhắc SĐT trong phiên xem hiện tại. */
  dismissPhoneReminder: () => {
    set({ phoneReminderDismissed: true });
  },

  /** Tắt popup nhắc mã giới thiệu trong phiên xem hiện tại. */
  dismissReferralPrompt: () => {
    set({ referralPromptDismissed: true });
  },

  /**
   * Nạp cờ tính năng OTP SĐT (PR-2, public — không cần đăng nhập). Gọi lúc app khởi động
   * (dưới cùng file này) và lại ở Register.jsx làm lưới an toàn — single-flight nên gọi
   * nhiều lần chỉ tạo đúng một request đang bay.
   *
   * Cờ tắt HOẶC fetch lỗi đều coi như tắt (giữ mặc định `phoneOtpEnabled: false`) — đây là
   * đường lùi nếu sếp đổi ý thứ Hai: mọi màn hình (Register, PhoneRequiredModal, MainLayout)
   * phải y như trước khi có PR-2 trong cả hai trường hợp "tắt thật" và "không biết được".
   *
   * @returns {Promise<boolean>}
   */
  fetchPhoneOtpEnabled: async () => {
    if (phoneOtpEnabledFetchPromise) return phoneOtpEnabledFetchPromise;
    phoneOtpEnabledFetchPromise = (async () => {
      try {
        const response = await api.get('/auth/features');
        const enabled = Boolean(response.data?.data?.phoneOtpEnabled);
        set({ phoneOtpEnabled: enabled });
        return enabled;
      } catch (error) {
        console.warn('[AuthStore] fetchPhoneOtpEnabled lỗi, coi như tắt:', error?.message || error);
        set({ phoneOtpEnabled: false });
        // Reset để một lần gọi SAU (không phải lần đang chờ) có cơ hội thử lại — khác
        // nhánh thành công ở trên, cố ý KHÔNG cache một lỗi mạng tạm thời mãi mãi.
        phoneOtpEnabledFetchPromise = null;
        return false;
      }
    })();
    return phoneOtpEnabledFetchPromise;
  },

  /** Xác định user hiện tại có phải admin hay không. */
  isAdmin: () => String(get().user?.roleCode || '').trim().toLowerCase() === 'admin',
}));

setAuthStore(useAuthStore);

// Khởi tạo auth khi app load
useAuthStore.getState().initialize();

// Nạp cờ tính năng OTP SĐT ngay khi app load — KHÔNG phụ thuộc token (public), nên gọi ở
// đây thay vì trong initialize() (initialize() chỉ chạy nhánh fetch khi có token sẵn).
useAuthStore.getState().fetchPhoneOtpEnabled();
