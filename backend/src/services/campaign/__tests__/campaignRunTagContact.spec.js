import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-T2 — khối "Gắn tag" phải CHẠY THẬT trong vòng duyệt khối (trước đây rơi xuống nhánh mặc định
// "Node chưa có logic chạy riêng, bỏ qua"). Test dựng một lượt chạy: khối nguồn (đọc khách đã lưu) → khối tag_contact,
// mock `campaignTagStepService` để chốt ĐÚNG đầu vào runtime truyền (workspace chủ chiến dịch, dòng của khối nguồn,
// campaignId/runId) và cách runtime ghi log / xử lý lỗi. Logic khớp khách + cách ly workspace ở campaignTagStep.service.spec.js.

const mockApplyStep = jest.fn();
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockGetCustomersFromDataNode = jest.fn();
const mockFindNodes = jest.fn();
const mockFindCampaign = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockResolvedValue({
      id: 200, status: 'running', total_recipients: 0, successful_sends: 0, failed_sends: 0, run_metadata: { source: 'campaign_run' },
    }),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: mockFinalizeRun,
    failRun: mockFailRun,
    completeRunWithError: jest.fn().mockResolvedValue(null),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: mockFindCampaign,
    findNodesByCampaignId: mockFindNodes,
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
    buildNodeSuccessMessage: jest.fn().mockReturnValue('ok'),
    parseEmailList: jest.fn(() => []),
  },
}));

jest.unstable_mockModule('../campaignNodeData.service.js', () => ({
  default: { getCustomersFromDataNode: mockGetCustomersFromDataNode },
}));
jest.unstable_mockModule('../campaignTagStep.service.js', () => ({ default: { applyStep: mockApplyStep } }));
jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({ default: { logExecutionNode: mockLogExecutionNode } }));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: jest.fn().mockResolvedValue(null),
    countPendingDue: jest.fn().mockResolvedValue({
      pending_count: 0, pending_without_future_due: 0, pending_with_retry_meta: 0, next_due_at: null,
    }),
  },
}));
jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: { findExistingSentCampaignZaloMessageCrossRun: jest.fn().mockResolvedValue(null), insertCampaignZaloMessage: jest.fn().mockResolvedValue(1) },
}));
jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: { findExistingSentCampaignEmailCrossRun: jest.fn().mockResolvedValue(null), findExistingSentCampaignEmail: jest.fn().mockResolvedValue(null) },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  nextVnMidnight: jest.fn(() => new Date('2026-09-05T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

const SOURCE_ITEMS = [{ email: 'an@x.com', full_name: 'An' }, { email: 'binh@x.com', full_name: 'Bình' }];

function setNodes(tagConfig, { withSource = true } = {}) {
  const nodes = [];
  if (withSource) {
    nodes.push({ id: 300, node_type: 'data', node_subtype: 'read_interested_customers', execution_order: 1, config: {} });
  }
  nodes.push({ id: 301, node_type: 'tag_contact', node_subtype: 'tag_contact', execution_order: 2, config: tagConfig });
  mockFindNodes.mockResolvedValue(nodes);
}

describe('runtime khối Gắn tag (tag_contact)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindCampaign.mockResolvedValue({ id: 100, id_user: 10, workspace_owner_id: 77, status: 'active', flow_json: {} });
    mockGetCustomersFromDataNode.mockResolvedValue({ items: SOURCE_ITEMS, dataLoadMeta: {} });
    mockApplyStep.mockResolvedValue({
      action: 'add', tagName: 'VIP', tagId: 5, totalItems: 2, matched: 1, notFound: 1, changed: 1,
    });
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('gắn cho các dòng của khối nguồn đã chọn, theo workspace chủ chiến dịch (không phải người bấm chạy), kèm campaignId/runId', async () => {
    setNodes({ tagAction: 'add', tagName: 'VIP', tagSourceNodeId: '300' });
    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockApplyStep).toHaveBeenCalledTimes(1);
    expect(mockApplyStep).toHaveBeenCalledWith(expect.objectContaining({
      workspaceOwnerId: 77,
      items: SOURCE_ITEMS,
      tagAction: 'add',
      tagName: 'VIP',
      campaignId: 100,
      runId: 200,
      doneKeys: null, // một lần chạy, không phải chế độ liên tục
    }));
    const tagLog = mockLogExecutionNode.mock.calls.map((c) => c[0]).find((arg) => arg.node?.id === 301);
    expect(tagLog.status).toBe('success');
    expect(tagLog.executionData.message).toBe('Đã gắn tag "VIP" cho 1 khách (1/2 dòng khớp khách đã lưu, 1 không tìm thấy khách)');
    expect(tagLog.executionData.meta).toMatchObject({ tagId: 5, changed: 1, matched: 1, notFound: 1 });
    // Không còn rơi vào nhánh mặc định "bỏ qua".
    expect(mockLogExecutionNode.mock.calls.some((c) => c[0].executionData?.meta?.skipped)).toBe(false);
  });

  it('tagAction remove → log "Đã gỡ"', async () => {
    mockApplyStep.mockResolvedValue({ action: 'remove', tagName: 'VIP', tagId: 5, totalItems: 2, matched: 2, notFound: 0, changed: 2 });
    setNodes({ tagAction: 'remove', tagName: 'VIP', tagSourceNodeId: '300' });
    await campaignRunService.executeCampaign(100, 200, 10);
    const tagLog = mockLogExecutionNode.mock.calls.map((c) => c[0]).find((arg) => arg.node?.id === 301);
    expect(tagLog.executionData.message).toMatch(/^Đã gỡ tag "VIP" cho 2 khách/);
  });

  it('không chọn nguồn: dùng đầu ra khối liền trước', async () => {
    setNodes({ tagAction: 'add', tagName: 'VIP' });
    await campaignRunService.executeCampaign(100, 200, 10);
    expect(mockApplyStep).toHaveBeenCalledWith(expect.objectContaining({ items: SOURCE_ITEMS }));
  });

  it('nguồn trỏ tới khối không có đầu ra → danh sách rỗng, không lỗi', async () => {
    setNodes({ tagAction: 'add', tagName: 'VIP', tagSourceNodeId: '999' });
    await campaignRunService.executeCampaign(100, 200, 10);
    expect(mockApplyStep).toHaveBeenCalledWith(expect.objectContaining({ items: [] }));
  });

  it('lỗi khi gắn tag (vd tên trống) chỉ ghi cảnh báo ở khối, KHÔNG làm hỏng cả lượt chạy', async () => {
    mockApplyStep.mockRejectedValue(Object.assign(new Error('Tên tag không được để trống'), { statusCode: 400 }));
    setNodes({ tagAction: 'add', tagName: '', tagSourceNodeId: '300' });
    await campaignRunService.executeCampaign(100, 200, 10);

    const tagLog = mockLogExecutionNode.mock.calls.map((c) => c[0]).find((arg) => arg.node?.id === 301);
    expect(tagLog.status).toBe('warning');
    expect(tagLog.errorMessage).toBe('Tên tag không được để trống');
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockFinalizeRun).toHaveBeenCalledTimes(1); // lượt chạy vẫn đóng sổ bình thường
  });
});
