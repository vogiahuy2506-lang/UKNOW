/**
 * PR-T3: ước tính chiến dịch phải đếm ĐÚNG số khách theo bộ lọc tag của khối `interested_customers`.
 *
 * Ước tính gọi `getCustomersFromDataNode` (cùng hàm bộ chạy thật dùng) nên spec này cho `campaignNodeData.service` THẬT chạy,
 * chỉ mock repository ở ranh giới: `getAllCustomersRows` trả số hàng tuỳ theo `tagIds` nhận được (như SQL lọc tag). Nếu ước tính
 * hay runtime làm rơi `tagIds`, số người nhận ra sai ngay.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetAllCustomersRows = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { get: jest.fn() } }));
jest.unstable_mockModule('../../../config/database.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/campaign/campaignNodeData.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../lead/lead.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/campaign/campaignCustomer.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../customer/customerHelper.service.js', () => ({
  default: { resolvePurchaseOrderStatusExpr: jest.fn(async () => "'completed'") },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: { getAllCustomersRows: mockGetAllCustomersRows, getInterestedCustomersWithCoursesRows: jest.fn() },
}));
jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({
  default: { isQueueFeatureEnabled: () => false },
  OUTBOUND_MESSAGE_JOB_TYPES: {},
}));
jest.unstable_mockModule('../../form.service.js', () => ({ default: {} }));

const { default: campaignNodeDataService } = await import('../campaignNodeData.service.js');
const { default: campaignFlowService } = await import('../campaignFlow.service.js');
const { default: ZaloRateLimiter } = await import('../zaloRateLimiter.js');
const { estimateForScript } = await import('../campaignEstimate.service.js');

const NOW = new Date('2026-10-05T06:00:00+07:00');

// Khách ở SQL: tag 4 có 2 khách, tag 9 có 3 khách (1 khách trùng), cả workspace có 6 khách.
const rowsFor = (tagIds) => {
  const byTag = { 4: [1, 2], 9: [2, 3, 4] };
  const ids = tagIds.length === 0 ? [1, 2, 3, 4, 5, 6] : [...new Set(tagIds.flatMap((id) => byTag[id] || []))];
  return ids.map((id) => ({ id_customer: id, full_name: `K${id}`, email: `k${id}@x.vn`, phone: `09000000${id}`, zalo_id: null, zalo_phone: null, customer_source: 'manual' }));
};

const makeDeps = () => ({
  crud: {},
  flow: campaignFlowService,
  nodeData: campaignNodeDataService,
  zaloLimiter: new ZaloRateLimiter({
    ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT: 100,
    ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT: 80_000,
    ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT: 150_000,
    ZALO_OUTBOUND_QUIET_HOURS_START_SAFE: 23,
    ZALO_OUTBOUND_QUIET_HOURS_END_SAFE: 6,
  }),
  emailDelay: { minMs: 50, maxMs: 250 },
  zaloSender: { mapCampaignZaloAccount: (a) => a, parseListText: () => [] },
  zaloRepo: { findCampaignZaloAccount: jest.fn(async () => null) },
  emailRepo: {
    findEmailSettingsById: jest.fn(async () => ({ id: 7, email: 'chu@shop.vn', user_daily_send_limit: null })),
    findDefaultEmailSettings: jest.fn(async () => ({ id: 7, email: 'chu@shop.vn', user_daily_send_limit: null })),
  },
  countZaloSentToday: jest.fn(async () => 0),
  countEmailSentToday: jest.fn(async () => 0),
  checkSendQuota: jest.fn(async () => ({ allowed: true })),
  getAdapterDescriptor: jest.fn(() => null),
  applyAccountDelayOverride: jest.fn((key, policy) => policy),
  estimateRepo: { findOtherCampaignsInUse: jest.fn(async () => ({ campaigns: [], schedules: [], nodes: [] })) },
  env: {},
  now: () => NOW,
});

const scriptWith = (sourceConfig) => ({
  nodes: [
    { id: 'trg', nodeType: 'trigger', nodeSubtype: 'start', config: {} },
    { id: 'src', nodeType: 'data', nodeSubtype: 'interested_customers', config: { interestedCustomerType: 'all', ...sourceConfig } },
    { id: 'mail', nodeType: 'action', nodeSubtype: 'send_email', config: { recipientSource: 'node', recipientNodeId: 'src', recipientField: 'email', fromEmailId: 7 } },
  ],
  connections: [{ sourceNodeId: 'trg', targetNodeId: 'src' }, { sourceNodeId: 'src', targetNodeId: 'mail' }],
});

describe('estimateForScript — khối khách đã lưu có lọc tag', () => {
  beforeEach(() => {
    mockGetAllCustomersRows.mockReset();
    mockGetAllCustomersRows.mockImplementation(async ({ tagIds }) => {
      const rows = rowsFor(tagIds || []);
      return { rows, total: rows.length };
    });
  });

  it('không chọn tag -> đếm mọi khách (6)', async () => {
    const result = await estimateForScript({ script: scriptWith({}), ownerUserId: 39, startAt: NOW, deps: makeDeps() });
    expect(result.perNode[0]).toMatchObject({ nodeId: 'mail', recipients: 6 });
  });

  it('chọn tag 4 -> chỉ 2 người; ước tính truyền tagIds xuống truy vấn', async () => {
    const result = await estimateForScript({ script: scriptWith({ interestedTagIds: [4] }), ownerUserId: 39, startAt: NOW, deps: makeDeps() });
    expect(mockGetAllCustomersRows).toHaveBeenCalledWith(expect.objectContaining({ userId: 39, tagIds: [4] }));
    expect(result.perNode[0]).toMatchObject({ nodeId: 'mail', recipients: 2 });
  });

  it('chọn tag 4 và 9 -> khách có BẤT KỲ tag (hợp, không phải giao): 4 người', async () => {
    const result = await estimateForScript({ script: scriptWith({ interestedTagIds: [4, 9] }), ownerUserId: 39, startAt: NOW, deps: makeDeps() });
    expect(result.perNode[0]).toMatchObject({ nodeId: 'mail', recipients: 4 });
  });

  it('chạy thật (getCustomersFromDataNode) cho cùng số khách với ước tính', async () => {
    const config = { interestedCustomerType: 'all', interestedTagIds: [4, 9] };
    const pack = await campaignNodeDataService.getCustomersFromDataNode({ id: 'src', node_subtype: 'interested_customers', config }, 39, []);
    expect(pack.items.map((item) => item.customerId)).toEqual([1, 2, 3, 4]);
  });
});
