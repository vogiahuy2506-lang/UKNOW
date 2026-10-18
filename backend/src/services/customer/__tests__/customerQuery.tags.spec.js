import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { default: customerQueryService } = await import('../customerQuery.service.js');
const { default: customerReadRepository } = await import('../../../repositories/customer/customerRead.repository.js');
const { default: customerTagRepository } = await import('../../../repositories/customer/customerTag.repository.js');

/** PR-T1 — GET /customers nhận `tagIds` và trả `tags` mỗi khách. SQL lọc ANY nằm ở integration customerTags.test.js. */
describe('customerQueryService.getAllCustomers — tag', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('tagIds (chuỗi phẩy) được chuẩn hoá thành mảng số rồi truyền xuống repository', async () => {
    const spy = jest.spyOn(customerReadRepository, 'getAllCustomerRows').mockResolvedValue({ rows: [], total: 0 });
    await customerQueryService.getAllCustomers({ userId: 1, tagIds: '4, 7,4' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tagIds: [4, 7] }));
  });

  it('không truyền tagIds → mảng rỗng (không lọc)', async () => {
    const spy = jest.spyOn(customerReadRepository, 'getAllCustomerRows').mockResolvedValue({ rows: [], total: 0 });
    await customerQueryService.getAllCustomers({ userId: 1 });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tagIds: [] }));
  });

  it('tagIds sai kiểu → 400 TRƯỚC khi chạm repository', async () => {
    const spy = jest.spyOn(customerReadRepository, 'getAllCustomerRows').mockResolvedValue({ rows: [], total: 0 });
    await expect(customerQueryService.getAllCustomers({ userId: 1, tagIds: 'abc' })).rejects.toMatchObject({ statusCode: 400 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('mỗi khách mang đúng tags của mình (khách không tag → [])', async () => {
    jest.spyOn(customerReadRepository, 'getAllCustomerRows').mockResolvedValue({
      rows: [{ id: '1', email: 'a@x.vn' }, { id: '2', email: 'b@x.vn' }],
      total: 2,
    });
    const listFor = jest.spyOn(customerTagRepository, 'listForCustomers').mockResolvedValue([
      { customer_id: '1', id: '9', name: 'VIP', color: '#ff0000' },
    ]);
    const data = await customerQueryService.getAllCustomers({ userId: 1 });
    expect(listFor).toHaveBeenCalledWith([1, 2]);
    expect(data.items[0].tags).toEqual([{ id: 9, name: 'VIP', color: '#ff0000' }]);
    expect(data.items[1].tags).toEqual([]);
  });
});
