import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api';
import { emailTemplateUploadApiService } from '../emailTemplateUploadApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('emailTemplateUploadApiService', () => {
  it('uploadTempFile → POST /uploads/temp với payload + config', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    const fd = new FormData();
    const cfg = { onUploadProgress: vi.fn(), timeout: 30000 };
    emailTemplateUploadApiService.uploadTempFile(fd, cfg);
    expect(api.post).toHaveBeenCalledWith('/uploads/temp', fd, cfg);
  });

  it('uploadTempFile config mặc định {}', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    emailTemplateUploadApiService.uploadTempFile({ x: 1 });
    expect(api.post).toHaveBeenCalledWith('/uploads/temp', { x: 1 }, {});
  });

  it('getSignedUrlByKey preview=false → params chỉ có key', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    emailTemplateUploadApiService.getSignedUrlByKey('uploads/a.pdf');
    expect(api.get).toHaveBeenCalledWith('/attachments/presigned-by-key', {
      params: { key: 'uploads/a.pdf' },
    });
  });

  it('getSignedUrlByKey preview=true → params kèm preview="true"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    emailTemplateUploadApiService.getSignedUrlByKey('uploads/a.pdf', { preview: true });
    expect(api.get).toHaveBeenCalledWith('/attachments/presigned-by-key', {
      params: { key: 'uploads/a.pdf', preview: 'true' },
    });
  });

  it('deleteTempFile → DELETE /uploads/temp/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({}));
    emailTemplateUploadApiService.deleteTempFile('abc-123');
    expect(api.delete).toHaveBeenCalledWith('/uploads/temp/abc-123');
  });

  it('default export === named export', async () => {
    const mod = await import('../emailTemplateUploadApi.service');
    expect(mod.default).toBe(mod.emailTemplateUploadApiService);
  });
});
