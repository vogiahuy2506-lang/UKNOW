import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDbQuery = jest.fn();
const mockLogWorkspace = jest.fn();
const mockGetWorkspaceAuditContext = jest.fn(() => ({ userId: 2, ownerId: 1 }));
const mockCreateCampaignRunRecord = jest.fn();
const mockExecuteCampaign = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockDbQuery },
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: {
    CAMPAIGN_APPROVAL_REQUESTED: 'campaign.approval.requested',
    CAMPAIGN_APPROVAL_APPROVED: 'campaign.approval.approved',
    CAMPAIGN_APPROVAL_REJECTED: 'campaign.approval.rejected',
  },
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
  logWorkspace: mockLogWorkspace,
}));

jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({
  getWorkspaceAuditContext: mockGetWorkspaceAuditContext,
}));

jest.unstable_mockModule('../../services/campaign/campaignRun.service.js', () => ({
  default: {
    createCampaignRunRecord: mockCreateCampaignRunRecord,
    executeCampaign: mockExecuteCampaign,
  },
  EMAIL_API_DELAY_MIN_MS: 50,
  EMAIL_API_DELAY_MAX_MS: 250,
}));

jest.unstable_mockModule('../../services/campaign/campaignFlow.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../services/campaign/campaignNodeData.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../services/campaign/campaignExecutionLog.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../services/campaign/campaignEmailSender.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../repositories/campaign/campaignCustomer.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: jest.fn(),
}));

jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn(),
  recordDirectSendUsage: jest.fn(),
}));

jest.unstable_mockModule('../upload.controller.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../zaloSettings.controller.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../emailSettings.controller.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../services/campaign/campaignPreflight.service.js', () => ({
  validateCampaignPreflight: jest.fn(async () => ({ valid: true })),
}));

const { default: campaignController } = await import('../campaign.controller.js');

