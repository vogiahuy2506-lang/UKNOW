/**
 * Tái hiện triệu chứng production: UI hiện "Đã gửi 19/200" nhưng thực tế Zalo chỉ nhận ~5 tin.
 *
 * Hai cơ chế độc lập cùng tạo ra chênh lệch:
 *
 *  1. Bộ đếm tiến độ là "số lần ĐÃ XỬ LÝ" (successfulSends + failedSends + skippedSends),
 *     không phải "số tin đã tới nơi". Mọi người nhận bị lỗi/bỏ qua vẫn cộng vào bộ đếm.
 *
 *  2. Zalo có thể NHẬN lệnh gửi và trả msgId > 0 nhưng KHÔNG phát tin (anti-spam / giới hạn nhắn
 *     người lạ). Backend không có kênh xác nhận lại từ Zalo, nên ghi status='sent' và cộng
 *     successfulSends. Không tồn tại tín hiệu nào ở phía backend để phát hiện 14 tin bị Zalo âm thầm
 *     bỏ — đó là lý do chênh lệch KHÔNG THỂ tái hiện/đo bằng mock mà chỉ đo được khi đối chiếu
 *     với thiết bị nhận thật.
 *
 * Spec này khóa lại HÀNH VI (counter + cách ghi sent) để khi có bản vá, số liệu hiển thị
 * không còn đếm sai — và để tài liệu hoá rõ phần nào KHÔNG thể kiểm chứng bằng test.
 */

process.env.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = '1';
process.env.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = '2';
process.env.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS = '1';
process.env.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS = '2';
process.env.ZALO_PERSONAL_PER_HOUR_LIMIT = '1000';
process.env.ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT = '1000';
// 0 = tắt trần đếm lỗi → mỗi lần thử hỏng được tính failedSends (đo đúng cơ chế "bộ đếm đếm
// cả lần hỏng"). Khác 3 (mặc định) thì lần hỏng đầu chỉ ghi sổ cái, không cộng failedSends.
process.env.ZALO_ONESHOT_MAX_SEND_FAILURES = '0';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockMergeRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();
const mockUpsertRecipientProgress = jest.fn().mockResolvedValue(null);
const mockGetRecipientProgress = jest.fn().mockResolvedValue({ lastCompletedStep: 0 });
const mockCountFailedByRecipientAndError = jest.fn().mockResolvedValue(0);
const mockMarkPhoneUnreachableFromError = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockResolvedValue({
      id: 200,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      run_metadata: { source: 'campaign_run' },
    }),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: mockPatchRunMetadata,
    mergeRunMetadata: mockMergeRunMetadata,
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: mockFinalizeRun,
    failRun: mockFailRun,
    completeRunWithError: jest.fn().mockResolvedValue(null),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: jest.fn().mockResolvedValue({
      id: 383,
      id_user: 10,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: jest.fn(() => Promise.resolve([
      {
        id: 500,
        node_type: 'data',
        node_subtype: 'read_sheet',
        execution_order: 1,
        config: {},
      },
      {
        id: 300,
        node_type: 'action',
        node_subtype: 'send_zalo_personal',
        execution_order: 2,
        config: {
          zaloAccountId: 99,
          zaloRecipientSource: 'node',
          zaloRecipientNodeId: '500',
          zaloRecipientType: 'phone',
          zaloRecipientField: 'phone',
          zaloPersonalTemplateSteps: [{ stepIndex: 1, templateId: 1 }],
        },
      },
    ])),
    findConnectionsByCampaignId: jest.fn().mockResolvedValue([]),
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {
    flowJsonHasZaloPersonalMultiAccount: jest.fn().mockReturnValue(false),
    buildExecutionOrderMap: jest.fn((nodes) => new Map(nodes.map((node, index) => [String(node.id), index + 1]))),
    buildFlowNodeIdMap: jest.fn().mockReturnValue(new Map()),
    normalizeNodeReferenceConfig: jest.fn((config) => config),
    buildSchemaFromRows: jest.fn(() => []),
    buildNodeSuccessMessage: jest.fn(() => 'OK'),
  },
}));

