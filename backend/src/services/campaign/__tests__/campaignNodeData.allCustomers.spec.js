/**
 * PR-5: node `read_interested_customers` loại `all` = TOÀN BỘ khách workspace (không cần dòng trong customer_purchases).
 *
 * Mock repository ở RANH GIỚI với đúng hình dạng hàng thật (cột SQL: id_customer, full_name, zalo_id…), còn service
 * `customerInterested` chạy thật để bắt lỗi ánh xạ hàng → item mà khối gửi email/Zalo đang dùng.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetAllCustomersRows = jest.fn();
const mockGetInterestedRows = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: jest.fn() } }));
jest.unstable_mockModule('../../../config/database.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/campaign/campaignNodeData.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../lead/lead.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignFlow.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/campaign/campaignCustomer.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../customer/customerHelper.service.js', () => ({
  default: { resolvePurchaseOrderStatusExpr: jest.fn(async () => "'completed'") },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: {
    getAllCustomersRows: mockGetAllCustomersRows,
    getInterestedCustomersWithCoursesRows: mockGetInterestedRows,
  },
}));
jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({
  default: { isQueueFeatureEnabled: () => false },
  OUTBOUND_MESSAGE_JOB_TYPES: {},
}));
jest.unstable_mockModule('../../form.service.js', () => ({ default: {} }));

const { default: campaignNodeDataService } = await import('../campaignNodeData.service.js');

const sqlRow = (id, extra = {}) => ({
  id_customer: id,
  full_name: `Khách ${id}`,
  email: `k${id}@example.com`,
  phone: `09000000${id}`,
  zalo_id: `zid${id}`,
  zalo_phone: `09000000${id}`,
  customer_source: 'manual',
  ...extra,
});

const nodeOf = (config) => ({ id: 1, node_subtype: 'interested_customers', config });

describe('PR-5 campaignNodeData: interestedCustomerType = all', () => {
  beforeEach(() => {
    mockGetAllCustomersRows.mockReset();
    mockGetInterestedRows.mockReset();
    mockGetAllCustomersRows.mockResolvedValue({ rows: [sqlRow(1), sqlRow(2), sqlRow(3)], total: 3 });
    mockGetInterestedRows.mockResolvedValue({ rows: [], total: 0, courses: [] });
  });

  it('đọc khách qua getAllCustomersRows (không qua customer_purchases) và giữ đủ khoá item', async () => {
    const pack = await campaignNodeDataService.getCustomersFromDataNode(nodeOf({ interestedCustomerType: 'all' }), 42, []);
    expect(mockGetInterestedRows).not.toHaveBeenCalled();
    expect(mockGetAllCustomersRows).toHaveBeenCalledWith({ userId: 42, limit: 50000 });
    expect(pack.items).toHaveLength(3);
    expect(pack.items[0]).toEqual(expect.objectContaining({
      customerId: 1,
      fullName: 'Khách 1',
      email: 'k1@example.com',
      phone: '090000001',
      zaloId: 'zid1',
      zaloPhone: '090000001',
      customerSource: 'manual',
    }));
    // Các khoá đơn hàng/khoá học có mặt (null) để bảng ánh xạ cột chạy không đổi.
    expect(pack.items[0]).toHaveProperty('courseName', null);
    expect(pack.items[0]).toHaveProperty('orderStatus', null);
  });

  it('trần 50.000 cho all: interestedLimit lớn hơn bị cắt, thiếu thì lấy tới trần', async () => {
    await campaignNodeDataService.getCustomersFromDataNode(nodeOf({ interestedCustomerType: 'all', interestedLimit: 999999 }), 42, []);
    expect(mockGetAllCustomersRows).toHaveBeenLastCalledWith({ userId: 42, limit: 50000 });
    await campaignNodeDataService.getCustomersFromDataNode(nodeOf({ interestedCustomerType: 'all', interestedLimit: 20000 }), 42, []);
    expect(mockGetAllCustomersRows).toHaveBeenLastCalledWith({ userId: 42, limit: 20000 });
    await campaignNodeDataService.getCustomersFromDataNode(nodeOf({ interestedCustomerType: 'all' }), 42, []);
    expect(mockGetAllCustomersRows).toHaveBeenLastCalledWith({ userId: 42, limit: 50000 });
  });

  it('trần 5.000 cho các loại khác', async () => {
    for (const type of ['interested', 'purchased', 'both']) {
      mockGetInterestedRows.mockClear();
      await campaignNodeDataService.getCustomersFromDataNode(nodeOf({ interestedCustomerType: type, interestedLimit: 40000 }), 42, []);
      expect(mockGetInterestedRows).toHaveBeenCalledTimes(1);
      expect(mockGetInterestedRows.mock.calls[0][0].limit).toBe(5000);
    }
    expect(mockGetAllCustomersRows).not.toHaveBeenCalled();
  });

  it('khối cũ không có interestedCustomerType vẫn là interested (mặc định không đổi)', async () => {
    await campaignNodeDataService.getCustomersFromDataNode(nodeOf({}), 42, []);
    expect(mockGetAllCustomersRows).not.toHaveBeenCalled();
    expect(mockGetInterestedRows).toHaveBeenCalledTimes(1);
    expect(mockGetInterestedRows.mock.calls[0][0].interestedCondition).toContain('on-hold');
  });

  it('all bỏ qua bộ lọc khoá học và vẫn áp chọn cố định / loại trừ', async () => {
    const fixed = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all', interestedCourseIds: [9], interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: [2] }),
      42,
      []
    );
    expect(fixed.items.map((i) => i.customerId)).toEqual([2]);
    const excluded = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all', interestedSelectionMode: 'all_exclude', interestedExcludedCustomerIds: [1] }),
      42,
      []
    );
    expect(excluded.items.map((i) => i.customerId)).toEqual([2, 3]);
  });

  it('all luôn đọc database kể cả khi cấu hình cũ còn interestedDataSource=api', async () => {
    const pack = await campaignNodeDataService.getCustomersFromDataNode(
      nodeOf({ interestedCustomerType: 'all', interestedDataSource: 'api' }),
      42,
      []
    );
    expect(mockGetAllCustomersRows).toHaveBeenCalledTimes(1);
    expect(pack.items).toHaveLength(3);
  });
});
