import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — ENGINE chạy chiến dịch (chạy tay, lịch, chạy liên tục, phục hồi sau deploy
// đều vào `executeCampaign`): nhân viên (người TẠO chiến dịch / người BẤM CHẠY / người TẠO LỊCH) phải được giao MỌI tài khoản
// Zalo của chiến dịch TẠI THỜI ĐIỂM CHẠY, không thì run đóng sổ 'failed' kèm lý do rõ và KHÔNG gửi tin. Chủ tạo + chủ chạy →
// không lọc. Chuỗi thật: engine → campaignZaloAccess → bảng giao (mock repo); chỉ tầng gửi bị mock.

const OWNER = 10;
const EMP = 20;
const EMP_B = 30;

const mockFailRun = jest.fn().mockResolvedValue(null);
const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockGetRunForExecution = jest.fn();
const mockGetRunStatus = jest.fn();
const mockFindCampaignById = jest.fn();
const mockFindAssigned = jest.fn();
const mockGetCampaignZaloAccount = jest.fn();
const mockSendGroupMessageQueued = jest.fn().mockResolvedValue({ success: true });
const mockInsertCampaignZaloMessage = jest.fn().mockResolvedValue(1);

const realMemberRepo = await import('../../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: mockGetRunForExecution,
    getRunStatus: mockGetRunStatus,
    patchRunMetadata: mockPatchRunMetadata,
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: jest.fn().mockResolvedValue(null),
    failRun: mockFailRun,
    completeRunWithError: jest.fn().mockResolvedValue(null),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: mockFindCampaignById,
    findNodesByCampaignId: jest.fn().mockResolvedValue([
      {
        id: 300,
        node_type: 'action',
        node_subtype: 'send_zalo_group',
        execution_order: 1,
        config: {
          zaloAccountId: 99,
          zaloGroupSource: 'manual',
          zaloGroupIds: 'group_assignment_test',
          zaloGroupMessage: 'Noi dung khong quan trong o day',
          zaloGroupAttachments: [],
        },
      },
    ]),
    findConnectionsByCampaignId: jest.fn().mockResolvedValue([]),
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {
    flowJsonHasZaloPersonalMultiAccount: jest.fn().mockReturnValue(false),
    buildExecutionOrderMap: jest.fn((nodes) => new Map(nodes.map((node, index) => [String(node.id), index + 1]))),
    buildFlowNodeIdMap: jest.fn().mockReturnValue(new Map()),
    normalizeNodeReferenceConfig: jest.fn((config) => config),
    buildSchemaFromRows: jest.fn().mockReturnValue([]),
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: mockGetCampaignZaloAccount,
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllGroupIdSet: jest.fn().mockResolvedValue(new Set(['group_assignment_test'])),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-must-not-be-used'),
    sendGroupMessageQueued: mockSendGroupMessageQueued,
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: { logExecutionNode: jest.fn().mockResolvedValue(null) },
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
// Báo chủ qua email là fire-and-forget; spec không cần gửi thật.
const mockNotifyRunFailed = jest.fn().mockResolvedValue(undefined);
const realNotify = await import('../../../utils/campaignQuotaPauseNotify.util.js');
jest.unstable_mockModule('../../../utils/campaignQuotaPauseNotify.util.js', () => ({
  ...realNotify,
  notifyCampaignRunFailed: mockNotifyRunFailed,
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue(undefined),
}));

const db = (await import('../../../config/database.js')).default;
const { default: campaignRunService } = await import('../campaignRun.service.js');

const runRow = (over = {}) => ({
  id: 200,
  status: 'running',
  total_recipients: 0,
  successful_sends: 0,
  failed_sends: 0,
  skipped_sends: 0,
  triggered_by: OWNER,
  schedule_created_by: null,
  run_metadata: { source: 'campaign_run', triggeredBy: OWNER },
  ...over,
});
const campaignRow = (over = {}) => ({ id: 100, id_user: OWNER, workspace_owner_id: OWNER, created_by: OWNER, status: 'active', flow_json: {}, ...over });

describe('engine chạy chiến dịch — tài khoản Zalo được giao (G3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(db, 'query').mockImplementation(async (sql) => {
      const text = String(sql);
      if (/SELECT role FROM users/.test(text)) return { rows: [{ role: 'user' }] };
      if (/FROM zalo_settings WHERE id = ANY/.test(text)) return { rows: [{ id: 99, display_name: 'Nick công ty', zalo_name: null }] };
      if (/FROM users WHERE id = ANY/.test(text)) {
        return { rows: [{ id: EMP, full_name: 'Lan', username: 'lan' }, { id: EMP_B, full_name: 'Bình', username: 'binh' }] };
      }
      return { rows: [] };
    });
    mockFindAssigned.mockResolvedValue([99]);
    mockGetRunStatus.mockResolvedValue('running');
    mockGetRunForExecution.mockResolvedValue(runRow());
    mockFindCampaignById.mockResolvedValue(campaignRow());
    mockGetCampaignZaloAccount.mockResolvedValue({ id: 99, userId: OWNER, displayName: 'Nick công ty' });
    // 23:30 giờ VN — trong giờ yên lặng: run tự dừng ở cổng chính sách thay vì đi vào pipeline gửi thật.
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    jest.setSystemTime(new Date('2026-09-04T16:30:00.000Z'));
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 23;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 6;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_YIELD_SLOT_MIN_WAIT_MS = 60_000;
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  const expectBlocked = (employeeName = 'Lan') => {
    expect(mockFailRun).toHaveBeenCalledTimes(1);
    const [runId, message] = mockFailRun.mock.calls[0];
    expect(runId).toBe(200);
    expect(message).toContain(`Tài khoản Zalo "Nick công ty" chưa được giao cho nhân viên "${employeeName}"`);
    // Chủ chiến dịch được báo (cùng khuôn mọi nhánh dừng-vì-lỗi khác).
    expect(mockNotifyRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      runId: 200, campaignId: 100, source: 'zalo_account_not_assigned',
    }));
    // KHÔNG gửi tin, không ghi tin, không lấy tài khoản.
    expect(mockGetCampaignZaloAccount).not.toHaveBeenCalled();
    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
    expect(mockInsertCampaignZaloMessage).not.toHaveBeenCalled();
  };

  // Quy tắc: CHỈ kiểm theo NGƯỜI KÍCH HOẠT lượt chạy (bấm chạy / tạo-bật lịch / chạy tiếp / duyệt), không theo người tạo chiến dịch.

  it('CHỦ tạo + CHỦ chạy: không lọc — không đọc bảng giao, tài khoản lấy với accessibleAccountIds = null', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER);

    expect(mockFindAssigned).not.toHaveBeenCalled();
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 99, accessibleAccountIds: null }));
  });

  it('CHỦ bấm chạy chiến dịch do NHÂN VIÊN tạo (nhân viên đã bị gỡ tài khoản) → QUA: không lọc, không đọc bảng giao', async () => {
    mockFindCampaignById.mockResolvedValue(campaignRow({ created_by: EMP }));
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: OWNER, run_metadata: { source: 'campaign_run', triggeredBy: OWNER } }));
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER);

    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockFindAssigned).not.toHaveBeenCalled();
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 99, accessibleAccountIds: null }));
  });

  it('NHÂN VIÊN bấm chạy, tài khoản ĐƯỢC giao → chạy, mọi lần lấy tài khoản mang danh sách được giao của người bấm', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP, run_metadata: { source: 'campaign_run', triggeredBy: EMP } }));
    await campaignRunService.executeCampaign(100, 200, OWNER);

    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, EMP);
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 99, accessibleAccountIds: [99] }));
  });

  it('NHÂN VIÊN bấm chạy chiến dịch của CHỦ (run_metadata.triggeredBy) và chưa được giao → run failed kèm lý do rõ, KHÔNG gửi tin', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP, run_metadata: { source: 'campaign_run', triggeredBy: EMP } }));
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER);
    expectBlocked();
  });

  it('chỉ có cột triggered_by (metadata thiếu) → vẫn kiểm theo người bấm', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP, run_metadata: { source: 'campaign_run' } }));
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER);
    expectBlocked();
  });

  it('nhân viên B chạy chiến dịch do nhân viên A tạo: kiểm theo B (không theo A, không giao nhau) — B chưa được giao → chặn dù A được giao', async () => {
    mockFindCampaignById.mockResolvedValue(campaignRow({ created_by: EMP }));
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP_B, run_metadata: { source: 'campaign_run', triggeredBy: EMP_B } }));
    mockFindAssigned.mockImplementation(async (_owner, employeeId) => (employeeId === EMP ? [99] : []));
    await campaignRunService.executeCampaign(100, 200, OWNER);

    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, EMP_B);
    expect(mockFindAssigned).not.toHaveBeenCalledWith(OWNER, EMP);
    expectBlocked('Bình');
  });

  it('nhân viên B chạy chiến dịch do nhân viên A tạo: B được giao còn A không → QUA (không lấy giao nhau với người tạo)', async () => {
    mockFindCampaignById.mockResolvedValue(campaignRow({ created_by: EMP }));
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP_B, run_metadata: { source: 'campaign_run', triggeredBy: EMP_B } }));
    mockFindAssigned.mockImplementation(async (_owner, employeeId) => (employeeId === EMP_B ? [99] : []));
    await campaignRunService.executeCampaign(100, 200, OWNER);

    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 99, accessibleAccountIds: [99] }));
  });

  it('LỊCH do nhân viên tạo (schedule_created_by, run lịch không có người bấm) và chưa được giao → chặn', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({
      triggered_by: null,
      schedule_created_by: EMP,
      run_metadata: { source: 'schedule' },
    }));
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER, null, { isResume: true, resumedBy: 'scheduler_continuous' });
    expectBlocked();
  });

  it('LỊCH do CHỦ tạo trên chiến dịch do nhân viên tạo → QUA (người kích hoạt là chủ)', async () => {
    mockFindCampaignById.mockResolvedValue(campaignRow({ created_by: EMP }));
    mockGetRunForExecution.mockResolvedValue(runRow({
      triggered_by: null,
      schedule_created_by: OWNER,
      run_metadata: { source: 'schedule', triggeredBy: OWNER },
    }));
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER, null, { isResume: true, resumedBy: 'per_minute' });
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('chạy tiếp / phục hồi sau deploy: người kích hoạt gốc là nhân viên (đọc lại từ run_metadata) và chưa được giao → chặn', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP, run_metadata: { source: 'campaign_run', continuousMode: true, triggeredBy: EMP } }));
    mockFindAssigned.mockResolvedValue([]);
    // Lưới an toàn: nếu cổng bị gỡ, vòng lặp continuous (while(true)) sẽ dừng ở lần kiểm trạng thái đầu tiên và ca ĐỎ, thay vì treo cả bộ test.
    mockGetRunStatus.mockResolvedValue('stopped');
    await campaignRunService.executeCampaign(100, 200, OWNER, null, { isResume: true, resumedBy: 'scheduler_continuous' });
    expectBlocked();
  });

  it('CHỈ khi không xác định được người kích hoạt (run cũ thiếu dữ liệu) mới rơi về người TẠO chiến dịch', async () => {
    mockFindCampaignById.mockResolvedValue(campaignRow({ created_by: EMP }));
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: null, schedule_created_by: null, run_metadata: { source: 'campaign_run' } }));
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER);
    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, EMP);
    expectBlocked();
  });

  it('không có ai (run cũ + chiến dịch cũ không có người tạo) → không lọc như trước', async () => {
    mockFindCampaignById.mockResolvedValue(campaignRow({ created_by: null }));
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: null, schedule_created_by: null, run_metadata: { source: 'campaign_run' } }));
    await campaignRunService.executeCampaign(100, 200, OWNER);
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accessibleAccountIds: null }));
  });

  it('nhân viên bấm chạy ĐÃ BỊ XOÁ (không còn hàng giao) → coi như không có tài khoản nào → chặn', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP, run_metadata: { source: 'campaign_run', triggeredBy: EMP } }));
    mockFindAssigned.mockResolvedValue([]);
    await campaignRunService.executeCampaign(100, 200, OWNER);
    expectBlocked();
  });

  it('FAIL-CLOSED: đọc bảng giao lỗi (người kích hoạt là nhân viên) → chặn (không cho gửi)', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP, run_metadata: { source: 'campaign_run', triggeredBy: EMP } }));
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    await campaignRunService.executeCampaign(100, 200, OWNER);
    expectBlocked();
  });

  it('super admin bấm chạy hộ khách → không bị lọc', async () => {
    db.query.mockImplementation(async (sql) => (/SELECT role FROM users/.test(String(sql)) ? { rows: [{ role: 'admin' }] } : { rows: [] }));
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: 1, run_metadata: { source: 'campaign_run', triggeredBy: 1 } }));
    await campaignRunService.executeCampaign(100, 200, OWNER);
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accessibleAccountIds: null }));
  });

  it('run bị chặn KHÔNG ném ra ngoài (executeCampaign resolve) và slot được nhả — không kẹt run khác', async () => {
    mockGetRunForExecution.mockResolvedValue(runRow({ triggered_by: EMP, run_metadata: { source: 'campaign_run', triggeredBy: EMP } }));
    mockFindAssigned.mockResolvedValue([]);
    await expect(campaignRunService.executeCampaign(100, 200, OWNER)).resolves.toBeUndefined();
    expect(campaignRunService.activeRunIds.has('200')).toBe(false);
  });
});

