import { describe, it, expect, vi } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';
import { buildSchemaFromRows } from '../campaignBuilderRuntime';

/**
 * Chạy thử khối trên trình dựng phải ra CÙNG tập người với lúc chạy thật của máy chủ (backend/src/utils/selectionMode.util.js):
 * chế độ KHAI TƯỜNG MINH là `fixed` mà danh sách chọn rỗng thì KHÔNG chọn ai; chế độ không khai giữ quy tắc cũ (có id → fixed, không id → tất cả).
 */
const CUSTOMERS = [
  { customerId: '1', email: 'k1@example.com' },
  { customerId: '2', email: 'k2@example.com' },
  { customerId: '3', email: 'k3@example.com' },
];
const FRIENDS = [
  { uid: 'u1', displayName: 'Bạn 1' },
  { uid: 'u2', displayName: 'Bạn 2' },
  { uid: 'u3', displayName: 'Bạn 3' },
];

const buildRunner = () =>
  createCampaignNodeRunner({
    campaignId: 1,
    apiService: {
      getInterestedCustomersByQuery: vi.fn().mockResolvedValue({
        data: { data: { items: CUSTOMERS, pagination: { total: CUSTOMERS.length, limit: 1000 } } },
      }),
      getPreviewZaloFriends: vi.fn().mockResolvedValue({ data: { data: { items: FRIENDS } } }),
    },
    buildSchemaFromRows,
    applyMappingsForRow: vi.fn(),
    normalizeKey: (k) => k,
    parseEmailList: vi.fn(),
    renderTemplateString: vi.fn(),
    resolveColumnKey: vi.fn(),
    readPreviewSessionData: vi.fn(),
    writePreviewSessionData: vi.fn(),
    toastNotifier: { success: vi.fn(), error: vi.fn() },
    isRunCancelledError: () => false,
  });

const customersNode = (config) => ({ id: 'n1', data: { nodeType: 'read_interested_customers', config: { interestedCustomerType: 'all', ...config } } });
const friendsNode = (config) => ({ id: 'n2', data: { nodeType: 'get_all_friends', config } });
const runCustomers = async (config) => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const result = await buildRunner().buildRunResultForNode(customersNode(config), {}, {});
  return result.output;
};
const runFriends = async (config) => {
  const ctx = { selectedZaloAccount: { id: '99', displayName: 'Nick', status: 'connected', isActive: true } };
  const result = await buildRunner().buildRunResultForNode(friendsNode(config), ctx, {});
  return result.output;
};

describe('chạy thử khối trên trình dựng — khách hàng (read_interested_customers)', () => {
  it("'fixed' + danh sách RỖNG → 0 khách, đánh dấu đã lọc", async () => {
    const output = await runCustomers({ interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: [] });
    expect(output.items).toEqual([]);
    expect(output.meta.filtered).toBe(true);
  });

  it("'fixed' + có id → đúng tập đã chọn", async () => {
    const output = await runCustomers({ interestedSelectionMode: 'fixed', interestedSelectedCustomerIds: ['2', 99] });
    expect(output.items.map((item) => item.customerId)).toEqual(['2']);
  });

  it("'all_exclude' bỏ đúng id loại; loại rỗng → tất cả", async () => {
    expect((await runCustomers({ interestedSelectionMode: 'all_exclude', interestedExcludedCustomerIds: [1] })).items.map((i) => i.customerId)).toEqual(['2', '3']);
    const all = await runCustomers({ interestedSelectionMode: 'all_exclude', interestedExcludedCustomerIds: [] });
    expect(all.items).toHaveLength(3);
    expect(all.meta.filtered).toBe(false);
  });

  it('chế độ không khai: có id → fixed (cũ); không id → tất cả (cũ)', async () => {
    expect((await runCustomers({ interestedSelectedCustomerIds: [3] })).items.map((i) => i.customerId)).toEqual(['3']);
    const all = await runCustomers({});
    expect(all.items).toHaveLength(3);
    expect(all.meta.filtered).toBe(false);
  });
});

describe('chạy thử khối trên trình dựng — bạn bè Zalo (get_all_friends)', () => {
  it("'fixed' + danh sách RỖNG → 0 bạn, đánh dấu đã lọc", async () => {
    const output = await runFriends({ zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: [] });
    expect(output.items).toEqual([]);
    expect(output.meta).toMatchObject({ totalItems: 0, filtered: true });
  });

  it("'fixed' + có id → đúng tập đã chọn", async () => {
    const output = await runFriends({ zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: ['u2', 'u-la'] });
    expect(output.items.map((item) => item.uid)).toEqual(['u2']);
  });

  it("'all_exclude' bỏ đúng id loại; loại rỗng → tất cả", async () => {
    expect((await runFriends({ zaloFriendSelectionMode: 'all_exclude', zaloExcludedFriendIds: ['u1'] })).items.map((i) => i.uid)).toEqual(['u2', 'u3']);
    const all = await runFriends({ zaloFriendSelectionMode: 'all_exclude', zaloExcludedFriendIds: [] });
    expect(all.items).toHaveLength(3);
    expect(all.meta.filtered).toBe(false);
  });

  it('chế độ không khai: có id → fixed (cũ); không id → tất cả (cũ)', async () => {
    expect((await runFriends({ zaloSelectedFriendIds: ['u3'] })).items.map((i) => i.uid)).toEqual(['u3']);
    const all = await runFriends({});
    expect(all.items).toHaveLength(3);
    expect(all.meta.filtered).toBe(false);
  });
});
