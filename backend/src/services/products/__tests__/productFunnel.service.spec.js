import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const aggregateFormFunnelByProduct = jest.fn();
const aggregateLandingFunnelByProduct = jest.fn();
const listCampaignClicks = jest.fn();
const listFormSubmissionsForPeople = jest.fn();
const listLeadsForPeople = jest.fn();
jest.unstable_mockModule('../../../repositories/products/productFunnel.repository.js', () => ({
  default: {
    aggregateFormFunnelByProduct,
    aggregateLandingFunnelByProduct,
    listCampaignClicks,
    listFormSubmissionsForPeople,
    listLeadsForPeople,
  },
}));

/** Bài nộp thô (mặc định: tạo trong khoảng, chưa trả, không SĐT/email → mỗi dòng một người). */
let rowSeq = 0;
const sub = (productId, o = {}) => ({
  id: ++rowSeq,
  productId,
  phone: null,
  email: null,
  status: 'submitted',
  inCreated: true,
  inPaid: false,
  ...o,
});
const lead = (slug, o = {}) => ({ id: ++rowSeq, slug, phone: null, email: null, ...o });

const { default: productFunnelService } = await import('../productFunnel.service.js');
const { default: dashboardAnalyticsService } = await import('../../dashboard/dashboardAnalytics.service.js');

const owner = { id: 5, role: 'user_admin', activeContext: { type: 'self' } };

beforeEach(() => {
  aggregateFormFunnelByProduct.mockReset().mockResolvedValue([]);
  aggregateLandingFunnelByProduct.mockReset().mockResolvedValue([]);
  listCampaignClicks.mockReset().mockResolvedValue([]);
  listFormSubmissionsForPeople.mockReset().mockResolvedValue([]);
  listLeadsForPeople.mockReset().mockResolvedValue([]);
});

describe('productFunnel.service getFunnel', () => {
  it('dùng đúng mốc ngày của parseDateRange (00:00 giờ VN, nửa mở) và truyền chủ workspace', async () => {
    const parsed = dashboardAnalyticsService.parseDateRange({ startDate: '2026-09-01', endDate: '2026-09-30' });
    const out = await productFunnelService.getFunnel(owner, { startDate: '2026-09-01', endDate: '2026-09-30' });

    expect(parsed.startAt).toBe('2026-08-31T17:00:00.000Z');
    expect(parsed.endExclusive).toBe('2026-09-30T17:00:00.000Z');
    expect(aggregateFormFunnelByProduct).toHaveBeenCalledWith({
      workspaceOwnerId: 5,
      startAt: parsed.startAt,
      endExclusive: parsed.endExclusive,
    });
    expect(out.filters).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
  });

  it('period=7d / 30d / 90d lấy khoảng qua parseDateRange', async () => {
    for (const period of ['7d', '30d', '90d']) {
      const parsed = dashboardAnalyticsService.parseDateRange({ period });
      await productFunnelService.getFunnel(owner, { period });
      expect(aggregateFormFunnelByProduct).toHaveBeenLastCalledWith({
        workspaceOwnerId: 5,
        startAt: parsed.startAt,
        endExclusive: parsed.endExclusive,
      });
    }
  });

  it('period=all không chặn ngày', async () => {
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(aggregateFormFunnelByProduct).toHaveBeenCalledWith({
      workspaceOwnerId: 5,
      startAt: null,
      endExclusive: null,
    });
    expect(out.filters).toEqual({ allTime: true });
  });

  it('nhân viên: phạm vi là chủ workspace, không phải id nhân viên', async () => {
    const employee = {
      id: 99,
      role: 'user_admin',
      activeContext: { type: 'employee', ownerId: 5, membershipId: 1, permissions: { reports_view: true } },
    };
    await productFunnelService.getFunnel(employee, { period: 'all' });
    expect(aggregateFormFunnelByProduct.mock.calls[0][0].workspaceOwnerId).toBe(5);
  });
});

