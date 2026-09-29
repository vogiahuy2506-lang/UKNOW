/**
 * PR-B (29/09): updateCustomChatbot cũng thôi ghi cài đặt AI sang chatbot_settings theo kênh.
 * PR-A dọn cài đặt kênh chatbot (29/09) — updateCustomChatbot KHÔNG còn dùng `is_active` làm cờ
 * bật/tắt kênh: nhánh đồng bộ chatbot_settings không được kích hoạt bởi `is_active`, và
 * `is_enabled` không được ghi xuống upsertSettings (cờ bật/tắt chỉ do PR-2 công tắc trạng thái lo).
 */
import { jest } from '@jest/globals';

const planRepoPath = '../../repositories/payment/plan.repository.js';
const topupRepoPath = '../../repositories/payment/topup.repository.js';
const chatbotRepoPath = '../../repositories/ai/chatbot.repository.js';
const auditServicePath = '../../services/audit.service.js';
const controllerPath = '../../controllers/chatbot.controller.js';

const mockFindChatbotById = jest.fn();
const mockUpdateChatbot = jest.fn();
const mockUpsertSettings = jest.fn();
const mockLogWorkspace = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule(planRepoPath, () => ({
  getPlanByUserId: jest.fn(),
}));
jest.unstable_mockModule(topupRepoPath, () => ({
  findAllTopupPricing: jest.fn(),
  sumActiveTopupGrants: jest.fn(),
  sumWalletGrants: jest.fn(),
  sumWalletDebits: jest.fn(),
  getWalletBalance: jest.fn(),
  acquireWalletLock: jest.fn(),
  insertTopupDebit: jest.fn(),
  insertTopupGrants: jest.fn(),
  findGrantsByOrderId: jest.fn(),
  findExpiringUnrenewedGrants: jest.fn(),
}));
jest.unstable_mockModule(chatbotRepoPath, () => ({
  default: {
    findChatbotById: mockFindChatbotById,
    updateChatbot: mockUpdateChatbot,
    upsertSettings: mockUpsertSettings,
  },
}));
jest.unstable_mockModule(auditServicePath, () => ({
  AUDIT_ACTIONS: new Proxy({}, { get: (_t, prop) => String(prop) }),
  AUDIT_ENTITY_TYPES: new Proxy({}, { get: (_t, prop) => String(prop) }),
  logWorkspace: mockLogWorkspace,
  logSystem: jest.fn().mockResolvedValue(undefined),
  default: {},
}));

let chatbotController;

beforeEach(async () => {
  jest.resetModules();
  chatbotController = (await import(controllerPath)).default;
  mockFindChatbotById.mockReset().mockResolvedValue({ id: 5, id_user: 7, name: 'Bot' });
  mockUpdateChatbot.mockReset().mockImplementation(async (id, userId, data) => ({ id, name: 'Bot', ...data }));
  mockUpsertSettings.mockReset().mockResolvedValue({});
  mockLogWorkspace.mockClear();
});

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildReq(body = {}) {
  return {
    user: { id: 7, activeContext: null },
    params: { chatbotId: '5' },
    body,
    headers: {},
  };
}

describe('chatbotController.updateCustomChatbot — is_active không còn đồng bộ is_enabled', () => {
  it('chỉ gửi is_active:false → KHÔNG đồng bộ chatbot_settings (upsertSettings không được gọi)', async () => {
    const res = mockRes();
    await chatbotController.updateCustomChatbot(buildReq({ is_active: false }), res);

    expect(res.statusCode).toBe(200);
    expect(mockUpdateChatbot).toHaveBeenCalledTimes(1);
    expect(mockUpsertSettings).not.toHaveBeenCalled();
  });

  it('gửi system_instruction/temperature/max_tokens → vẫn KHÔNG ghi chatbot_settings (PR-B)', async () => {
    const res = mockRes();
    await chatbotController.updateCustomChatbot(
      buildReq({ system_instruction: 'Bạn là trợ lý bán hàng', temperature: 1, max_tokens: 1024 }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(mockUpdateChatbot).toHaveBeenCalledTimes(1);
    expect(mockUpsertSettings).not.toHaveBeenCalled();
  });
});