function createRes() {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe('Campaign Approval Threshold in campaign.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nhân viên chạy campaign có 150 người nhận với threshold 100 → chuyển pending_owner_approval', async () => {
    const req = {
      params: { id: '10' },
      body: { source: 'campaign_run' },
      user: {
        id: 2,
        role: 'user',
        activeContext: { type: 'employee', ownerId: 1 },
      },
    };
    const res = createRes();

    // 1. SELECT employee_campaign_approval_threshold
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ employee_campaign_approval_threshold: 100 }],
    });
    // 2. SELECT COUNT(*)::int AS count FROM campaign_customers WHERE id_campaign = 10
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ count: 150 }],
    });
    // 3. UPDATE campaigns SET status = 'pending_owner_approval'
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    await campaignController.run(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          campaignId: 10,
          status: 'pending_owner_approval',
          requiresApproval: true,
        }),
      })
    );
    expect(mockDbQuery.mock.calls[1][0]).toMatch(/FROM campaign_customers/i);
    expect(mockDbQuery.mock.calls[1][0]).not.toMatch(/total_customers/i);
    expect(mockLogWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      'campaign.approval.requested',
      'campaign',
      10,
      expect.objectContaining({ threshold: 100, totalCustomers: 150, actorUserId: 2 })
    );
    expect(mockExecuteCampaign).not.toHaveBeenCalled();
  });

  // Ràng buộc quan trọng nhất của tính năng: chủ workspace CHƯA bật ngưỡng thì mọi thứ
  // phải chạy y hệt trước khi có tính năng. Hiện có nhân viên thật đang chạy chiến dịch —
  // nếu ngưỡng rỗng bị hiểu thành "cần duyệt" thì chiến dịch của họ đứng im mà không ai biết.
  // Hai ca dưới khoá cả hai cách "tắt": NULL (chưa từng đặt) và 0 (đặt rồi tắt đi).
  it.each([
    ['NULL — chủ chưa từng đặt ngưỡng', null],
    ['0 — chủ đặt rồi tắt đi', 0],
  ])('ngưỡng %s → nhân viên chạy campaign 150 người vẫn gửi luôn, KHÔNG chờ duyệt', async (_label, threshold) => {
    const req = {
      params: { id: '10' },
      body: { source: 'campaign_run' },
      user: {
        id: 2,
        role: 'user',
        activeContext: { type: 'employee', ownerId: 1 },
      },
    };
    const res = createRes();

    // 1. SELECT employee_campaign_approval_threshold → tắt
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ employee_campaign_approval_threshold: threshold }],
    });
    mockCreateCampaignRunRecord.mockResolvedValueOnce({ id: 77 });
    mockExecuteCampaign.mockResolvedValueOnce({});

    await campaignController.run(req, res);

    // Ngưỡng tắt thì thậm chí KHÔNG được đếm người nhận — chỉ có đúng 1 truy vấn ngưỡng.
    expect(mockDbQuery.mock.calls.filter((c) => /FROM campaign_customers/i.test(c[0]))).toHaveLength(0);
    expect(mockExecuteCampaign).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requiresApproval: true }),
      })
    );
  });

  it('nhân viên chạy campaign có 50 người nhận với threshold 100 → chạy bình thường', async () => {
    const req = {
      params: { id: '10' },
      body: { source: 'campaign_run' },
      user: {
        id: 2,
        role: 'user',
        activeContext: { type: 'employee', ownerId: 1 },
      },
    };
    const res = createRes();

    // 1. SELECT employee_campaign_approval_threshold
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ employee_campaign_approval_threshold: 100 }],
    });
    // 2. SELECT COUNT(*)::int AS count FROM campaign_customers
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ count: 50 }],
    });
    // 3. Campaign run creation & execution
    mockCreateCampaignRunRecord.mockResolvedValueOnce({ id: 99 });
    mockExecuteCampaign.mockResolvedValueOnce({});

    await campaignController.run(req, res);

    expect(mockDbQuery.mock.calls[1][0]).toMatch(/FROM campaign_customers/i);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          runId: 99,
        }),
      })
    );
    expect(mockExecuteCampaign).toHaveBeenCalled();
  });

  it('nhân viên chạy campaign có 0 campaign_customers nhưng có 150 người trong campaign_nodes config → chuyển pending_owner_approval', async () => {
    const req = {
      params: { id: '10' },
      body: { source: 'campaign_run' },
      user: {
        id: 2,
        role: 'user',
        activeContext: { type: 'employee', ownerId: 1 },
      },
    };
    const res = createRes();

    // 1. SELECT employee_campaign_approval_threshold
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ employee_campaign_approval_threshold: 100 }],
    });
    // 2. SELECT COUNT(*)::int AS count FROM campaign_customers (chưa nạp -> 0)
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ count: 0 }],
    });
    // 3. SELECT node_type, node_subtype, config FROM campaign_nodes
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          node_type: 'data',
          node_subtype: 'read_customer_list',
          config: { selectedCustomerIds: new Array(150).fill(1) },
        },
      ],
    });
    // 4. UPDATE campaigns SET status = 'pending_owner_approval'
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    await campaignController.run(req, res);

    expect(mockDbQuery.mock.calls[1][0]).toMatch(/FROM campaign_customers/i);
    expect(mockDbQuery.mock.calls[2][0]).toMatch(/FROM campaign_nodes/i);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          campaignId: 10,
          status: 'pending_owner_approval',
          requiresApproval: true,
        }),
      })
    );
    expect(mockExecuteCampaign).not.toHaveBeenCalled();
  });

  it('owner tự chạy campaign 150 người nhận → bypass threshold duyệt', async () => {
    const req = {
      params: { id: '10' },
      body: { source: 'campaign_run' },
      user: {
        id: 1,
        role: 'user',
        activeContext: { type: 'self' },
      },
    };
    const res = createRes();

    mockCreateCampaignRunRecord.mockResolvedValueOnce({ id: 100 });
    mockExecuteCampaign.mockResolvedValueOnce({});

    await campaignController.run(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          runId: 100,
        }),
      })
    );
    expect(mockExecuteCampaign).toHaveBeenCalled();
  });

  it('owner phê duyệt campaign pending_owner_approval → cập nhật status và chạy chiến dịch', async () => {
    const req = {
      params: { id: '10' },
      user: {
        id: 1,
        role: 'user',
        activeContext: { type: 'self' },
      },
    };
    const res = createRes();

    // 1. SELECT campaign
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 10, campaign_name: 'Big Campaign', status: 'pending_owner_approval' }],
    });
    // 2. createCampaignRunRecord performs preflight, activation and run insertion atomically.
    mockCreateCampaignRunRecord.mockResolvedValueOnce({ id: 101 });
    mockExecuteCampaign.mockResolvedValueOnce({});

    await campaignController.approve(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          campaignId: 10,
          status: 'running',
          runId: 101,
        }),
      })
    );
    expect(mockLogWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      'campaign.approval.approved',
      'campaign',
      10,
      expect.anything()
    );
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    expect(mockCreateCampaignRunRecord).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 10,
      activatePendingApproval: true,
    }));
  });

  it('does not approve a campaign that is no longer pending owner approval', async () => {
    const req = {
      params: { id: '10' },
      user: { id: 1, role: 'user', activeContext: { type: 'self' } },
    };
    const res = createRes();
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 10, campaign_name: 'Already Active', status: 'active' }],
    });

    await campaignController.approve(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'CAMPAIGN_NOT_PENDING_APPROVAL',
    }));
    expect(mockCreateCampaignRunRecord).not.toHaveBeenCalled();
  });

  it('owner từ chối campaign pending_owner_approval → cập nhật status = draft', async () => {
    const req = {
      params: { id: '10' },
      body: { reason: 'Số lượng quá lớn, cần thu hẹp tệp' },
      user: {
        id: 1,
        role: 'user',
        activeContext: { type: 'self' },
      },
    };
    const res = createRes();

    // 1. SELECT campaign
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 10, campaign_name: 'Big Campaign', status: 'pending_owner_approval' }],
    });
    // 2. UPDATE status = 'draft'
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });

    await campaignController.reject(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          campaignId: 10,
          status: 'draft',
        }),
      })
    );
    expect(mockLogWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      'campaign.approval.rejected',
      'campaign',
      10,
      expect.objectContaining({ reason: 'Số lượng quá lớn, cần thu hẹp tệp' })
    );
  });
});
