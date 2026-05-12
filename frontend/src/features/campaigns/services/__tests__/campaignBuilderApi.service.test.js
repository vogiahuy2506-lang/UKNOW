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
import campaignBuilderApiService from '../campaignBuilderApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('campaignBuilderApiService — email templates / settings / campaigns', () => {
  it('getEmailTemplateById → GET /email-templates/{id} với options', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getEmailTemplateById(42, { signal: 'abort' });
    expect(api.get).toHaveBeenCalledWith('/email-templates/42', { signal: 'abort' });
  });

  it('getEmailTemplates → GET /email-templates với options default {}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getEmailTemplates();
    expect(api.get).toHaveBeenCalledWith('/email-templates', {});
  });

  it('getActiveEmailSettings → params status=active page=1 limit=100, options merge', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getActiveEmailSettings({ timeout: 9999 });
    expect(api.get).toHaveBeenCalledWith('/email-settings', {
      params: { status: 'active', page: 1, limit: 100 },
      timeout: 9999,
    });
  });

  it('getCampaignById/createCampaign/updateCampaign — đúng URL + payload', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    api.post.mockReturnValueOnce(Promise.resolve({}));
    api.put.mockReturnValueOnce(Promise.resolve({}));

    campaignBuilderApiService.getCampaignById(7);
    expect(api.get).toHaveBeenCalledWith('/campaigns/7', {});

    campaignBuilderApiService.createCampaign({ name: 'X' });
    expect(api.post).toHaveBeenCalledWith('/campaigns', { name: 'X' }, {});

    campaignBuilderApiService.updateCampaign(9, { name: 'Y' });
    expect(api.put).toHaveBeenCalledWith('/campaigns/9', { name: 'Y' }, {});
  });
});

describe('campaignBuilderApiService — interested customers + courses', () => {
  it('getInterestedCustomersByQuery default dataSource → /customers/interested-courses', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getInterestedCustomersByQuery('foo=1');
    expect(api.get).toHaveBeenCalledWith('/customers/interested-courses?foo=1', {});
  });

  it('getInterestedCustomersByQuery dataSource=api → /customers/interested-courses-from-api', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getInterestedCustomersByQuery('q=x', 'api');
    expect(api.get).toHaveBeenCalledWith('/customers/interested-courses-from-api?q=x', {});
  });

  it('getCourses → /courses với params + options', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getCourses({ limit: 50 }, { timeout: 5000 });
    expect(api.get).toHaveBeenCalledWith('/courses', { params: { limit: 50 }, timeout: 5000 });
  });
});

describe('campaignBuilderApiService — previewLandingLeads (normalize boolean param)', () => {
  it('landingLeadsUseDateRange=true → "true"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.previewLandingLeads({
      landingLeadsUseDateRange: true,
      landingLeadsDateFrom: '2026-01-01',
    });
    const args = api.get.mock.calls[0];
    expect(args[0]).toBe('/leads/preview');
    expect(args[1].params.landingLeadsUseDateRange).toBe('true');
    expect(args[1].params.landingLeadsDateFrom).toBe('2026-01-01');
  });

  it('landingLeadsUseDateRange="true"/"1" → "true"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.previewLandingLeads({ landingLeadsUseDateRange: 'true' });
    campaignBuilderApiService.previewLandingLeads({ landingLeadsUseDateRange: '1' });
    expect(api.get.mock.calls[0][1].params.landingLeadsUseDateRange).toBe('true');
    expect(api.get.mock.calls[1][1].params.landingLeadsUseDateRange).toBe('true');
  });

  it('landingLeadsUseDateRange falsy/undefined → "false"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.previewLandingLeads({ landingLeadsUseDateRange: false });
    campaignBuilderApiService.previewLandingLeads({});
    expect(api.get.mock.calls[0][1].params.landingLeadsUseDateRange).toBe('false');
    expect(api.get.mock.calls[1][1].params.landingLeadsUseDateRange).toBe('false');
  });
});

describe('campaignBuilderApiService — google sheets + email preview', () => {
  it('previewGoogleSheet → POST /google-sheets/preview', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.previewGoogleSheet({ url: 'https://x' });
    expect(api.post).toHaveBeenCalledWith('/google-sheets/preview', { url: 'https://x' }, {});
  });

  it('checkGoogleSheet → POST /google-sheets/check', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.checkGoogleSheet({ url: 'https://y' });
    expect(api.post).toHaveBeenCalledWith('/google-sheets/check', { url: 'https://y' }, {});
  });

  it('sendPreviewEmail → POST /email-settings/send-email', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.sendPreviewEmail({ to: 'a@b' });
    expect(api.post).toHaveBeenCalledWith('/email-settings/send-email', { to: 'a@b' }, {});
  });
});

describe('campaignBuilderApiService — Zalo', () => {
  it('getZaloAccounts → GET /zalo/accounts', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getZaloAccounts();
    expect(api.get).toHaveBeenCalledWith('/zalo/accounts', {});
  });

  it('restoreZaloAccountSession → POST /zalo/accounts/{id}/restore-session với body rỗng', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.restoreZaloAccountSession(5);
    expect(api.post).toHaveBeenCalledWith('/zalo/accounts/5/restore-session', {}, {});
  });

  it('getZaloTemplates + getZaloTemplateById', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getZaloTemplates();
    campaignBuilderApiService.getZaloTemplateById(7);
    expect(api.get).toHaveBeenNthCalledWith(1, '/zalo-templates', {});
    expect(api.get).toHaveBeenNthCalledWith(2, '/zalo-templates/7', {});
  });

  it('sendPreviewZaloPersonal/FriendRequest/Group — đúng endpoint', () => {
    api.post.mockReturnValue(Promise.resolve({}));
    campaignBuilderApiService.sendPreviewZaloPersonal({ a: 1 });
    campaignBuilderApiService.sendPreviewZaloFriendRequest({ b: 2 });
    campaignBuilderApiService.sendPreviewZaloGroup({ c: 3 });
    expect(api.post).toHaveBeenNthCalledWith(1, '/zalo/preview/send-personal', { a: 1 }, {});
    expect(api.post).toHaveBeenNthCalledWith(2, '/zalo/preview/send-friend-request', { b: 2 }, {});
    expect(api.post).toHaveBeenNthCalledWith(3, '/zalo/preview/send-group', { c: 3 }, {});
  });

  it('getPreviewZaloFriends → params + timeout 180s', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getPreviewZaloFriends({ accountId: 1 });
    const cfg = api.get.mock.calls[0][1];
    expect(cfg.params).toEqual({ accountId: 1 });
    expect(cfg.timeout).toBe(180000);
  });

  it('getPreviewZaloGroups → params + timeout 180s, options override timeout vẫn ưu tiên', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getPreviewZaloGroups({ accountId: 2 }, { timeout: 5000 });
    expect(api.get.mock.calls[0][1].timeout).toBe(5000);
  });
});

describe('campaignBuilderApiService — attachments', () => {
  it('getAttachmentPreviewUrlByKey → params key + preview="true"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignBuilderApiService.getAttachmentPreviewUrlByKey('uploads/a.pdf');
    expect(api.get).toHaveBeenCalledWith('/attachments/presigned-by-key', {
      params: { key: 'uploads/a.pdf', preview: 'true' },
    });
  });
});
