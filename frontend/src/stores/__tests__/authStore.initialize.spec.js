import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.F — initialize() không được đăng xuất khi /auth/me
 * hỏng vì lý do TẠM THỜI (429 hạn mức đăng nhập, 5xx, mất mạng); chỉ đăng xuất khi 401/403 thật.
 * PLAN_429_PHIEN_VA_CHUOI_SAN_PHAM_2026-10-11 việc 1 — lỗi tạm thời được THỬ LẠI (tối đa 2 lần, trong lúc
 * isLoading còn true) trước khi rơi về sessionCheckFailed; quét production 11/10 cho thấy ~230 lượt tải trang
 * dính 429 ở đúng request này rồi bị đẩy ra /login.
 * Khuôn theo authStore.refreshCurrentUser.spec.js — store THẬT, chỉ mock tầng gọi API. Đồng hồ giả để ghim
 * đúng độ trễ giữa các lượt (không chờ thật 5,5 giây mỗi ca).
 */
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const api = (await import('../../services/api')).default;
const { useAuthStore } = await import('../authStore');

const httpError = (status, headers) => Object.assign(new Error('http error'), { response: { status, headers } });
const networkError = () => new Error('Network Error'); // không có .response — đúng lỗi mất mạng thật
const okResponse = () => ({
  data: { data: { user: { id: 1, username: 'u1', role: 'user', memberships: [] } } },
});

const state = () => useAuthStore.getState();
const callCount = () => api.get.mock.calls.length;

// Chạy initialize() tới khi xong, cho các hẹn giờ thử lại chạy hết.
const runInitialize = async () => {
  const pending = state().initialize();
  await vi.runAllTimersAsync();
  await pending;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.get.mockReset();
  api.post.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('accessToken', 'fake-access-token');
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    activeContext: { type: 'self' },
    sessionCheckFailed: false,
  });
});

