import { describe, it, expect, vi, beforeEach } from 'vitest';
import campaignApiService from '../campaignApi.service';
import api from '../../../../services/api';
import { resolveActionIdempotencyKey } from '../../../../utils/idempotency.util';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('campaignApiService testSendQuickCampaign & Idempotency Key Rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('testSendQuickCampaign đính kèm Idempotency-Key header', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    await campaignApiService.testSendQuickCampaign(
      { channel: 'email', recipient: 'test@example.com', subject: 'Hi' },
      { idempotencyKey: 'test-key-abc' }
    );

    expect(api.post).toHaveBeenCalledWith(
      '/campaigns/quick-send/test-send',
      { channel: 'email', recipient: 'test@example.com', subject: 'Hi' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'test-key-abc',
        }),
      })
    );
  });

  it('QuickSend flow giữ key khi retry cùng payload và rotate khi payload bị sửa', async () => {
    api.post.mockRejectedValueOnce(new Error('Provider timeout'));
    api.post.mockResolvedValueOnce({ data: { success: true } });

    let actionHolder = { key: null, signature: null };
    const initialPayload = {
      channel: 'zalo',
      recipient: '0901234567',
      accountId: 'zalo-acc-1',
      subject: 'Test Zalo',
      message: 'Hello Zalo',
      htmlContent: null,
      attachments: [],
    };

    // 1. Initial attempt fails
    actionHolder = await resolveActionIdempotencyKey(actionHolder, initialPayload);
    const key1 = actionHolder.key;
    await expect(
      campaignApiService.testSendQuickCampaign(initialPayload, { idempotencyKey: key1 })
    ).rejects.toThrow('Provider timeout');

    // 2. User retries without changes -> MUST retain key1
    actionHolder = await resolveActionIdempotencyKey(actionHolder, initialPayload);
    expect(actionHolder.key).toBe(key1);
    await campaignApiService.testSendQuickCampaign(initialPayload, { idempotencyKey: actionHolder.key });

    expect(api.post).toHaveBeenLastCalledWith(
      '/campaigns/quick-send/test-send',
      initialPayload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': key1,
        }),
      })
    );

    // 3. User changes recipient -> MUST rotate to key2
    const editedPayload = { ...initialPayload, recipient: '0987654321' };
    actionHolder = await resolveActionIdempotencyKey(actionHolder, editedPayload);
    const key2 = actionHolder.key;
    expect(key2).not.toBe(key1);

    await campaignApiService.testSendQuickCampaign(editedPayload, { idempotencyKey: key2 });
    expect(api.post).toHaveBeenLastCalledWith(
      '/campaigns/quick-send/test-send',
      editedPayload,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': key2,
        }),
      })
    );
  });
});