describe('engine — mọi lần lấy tài khoản Zalo đi qua cổng (quét mã nguồn)', () => {
  const source = readFileSync(fileURLToPath(new URL('../campaignRun.service.js', import.meta.url)), 'utf8');

  it('trong _doExecuteCampaign không còn lời gọi getCampaignZaloAccount trần: chỉ getZaloAccountForRun (đã gắn accessibleAccountIds)', () => {
    const body = source.slice(source.indexOf('async _doExecuteCampaign('));
    const direct = body.match(/campaignZaloSenderService\.getCampaignZaloAccount\(/g) || [];
    // Duy nhất lời gọi trong chính hàm bọc getZaloAccountForRun.
    expect(direct).toHaveLength(1);
    expect(body).toContain('return campaignZaloSenderService.getCampaignZaloAccount({ ...args, accessibleAccountIds: zaloAccessibleIds });');
    expect((body.match(/getZaloAccountForRun\(/g) || []).length).toBeGreaterThanOrEqual(16);
  });

  it('mọi lời gọi pickFirstUsableZaloAccount trong engine truyền accessibleAccountIds', () => {
    const body = source.slice(source.indexOf('async _doExecuteCampaign('));
    const calls = body.match(/this\.pickFirstUsableZaloAccount\(\{[^}]*\}\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) expect(call).toContain('accessibleAccountIds: zaloAccessibleIds');
  });
});
