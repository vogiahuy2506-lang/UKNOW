import { describe, expect, it, jest } from '@jest/globals';

const mockFailRun = jest.fn();
const mockFinalizeRun = jest.fn();
const mockUpdateRunProgress = jest.fn();
const mockUpdateCampaignLastRunStats = jest.fn();
const mockFindRunById = jest.fn();
const mockGetRunForExecution = jest.fn();
const mockFindNodesByCampaignId = jest.fn();
const mockFindConnectionsByCampaignId = jest.fn().mockResolvedValue([]);
const mockGetRunMetadata = jest.fn().mockResolvedValue({});
const mockGetRunStatus = jest.fn().mockResolvedValue('running');
const mockCountPendingDue = jest.fn().mockResolvedValue({
  pending_count: 0,
  pending_without_future_due: 0,
});

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    failRun: mockFailRun,
    finalizeRun: mockFinalizeRun,
    updateRunProgress: mockUpdateRunProgress,
    findRunById: mockFindRunById,
    getRunForExecution: mockGetRunForExecution,
    getRunMetadata: mockGetRunMetadata,
    getRunStatus: mockGetRunStatus,
    completeRunWithError: jest.fn(),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findNodesByCampaignId: mockFindNodesByCampaignId,
    findConnectionsByCampaignId: mockFindConnectionsByCampaignId,
    updateNodeExecutionOrder: jest.fn(),
    updateCampaignLastRunStats: mockUpdateCampaignLastRunStats,
    findCampaignById: jest.fn().mockResolvedValue({ id: 1, id_user: 10, status: 'active', flow_json: '{}' }),
    getCampaignById: jest.fn().mockResolvedValue({ id: 1, id_user: 10, status: 'active', flow_json: '{}' }),
  },
}));

jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: {
    logExecutionNode: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    countPendingDue: mockCountPendingDue,
    isTableAvailable: jest.fn().mockResolvedValue(true),
  },
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('PR-1: Campaign run network timeout & zero-recipient behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lỗi mạng khi total_recipients = 0 → gọi failRun, không treo running', async () => {
    const runData = {
      id: 100,
      id_campaign: 1,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      run_metadata: {},
    };
    mockFindRunById.mockResolvedValue(runData);
    mockGetRunForExecution.mockResolvedValue(runData);

    // Mock node throws a network timeout error when resolving recipients
    const timeoutErr = new Error('ETIMEDOUT: Connection timed out');
    timeoutErr.code = 'ETIMEDOUT';
    mockFindNodesByCampaignId.mockRejectedValueOnce(timeoutErr);

    await campaignRunService.executeCampaign(1, 100, 10);

    expect(mockFailRun).toHaveBeenCalledTimes(1);
    expect(mockFailRun).toHaveBeenCalledWith(
      100,
      expect.stringContaining('Lỗi kết nối mạng trong lúc khởi tạo danh sách người nhận')
    );
  });

  it('lỗi mạng khi total_recipients > 0 → giữ running (không gọi failRun), chờ scheduler resume', async () => {
    const runData = {
      id: 102,
      id_campaign: 1,
      status: 'running',
      total_recipients: 50,
      successful_sends: 10,
      failed_sends: 0,
      run_metadata: {},
    };
    mockFindRunById.mockResolvedValue(runData);
    mockGetRunForExecution.mockResolvedValue(runData);

    const timeoutErr = new Error('ECONNRESET: Connection reset by peer');
    timeoutErr.code = 'ECONNRESET';
    mockFindNodesByCampaignId.mockRejectedValueOnce(timeoutErr);

    await campaignRunService.executeCampaign(1, 102, 10);

    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('kết thúc bình thường khi total_recipients = 0 → finalizeRun được gọi với completed', async () => {
    const runData = {
      id: 101,
      id_campaign: 1,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      run_metadata: {},
    };
    mockFindRunById.mockResolvedValue(runData);
    mockGetRunForExecution.mockResolvedValue(runData);

    mockFindNodesByCampaignId.mockResolvedValueOnce([
      { id: 'node_1', node_type: 'trigger', node_subtype: 'start', config: {} },
    ]);

    await campaignRunService.executeCampaign(1, 101, 10);

    expect(mockFinalizeRun).toHaveBeenCalledTimes(1);
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      101,
      false, // hasPendingRecipientDue = false -> status becomes completed
      expect.objectContaining({ totalRecipients: 0, successfulSends: 0 }),
      null
    );
  });

  it('sau một lượt duyệt xong khi mọi recipient còn lại đều hẹn tương lai → lưu mốc wake cùng finalize', async () => {
    const runData = {
      id: 103,
      id_campaign: 1,
      status: 'running',
      total_recipients: 2,
      successful_sends: 1,
      failed_sends: 0,
      run_metadata: {},
    };
    mockFindRunById.mockResolvedValue(runData);
    mockGetRunForExecution.mockResolvedValue(runData);
    mockFindNodesByCampaignId.mockResolvedValueOnce([
      { id: 'node_1', node_type: 'trigger', node_subtype: 'start', config: {} },
    ]);
    mockCountPendingDue.mockResolvedValueOnce({
      pending_count: 2,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: '2030-01-01T00:00:00.000Z',
    });

    await campaignRunService.executeCampaign(1, 103, 10);

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      103,
      true,
      expect.objectContaining({ totalRecipients: 2, successfulSends: 1 }),
      expect.objectContaining({
        nonContinuousDeferredUntil: '2030-01-01T00:00:00.000Z',
        nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
      })
    );
  });

  it('không park cả run khi ledger còn recipient chưa có nextDueAt tương lai', async () => {
    const runData = {
      id: 104,
      id_campaign: 1,
      status: 'running',
      total_recipients: 2,
      successful_sends: 1,
      failed_sends: 0,
      run_metadata: {},
    };
    mockFindRunById.mockResolvedValue(runData);
    mockGetRunForExecution.mockResolvedValue(runData);
    mockFindNodesByCampaignId.mockResolvedValueOnce([
      { id: 'node_1', node_type: 'trigger', node_subtype: 'start', config: {} },
    ]);
    mockCountPendingDue.mockResolvedValueOnce({
      pending_count: 1,
      pending_without_future_due: 1,
      pending_with_retry_meta: 0,
      next_due_at: '2030-01-01T00:00:00.000Z',
    });

    await campaignRunService.executeCampaign(1, 104, 10);

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      104,
      true,
      expect.objectContaining({ totalRecipients: 2, successfulSends: 1 }),
      null
    );
  });
});
