import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Test cho PLAN_SDT_BAT_BUOC_SYNC_SHEET_2026-09-02.md mục 2.2 — mọi hành vi ở đây
 * đều là điều kiện plan liệt kê tường minh (không await ở nơi gọi, timeout+retry,
 * tắt im lặng khi thiếu URL, không log SĐT đầy đủ), không phải suy đoán.
 */

const mockAxiosPost = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { post: mockAxiosPost },
}));

const { pushMemberToSheet } = await import('../memberSheetSync.util.js');

describe('pushMemberToSheet', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it('thiếu MEMBER_SHEET_WEBHOOK_URL → tắt im lặng, không gọi mạng', async () => {
    delete process.env.MEMBER_SHEET_WEBHOOK_URL;

    await expect(
      pushMemberToSheet({ email: 'a@test.local', phone: '0912345678' })
    ).resolves.toBeUndefined();

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('có URL → POST đúng form-urlencoded, kèm secret + timeout 5s', async () => {
    process.env.MEMBER_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/xxx/exec';
    process.env.MEMBER_SHEET_WEBHOOK_SECRET = 'shh';
    mockAxiosPost.mockResolvedValueOnce({ status: 200 });

    await pushMemberToSheet({
      email: 'a@test.local',
      phone: '0912345678',
      fullName: 'Nguyễn A',
      createdAt: '2026-09-02T00:00:00.000Z',
    });

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockAxiosPost.mock.calls[0];
    expect(url).toBe('https://script.google.com/macros/s/xxx/exec');
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get('secret')).toBe('shh');
    expect(body.get('email')).toBe('a@test.local');
    expect(body.get('phone')).toBe('0912345678');
    expect(body.get('fullName')).toBe('Nguyễn A');
    expect(config.timeout).toBe(5000);
  });

  it('lỗi lần đầu, thành công lần thử lại thứ hai → resolve, không throw', async () => {
    process.env.MEMBER_SHEET_WEBHOOK_URL = 'https://example.test/exec';
    mockAxiosPost
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ status: 200 });

    const promise = pushMemberToSheet({ email: 'retry@test.local', phone: '0912345679' });
    await jest.advanceTimersByTimeAsync(2000); // đúng RETRY_DELAY_MS trong util
    await expect(promise).resolves.toBeUndefined();

    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
  });

  it('lỗi cả 3 lần (1 lần đầu + 2 lần thử lại) → throw để nơi gọi .catch() bắt được', async () => {
    process.env.MEMBER_SHEET_WEBHOOK_URL = 'https://example.test/exec';
    mockAxiosPost.mockRejectedValue(new Error('down'));

    const promise = pushMemberToSheet({ email: 'fail@test.local', phone: '0912345680' });
    // Nuốt unhandled rejection tạm thời trong lúc advance timers, kiểm assertion ở dưới.
    promise.catch(() => {});
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow(/push thất bại sau 3 lần/);
    expect(mockAxiosPost).toHaveBeenCalledTimes(3);
  });

  it('không log SĐT đầy đủ trong message lỗi — chỉ 4 số cuối', async () => {
    process.env.MEMBER_SHEET_WEBHOOK_URL = 'https://example.test/exec';
    mockAxiosPost.mockRejectedValue(new Error('down'));

    const promise = pushMemberToSheet({ email: 'mask@test.local', phone: '0912345678' });
    promise.catch(() => {});
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow(/\*+5678/);
    await expect(promise).rejects.not.toThrow(/0912345678/);
  });
});
