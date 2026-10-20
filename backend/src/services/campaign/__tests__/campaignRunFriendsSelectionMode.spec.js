import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Khối `get_all_friends` (bạn bè Zalo): chế độ KHAI TƯỜNG MINH là `fixed` mà danh sách chọn RỖNG thì KHÔNG lấy bạn nào — trước đây rơi xuống
// "tất cả bạn bè", nên chiến dịch mua từ Marketplace (đã gỡ danh sách bạn bè của người bán) gửi cho MỌI bạn bè của người mua nếu họ bấm chạy
// mà chưa chọn lại. Engine là bản THẬT; chỉ repo / tầng gửi Zalo bị mock (cùng khuôn campaignRunDanglingNodeReference.spec.js).

const OWNER = 10;

const mockGetRunForExecution = jest.fn();
const mockGetRunStatus = jest.fn();
const mockFindCampaignById = jest.fn();
const mockFindNodes = jest.fn();
const mockFindConnections = jest.fn();
const mockGetCampaignZaloAccount = jest.fn();
const mockGetAllFriendsWithRetry = jest.fn();
const mockNormalizeFriends = jest.fn();
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: mockGetRunForExecution,
    getRunStatus: mockGetRunStatus,
    patchRunMetadata: jest.fn().mockResolvedValue(null),
    mergeRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: jest.fn().mockResolvedValue(null),
    failRun: jest.fn().mockResolvedValue(null),
    completeRunWithError: jest.fn().mockResolvedValue(null),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: mockFindCampaignById,
    findNodesByCampaignId: mockFindNodes,
    findConnectionsByCampaignId: mockFindConnections,
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: mockGetCampaignZaloAccount,
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllFriendsWithRetry: mockGetAllFriendsWithRetry,
    normalizeFriendsWithProfileLookup: mockNormalizeFriends,
    getAllGroupIdSet: jest.fn().mockResolvedValue(new Set()),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: { logExecutionNode: mockLogExecutionNode },
}));
jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: jest.fn().mockResolvedValue(null),
    countPendingDue: jest.fn().mockResolvedValue({
      pending_count: 0, pending_without_future_due: 0, pending_with_retry_meta: 0, next_due_at: null,
    }),
  },
}));
jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: { insertCampaignZaloMessage: jest.fn().mockResolvedValue(1) },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  nextVnMidnight: jest.fn(() => new Date('2026-09-05T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));
const realNotify = await import('../../../utils/campaignQuotaPauseNotify.util.js');
jest.unstable_mockModule('../../../utils/campaignQuotaPauseNotify.util.js', () => ({
  ...realNotify,
  notifyCampaignRunFailed: jest.fn().mockResolvedValue(undefined),
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue(undefined),
}));

const db = (await import('../../../config/database.js')).default;
const { default: campaignRunService } = await import('../campaignRun.service.js');

const row = (id, subtype, config, name = subtype) => ({
  id: String(id), node_type: subtype.includes('trigger') ? 'trigger' : 'action', node_subtype: subtype, node_name: name, execution_order: Number(id), config,
});

const FRIENDS = [
  { uid: 'u1', displayName: 'Bạn 1' },
  { uid: 'u2', displayName: 'Bạn 2' },
  { uid: 'u3', displayName: 'Bạn 3' },
];

describe('engine — get_all_friends: chế độ chọn bạn bè', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(db, 'query').mockImplementation(async () => ({ rows: [] }));
    mockGetRunStatus.mockResolvedValue('running');
    mockGetRunForExecution.mockResolvedValue({
      id: 200, status: 'running', total_recipients: 0, successful_sends: 0, failed_sends: 0, skipped_sends: 0,
      triggered_by: OWNER, schedule_created_by: null, run_metadata: { source: 'campaign_run', triggeredBy: OWNER },
    });
    mockFindCampaignById.mockResolvedValue({
      id: 100, id_user: OWNER, workspace_owner_id: OWNER, created_by: OWNER, status: 'active', flow_json: { nodes: [] },
    });
    mockGetCampaignZaloAccount.mockResolvedValue({ id: 99, userId: OWNER, displayName: 'Nick của người mua' });
    mockGetAllFriendsWithRetry.mockResolvedValue(FRIENDS);
    mockNormalizeFriends.mockResolvedValue(FRIENDS);
    mockFindConnections.mockResolvedValue([{ source_node_id: '4064', target_node_id: '4065' }]);
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  /** Chạy chiến dịch [trigger → get_all_friends] và trả log của khối bạn bè. */
  async function runFriendsNode(config) {
    mockFindNodes.mockResolvedValue([
      row(4064, 'manual_trigger', {}),
      row(4065, 'get_all_friends', { zaloAccountId: 99, ...config }, 'Lấy bạn bè'),
    ]);
    await campaignRunService.executeCampaign(100, 200, OWNER);
    const call = mockLogExecutionNode.mock.calls.map(([arg]) => arg).find((arg) => arg?.node?.node_subtype === 'get_all_friends');
    expect(call).toBeDefined();
    return { status: call.status, items: call.executionData.items, meta: call.executionData.meta };
  }

  const uids = (items) => items.map((item) => item.uid);

  it("'fixed' + danh sách RỖNG → 0 bạn (không rơi xuống tất cả bạn bè); log ghi đã lọc", async () => {
    const result = await runFriendsNode({ zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: [] });
    expect(result.status).toBe('success');
    expect(result.items).toEqual([]);
    expect(result.meta).toMatchObject({ totalItems: 0, filtered: true, selectionMode: 'fixed' });
  });

  it("'fixed' + thiếu hẳn khoá danh sách → cũng 0 bạn", async () => {
    const result = await runFriendsNode({ zaloFriendSelectionMode: 'fixed' });
    expect(result.items).toEqual([]);
    expect(result.meta.totalItems).toBe(0);
  });

  it("'fixed' + có id → đúng tập đã chọn (id lạ không tạo bạn mới)", async () => {
    const result = await runFriendsNode({ zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: ['u2', 'u-khong-co'] });
    expect(uids(result.items)).toEqual(['u2']);
    expect(result.meta).toMatchObject({ totalItems: 1, filtered: true });
  });

  it("'all_exclude' + id loại → bỏ đúng các bạn đó; danh sách loại rỗng → tất cả (không đổi)", async () => {
    const some = await runFriendsNode({ zaloFriendSelectionMode: 'all_exclude', zaloExcludedFriendIds: ['u1'] });
    expect(uids(some.items)).toEqual(['u2', 'u3']);
    expect(some.meta.filtered).toBe(true);

    mockLogExecutionNode.mockClear();
    const none = await runFriendsNode({ zaloFriendSelectionMode: 'all_exclude', zaloExcludedFriendIds: [] });
    expect(uids(none.items)).toEqual(['u1', 'u2', 'u3']);
    expect(none.meta.filtered).toBe(false);
  });

  it("chế độ KHÔNG khai: có id → coi như fixed (cũ); không id → tất cả (cũ); 'all' tường minh không id → tất cả", async () => {
    const legacyWithIds = await runFriendsNode({ zaloSelectedFriendIds: ['u3'] });
    expect(uids(legacyWithIds.items)).toEqual(['u3']);

    mockLogExecutionNode.mockClear();
    const legacyNoIds = await runFriendsNode({});
    expect(uids(legacyNoIds.items)).toEqual(['u1', 'u2', 'u3']);
    expect(legacyNoIds.meta).toMatchObject({ filtered: false, selectionMode: 'all' });

    mockLogExecutionNode.mockClear();
    const explicitAll = await runFriendsNode({ zaloFriendSelectionMode: 'all', zaloSelectedFriendIds: [] });
    expect(uids(explicitAll.items)).toEqual(['u1', 'u2', 'u3']);
  });
});
