/**
 * P8a — graph do compiler sinh cho WhatsApp phải QUA preflight thật của engine (adapter.checkReadiness):
 * node thiếu/sai tài khoản là lỗi compiler, phải đỏ ở đây chứ không đợi tới lúc chạy chiến dịch.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetSession = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn(async () => false),
  whatsappSessionIsLocked: jest.fn(async () => false),
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'locked',
}));
jest.unstable_mockModule('../../chatbot/whatsappBaileys.service.js', () => ({
  getSession: mockGetSession,
  listSessions: jest.fn(() => []),
}));

jest.unstable_mockModule('../../../repositories/chatbot/whatsappCampaignConversation.repository.js', () => ({
  default: { listOpenWhatsAppConversationsForSession: jest.fn(async () => [{ external_id: '84912345678@s.whatsapp.net', visitor_name: 'Khách' }]) },
  extractPhoneFromExternalId: (id) => String(id).split('@')[0],
}));

const { compileCampaign } = await import('../campaignCompiler.service.js');
const { validateCampaignPreflight } = await import('../../campaign/campaignPreflight.service.js');

const WA_FLAG = 'CAMPAIGN_CHANNEL_WHATSAPP_ENABLED';
const OWNER = 7;

const compiledWhatsAppRows = (mutate) => {
  const graph = compileCampaign({
    version: 1,
    channel: 'whatsapp',
    sender: { type: 'whatsapp_session', sessionKey: `${OWNER}-shopwa` },
    audience: { type: 'conversations', recipientKind: 'phone' },
    schedule: { type: 'once' },
    contentBrief: {},
  });
  graph.nodes.find((n) => n.nodeSubtype === 'send_whatsapp').config.steps[0].message = 'Xin chào!';
  if (mutate) mutate(graph);
  return graph.nodes.map((n, i) => ({
    id: i + 1,
    node_type: n.nodeType,
    node_subtype: n.nodeSubtype,
    config: n.config,
  }));
};

describe('P8a — compiler WhatsApp qua preflight của engine', () => {
  let prevFlag;
  beforeEach(() => {
    prevFlag = process.env[WA_FLAG];
    process.env[WA_FLAG] = 'true';
    jest.clearAllMocks();
    // Các truy vấn sau bước kiểm adapter (Zalo/Email) không liên quan tới ca này.
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetSession.mockReturnValue({ status: 'open', userName: 'Shop' });
  });
  afterEach(() => {
    if (prevFlag === undefined) delete process.env[WA_FLAG]; else process.env[WA_FLAG] = prevFlag;
  });

  it('graph compiler sinh (có tài khoản) → preflight ĐẠT', async () => {
    mockQuery.mockResolvedValueOnce({ rows: compiledWhatsAppRows() });
    await expect(validateCampaignPreflight({ campaignId: 1, workspaceOwnerId: OWNER })).resolves.toMatchObject({ valid: true });
  });

  it('node send_whatsapp THIẾU tài khoản → preflight đỏ WHATSAPP_ACCOUNT_NOT_READY (không đợi tới lúc chạy)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: compiledWhatsAppRows((graph) => { delete graph.nodes.find((n) => n.nodeSubtype === 'send_whatsapp').config.whatsappSessionKey; }),
    });
    await expect(validateCampaignPreflight({ campaignId: 1, workspaceOwnerId: OWNER })).rejects.toMatchObject({
      code: 'WHATSAPP_ACCOUNT_NOT_READY',
      statusCode: 400,
    });
  });

  it('phiên của chủ khác → preflight đỏ (compiler không được sinh mã phiên ngoài workspace)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: compiledWhatsAppRows() });
    await expect(validateCampaignPreflight({ campaignId: 1, workspaceOwnerId: 99 })).rejects.toMatchObject({
      code: 'WHATSAPP_ACCOUNT_NOT_READY',
    });
  });
});
