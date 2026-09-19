import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockRepo = {
  getCursor: jest.fn(),
  setCursor: jest.fn(),
  getMaxMessageId: jest.fn(),
  fetchVisitorMessagesAfter: jest.fn(),
  hasAgentReplySince: jest.fn(),
  getOwnerContact: jest.fn(),
  upsertContact: jest.fn(),
  listPendingGroupedByUser: jest.fn(),
  lastNotifiedAtForConversation: jest.fn(),
  markNotified: jest.fn(),
};

const mockSendSystemEmail = jest.fn();

jest.unstable_mockModule(
  '../../../repositories/chatbot/chatbotContactAlert.repository.js',
  () => ({
    default: mockRepo,
  })
);

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  SENDER_NAME: 'UKNOW Campaign',
}));

const { default: chatbotContactAlertService, getFrontendInboxUrl } = await import(
  '../chatbotContactAlert.service.js'
);

describe('chatbotContactAlert.service — scanAndNotify', () => {
  const fixedNow = new Date('2026-09-14T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getCursor.mockResolvedValue(0);
    mockRepo.setCursor.mockResolvedValue();
    mockRepo.getMaxMessageId.mockResolvedValue(0);
    mockRepo.fetchVisitorMessagesAfter.mockResolvedValue([]);
    mockRepo.hasAgentReplySince.mockResolvedValue(false);
    mockRepo.getOwnerContact.mockResolvedValue({
      id: 1,
      email: 'owner@uknow.vn',
      phone: '0901234567',
    });
    mockRepo.upsertContact.mockResolvedValue({});
    mockRepo.listPendingGroupedByUser.mockResolvedValue([]);
    mockRepo.lastNotifiedAtForConversation.mockResolvedValue(null);
    mockRepo.markNotified.mockResolvedValue();
    mockSendSystemEmail.mockResolvedValue({ messageId: 'msg-123' });
  });

  it('bỏ qua tin nhắn không chứa số điện thoại hoặc email', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 101,
            id_user: 1,
            id_conversation: 50,
            content: 'Xin chào shop, shop có mở cửa chủ nhật không?',
            created_at: fixedNow,
            visitor_name: 'Khách 1',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.scanned).toBe(1);
    expect(res.detected).toBe(0);
    expect(mockRepo.upsertContact).not.toHaveBeenCalled();
    expect(mockRepo.setCursor).toHaveBeenCalledWith('web', 101);
  });

  it('nhận diện số của chính chủ shop và đánh dấu suppressedReason = owner_own_contact', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 102,
            id_user: 1,
            id_conversation: 50,
            content: 'Hotline của shop là 0901 234 567 đúng không?',
            created_at: fixedNow,
            visitor_name: 'Khách Hỏi',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.detected).toBe(1);
    expect(res.suppressed).toBe(1);
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        idUser: 1,
        contactType: 'phone',
        contactValue: '0901234567',
        pendingNotify: false,
        suppressedReason: 'owner_own_contact',
      })
    );
  });

  it('nhận diện email của chính chủ shop và đánh dấu suppressedReason = owner_own_contact', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 103,
            id_user: 1,
            id_conversation: 50,
            content: 'Gửi về owner@uknow.vn nha',
            created_at: fixedNow,
            visitor_name: 'Khách',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.detected).toBe(1);
    expect(res.suppressed).toBe(1);
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        idUser: 1,
        contactType: 'email',
        contactValue: 'owner@uknow.vn',
        pendingNotify: false,
        suppressedReason: 'owner_own_contact',
      })
    );
  });

  it('khi có nhân viên (role = agent) trả lời trong 120 phút thì đánh dấu suppressedReason = human_active', async () => {
    mockRepo.hasAgentReplySince.mockResolvedValue(true);
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 104,
            id_user: 1,
            id_conversation: 55,
            content: 'SĐT em là 0987654321',
            created_at: fixedNow,
            visitor_name: 'Khách Chat Với NV',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.detected).toBe(1);
    expect(res.suppressed).toBe(1);
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        idUser: 1,
        contactType: 'phone',
        contactValue: '0987654321',
        pendingNotify: false,
        suppressedReason: 'human_active',
      })
    );
  });

  it('gửi 1 email thông báo khi có liên hệ hợp lệ từ khách', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 105,
            id_user: 1,
            id_conversation: 60,
            content: 'Tư vấn cho mình qua 0988776655 nhé',
            created_at: fixedNow,
            visitor_name: 'Nguyễn Văn Khách',
          },
        ];
      }
      return [];
    });

    mockRepo.listPendingGroupedByUser.mockResolvedValue([
      {
        id: 1,
        id_user: 1,
        user_email: 'owner@uknow.vn',
        user_full_name: 'Chủ Shop UKNOW',
        contact_type: 'phone',
        contact_value: '0988776655',
        last_source: 'web',
        last_conversation_id: 60,
        last_seen_at: fixedNow,
        last_excerpt: 'Tư vấn cho mình qua 0988776655 nhé',
        visitor_name: 'Nguyễn Văn Khách',
      },
    ]);

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.notified).toBe(1);
    expect(res.emails.sent).toBe(1);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSystemEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@uknow.vn',
        subject: '[UKNOW Campaign] 1 khách để lại liên hệ trong chatbot',
      })
    );
    expect(mockRepo.markNotified).toHaveBeenCalledWith([1], fixedNow);
  });

  it('cooldown 30 phút theo hội thoại: nếu hội thoại có thư cách đây 10 phút thì giữ lại chưa gửi', async () => {
    // Thư trước gửi lúc 10 phút trước
    const tenMinutesAgo = new Date(fixedNow.getTime() - 10 * 60 * 1000);
    mockRepo.lastNotifiedAtForConversation.mockResolvedValue(tenMinutesAgo);

    mockRepo.listPendingGroupedByUser.mockResolvedValue([
      {
        id: 2,
        id_user: 1,
        user_email: 'owner@uknow.vn',
        user_full_name: 'Chủ Shop',
        contact_type: 'email',
        contact_value: 'khachmoi@example.com',
        last_source: 'web',
        last_conversation_id: 60,
        last_seen_at: fixedNow,
      },
    ]);

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.notified).toBe(0);
    expect(res.emails.sent).toBe(0);
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
    expect(mockRepo.markNotified).not.toHaveBeenCalled();
  });

  it('cooldown 30 phút theo hội thoại: nếu thư trước đã gửi 40 phút trước thì gửi thư mới', async () => {
    // Thư trước gửi lúc 40 phút trước
    const fortyMinutesAgo = new Date(fixedNow.getTime() - 40 * 60 * 1000);
    mockRepo.lastNotifiedAtForConversation.mockResolvedValue(fortyMinutesAgo);

    mockRepo.listPendingGroupedByUser.mockResolvedValue([
      {
        id: 3,
        id_user: 1,
        user_email: 'owner@uknow.vn',
        user_full_name: 'Chủ Shop',
        contact_type: 'email',
        contact_value: 'khachmoi@example.com',
        last_source: 'web',
        last_conversation_id: 60,
        last_seen_at: fixedNow,
      },
    ]);

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.notified).toBe(1);
    expect(res.emails.sent).toBe(1);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    expect(mockRepo.markNotified).toHaveBeenCalledWith([3], fixedNow);
  });

  it('nhiều khách trong cùng lượt quét gom vào 1 thư duy nhất cho chủ shop', async () => {
    mockRepo.listPendingGroupedByUser.mockResolvedValue([
      {
        id: 10,
        id_user: 1,
        user_email: 'owner@uknow.vn',
        contact_type: 'phone',
        contact_value: '0911223344',
        last_source: 'web',
        last_conversation_id: 1,
        visitor_name: 'Khách A',
      },
      {
        id: 11,
        id_user: 1,
        user_email: 'owner@uknow.vn',
        contact_type: 'email',
        contact_value: 'khachb@example.com',
        last_source: 'channel',
        channel: 'zalo_oa',
        display_name: 'OA Shop',
        last_conversation_id: 2,
        visitor_name: 'Khách B',
      },
    ]);

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.notified).toBe(2);
    expect(res.emails.sent).toBe(1);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSystemEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@uknow.vn',
        subject: '[UKNOW Campaign] 2 khách để lại liên hệ trong chatbot',
      })
    );
    expect(mockRepo.markNotified).toHaveBeenCalledWith([10, 11], fixedNow);
  });

  it('khi sendSystemEmail ném lỗi thì không markNotified để lần sau gửi lại', async () => {
    mockRepo.listPendingGroupedByUser.mockResolvedValue([
      {
        id: 20,
        id_user: 1,
        user_email: 'owner@uknow.vn',
        contact_type: 'phone',
        contact_value: '0988776655',
        last_source: 'web',
        last_conversation_id: 70,
      },
    ]);

    mockSendSystemEmail.mockRejectedValueOnce(new Error('SMTP connection timed out'));

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.notified).toBe(0);
    expect(res.emails.sent).toBe(0);
    expect(res.emails.failed).toBe(1);
    expect(mockRepo.markNotified).not.toHaveBeenCalled();
  });

  it('lần đầu chạy khi cursor null: khởi tạo cursor = maxId và không quét tin', async () => {
    mockRepo.getCursor.mockResolvedValue(null);
    mockRepo.getMaxMessageId.mockResolvedValue(555);

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(mockRepo.getMaxMessageId).toHaveBeenCalledWith('web');
    expect(mockRepo.setCursor).toHaveBeenCalledWith('web', 555);
    expect(res.scanned).toBe(0);
    expect(res.initializedSources).toEqual(['web', 'channel', 'zalo_personal']);
    expect(mockRepo.fetchVisitorMessagesAfter).not.toHaveBeenCalled();
  });

  it('thư Zalo OA phải chứa "Zalo OA" chứ không phải "Kênh"', async () => {
    mockRepo.listPendingGroupedByUser.mockResolvedValue([
      {
        id: 30,
        id_user: 1,
        user_email: 'owner@uknow.vn',
        contact_type: 'phone',
        contact_value: '0912345678',
        last_source: 'channel',
        channel: 'zalo_oa',
        display_name: 'Cửa hàng chính hãng',
        last_conversation_id: 88,
        visitor_name: 'Khách Zalo',
      },
    ]);

    await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    const mailCall = mockSendSystemEmail.mock.calls[0][0];
    expect(mailCall.html).toContain('Zalo OA Cửa hàng chính hãng');
    expect(mailCall.html).not.toContain('Kênh Cửa hàng chính hãng');
  });

  it('ca (a) service: khi có agent trả lời (human_active) thì gọi upsertContact với pendingNotify = false', async () => {
    mockRepo.hasAgentReplySince.mockResolvedValue(true);
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 201,
            id_user: 1,
            id_conversation: 50,
            content: 'SĐT em là 0912345678',
            created_at: fixedNow,
            visitor_name: 'Khách',
          },
        ];
      }
      return [];
    });

    await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingNotify: false,
        suppressedReason: 'human_active',
      })
    );
  });

  it('ca (b) service: 3 giờ sau khách nhắn lại không có agent thì gọi upsertContact với pendingNotify = true và suppressedReason = null', async () => {
    mockRepo.hasAgentReplySince.mockResolvedValue(false);
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 202,
            id_user: 1,
            id_conversation: 50,
            content: 'SĐT em là 0912345678',
            created_at: fixedNow,
            visitor_name: 'Khách',
          },
        ];
      }
      return [];
    });

    await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingNotify: true,
        suppressedReason: null,
      })
    );
  });

  it('chủ shop tắt nhận email alert thì suppressedReason = owner_opted_out và pendingNotify = false', async () => {
    mockRepo.getOwnerContact.mockResolvedValue({
      id: 1,
      email: 'owner@uknow.vn',
      phone: '0901234567',
      chatbot_contact_alert_email: false,
    });
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 301,
            id_user: 1,
            id_conversation: 50,
            content: 'Liên hệ lại qua SĐT 0988776655 nha',
            created_at: fixedNow,
            visitor_name: 'Khách Tắt Thư',
          },
        ];
      }
      return [];
    });

    await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingNotify: false,
        suppressedReason: 'owner_opted_out',
      })
    );
  });

  const REAL_SIM_SPAM_FIXTURE = `💐 💐 List sim đầu số 0979
⚡ 0979.891.896 =5tr0
⚡ 0979.888.255 =5tr0
⚡ 0979.096.296 =1tr8
⚡ 0979.678.858 =6tr0
⚡ 0979.855.998 =5tr0
⚡ 0979.388.138 =5tr0
⚡ 0979.581.699 =5tr0
⚡ 0979.8338.98 =8tr0
⚡ 0979.898.633 =3tr0
⚡ 0979.263.293 =3tr0
⚡ 0979.028.128 =8tr0
⚡ 0979.183.389 =5tr0
⚡ 0979.345.778 =5tr0
⚡ 0979.903.168 =4tr0
⚡ 0979.25.6839 =5tr5
⚡ 0979.255.639 =3tr5
⚡ 0979.310.368 =4tr5
⚡ 0979.51.6899 =6tr0
⚡ 0979.51.0299 =3tr0
⚡ 0979.212.588 =7tr5
⚡ 0979.131.599 =7tr0
⚡ 09.79.59.69.29 =5tr5
⚡ 0979.39.59.29 =5tr0
⚡ 0979.610.368 =5tr0`;

  it('bảng rao sim thật của hội thoại 14221 (≥20 số): bỏ cả tin, 0 cảnh báo', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'zalo_personal') {
        return [
          {
            id: 401,
            id_user: 133,
            id_conversation: 14221,
            content: REAL_SIM_SPAM_FIXTURE,
            created_at: fixedNow,
            visitor_name: 'Spammer Sim',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.scanned).toBe(1);
    expect(res.detected).toBe(0);
    expect(mockRepo.upsertContact).not.toHaveBeenCalled();
    expect(mockRepo.setCursor).toHaveBeenCalledWith('zalo_personal', 401);
  });

  it('đúng 3 số trong một tin: chạm ngưỡng MAX_CONTACTS_PER_MESSAGE -> 0 cảnh báo, bỏ cả tin', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 402,
            id_user: 1,
            id_conversation: 50,
            content: 'Liên hệ qua: 0912345678, 0987654321 hoặc 0901234567 nhé',
            created_at: fixedNow,
            visitor_name: 'Khách 3 Số',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.scanned).toBe(1);
    expect(res.detected).toBe(0);
    expect(mockRepo.upsertContact).not.toHaveBeenCalled();
  });

  it('tin có 1 số: tạo 1 cảnh báo (không đổi)', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 403,
            id_user: 1,
            id_conversation: 50,
            content: 'Số em là 0912345678 nhé',
            created_at: fixedNow,
            visitor_name: 'Khách 1 Số',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.detected).toBe(1);
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contactType: 'phone',
        contactValue: '0912345678',
      })
    );
  });

  it('tin có 2 liên hệ (SĐT + email): tạo 2 cảnh báo (không đổi)', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 404,
            id_user: 1,
            id_conversation: 50,
            content: 'SĐT 0912345678, mail em a@b.com',
            created_at: fixedNow,
            visitor_name: 'Khách 2 Liên Hệ',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.detected).toBe(2);
    expect(mockRepo.upsertContact).toHaveBeenCalledTimes(2);
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contactType: 'phone',
        contactValue: '0912345678',
      })
    );
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contactType: 'email',
        contactValue: 'a@b.com',
      })
    );
  });

  it('content là JSON object hợp lệ có số bên trong: bỏ qua tin, 0 cảnh báo', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'channel') {
        return [
          {
            id: 405,
            id_user: 1,
            id_conversation: 50,
            content: JSON.stringify({
              title: 'Thông báo khai giảng',
              hotline: '0912345678',
              description: 'Chi tiết liên hệ hotline 0912345678',
            }),
            created_at: fixedNow,
            visitor_name: 'Hệ Thống',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.scanned).toBe(1);
    expect(res.detected).toBe(0);
    expect(mockRepo.upsertContact).not.toHaveBeenCalled();
  });

  it('content là JSON array hợp lệ có số bên trong: bỏ qua tin, 0 cảnh báo', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'channel') {
        return [
          {
            id: 406,
            id_user: 1,
            id_conversation: 50,
            content: '  [{"title":"Sự kiện","phone":"0912345678"}]  ',
            created_at: fixedNow,
            visitor_name: 'Hệ Thống',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.scanned).toBe(1);
    expect(res.detected).toBe(0);
    expect(mockRepo.upsertContact).not.toHaveBeenCalled();
  });

  it('content bắt đầu bằng { nhưng không parse được (người thật gõ), có số thật: vẫn tạo cảnh báo', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 407,
            id_user: 1,
            id_conversation: 50,
            content: '{ xin chào shop, số điện thoại của tôi là 0912345678 nhé',
            created_at: fixedNow,
            visitor_name: 'Khách Gõ Ngoặc',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.scanned).toBe(1);
    expect(res.detected).toBe(1);
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contactType: 'phone',
        contactValue: '0912345678',
      })
    );
  });

  it('content bắt đầu bằng [ nhưng không parse được, có số thật: vẫn tạo cảnh báo', async () => {
    mockRepo.fetchVisitorMessagesAfter.mockImplementation(async (source) => {
      if (source === 'web') {
        return [
          {
            id: 408,
            id_user: 1,
            id_conversation: 50,
            content: '[ sđt 0912345678 ]',
            created_at: fixedNow,
            visitor_name: 'Khách Gõ Vuông',
          },
        ];
      }
      return [];
    });

    const res = await chatbotContactAlertService.scanAndNotify({ now: fixedNow });

    expect(res.scanned).toBe(1);
    expect(res.detected).toBe(1);
    expect(mockRepo.upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contactType: 'phone',
        contactValue: '0912345678',
      })
    );
  });
});

