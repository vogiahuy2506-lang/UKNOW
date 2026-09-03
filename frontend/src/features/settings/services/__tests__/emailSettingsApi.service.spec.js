import { describe, it, expect, vi, beforeEach } from 'vitest';
import emailSettingsApiService from '../emailSettingsApi.service';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('emailSettingsApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendTestEmail đính kèm Idempotency-Key header', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    await emailSettingsApiService.sendTestEmail(10, { to: 'test@example.com' });

    expect(api.post).toHaveBeenCalledWith(
      '/email-settings/10/send-test',
      { to: 'test@example.com' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      })
    );
  });

  it('sendEmail đính kèm Idempotency-Key header và giữ key truyền vào', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    await emailSettingsApiService.sendEmail(
      { to: 'test@example.com', content: 'Hello' },
      { idempotencyKey: 'custom-key-123' }
    );

    expect(api.post).toHaveBeenCalledWith(
      '/email-settings/send-email',
      { to: 'test@example.com', content: 'Hello' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'custom-key-123',
        }),
      })
    );
  });

  it('giữ idempotencyKey khi retry cùng payload và rotate khi payload bị sửa', async () => {
    const { resolveActionIdempotencyKey } = await import('../../../../utils/idempotency.util');
    api.post.mockRejectedValueOnce(new Error('Network timeout'));
    api.post.mockResolvedValueOnce({ data: { success: true } });

    let actionHolder = { key: null, signature: null };
    const initialPayload = { to: 'customer@example.com', subject: 'Greeting', content: 'Hello' };

    // Lần 1: gửi và lỗi mạng
    actionHolder = await resolveActionIdempotencyKey(actionHolder, initialPayload);
    const firstKey = actionHolder.key;
    await expect(
      emailSettingsApiService.sendEmail(initialPayload, { idempotencyKey: firstKey })
    ).rejects.toThrow('Network timeout');

    // Lần 2: Người dùng bấm retry (cùng payload) -> PHẢI giữ nguyên key
    actionHolder = await resolveActionIdempotencyKey(actionHolder, initialPayload);
    const secondKey = actionHolder.key;
    expect(secondKey).toBe(firstKey);
    await emailSettingsApiService.sendEmail(initialPayload, { idempotencyKey: secondKey });

    expect(api.post).toHaveBeenLastCalledWith(
      '/email-settings/send-email',
      initialPayload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': firstKey,
        }),
      })
    );

    // Lần 3: Người dùng sửa địa chỉ người nhận thành email khác -> PHẢI rotate sang key mới
    const editedPayload = { ...initialPayload, to: 'different@example.com' };
    actionHolder = await resolveActionIdempotencyKey(actionHolder, editedPayload);
    const thirdKey = actionHolder.key;
    expect(thirdKey).not.toBe(firstKey);

    await emailSettingsApiService.sendEmail(editedPayload, { idempotencyKey: thirdKey });
    expect(api.post).toHaveBeenLastCalledWith(
      '/email-settings/send-email',
      editedPayload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': thirdKey,
        }),
      })
    );
  });
});
