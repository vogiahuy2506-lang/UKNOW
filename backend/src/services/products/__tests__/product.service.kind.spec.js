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

describe('product.service — price_amount (giá dạng số)', () => {
  it('mapProduct trả priceAmount là số (pg trả BIGINT dạng chuỗi), null khi chưa có', () => {
    expect(productService.mapProduct({ ...row, price_amount: '1500000' }).priceAmount).toBe(1500000);
    expect(productService.mapProduct({ ...row, price_amount: null }).priceAmount).toBeNull();
    expect(productService.mapProduct({ ...row }).priceAmount).toBeNull();
  });

  it('create: không gửi priceAmount mà price đọc được -> tự điền; gửi priceAmount -> dùng đúng số đó; giá không đọc được -> null', async () => {
    await productService.create({ payload: { productName: 'A', price: '1,5tr' }, user });
    expect(insert.mock.calls[0][0].priceAmount).toBe(1500000);
    await productService.create({ payload: { productName: 'B', price: '1,5tr', priceAmount: 1400000 }, user });
    expect(insert.mock.calls[1][0].priceAmount).toBe(1400000);
    await productService.create({ payload: { productName: 'C', price: 'Liên hệ' }, user });
    expect(insert.mock.calls[2][0].priceAmount).toBeNull();
    await productService.create({ payload: { productName: 'D', price: 'x', priceAmount: '' }, user });
    expect(insert.mock.calls[3][0].priceAmount).toBeNull();
    await productService.create({ payload: { productName: 'E', priceAmount: '250000' }, user });
    expect(insert.mock.calls[4][0].priceAmount).toBe(250000);
  });

  it('create: priceAmount âm / không nguyên / chữ -> 400', async () => {
    for (const bad of [-1, 1.5, 'abc']) {
      await expect(productService.create({ payload: { productName: 'A', priceAmount: bad }, user })).rejects.toMatchObject({ status: 400 });
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it('update: không gửi gì về giá -> giữ số cũ; chưa có số mà giá cũ đọc được -> tự điền; đổi chữ giá -> đọc lại (không giữ số cũ sai)', async () => {
    findById.mockResolvedValue({ ...row, price: '500k', price_amount: '500000' });
    await productService.update({ productId: 9, payload: { productName: 'SP2' }, user });
    expect(update.mock.calls[0][2].priceAmount).toBe(500000);

    findById.mockResolvedValue({ ...row, price: '1,5tr', price_amount: null });
    await productService.update({ productId: 9, payload: { productName: 'SP2' }, user });
    expect(update.mock.calls[1][2].priceAmount).toBe(1500000);

    findById.mockResolvedValue({ ...row, price: '500k', price_amount: '500000' });
    await productService.update({ productId: 9, payload: { price: '600k' }, user });
    expect(update.mock.calls[2][2].priceAmount).toBe(600000);
    await productService.update({ productId: 9, payload: { price: 'Liên hệ' }, user });
    expect(update.mock.calls[3][2].priceAmount).toBeNull();
    await productService.update({ productId: 9, payload: { price: 'Liên hệ', priceAmount: 700000 }, user });
    expect(update.mock.calls[4][2].priceAmount).toBe(700000);
  });
});
