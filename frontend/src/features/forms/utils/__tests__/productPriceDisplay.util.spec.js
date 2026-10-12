import { describe, it, expect } from 'vitest';
import { buildProductPriceDisplay, splitProductUsp } from '../productPriceDisplay.util';
import { buildPreviewFormProduct } from '../buildPreviewFormProduct.util';

const product = (extra = {}) => ({
  name: 'Khoá AI',
  priceText: '2tr',
  priceAmount: 2000000,
  originalPrice: '3tr',
  ...extra,
});

describe('buildProductPriceDisplay — giá chính', () => {
  it('thanh toán mục đích "order": giá chính là số tiền khách sẽ trả (payment.amount), không phải giá sản phẩm', () => {
    const out = buildProductPriceDisplay({
      product: product({ originalPrice: '' }),
      payment: { enabled: true, purpose: 'order', amount: 1500000 },
    });
    expect(out.priceLabel).toBe('1.500.000 đ');
    expect(out.originalPriceLabel).toBeNull();
    expect(out.discountPercent).toBeNull();
  });

  it('"deposit" và "hold": giá chính vẫn là giá sản phẩm ("2tr"), không nhắc số tiền cọc / giữ chỗ', () => {
    for (const purpose of ['deposit', 'hold']) {
      const out = buildProductPriceDisplay({
        product: product(),
        payment: { enabled: true, purpose, amount: 200000 },
      });
      expect(out.priceLabel).toBe('2tr');
      expect(out.originalPriceLabel).toBe('3tr');
      expect(out.discountPercent).toBe(33);
    }
  });

  it('không có payment, payment tắt hoặc thiếu: dùng giá sản phẩm', () => {
    expect(buildProductPriceDisplay({ product: product(), payment: null }).priceLabel).toBe('2tr');
    expect(buildProductPriceDisplay({ product: product() }).priceLabel).toBe('2tr');
    expect(
      buildProductPriceDisplay({ product: product(), payment: { enabled: false, purpose: 'order', amount: 1500000 } }).priceLabel
    ).toBe('2tr');
  });

  it('không có priceText thì dùng priceAmount định dạng VND; không có cả hai thì không hiện giá', () => {
    expect(buildProductPriceDisplay({ product: product({ priceText: null, originalPrice: null }) }).priceLabel).toBe('2.000.000 đ');
    const none = buildProductPriceDisplay({ product: product({ priceText: null, priceAmount: null }) });
    expect(none).toEqual({ priceLabel: null, originalPriceLabel: null, discountPercent: null });
  });

  it('thanh toán "order" nhưng số tiền không hợp lệ (0 / thiếu) thì rơi về giá sản phẩm', () => {
    expect(
      buildProductPriceDisplay({ product: product(), payment: { enabled: true, purpose: 'order', amount: 0 } }).priceLabel
    ).toBe('2tr');
    expect(
      buildProductPriceDisplay({ product: product(), payment: { enabled: true, purpose: 'order' } }).priceLabel
    ).toBe('2tr');
  });

  it('không có product → rỗng', () => {
    expect(buildProductPriceDisplay({ product: null })).toEqual({ priceLabel: null, originalPriceLabel: null, discountPercent: null });
    expect(buildProductPriceDisplay()).toEqual({ priceLabel: null, originalPriceLabel: null, discountPercent: null });
  });
});

describe('buildProductPriceDisplay — giá gốc gạch ngang và nhãn giảm %', () => {
  it('giá gốc trùng chuỗi giá chính (không phân biệt hoa thường / khoảng trắng) thì không hiện', () => {
    const out = buildProductPriceDisplay({ product: product({ originalPrice: ' 2TR ' }) });
    expect(out.originalPriceLabel).toBeNull();
    expect(out.discountPercent).toBeNull();
  });

  it('giá gốc khác và lớn hơn: hiện gạch + % làm tròn XUỐNG (3tr → 2tr = 33%)', () => {
    const out = buildProductPriceDisplay({ product: product() });
    expect(out).toEqual({ priceLabel: '2tr', originalPriceLabel: '3tr', discountPercent: 33 });
  });

  it('order: % tính theo số tiền khách trả (3tr → 1.500.000 đ = 50%)', () => {
    const out = buildProductPriceDisplay({
      product: product(),
      payment: { enabled: true, purpose: 'order', amount: 1500000 },
    });
    expect(out).toEqual({ priceLabel: '1.500.000 đ', originalPriceLabel: '3tr', discountPercent: 50 });
  });

  it('không đọc được giá thành số ("Liên hệ", "từ 500k") thì vẫn gạch giá gốc nhưng KHÔNG đoán %', () => {
    const contact = buildProductPriceDisplay({ product: product({ priceText: 'Liên hệ', originalPrice: '3tr' }) });
    expect(contact).toEqual({ priceLabel: 'Liên hệ', originalPriceLabel: '3tr', discountPercent: null });

    const vagueOriginal = buildProductPriceDisplay({ product: product({ originalPrice: 'từ 3tr' }) });
    expect(vagueOriginal).toEqual({ priceLabel: '2tr', originalPriceLabel: 'từ 3tr', discountPercent: null });
  });

  it('đọc được cả hai số mà giá gốc KHÔNG cao hơn thì ẩn giá gốc (gạch ngang chỉ gây hiểu nhầm), không có %', () => {
    const lower = buildProductPriceDisplay({ product: product({ originalPrice: '1tr' }) });
    expect(lower).toEqual({ priceLabel: '2tr', originalPriceLabel: null, discountPercent: null });
    const sameNumber = buildProductPriceDisplay({ product: product({ originalPrice: '2.000.000đ' }) });
    expect(sameNumber).toEqual({ priceLabel: '2tr', originalPriceLabel: null, discountPercent: null });
  });

  it('chênh dưới 1% thì không hiện nhãn %', () => {
    const out = buildProductPriceDisplay({ product: product({ priceText: '1.999.000đ', originalPrice: '2.000.000đ' }) });
    expect(out.originalPriceLabel).toBe('2.000.000đ');
    expect(out.discountPercent).toBeNull();
  });

  it('chỉ có giá gốc, không có giá chính: không hiện gì', () => {
    const out = buildProductPriceDisplay({ product: product({ priceText: null, priceAmount: null }) });
    expect(out.originalPriceLabel).toBeNull();
  });
});

