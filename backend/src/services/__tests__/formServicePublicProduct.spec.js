import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Thẻ sản phẩm trên biểu mẫu công khai (plan 12/10/2026): getPublicForm / getSubmissionStatus trả `product`
// qua whitelist thủ công `buildPublicFormProduct`, chỉ khi form gắn sản phẩm ĐANG BÁN của ĐÚNG workspace
// và chủ không tắt `settings.showProductCard`.
const repo = {
  findFormByPublicKey: jest.fn(),
  findSubmissionByAccessTokenAndForm: jest.fn(),
};

jest.unstable_mockModule('../../repositories/form.repository.js', () => ({
  default: repo,
  MAX_FORM_RESPONDENT_EMAILS_PER_24H: 200,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H: 3,
}));

const productRepo = { findById: jest.fn() };
jest.unstable_mockModule('../../repositories/products/product.repository.js', () => ({
  default: productRepo,
}));

const logError = jest.fn();
jest.unstable_mockModule('../../utils/logger.util.js', () => ({ logError }));

const { default: formService, buildPublicFormProduct } = await import('../form.service.js');

const PUBLIC_PRODUCT_KEYS = ['description', 'imageUrl', 'name', 'originalPrice', 'priceAmount', 'priceText', 'usp'];

function makeProductRow(overrides = {}) {
  return {
    id: 77,
    id_user: 10,
    workspace_owner_id: 10,
    product_code: 'SP-NOI-BO',
    product_name: 'Khoá học AI',
    price: '2tr',
    original_price: '3tr',
    status: 'active',
    description: 'Học AI từ con số 0',
    usp: 'Cầm tay chỉ việc\nHọc lại miễn phí',
    category: 'Khoá học',
    thumbnail_url: 'https://cdn.example.com/a.png',
    product_url: 'https://example.com/san-pham-noi-bo',
    target_audience: 'Chủ shop',
    kind: 'sale',
    price_amount: '2000000',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    ...overrides,
  };
}

function makeForm({ settings = {}, productId = 77, workspaceOwnerId = 10 } = {}) {
  return {
    id: 1,
    workspaceOwnerId,
    publicKey: 'pub_test_123456',
    title: 'Form đặt mua',
    description: null,
    fields: [
      { key: 'f_name', type: 'short_text', label: 'Họ tên', required: true, role: 'name', options: [], placeholder: '', helpText: '' },
    ],
    settings,
    theme: {},
    productId,
    isPublished: true,
    adminDisabledAt: null,
    ownerEmail: 'owner@example.com',
    ownerActivePlanId: 2,
    ownerSubscriptionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    ownerGracePeriodDays: 3,
    paymentConfig: null,
    bookingConfig: null,
  };
}

beforeEach(() => {
  repo.findFormByPublicKey.mockReset();
  repo.findSubmissionByAccessTokenAndForm.mockReset();
  productRepo.findById.mockReset();
  logError.mockReset();
});

