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
  },
}));

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({
  default: { getAllSettingsForUser: jest.fn().mockResolvedValue([]) },
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

jest.unstable_mockModule('../../payment/topupWallet.service.js', () => ({
  debitZaloPersonalInboxIfNeeded: mockDebit,
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
  default: { sendReply: mockSendReply },
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

    const result = await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello');

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

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'nội dung thật');

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

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello');

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

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello');

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

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello');

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

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello');

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

    await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello');

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

    await unifiedInboxService.retryMessage(1, 42, 'zalo_personal');

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

    await expect(unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello'))
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

    await expect(unifiedInboxService.retryMessage(1, 42, 'zalo_personal'))
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

    const result = await unifiedInboxService.retryMessage(1, 42, 'zalo_personal');
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

    const result = await unifiedInboxService.retryMessage(1, 42, 'zalo_personal');
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

    await expect(unifiedInboxService.retryMessage(1, 42, 'zalo_personal'))
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

    await expect(unifiedInboxService.retryMessage(1, 42, 'zalo_personal'))
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
      { actorUserId: employeeActorId, roleCode: 'employee' }
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
});
