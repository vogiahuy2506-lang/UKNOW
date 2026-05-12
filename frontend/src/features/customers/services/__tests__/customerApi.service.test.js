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
import { customerApiService } from '../customerApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('customerApiService — list/read', () => {
  it('getCustomers default params {}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCustomers();
    expect(api.get).toHaveBeenCalledWith('/customers', { params: {} });
  });

  it('getCustomers với params', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCustomers({ search: 'an' });
    expect(api.get).toHaveBeenCalledWith('/customers', { params: { search: 'an' } });
  });

  it('getCustomerById → GET /customers/{id}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCustomerById(5);
    expect(api.get).toHaveBeenCalledWith('/customers/5');
  });

  it('getCustomerCampaignParticipations → /customers/{id}/campaign-participations', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCustomerCampaignParticipations(5);
    expect(api.get).toHaveBeenCalledWith('/customers/5/campaign-participations');
  });

  it('getCustomerCampaignJourney → /customers/{cid}/campaigns/{campaignId}/journey', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCustomerCampaignJourney(5, 7);
    expect(api.get).toHaveBeenCalledWith('/customers/5/campaigns/7/journey');
  });

  it('getCampaignZaloGroupMessages → /customers/campaigns/{id}/zalo-group/messages với params', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCampaignZaloGroupMessages(7, { limit: 50 });
    expect(api.get).toHaveBeenCalledWith('/customers/campaigns/7/zalo-group/messages', {
      params: { limit: 50 },
    });
  });

  it('getCustomersByQueryString → /customers?{qs}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCustomersByQueryString('limit=10&page=2');
    expect(api.get).toHaveBeenCalledWith('/customers?limit=10&page=2');
  });

  it('getCustomerJourney + getCustomerCampaignJourneyDetail', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCustomerJourney(5, { from: '2026' });
    customerApiService.getCustomerCampaignJourneyDetail(5, 7, { limit: 10 });
    expect(api.get).toHaveBeenNthCalledWith(1, '/customers/5/journey', { params: { from: '2026' } });
    expect(api.get).toHaveBeenNthCalledWith(2, '/customers/5/campaigns/7/journey-detail', { params: { limit: 10 } });
  });

  it('getCampaignById (proxy) → /campaigns/{id}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getCampaignById(9);
    expect(api.get).toHaveBeenCalledWith('/campaigns/9');
  });
});

describe('customerApiService — mutations', () => {
  it('createCustomer → POST /customers', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.createCustomer({ email: 'a@b' });
    expect(api.post).toHaveBeenCalledWith('/customers', { email: 'a@b' });
  });

  it('updateCustomer → PUT /customers/{id}', () => {
    api.put.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.updateCustomer(5, { email: 'x@y' });
    expect(api.put).toHaveBeenCalledWith('/customers/5', { email: 'x@y' });
  });

  it('deleteCustomer → DELETE /customers/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.deleteCustomer(5);
    expect(api.delete).toHaveBeenCalledWith('/customers/5');
  });

  it('bulkUpsertCustomers → POST /customers/bulk-upsert', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.bulkUpsertCustomers([{ email: 'a' }]);
    expect(api.post).toHaveBeenCalledWith('/customers/bulk-upsert', [{ email: 'a' }]);
  });
});

describe('customerApiService — attachments', () => {
  it('getAttachmentPresignedDownload preview=false → endpoint không có ?preview', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getAttachmentPresignedDownload(42);
    expect(api.get).toHaveBeenCalledWith('/attachments/42/presigned-download');
  });

  it('getAttachmentPresignedDownload preview=true → endpoint có ?preview=true', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getAttachmentPresignedDownload(42, { preview: true });
    expect(api.get).toHaveBeenCalledWith('/attachments/42/presigned-download?preview=true');
  });

  it('getAttachmentPresignedByKey preview=false → params chỉ có key', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getAttachmentPresignedByKey('uploads/a.pdf');
    expect(api.get).toHaveBeenCalledWith('/attachments/presigned-by-key', {
      params: { key: 'uploads/a.pdf' },
    });
  });

  it('getAttachmentPresignedByKey preview=true → params kèm preview="true"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    customerApiService.getAttachmentPresignedByKey('uploads/a.pdf', { preview: true });
    expect(api.get).toHaveBeenCalledWith('/attachments/presigned-by-key', {
      params: { key: 'uploads/a.pdf', preview: 'true' },
    });
  });
});
