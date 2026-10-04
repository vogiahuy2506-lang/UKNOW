/**
 * 04/10/2026 — Rà soát màn Studio (PLAN_SUA_3_MAN, nhánh fix/studio-gon-dung):
 *  - S-03: bot cũ thiếu `widget_key` (bản sao "Gửi bản sao") được sinh key khi chủ đọc danh sách / chi tiết,
 *          để mã script nhúng của widget không còn 404. Lỗi sinh key không làm hỏng việc đọc.
 *  - S-12: 1 tài khoản Zalo = 1 chatbot. Bật bot thứ hai khi bot khác đang bật → 409 kèm tên bot đang giữ
 *          (setEnabled KHÔNG được gọi). Tắt luôn được. Bật khi không có bot khác → như cũ.
 */
import { jest } from '@jest/globals';

const chatbotRepoPath = '../../repositories/ai/chatbot.repository.js';
const zaloRepoPath = '../../repositories/chatbot/chatbotZaloAccount.repository.js';
const zaloInboxPath = '../../services/chatbot/zaloInbox.service.js';
const auditServicePath = '../../services/audit.service.js';
const controllerPath = '../../controllers/chatbot.controller.js';

const mockListChatbotsByUser = jest.fn();
const mockFindChatbotById = jest.fn();
const mockEnsureWidgetKey = jest.fn();
const mockFindOtherEnabledChatbot = jest.fn();
const mockSetEnabled = jest.fn();
const mockInvalidateAccountCache = jest.fn();
const mockLogWorkspace = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule(chatbotRepoPath, () => ({
  default: {
    listChatbotsByUser: mockListChatbotsByUser,
    findChatbotById: mockFindChatbotById,
    ensureWidgetKey: mockEnsureWidgetKey,
  },
}));
jest.unstable_mockModule(zaloRepoPath, () => ({
  default: {
    findOtherEnabledChatbot: mockFindOtherEnabledChatbot,
    setEnabled: mockSetEnabled,
  },
}));
jest.unstable_mockModule(zaloInboxPath, () => ({
  default: { invalidateAccountCache: mockInvalidateAccountCache },
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
  mockListChatbotsByUser.mockReset();
  mockFindChatbotById.mockReset();
  mockEnsureWidgetKey.mockReset();
  mockFindOtherEnabledChatbot.mockReset().mockResolvedValue(null);
  mockSetEnabled.mockReset().mockResolvedValue({ id: 500, is_enabled: true });
  mockInvalidateAccountCache.mockReset();
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

const owner = { id: 7, activeContext: null };

describe('S-03 — bot thiếu widget_key được sinh key khi đọc thông tin nhúng', () => {
  it('listCustomChatbots: dòng thiếu key được gọi ensureWidgetKey và trả key mới; dòng đã có key thì không đụng', async () => {
    mockListChatbotsByUser.mockResolvedValue([
      { id: 1, name: 'Có key', widget_key: 'abc12345' },
      { id: 2, name: 'Bản sao thiếu key', widget_key: null },
      { id: 3, name: 'Key rỗng', widget_key: '  ' },
    ]);
    mockEnsureWidgetKey.mockImplementation(async (id) => `gen${id}`);

    const res = mockRes();
    await chatbotController.listCustomChatbots({ user: owner, query: {} }, res);

    expect(res.body.success).toBe(true);
    expect(res.body.data.map((b) => b.widget_key)).toEqual(['abc12345', 'gen2', 'gen3']);
    expect(mockEnsureWidgetKey.mock.calls.map((c) => c[0])).toEqual([2, 3]);
  });

  it('listCustomChatbots (lọc origin=shared): vẫn sinh key cho bản sao thiếu key', async () => {
    mockListChatbotsByUser.mockResolvedValue([{ id: 9, name: 'Bản sao', widget_key: null, origin: 'shared' }]);
    mockEnsureWidgetKey.mockResolvedValue('newkey99');

    const res = mockRes();
    await chatbotController.listCustomChatbots({ user: owner, query: { origin: 'shared' } }, res);

    expect(res.body.data[0].widget_key).toBe('newkey99');
  });

  it('getCustomChatbot: bot thiếu key cũng được sinh key', async () => {
    mockFindChatbotById.mockResolvedValue({ id: 4, name: 'Bot', widget_key: null });
    mockEnsureWidgetKey.mockResolvedValue('k4k4k4k4');

    const res = mockRes();
    await chatbotController.getCustomChatbot({ user: owner, params: { chatbotId: '4' } }, res);

    expect(res.body.data.widget_key).toBe('k4k4k4k4');
  });

  it('ensureWidgetKey lỗi → danh sách vẫn trả về (key giữ trống), không 500', async () => {
    mockListChatbotsByUser.mockResolvedValue([{ id: 2, name: 'Thiếu key', widget_key: null }]);
    mockEnsureWidgetKey.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const res = mockRes();
    await chatbotController.listCustomChatbots({ user: owner, query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].widget_key).toBeNull();
    warn.mockRestore();
  });
});

describe('S-12 — 1 tài khoản Zalo = 1 chatbot (chặn ở đường bật)', () => {
  const toggleReq = (body) => ({ user: owner, params: { zaloSettingId: '34' }, body });

  it('bật bot thứ hai khi bot khác đang bật → 409, nói rõ tên bot đang giữ, KHÔNG gọi setEnabled', async () => {
    mockFindOtherEnabledChatbot.mockResolvedValue({ id: 11, name: 'Bot Tư vấn' });

    const res = mockRes();
    await chatbotController.toggleZaloAccountChatbot(toggleReq({ enabled: true, id_chatbot: 12 }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('ZALO_ACCOUNT_BOUND_TO_OTHER_CHATBOT');
    expect(res.body.message).toContain('Bot Tư vấn');
    expect(res.body.chatbotName).toBe('Bot Tư vấn');
    expect(mockFindOtherEnabledChatbot).toHaveBeenCalledWith(7, 34, 12);
    expect(mockSetEnabled).not.toHaveBeenCalled();
    expect(mockInvalidateAccountCache).not.toHaveBeenCalled();
  });

  it('bật khi không có bot khác đang giữ tài khoản → như cũ (setEnabled được gọi, xoá cache)', async () => {
    const res = mockRes();
    await chatbotController.toggleZaloAccountChatbot(toggleReq({ enabled: true, id_chatbot: 12 }), res);

    expect(res.statusCode).toBe(200);
    expect(mockSetEnabled).toHaveBeenCalledWith(7, 34, 12, true, { accessibleZaloIds: null });
    expect(mockInvalidateAccountCache).toHaveBeenCalled();
  });

  it('TẮT luôn được, kể cả khi bot khác đang bật (không tra bot đang giữ)', async () => {
    mockFindOtherEnabledChatbot.mockResolvedValue({ id: 11, name: 'Bot Tư vấn' });

    const res = mockRes();
    await chatbotController.toggleZaloAccountChatbot(toggleReq({ enabled: false, id_chatbot: 12 }), res);

    expect(res.statusCode).toBe(200);
    expect(mockFindOtherEnabledChatbot).not.toHaveBeenCalled();
    expect(mockSetEnabled).toHaveBeenCalledWith(7, 34, 12, false, { accessibleZaloIds: null });
  });

  it('dòng mặc định (id_chatbot rỗng) không phải một chatbot → không tra bot đang giữ', async () => {
    const res = mockRes();
    await chatbotController.toggleZaloAccountChatbot(toggleReq({ enabled: true }), res);

    expect(res.statusCode).toBe(200);
    expect(mockFindOtherEnabledChatbot).not.toHaveBeenCalled();
    expect(mockSetEnabled).toHaveBeenCalledWith(7, 34, null, true, { accessibleZaloIds: null });
  });
});
