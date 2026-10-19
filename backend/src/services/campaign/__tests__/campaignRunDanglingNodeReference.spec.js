import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_THAM_CHIEU_KHOI PR-1 Việc 1.6 — LƯỚI RUNTIME: lượt chạy lọt qua preflight (lịch cũ, chạy tiếp, dữ liệu sửa sau preflight) mà
// khối gửi lấy dữ liệu từ khối không còn tồn tại thì engine phải đóng sổ 'failed' + báo chủ TRƯỚC khi chạy khối nào — trước đây run kết
// thúc 'completed' 0/0/0 trong im lặng. Đồ thị + helper tham chiếu là bản THẬT; chỉ repo/tầng gửi bị mock.

const OWNER = 10;

const mockFailRun = jest.fn().mockResolvedValue(null);
const mockGetRunForExecution = jest.fn();
const mockGetRunStatus = jest.fn();
const mockFindCampaignById = jest.fn();
const mockFindNodes = jest.fn();
const mockFindConnections = jest.fn();
const mockUpdateNodeExecutionOrder = jest.fn().mockResolvedValue(null);
const mockGetCampaignZaloAccount = jest.fn();
const mockSendGroupMessageQueued = jest.fn().mockResolvedValue({ success: true });
const mockInsertCampaignZaloMessage = jest.fn().mockResolvedValue(1);
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockCompleteRunWithError = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: mockGetRunForExecution,
    getRunStatus: mockGetRunStatus,
    patchRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: mockFinalizeRun,
    failRun: mockFailRun,
    completeRunWithError: mockCompleteRunWithError,
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: mockFindCampaignById,
    findNodesByCampaignId: mockFindNodes,
    findConnectionsByCampaignId: mockFindConnections,
    updateNodeExecutionOrder: mockUpdateNodeExecutionOrder,
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: mockGetCampaignZaloAccount,
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllGroupIdSet: jest.fn().mockResolvedValue(new Set()),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-must-not-be-used'),
    sendGroupMessageQueued: mockSendGroupMessageQueued,
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
  default: { insertCampaignZaloMessage: mockInsertCampaignZaloMessage },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  nextVnMidnight: jest.fn(() => new Date('2026-09-05T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));
const mockNotifyRunFailed = jest.fn().mockResolvedValue(undefined);
const realNotify = await import('../../../utils/campaignQuotaPauseNotify.util.js');
jest.unstable_mockModule('../../../utils/campaignQuotaPauseNotify.util.js', () => ({
  ...realNotify,
  notifyCampaignRunFailed: mockNotifyRunFailed,
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue(undefined),
}));

const db = (await import('../../../config/database.js')).default;
const { default: campaignRunService } = await import('../campaignRun.service.js');

// pg trả id BIGSERIAL dạng CHUỖI.
const row = (id, subtype, config, name = subtype) => ({
  id: String(id), node_type: subtype.includes('trigger') ? 'trigger' : 'action', node_subtype: subtype, node_name: name, execution_order: Number(id), config,
});

const runRow = () => ({
  id: 200,
  status: 'running',
  total_recipients: 0,
  successful_sends: 0,
  failed_sends: 0,
  skipped_sends: 0,
  triggered_by: OWNER,
  schedule_created_by: null,
  run_metadata: { source: 'campaign_run', triggeredBy: OWNER },
});

describe('engine chạy chiến dịch — lưới tham chiếu khối hụt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(db, 'query').mockImplementation(async () => ({ rows: [] }));
    mockGetRunStatus.mockResolvedValue('running');
    mockGetRunForExecution.mockResolvedValue(runRow());
    mockFindCampaignById.mockResolvedValue({
      id: 100, id_user: OWNER, workspace_owner_id: OWNER, created_by: OWNER, status: 'active', flow_json: { nodes: [] },
    });
    mockGetCampaignZaloAccount.mockResolvedValue({ id: 99, userId: OWNER, displayName: 'Nick công ty' });
    // Hình #424: khối gửi nhóm (4066) trỏ khối 4030 của chiến dịch GỐC; khối lấy nhóm của chính bản sao là 4065.
    mockFindConnections.mockResolvedValue([
      { source_node_id: '4064', target_node_id: '4065' },
      { source_node_id: '4065', target_node_id: '4066' },
    ]);
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  const nodesOf = (groupNodeRef, sendExtra = {}) => [
    row(4064, 'manual_trigger', {}),
    row(4065, 'get_all_groups', { zaloAccountId: 99 }, 'Lấy nhóm'),
    row(4066, 'send_zalo_group', {
      zaloAccountId: 99, zaloGroupSource: 'node', zaloGroupNodeId: groupNodeRef, zaloGroupField: 'groupId', zaloGroupMessage: 'Xin chào', ...sendExtra,
    }, 'Gửi nhóm'),
  ];

  it('hình #424 (bỏ qua preflight) → failRun + chuông campaign_run_failed, KHÔNG gọi hàm gửi / lấy tài khoản nào, không ghi thứ tự khối', async () => {
    mockFindNodes.mockResolvedValue(nodesOf('4030'));

    await campaignRunService.executeCampaign(100, 200, OWNER);

    expect(mockFailRun).toHaveBeenCalledTimes(1);
    const [runId, message] = mockFailRun.mock.calls[0];
    expect(runId).toBe(200);
    expect(message).toContain('Khối "Gửi nhóm" đang lấy dữ liệu từ một khối không còn tồn tại');
    expect(mockNotifyRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      runId: 200, campaignId: 100, source: 'dangling_node_reference',
    }));
    // KHÔNG chạy khối nào
    expect(mockGetCampaignZaloAccount).not.toHaveBeenCalled();
    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
    expect(mockInsertCampaignZaloMessage).not.toHaveBeenCalled();
    expect(mockLogExecutionNode).not.toHaveBeenCalled();
    expect(mockUpdateNodeExecutionOrder).not.toHaveBeenCalled();
    // nhánh RUN_STOPPED ở catch tổng không ghi đè trạng thái: không có completeRunWithError / finalizeRun / failRun lần hai
    expect(mockCompleteRunWithError).not.toHaveBeenCalled();
    expect(mockFinalizeRun).not.toHaveBeenCalled();
  });

  it('tham chiếu nội bộ hợp lệ (hình #420) → KHÔNG đóng sổ vì tham chiếu hụt', async () => {
    mockFindNodes.mockResolvedValue(nodesOf('4065'));

    await campaignRunService.executeCampaign(100, 200, OWNER);

    const danglingCall = mockNotifyRunFailed.mock.calls.find(([arg]) => arg?.source === 'dangling_node_reference');
    expect(danglingCall).toBeUndefined();
    expect(mockFailRun.mock.calls.some(([, message]) => String(message).includes('không còn tồn tại'))).toBe(false);
  });

  it('log đúng lý do dừng (không còn câu "dừng bởi người dùng")', async () => {
    mockFindNodes.mockResolvedValue(nodesOf('4030'));
    const logSpy = console.log;

    await campaignRunService.executeCampaign(100, 200, OWNER);

    const lines = logSpy.mock.calls.map((args) => args.join(' '));
    expect(lines.some((line) => line.includes('khối nguồn không còn tồn tại'))).toBe(true);
    expect(lines.some((line) => line.includes('đã được dừng bởi người dùng'))).toBe(false);
  });
});