describe('form.service.getPublicForm — thẻ sản phẩm (product)', () => {
  it('form gắn sản phẩm đang bán: trả ĐÚNG 7 khoá whitelist, không lộ product_url/product_code/id', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm());
    productRepo.findById.mockResolvedValue(makeProductRow());

    const pub = await formService.getPublicForm('pub_test_123456');

    expect(Object.keys(pub.product).sort()).toEqual(PUBLIC_PRODUCT_KEYS);
    expect(pub.product).toEqual({
      name: 'Khoá học AI',
      imageUrl: 'https://cdn.example.com/a.png',
      priceText: '2tr',
      priceAmount: 2000000,
      originalPrice: '3tr',
      description: 'Học AI từ con số 0',
      usp: 'Cầm tay chỉ việc\nHọc lại miễn phí',
    });
    const serialized = JSON.stringify(pub.product);
    expect(serialized).not.toContain('san-pham-noi-bo');
    expect(serialized).not.toContain('SP-NOI-BO');
  });

  it('tra sản phẩm theo ĐÚNG workspace của CHỦ form (không lộ sản phẩm workspace khác)', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ workspaceOwnerId: 42, productId: 77 }));
    productRepo.findById.mockResolvedValue(makeProductRow());

    await formService.getPublicForm('pub_test_123456');

    expect(productRepo.findById).toHaveBeenCalledTimes(1);
    expect(productRepo.findById).toHaveBeenCalledWith(77, { workspaceOwnerId: 42 });
  });

  it('sản phẩm không thuộc workspace (findById trả null) -> product: null', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm());
    productRepo.findById.mockResolvedValue(null);

    const pub = await formService.getPublicForm('pub_test_123456');

    expect(pub.product).toBeNull();
  });

  it('settings.showProductCard === false -> product: null và KHÔNG tra sản phẩm', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ settings: { showProductCard: false } }));
    productRepo.findById.mockResolvedValue(makeProductRow());

    const pub = await formService.getPublicForm('pub_test_123456');

    expect(pub.product).toBeNull();
    expect(productRepo.findById).not.toHaveBeenCalled();
  });

  it('showProductCard vắng hoặc true -> HIỆN thẻ (mặc định bật)', async () => {
    productRepo.findById.mockResolvedValue(makeProductRow());

    repo.findFormByPublicKey.mockResolvedValue(makeForm({ settings: {} }));
    expect((await formService.getPublicForm('pub_test_123456')).product).not.toBeNull();

    repo.findFormByPublicKey.mockResolvedValue(makeForm({ settings: { showProductCard: true } }));
    expect((await formService.getPublicForm('pub_test_123456')).product).not.toBeNull();
  });

  it('sản phẩm ngừng bán (status != active) -> product: null', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm());
    productRepo.findById.mockResolvedValue(makeProductRow({ status: 'inactive' }));

    const pub = await formService.getPublicForm('pub_test_123456');

    expect(pub.product).toBeNull();
  });

  it('status NULL/rỗng/viết hoa vẫn coi là đang bán (khớp trang quản lý sản phẩm)', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm());

    productRepo.findById.mockResolvedValue(makeProductRow({ status: null }));
    expect((await formService.getPublicForm('pub_test_123456')).product).not.toBeNull();
    productRepo.findById.mockResolvedValue(makeProductRow({ status: '  ' }));
    expect((await formService.getPublicForm('pub_test_123456')).product).not.toBeNull();
    productRepo.findById.mockResolvedValue(makeProductRow({ status: ' ACTIVE ' }));
    expect((await formService.getPublicForm('pub_test_123456')).product).not.toBeNull();
  });

  it('form không gắn sản phẩm -> product: null và KHÔNG tra sản phẩm', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ productId: null }));

    const pub = await formService.getPublicForm('pub_test_123456');

    expect(pub.product).toBeNull();
    expect(productRepo.findById).not.toHaveBeenCalled();
  });

  it('thumbnail_url là javascript:/data:/đường dẫn tương đối/rác -> imageUrl: null (phần còn lại vẫn trả)', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm());

    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '/x.png', '//evil.example/x.png', 'khong-phai-url', '', '   ', null]) {
      productRepo.findById.mockResolvedValue(makeProductRow({ thumbnail_url: bad }));
      const pub = await formService.getPublicForm('pub_test_123456');
      expect(pub.product).not.toBeNull();
      expect(pub.product.imageUrl).toBeNull();
      expect(pub.product.name).toBe('Khoá học AI');
    }

    productRepo.findById.mockResolvedValue(makeProductRow({ thumbnail_url: 'http://cdn.example.com/b.jpg' }));
    expect((await formService.getPublicForm('pub_test_123456')).product.imageUrl).toBe('http://cdn.example.com/b.jpg');
  });

  it('findById ném lỗi -> trang biểu mẫu vẫn trả, product: null, có ghi log', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm());
    productRepo.findById.mockRejectedValue(new Error('connection terminated'));

    const pub = await formService.getPublicForm('pub_test_123456');

    expect(pub.product).toBeNull();
    expect(pub.title).toBe('Form đặt mua');
    expect(pub.fields).toHaveLength(1);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('settings công khai KHÔNG lộ showProductCard (khoá nội bộ của trình soạn)', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ settings: { showProductCard: true } }));
    productRepo.findById.mockResolvedValue(makeProductRow());

    const pub = await formService.getPublicForm('pub_test_123456');

    expect(pub.settings).not.toHaveProperty('showProductCard');
  });
});

