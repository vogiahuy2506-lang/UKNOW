import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const insert = jest.fn();
const findById = jest.fn();
const update = jest.fn();
jest.unstable_mockModule('../../../repositories/products/product.repository.js', () => ({
  default: { insert, findById, update },
}));
jest.unstable_mockModule('../../ai/businessProfile.service.js', () => ({
  default: { reembedChunks: jest.fn().mockResolvedValue(undefined) },
}));

const { default: productService } = await import('../product.service.js');
const user = { id: 5, role: 'user_admin', activeContext: { type: 'self' } };
const row = { id: 9, id_user: 5, workspace_owner_id: 5, product_name: 'SP', status: 'active', kind: 'event' };

beforeEach(() => {
  insert.mockReset().mockResolvedValue(9);
  update.mockReset().mockResolvedValue({ id: 9 });
  findById.mockReset().mockResolvedValue(row);
});

describe('product.service — kind', () => {
  it('mapProduct trả kind; thiếu/sai → sale', () => {
    expect(productService.mapProduct({ ...row, kind: 'event' }).kind).toBe('event');
    expect(productService.mapProduct({ ...row, kind: undefined }).kind).toBe('sale');
    expect(productService.mapProduct({ ...row, kind: 'zzz' }).kind).toBe('sale');
  });

  it('create: kind=event được ghi; thiếu kind -> sale (không bao giờ null)', async () => {
    await productService.create({ payload: { productName: 'A', kind: 'event' }, user });
    expect(insert.mock.calls[0][0].kind).toBe('event');
    await productService.create({ payload: { productName: 'B' }, user });
    expect(insert.mock.calls[1][0].kind).toBe('sale');
  });

  it('update: không gửi kind -> giữ kind cũ của dòng; gửi kind -> đổi', async () => {
    await productService.update({ productId: 9, payload: { productName: 'SP2' }, user });
    expect(update.mock.calls[0][2].kind).toBe('event');
    await productService.update({ productId: 9, payload: { kind: 'sale' }, user });
    expect(update.mock.calls[1][2].kind).toBe('sale');
  });
});
