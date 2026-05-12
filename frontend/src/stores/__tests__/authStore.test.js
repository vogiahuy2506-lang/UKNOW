/**
 * Test suite cho authStore.js (Zustand).
 *
 * Phạm vi:
 *   - normalizeUser: roleCode/roleName từ user.role legacy.
 *   - pickDefaultContext: admin / no-plan + memberships / có plan.
 *   - initialize: token storage → /auth/me → set user, restore stored context,
 *     fallback default context; lỗi → clear storage + reset state.
 *   - login / googleLogin / register: lưu token đúng storage theo rememberMe,
 *     set user + context.
 *   - logout: gọi /auth/logout (trừ khi skipServer), clear storage.
 *   - switchContext: self ↔ employee, ignore ownerId không tồn tại.
 *   - isAdmin: case-insensitive roleCode.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const { default: api } = await import('../../services/api');
// Reset state trước khi import store (initialize() chạy ngay khi import lần đầu).
api.get.mockRejectedValue(new Error('no token')); // initial call sẽ fail êm.
const { useAuthStore } = await import('../authStore');

const CONTEXT_KEY = 'founder_ai_active_context';

const resetStoreState = () => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    activeContext: { type: 'self' },
  });
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
  resetStoreState();
});

afterEach(() => {
  resetStoreState();
});

// ───────────────────────────────────────── normalizeUser ────────────
describe('normalizeUser (qua updateUser)', () => {
  it('user không có roleCode + role="admin" → roleCode/Name admin', () => {
    useAuthStore.getState().updateUser({ id: 1, username: 'sa', role: 'admin' });
    const u = useAuthStore.getState().user;
    expect(u.roleCode).toBe('admin');
    expect(u.roleName).toBe('Super Admin');
  });

  it('user không có roleCode + role="user" → roleCode "user"', () => {
    useAuthStore.getState().updateUser({ id: 2, role: 'user' });
    const u = useAuthStore.getState().user;
    expect(u.roleCode).toBe('user');
    expect(u.roleName).toBe('Người dùng');
  });

  it('user đã có roleCode → giữ nguyên', () => {
    useAuthStore.getState().updateUser({ id: 3, roleCode: 'manager', roleName: 'Quản lý' });
    const u = useAuthStore.getState().user;
    expect(u.roleCode).toBe('manager');
    expect(u.roleName).toBe('Quản lý');
  });

  it('memberships mặc định = [] nếu thiếu', () => {
    useAuthStore.getState().updateUser({ id: 4 });
    expect(useAuthStore.getState().user.memberships).toEqual([]);
  });

  it('updateUser(null) → user = null', () => {
    useAuthStore.getState().updateUser({ id: 5 });
    useAuthStore.getState().updateUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

// ───────────────────────────────────────── isAdmin ──────────────────
describe('isAdmin', () => {
  it('roleCode="admin" → true', () => {
    useAuthStore.setState({ user: { roleCode: 'admin' } });
    expect(useAuthStore.getState().isAdmin()).toBe(true);
  });

  it('roleCode="ADMIN" (uppercase) + whitespace → true', () => {
    useAuthStore.setState({ user: { roleCode: '  ADMIN  ' } });
    expect(useAuthStore.getState().isAdmin()).toBe(true);
  });

  it('roleCode="user" → false', () => {
    useAuthStore.setState({ user: { roleCode: 'user' } });
    expect(useAuthStore.getState().isAdmin()).toBe(false);
  });

  it('user null → false (không throw)', () => {
    useAuthStore.setState({ user: null });
    expect(useAuthStore.getState().isAdmin()).toBe(false);
  });
});

// ───────────────────────────────────────── login ────────────────────
describe('login', () => {
  it('rememberMe=true → lưu accessToken vào localStorage', async () => {
    api.post.mockResolvedValue({
      data: { data: { user: { id: 1, username: 'u1', role: 'user' }, accessToken: 'tok-abc' } },
    });
    await useAuthStore.getState().login('u1', 'pwd', true);
    expect(localStorage.getItem('accessToken')).toBe('tok-abc');
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user.id).toBe(1);
  });

  it('rememberMe=false → lưu accessToken vào sessionStorage', async () => {
    api.post.mockResolvedValue({
      data: { data: { user: { id: 2, role: 'user' }, accessToken: 'tok-xyz' } },
    });
    await useAuthStore.getState().login('u2', 'pwd', false);
    expect(sessionStorage.getItem('accessToken')).toBe('tok-xyz');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('gọi /auth/login với { username, password, rememberMe }', async () => {
    api.post.mockResolvedValue({
      data: { data: { user: { id: 1, role: 'user' }, accessToken: 't' } },
    });
    await useAuthStore.getState().login('alice', 'secret', true);
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      username: 'alice',
      password: 'secret',
      rememberMe: true,
    });
  });

  it('user có active_plan_id → activeContext = self', async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          user: { id: 1, role: 'user', active_plan_id: 5, memberships: [{ ownerId: 99 }] },
          accessToken: 't',
        },
      },
    });
    await useAuthStore.getState().login('u', 'p', true);
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
    expect(sessionStorage.getItem(CONTEXT_KEY)).toBeNull();
  });

  it('user role=admin → activeContext = self bất kể có membership', async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          user: { id: 1, role: 'admin', memberships: [{ ownerId: 99, ownerName: 'X' }] },
          accessToken: 't',
        },
      },
    });
    await useAuthStore.getState().login('sa', 'p', true);
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
  });

  it('user role=user, không có plan, có membership → activeContext = employee đầu tiên', async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          user: {
            id: 1,
            role: 'user',
            active_plan_id: null,
            memberships: [
              {
                ownerId: 77,
                ownerName: 'Owner A',
                ownerUsername: 'ownera',
                ownerAvatarUrl: '/a.png',
                permissions: ['view_campaign'],
                dailyEmailLimit: 100,
              },
              { ownerId: 88, ownerName: 'Owner B' },
            ],
          },
          accessToken: 't',
        },
      },
    });
    await useAuthStore.getState().login('u', 'p', true);
    const ctx = useAuthStore.getState().activeContext;
    expect(ctx).toMatchObject({
      type: 'employee',
      ownerId: 77,
      ownerName: 'Owner A',
      permissions: ['view_campaign'],
      dailyEmailLimit: 100,
    });
    // Context được persist xuống sessionStorage.
    expect(JSON.parse(sessionStorage.getItem(CONTEXT_KEY))).toMatchObject({ ownerId: 77 });
  });

  it('API reject → throw lên caller', async () => {
    api.post.mockRejectedValue(new Error('401 invalid creds'));
    await expect(useAuthStore.getState().login('u', 'bad', true)).rejects.toThrow('401');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ───────────────────────────────────────── googleLogin / register ───
describe('googleLogin / register', () => {
  it('googleLogin POST /auth/google-login với { credential }', async () => {
    api.post.mockResolvedValue({
      data: { data: { user: { id: 1, role: 'user' }, accessToken: 'g-tok' } },
    });
    await useAuthStore.getState().googleLogin('google-jwt-credential', false);
    expect(api.post).toHaveBeenCalledWith('/auth/google-login', { credential: 'google-jwt-credential' });
    expect(sessionStorage.getItem('accessToken')).toBe('g-tok');
  });

  it('register POST /auth/register; LUÔN lưu vào localStorage (không có rememberMe option)', async () => {
    api.post.mockResolvedValue({
      data: { data: { user: { id: 1, role: 'user' }, accessToken: 'reg-tok' } },
    });
    await useAuthStore.getState().register({ username: 'new', password: 'p', email: 'a@x.com' });
    expect(api.post).toHaveBeenCalledWith('/auth/register', { username: 'new', password: 'p', email: 'a@x.com' });
    expect(localStorage.getItem('accessToken')).toBe('reg-tok');
  });
});

// ───────────────────────────────────────── logout ───────────────────
describe('logout', () => {
  it('mặc định → gọi /auth/logout + clear cả 2 storage', async () => {
    localStorage.setItem('accessToken', 'tok');
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ type: 'employee', ownerId: 1 }));
    useAuthStore.setState({ user: { id: 1 }, isAuthenticated: true });
    api.post.mockResolvedValue({ data: { success: true } });

    await useAuthStore.getState().logout();

    expect(api.post).toHaveBeenCalledWith('/auth/logout', {});
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem(CONTEXT_KEY)).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
  });

  it('skipServer: true → KHÔNG gọi /auth/logout nhưng vẫn clear storage', async () => {
    localStorage.setItem('accessToken', 'tok');
    useAuthStore.setState({ user: { id: 1 }, isAuthenticated: true });

    await useAuthStore.getState().logout({ skipServer: true });
    expect(api.post).not.toHaveBeenCalled();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('/auth/logout throw → vẫn clear state (finally block)', async () => {
    localStorage.setItem('accessToken', 'tok');
    api.post.mockRejectedValue(new Error('Network'));
    await useAuthStore.getState().logout();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ───────────────────────────────────────── switchContext ───────────
describe('switchContext', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: 1,
        role: 'user',
        memberships: [
          {
            ownerId: 77,
            ownerName: 'Owner A',
            permissions: ['view'],
            dailyEmailLimit: 50,
            monthlyEmailLimit: 1000,
          },
        ],
      },
      activeContext: { type: 'self' },
    });
  });

  it('ownerId=null → về self context, xoá sessionStorage', () => {
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ type: 'employee', ownerId: 77 }));
    useAuthStore.getState().switchContext(null);
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
    expect(sessionStorage.getItem(CONTEXT_KEY)).toBeNull();
  });

  it('ownerId hợp lệ → activeContext = employee + lưu sessionStorage', () => {
    useAuthStore.getState().switchContext(77);
    const ctx = useAuthStore.getState().activeContext;
    expect(ctx).toMatchObject({
      type: 'employee',
      ownerId: 77,
      ownerName: 'Owner A',
      permissions: ['view'],
      dailyEmailLimit: 50,
    });
    expect(JSON.parse(sessionStorage.getItem(CONTEXT_KEY))).toMatchObject({ ownerId: 77 });
  });

  it('ownerId không tồn tại → warn + no-op (giữ context cũ)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAuthStore.setState({ activeContext: { type: 'self' } });
    useAuthStore.getState().switchContext(999);
    expect(warnSpy).toHaveBeenCalled();
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
    warnSpy.mockRestore();
  });

  it('ownerId truyền dưới dạng string vẫn match (so sánh sau khi String())', () => {
    useAuthStore.getState().switchContext('77');
    expect(useAuthStore.getState().activeContext.ownerId).toBe(77);
  });
});

// ───────────────────────────────────────── initialize ──────────────
describe('initialize', () => {
  it('không có token trong storage → isLoading=false, isAuthenticated=false', async () => {
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('có token → gọi /auth/me, set user', async () => {
    localStorage.setItem('accessToken', 'tok');
    api.get.mockResolvedValue({
      data: { data: { user: { id: 7, role: 'user', active_plan_id: 1 } } },
    });
    await useAuthStore.getState().initialize();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user.id).toBe(7);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('có token nhưng /auth/me fail → clear tokens + reset state', async () => {
    localStorage.setItem('accessToken', 'tok');
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ type: 'employee', ownerId: 1 }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockRejectedValue(new Error('401'));
    await useAuthStore.getState().initialize();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem(CONTEXT_KEY)).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    errSpy.mockRestore();
  });

  it('có stored employee context khớp với 1 membership → khôi phục context', async () => {
    localStorage.setItem('accessToken', 'tok');
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ type: 'employee', ownerId: 42 }));
    api.get.mockResolvedValue({
      data: {
        data: {
          user: {
            id: 1,
            role: 'user',
            active_plan_id: 1,
            memberships: [
              { ownerId: 42, ownerName: 'Boss', permissions: ['x'] },
              { ownerId: 99, ownerName: 'Other' },
            ],
          },
        },
      },
    });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().activeContext).toMatchObject({
      type: 'employee',
      ownerId: 42,
      ownerName: 'Boss',
    });
  });

  it('stored context trỏ tới membership không còn → fallback default', async () => {
    localStorage.setItem('accessToken', 'tok');
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ type: 'employee', ownerId: 999 }));
    api.get.mockResolvedValue({
      data: {
        data: {
          user: {
            id: 1, role: 'user', active_plan_id: 1,
            memberships: [{ ownerId: 42, ownerName: 'Boss' }],
          },
        },
      },
    });
    await useAuthStore.getState().initialize();
    // Có plan → default = self.
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
  });

  it('token nằm ở sessionStorage cũng được load', async () => {
    sessionStorage.setItem('accessToken', 'tok');
    api.get.mockResolvedValue({
      data: { data: { user: { id: 1, role: 'user' } } },
    });
    await useAuthStore.getState().initialize();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
