import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: jest.fn() } }));

const { default: customerTagService, normalizeIdList, CUSTOMER_TAG_MAX_CUSTOMERS_PER_CALL, CUSTOMER_TAG_MAX_PER_WORKSPACE } =
  await import('../customerTag.service.js');
const { default: repo } = await import('../../../repositories/customer/customerTag.repository.js');

/**
 * PR-T1 — luật của service tag khách hàng. SQL thật (cách ly workspace, ANY, cascade) nằm ở
 * tests/integration/customerTags.test.js; ở đây chỉ chốt chuẩn hoá đầu vào, mã lỗi và việc service
 * luôn truyền workspace xuống repository.
 */
describe('normalizeIdList', () => {
  it('bỏ trùng, nhận chuỗi phẩy, bỏ phần tử rỗng', () => {
    expect(normalizeIdList([3, '3', '5'], { label: 'x', max: 10 })).toEqual([3, 5]);
    expect(normalizeIdList('1,2, 2,,3', { label: 'x', max: 10 })).toEqual([1, 2, 3]);
    expect(normalizeIdList(undefined, { label: 'x', max: 10 })).toEqual([]);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc'], ['1e3'], ['1; DROP TABLE customers']])('%p → 400', (bad) => {
    expect(() => normalizeIdList([bad], { label: 'x', max: 10 })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('vượt trần → 400', () => {
    expect(() => normalizeIdList([1, 2, 3], { label: 'x', max: 2 })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('customerTagService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('createTag', () => {
    it('gộp khoảng trắng, cắt hai đầu, ghi vào đúng workspace', async () => {
      jest.spyOn(repo, 'findByName').mockResolvedValue(null);
      jest.spyOn(repo, 'countTags').mockResolvedValue(0);
      const create = jest.spyOn(repo, 'create').mockResolvedValue({ id: 7, name: 'Khách  VIP', color: '#ff0000' });
      const tag = await customerTagService.createTag(42, { name: '  Khách    VIP ', color: '#FF0000' });
      expect(create).toHaveBeenCalledWith(42, { name: 'Khách VIP', color: '#ff0000' });
      expect(tag).toMatchObject({ id: 7 });
    });

    it('trùng tên (repository tìm không phân biệt hoa/thường) → 409, không ghi', async () => {
      jest.spyOn(repo, 'findByName').mockResolvedValue({ id: 1, name: 'VIP' });
      const create = jest.spyOn(repo, 'create');
      await expect(customerTagService.createTag(42, { name: 'vip' })).rejects.toMatchObject({ statusCode: 409 });
      expect(repo.findByName).toHaveBeenCalledWith(42, 'vip');
      expect(create).not.toHaveBeenCalled();
    });

    it('hai yêu cầu song song: thua ở unique index (23505) cũng ra 409', async () => {
      jest.spyOn(repo, 'findByName').mockResolvedValue(null);
      jest.spyOn(repo, 'countTags').mockResolvedValue(0);
      jest.spyOn(repo, 'create').mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
      await expect(customerTagService.createTag(42, { name: 'VIP' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it.each([[''], ['   '], ['x'.repeat(61)]])('tên %p không hợp lệ → 400', async (name) => {
      await expect(customerTagService.createTag(42, { name })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('màu sai định dạng → 400; quá trần số tag → 400', async () => {
      jest.spyOn(repo, 'findByName').mockResolvedValue(null);
      await expect(customerTagService.createTag(42, { name: 'a', color: 'red' })).rejects.toMatchObject({ statusCode: 400 });
      jest.spyOn(repo, 'countTags').mockResolvedValue(CUSTOMER_TAG_MAX_PER_WORKSPACE);
      await expect(customerTagService.createTag(42, { name: 'a' })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('updateTag / deleteTag', () => {
    it('đổi tên trùng tag KHÁC → 409; trùng chính nó (đổi hoa/thường) thì được', async () => {
      jest.spyOn(repo, 'findByName').mockResolvedValue({ id: 9, name: 'VIP' });
      await expect(customerTagService.updateTag(42, 5, { name: 'vip' })).rejects.toMatchObject({ statusCode: 409 });
      jest.spyOn(repo, 'update').mockResolvedValue({ id: 9, name: 'vip', color: null });
      await expect(customerTagService.updateTag(42, 9, { name: 'vip' })).resolves.toMatchObject({ id: 9 });
    });

    it('tag của workspace khác (repository không thấy) → 404', async () => {
      jest.spyOn(repo, 'update').mockResolvedValue(null);
      await expect(customerTagService.updateTag(42, 5, { color: '#000000' })).rejects.toMatchObject({ statusCode: 404 });
      jest.spyOn(repo, 'remove').mockResolvedValue({ deleted: false, customerCount: 0 });
      await expect(customerTagService.deleteTag(42, 5)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('xoá trả số khách đang mang để giao diện báo', async () => {
      const remove = jest.spyOn(repo, 'remove').mockResolvedValue({ deleted: true, customerCount: 12 });
      await expect(customerTagService.deleteTag(42, 5)).resolves.toEqual({ customerCount: 12 });
      expect(remove).toHaveBeenCalledWith(42, 5);
    });
  });

  describe('assignTags', () => {
    it('chặn quá 5.000 khách mỗi lần và thiếu khách/tag', async () => {
      const tooMany = Array.from({ length: CUSTOMER_TAG_MAX_CUSTOMERS_PER_CALL + 1 }, (_, i) => i + 1);
      await expect(customerTagService.assignTags(42, { customerIds: tooMany, tagIds: [1] })).rejects.toMatchObject({ statusCode: 400 });
      await expect(customerTagService.assignTags(42, { customerIds: [], tagIds: [1] })).rejects.toMatchObject({ statusCode: 400 });
      jest.spyOn(repo, 'findByIds').mockResolvedValue([]);
      await expect(customerTagService.assignTags(42, { customerIds: [1] })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('tagIds có id không thuộc workspace → 404 và KHÔNG ghi', async () => {
      jest.spyOn(repo, 'findByIds').mockResolvedValue([{ id: 1 }]);
      const assign = jest.spyOn(repo, 'assign');
      await expect(customerTagService.assignTags(42, { customerIds: [1], tagIds: [1, 2] })).rejects.toMatchObject({ statusCode: 404 });
      expect(assign).not.toHaveBeenCalled();
    });

    it('tagNames: dùng lại tag có sẵn (không phân biệt hoa/thường), tạo tag mới; truyền workspace + người thao tác', async () => {
      jest.spyOn(repo, 'findByIds').mockResolvedValue([]);
      jest.spyOn(repo, 'findByName').mockImplementation(async (_ws, name) => (name.toLowerCase() === 'vip' ? { id: 3, name: 'VIP' } : null));
      jest.spyOn(repo, 'countTags').mockResolvedValue(1);
      jest.spyOn(repo, 'create').mockResolvedValue({ id: 8, name: 'Mới', color: null });
      const assign = jest.spyOn(repo, 'assign').mockResolvedValue(4);
      const result = await customerTagService.assignTags(42, { customerIds: ['10', 11], tagNames: ['vip', 'Mới'], actorUserId: 99 });
      expect(assign).toHaveBeenCalledWith(42, expect.objectContaining({
        customerIds: [10, 11], tagIds: [3, 8], assignedBy: 99, source: 'manual',
      }));
      expect(result).toEqual({ assigned: 4, tagIds: [3, 8] });
    });
  });

  describe('getTagsByCustomerIds', () => {
    it('gom hàng phẳng thành map theo khách', async () => {
      jest.spyOn(repo, 'listForCustomers').mockResolvedValue([
        { customer_id: '1', id: '5', name: 'A', color: '#111111' },
        { customer_id: '1', id: '6', name: 'B', color: null },
        { customer_id: '2', id: '5', name: 'A', color: '#111111' },
      ]);
      const map = await customerTagService.getTagsByCustomerIds([1, 2, 3]);
      expect(map.get(1)).toEqual([{ id: 5, name: 'A', color: '#111111' }, { id: 6, name: 'B', color: null }]);
      expect(map.get(2)).toHaveLength(1);
      expect(map.has(3)).toBe(false);
    });
  });
});
