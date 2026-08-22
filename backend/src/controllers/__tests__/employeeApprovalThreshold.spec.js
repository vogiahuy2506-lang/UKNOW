import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockDbQuery = jest.fn();
const mockLogWorkspace = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: {
    query: mockDbQuery,
  },
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: {
    CAMPAIGN_APPROVAL_THRESHOLD_UPDATED: 'CAMPAIGN_APPROVAL_THRESHOLD_UPDATED',
  },
  AUDIT_ENTITY_TYPES: {
    WORKSPACE: 'WORKSPACE',
  },
  logWorkspace: mockLogWorkspace,
}));

const {
  getCampaignApprovalThreshold,
  updateCampaignApprovalThreshold,
} = await import('../employee.controller.js');

const {
  getCampaignApprovalThreshold: serviceGetThreshold,
  setCampaignApprovalThreshold: serviceSetThreshold,
} = await import('../../services/user/employee.service.js');

describe('employee campaign approval threshold controller & service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCampaignApprovalThreshold', () => {
    it('trả về ngưỡng duyệt khi DB có giá trị', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ employee_campaign_approval_threshold: 500 }],
      });

      const req = { user: { id: 10, role: 'user' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getCampaignApprovalThreshold(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { threshold: 500 },
      });
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT\s+employee_campaign_approval_threshold\s+FROM\s+users\s+WHERE\s+id\s*=\s*\$1/i),
        [10]
      );
    });

    it('trả về null khi DB là NULL', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ employee_campaign_approval_threshold: null }],
      });

      const req = { user: { id: 10, role: 'user' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getCampaignApprovalThreshold(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { threshold: null },
      });
    });
  });

  describe('updateCampaignApprovalThreshold', () => {
    it('cập nhật số nguyên dương hợp lệ và ghi audit log', async () => {
      // 1. find before
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ employee_campaign_approval_threshold: null }],
      });
      // 2. update after
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ employee_campaign_approval_threshold: 1000 }],
      });

      const req = {
        user: { id: 10, role: 'user' },
        body: { threshold: 1000 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await updateCampaignApprovalThreshold(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { threshold: 1000 },
        })
      );
      expect(mockLogWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        'CAMPAIGN_APPROVAL_THRESHOLD_UPDATED',
        'WORKSPACE',
        10,
        { before: null, after: 1000 }
      );
    });

    it('nhập 0 hoặc rỗng → lưu NULL (tắt duyệt)', async () => {
      // 1. find before
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ employee_campaign_approval_threshold: 1000 }],
      });
      // 2. update after
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ employee_campaign_approval_threshold: null }],
      });

      const req = {
        user: { id: 10, role: 'user' },
        body: { threshold: 0 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await updateCampaignApprovalThreshold(req, res);

      expect(mockDbQuery).toHaveBeenLastCalledWith(
        expect.stringMatching(/UPDATE users\s+SET employee_campaign_approval_threshold = \$1/i),
        [null, 10]
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { threshold: null },
        })
      );
    });

    it('nhập số âm hoặc không phải số nguyên → báo lỗi 400', async () => {
      const req = {
        user: { id: 10, role: 'user' },
        body: { threshold: -5 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await updateCampaignApprovalThreshold(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/nguyên dương/i),
        })
      );
    });
  });
});
