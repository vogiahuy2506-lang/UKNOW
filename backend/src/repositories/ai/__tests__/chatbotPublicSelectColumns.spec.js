import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: chatbotRepository } = await import('../chatbot.repository.js');

describe('chatbot.repository — cot AI/giao dien cong khai phai duoc SELECT (S3)', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it('findChatbotById SELECT response_style (kenh OA/Facebook/WhatsApp Cloud + /chat/:id doc tu day)', async () => {
    await chatbotRepository.findChatbotById(12);
    expect(query.mock.calls[0][0]).toMatch(/\bresponse_style\b/);
    expect(query.mock.calls[0][0]).toMatch(/\bborder_radius\b/);
  });

  it('findChatbotByWidgetKey SELECT response_style va border_radius', async () => {
    await chatbotRepository.findChatbotByWidgetKey('wk_abc');
    expect(query.mock.calls[0][0]).toMatch(/\bresponse_style\b/);
    expect(query.mock.calls[0][0]).toMatch(/\bborder_radius\b/);
  });
});
