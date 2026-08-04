import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: chatbotRepository } = await import('../chatbot.repository.js');

describe('chatbot.repository resolveWidgetForChatbot + getOrCreate race', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('finds existing widget by chatbot.widget_key without using id_sub_assistant', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, widget_key: 'wk_abc', is_active: true }],
    });

    const widget = await chatbotRepository.resolveWidgetForChatbot(
      { id: 12, id_user: 7, widget_key: 'wk_abc' },
      { create: true }
    );

    expect(widget.widget_key).toBe('wk_abc');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['wk_abc']);
  });

  it('falls back to chatbot_<id> when widget_key missing', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 2, widget_key: 'chatbot_12' }],
      });

    const widget = await chatbotRepository.resolveWidgetForChatbot(
      { id: 12, id_user: 7, name: 'Bot' },
      { create: true }
    );

    expect(widget.widget_key).toBe('chatbot_12');
    expect(query.mock.calls[0][1]).toEqual(['chatbot_12']);
  });

  it('on UNIQUE conflict during create, re-reads by key', async () => {
    const conflict = Object.assign(new Error('duplicate'), { code: '23505' });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({
        rows: [{ id: 3, widget_key: 'wk_abc' }],
      });

    const widget = await chatbotRepository.resolveWidgetForChatbot(
      { id: 12, id_user: 7, widget_key: 'wk_abc' },
      { create: true }
    );

    expect(widget.id).toBe(3);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('getOrCreateWebChatConversation re-selects after 23505 race', async () => {
    const conflict = Object.assign(new Error('duplicate'), { code: '23505' });
    query
      .mockResolvedValueOnce({ rows: [] }) // select miss
      .mockRejectedValueOnce(conflict) // insert race
      .mockResolvedValueOnce({
        rows: [{ id: 99, session_id: 'sess_1', id_widget_config: 1, status: 'active' }],
      });

    const conv = await chatbotRepository.getOrCreateWebChatConversation({
      widgetConfigId: 1,
      userId: 7,
      sessionId: 'sess_1',
    });

    expect(conv.id).toBe(99);
    expect(query).toHaveBeenCalledTimes(3);
  });
});
