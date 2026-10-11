import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { default: customerExportService } = await import('../customerExport.service.js');
const { default: customerReadRepository } = await import('../../../repositories/customer/customerRead.repository.js');

const makeRows = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1, full_name: `Khách ${i + 1}`, email: `k${i + 1}@example.com`, phone: null,
    consent_source: 'manual', email_subscribed: true, email_hard_bounced: false, created_at: '2026-10-01T03:00:00.000Z',
  }));

describe('customerExportService.buildCustomerCsv', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('luôn truyền workspace (userId) và xin trần + 1 dòng để biết có bị cắt không', async () => {
    const spy = jest.spyOn(customerReadRepository, 'getCustomerExportRows').mockResolvedValue([]);
    await customerExportService.buildCustomerCsv({ userId: 77, filters: {}, purchaseOrderStatusExpr: 'x' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ userId: 77, limit: 10001 }));
  });

  it('chỉ nhận bộ lọc kiểu chuỗi — mảng/đối tượng từ query bị bỏ, không lọt xuống SQL', async () => {
    const spy = jest.spyOn(customerReadRepository, 'getCustomerExportRows').mockResolvedValue([]);
    await customerExportService.buildCustomerCsv({
      userId: 1,
      filters: { search: ['a', 'b'], consentSource: { $ne: 'x' }, emailStatus: 'bounced', campaignId: '5' },
      purchaseOrderStatusExpr: 'x',
    });
    const arg = spy.mock.calls[0][0];
    expect(arg.search).toBeUndefined();
    expect(arg.consentSource).toBeUndefined();
    expect(arg.emailStatus).toBe('bounced');
    expect(arg.campaignId).toBe('5');
  });

  it('≤ 10.000 hàng → không cắt; có tiêu đề BOM + đúng số dòng', async () => {
    jest.spyOn(customerReadRepository, 'getCustomerExportRows').mockResolvedValue(makeRows(3));
    const out = await customerExportService.buildCustomerCsv({ userId: 1, filters: {}, purchaseOrderStatusExpr: 'x' });
    expect(out.truncated).toBe(false);
    expect(out.rowCount).toBe(3);
    expect(out.lines).toHaveLength(3);
    expect(out.header.charCodeAt(0)).toBe(0xfeff);
  });

  it('10.001 hàng → cắt đúng 10.000 và báo truncated', async () => {
    jest.spyOn(customerReadRepository, 'getCustomerExportRows').mockResolvedValue(makeRows(10001));
    const out = await customerExportService.buildCustomerCsv({ userId: 1, filters: {}, purchaseOrderStatusExpr: 'x' });
    expect(out.truncated).toBe(true);
    expect(out.rowCount).toBe(10000);
    expect(out.lines).toHaveLength(10000);
  });

  it('đúng 10.000 hàng → không bị coi là cắt', async () => {
    jest.spyOn(customerReadRepository, 'getCustomerExportRows').mockResolvedValue(makeRows(10000));
    const out = await customerExportService.buildCustomerCsv({ userId: 1, filters: {}, purchaseOrderStatusExpr: 'x' });
    expect(out.truncated).toBe(false);
    expect(out.rowCount).toBe(10000);
  });
});
