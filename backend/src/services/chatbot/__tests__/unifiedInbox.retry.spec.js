import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetConversationById = jest.fn();
const mockWithTransaction = jest.fn();
const mockInsertZalo = jest.fn();
const mockSendMessage = jest.fn();
const mockSetAiPaused = jest.fn();
const mockUpdateSendStatus = jest.fn();
const mockClaimRetry = jest.fn();
const mockFindForRetry = jest.fn();
const mockDebit = jest.fn();
const mockResolveBilling = jest.fn();
const mockSendReply = jest.fn();
const mockBindChannelMessageExternalId = jest.fn().mockResolvedValue(undefined);
const mockGetMessages = jest.fn();
const mockMarkAsRead = jest.fn();
const mockDeleteZaloConversation = jest.fn();

const mockFindReservationById = jest.fn().mockResolvedValue(null);
const mockReserveSendQuota = jest.fn().mockResolvedValue({ mode: 'off', status: 'reserved', id: 99 });
const mockMarkSendQuotaSending = jest.fn().mockResolvedValue();
const mockConsumeSendQuota = jest.fn().mockResolvedValue();
const mockReleaseSendQuota = jest.fn().mockResolvedValue();
const mockMarkSendQuotaUncertain = jest.fn().mockResolvedValue();

jest.unstable_mockModule('../../../repositories/sendQuota.repository.js', () => ({
  findReservationById: mockFindReservationById,
  acquireWorkspaceQuotaLock: jest.fn(),
  createReservation: jest.fn(),
  findReservationByKey: jest.fn(),
  transitionReservationState: jest.fn(),
  validateReservationKey: jest.fn(),
  validateProviderReference: jest.fn(),
  validateFailureCode: jest.fn(),
  countEmailSentTodayWithLedger: jest.fn(),
  countZaloSentTodayWithLedger: jest.fn(),
  countEmailSentInCycleWithLedger: jest.fn(),
  countZaloSentInCycleWithLedger: jest.fn(),
  countCombinedSentInCycleWithLedger: jest.fn(),
  countEmployeeSentTodayWithLedger: jest.fn(),
  countEmployeeSentInCycleWithLedger: jest.fn(),
  getWorkspacePlanLimits: jest.fn(),
  getEmployeeSendLimits: jest.fn(),
  getWalletAvailableBalance: jest.fn(),
  VALID_RESERVATION_TRANSITIONS: {
    reserved: ['sending', 'released'],
    sending: ['consumed', 'released', 'uncertain'],
    uncertain: ['consumed', 'released'],
    released: ['reserved'],
    consumed: [],
  },
  METERED_RESERVATION_STATUSES: ['reserved', 'sending', 'uncertain', 'consumed'],
  WALLET_HOLD_STATUSES: ['reserved', 'sending', 'uncertain'],
  ALLOWED_RESPONSE_SNAPSHOT_FIELDS: new Set(['messageId', 'status', 'error']),
  ALLOWED_TRACKING_FIELDS: new Set(['messageId']),
}));

jest.unstable_mockModule('../../../services/quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  markSendQuotaSending: mockMarkSendQuotaSending,
  consumeSendQuota: mockConsumeSendQuota,
  releaseSendQuota: mockReleaseSendQuota,
  markSendQuotaUncertain: mockMarkSendQuotaUncertain,
  findReservationById: mockFindReservationById,
  getReservationStatus: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: {
    getConversationById: mockGetConversationById,
    withTransaction: mockWithTransaction,
    insertZaloPersonalAgentMessage: mockInsertZalo,
    sendMessage: mockSendMessage,
    setAiPaused: mockSetAiPaused,
    updateMessageSendStatus: mockUpdateSendStatus,
    claimMessageForRetry: mockClaimRetry,
    findAgentMessageForRetry: mockFindForRetry,
    updateMessageQuotaReservationId: jest.fn().mockResolvedValue(undefined),
    bindZaloPersonalOutboundMsgIds: jest.fn().mockResolvedValue(undefined),
    bindChannelMessageExternalId: mockBindChannelMessageExternalId,
    getAllSettingsForUser: jest.fn(),
    getMessages: mockGetMessages,
    markAsRead: mockMarkAsRead,
  },
}));

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({
  default: {
    getAllSettingsForUser: jest.fn().mockResolvedValue([]),
    getSettings: jest.fn().mockResolvedValue({ is_enabled: true }),
  },
}));

// Production gọi registerAccountListener() (không phải ensureRegistered) sau khi gửi
// Zalo Personal thành công — thiếu mock đúng tên khiến mọi test đều rơi vào catch im
// lặng (chỉ console.warn), không test nào thật sự exercise được đường này.
const mockRegisterAccountListener = jest.fn().mockResolvedValue(true);
jest.unstable_mockModule('../zaloInbox.service.js', () => ({
  default: {
    ensureRegistered: jest.fn().mockResolvedValue(true),
    registerAccountListener: mockRegisterAccountListener,
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true, billingUserId: 1 }),
  recordDirectSendUsage: jest.fn().mockResolvedValue(),
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({
    vnDayStart: new Date(),
    vnDayEnd: new Date(Date.now() + 86400000),
    vnNow: new Date(),
  })),
  nextVnMidnight: jest.fn(() => new Date(Date.now() + 86400000)),
  nextVnMonthStart: jest.fn(() => new Date(Date.now() + 30 * 86400000)),
}));

jest.unstable_mockModule('../../sse.service.js', () => ({
  default: { broadcast: jest.fn() },
}));

jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  EFFECTIVE_PLAN_ID_SQL: 'u.active_plan_id',
  resolveBillingUserId: mockResolveBilling,
  getBillingCycle: jest.fn(() => ({
    cycleStart: new Date(),
    cycleEnd: new Date(Date.now() + 30 * 86400000),
    type: 'monthly',
  })),
}));

const mockDebitInbox = jest.fn();
jest.unstable_mockModule('../../payment/topupWallet.service.js', () => ({
  debitZaloPersonalInboxIfNeeded: mockDebit,
  debitInboxChannelMessageIfNeeded: mockDebitInbox,
  maybeDebitWalletForSend: jest.fn(),
  getWalletSnapshot: jest.fn().mockResolvedValue({ balance: 100, isUnlimited: false }),
  WALLET_ITEM_BY_CHANNEL: { zalo: 'zalo_quota', email: 'email_quota' },
}));

jest.unstable_mockModule('../channelAdapters/zaloOA.adapter.js', () => ({
  default: { sendReply: mockSendReply },
}));

jest.unstable_mockModule('../channelAdapters/facebook.adapter.js', () => ({
  default: { sendReply: mockSendReply },
}));

jest.unstable_mockModule('../channelAdapters/zaloPersonal.adapter.js', () => ({
  default: { sendReply: mockSendReply, deleteConversation: mockDeleteZaloConversation },
}));