afterEach(async () => {
  // Xả mọi lượt thử lại còn treo: initializeInFlight là biến cấp module, một ca bỏ dở sẽ làm các ca sau
  // nhận lại promise cũ (đỏ dây chuyền, che mất ca đỏ thật).
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('authStore.initialize — 429/5xx/mất mạng không được đăng xuất', () => {
  it('/auth/me trả 429 mãi → token còn, sessionCheckFailed: true, KHÔNG đăng xuất', async () => {
    api.get.mockRejectedValue(httpError(429));

    await runInitialize();

    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
    expect(state().isAuthenticated).toBe(false);
    expect(state().isLoading).toBe(false);
    expect(state().sessionCheckFailed).toBe(true);
  });

  it('/auth/me trả 500 mãi → token còn, sessionCheckFailed: true', async () => {
    api.get.mockRejectedValue(httpError(500));

    await runInitialize();

    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
    expect(state().sessionCheckFailed).toBe(true);
  });

  it('lỗi mạng (không có response) mãi → token còn, sessionCheckFailed: true', async () => {
    api.get.mockRejectedValue(networkError());

    await runInitialize();

    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
    expect(state().sessionCheckFailed).toBe(true);
  });

  it('/auth/me trả 401 → token bị xoá, đăng xuất thật, KHÔNG thử lại', async () => {
    api.get.mockRejectedValue(httpError(401));

    await runInitialize();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(state().isAuthenticated).toBe(false);
    expect(state().sessionCheckFailed).toBe(false);
    expect(callCount()).toBe(1);
  });

  it('/auth/me trả 403 (tài khoản bị khoá/vô hiệu hoá) → token bị xoá, đăng xuất thật, KHÔNG thử lại', async () => {
    api.get.mockRejectedValue(httpError(403));

    await runInitialize();

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(state().isAuthenticated).toBe(false);
    expect(state().sessionCheckFailed).toBe(false);
    expect(callCount()).toBe(1);
  });

  it('/auth/me thành công → isAuthenticated true, sessionCheckFailed về false', async () => {
    useAuthStore.setState({ sessionCheckFailed: true });
    api.get.mockResolvedValue(okResponse());

    await runInitialize();

    expect(state().isAuthenticated).toBe(true);
    expect(state().sessionCheckFailed).toBe(false);
    expect(callCount()).toBe(1);
  });

  it('không có token → không gọi API, không bật cờ (cờ cũ còn sót cũng được xoá)', async () => {
    localStorage.clear();
    useAuthStore.setState({ sessionCheckFailed: true });

    await runInitialize();

    expect(callCount()).toBe(0);
    expect(state().isLoading).toBe(false);
    expect(state().sessionCheckFailed).toBe(false);
  });
});

describe('authStore.initialize — thử lại lỗi tạm thời', () => {
  it('429 rồi 200 → đăng nhập được, gọi /auth/me đúng 2 lần', async () => {
    api.get.mockRejectedValueOnce(httpError(429)).mockResolvedValue(okResponse());

    await runInitialize();

    expect(state().isAuthenticated).toBe(true);
    expect(state().sessionCheckFailed).toBe(false);
    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
    expect(callCount()).toBe(2);
  });

  it('503 rồi 200 → đăng nhập được', async () => {
    api.get.mockRejectedValueOnce(httpError(503)).mockResolvedValue(okResponse());

    await runInitialize();

    expect(state().isAuthenticated).toBe(true);
    expect(callCount()).toBe(2);
  });

  it('mất mạng rồi 200 → đăng nhập được', async () => {
    api.get.mockRejectedValueOnce(networkError()).mockResolvedValue(okResponse());

    await runInitialize();

    expect(state().isAuthenticated).toBe(true);
    expect(callCount()).toBe(2);
  });

  it('429 rồi 429 rồi 200 → đăng nhập được ở lượt thử lại cuối (lần thứ 3)', async () => {
    api.get
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValue(okResponse());

    await runInitialize();

    expect(state().isAuthenticated).toBe(true);
    expect(callCount()).toBe(3);
  });

  it('429 ×3 → sessionCheckFailed: true, token còn, gọi đúng 3 lần (không thử lần thứ 4)', async () => {
    api.get.mockRejectedValue(httpError(429));

    await runInitialize();

    expect(callCount()).toBe(3);
    expect(state().sessionCheckFailed).toBe(true);
    expect(state().isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
  });

  it('trong lúc còn thử lại, isLoading vẫn true và chưa bật cờ — cổng route chưa đá đi đâu', async () => {
    api.get.mockRejectedValue(httpError(429));

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(1000); // đang chờ lượt 2

    expect(callCount()).toBe(1);
    expect(state().isLoading).toBe(true);
    expect(state().sessionCheckFailed).toBe(false);

    await vi.runAllTimersAsync();
    await pending;
    expect(state().isLoading).toBe(false);
  });

  it('độ trễ mặc định (không có Retry-After): 1,5 giây rồi 4 giây', async () => {
    api.get.mockRejectedValue(httpError(500));

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(1499);
    expect(callCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount()).toBe(2);

    await vi.advanceTimersByTimeAsync(3999);
    expect(callCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount()).toBe(3);

    await pending;
  });

  it('Retry-After: 3 → lượt 2 gọi sau ~3 giây (không phải 1,5 giây)', async () => {
    api.get
      .mockRejectedValueOnce(httpError(429, { 'retry-after': '3' }))
      .mockResolvedValue(okResponse());

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(2999);
    expect(callCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount()).toBe(2);

    await pending;
    expect(state().isAuthenticated).toBe(true);
  });

  it('Retry-After: 60 → chặn trần 8 giây', async () => {
    api.get
      .mockRejectedValueOnce(httpError(429, { 'retry-after': '60' }))
      .mockResolvedValue(okResponse());

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(7999);
    expect(callCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount()).toBe(2);

    await pending;
  });

  it('đọc được Retry-After từ headers dạng AxiosHeaders (có hàm .get, tên header không phân biệt hoa thường)', async () => {
    const axiosLikeHeaders = { get: (name) => (String(name).toLowerCase() === 'retry-after' ? '2' : undefined) };
    api.get
      .mockRejectedValueOnce(httpError(429, axiosLikeHeaders))
      .mockResolvedValue(okResponse());

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(1999);
    expect(callCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount()).toBe(2);

    await pending;
  });

  it('Retry-After 8 giây ×2 → tổng thời gian CHỜ bị cắt ở 12 giây (8 + 4), không phải 16', async () => {
    api.get.mockRejectedValue(httpError(429, { 'retry-after': '60' }));

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(8000);
    expect(callCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(callCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount()).toBe(3);

    await pending;
    expect(state().sessionCheckFailed).toBe(true);
  });

  it.each([
    ['ngày HTTP', 'Wed, 21 Oct 2026 07:28:00 GMT'],
    ['rỗng', ''],
    ['"0" (thử lại ngay = đập tiếp vào hạn mức)', '0'],
  ])('Retry-After %s → bỏ qua, dùng độ trễ mặc định 1,5 giây', async (_label, value) => {
    api.get
      .mockRejectedValueOnce(httpError(429, { 'retry-after': value }))
      .mockResolvedValue(okResponse());

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(1499);
    expect(callCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount()).toBe(2);

    await pending;
  });

  it('429 rồi 401 → đăng xuất thật ở lượt thử lại (token bị xoá), không thử tiếp', async () => {
    api.get.mockRejectedValueOnce(httpError(429)).mockRejectedValue(httpError(401));

    await runInitialize();

    expect(callCount()).toBe(2);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(state().sessionCheckFailed).toBe(false);
  });

  it('4xx khác (404) → không thử lại (thử lại không chữa được), vẫn giữ token như trước', async () => {
    api.get.mockRejectedValue(httpError(404));

    await runInitialize();

    expect(callCount()).toBe(1);
    expect(state().sessionCheckFailed).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
  });

  it('200 nhưng nội dung hỏng (không phải lỗi request) → không thử lại', async () => {
    api.get.mockResolvedValue({}); // thiếu data → TypeError khi đọc user

    await runInitialize();

    expect(callCount()).toBe(1);
    expect(state().sessionCheckFailed).toBe(true);
  });

  it('token biến mất trong lúc chờ (đăng xuất ở nơi khác) → dừng thử lại, không bật cờ', async () => {
    api.get.mockRejectedValue(httpError(429));

    const pending = state().initialize();
    await vi.advanceTimersByTimeAsync(500);
    localStorage.removeItem('accessToken');
    await vi.runAllTimersAsync();
    await pending;

    expect(callCount()).toBe(1);
    expect(state().isLoading).toBe(false);
    expect(state().isAuthenticated).toBe(false);
    expect(state().sessionCheckFailed).toBe(false);
  });

  it('single-flight: initialize() gọi chồng nhau dùng chung MỘT chuỗi request', async () => {
    api.get.mockRejectedValueOnce(httpError(429)).mockResolvedValue(okResponse());

    const first = state().initialize();
    const second = state().initialize();
    expect(second).toBe(first);

    await vi.runAllTimersAsync();
    await Promise.all([first, second]);

    expect(callCount()).toBe(2); // 1 lượt lỗi + 1 lượt thử lại — không nhân đôi
    expect(state().isAuthenticated).toBe(true);
  });

  it('xong rồi thì lượt gọi sau chạy lại từ đầu (không kẹt promise cũ)', async () => {
    api.get.mockResolvedValue(okResponse());
    await runInitialize();
    await runInitialize();

    expect(callCount()).toBe(2);
  });
});

describe('authStore.retrySessionCheck — nút "Thử lại" của màn không kiểm tra được phiên', () => {
  beforeEach(() => {
    useAuthStore.setState({ isLoading: false, isAuthenticated: false, sessionCheckFailed: true });
  });

  it('phiên kiểm tra được lần này → đăng nhập, cờ về false', async () => {
    api.get.mockResolvedValue(okResponse());

    const pending = state().retrySessionCheck();
    await vi.runAllTimersAsync();
    await pending;

    expect(state().isAuthenticated).toBe(true);
    expect(state().sessionCheckFailed).toBe(false);
  });

  it('vẫn lỗi tạm thời → cờ giữ true, token còn (màn Thử lại ở yên đó)', async () => {
    api.get.mockRejectedValue(httpError(429));

    const pending = state().retrySessionCheck();
    await vi.runAllTimersAsync();
    await pending;

    expect(state().isAuthenticated).toBe(false);
    expect(state().sessionCheckFailed).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('fake-access-token');
  });

  it('trong lúc đang thử: cờ vẫn true và isLoading vẫn false — cổng route không đổi sang LoadingScreen hay /login', async () => {
    api.get.mockRejectedValue(httpError(429));

    const pending = state().retrySessionCheck();
    await vi.advanceTimersByTimeAsync(500);

    expect(state().sessionCheckFailed).toBe(true);
    expect(state().isLoading).toBe(false);

    await vi.runAllTimersAsync();
    await pending;
  });

  it('lần này token bị từ chối (401) → đăng xuất thật, cờ về false', async () => {
    api.get.mockRejectedValue(httpError(401));

    const pending = state().retrySessionCheck();
    await vi.runAllTimersAsync();
    await pending;

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(state().sessionCheckFailed).toBe(false);
  });
});

describe('authStore.logout — xoá cờ không kiểm tra được phiên', () => {
  it('"Đăng nhập lại" ở màn Thử lại: sau logout trang đăng nhập không còn băng cũ', async () => {
    useAuthStore.setState({ isLoading: false, isAuthenticated: false, sessionCheckFailed: true });

    await state().logout();

    expect(state().sessionCheckFailed).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
