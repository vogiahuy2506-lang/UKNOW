/**
 * PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH PR-3 mục 5.3 — `refreshCurrentUser()` phải dựng lại ngữ cảnh nhân
 * viên từ membership mới nhất, không cần đăng xuất. Store THẬT, chỉ mock tầng API (như
 * authStore.cacheIsolation.spec.js). Luật cách ly cache KHÔNG được yếu đi: đổi không gian vẫn xoá sạch cache;
 * chỉ đổi quyền trong cùng một không gian thì KHÔNG xoá cache mà chỉ đánh dấu cũ (invalidate).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../lib/queryClient';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const api = (await import('../../services/api')).default;
const { useAuthStore, reconcileActiveContext } = await import('../authStore');

const membership = (overrides = {}) => ({
  ownerId: 10,
  ownerName: 'Công ty A',
  ownerAvatarUrl: null,
  permissions: [],
  dailyEmailLimit: null,
  monthlyEmailLimit: null,
  dailyZaloLimit: null,
  monthlyZaloLimit: null,
  isLocked: false,
  ...overrides,
});

const employeeCtx = (overrides = {}) => ({
  type: 'employee',
  ownerId: 10,
  ownerName: 'Công ty A',
  ownerAvatarUrl: null,
  permissions: [],
  dailyEmailLimit: null,
  monthlyEmailLimit: null,
  dailyZaloLimit: null,
  monthlyZaloLimit: null,
  ...overrides,
});

const meResponse = (user) => ({ data: { data: { user } } });

const seed = ({ activeContext, user } = {}) => {
  useAuthStore.setState({
    user: user || { id: 1, username: 'u1', role: 'user', active_plan_id: 5, memberships: [membership()] },
    isAuthenticated: true,
    activeContext: activeContext || employeeCtx(),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  window.sessionStorage.clear();
});

describe('reconcileActiveContext (hàm thuần)', () => {
  const user = (memberships, extra = {}) => ({ id: 1, role: 'user', active_plan_id: 5, memberships, ...extra });

  it('đang ở self → không đổi, kể cả khi có membership mới', () => {
    const result = reconcileActiveContext(user([membership()]), { type: 'self' });
    expect(result.kind).toBe('unchanged');
  });

  it('ngữ cảnh nhân viên khớp membership → unchanged (không set lại store)', () => {
    const result = reconcileActiveContext(user([membership()]), employeeCtx());
    expect(result.kind).toBe('unchanged');
  });

  it('quyền đổi → updated, mang quyền mới', () => {
    const result = reconcileActiveContext(
      user([membership({ permissions: { campaigns_view: true } })]),
      employeeCtx(),
    );
    expect(result.kind).toBe('updated');
    expect(result.context.permissions).toEqual({ campaigns_view: true });
    expect(result.context.type).toBe('employee');
  });

  it('giới hạn gửi đổi → updated', () => {
    const result = reconcileActiveContext(user([membership({ dailyZaloLimit: 20 })]), employeeCtx());
    expect(result.kind).toBe('updated');
    expect(result.context.dailyZaloLimit).toBe(20);
  });

  it('membership biến mất → workspaceLost, về self nếu có gói riêng', () => {
    const result = reconcileActiveContext(user([]), employeeCtx());
    expect(result.kind).toBe('workspaceLost');
    expect(result.context).toEqual({ type: 'self' });
  });

  it('membership bị khoá (isLocked) → workspaceLost', () => {
    const result = reconcileActiveContext(user([membership({ isLocked: true })]), employeeCtx());
    expect(result.kind).toBe('workspaceLost');
  });

  it('mất công ty này nhưng không có gói riêng và còn công ty khác → sang công ty khác (theo pickDefaultContext)', () => {
    const result = reconcileActiveContext(
      user([membership({ ownerId: 20, ownerName: 'Công ty B' })], { active_plan_id: null }),
      employeeCtx(),
    );
    expect(result.kind).toBe('workspaceLost');
    expect(result.context).toMatchObject({ type: 'employee', ownerId: 20 });
  });

  it('không có gói riêng + công ty DUY NHẤT bị khoá → về self, KHÔNG rơi lại vào công ty đang khoá', () => {
    // Trước: pickDefaultContext lấy memberships[0] bất kể isLocked → mỗi lần làm mới là một lần "mất công ty"
    // rồi chọn lại đúng công ty đó (đổi không gian + xoá cache lặp), và mọi request trong đó trả 403.
    const result = reconcileActiveContext(
      user([membership({ isLocked: true })], { active_plan_id: null }),
      employeeCtx(),
    );
    expect(result.kind).toBe('workspaceLost');
    expect(result.context).toEqual({ type: 'self' });
  });

  it('không có gói riêng + công ty A khoá, công ty B còn dùng được → sang B, bỏ qua A', () => {
    const result = reconcileActiveContext(
      user([membership({ isLocked: true }), membership({ ownerId: 20, ownerName: 'Công ty B' })], { active_plan_id: null }),
      employeeCtx(),
    );
    expect(result.kind).toBe('workspaceLost');
    expect(result.context).toMatchObject({ type: 'employee', ownerId: 20 });
  });

  it('so ownerId theo chuỗi (10 vs "10")', () => {
    const result = reconcileActiveContext(user([membership({ ownerId: '10' })]), employeeCtx({ ownerId: 10 }));
    expect(result.kind).toBe('unchanged');
  });
});

describe('refreshCurrentUser — đồng bộ ngữ cảnh nhân viên', () => {
  it('chủ cấp quyền mới: activeContext.permissions đổi theo, KHÔNG cần đăng nhập lại', async () => {
    seed();
    api.get.mockResolvedValue(meResponse({
      id: 1, username: 'u1', role: 'user', active_plan_id: 5,
      memberships: [membership({ permissions: { campaigns_view: true, customers: true } })],
    }));

    const result = await useAuthStore.getState().refreshCurrentUser();

    expect(result).toMatchObject({ success: true, contextChanged: true });
    expect(useAuthStore.getState().activeContext.permissions).toEqual({ campaigns_view: true, customers: true });
    expect(useAuthStore.getState().activeContext.type).toBe('employee');
  });

  it('CÙNG không gian đổi quyền → cache KHÔNG bị xoá, chỉ đánh dấu cũ (invalidate)', async () => {
    seed();
    queryClient.setQueryData(['campaigns', 'ws-10'], [{ id: 1, name: 'Chiến dịch của công ty' }]);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    api.get.mockResolvedValue(meResponse({
      id: 1, username: 'u1', role: 'user', active_plan_id: 5,
      memberships: [membership({ permissions: { campaigns_view: true } })],
    }));

    await useAuthStore.getState().refreshCurrentUser();

    expect(queryClient.getQueryData(['campaigns', 'ws-10'])).toEqual([{ id: 1, name: 'Chiến dịch của công ty' }]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    invalidate.mockRestore();
  });

  it('bị gỡ khỏi team: về self VÀ cache bị xoá sạch (đổi không gian = purge, như switchContext)', async () => {
    seed();
    queryClient.setQueryData(['campaigns', 'ws-10'], [{ id: 1, name: 'Dữ liệu công ty cũ' }]);
    api.get.mockResolvedValue(meResponse({ id: 1, username: 'u1', role: 'user', active_plan_id: 5, memberships: [] }));

    const result = await useAuthStore.getState().refreshCurrentUser();

    expect(result).toMatchObject({ success: true, contextChanged: true });
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
    expect(queryClient.getQueryData(['campaigns', 'ws-10'])).toBeUndefined();
  });

  it('membership bị khoá (isLocked): cũng về self + xoá cache', async () => {
    seed();
    queryClient.setQueryData(['campaigns', 'ws-10'], [{ id: 1 }]);
    api.get.mockResolvedValue(meResponse({
      id: 1, username: 'u1', role: 'user', active_plan_id: 5,
      memberships: [membership({ isLocked: true })],
    }));

    await useAuthStore.getState().refreshCurrentUser();

    expect(useAuthStore.getState().activeContext.type).toBe('self');
    expect(queryClient.getQueryData(['campaigns', 'ws-10'])).toBeUndefined();
  });

  it('đang ở self: membership mới xuất hiện chỉ cập nhật user, KHÔNG tự đẩy người dùng sang công ty', async () => {
    seed({ activeContext: { type: 'self' }, user: { id: 1, username: 'u1', role: 'user', active_plan_id: 5, memberships: [] } });
    queryClient.setQueryData(['campaigns', 'self'], [{ id: 9 }]);
    api.get.mockResolvedValue(meResponse({
      id: 1, username: 'u1', role: 'user', active_plan_id: 5, memberships: [membership()],
    }));

    const result = await useAuthStore.getState().refreshCurrentUser();

    expect(result).toMatchObject({ success: true, contextChanged: false });
    expect(useAuthStore.getState().activeContext).toEqual({ type: 'self' });
    expect(useAuthStore.getState().user.memberships).toHaveLength(1); // dải mời dựa vào chỗ này
    expect(queryClient.getQueryData(['campaigns', 'self'])).toEqual([{ id: 9 }]);
  });

  it('không có gì đổi → KHÔNG set lại store (activeContext và user giữ nguyên tham chiếu, không render thừa)', async () => {
    const payload = { id: 1, username: 'u1', role: 'user', active_plan_id: 5, memberships: [membership()] };
    api.get.mockResolvedValue(meResponse(payload));
    seed();
    await useAuthStore.getState().refreshCurrentUser(); // lần 1: chuẩn hoá user lần đầu
    const settled = useAuthStore.getState();
    const listener = vi.fn();
    const unsubscribe = useAuthStore.subscribe(listener);

    const result = await useAuthStore.getState().refreshCurrentUser();
    unsubscribe();

    expect(result).toMatchObject({ success: true, contextChanged: false });
    expect(listener).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBe(settled.user);
    expect(useAuthStore.getState().activeContext).toBe(settled.activeContext);
  });

  it('phiên đổi sang tài khoản khác trong lúc đang xoá cache → bỏ kết quả, không ghi đè', async () => {
    seed();
    api.get.mockResolvedValue(meResponse({ id: 1, username: 'u1', role: 'user', active_plan_id: 5, memberships: [] }));
    const realClear = queryClient.clear.bind(queryClient);
    // Trong lúc clearQueryCache chạy, người dùng đăng nhập sang tài khoản khác.
    const clearSpy = vi.spyOn(queryClient, 'clear').mockImplementation(() => {
      realClear();
      useAuthStore.setState({ user: { id: 2, username: 'u2', role: 'user', memberships: [] }, activeContext: { type: 'self' } });
    });

    const result = await useAuthStore.getState().refreshCurrentUser();
    clearSpy.mockRestore();

    expect(result.success).toBe(false);
    expect(useAuthStore.getState().user.id).toBe(2);
  });

  it('lưu ngữ cảnh mới vào sessionStorage để F5 không quay về quyền cũ', async () => {
    seed();
    api.get.mockResolvedValue(meResponse({
      id: 1, username: 'u1', role: 'user', active_plan_id: 5,
      memberships: [membership({ permissions: { leads: true } })],
    }));

    await useAuthStore.getState().refreshCurrentUser();

    const stored = JSON.parse(window.sessionStorage.getItem('founder_ai_active_context'));
    expect(stored.permissions).toEqual({ leads: true });
  });
});
