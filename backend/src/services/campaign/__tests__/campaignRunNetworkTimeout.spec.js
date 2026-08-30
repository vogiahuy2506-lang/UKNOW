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
    countPendingDue: jest.fn().mockResolvedValue({ pending_count: 0 }),
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
      expect.objectContaining({ totalRecipients: 0, successfulSends: 0 })
    );
  });
});
