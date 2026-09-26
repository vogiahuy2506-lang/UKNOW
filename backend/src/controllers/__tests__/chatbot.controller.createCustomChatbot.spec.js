/**
 * "Nợ nhỏ" 26/09 — chatbot.controller.js createCustomChatbot() trước đây coi
 * `maxChatbots <= 0` là KHÔNG giới hạn (bỏ qua hẳn việc kiểm), ngược với hợp đồng chung
 * normalizeCeiling (topupLock.service.js, PR-3 Việc 3.2): NULL/-1 = không giới hạn, 0 = không
 * được tạo. Route sinh ra 0 duy nhất là khách tự chọn 0 chatbot ở gói Tùy chọn
 * (customPlanPricing.util.js mapQuantitiesToPlanColumns) — đang bị tạo chatbot KHÔNG giới hạn.
 */
import { jest } from '@jest/globals';

const planRepoPath = '../../repositories/payment/plan.repository.js';
const topupRepoPath = '../../repositories/payment/topup.repository.js';
const chatbotRepoPath = '../../repositories/ai/chatbot.repository.js';
const auditServicePath = '../../services/audit.service.js';
const controllerPath = '../../controllers/chatbot.controller.js';

const mockGetPlanByUserId = jest.fn();
const mockSumActiveTopupGrants = jest.fn();
const mockCountActiveChatbotsByUser = jest.fn();
const mockCreateChatbot = jest.fn();
const mockLogWorkspace = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule(planRepoPath, () => ({
  getPlanByUserId: mockGetPlanByUserId,
}));
jest.unstable_mockModule(topupRepoPath, () => ({
  findAllTopupPricing: jest.fn(),
  sumActiveTopupGrants: mockSumActiveTopupGrants,
  sumWalletGrants: jest.fn(),
  sumWalletDebits: jest.fn(),
  getWalletBalance: jest.fn(),
  acquireWalletLock: jest.fn(),
  insertTopupDebit: jest.fn(),
  insertTopupGrants: jest.fn(),
  findGrantsByOrderId: jest.fn(),
}));
jest.unstable_mockModule(chatbotRepoPath, () => ({
  default: {
    countActiveChatbotsByUser: mockCountActiveChatbotsByUser,
    createChatbot: mockCreateChatbot,
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
  mockGetPlanByUserId.mockReset();
  mockSumActiveTopupGrants.mockReset().mockResolvedValue(0);
  mockCountActiveChatbotsByUser.mockReset().mockResolvedValue(0);
  mockCreateChatbot.mockReset().mockImplementation(async (userId, data) => ({ id: 1, ...data }));
  mockLogWorkspace.mockClear();
});

function mockRes() {
  const res = {
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
  return res;
}

function buildReq(body = {}) {
  return {
    user: { id: 7, activeContext: null },
    body,
    headers: {},
  };
}

describe('chatbotController.createCustomChatbot — nghĩa số 0 của max_chatbots (thống nhất với normalizeCeiling)', () => {
  it('max_chatbots = NULL (gói enterprise/custom không giới hạn) → tạo được', async () => {
    mockGetPlanByUserId.mockResolvedValue({ max_chatbots: null });

    const res = mockRes();
    await chatbotController.createCustomChatbot(buildReq({ name: 'Bot A' }), res);

    expect(res.statusCode).toBe(201);
    expect(mockCreateChatbot).toHaveBeenCalledTimes(1);
  });

  it('max_chatbots = -1 (quy ước không giới hạn) → tạo được', async () => {
    mockGetPlanByUserId.mockResolvedValue({ max_chatbots: -1 });

    const res = mockRes();
    await chatbotController.createCustomChatbot(buildReq({ name: 'Bot B' }), res);

    expect(res.statusCode).toBe(201);
    expect(mockCreateChatbot).toHaveBeenCalledTimes(1);
  });

  it('max_chatbots = 0, KHÔNG mua lẻ → 403 CHATBOT_LIMIT_EXCEEDED (KHÔNG được tạo)', async () => {
    mockGetPlanByUserId.mockResolvedValue({ max_chatbots: 0 });
    mockSumActiveTopupGrants.mockResolvedValue(0);

    const res = mockRes();
    await chatbotController.createCustomChatbot(buildReq({ name: 'Bot C' }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
    expect(mockCreateChatbot).not.toHaveBeenCalled();
  });

  it('max_chatbots = 0 + 1 slot mua lẻ → tạo được đúng 1, cái thứ 2 bị chặn', async () => {
    mockGetPlanByUserId.mockResolvedValue({ max_chatbots: 0 });
    mockSumActiveTopupGrants.mockResolvedValue(1);
    mockCountActiveChatbotsByUser.mockResolvedValue(0);

    const resFirst = mockRes();
    await chatbotController.createCustomChatbot(buildReq({ name: 'Bot D1' }), resFirst);
    expect(resFirst.statusCode).toBe(201);

    // Chatbot đầu đã tạo — mô phỏng đếm hiện tại tăng lên 1 cho lần gọi thứ hai.
    mockCountActiveChatbotsByUser.mockResolvedValue(1);
    const resSecond = mockRes();
    await chatbotController.createCustomChatbot(buildReq({ name: 'Bot D2' }), resSecond);
    expect(resSecond.statusCode).toBe(403);
    expect(resSecond.body.code).toBe('CHATBOT_LIMIT_EXCEEDED');
  });

  it('không có gói (plan = null) → 403, KHÔNG còn được tạo không giới hạn như trước', async () => {
    mockGetPlanByUserId.mockResolvedValue(null);

    const res = mockRes();
    await chatbotController.createCustomChatbot(buildReq({ name: 'Bot F' }), res);

    expect(res.statusCode).toBe(403);
    expect(mockCreateChatbot).not.toHaveBeenCalled();
  });

  it('super admin không có gói → vẫn tạo được (bỏ qua trần như mọi tài nguyên khác)', async () => {
    mockGetPlanByUserId.mockResolvedValue(null);
    mockCountActiveChatbotsByUser.mockResolvedValue(50);

    const req = buildReq({ name: 'Bot G' });
    req.user.role = 'admin';
    const res = mockRes();
    await chatbotController.createCustomChatbot(req, res);

    expect(res.statusCode).toBe(201);
    expect(mockCreateChatbot).toHaveBeenCalledTimes(1);
  });

  it('max_chatbots = 3 (bình thường) → chạm trần thì 403, dưới trần thì tạo được', async () => {
    mockGetPlanByUserId.mockResolvedValue({ max_chatbots: 3 });
    mockCountActiveChatbotsByUser.mockResolvedValue(3);

    const res = mockRes();
    await chatbotController.createCustomChatbot(buildReq({ name: 'Bot E' }), res);
    expect(res.statusCode).toBe(403);
  });
});
