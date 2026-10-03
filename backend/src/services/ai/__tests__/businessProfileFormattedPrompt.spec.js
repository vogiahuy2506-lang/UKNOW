import { describe, expect, it, jest } from '@jest/globals';

const ALL = [
  { product_name: 'Khóa Python', price: '2.9tr', status: 'active' },
  { product_name: 'Khóa Cũ Ngừng Bán', price: '1tr', status: 'inactive' },
];
// Repo giả phản chiếu hợp đồng activeOnly (SQL thật: tests/integration).
const findAllByUser = jest.fn(async (_id, { activeOnly = false } = {}) => (activeOnly ? ALL.filter((p) => p.status === 'active') : ALL));

jest.unstable_mockModule('../../../repositories/products/product.repository.js', () => ({ default: { findAllByUser } }));
jest.unstable_mockModule('../../../repositories/ai/businessProfile.repository.js', () => ({
  default: { findByUserId: jest.fn(async () => ({ company_name: 'Shop A' })) },
}));
jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({ embedText: jest.fn(), embedTexts: jest.fn() }));

const { default: svc } = await import('../businessProfile.service.js');

describe('getFormattedProfileForPrompt — sản phẩm vào prompt chatbot', () => {
  it('có tên + giá sản phẩm đang bán, KHÔNG có sản phẩm ngừng bán', async () => {
    const text = await svc.getFormattedProfileForPrompt(3);
    expect(findAllByUser).toHaveBeenCalledWith(3, { activeOnly: true });
    expect(text).toContain('Khóa Python');
    expect(text).toContain('2.9tr');
    expect(text).not.toContain('Ngừng Bán');
  });
});