describe('buildPublicFormProduct (hàm thuần)', () => {
  it('description và usp cắt ở 1000 ký tự; chuỗi rỗng/chỉ khoảng trắng -> null', () => {
    const out = buildPublicFormProduct(makeProductRow({ description: 'a'.repeat(1500), usp: 'b'.repeat(1000) }));
    expect(out.description).toHaveLength(1000);
    expect(out.usp).toHaveLength(1000);

    const blank = buildPublicFormProduct(makeProductRow({ description: '   ', usp: null, price: '', original_price: '  ' }));
    expect(blank.description).toBeNull();
    expect(blank.usp).toBeNull();
    expect(blank.priceText).toBeNull();
    expect(blank.originalPrice).toBeNull();
  });

  it('không để lại nửa cặp surrogate khi cắt giữa emoji', () => {
    const text = `${'a'.repeat(999)}😀tail`;
    const out = buildPublicFormProduct(makeProductRow({ description: text }));
    expect(out.description).toBe('a'.repeat(999));
  });

  it('price_amount: chuỗi số từ pg -> number; NULL/không đọc được -> null', () => {
    expect(buildPublicFormProduct(makeProductRow({ price_amount: '2000000' })).priceAmount).toBe(2000000);
    expect(buildPublicFormProduct(makeProductRow({ price_amount: 1500000 })).priceAmount).toBe(1500000);
    expect(buildPublicFormProduct(makeProductRow({ price_amount: null })).priceAmount).toBeNull();
    expect(buildPublicFormProduct(makeProductRow({ price_amount: 'abc' })).priceAmount).toBeNull();
  });

  it('không có dòng -> null', () => {
    expect(buildPublicFormProduct(null)).toBeNull();
    expect(buildPublicFormProduct(undefined)).toBeNull();
  });
});

describe('form.service.getSubmissionStatus — product cho trang QR', () => {
  const submission = {
    id: 5,
    status: 'submitted',
    holdExpiresAt: null,
    appointmentAt: null,
    paymentSnapshot: null,
    paymentAmount: null,
    paymentCode: null,
    payerReportedPaidAt: null,
    paymentReceiptKey: null,
    paymentReceiptWaivedReason: null,
  };

  it('đủ điều kiện -> product chỉ có { name, imageUrl }', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm());
    repo.findSubmissionByAccessTokenAndForm.mockResolvedValue(submission);
    productRepo.findById.mockResolvedValue(makeProductRow());

    const res = await formService.getSubmissionStatus('pub_test_123456', 'tok');

    expect(res.product).toEqual({ name: 'Khoá học AI', imageUrl: 'https://cdn.example.com/a.png' });
    expect(productRepo.findById).toHaveBeenCalledWith(77, { workspaceOwnerId: 10 });
  });

  it('tắt công tắc / sản phẩm ngừng bán / không gắn / lỗi DB -> product: null', async () => {
    repo.findSubmissionByAccessTokenAndForm.mockResolvedValue(submission);

    repo.findFormByPublicKey.mockResolvedValue(makeForm({ settings: { showProductCard: false } }));
    productRepo.findById.mockResolvedValue(makeProductRow());
    expect((await formService.getSubmissionStatus('pub_test_123456', 'tok')).product).toBeNull();

    repo.findFormByPublicKey.mockResolvedValue(makeForm());
    productRepo.findById.mockResolvedValue(makeProductRow({ status: 'inactive' }));
    expect((await formService.getSubmissionStatus('pub_test_123456', 'tok')).product).toBeNull();

    repo.findFormByPublicKey.mockResolvedValue(makeForm({ productId: null }));
    expect((await formService.getSubmissionStatus('pub_test_123456', 'tok')).product).toBeNull();

    repo.findFormByPublicKey.mockResolvedValue(makeForm());
    productRepo.findById.mockRejectedValue(new Error('db down'));
    const res = await formService.getSubmissionStatus('pub_test_123456', 'tok');
    expect(res.product).toBeNull();
    expect(res.status).toBe('submitted');
  });
});