describe('productFunnel.service — loại sản phẩm (sale / event)', () => {
  const base = { submitted: 3, registered: 2, paid: 0, revenue: 0, awaitingConfirm: 0, awaitingAmount: 0, formIds: [7] };
  it('event: Để lại thông tin chỉ là lead landing (không cộng bài nộp); sale vẫn lead + bài nộp', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([
      { ...base, productId: 1, kind: 'event', hasPaidForm: false },
      { ...base, productId: 2, kind: 'sale', hasPaidForm: false },
    ]);
    aggregateLandingFunnelByProduct.mockResolvedValue([
      { productId: 1, productUrl: null, landings: [{ id: 1, slug: 'ev', hostnames: [] }], landingViews: 0, leads: 4 },
      { productId: 2, productUrl: null, landings: [{ id: 2, slug: 'sl', hostnames: [] }], landingViews: 0, leads: 4 },
    ]);
    listLeadsForPeople.mockResolvedValue([
      ...[1, 2, 3, 4].map(() => lead('ev')),
      ...[1, 2, 3, 4].map(() => lead('sl')),
    ]);
    listFormSubmissionsForPeople.mockResolvedValue([
      ...[1, 2, 3].map(() => sub(1, { status: 'submitted' })),
      ...[1, 2, 3].map(() => sub(2, { status: 'submitted' })),
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0].leftContact).toBe(4);
    expect(out.rows[0].leftContactRows).toBe(4);
    expect(out.rows[1].leftContact).toBe(7);
    expect(out.rows[1].leftContactRows).toBe(7);
    expect(out.rows[0].kind).toBe('event');
    expect(out.rows[1].kind).toBe('sale');
  });

  it('event không có biểu mẫu thu tiền: các cột tiền null; có biểu mẫu thu tiền hoặc đã có số tiền thì giữ số thật; sale không bao giờ null', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([
      { ...base, productId: 1, kind: 'event', hasPaidForm: false },
      { ...base, productId: 2, kind: 'event', hasPaidForm: true, paid: 2, revenue: 4000, awaitingConfirm: 1, awaitingAmount: 2000 },
      { ...base, productId: 3, kind: 'event', hasPaidForm: false, paid: 1, revenue: 500 },
      { ...base, productId: 4, kind: 'sale', hasPaidForm: false },
    ]);
    listFormSubmissionsForPeople.mockResolvedValue([
      sub(2, { status: 'confirmed', inPaid: true }),
      sub(2, { status: 'confirmed', inPaid: true }),
      sub(3, { status: 'confirmed', inPaid: true }),
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0]).toMatchObject({ paid: null, paidOrders: null, revenue: null, awaitingConfirm: null, awaitingAmount: null });
    expect(out.rows[1]).toMatchObject({ paid: 2, paidOrders: 2, revenue: 4000, awaitingConfirm: 1, awaitingAmount: 2000 });
    expect(out.rows[2]).toMatchObject({ paid: 1, revenue: 500 });
    expect(out.rows[3]).toMatchObject({ paid: 0, revenue: 0, awaitingConfirm: 0 });
  });
});

describe('productFunnel.service — Quan tâm / Để lại thông tin (PR-2/PR-3)', () => {
  it('gộp landingViews, leads, campaignClicks (khử trùng người) và hai trường tiện cho giao diện', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([
      { productId: 1, submitted: 4, registered: 2, paid: 1, revenue: 2000, formIds: [7] },
      { productId: 2, submitted: 0, registered: 0, paid: 0, revenue: 0, formIds: [] },
    ]);
    aggregateLandingFunnelByProduct.mockResolvedValue([
      { productId: 1, productUrl: 'https://shop.vn/p1/', landings: [{ id: 1, slug: 'abc', hostnames: [] }], landingViews: 3, leads: 1 },
      { productId: 2, productUrl: null, landings: [], landingViews: 0, leads: 0 },
    ]);
    listLeadsForPeople.mockResolvedValue([lead('abc')]);
    listFormSubmissionsForPeople.mockResolvedValue([1, 2, 3, 4].map(() => sub(1, { status: 'submitted' })));
    listCampaignClicks.mockResolvedValue([
      { id: 1, customerId: 10, targetUrl: 'https://www.shop.vn/p1?utm_source=email' },
      { id: 2, customerId: 10, targetUrl: 'https://founderai.biz/lp/abc' }, // cùng người, link landing -> vẫn 1
      { id: 3, customerId: 11, targetUrl: 'https://shop.vn/p1.' },
      { id: 4, customerId: 12, targetUrl: 'https://shop.vn/p2' }, // khác path
      { id: 5, customerId: null, targetUrl: 'https://shop.vn/p1' },
      { id: 6, customerId: null, targetUrl: 'https://shop.vn/p1' }, // NULL: mỗi dòng một người
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0]).toMatchObject({
      productId: 1,
      submitted: 4,
      landingViews: 3,
      leads: 1,
      campaignClicks: 4,
      interested: 7,
      leftContact: 5,
    });
    expect(out.rows[1]).toMatchObject({ campaignClicks: 0, interested: 0, leftContact: 0 });
  });
});

