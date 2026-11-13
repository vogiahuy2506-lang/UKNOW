import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockFindExpiring = jest.fn();
const mockUpdateCredentials = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/channelConnections.repository.js', () => ({
  default: {
    findExpiringZaloOaConnections: mockFindExpiring,
    updateZaloOaCredentials: mockUpdateCredentials,
  },
}));

const mockPost = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: {
    post: mockPost,
  },
}));

const { default: tokenRefreshService } = await import('../zaloOaTokenRefresh.service.js');

describe('ZaloOaTokenRefreshService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bỏ qua khi connection thiếu refresh_token', async () => {
    const conn = { id: 1, display_name: 'OA 1', credentials: {} };
    const res = await tokenRefreshService.refreshConnectionToken(conn);
    expect(res.success).toBe(false);
    expect(res.error).toBe('missing_refresh_token');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('bỏ qua khi thiếu app credentials', async () => {
    const conn = {
      id: 2,
      display_name: 'OA 2',
      credentials: { refresh_token: 'rf_123' },
    };
    const res = await tokenRefreshService.refreshConnectionToken(conn);
    expect(res.success).toBe(false);
    expect(res.error).toBe('missing_app_credentials');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('cập nhật token mới khi Zalo trả về access_token thành công', async () => {
    const conn = {
      id: 3,
      display_name: 'OA 3',
      credentials: {
        refresh_token: 'rf_old',
        app_id: 'app_123',
        app_secret: 'sec_456',
      },
    };

    mockPost.mockResolvedValueOnce({
      data: {
        access_token: 'new_acc_tok',
        refresh_token: 'new_rf_tok',
        expires_in: '90000',
      },
    });
    mockUpdateCredentials.mockResolvedValueOnce({ id: 3 });

    const res = await tokenRefreshService.refreshConnectionToken(conn);
    expect(res.success).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockUpdateCredentials).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        access_token: 'new_acc_tok',
        refresh_token: 'new_rf_tok',
      })
    );
  });

  it('báo lỗi khi Zalo trả về error', async () => {
    const conn = {
      id: 4,
      display_name: 'OA 4',
      credentials: {
        refresh_token: 'rf_expired',
        app_id: 'app_123',
        app_secret: 'sec_456',
      },
    };

    mockPost.mockResolvedValueOnce({
      data: {
        error: -216,
        message: 'Invalid refresh token',
      },
    });

    const res = await tokenRefreshService.refreshConnectionToken(conn);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid refresh token');
    expect(mockUpdateCredentials).not.toHaveBeenCalled();
  });

  it('refreshAllExpiringTokens quét danh sách và tổng hợp kết quả', async () => {
    mockFindExpiring.mockResolvedValueOnce([
      {
        id: 10,
        display_name: 'OA 10',
        credentials: { refresh_token: 'rf_1', app_id: 'a1', app_secret: 's1' },
      },
      {
        id: 11,
        display_name: 'OA 11',
        credentials: { refresh_token: 'rf_2', app_id: 'a2', app_secret: 's2' },
      },
    ]);

    mockPost
      .mockResolvedValueOnce({
        data: { access_token: 'acc_1', refresh_token: 'rf_1_new', expires_in: '90000' },
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const summary = await tokenRefreshService.refreshAllExpiringTokens(6);
    expect(summary.checked).toBe(2);
    expect(summary.refreshed).toBe(1);
    expect(summary.failed).toBe(1);
  });
});
