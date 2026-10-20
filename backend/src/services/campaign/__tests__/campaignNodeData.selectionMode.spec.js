/**
 * Khối `read_interested_customers`: chế độ chọn khách. Chế độ KHAI TƯỜNG MINH là `fixed` mà danh sách khách chọn RỖNG thì KHÔNG lấy khách nào —
 * trước đây rơi xuống "tất cả khách", nên khối bị gỡ danh sách (chiến dịch mua từ Marketplace) gửi cho TOÀN BỘ khách nếu người dùng bấm chạy mà chưa
 * chọn lại. Chạy thật, ước tính và xem trước đều đi qua `getCustomersFromDataNode` nên một kết quả cho cả ba.
 *
 * Mock repository ở RANH GIỚI đúng hình dạng hàng SQL thật (cùng khuôn campaignNodeData.allCustomers.spec.js); service chạy thật.
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

const nodeOf = (config) => ({ id: 1, node_subtype: 'read_interested_customers', config });
const idsOf = (pack) => pack.items.map((item) => item.customerId).sort();

describe('read_interested_customers — chế độ chọn khách', () => {
  beforeEach(() => {
    mockGetAllCustomersRows.mockReset();
    mockGetInterestedRows.mockReset();
    mockGetAllCustomersRows.mockResolvedValue({ rows: [sqlRow(1), sqlRow(2), sqlRow(3)], total: 3 });
    mockGetInterestedRows.mockResolvedValue({ rows: [sqlRow(1), sqlRow(2), sqlRow(3)], total: 3, courses: [] });
  });

  const run = (config) => campaignNodeDataService.getCustomersFromDataNode(nodeOf(config), 42, []);

  it("'fixed' + danh sách RỖNG → 0 khách (ở cả loại 'all' lẫn loại theo khoá học)", async () => {
    expect((await run({ interestedCustomerType: 'all', interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: [] })).items).toEqual([]);
    expect((await run({ interestedCustomerType: 'interested', interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: [] })).items).toEqual([]);
  });

  it("'fixed' + thiếu hẳn khoá danh sách / danh sách chỉ có rác → cũng 0 khách", async () => {
    expect((await run({ interestedCustomerType: 'all', interestedSelectionMode: 'fixed' })).items).toEqual([]);
    expect((await run({ interestedCustomerType: 'all', interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: ['abc', null] })).items).toEqual([]);
  });

  it("'fixed' + có id → đúng tập đã chọn (id dạng chuỗi vẫn khớp; id lạ không tạo khách mới)", async () => {
    const pack = await run({ interestedCustomerType: 'all', interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: ['2', 99] });
    expect(idsOf(pack)).toEqual([2]);
  });

  it("'all_exclude' + id loại → bỏ đúng các khách đó; danh sách loại rỗng → tất cả (không đổi)", async () => {
    expect(idsOf(await run({ interestedCustomerType: 'all', interestedSelectionMode: 'all_exclude', interestedExcludedCustomerIds: [1] }))).toEqual([2, 3]);
    expect(idsOf(await run({ interestedCustomerType: 'all', interestedSelectionMode: 'all_exclude', interestedExcludedCustomerIds: [] }))).toEqual([1, 2, 3]);
  });

  it("chế độ KHÔNG khai: có id → coi như fixed (cũ); không id → tất cả (cũ); 'all' tường minh không id → tất cả", async () => {
    expect(idsOf(await run({ interestedCustomerType: 'all', interestedSelectedCustomerIds: [3] }))).toEqual([3]);
    expect(idsOf(await run({ interestedCustomerType: 'all' }))).toEqual([1, 2, 3]);
    expect(idsOf(await run({ interestedCustomerType: 'all', interestedSelectionMode: 'all', interestedSelectedCustomerIds: [] }))).toEqual([1, 2, 3]);
    expect(idsOf(await run({ interestedCustomerType: 'all', interestedSelectionMode: '', interestedSelectedCustomerIds: [] }))).toEqual([1, 2, 3]);
  });
});
