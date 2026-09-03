import { describe, it, expect, vi, beforeEach } from 'vitest';
import campaignBuilderApiService from '../campaignBuilderApi.service';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('campaignBuilderApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendPreviewEmail đính kèm Idempotency-Key header', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    await campaignBuilderApiService.sendPreviewEmail({ to: 'preview@example.com' });

    expect(api.post).toHaveBeenCalledWith(
      '/email-settings/send-email',
      { to: 'preview@example.com' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      })
    );
  });

  it('sendPreviewZaloPersonal đính kèm Idempotency-Key header', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    await campaignBuilderApiService.sendPreviewZaloPersonal({ phone: '0901234567' });

    expect(api.post).toHaveBeenCalledWith(
      '/zalo/preview/send-personal',
      { phone: '0901234567' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      })
    );
  });
});