describe('productFunnel.service — đếm NGƯỜI (đợt 3)', () => {
  const sale = { productId: 1, kind: 'sale', hasPaidForm: true, submitted: 3, registered: 3, paid: 2, revenue: 1000000, awaitingConfirm: 1, awaitingAmount: 500000, formIds: [7] };
  const landing = { productId: 1, productUrl: null, landings: [{ id: 1, slug: 'abc', hostnames: [] }], landingViews: 0, leads: 1 };

  it('cùng SĐT viết khác dạng (0901 234 567, +84901234567) = 1 người; lead + bài nộp cùng người không đếm hai lần', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([sale]);
    aggregateLandingFunnelByProduct.mockResolvedValue([landing]);
    listLeadsForPeople.mockResolvedValue([lead('abc', { phone: '0901 234 567' })]);
    listFormSubmissionsForPeople.mockResolvedValue([
      sub(1, { phone: '+84901234567', status: 'pending_payment' }),
      sub(1, { phone: '0912345678', status: 'pending_payment' }),
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0].leftContact).toBe(2); // không phải 3 lượt
    expect(out.rows[0].leftContactRows).toBe(4); // 1 lead + 3 bài nộp (số thô từ repository)
    expect(out.rows[0].registered).toBe(2);
    expect(out.rows[0].registeredSubmissions).toBe(3);
  });

  it('không SĐT: gộp theo email (không phân biệt hoa thường); không SĐT lẫn email: mỗi dòng một người; SĐT rác rơi về email', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([sale]);
    aggregateLandingFunnelByProduct.mockResolvedValue([{ ...landing, landings: [] }]);
    listFormSubmissionsForPeople.mockResolvedValue([
      sub(1, { email: 'A@x.vn', status: 'confirmed' }),
      sub(1, { email: ' a@X.vn ', status: 'confirmed' }),
      sub(1, { status: 'confirmed' }),
      sub(1, { status: 'confirmed' }),
      sub(1, { phone: '12', email: 'a@x.vn', status: 'confirmed' }), // SĐT rác -> email -> cùng người đầu
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0].leftContact).toBe(3);
    expect(out.rows[0].registered).toBe(3);
  });

  it('Đã trả: một người trả 2 đơn = 1 người, paidOrders = 2, Doanh thu giữ nguyên tổng (không gộp người)', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([{ ...sale, paid: 2, revenue: 1000000 }]);
    aggregateLandingFunnelByProduct.mockResolvedValue([{ ...landing, landings: [] }]);
    listFormSubmissionsForPeople.mockResolvedValue([
      sub(1, { phone: '0901234567', status: 'confirmed', inPaid: true }),
      sub(1, { phone: '+84901234567', status: 'confirmed', inPaid: true }),
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0]).toMatchObject({ paid: 1, paidOrders: 2, revenue: 1000000, awaitingConfirm: 1, awaitingAmount: 500000 });
  });

  it('bài đã huỷ không vào Để lại thông tin / Đăng ký; bài chỉ trả trong khoảng (inCreated=false) chỉ vào Đã trả', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([sale]);
    aggregateLandingFunnelByProduct.mockResolvedValue([{ ...landing, landings: [] }]);
    listFormSubmissionsForPeople.mockResolvedValue([
      sub(1, { phone: '0901234567', status: 'cancelled' }),
      sub(1, { phone: '0912345678', status: 'confirmed', inCreated: false, inPaid: true }),
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0]).toMatchObject({ leftContact: 0, registered: 0, paid: 1 });
  });

  it('lead của slug khác sản phẩm không lọt vào; hai sản phẩm không lẫn người', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([sale, { ...sale, productId: 2 }]);
    aggregateLandingFunnelByProduct.mockResolvedValue([
      landing,
      { productId: 2, productUrl: null, landings: [{ id: 2, slug: 'xyz', hostnames: [] }], landingViews: 0, leads: 0 },
    ]);
    listLeadsForPeople.mockResolvedValue([lead('abc', { phone: '0901234567' }), lead('abc', { phone: '0901234567' })]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0].leftContact).toBe(1);
    expect(out.rows[1].leftContact).toBe(0);
    expect(listLeadsForPeople).toHaveBeenCalledWith(expect.objectContaining({ slugs: ['abc', 'xyz'] }));
  });
});

describe('funnelPersonKey', () => {
  it('chuẩn hoá SĐT, rơi về email rồi dòng', async () => {
    const { personKey } = await import('../../../utils/funnelPersonKey.util.js');
    expect(personKey({ phone: '0901 234 567', source: 'sub', id: 1 })).toBe(personKey({ phone: '+84901234567', source: 'lead', id: 2 }));
    expect(personKey({ phone: '+1 415 555 2671', source: 'sub', id: 1 })).toBe('p:+14155552671');
    expect(personKey({ phone: 'abc', email: 'B@Y.vn', source: 'sub', id: 1 })).toBe('e:b@y.vn');
    expect(personKey({ phone: null, email: ' ', source: 'sub', id: 9 })).toBe('row:sub:9');
  });
});
