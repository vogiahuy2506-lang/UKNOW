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
import emailTemplateApiService from '../emailTemplateApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('emailTemplateApiService', () => {
  it('getTemplates → GET /email-templates với params', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    emailTemplateApiService.getTemplates({ page: 1, limit: 20 });
    expect(api.get).toHaveBeenCalledWith('/email-templates', {
      params: { page: 1, limit: 20 },
    });
  });

  it('getTemplates không tham số → params rỗng', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    emailTemplateApiService.getTemplates();
    expect(api.get).toHaveBeenCalledWith('/email-templates', { params: {} });
  });

  it('getTemplateById → GET /email-templates/{id}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    emailTemplateApiService.getTemplateById(42);
    expect(api.get).toHaveBeenCalledWith('/email-templates/42');
  });

  it('createTemplate → POST /email-templates với payload', () => {
    api.post.mockReturnValueOnce(Promise.resolve({ data: {} }));
    const payload = { templateName: 'X', subject: 'Hi', bodyHtml: '<p>' };
    emailTemplateApiService.createTemplate(payload);
    expect(api.post).toHaveBeenCalledWith('/email-templates', payload);
  });

  it('updateTemplate → PUT /email-templates/{id} với payload', () => {
    api.put.mockReturnValueOnce(Promise.resolve({ data: {} }));
    emailTemplateApiService.updateTemplate(7, { templateName: 'Y' });
    expect(api.put).toHaveBeenCalledWith('/email-templates/7', { templateName: 'Y' });
  });

  it('deleteTemplate → DELETE /email-templates/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({ data: {} }));
    emailTemplateApiService.deleteTemplate(9);
    expect(api.delete).toHaveBeenCalledWith('/email-templates/9');
  });

  it('previewTemplate → POST /email-templates/preview', () => {
    api.post.mockReturnValueOnce(Promise.resolve({ data: {} }));
    emailTemplateApiService.previewTemplate({ html: '<p>{{name}}</p>', vars: { name: 'A' } });
    expect(api.post).toHaveBeenCalledWith('/email-templates/preview', {
      html: '<p>{{name}}</p>',
      vars: { name: 'A' },
    });
  });

  it('return Promise từ api method', async () => {
    const res = { data: { success: true } };
    api.get.mockResolvedValueOnce(res);
    const out = await emailTemplateApiService.getTemplateById(1);
    expect(out).toBe(res);
  });
});