// WhatsApp QR (Baileys): adapter Hộp thư THẬT chạy, chỉ giả tra session key + adapter gửi chatbot.
const mockWaSendReply = jest.fn();
const mockGetBaileysSessionKey = jest.fn();
jest.unstable_mockModule('../channelAdapters/whatsapp.adapter.js', () => ({
  default: { sendReply: mockWaSendReply },
}));
jest.unstable_mockModule('../../../repositories/ai/channelConnections.repository.js', () => ({
  default: { getBaileysSessionKey: mockGetBaileysSessionKey },
}));

// Telegram (P1 PLAN_TG_WA_DAY_DU): adapter Hộp thư giả ở đây (ca gửi thật với gateway ở
// channelAdapters/__tests__/telegramInbox.adapter.spec.js) — spec này kiểm phần Hộp thư: chọn adapter theo
// kênh, truyền đúng tham số, ghi id tin Telegram vào dòng agent (khử echo).
const mockTelegramInboxSend = jest.fn();
// Review 30/09 (CI đỏ e0f7629e/1596841c): P5 gọi chatAttachmentService.promoteChatAttachments và P6 gọi
// topupLockGate.whatsappSessionIsLocked trong đường trả lời tay — cả hai chạm CSDL thật; máy dev có CSDL nên xanh,
// CI không có → pool retry 6 lần → timeout 5s. Giả lập ở ranh giới (tái hiện: DB_HOST=127.0.0.1 DB_PORT=5999).
jest.unstable_mockModule('../chatAttachment.service.js', () => ({
  default: {
    promoteChatAttachments: jest.fn().mockResolvedValue(undefined),
    presentAttachmentsForClient: jest.fn((raw) => (Array.isArray(raw) ? raw : [])),
  },
}));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'Tài khoản đang bị khoá do vượt hạn mức gói',
  resourceIsLocked: jest.fn().mockResolvedValue(false),
  whatsappSessionIsLocked: jest.fn().mockResolvedValue(false),
  lockedChannelAccountRefs: jest.fn().mockResolvedValue([]),
  getLandingLockBySlug: jest.fn().mockResolvedValue(null),
  pausedLandingHtml: jest.fn(() => ''),
}));
jest.unstable_mockModule('../channelAdapters/telegramInbox.adapter.js', () => ({
  default: { sendReply: mockTelegramInboxSend },
}));

// sendMessage nay goi buildAiPausePayload -> getCachedAutoResumeMinutes (db.query that).
// Mock de unit test khong cham DB (tranh reject tre gay "Cannot log after tests are done" tren CI).
jest.unstable_mockModule('../../../utils/aiHandoffResume.util.js', () => ({
  getCachedAutoResumeMinutes: jest.fn(async () => null),
  computeAiResumeAt: jest.fn(() => null),
  normalizeAiPausedAt: jest.fn((value) => (value == null || value === '' ? null : value)),
  buildAiPausePayload: jest.fn(async ({ aiPaused, aiPausedAt }) => ({
    aiPaused: aiPaused === true,
    aiPausedAt: aiPaused === true ? (aiPausedAt ?? null) : null,
    aiResumeAt: null,
  })),
}));

const unifiedInboxService = (await import('../unifiedInbox.service.js')).default;

// G2: phạm vi tài khoản Zalo của người thao tác. Các ca gốc của file này đều là CHỦ → null = thấy hết. Ca nhân viên /
// thiếu phạm vi nằm ở describe 'G2 — việc giao tài khoản Zalo' cuối file.
const ZALO_OWNER = { accessibleZaloAccountIds: null };