jest.unstable_mockModule('../campaignNodeData.service.js', () => ({
  default: {
    getCustomersFromDataNode: mockGetCustomersFromDataNode,
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: jest.fn().mockResolvedValue({
      id: 99,
      userId: 10,
      displayName: 'Tài khoản Zalo cá nhân',
    }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-test'),
    resolveUidFromRecipient: jest.fn(async ({ recipient }) => ({
      uid: `uid-${recipient}`,
      zaloName: `User ${recipient}`,
    })),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    buildTrackedMessageText: jest.fn(async ({ message }) => ({ message })),
    sendPersonalMessageQueued: mockSendPersonalMessageQueued,
    annotateZaloSendError: jest.fn((err) => err),
    extractZaloSendObservability: jest.fn((error) => ({
      stage: 'send',
      message: String(error?.message || error || '').trim(),
    })),
  },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: {
    findContentByIdForUser: jest.fn().mockResolvedValue({
      id: 1,
      body_text: 'Xin chào bạn, đây là tin nhắn kiểm tra.',
      attachments: [],
    }),
  },
}));

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: {
    normalizePhone: jest.fn((raw) => String(raw || '').trim()),
    isPhoneUnreachable: jest.fn().mockResolvedValue(false),
    isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false),
    getBoundSenderAccountId: jest.fn().mockResolvedValue(null),
    bindSenderAccount: jest.fn().mockResolvedValue(null),
    markPhoneUnreachableFromError: mockMarkPhoneUnreachableFromError,
  },
}));

jest.unstable_mockModule('../../../repositories/customer/customerMutation.repository.js', () => ({
  default: {
    findZaloFriendCustomerByPhone: jest.fn().mockResolvedValue(null),
    insertZaloFriendCustomer: jest.fn().mockResolvedValue(555),
    updateZaloFriendCustomerByPhone: jest.fn().mockResolvedValue(null),
    findZaloPersonalCustomerByIdentifiers: jest.fn().mockResolvedValue(null),
    insertZaloPersonalCustomer: jest.fn().mockResolvedValue(123),
    updateZaloPersonalCustomerWithIdentifiers: jest.fn().mockResolvedValue(null),
    upsertZaloCustomerUidByPhone: jest.fn().mockResolvedValue(null),
    updateCustomerZaloUidIfEmpty: jest.fn().mockResolvedValue(null),
    findKnownZaloUidByPhone: jest.fn().mockResolvedValue(''),
  },
}));

