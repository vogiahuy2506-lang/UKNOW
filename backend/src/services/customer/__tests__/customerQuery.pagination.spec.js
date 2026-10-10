import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { default: customerQueryService } = await import('../customerQuery.service.js');
const { default: customerReadRepository } = await import('../../../repositories/customer/customerRead.repository.js');

/**
 * PR-C1 việc 5 — `limit`/`page` của GET /api/customers: trần 100, sai kiểu → 400 (không đẩy NaN xuống SQL).
 */
describe('customerQueryService.parsePagination', () => {
  it('mặc định và giá trị hợp lệ giữ nguyên', () => {
    expect(customerQueryService.parsePagination({ page: 1, limit: 10 })).toEqual({ page: 1, limit: 10 });
    expect(customerQueryService.parsePagination({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('limit lớn hơn 100 bị chặn trần 100', () => {
    expect(customerQueryService.parsePagination({ page: 1, limit: 100000 }).limit).toBe(100);
    expect(customerQueryService.parsePagination({ page: 1, limit: '101' }).limit).toBe(100);
  });

  it.each([
    ['abc'], ['-1'], ['0'], ['1.5'], [''], ['1e3'], ['10; DROP TABLE customers'],
  ])('limit sai kiểu %p → lỗi statusCode 400', (bad) => {
    expect.assertions(1);
    try {
      customerQueryService.parsePagination({ page: 1, limit: bad });
    } catch (error) {
      expect(error.statusCode).toBe(400);
    }
  });

  it.each([['abc'], ['0'], ['-2'], ['2.5']])('page sai kiểu %p → lỗi statusCode 400', (bad) => {
    expect.assertions(1);
    try {
      customerQueryService.parsePagination({ page: bad, limit: 10 });
    } catch (error) {
      expect(error.statusCode).toBe(400);
    }
  });
});

describe('customerQueryService.getAllCustomers — truyền giá trị đã chuẩn hoá xuống repository', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('limit=100000 → repository nhận limit 100, pagination trả limit 100', async () => {
    const spy = jest.spyOn(customerReadRepository, 'getAllCustomerRows').mockResolvedValue({ rows: [], total: 250 });
    const data = await customerQueryService.getAllCustomers({ userId: 1, page: '2', limit: '100000' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 100 }));
    expect(data.pagination).toMatchObject({ page: 2, limit: 100, total: 250, totalPages: 3 });
  });

  it('limit sai kiểu → ném 400 TRƯỚC khi chạm repository', async () => {
    const spy = jest.spyOn(customerReadRepository, 'getAllCustomerRows').mockResolvedValue({ rows: [], total: 0 });
    await expect(customerQueryService.getAllCustomers({ userId: 1, page: 1, limit: 'abc' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(spy).not.toHaveBeenCalled();
  });
});
