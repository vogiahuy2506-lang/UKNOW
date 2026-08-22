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

    expect(api.post).toHaveBeenCalledWith('/zalo/preview/send-personal', {
      accountId: 'acc-123',
      recipients: ['0912345678'],
      recipientType: 'phone',
      message: 'Xin chào',
      attachments: [{ key: 'uploads/zalo/sample.jpg', originalName: 'sample.jpg' }],
    });
  });

  it('sendMessage khi không truyền attachments thì mặc định gửi mảng rỗng []', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    const payload = {
      accountId: 'acc-123',
      phone: '0912345678',
      message: 'Xin chào',
    };

    await zaloSettingsApiService.sendMessage(payload);

    expect(api.post).toHaveBeenCalledWith('/zalo/preview/send-personal', {
      accountId: 'acc-123',
      recipients: ['0912345678'],
      recipientType: 'phone',
      message: 'Xin chào',
      attachments: [],
    });
  });
});
