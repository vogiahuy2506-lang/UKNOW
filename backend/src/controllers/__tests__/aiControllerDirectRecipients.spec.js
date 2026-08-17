import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPrepareScript = jest.fn();
const mockBuildConfirmationView = jest.fn();
const mockAutoCreateEmailTemplates = jest.fn();
const mockAutoCreateZaloTemplates = jest.fn();
const mockNormalizeNodes = jest.fn((nodes) => nodes);
const mockAutoFillEmailChannels = jest.fn();
const mockAutoFillZaloAccounts = jest.fn();
const mockCreateCampaign = jest.fn();
const mockRunCampaign = jest.fn();

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
    run: mockRunCampaign,
  },
}));

jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({
  default: {
    publishCampaign: jest.fn(),
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

describe('aiController directRecipients with Zalo contacts UIDs (P0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prepareCampaign: attaches 3 UIDs to send_zalo_personal node with zaloRecipientType=uid', async () => {
    const rawScript = {
      campaignName: 'Test Zalo Campaign',
      wizardDataSource: 'zalo_contacts',
      nodes: [
        {
          id: 'node-1',
          node_type: 'action',
          node_subtype: 'send_zalo_personal',
          config: {},
        },
      ],
    };

    mockPrepareScript.mockResolvedValue({
      ...rawScript,
      nodes: [
        {
          id: 'node-1',
          node_type: 'action',
          node_subtype: 'send_zalo_personal',
          config: {},
        },
      ],
    });

    mockBuildConfirmationView.mockResolvedValue({
      ready: true,
      channel: 'zalo_personal',
    });

    const directRecipients = {
      uids: ['123456789012345678', '987654321098765432', '112233445566778899'],
      friends: [
        { friend_id: '123456789012345678', display_name: 'Friend 1' },
        { friend_id: '987654321098765432', display_name: 'Friend 2' },
        { friend_id: '112233445566778899', display_name: 'Friend 3' },
      ],
    };

    const req = {
      body: {
        script: rawScript,
        directRecipients,
      },
      user: { id: 1 },
    };
    const res = makeRes();

    await aiController.prepareCampaign(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          preparedScript: expect.objectContaining({
            nodes: [
              expect.objectContaining({
                node_subtype: 'send_zalo_personal',
                config: expect.objectContaining({
                  zaloRecipientSource: 'manual',
                  zaloRecipientType: 'uid',
                  zaloRecipientField: 'uid',
                  zaloRecipientPhones: ['123456789012345678', '987654321098765432', '112233445566778899'],
                }),
              }),
            ],
          }),
        }),
      })
    );
  });

  it('createAndRunCampaign: handles wizardDataSource=zalo_contacts and injects UIDs into created campaign', async () => {
    const script = {
      campaignName: 'Zalo Friends Campaign',
      wizardDataSource: 'zalo_contacts',
      connections: [],
      nodes: [
        {
          id: 'node-1',
          node_type: 'action',
          node_subtype: 'send_zalo_personal',
          config: {},
        },
      ],
    };

    const directRecipients = {
      uids: ['123456789012345678', '987654321098765432', '112233445566778899'],
    };

    mockCreateCampaign.mockImplementation(async (req, res) => {
      return res.status(201).json({
        success: true,
        data: { id: 888, ...req.body },
      });
    });

    mockRunCampaign.mockImplementation(async (req, res) => {
      return res.json({
        success: true,
        data: { status: 'running' },
      });
    });

    const req = {
      body: {
        script,
        directRecipients,
      },
      user: { id: 1 },
    };
    const res = makeRes();

    await aiController.createAndRunCampaign(req, res);

    expect(mockCreateCampaign).toHaveBeenCalled();
    const createCallArg = mockCreateCampaign.mock.calls[0][0];
    const createdNodes = createCallArg.body.nodes;
    expect(createdNodes[0].config).toMatchObject({
      zaloRecipientSource: 'manual',
      zaloRecipientType: 'uid',
      zaloRecipientField: 'uid',
      zaloRecipientPhones: ['123456789012345678', '987654321098765432', '112233445566778899'],
    });
  });

  it('createAndRunCampaign: returns 400 MANUAL_RECIPIENTS_REQUIRED when wizardDataSource=zalo_contacts but directRecipients missing', async () => {
    const script = {
      campaignName: 'Zalo Friends Campaign',
      wizardDataSource: 'zalo_contacts',
      connections: [],
      nodes: [
        {
          id: 'node-1',
          node_type: 'action',
          node_subtype: 'send_zalo_personal',
          config: {},
        },
      ],
    };

    const req = {
      body: {
        script,
        // no directRecipients
      },
      user: { id: 1 },
    };
    const res = makeRes();

    await aiController.createAndRunCampaign(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'MANUAL_RECIPIENTS_REQUIRED',
      })
    );
  });
});
