import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPrepareScript = jest.fn();
const mockBuildConfirmationView = jest.fn();
const mockAutoCreateEmailTemplates = jest.fn();
const mockAutoCreateZaloTemplates = jest.fn();
const mockNormalizeNodes = jest.fn((nodes) => nodes);
const mockAutoFillEmailChannels = jest.fn();
const mockAutoFillZaloAccounts = jest.fn();
const mockCreateCampaign = jest.fn();
const mockUpdateCampaign = jest.fn();
const mockRunCampaign = jest.fn();
const mockPublishCampaign = jest.fn();

jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({
  default: {
    prepareScript: mockPrepareScript,
    autoCreateEmailTemplates: mockAutoCreateEmailTemplates,
    autoCreateZaloTemplates: mockAutoCreateZaloTemplates,
    normalizeNodes: mockNormalizeNodes,
    autoFillEmailChannels: mockAutoFillEmailChannels,
    autoFillZaloAccounts: mockAutoFillZaloAccounts,
  },
}));

jest.unstable_mockModule('../../services/ai/campaignConfirmation.service.js', () => ({
  default: {
    buildConfirmationView: mockBuildConfirmationView,
  },
}));

jest.unstable_mockModule('../campaign.controller.js', () => ({
  default: {
    create: mockCreateCampaign,
    update: mockUpdateCampaign,
    run: mockRunCampaign,
  },
}));

jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({
  default: {
    publishCampaign: mockPublishCampaign,
  },
}));

jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/businessProfile.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/customChat.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/chatbotStudioConversation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  getAllowedModelsForUser: jest.fn(),
  savePreferredModelForUser: jest.fn(),
}));
jest.unstable_mockModule('../../services/help/helpAssistant.service.js', () => ({
  tryHandleHelpChat: jest.fn(async () => null),
  HELP_ROUTE_LABELS: {},
}));
jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  saveMessages: jest.fn(),
  createSession: jest.fn(),
  getSessionWizardState: jest.fn(),
  saveAssistantMessage: jest.fn(),
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  chargeAiCredit: jest.fn(),
}));

