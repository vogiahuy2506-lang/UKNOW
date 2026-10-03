/**
 * F2.4 (D-06 / A P2-6) — sản phẩm ngừng bán không được vào prompt AI.
 *
 * Spec này kiểm hai thứ ở tầng unit:
 *  1. `productRepository.findAllByUser`: có `{ activeOnly: true }` thì SQL thêm điều kiện trạng thái, KHÔNG có thì giữ nguyên
 *     hành vi cũ (lấy mọi sản phẩm — trang quản lý không bị ảnh hưởng).
 *  2. MỌI đường đưa sản phẩm cho AI (`businessProfileService`: prompt đầy đủ, landing, embedding RAG) đều gọi bằng
 *     `activeOnly: true`. Dùng một repository GIẢ trung thực (lọc theo đúng cờ) nên nếu một đường quên cờ thì sản phẩm
 *     `inactive` lọt vào prompt và ca đỏ.
 * Câu SQL thật được kiểm trên Postgres thật ở tests/integration/productsActiveOnlyForAi.test.js.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const findProfile = jest.fn();
const upsertChunks = jest.fn();
const embedTexts = jest.fn();
const embedText = jest.fn();
const searchSimilarChunks = jest.fn();

// Kho sản phẩm giả của một chủ shop: có cả đang bán, ngừng bán, và trạng thái trống.
const PRODUCT_TABLE = [
  { id: 1, product_name: 'Khoá Excel đang bán', price: '990k', status: 'active' },
  { id: 2, product_name: 'Khoá Photoshop ĐÃ NGỪNG BÁN', price: '1.2tr', status: 'inactive' },
  { id: 3, product_name: 'Khoá SQL trạng thái trống', price: '500k', status: null },
];
const isActive = (row) => (String(row.status ?? '').trim().toLowerCase() || 'active') === 'active';

jest.unstable_mockModule('../../config/database.js', () => ({ default: { query: mockQuery } }));

jest.unstable_mockModule('../ai/businessProfile.repository.js', () => ({
  default: {
    findByUserId: findProfile,
    deleteChunksByUserId: jest.fn(),
    insertChunks: upsertChunks,
    upsert: jest.fn(),
    searchSimilarChunks,
  },
}));
jest.unstable_mockModule('../../utils/embeddingClient.util.js', () => ({
  embedText,
  embedTexts,
}));

const { default: productRepository } = await import('../products/product.repository.js');
const { default: businessProfileService } = await import('../../services/ai/businessProfile.service.js');

describe('productRepository.findAllByUser — activeOnly', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('có activeOnly: SQL lọc trạng thái (NULL/rỗng coi là active, không phân biệt hoa thường)', async () => {
    await productRepository.findAllByUser(5, { activeOnly: true });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/COALESCE\(NULLIF\(LOWER\(BTRIM\(status\)\), ''\), 'active'\) = 'active'/);
    expect(params).toEqual([5]);
  });

  it('không có activeOnly (mặc định): KHÔNG lọc trạng thái — giữ hành vi cũ', async () => {
    await productRepository.findAllByUser(5);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/status\)\)?,? ?''/);
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/= 'active'/);

    mockQuery.mockClear();
    await productRepository.findAllByUser(5, { activeOnly: false });
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/= 'active'/);
  });
});

describe('businessProfileService — sản phẩm inactive không vào prompt/landing/embedding', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    findProfile.mockReset();
    upsertChunks.mockReset();
    embedTexts.mockReset();
    embedText.mockReset();
    searchSimilarChunks.mockReset();
    // Repository giả TRUNG THỰC: tôn trọng cờ activeOnly như SQL thật.
    mockQuery.mockImplementation(async (sql) => ({
      rows: /= 'active'/.test(sql) ? PRODUCT_TABLE.filter(isActive) : PRODUCT_TABLE,
    }));
    findProfile.mockResolvedValue({ company_name: 'Cửa hàng Hoa Nắng', industry: 'Đào tạo', tone: 'Thân thiện' });
    embedTexts.mockImplementation(async (texts) => texts.map(() => [0.1]));
    embedText.mockResolvedValue([0.1]);
    searchSimilarChunks.mockResolvedValue([]);
  });

  it('getFormattedProfileForPrompt (chatbot kênh, chỉ dẫn AI viết, trợ lý chiến dịch): loại sản phẩm inactive', async () => {
    const text = await businessProfileService.getFormattedProfileForPrompt(5);

    expect(text).toContain('Khoá Excel đang bán');
    expect(text).toContain('Khoá SQL trạng thái trống');
    expect(text).not.toContain('ĐÃ NGỪNG BÁN');
    expect(text).not.toContain('1.2tr');
  });

  it('getContextForLandingAi (fallback hồ sơ đầy đủ khi RAG rỗng): loại sản phẩm inactive', async () => {
    // RAG không có chunk (searchSimilarChunks → []) → rơi về hồ sơ đầy đủ.
    const text = await businessProfileService.getContextForLandingAi(5, 'tạo landing bán khoá học');

    expect(text).toContain('Khoá Excel đang bán');
    expect(text).not.toContain('ĐÃ NGỪNG BÁN');
  });

  it('reembedChunks (embedding RAG): chunk sản phẩm không chứa sản phẩm inactive', async () => {
    await businessProfileService.reembedChunks(5);

    const embeddedTexts = embedTexts.mock.calls[0][0];
    const productChunk = embeddedTexts.find((t) => t.startsWith('Sản phẩm / Dịch vụ'));
    expect(productChunk).toContain('Khoá Excel đang bán');
    expect(productChunk).not.toContain('ĐÃ NGỪNG BÁN');
  });
});
