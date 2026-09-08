import { describe, it, expect, vi, beforeEach } from 'vitest';
import zaloSettingsApiService from '../zaloSettingsApi.service';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('zaloSettingsApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendMessage gửi payload có mảng attachments lên /zalo/preview/send-personal', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    const payload = {
      accountId: 'acc-123',
      phone: '0912345678',
      message: 'Xin chào',
      attachments: [{ key: 'uploads/zalo/sample.jpg', originalName: 'sample.jpg' }],
    };

    await zaloSettingsApiService.sendMessage(payload);

    expect(api.post).toHaveBeenCalledWith(
      '/zalo/preview/send-personal',
      {
        accountId: 'acc-123',
        recipients: ['0912345678'],
        recipientType: 'phone',
        message: 'Xin chào',
        attachments: [{ key: 'uploads/zalo/sample.jpg', originalName: 'sample.jpg' }],
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      })
    );
  });

  it('sendMessage nhận recipientType=uid từ payload thay vì cứng phone', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    const payload = {
      accountId: 'acc-123',
      phone: '4603890323834564223',
      recipientType: 'uid',
      message: 'Xin chào',
    };

    await zaloSettingsApiService.sendMessage(payload);

    expect(api.post).toHaveBeenCalledWith(
      '/zalo/preview/send-personal',
      expect.objectContaining({
        recipients: ['4603890323834564223'],
        recipientType: 'uid',
      }),
      expect.anything()
    );
  });

  it('sendMessage khi không truyền attachments thì mặc định gửi mảng rỗng []', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    const payload = {
      accountId: 'acc-123',
      phone: '0912345678',
      message: 'Xin chào',
    };

    await zaloSettingsApiService.sendMessage(payload);

    expect(api.post).toHaveBeenCalledWith(
      '/zalo/preview/send-personal',
      {
        accountId: 'acc-123',
        recipients: ['0912345678'],
        recipientType: 'phone',
        message: 'Xin chào',
        attachments: [],
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      })
    );
  });

  it('sendGroupMessage gửi groupIds (không phải recipients) lên /zalo/preview/send-group', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    const payload = {
      accountId: 'acc-123',
      groupId: '1234567890123456789',
      message: 'Thông báo nhóm',
      attachments: [{ key: 'uploads/zalo/sample.jpg', originalName: 'sample.jpg' }],
    };

    await zaloSettingsApiService.sendGroupMessage(payload);

    expect(api.post).toHaveBeenCalledWith(
      '/zalo/preview/send-group',
      {
        accountId: 'acc-123',
        groupIds: ['1234567890123456789'],
        message: 'Thông báo nhóm',
        attachments: [{ key: 'uploads/zalo/sample.jpg', originalName: 'sample.jpg' }],
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      })
    );
  });

  it('sendGroupMessage khi không truyền attachments thì mặc định gửi mảng rỗng []', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    const payload = {
      accountId: 'acc-123',
      groupId: '1234567890123456789',
      message: 'Thông báo nhóm',
    };

    await zaloSettingsApiService.sendGroupMessage(payload);

    expect(api.post).toHaveBeenCalledWith(
      '/zalo/preview/send-group',
      {
        accountId: 'acc-123',
        groupIds: ['1234567890123456789'],
        message: 'Thông báo nhóm',
        attachments: [],
      },
      expect.anything()
    );
  });

  it('sendGroupMessage dùng chung cơ chế Idempotency-Key tuỳ chỉnh với sendMessage', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    await zaloSettingsApiService.sendGroupMessage(
      { accountId: 'acc-123', groupId: 'g1', message: 'x' },
      { idempotencyKey: 'fixed-key-abc' }
    );

    expect(api.post).toHaveBeenCalledWith(
      '/zalo/preview/send-group',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'fixed-key-abc' }),
      })
    );
  });
});
