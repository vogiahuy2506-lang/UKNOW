import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockRepo = {
  listDigestRecipients: jest.fn(),
  insertDigestLog: jest.fn(),
  deleteDigestLog: jest.fn(),
  getDigestStats: jest.fn(),
  getOwnerDigestFrequency: jest.fn(),
  setOwnerDigestFrequency: jest.fn(),
};

const mockSendSystemEmail = jest.fn();

jest.unstable_mockModule(
  '../../../repositories/chatbot/chatbotDigest.repository.js',
  () => ({
    default: mockRepo,
  })
);

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  SENDER_NAME: 'Founder AI',
}));

const { default: chatbotDigestService, buildDigestEmailHtml } = await import(
  '../chatbotDigest.service.js'
);

describe('chatbotDigest.service — sendDigests', () => {
  const fixedNow = new Date('2026-09-14T08:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.listDigestRecipients.mockResolvedValue([]);
    mockRepo.getDigestStats.mockResolvedValue({
      conversations: 10,
      visitorMessages: 25,
      aiReplies: 20,
      humanReplies: 5,
      byChannel: [
        {
          channel: 'web',
          channelLabel: 'Website',
          conversations: 6,
          visitorMessages: 15,
          aiReplies: 12,
          humanReplies: 3,
        },
      ],
      topConversations: [
        {
          source: 'web',
          conversationType: 'web',
          conversationId: '101',
          visitorName: 'Khách A',
          channel: 'web',
          visitorMessages: 5,
        },
      ],
      stalePaused: 0,
      contactsLeft: 2,
      contactsOpen: 1,
    });
    mockRepo.insertDigestLog.mockResolvedValue({ id: 1 });
    mockRepo.deleteDigestLog.mockResolvedValue();
    mockSendSystemEmail.mockResolvedValue({ messageId: 'msg-test' });
  });

  it('recipients 2 → gửi 2 thư thành công', async () => {
    mockRepo.listDigestRecipients.mockResolvedValue([
      { id: 1, email: 'user1@example.com', full_name: 'User 1', chatbot_digest_frequency: 'weekly' },
      { id: 2, email: 'user2@example.com', full_name: 'User 2', chatbot_digest_frequency: 'weekly' },
    ]);

    const result = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: fixedNow,
    });

    expect(result.recipients).toBe(2);
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.synced).toBe(2);
    expect(result.periodKey).toBe('2026-W37');

    expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);
    expect(mockSendSystemEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'user1@example.com',
        subject: expect.stringContaining('Tổng hợp chatbot'),
      })
    );
    expect(mockSendSystemEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: 'user2@example.com',
        subject: expect.stringContaining('Tổng hợp chatbot'),
      })
    );
  });

  it('log đã có (insert trả null) → skip không gửi email trùng', async () => {
    mockRepo.listDigestRecipients.mockResolvedValue([
      { id: 1, email: 'user1@example.com', full_name: 'User 1', chatbot_digest_frequency: 'weekly' },
    ]);
    mockRepo.insertDigestLog.mockResolvedValue(null); // Trùng ON CONFLICT

    const result = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: fixedNow,
    });

    expect(result.recipients).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
  });

  it('sendMail ném lỗi → failed tăng và deleteDigestLog được gọi để dọn log', async () => {
    mockRepo.listDigestRecipients.mockResolvedValue([
      { id: 1, email: 'user1@example.com', full_name: 'User 1', chatbot_digest_frequency: 'weekly' },
    ]);
    mockSendSystemEmail.mockRejectedValue(new Error('SMTP Connection Timeout'));

    const result = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: fixedNow,
    });

    expect(result.recipients).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(1);

    expect(mockRepo.deleteDigestLog).toHaveBeenCalledTimes(1);
    expect(mockRepo.deleteDigestLog).toHaveBeenCalledWith(1, '2026-W37');
  });

  it('user có frequency "none" không nằm trong recipients → kết quả 0', async () => {
    // Khi frequency là 'none', listDigestRecipients sẽ trả [] (vì chỉ query weekly hoặc monthly)
    mockRepo.listDigestRecipients.mockResolvedValue([]);

    const result = await chatbotDigestService.sendDigests({
      frequency: 'weekly',
      now: fixedNow,
    });

    expect(result.recipients).toBe(0);
    expect(result.sent).toBe(0);
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
  });

  it('buildDigestEmailHtml format đầy đủ số liệu, escape HTML và cảnh báo stalePaused', () => {
    const html = buildDigestEmailHtml({
      userFullName: 'Tester <script>',
      stats: {
        conversations: 12,
        visitorMessages: 34,
        aiReplies: 30,
        humanReplies: 4,
        byChannel: [
          {
            channel: 'web',
            channelLabel: 'Website',
            conversations: 12,
            visitorMessages: 34,
            aiReplies: 30,
            humanReplies: 4,
          },
        ],
        topConversations: [
          {
            source: 'web',
            conversationType: 'web',
            conversationId: '456',
            visitorName: 'Khách <VIP>',
            channel: 'web',
            visitorMessages: 10,
          },
        ],
        stalePaused: 3,
        contactsLeft: 5,
        contactsOpen: 2,
      },
      range: { label: 'Tuần 37 (07/09–13/09)', periodKey: '2026-W37' },
      frequency: 'weekly',
    });

    expect(html).toContain('Tester &lt;script&gt;');
    expect(html).toContain('12');
    expect(html).toContain('34');
    expect(html).toContain('30');
    expect(html).toContain('Khách &lt;VIP&gt;');
    expect(html).toContain('<strong>3</strong> cuộc hội thoại đang tạm dừng AI');
    expect(html).toContain('Khách để lại liên hệ: <strong>5</strong>');
  });
});