describe('chatbotContactAlert.service — getFrontendInboxUrl', () => {
  const origEnv = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.uknow.vn';
  });

  afterEach(() => {
    if (origEnv) {
      process.env.FRONTEND_URL = origEnv;
    } else {
      delete process.env.FRONTEND_URL;
    }
  });

  it('trả về link chung nếu không có conversationId', () => {
    expect(getFrontendInboxUrl()).toBe('https://app.uknow.vn/app/settings/inbox');
    expect(getFrontendInboxUrl({})).toBe('https://app.uknow.vn/app/settings/inbox');
  });

  it('map web -> webchat', () => {
    const url = getFrontendInboxUrl({ source: 'web', conversationId: '42' });
    expect(url).toBe('https://app.uknow.vn/app/settings/inbox?conversation=42&type=webchat');
  });

  it('map channel -> channel', () => {
    const url = getFrontendInboxUrl({ source: 'channel', conversationId: 'conv_123' });
    expect(url).toBe('https://app.uknow.vn/app/settings/inbox?conversation=conv_123&type=channel');
  });

  it('map zalo_personal -> zalo_personal', () => {
    const url = getFrontendInboxUrl({ source: 'zalo_personal', conversationId: 'thread_456' });
    expect(url).toBe('https://app.uknow.vn/app/settings/inbox?conversation=thread_456&type=zalo_personal');
  });
});

