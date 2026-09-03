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
});
