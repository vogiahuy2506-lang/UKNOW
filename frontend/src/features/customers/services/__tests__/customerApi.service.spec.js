import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../../../services/api';
import customerApiService from '../customerApi.service';

vi.mock('../../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('customerApiService — URL và tham số khớp backend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exportCustomersCsv: GET /customers/export.csv kèm đúng bộ lọc, nhận Blob', () => {
    customerApiService.exportCustomersCsv({ search: 'an', consentSource: 'import', emailStatus: 'bounced' });
    expect(api.get).toHaveBeenCalledWith('/customers/export.csv', {
      params: { search: 'an', consentSource: 'import', emailStatus: 'bounced' },
      responseType: 'blob',
    });
  });

  it('bulkUpsertCustomers: POST /customers/bulk (không phải /bulk-upsert) với { items }', () => {
    const items = [{ email: 'a@example.com' }];
    customerApiService.bulkUpsertCustomers(items);
    expect(api.post).toHaveBeenCalledWith('/customers/bulk', { items });
  });

  it('getCustomers: truyền params và config (signal) riêng nhau', () => {
    const signal = new AbortController().signal;
    customerApiService.getCustomers({ page: 2, limit: 20 }, { signal });
    expect(api.get).toHaveBeenCalledWith('/customers', { signal, params: { page: 2, limit: 20 } });
  });

  it('getCustomersByQueryString: chuyển config xuống (huỷ request)', () => {
    const signal = new AbortController().signal;
    customerApiService.getCustomersByQueryString('page=1', { signal });
    expect(api.get).toHaveBeenCalledWith('/customers?page=1', { signal });
  });

  it('không còn hàm gọi sai URL journey-detail', () => {
    expect(customerApiService.getCustomerCampaignJourneyDetail).toBeUndefined();
  });
  it('tag: đúng đường dẫn và body (khớp route backend /customers/tags…)', () => {
    customerApiService.getTags();
    expect(api.get).toHaveBeenCalledWith('/customers/tags');
    customerApiService.createTag({ name: 'VIP', color: '#ef4444' });
    expect(api.post).toHaveBeenCalledWith('/customers/tags', { name: 'VIP', color: '#ef4444' });
    customerApiService.updateTag(5, { name: 'X' });
    expect(api.put).toHaveBeenCalledWith('/customers/tags/5', { name: 'X' });
    customerApiService.deleteTag(5);
    expect(api.delete).toHaveBeenCalledWith('/customers/tags/5');
    customerApiService.assignTags({ customerIds: [1, 2], tagIds: [3], tagNames: ['Mới'] });
    expect(api.post).toHaveBeenCalledWith('/customers/tags/assign', { customerIds: [1, 2], tagIds: [3], tagNames: ['Mới'] });
    customerApiService.unassignTags({ customerIds: [1], tagIds: [3] });
    expect(api.post).toHaveBeenCalledWith('/customers/tags/unassign', { customerIds: [1], tagIds: [3] });
    customerApiService.getCustomerTags(9);
    expect(api.get).toHaveBeenCalledWith('/customers/9/tags');
  });
});
