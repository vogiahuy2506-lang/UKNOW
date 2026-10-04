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

describe('formatProfileForPrompt — dòng Logo chỉ dành cho landing / email, không vào prompt chatbot (A P2-6)', () => {
  const profileNoLogo = { company_name: 'Shop A' };
  const profileWithLogo = { company_name: 'Shop A', logo_url: 'https://cdn.example.com/logo.png' };

  it('mặc định (landing, trợ lý chiến dịch): chưa có logo → dòng "(chưa có — dùng text header thay thế)"; có logo → URL', () => {
    expect(svc.formatProfileForPrompt(profileNoLogo, [])).toContain('Logo URL: (chưa có — dùng text header thay thế)');
    expect(svc.formatProfileForPrompt(profileWithLogo, [])).toContain('Logo URL: https://cdn.example.com/logo.png');
  });

  it('includeLogo=false (chatbot): KHÔNG có dòng Logo dù có hay chưa có logo, các dòng khác vẫn đủ', () => {
    for (const profile of [profileNoLogo, profileWithLogo]) {
      const text = svc.formatProfileForPrompt(profile, [{ product_name: 'Khóa Python', price: '2.9tr' }], { includeLogo: false });
      expect(text).not.toContain('Logo');
      expect(text).toContain('Tên công ty: Shop A');
      expect(text).toContain('Khóa Python');
    }
  });

  it('getFormattedProfileForPrompt: mặc định giữ dòng Logo; { includeLogo: false } bỏ dòng đó', async () => {
    expect(await svc.getFormattedProfileForPrompt(3)).toContain('Logo URL: (chưa có');
    expect(await svc.getFormattedProfileForPrompt(3, { includeLogo: false })).not.toContain('Logo');
  });
});

describe('buildProductsChunkText — một nơi định dạng chunk RAG sản phẩm', () => {
  it('có sản phẩm → "Sản phẩm / Dịch vụ:\n<danh sách>"; không có → ""', async () => {
    const { buildProductsChunkText, serializeProductList } = await import('../businessProfile.service.js');
    const rows = [{ product_name: 'Khóa Python', price: '2.9tr' }];
    expect(buildProductsChunkText(rows)).toBe(`Sản phẩm / Dịch vụ:\n${serializeProductList(rows)}`);
    expect(buildProductsChunkText([])).toBe('');
    expect(buildProductsChunkText(null)).toBe('');
  });
});