jest.unstable_mockModule('../../../repositories/customer/customerZaloTracking.repository.js', () => ({
  default: {
    insertZaloSentJourney: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    setPhoneLookupCooldown: jest.fn().mockResolvedValue(undefined),
    listActivePhoneLookupCooldowns: jest.fn().mockResolvedValue([]),
    findSettingByAccountId: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: {
    logExecutionNode: mockLogExecutionNode,
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: mockGetRecipientProgress,
    upsertRecipientProgress: mockUpsertRecipientProgress,
    countPendingDue: jest.fn().mockResolvedValue({
      pending_count: 0,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: null,
    }),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: {
    findExistingSentCampaignZaloMessageCrossRun: jest.fn().mockResolvedValue(null),
    insertCampaignZaloMessage: jest.fn().mockResolvedValue(1),
    markAbandonedIfStillQueued: jest.fn().mockResolvedValue(undefined),
    mergeZaloMessageTrackingMetadata: jest.fn().mockResolvedValue(undefined),
    withTransaction: jest.fn((callback) => callback({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
    linkQuotaReservation: jest.fn().mockResolvedValue(undefined),
    updateStatusByTrackingToken: jest.fn().mockResolvedValue(undefined),
    findExistingSentCampaignZaloMessage: jest.fn().mockResolvedValue(null),
    countFailedByRecipientAndError: mockCountFailedByRecipientAndError,
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-13T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

async function runCampaignPumpingTimers(...args) {
  const runPromise = campaignRunService.executeCampaign(...args);
  for (let i = 0; i < 60; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await jest.advanceTimersByTimeAsync(5000);
  }
  return runPromise;
}

const makeRecipients = (count) => Array.from({ length: count }, (_, index) => ({
  phone: `0900000${String(index).padStart(4, '0')}`,
  name: `Khách ${index + 1}`,
}));

/**
 * Lấy bộ đếm cuối cùng mà backend ghi xuống campaign_runs.
 */
const getFinalCounters = () => {
  const call = mockFinalizeRun.mock.calls.at(-1);
  return call ? call[2] : null;
};

/**
 * Lấy chuỗi tiến độ cuối cùng hiển thị cho người dùng ("Đã gửi X/Y").
 */
const getLastProgressMessage = () => {
  const call = mockLogExecutionNode.mock.calls.at(-1);
  const data = call?.[0]?.executionData;
  const items = Array.isArray(data?.items) ? data.items : [];
  const lastItem = items.at(-1);
  return lastItem?.messageText || null;
};

describe('Zalo cá nhân — bộ đếm tiến độ vs tin thật tới nơi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 giờ VN (ngoài khung giờ yên lặng 23h–6h).
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockGetRecipientProgress.mockResolvedValue({ lastCompletedStep: 0 });
    mockCountFailedByRecipientAndError.mockResolvedValue(0);
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockSendPersonalMessageQueued.mockResolvedValue({
      messageId: 'msg-1',
      response: { msgId: 'msg-1' },
      quotaReservationId: 88,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('Cơ chế 1 — Zalo trả msgId>0 cho cả 19 tin nhưng chỉ 5 tin tới nơi: backend ghi "sent" cho cả 19, không có tín hiệu nào để phát hiện 14 tin bị Zalo bỏ', async () => {
    // Mô phỏng đúng tình huống production: API Zalo trả msgId hợp lệ (nên backend coi là thành công),
    // nhưng Zalo âm thầm bỏ 14 tin (anti-spam / giới hạn nhắn người lạ).
    const DELIVERED = 5;
    let index = 0;
    const actuallyDelivered = [];
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: makeRecipients(19),
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockImplementation(async ({ recipient }) => {
      index += 1;
      if (index <= DELIVERED) actuallyDelivered.push(recipient);
      // Cả 19 lần đều trả msgId > 0 → không có tín hiệu nào cho biết tin có tới nơi hay không.
      return {
        messageId: `msg-${index}`,
        response: { msgId: `msg-${index}` },
        quotaReservationId: 88,
      };
    });

    await runCampaignPumpingTimers(383, 200, 10);

    const counters = getFinalCounters();
    // Backend coi 19/19 là đã gửi thành công.
    expect(counters).toMatchObject({ successfulSends: 19, failedSends: 0 });
    expect(actuallyDelivered).toHaveLength(DELIVERED);
    // ...nhưng thực tế chỉ 5 tin tới nơi → chênh lệch 14 tin KHÔNG THỂ phát hiện từ phía backend.
    expect(counters.successfulSends - actuallyDelivered.length).toBe(14);
    // Bản vá: UI không được nhặt chung "đã gửi" với "đã xử lý" → khi không có lỗi/bỏ qua thì
    // vẫn hiện "Đã gửi 19/19" (không phá khuôn hiển thị cũ). Ở case này KHÔNG có tín hiệu nào
    // cho biết 14 tin bị Zalo bỏ, nên hệ thống KHÔNG THỂ tự thêm ghi chú — xem test kế bên.
    expect(getLastProgressMessage()).toBe('Đã gửi 19/19');
  }, 30000);

  it('Cơ chế 2 — bộ đếm "Đã gửi" PHẢI tách khỏi "đã xử lý": 10 tin thật + 10 lần hỏng → UI hiện "Đã gửi 10/20 (không tới nơi: 10)", không phải "Đã gửi 20/20"', async () => {
    let index = 0;
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: makeRecipients(20),
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockImplementation(async () => {
      index += 1;
      if (index <= 10) {
        return {
          messageId: `msg-${index}`,
          response: { msgId: `msg-${index}` },
          quotaReservationId: 88,
        };
      }
      throw new Error('Zalo không xác nhận phát tin');
    });

    await runCampaignPumpingTimers(383, 200, 10);

    const counters = getFinalCounters();
    expect(counters).toMatchObject({ successfulSends: 10, failedSends: 10 });
    // Bản vá: chuỗi tiến độ tách rõ số tin GỬI THẬT và số không tới nơi.
    expect(getLastProgressMessage()).toBe('Đã gửi 10/20 (không tới nơi: 10)');
  }, 30000);

  it('Cơ chế 2b — người nhận bị BỎ QUA (không tìm thấy trên Zalo) cũng phải hiện riêng, không gộp vào "đã gửi"', async () => {
    let index = 0;
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: makeRecipients(19),
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockImplementation(async () => {
      index += 1;
      if (index <= 5) {
        return {
          messageId: `msg-${index}`,
          response: { msgId: `msg-${index}` },
          quotaReservationId: 88,
        };
      }
      const err = new Error('Không tìm thấy user zalo theo số 09000000012');
      err.code = 'zalo_unreachable_contact';
      throw err;
    });

    await runCampaignPumpingTimers(383, 200, 10);

    const counters = getFinalCounters();
    expect(counters).toMatchObject({ successfulSends: 5, failedSends: 0, skippedSends: 14 });
    expect(getLastProgressMessage()).toBe('Đã gửi 5/19 (không tới nơi: 14)');
  }, 30000);

  it('Hệ quả — mỗi lần hỏng vẫn ghi 1 dòng zalo_messages với tracking status=failed (đối chiếu được với dữ liệu thật)', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: makeRecipients(1),
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Zalo không xác nhận phát tin'));

    await runCampaignPumpingTimers(383, 200, 10);

    const counters = getFinalCounters();
    expect(counters.failedSends).toBe(1);
    expect(counters.successfulSends).toBe(0);
  }, 30000);
});