const { default: aiController } = await import('../ai.controller.js');

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe('aiController Node Validation Enforcement (PR-A1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublishCampaign.mockResolvedValue({ id: 101, status: 'active' });
  });

  describe('createAndRunCampaign', () => {
    it('blocks campaign creation when node config fails validation (missing required fields)', async () => {
      // Node send_email missing fromEmailId and template
      const invalidScript = {
        campaignName: 'Invalid Email Campaign',
        connections: [],
        nodes: [
          {
            id: 'node-1',
            node_type: 'action',
            node_subtype: 'send_email',
            config: {}, // missing fromEmailId
          },
        ],
      };

      const req = {
        body: { script: invalidScript },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.createAndRunCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INVALID_NODE_CONFIG',
        })
      );
      expect(mockCreateCampaign).not.toHaveBeenCalled();
      expect(mockRunCampaign).not.toHaveBeenCalled();
    });

    it('allows campaign creation and run when node config is valid', async () => {
      mockCreateCampaign.mockImplementation(async (req, res) => {
        return res.json({ success: true, data: { id: 101 } });
      });
      mockRunCampaign.mockImplementation(async (req, res) => {
        return res.json({ success: true, data: { runId: 501, status: 'running' } });
      });

      const validScript = {
        campaignName: 'Valid Email Campaign',
        connections: [],
        nodes: [
          {
            id: 'node-1',
            node_type: 'action',
            node_subtype: 'send_email',
            config: {
              fromEmailId: 1,
              emailSubject: 'Hello',
              emailBody: 'Body content',
            },
          },
        ],
      };

      const req = {
        body: { script: validScript },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.createAndRunCampaign(req, res);

      expect(mockCreateCampaign).toHaveBeenCalled();
      expect(mockRunCampaign).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            campaignId: 101,
          }),
        })
      );
    });

    it('returns the publish failure instead of claiming the created campaign is running', async () => {
      mockCreateCampaign.mockImplementation(async (_req, res) => res.json({ success: true, data: { id: 101 } }));
      const publishError = Object.assign(new Error('Campaign has no nodes'), {
        code: 'CANNOT_ACTIVATE_EMPTY_CAMPAIGN',
        statusCode: 409,
      });
      mockPublishCampaign.mockRejectedValueOnce(publishError);

      const req = {
        body: {
          script: {
            campaignName: 'Cannot Publish',
            connections: [],
            nodes: [{ node_type: 'action', node_subtype: 'send_email', config: { fromEmailId: 1, emailSubject: 'Hello', emailBody: 'Body' } }],
          },
        },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.createAndRunCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'CANNOT_ACTIVATE_EMPTY_CAMPAIGN',
        data: expect.objectContaining({ campaignId: 101, status: 'draft' }),
      }));
      expect(mockRunCampaign).not.toHaveBeenCalled();
    });

    it('returns a run preflight error instead of claiming the created campaign is running', async () => {
      mockCreateCampaign.mockImplementation(async (_req, res) => res.json({ success: true, data: { id: 101 } }));
      mockRunCampaign.mockImplementation(async (_req, res) => res.status(400).json({
        success: false,
        code: 'SENDER_DISCONNECTED',
        message: 'Sender unavailable',
      }));

      const req = {
        body: {
          script: {
            campaignName: 'Sender Offline',
            connections: [],
            nodes: [{ node_type: 'action', node_subtype: 'send_email', config: { fromEmailId: 1, emailSubject: 'Hello', emailBody: 'Body' } }],
          },
        },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.createAndRunCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'SENDER_DISCONNECTED',
        data: expect.objectContaining({ campaignId: 101, status: 'active' }),
      }));
    });
  });

  describe('pushToCampaign', () => {
    it('blocks push when autoRun=true and node config fails validation', async () => {
      const invalidScript = {
        campaignName: 'Invalid Push Campaign',
        connections: [],
        nodes: [
          {
            id: 'node-1',
            node_type: 'action',
            node_subtype: 'send_zalo',
            config: {}, // missing zaloAccountId and message
          },
        ],
      };

      const req = {
        params: { id: '10' },
        body: { script: invalidScript, autoRun: true },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.pushToCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INVALID_NODE_CONFIG',
        })
      );
      // Ensure update is never called so existing campaign is not overwritten with invalid script
      expect(mockUpdateCampaign).not.toHaveBeenCalled();
      expect(mockRunCampaign).not.toHaveBeenCalled();
    });

    it('blocks push when nodes is empty array -> 400 EMPTY_CAMPAIGN_SCRIPT', async () => {
      const emptyScript = {
        campaignName: 'Empty Push Campaign',
        connections: [],
        nodes: [],
      };

      const req = {
        params: { id: '10' },
        body: { script: emptyScript, autoRun: false },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.pushToCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'EMPTY_CAMPAIGN_SCRIPT',
        })
      );
      expect(mockUpdateCampaign).not.toHaveBeenCalled();
    });

    it('returns a run preflight error after updating instead of reporting auto-run success', async () => {
      mockUpdateCampaign.mockImplementation(async (_req, res) => res.json({ success: true, data: { id: 10 } }));
      mockRunCampaign.mockImplementation(async (_req, res) => res.status(400).json({
        success: false,
        code: 'NO_SEND_NODE',
        message: 'Campaign has no sender',
      }));
      const req = {
        params: { id: '10' },
        body: {
          autoRun: true,
          script: {
            campaignName: 'Updated Campaign',
            connections: [],
            nodes: [{ node_type: 'action', node_subtype: 'send_email', config: { fromEmailId: 1, emailSubject: 'Hello', emailBody: 'Body' } }],
          },
        },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.pushToCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'NO_SEND_NODE',
        data: expect.objectContaining({ campaignId: '10', campaignUpdated: true }),
      }));
    });

    it('blocks createAndRunCampaign when nodes is empty array -> 400 EMPTY_CAMPAIGN_SCRIPT', async () => {
      const emptyScript = {
        campaignName: 'Empty Create Campaign',
        connections: [],
        nodes: [],
      };

      const req = {
        body: { script: emptyScript },
        user: { id: 1, role: 'user_admin' },
      };
      const res = makeRes();

      await aiController.createAndRunCampaign(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'EMPTY_CAMPAIGN_SCRIPT',
        })
      );
      expect(mockCreateCampaign).not.toHaveBeenCalled();
    });
  });
});
