import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api';
import { zaloTemplateApiService } from '../zaloTemplateApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('zaloTemplateApiService', () => {
  it('getTemplates default → /zalo-templates với params {}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    zaloTemplateApiService.getTemplates();
    expect(api.get).toHaveBeenCalledWith('/zalo-templates', { params: {} });
  });

  it('getTemplates với params', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    zaloTemplateApiService.getTemplates({ search: 'promo', page: 2 });
    expect(api.get).toHaveBeenCalledWith('/zalo-templates', {
      params: { search: 'promo', page: 2 },
    });
  });

  it('getTemplateById → /zalo-templates/{id}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    zaloTemplateApiService.getTemplateById(42);
    expect(api.get).toHaveBeenCalledWith('/zalo-templates/42');
  });

  it('createTemplate → POST /zalo-templates với payload', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    zaloTemplateApiService.createTemplate({ name: 'X', content: 'Y' });
    expect(api.post).toHaveBeenCalledWith('/zalo-templates', { name: 'X', content: 'Y' });
  });

  it('updateTemplate → PUT /zalo-templates/{id} với payload', () => {
    api.put.mockReturnValueOnce(Promise.resolve({}));
    zaloTemplateApiService.updateTemplate(42, { name: 'Z' });
    expect(api.put).toHaveBeenCalledWith('/zalo-templates/42', { name: 'Z' });
  });

  it('deleteTemplate → DELETE /zalo-templates/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({}));
    zaloTemplateApiService.deleteTemplate(42);
    expect(api.delete).toHaveBeenCalledWith('/zalo-templates/42');
  });

  it('default export === named export', async () => {
    const mod = await import('../zaloTemplateApi.service');
    expect(mod.default).toBe(mod.zaloTemplateApiService);
  });
});