describe('UnifiedInbox send status + retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetAiPaused.mockResolvedValue({
      aiPaused: true,
      aiPausedAt: new Date().toISOString(),
    });
    mockUpdateSendStatus.mockResolvedValue({ id: 10, metadata: { source: 'manual_inbox', send: { status: 'failed' } } });
    mockResolveBilling.mockResolvedValue(1);
    mockDebit.mockResolvedValue({ debited: false });
    mockDebitInbox.mockResolvedValue({ debited: false });
    mockWithTransaction.mockImplementation(async (fn) => fn({}));
  });

  it('ghi failed khi adapter trả success:false và giữ success:true', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockSendReply.mockResolvedValue({ success: false, error: 'No active Zalo personal session' });

    const result = await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], ZALO_OWNER);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(42);
    expect(result.sendStatus).toBe('failed');
    expect(result.error).toMatch(/No active Zalo/);
    expect(mockUpdateSendStatus).toHaveBeenCalledWith(
      'zalo_personal',
      42,
      expect.objectContaining({ status: 'failed', attempts: 1 })
    );
  });

  // Trước bản vá 02/09/2026: nhánh webchat/channel gọi unifiedInboxRepository.insertMessage()
  // — method KHÔNG tồn tại (repo chỉ có sendMessage()). Không có test nào exercise nhánh
  // này nên lỗi runtime lọt qua review "2/2 suites PASS".
  it('kênh channel gọi đúng repository.sendMessage (không phải insertMessage không tồn tại)', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 7,
      channel: 'zalo_oa',
      id_channel: 3,
      external_id: 'ext-7',
    });
    mockSendMessage.mockResolvedValue(55);
    mockSendReply.mockResolvedValue({ success: true });

    const result = await unifiedInboxService.sendMessage(1, 7, 'channel', 'hi there');

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(55);
    expect(mockSendMessage).toHaveBeenCalledWith(
      7,
      1,
      'channel',
      3,
      expect.objectContaining({ content: 'hi there' })
    );
  });

  // Trước bản vá: params gửi cho adapter dùng recipientId/content/visitorInfo trong khi
  // zaloPersonal.adapter.sendReply đọc externalId/message/conversationInfo — payload lọt
  // qua thành nội dung rỗng gửi cho recipient undefined.
  it('adapter Zalo Personal nhận đúng field externalId/message (không phải recipientId/content đã sai)', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockSendReply.mockResolvedValue({ success: true });

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'nội dung thật', [], ZALO_OWNER);

    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'u1',
        message: 'nội dung thật',
        persist: false,
        forceReply: true,
      })
    );
  });

  // Trước bản vá: debitZaloPersonalInboxIfNeeded bị import nhưng không còn được gọi ở đâu
  // cả — người dùng ở mode chưa enforce vượt hạn mức tháng vẫn gửi được mà ví không giảm.
  // billingUserId cho debit PHẢI lấy từ reservation.legacyDecision (quyết định billing
  // thật của reserveSendQuota), không tự resolve lại — xem test admin-bypass bên dưới.
  it('mode off: tự trừ ví qua debitZaloPersonalInboxIfNeeded (reserveSendQuota không giữ ví)', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockSendReply.mockResolvedValue({ success: true });
    mockReserveSendQuota.mockResolvedValueOnce({
      mode: 'off',
      status: 'reserved',
      id: 99,
      legacyDecision: { allowed: true, billingUserId: 1 },
    });

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], ZALO_OWNER);

    expect(mockDebit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ billingUserId: 1, messageId: 42 })
    );
  });

  // Trước bản vá: debit dùng billingUserId tự resolve qua resolveBillingUserId(), bỏ qua
  // quyết định của reserveSendQuota. Với admin bypass (roleCode=admin, không ownerContextId),
  // reserveSendQuota cố ý trả legacyDecision.billingUserId=null (bypass:true) — admin không
  // bao giờ bị tính phí. Debit cũ vẫn trừ nhầm vì tự resolve ra userId của chính admin.
  it('mode off: admin bypass (legacyDecision.billingUserId=null) → KHÔNG trừ ví dù resolveBillingUserId trả về userId', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockSendReply.mockResolvedValue({ success: true });
    mockResolveBilling.mockResolvedValueOnce(1); // vẫn resolve ra 1 nếu tự gọi lại — bẫy cũ
    mockReserveSendQuota.mockResolvedValueOnce({
      mode: 'off',
      status: 'reserved',
      id: 99,
      legacyDecision: { allowed: true, billingUserId: null, bypass: true },
    });

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], ZALO_OWNER);

    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('mode enforce: KHÔNG tự trừ ví lần hai (reserveSendQuota/consumeSendQuota đã lo ví Tier 3)', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockSendReply.mockResolvedValue({ success: true });
    mockReserveSendQuota.mockResolvedValueOnce({ mode: 'enforce', status: 'reserved', id: 99 });

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], ZALO_OWNER);

    expect(mockDebit).not.toHaveBeenCalled();
  });

  // Trước bản vá: consumeSendQuota lỗi sau khi provider đã gửi thành công thì không có
  // nhánh nào chuyển reservation sang uncertain — mắc kẹt ở 'sending' vĩnh viễn, im lặng.
  it('consumeSendQuota lỗi sau khi gửi thành công → markSendQuotaUncertain, KHÔNG release (retry trùng)', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockSendReply.mockResolvedValue({ success: true });
    mockReserveSendQuota.mockResolvedValueOnce({ mode: 'enforce', status: 'reserved', id: 99 });
    mockConsumeSendQuota.mockRejectedValueOnce(new Error('db down'));

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], ZALO_OWNER);

    expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 99, failureCode: 'CONSUME_DB_FAILED' }),
      {}
    );
    expect(mockReleaseSendQuota).not.toHaveBeenCalled();
  });

  // Trước bản vá: adapter trả {success:false, code:'ZALO_SEND_PARTIAL_DELIVERY', ...} khi
  // MỘT PHẦN nội dung đã tới khách thật (vd. album nhiều ảnh, một ảnh lỗi giữa chừng). Code
  // cũ chỉ giữ result.error (chuỗi) rồi classifyZaloSendError() trên chuỗi đó — mất hết
  // code/errorCategory, rơi vào releaseSendQuota() như lỗi thường → retry gửi lại TOÀN BỘ,
  // khách nhận trùng phần đã tới.
  it('gửi partial (một phần đã tới khách) → markSendQuotaUncertain, KHÔNG release (retry trùng)', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockReserveSendQuota.mockResolvedValueOnce({ mode: 'enforce', status: 'reserved', id: 99 });
    mockSendReply.mockResolvedValue({
      success: false,
      error: 'Zalo chỉ xác nhận một phần tin',
      code: 'ZALO_SEND_PARTIAL_DELIVERY',
      errorCategory: 'ZALO_PARTIAL_DELIVERY',
      msgIds: ['msg1'],
    });

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], ZALO_OWNER);

    expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 99, failureCode: 'PARTIAL_DELIVERY' }),
      {}
    );
    expect(mockReleaseSendQuota).not.toHaveBeenCalled();
  });

  it('retry: gửi partial → markSendQuotaUncertain, KHÔNG release (retry trùng)', async () => {
    mockFindReservationById.mockResolvedValue(null);
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      id_zalo_setting: 9,
      channel: 'zalo_personal',
      external_id: 'u1',
    });
    mockClaimRetry.mockResolvedValue({ id: 42 });
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockReserveSendQuota.mockResolvedValueOnce({ mode: 'enforce', status: 'reserved', id: 100 });
    mockSendReply.mockResolvedValue({
      success: false,
      error: 'Zalo chỉ xác nhận một phần tin',
      code: 'ZALO_SEND_PARTIAL_DELIVERY',
      errorCategory: 'ZALO_PARTIAL_DELIVERY',
      msgIds: ['msg1'],
    });

    await unifiedInboxService.retryMessage(1, 42, 'zalo_personal', ZALO_OWNER);

    expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 100, failureCode: 'PARTIAL_DELIVERY' }),
      {}
    );
    expect(mockReleaseSendQuota).not.toHaveBeenCalled();
  });

  // Trước bản vá: reservation chuyển sang 'sending' rồi mới insert message + trừ ví trong
  // transaction — không có try/catch, provider (adapter) CHƯA từng được gọi. Lỗi insert
  // (constraint, mất kết nối…) văng thẳng ra ngoài mà không release, reservation mắc kẹt ở
  // 'sending' vĩnh viễn dù chưa hề gửi gì.
  it('insert message lỗi trước khi gọi provider → releaseSendQuota, KHÔNG gọi adapter', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockReserveSendQuota.mockResolvedValueOnce({ mode: 'enforce', status: 'reserved', id: 99 });
    mockWithTransaction.mockImplementationOnce(async () => {
      throw new Error('insert violates constraint');
    });

    await expect(unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], ZALO_OWNER))
      .rejects.toThrow('insert violates constraint');

    expect(mockReleaseSendQuota).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 99, failureCode: 'INBOX_PERSIST_FAILED' }),
      {}
    );
    expect(mockSendReply).not.toHaveBeenCalled();
    expect(mockConsumeSendQuota).not.toHaveBeenCalled();
  });

  it('retry claim thất bại → 409, không gọi adapter', async () => {
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      channel: 'zalo_personal',
    });
    mockClaimRetry.mockResolvedValue(null);

    await expect(unifiedInboxService.retryMessage(1, 42, 'zalo_personal', ZALO_OWNER))
      .rejects.toMatchObject({ status: 409, code: 'RETRY_NOT_AVAILABLE' });
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  it('retry thành công sau khi claim', async () => {
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      id_zalo_setting: 9,
      channel: 'zalo_personal',
      external_id: 'u1',
    });
    mockClaimRetry.mockResolvedValue({ id: 42 });
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockSendReply.mockResolvedValue({ success: true });
    mockUpdateSendStatus.mockResolvedValue({
      id: 42,
      metadata: { source: 'manual_inbox', send: { status: 'sent' } },
    });

    const result = await unifiedInboxService.retryMessage(1, 42, 'zalo_personal', ZALO_OWNER);
    expect(result.sendStatus).toBe('sent');
    expect(mockUpdateSendStatus).toHaveBeenCalledWith(
      'zalo_personal',
      42,
      expect.objectContaining({ status: 'sent' })
    );
  });

  it('retry khi message đã có trạng thái sent → replay success không gọi adapter', async () => {
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      channel: 'zalo_personal',
      metadata: { send: { status: 'sent' } },
    });

    const result = await unifiedInboxService.retryMessage(1, 42, 'zalo_personal', ZALO_OWNER);
    expect(result.isReplay).toBe(true);
    expect(result.sendStatus).toBe('sent');
    expect(mockClaimRetry).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  it('retry khi reservation cũ ở trạng thái uncertain → ném 409 RESERVATION_UNCERTAIN', async () => {
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      channel: 'zalo_personal',
      quota_reservation_id: 100,
      metadata: { send: { status: 'failed' } },
    });
    mockFindReservationById.mockResolvedValue({ id: 100, status: 'uncertain' });

    await expect(unifiedInboxService.retryMessage(1, 42, 'zalo_personal', ZALO_OWNER))
      .rejects.toMatchObject({ status: 409, code: 'RESERVATION_UNCERTAIN' });
    expect(mockClaimRetry).not.toHaveBeenCalled();
  });

  it('retry khi reservation cũ ở trạng thái reserved/sending → ném 409 CONCURRENT_SEND_IN_PROGRESS', async () => {
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      channel: 'zalo_personal',
      quota_reservation_id: 101,
      metadata: { send: { status: 'failed' } },
    });
    mockFindReservationById.mockResolvedValue({ id: 101, status: 'sending' });

    await expect(unifiedInboxService.retryMessage(1, 42, 'zalo_personal', ZALO_OWNER))
      .rejects.toMatchObject({ status: 409, code: 'CONCURRENT_SEND_IN_PROGRESS' });
    expect(mockClaimRetry).not.toHaveBeenCalled();
  });

  // Trước bản vá: reserveSendQuota trong retryMessage dùng `userId` (workspace owner, do
  // controller truyền vào) thay vì `options.actorUserId` (người thao tác thật). Policy
  // luôn thấy "owner gửi" nên bỏ qua trần Tier 1 khi nhân viên bấm gửi lại tin lỗi.
  it('retry: dùng options.actorUserId cho reserveSendQuota, không dùng userId (owner) truyền vào', async () => {
    mockFindReservationById.mockResolvedValue(null);
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      id_zalo_setting: 9,
      channel: 'zalo_personal',
      external_id: 'u1',
    });
    mockClaimRetry.mockResolvedValue({ id: 42 });
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockSendReply.mockResolvedValue({ success: true });

    const ownerId = 100;
    const employeeActorId = 7;
    await unifiedInboxService.retryMessage(
      { userId: ownerId, messageId: 42, type: 'zalo_personal' },
      { actorUserId: employeeActorId, roleCode: 'employee', ...ZALO_OWNER }
    );

    expect(mockReserveSendQuota).toHaveBeenCalledWith(
      expect.objectContaining({ userId: employeeActorId }),
      expect.anything()
    );
  });

  describe('Telegram (telegram) trong Hộp thư', () => {
    const tgConversation = {
      id: 21,
      channel: 'telegram',
      id_channel: 31,
      external_id: 'telegram:7:-1001234567',
    };

    beforeEach(() => {
      mockSendMessage.mockResolvedValue(88);
      mockTelegramInboxSend.mockResolvedValue({ success: true, messageId: 4242, provider: 'telegram' });
    });

    it('(e) _getChannelAdapter(\'telegram\') có adapter Hộp thư (không còn "Channel adapter not available")', () => {
      const adapter = unifiedInboxService._getChannelAdapter('telegram');
      expect(adapter).toBeDefined();
      expect(typeof adapter.sendReply).toBe('function');
    });

    it('(c) trả lời tay: adapter Telegram nhận id_channel + external_id ghép, ghi id tin vào dòng agent, tạm dừng AI', async () => {
      mockGetConversationById.mockResolvedValue(tgConversation);

      const result = await unifiedInboxService.sendMessage(1, 21, 'channel', 'Chào bạn');

      expect(mockTelegramInboxSend).toHaveBeenCalledTimes(1);
      expect(mockTelegramInboxSend).toHaveBeenCalledWith(expect.objectContaining({
        channelId: 31,
        externalId: 'telegram:7:-1001234567',
        message: 'Chào bạn',
        userId: 1,
      }));
      expect(result.sendStatus).toBe('sent');
      // id tin Telegram thật được bind vào dòng agent vừa lưu → echo isOutgoing sau đó không tự dừng AI lần nữa.
      expect(mockBindChannelMessageExternalId).toHaveBeenCalledWith(88, 4242);
      expect(mockSetAiPaused).toHaveBeenCalledWith(21, 'channel', true, 'handoff');
    });

    it('adapter trả success:false → failed, KHÔNG bind id, KHÔNG giả sent', async () => {
      mockGetConversationById.mockResolvedValue(tgConversation);
      mockTelegramInboxSend.mockResolvedValue({ success: false, error: 'Telegram account 7 is inactive' });

      const result = await unifiedInboxService.sendMessage(1, 21, 'channel', 'Chào bạn');

      expect(result.sendStatus).toBe('failed');
      expect(result.error).toMatch(/inactive/);
      expect(mockBindChannelMessageExternalId).not.toHaveBeenCalled();
    });
  });

  describe('WhatsApp QR (whatsapp_baileys) trong Hộp thư', () => {
    const waConversation = {
      id: 12,
      channel: 'whatsapp_baileys',
      id_channel: 9,
      external_id: 'baileys:40-default:59:84901234567',
    };

    beforeEach(() => {
      mockGetBaileysSessionKey.mockResolvedValue('40-default');
      mockSendMessage.mockResolvedValue(77);
      mockWaSendReply.mockResolvedValue({ success: true, messageId: 'wa-1', provider: 'baileys' });
    });

    it('trả lời tay: tra session key từ id_channel, tách số từ chuỗi ghép, gửi qua adapter WhatsApp, trạng thái sent', async () => {
      mockGetConversationById.mockResolvedValue(waConversation);

      const result = await unifiedInboxService.sendMessage(1, 12, 'channel', 'Chào bạn');

      expect(mockGetBaileysSessionKey).toHaveBeenCalledWith(9, 1);
      // P5: adapter Hộp thư chuyển thêm `attachments` (rỗng khi không đính kèm) + `userId` chủ để lọc tệp theo chủ.
      expect(mockWaSendReply).toHaveBeenCalledWith({
        channelId: '40-default',
        externalId: '84901234567',
        message: 'Chào bạn',
        attachments: [],
        userId: 1,
      });
      expect(result.sendStatus).toBe('sent');
      expect(result.error).toBeUndefined();
      // Gửi tay xong AI phải tạm dừng đúng bảng hội thoại kênh.
      expect(mockSetAiPaused).toHaveBeenCalledWith(12, 'channel', true, 'handoff');
    });

    it('adapter trả success:false → failed, KHÔNG giả sent', async () => {
      mockGetConversationById.mockResolvedValue(waConversation);
      mockWaSendReply.mockResolvedValue({ success: false, error: 'not connected', provider: 'baileys' });

      const result = await unifiedInboxService.sendMessage(1, 12, 'channel', 'Chào bạn');

      expect(result.sendStatus).toBe('failed');
      expect(result.error).toMatch(/not connected/);
      expect(mockUpdateSendStatus).toHaveBeenCalledWith(
        'channel',
        77,
        expect.objectContaining({ status: 'failed' })
      );
    });

    it('P5: có tệp đính kèm (khoá kho chat của chủ) → adapter WhatsApp NHẬN tệp, trạng thái sent (không còn "chưa gửi được tệp")', async () => {
      mockGetConversationById.mockResolvedValue(waConversation);

      const result = await unifiedInboxService.sendMessage(
        1, 12, 'channel', 'Xem ảnh', [{ key: 'uploads/1/chat/1700000000_y.png', name: 'y.png', type: 'image' }]
      );

      expect(result.sendStatus).toBe('sent');
      expect(mockWaSendReply).toHaveBeenCalledTimes(1);
      expect(mockWaSendReply.mock.calls[0][0]).toMatchObject({
        channelId: '40-default',
        externalId: '84901234567',
        message: 'Xem ảnh',
        userId: 1,
        attachments: [expect.objectContaining({ key: 'uploads/1/chat/1700000000_y.png' })],
      });
    });

    it('P5: gửi một phần (tin chữ đã tới, tệp lỗi) → failed kèm câu lỗi để chủ thấy và thử lại', async () => {
      mockGetConversationById.mockResolvedValue(waConversation);
      mockWaSendReply.mockResolvedValue({
        success: false, partial: true, error: 'Đã gửi 1 phần nhưng có tệp chưa gửi được: rate-overlimit', messageId: 'wa-1', provider: 'baileys',
      });

      const result = await unifiedInboxService.sendMessage(
        1, 12, 'channel', 'Xem ảnh', [{ key: 'uploads/1/chat/1700000000_y.png', name: 'y.png', type: 'image' }]
      );

      expect(result.sendStatus).toBe('failed');
      expect(result.error).toMatch(/tệp chưa gửi được/);
    });

    it('không tra được tài khoản WhatsApp → failed, không gọi gửi', async () => {
      mockGetConversationById.mockResolvedValue(waConversation);
      mockGetBaileysSessionKey.mockResolvedValue(null);

      const result = await unifiedInboxService.sendMessage(1, 12, 'channel', 'Chào bạn');

      expect(result.sendStatus).toBe('failed');
      expect(mockWaSendReply).not.toHaveBeenCalled();
    });

    it('thử lại: nút "Gửi lại" dùng chung adapter, không còn "Channel adapter not available"', async () => {
      mockFindReservationById.mockResolvedValue(null);
      mockFindForRetry.mockResolvedValue({
        id: 77,
        id_conversation: 12,
        id_channel: 9,
        content: 'Chào bạn',
        role: 'agent',
        channel: 'whatsapp_baileys',
        external_id: 'baileys:40-default:59:84901234567',
      });
      mockClaimRetry.mockResolvedValue({ id: 77 });
      mockGetConversationById.mockResolvedValue(waConversation);
      mockUpdateSendStatus.mockResolvedValue({
        id: 77,
        metadata: { source: 'manual_inbox', send: { status: 'sent' } },
      });

      const result = await unifiedInboxService.retryMessage(1, 77, 'channel');

      expect(mockWaSendReply).toHaveBeenCalledWith({
        channelId: '40-default',
        externalId: '84901234567',
        message: 'Chào bạn',
        attachments: [],
        userId: 1,
      });
      expect(result.sendStatus).toBe('sent');
    });
  });

  // P11 (PLAN_TG_WA_DAY_DU mục 18) — trả lời tay Telegram/WhatsApp đi qua cổng hạn mức tin/tháng của kênh đó.
  describe('P11 — Hộp thư Telegram/WhatsApp tính hạn mức', () => {
    const tgConv = { id: 21, channel: 'telegram', id_channel: 31, external_id: 'telegram:7:-1001234567' };
    const waConv = { id: 22, channel: 'whatsapp_baileys', id_channel: 32, external_id: 'wa:8:84901234567@s.whatsapp.net' };
    const shadowReservation = () => ({
      mode: 'shadow', status: 'reserved', id: null, legacyDecision: { allowed: true, billingUserId: 1 },
    });
    const enforceReservation = (id = 200) => ({ mode: 'enforce', status: 'reserved', id });

    beforeEach(() => {
      mockSendMessage.mockResolvedValue(88);
      mockTelegramInboxSend.mockResolvedValue({ success: true, messageId: 4242, provider: 'telegram' });
      mockGetBaileysSessionKey.mockResolvedValue('8-abc');
      mockWaSendReply.mockResolvedValue({ success: true, messageId: 'WA1' });
      mockReserveSendQuota.mockResolvedValue({ mode: 'off', status: 'reserved', id: 99 });
    });

    it('telegram → reserveSendQuota({channel:telegram, sourceType:inbox}); whatsapp_baileys → channel whatsapp', async () => {
      mockGetConversationById.mockResolvedValueOnce(tgConv);
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      mockGetConversationById.mockResolvedValueOnce(waConv);
      await unifiedInboxService.sendMessage(1, 22, 'channel', 'chào');

      expect(mockReserveSendQuota).toHaveBeenCalledTimes(2);
      expect(mockReserveSendQuota.mock.calls[0][0]).toEqual(expect.objectContaining({
        channel: 'telegram', sourceType: 'inbox', quantity: 1,
      }));
      expect(mockReserveSendQuota.mock.calls[1][0]).toEqual(expect.objectContaining({
        channel: 'whatsapp', sourceType: 'inbox', quantity: 1,
      }));
      expect(mockReserveSendQuota.mock.calls[0][0].reservationKey).toMatch(/^direct:telegram:1:/);
      expect(mockReserveSendQuota.mock.calls[1][0].reservationKey).toMatch(/^direct:whatsapp:1:/);
    });

    it('zalo_oa / facebook → KHÔNG gọi reserveSendQuota (không đo hạn mức tin/tháng)', async () => {
      for (const channel of ['zalo_oa', 'facebook']) {
        mockGetConversationById.mockResolvedValueOnce({ id: 9, channel, id_channel: 3, external_id: 'x' });
        mockSendReply.mockResolvedValue({ success: true });
        // eslint-disable-next-line no-await-in-loop
        await unifiedInboxService.sendMessage(1, 9, 'channel', 'hi');
      }
      expect(mockReserveSendQuota).not.toHaveBeenCalled();
      expect(mockDebitInbox).not.toHaveBeenCalled();
    });

    it('lưu dòng agent kèm quotaReservationId của đặt chỗ (enforce)', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(200));
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      expect(mockSendMessage).toHaveBeenCalledWith(21, 1, 'channel', 31, expect.objectContaining({ quotaReservationId: 200 }));
      expect(mockMarkSendQuotaSending).toHaveBeenCalledWith({ reservationId: 200 }, expect.anything());
    });

    it('mode shadow, gửi OK → updateMessageSendStatus(sent) RỒI debitInboxChannelMessageIfNeeded({telegram, messageId})', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(shadowReservation());
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');

      expect(mockUpdateSendStatus).toHaveBeenCalledWith('channel', 88, expect.objectContaining({ status: 'sent' }));
      expect(mockDebitInbox).toHaveBeenCalledTimes(1);
      expect(mockDebitInbox).toHaveBeenCalledWith({ billingUserId: 1, channel: 'telegram', messageId: 88 });
      // Trừ ví phải SAU khi tin được đánh dấu sent (phép đếm mới thấy chính tin này).
      expect(mockUpdateSendStatus.mock.invocationCallOrder[0]).toBeLessThan(mockDebitInbox.mock.invocationCallOrder[0]);
    });

    it('mode shadow, WhatsApp gửi OK → debit kênh whatsapp (không phải whatsapp_baileys)', async () => {
      mockGetConversationById.mockResolvedValue(waConv);
      mockReserveSendQuota.mockResolvedValueOnce(shadowReservation());
      await unifiedInboxService.sendMessage(1, 22, 'channel', 'chào');
      expect(mockDebitInbox).toHaveBeenCalledWith({ billingUserId: 1, channel: 'whatsapp', messageId: 88 });
    });

    it('mode shadow, adapter thất bại → KHÔNG debit (tin lỗi không tốn hạn mức)', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(shadowReservation());
      mockTelegramInboxSend.mockResolvedValue({ success: false, error: 'Telegram account 7 is inactive' });
      const result = await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      expect(result.sendStatus).toBe('failed');
      expect(mockDebitInbox).not.toHaveBeenCalled();
    });

    it('mode shadow, admin bypass (legacyDecision.billingUserId=null) → KHÔNG debit', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce({
        mode: 'shadow', status: 'reserved', id: null, legacyDecision: { allowed: true, billingUserId: null, bypass: true },
      });
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      expect(mockDebitInbox).not.toHaveBeenCalled();
    });

    it('mode enforce, gửi OK → consumeSendQuota, KHÔNG debit lần hai', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(200));
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      expect(mockConsumeSendQuota).toHaveBeenCalledWith(expect.objectContaining({ reservationId: 200 }), expect.anything());
      expect(mockDebitInbox).not.toHaveBeenCalled();
    });

    it('mode enforce, lỗi thường → releaseSendQuota PROVIDER_ERROR', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(200));
      mockTelegramInboxSend.mockResolvedValue({ success: false, error: 'Telegram account 7 is inactive' });
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      expect(mockReleaseSendQuota).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 200, failureCode: 'PROVIDER_ERROR' }),
        expect.anything()
      );
      expect(mockMarkSendQuotaUncertain).not.toHaveBeenCalled();
    });

    it('mode enforce, partial:true (WhatsApp) → markSendQuotaUncertain PARTIAL_DELIVERY, KHÔNG release', async () => {
      mockGetConversationById.mockResolvedValue(waConv);
      mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(201));
      mockWaSendReply.mockResolvedValue({ success: false, partial: true, messageId: 'WA1', error: 'tệp lỗi' });
      await unifiedInboxService.sendMessage(1, 22, 'channel', 'chào');
      expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 201, failureCode: 'PARTIAL_DELIVERY' }),
        expect.anything()
      );
      expect(mockReleaseSendQuota).not.toHaveBeenCalled();
    });

    it('mode enforce, Telegram success:false kèm messageId (tin đầu đã tới) → uncertain PARTIAL_DELIVERY', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(202));
      mockTelegramInboxSend.mockResolvedValue({ success: false, error: 'tệp lỗi', messageId: 4242 });
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 202, failureCode: 'PARTIAL_DELIVERY' }),
        expect.anything()
      );
      expect(mockReleaseSendQuota).not.toHaveBeenCalled();
    });

    it('mode enforce, "ETIMEDOUT" → markSendQuotaUncertain TIMEOUT, KHÔNG release', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(203));
      mockTelegramInboxSend.mockResolvedValue({ success: false, error: 'connect ETIMEDOUT 1.2.3.4:443' });
      await unifiedInboxService.sendMessage(1, 21, 'channel', 'chào');
      expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 203, failureCode: 'TIMEOUT' }),
        expect.anything()
      );
      expect(mockReleaseSendQuota).not.toHaveBeenCalled();
    });

    it('mode enforce, chèn dòng tin lỗi trước khi gọi provider → release INBOX_PERSIST_FAILED, KHÔNG gọi adapter', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(204));
      mockSendMessage.mockRejectedValueOnce(new Error('db down'));
      await expect(unifiedInboxService.sendMessage(1, 21, 'channel', 'chào')).rejects.toThrow('db down');
      expect(mockReleaseSendQuota).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 204, failureCode: 'INBOX_PERSIST_FAILED' }),
        expect.anything()
      );
      expect(mockTelegramInboxSend).not.toHaveBeenCalled();
    });

    it('chạm trần (reserveSendQuota ném) → không lưu tin, không gọi adapter', async () => {
      mockGetConversationById.mockResolvedValue(tgConv);
      const limitErr = Object.assign(new Error('Đã hết hạn mức tin Telegram'), { status: 403, code: 'RESOURCE_LIMIT_EXCEEDED' });
      mockReserveSendQuota.mockRejectedValueOnce(limitErr);
      await expect(unifiedInboxService.sendMessage(1, 21, 'channel', 'chào')).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockTelegramInboxSend).not.toHaveBeenCalled();
    });

    describe('retry', () => {
      const retryRow = (extra = {}) => ({
        id: 88, id_conversation: 21, id_channel: 31, content: 'chào', role: 'agent',
        channel: 'telegram', external_id: 'telegram:7:-1001234567', attachments: [],
        metadata: { source: 'manual_inbox', send: { status: 'failed' } }, ...extra,
      });

      it('đặt chỗ cũ đã consumed → replay, KHÔNG gửi lại', async () => {
        mockFindForRetry.mockResolvedValue(retryRow({ quota_reservation_id: 200 }));
        mockFindReservationById.mockResolvedValue({ id: 200, status: 'consumed' });
        const result = await unifiedInboxService.retryMessage(1, 88, 'channel');
        expect(result).toMatchObject({ isReplay: true, sendStatus: 'sent' });
        expect(mockClaimRetry).not.toHaveBeenCalled();
        expect(mockTelegramInboxSend).not.toHaveBeenCalled();
      });

      it('đặt chỗ cũ uncertain → 409 RESERVATION_UNCERTAIN; reserved/sending → 409 CONCURRENT_SEND_IN_PROGRESS', async () => {
        mockFindForRetry.mockResolvedValue(retryRow({ quota_reservation_id: 200 }));
        mockFindReservationById.mockResolvedValueOnce({ id: 200, status: 'uncertain' });
        await expect(unifiedInboxService.retryMessage(1, 88, 'channel'))
          .rejects.toMatchObject({ status: 409, code: 'RESERVATION_UNCERTAIN' });
        mockFindReservationById.mockResolvedValueOnce({ id: 200, status: 'sending' });
        await expect(unifiedInboxService.retryMessage(1, 88, 'channel'))
          .rejects.toMatchObject({ status: 409, code: 'CONCURRENT_SEND_IN_PROGRESS' });
        expect(mockClaimRetry).not.toHaveBeenCalled();
      });

      it('shadow, gửi lại OK → đặt chỗ kênh telegram, RỒI debit theo id tin', async () => {
        mockFindReservationById.mockResolvedValue(null);
        mockFindForRetry.mockResolvedValue(retryRow());
        mockClaimRetry.mockResolvedValue({ id: 88 });
        mockGetConversationById.mockResolvedValue(tgConv);
        mockReserveSendQuota.mockResolvedValueOnce(shadowReservation());
        mockUpdateSendStatus.mockResolvedValue({ id: 88, metadata: { send: { status: 'sent' } } });

        const result = await unifiedInboxService.retryMessage(1, 88, 'channel');

        expect(result.sendStatus).toBe('sent');
        expect(mockReserveSendQuota.mock.calls[0][0]).toEqual(expect.objectContaining({ channel: 'telegram', sourceType: 'inbox' }));
        expect(mockDebitInbox).toHaveBeenCalledWith({ billingUserId: 1, channel: 'telegram', messageId: 88 });
      });

      it('shadow, gửi lại vẫn lỗi → KHÔNG debit', async () => {
        mockFindReservationById.mockResolvedValue(null);
        mockFindForRetry.mockResolvedValue(retryRow());
        mockClaimRetry.mockResolvedValue({ id: 88 });
        mockGetConversationById.mockResolvedValue(tgConv);
        mockReserveSendQuota.mockResolvedValueOnce(shadowReservation());
        mockTelegramInboxSend.mockResolvedValue({ success: false, error: 'lỗi' });
        const result = await unifiedInboxService.retryMessage(1, 88, 'channel');
        expect(result.sendStatus).toBe('failed');
        expect(mockDebitInbox).not.toHaveBeenCalled();
      });

      it('enforce, gửi lại lỗi thường → release PROVIDER_ERROR; partial → uncertain PARTIAL_DELIVERY; ETIMEDOUT → uncertain TIMEOUT', async () => {
        mockFindReservationById.mockResolvedValue(null);
        mockFindForRetry.mockResolvedValue(retryRow());
        mockClaimRetry.mockResolvedValue({ id: 88 });
        mockGetConversationById.mockResolvedValue(tgConv);

        mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(301));
        mockTelegramInboxSend.mockResolvedValueOnce({ success: false, error: 'lỗi thường' });
        await unifiedInboxService.retryMessage(1, 88, 'channel');
        expect(mockReleaseSendQuota).toHaveBeenCalledWith(
          expect.objectContaining({ reservationId: 301, failureCode: 'PROVIDER_ERROR' }), expect.anything()
        );

        mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(302));
        mockTelegramInboxSend.mockResolvedValueOnce({ success: false, error: 'tệp lỗi', messageId: 4242 });
        await unifiedInboxService.retryMessage(1, 88, 'channel');
        expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
          expect.objectContaining({ reservationId: 302, failureCode: 'PARTIAL_DELIVERY' }), expect.anything()
        );

        mockReserveSendQuota.mockResolvedValueOnce(enforceReservation(303));
        mockTelegramInboxSend.mockResolvedValueOnce({ success: false, error: 'read ETIMEDOUT' });
        await unifiedInboxService.retryMessage(1, 88, 'channel');
        expect(mockMarkSendQuotaUncertain).toHaveBeenCalledWith(
          expect.objectContaining({ reservationId: 303, failureCode: 'TIMEOUT' }), expect.anything()
        );
        expect(mockReleaseSendQuota).toHaveBeenCalledTimes(1);
      });

      it('zalo_oa (không đo hạn mức) → gửi lại KHÔNG đặt chỗ', async () => {
        mockFindReservationById.mockResolvedValue(null);
        mockFindForRetry.mockResolvedValue(retryRow({ channel: 'zalo_oa' }));
        mockClaimRetry.mockResolvedValue({ id: 88 });
        mockGetConversationById.mockResolvedValue({ id: 21, channel: 'zalo_oa', id_channel: 31, external_id: 'x' });
        mockSendReply.mockResolvedValue({ success: true });
        await unifiedInboxService.retryMessage(1, 88, 'channel');
        expect(mockReserveSendQuota).not.toHaveBeenCalled();
        expect(mockDebitInbox).not.toHaveBeenCalled();
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — mọi đường theo id hội thoại / tin Zalo cá nhân đều kiểm việc giao tài khoản
// TRƯỚC khi làm bất cứ gì (đọc tin, đánh dấu đọc, tạm dừng AI, đặt chỗ hạn mức, ghi tin, gửi, giành quyền gửi lại, xoá).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('G2 — việc giao tài khoản Zalo cho nhân viên (đường theo id)', () => {
  const ACCOUNT = 9; // tài khoản Zalo của hội thoại / tin dưới test

  const zaloConversation = () => ({
    id: 5,
    channel: 'zalo_personal',
    external_id: 'u1',
    id_zalo_setting: ACCOUNT,
    channel_is_active: true,
    visitor_name: 'Khách',
    visitor_info: {},
    _parsedVisitorInfo: {},
  });
  const failedZaloMessage = (overrides = {}) => ({
    id: 42,
    id_conversation: 5,
    content: 'hello',
    role: 'agent',
    channel: 'zalo_personal',
    external_id: 'u1',
    id_zalo_setting: ACCOUNT,
    conversation_id_zalo_setting: ACCOUNT,
    metadata: { send: { status: 'failed' } },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConversationById.mockResolvedValue(zaloConversation());
    mockFindForRetry.mockResolvedValue(failedZaloMessage());
    mockClaimRetry.mockResolvedValue({ id: 42 });
    mockInsertZalo.mockResolvedValue(77);
    mockSendReply.mockResolvedValue({ success: true });
    mockSetAiPaused.mockResolvedValue({ aiPaused: true, aiPausedAt: new Date().toISOString() });
    mockUpdateSendStatus.mockResolvedValue({ id: 42, metadata: { send: { status: 'sent' } } });
    mockResolveBilling.mockResolvedValue(1);
    mockWithTransaction.mockImplementation(async (fn) => fn({}));
    mockGetMessages.mockResolvedValue({ messages: [], hasMore: false });
    mockMarkAsRead.mockResolvedValue({ remainingUnread: 0 });
    mockDeleteZaloConversation.mockResolvedValue(true);
  });

  /** Mỗi thao tác theo id + các hàm KHÔNG ĐƯỢC chạm khi bị chặn. */
  const OPERATIONS = {
    getConversation: (scope) => unifiedInboxService.getConversation(1, 5, 'zalo_personal', { accessibleZaloAccountIds: scope }),
    getMessages: (scope) => unifiedInboxService.getMessages(1, 5, 'zalo_personal', { limit: 50, accessibleZaloAccountIds: scope }),
    markAsRead: (scope) => unifiedInboxService.markAsRead(1, 5, 'zalo_personal', { accessibleZaloAccountIds: scope }),
    setConversationAiPaused: (scope) => unifiedInboxService.setConversationAiPaused(1, 5, 'zalo_personal', true, { accessibleZaloAccountIds: scope }),
    sendMessage: (scope) => unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello', [], { accessibleZaloAccountIds: scope }),
    retryMessage: (scope) => unifiedInboxService.retryMessage(1, 42, 'zalo_personal', { accessibleZaloAccountIds: scope }),
    deleteConversation: (scope) => unifiedInboxService.deleteConversation(1, 5, 'zalo_personal', { accessibleZaloAccountIds: scope }),
  };
  const expectNoSideEffects = () => {
    expect(mockGetMessages).not.toHaveBeenCalled();
    expect(mockMarkAsRead).not.toHaveBeenCalled();
    expect(mockSetAiPaused).not.toHaveBeenCalled();
    expect(mockReserveSendQuota).not.toHaveBeenCalled();
    expect(mockInsertZalo).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
    expect(mockClaimRetry).not.toHaveBeenCalled();
    expect(mockUpdateSendStatus).not.toHaveBeenCalled();
    expect(mockDeleteZaloConversation).not.toHaveBeenCalled();
  };

  for (const [name, run] of Object.entries(OPERATIONS)) {
    describe(name, () => {
      it('nhân viên CHƯA được giao tài khoản của hội thoại → 403 ZALO_ACCOUNT_NOT_ASSIGNED, không chạm gì', async () => {
        await expect(run([5, 6])).rejects.toMatchObject({ status: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
        expectNoSideEffects();
      });

      it('nhân viên chưa được giao gì ([]) → chặn', async () => {
        await expect(run([])).rejects.toMatchObject({ status: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
        expectNoSideEffects();
      });

      it('HỎNG THÌ CHẶN: thiếu phạm vi (undefined) hoặc sai kiểu → chặn, không coi là chủ', async () => {
        await expect(run(undefined)).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
        await expect(run('all')).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
        expectNoSideEffects();
      });

      it('nhân viên ĐƯỢC giao tài khoản → làm được như thường', async () => {
        await expect(run([5, ACCOUNT])).resolves.toBeDefined();
      });

      it('CHỦ / super admin (null) → làm được như thường', async () => {
        await expect(run(null)).resolves.toBeDefined();
      });
    });
  }

  it('hội thoại không có tài khoản Zalo (id_zalo_setting NULL) → nhân viên bị chặn, chủ vẫn thấy', async () => {
    mockGetConversationById.mockResolvedValue({ ...zaloConversation(), id_zalo_setting: null });

    await expect(OPERATIONS.getConversation([5])).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    await expect(OPERATIONS.getConversation(null)).resolves.toBeDefined();
  });

  it('hội thoại không tồn tại / không thuộc chủ vẫn là "Conversation not found" (chưa tới bước kiểm tài khoản)', async () => {
    mockGetConversationById.mockResolvedValue(null);

    await expect(OPERATIONS.getConversation([5])).rejects.toThrow('Conversation not found');
    await expect(OPERATIONS.getConversation(null)).rejects.toThrow('Conversation not found');
  });

  it('kênh KHÔNG phải Zalo cá nhân (channel / webchat) không bị phạm vi Zalo chặn, kể cả nhân viên chưa được giao gì', async () => {
    mockGetConversationById.mockResolvedValue({ id: 21, channel: 'telegram', id_channel: 31, external_id: 'x', channel_display_name: 'TG' });
    await expect(unifiedInboxService.getConversation(1, 21, 'channel', { accessibleZaloAccountIds: [] })).resolves.toMatchObject({ id: 21 });

    mockGetConversationById.mockResolvedValue({ id: 8, channel: 'web', channel_display_name: 'Widget' });
    await expect(unifiedInboxService.getMessages(1, 8, 'webchat', { accessibleZaloAccountIds: [] })).resolves.toBeDefined();
    await expect(unifiedInboxService.markAsRead(1, 8, 'webchat', { accessibleZaloAccountIds: [] })).resolves.toBeDefined();
    await expect(unifiedInboxService.setConversationAiPaused(1, 8, 'webchat', true, { accessibleZaloAccountIds: [] })).resolves.toBeDefined();
  });

  describe('retryMessage — kiểm cả tài khoản của TIN lẫn của HỘI THOẠI, trước khi giành quyền gửi lại', () => {
    it('tin thuộc tài khoản được giao nhưng hội thoại thuộc tài khoản KHÁC (dữ liệu lệch) → chặn', async () => {
      mockFindForRetry.mockResolvedValue(failedZaloMessage({ id_zalo_setting: 5, conversation_id_zalo_setting: ACCOUNT }));

      await expect(OPERATIONS.retryMessage([5])).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expectNoSideEffects();
    });

    it('tin của tài khoản chưa giao → chặn trước khi claim; tài khoản gửi thật là của tin, không phải cái nhân viên chọn', async () => {
      mockFindForRetry.mockResolvedValue(failedZaloMessage({ id_zalo_setting: ACCOUNT, conversation_id_zalo_setting: 5 }));

      await expect(OPERATIONS.retryMessage([5])).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expectNoSideEffects();
    });

    it('không áp cho tin kênh Telegram/WhatsApp (type channel) dù nhân viên chưa được giao Zalo nào', async () => {
      mockFindReservationById.mockResolvedValue(null);
      mockFindForRetry.mockResolvedValue({ id: 88, id_conversation: 21, content: 'hi', role: 'agent', channel: 'zalo_oa', id_channel: 31, external_id: 'x', metadata: { send: { status: 'failed' } } });
      mockClaimRetry.mockResolvedValue({ id: 88 });
      mockGetConversationById.mockResolvedValue({ id: 21, channel: 'zalo_oa', id_channel: 31, external_id: 'x' });

      await expect(unifiedInboxService.retryMessage(1, 88, 'channel', { accessibleZaloAccountIds: [] })).resolves.toMatchObject({ success: true });
    });
  });

  describe('sendMessage — chặn TRƯỚC đặt chỗ hạn mức, ghi tin, gọi Zalo', () => {
    it('nhân viên bị chặn: reserveSendQuota / insert / adapter / setAiPaused đều không được gọi', async () => {
      await expect(OPERATIONS.sendMessage([5])).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(mockReserveSendQuota).not.toHaveBeenCalled();
      expect(mockInsertZalo).not.toHaveBeenCalled();
      expect(mockSendReply).not.toHaveBeenCalled();
      expect(mockSetAiPaused).not.toHaveBeenCalled();
    });

    it('phạm vi không rò xuống hàm đặt chỗ hạn mức (options chuyển cho reserveSendQuota không mang accessibleZaloAccountIds)', async () => {
      await OPERATIONS.sendMessage([ACCOUNT]);

      expect(mockReserveSendQuota).toHaveBeenCalledTimes(1);
      const [, quotaOptions] = mockReserveSendQuota.mock.calls[0];
      expect(quotaOptions).not.toHaveProperty('accessibleZaloAccountIds');
    });
  });

  describe('deleteConversation', () => {
    it('chuyển phạm vi xuống adapter / repository (kiểm lần hai ngay trong giao dịch xoá)', async () => {
      await OPERATIONS.deleteConversation([ACCOUNT]);

      expect(mockDeleteZaloConversation).toHaveBeenCalledWith(1, 5, { accessibleZaloAccountIds: [ACCOUNT] });
    });

    it('repository báo không xoá được (false: hết quyền giữa chừng / đã xoá) → "Conversation not found", không báo xoá thành công', async () => {
      mockDeleteZaloConversation.mockResolvedValue(false);

      await expect(OPERATIONS.deleteConversation(null)).rejects.toThrow('Conversation not found');
    });
  });
});