describe('splitProductUsp', () => {
  it('tách theo dòng, bỏ dòng trống và ký hiệu đầu dòng, giữ "-20%" dính liền chữ', () => {
    expect(splitProductUsp('Cầm tay chỉ việc\n\n- Hỗ trợ 1-1\r\n• Học lại miễn phí\n✓ Có chứng nhận\n-20% hôm nay')).toEqual([
      'Cầm tay chỉ việc',
      'Hỗ trợ 1-1',
      'Học lại miễn phí',
      'Có chứng nhận',
      '-20% hôm nay',
    ]);
  });

  it('không phải chuỗi / rỗng → mảng rỗng', () => {
    expect(splitProductUsp(null)).toEqual([]);
    expect(splitProductUsp(undefined)).toEqual([]);
    expect(splitProductUsp('   \n  ')).toEqual([]);
  });
});

describe('buildPreviewFormProduct — xem trước theo quy tắc của API công khai', () => {
  const option = (extra = {}) => ({
    id: 11,
    productName: 'Khoá AI',
    productCode: 'SP-NOI-BO',
    productUrl: 'https://example.com/noi-bo',
    price: '2tr',
    priceAmount: 2000000,
    originalPrice: '3tr',
    status: 'active',
    description: 'Mô tả',
    usp: 'Điểm nổi bật',
    thumbnailUrl: 'https://cdn.example.com/a.png',
    ...extra,
  });

  it('đúng 7 khoá, không lộ productUrl / productCode / id', () => {
    const out = buildPreviewFormProduct(option());
    expect(Object.keys(out).sort()).toEqual(['description', 'imageUrl', 'name', 'originalPrice', 'priceAmount', 'priceText', 'usp']);
    expect(out).toEqual({
      name: 'Khoá AI',
      imageUrl: 'https://cdn.example.com/a.png',
      priceText: '2tr',
      priceAmount: 2000000,
      originalPrice: '3tr',
      description: 'Mô tả',
      usp: 'Điểm nổi bật',
    });
  });

  it('sản phẩm ngừng bán → null; status NULL/rỗng/viết hoa vẫn là đang bán', () => {
    expect(buildPreviewFormProduct(option({ status: 'inactive' }))).toBeNull();
    expect(buildPreviewFormProduct(option({ status: null }))).not.toBeNull();
    expect(buildPreviewFormProduct(option({ status: '  ' }))).not.toBeNull();
    expect(buildPreviewFormProduct(option({ status: ' ACTIVE ' }))).not.toBeNull();
  });

  it('ảnh javascript: / data: / đường dẫn tương đối / rỗng → imageUrl null', () => {
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/x.png', '', null, undefined]) {
      expect(buildPreviewFormProduct(option({ thumbnailUrl: bad })).imageUrl).toBeNull();
    }
    expect(buildPreviewFormProduct(option({ thumbnailUrl: 'http://cdn.example.com/b.jpg' })).imageUrl).toBe('http://cdn.example.com/b.jpg');
  });

  it('mô tả / điểm nổi bật cắt 1000 ký tự; không có sản phẩm → null', () => {
    expect(buildPreviewFormProduct(option({ description: 'a'.repeat(1500) })).description).toHaveLength(1000);
    expect(buildPreviewFormProduct(null)).toBeNull();
    expect(buildPreviewFormProduct(undefined)).toBeNull();
  });
});
