import { serializeProductList } from '../businessProfile.service.js';

describe('serializeProductList', () => {
  it('returns empty string for empty input', () => {
    expect(serializeProductList([])).toBe('');
    expect(serializeProductList(null)).toBe('');
  });

  it('serializes core fields and new AI fields when present', () => {
    const text = serializeProductList([
      {
        product_name: 'Khóa Python',
        category: 'Khóa học',
        price: '2.9tr',
        original_price: '3.9tr',
        description: 'Học từ cơ bản',
        usp: 'Cam kết việc làm',
        target_audience: 'Sinh viên IT',
        product_url: 'https://example.com/python',
      },
    ]);

    expect(text).toContain('1. Khóa Python');
    expect(text).toContain('Danh mục: Khóa học');
    expect(text).toContain('Giá: 2.9tr');
    expect(text).toContain('Giá gốc: 3.9tr');
    expect(text).toContain('Học từ cơ bản');
    expect(text).toContain('Điểm nổi bật: Cam kết việc làm');
    expect(text).toContain('Đối tượng: Sinh viên IT');
    expect(text).toContain('Link: https://example.com/python');
  });

  it('supports camelCase legacy keys', () => {
    const text = serializeProductList([
      {
        productName: 'Gói Pro',
        targetAudience: 'Chủ shop online',
        productUrl: 'https://example.com/pro',
      },
    ]);

    expect(text).toContain('1. Gói Pro');
    expect(text).toContain('Đối tượng: Chủ shop online');
    expect(text).toContain('Link: https://example.com/pro');
  });

  it('omits original price when same as price', () => {
    const text = serializeProductList([{ product_name: 'A', price: '100k', original_price: '100k' }]);
    expect(text).not.toContain('Giá gốc');
  });

  it('trần an toàn: tối đa 30 sản phẩm', () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ product_name: `SP${i + 1}` }));
    const lines = serializeProductList(rows).split('\n');
    expect(lines).toHaveLength(30);
    expect(lines[29]).toContain('SP30');
    expect(serializeProductList(rows)).not.toContain('SP31');
  });

  it('trần an toàn: mô tả và điểm nổi bật cắt 300 ký tự + "…"; đúng 300 giữ nguyên', () => {
    const text = serializeProductList([
      { product_name: 'A', description: 'd'.repeat(500), usp: 'u'.repeat(500) },
      { product_name: 'B', description: 'd'.repeat(300), usp: 'ngắn' },
    ]);
    const [a, b] = text.split('\n');
    expect(a).toContain(`${'d'.repeat(300)}…`);
    expect(a).not.toContain('d'.repeat(301));
    expect(a).toContain(`Điểm nổi bật: ${'u'.repeat(300)}…`);
    expect(b).toContain('d'.repeat(300));
    expect(b).not.toContain('…');
  });
});
