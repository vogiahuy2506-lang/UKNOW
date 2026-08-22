import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findChatbotById = jest.fn();
const getCustomChatbotDocuments = jest.fn();

jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findChatbotById,
    getCustomChatbotDocuments,
  },
}));

// Heavy transitive deps — stub minimal surfaces used at module load.
jest.unstable_mockModule('../../services/chatbot/knowledgeBase.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/subAssistant.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/chatRouter.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/ragEngine.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(),
}));
jest.unstable_mockModule('../../services/ai/aiCreditMeter.service.js', () => ({
  default: {},
  VISITOR_CHAT_ERROR_MESSAGE: 'err',
  VISITOR_CHAT_UNAVAILABLE_MESSAGE: 'unavail',
}));
jest.unstable_mockModule('../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: {},
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
  logWorkspace: jest.fn(),
}));

const { default: chatbotController } = await import('../chatbot.controller.js');

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe('chatbot.controller getCustomChatbotDocuments ownership', () => {
  beforeEach(() => {
    findChatbotById.mockReset();
    getCustomChatbotDocuments.mockReset();
  });

  it('returns 404 when chatbot belongs to another user', async () => {
    findChatbotById.mockResolvedValue(null);
    const req = { params: { chatbotId: '5' }, user: { id: 99 } };
    const res = makeRes();

    await chatbotController.getCustomChatbotDocuments(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(getCustomChatbotDocuments).not.toHaveBeenCalled();
  });

  it('returns documents when caller owns the chatbot', async () => {
    findChatbotById.mockResolvedValue({ id: 5, id_user: 42 });
    getCustomChatbotDocuments.mockResolvedValue([{ title: 'a.pdf', chunk_count: 2 }]);
    const req = { params: { chatbotId: '5' }, user: { id: 42 } };
    const res = makeRes();

    await chatbotController.getCustomChatbotDocuments(req, res);

    expect(findChatbotById).toHaveBeenCalledWith(5, 42);
    expect(getCustomChatbotDocuments).toHaveBeenCalledWith(5, 42);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      documents: [{ title: 'a.pdf', chunk_count: 2 }],
    });
  });

  // node-pg trả BIGINT dưới dạng CHUỖI (đã kiểm trên DB thật: id_user = "3").
  // Mock bằng số sẽ xanh giả — so sánh `!==` giữa "42" và 42 khiến chính chủ bị 404.
  it('nhận diện đúng chủ sở hữu khi id_user là chuỗi (kiểu pg trả thật)', async () => {
    findChatbotById.mockResolvedValue({ id: '5', id_user: '42' });
    getCustomChatbotDocuments.mockResolvedValue([{ title: 'a.pdf', chunk_count: 2 }]);
    const req = { params: { chatbotId: '5' }, user: { id: 42 } };
    const res = makeRes();

    await chatbotController.getCustomChatbotDocuments(req, res);

    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(getCustomChatbotDocuments).toHaveBeenCalledWith(5, 42);
  });

  it('vẫn chặn người khác khi id_user là chuỗi', async () => {
    findChatbotById.mockResolvedValue(null);
    const req = { params: { chatbotId: '5' }, user: { id: 99 } };
    const res = makeRes();

    await chatbotController.getCustomChatbotDocuments(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(getCustomChatbotDocuments).not.toHaveBeenCalled();
  });
});
