/**
 * LENH_GIAO_GIOI_HAN_GUI_THEO_NGAY tiếp nối 2026-09-23, PR-6 — 3 nút chạy thử Zalo (cá nhân/kết
 * bạn/nhóm) không được bắn liên tục không nghỉ từ nick thật:
 *
 * Việc 1: bỏ giãn cách trước tin ĐẦU TIÊN (không có tin nào trước nó để mà giãn cách).
 * Việc 2: getDelayRangeByChannel() thiếu await → delay luôn ra NaN→0ms, vá xong thì delay THẬT.
 * Việc 3: đếm ngược bắn qua onProgress mỗi giây giữa 2 lần gửi, huỷ giữa chừng dừng ngay.
 * Việc 4: trần cứng 3 người/nhóm cho cả 3 nút — không có trần thì sheet 1.000 số bắn cả 1.000.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';
import { buildSchemaFromRows } from '../campaignBuilderRuntime';

/** minMs=maxMs để delay xác định, không phải random trong khoảng — dễ kiểm bằng fake timers. */
const FIXED_ZALO_DELAY_MS = 2000;

const buildApiService = (overrides = {}) => ({
  getDelayConfig: vi.fn().mockResolvedValue({
    data: {
      success: true,
      data: {
        zalo_personal: { minMs: FIXED_ZALO_DELAY_MS, maxMs: FIXED_ZALO_DELAY_MS },
        zalo_friend: { minMs: FIXED_ZALO_DELAY_MS, maxMs: FIXED_ZALO_DELAY_MS },
        zalo_group: { minMs: FIXED_ZALO_DELAY_MS, maxMs: FIXED_ZALO_DELAY_MS },
        email: { minMs: 0, maxMs: 0 },
      },
    },
  }),
  sendPreviewZaloPersonal: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  sendPreviewZaloFriendRequest: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  sendPreviewZaloGroup: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  ...overrides,
});

const buildRunner = (apiOverrides = {}) => createCampaignNodeRunner({
  campaignId: 1,
  apiService: buildApiService(apiOverrides),
  buildSchemaFromRows,
  applyMappingsForRow: () => ({}),
  normalizeKey: (k) => k,
  parseEmailList: () => [],
  renderTemplateString: (text) => text,
  resolveColumnKey: vi.fn(),
  readPreviewSessionData: vi.fn(),
  writePreviewSessionData: vi.fn(),
  toastNotifier: { success: vi.fn(), error: vi.fn() },
  isRunCancelledError: () => false,
});

const account = { id: 'acc1', displayName: 'Nick chăm sóc', status: 'connected', isActive: true, isDefault: true };
const buildCtx = () => ({ selectedZaloAccount: account, nodeResultsById: {}, templateCache: new Map() });

const phones = (count) => Array.from({ length: count }, (_, i) => `090000${String(i + 1).padStart(4, '0')}`).join(',');

const personalNode = (config) => ({ id: 'n_personal', data: { nodeType: 'send_zalo_personal', config } });
const friendNode = (config) => ({ id: 'n_friend', data: { nodeType: 'send_zalo_friend_request', config } });
const groupNode = (config) => ({ id: 'n_group', data: { nodeType: 'send_zalo_group', config } });

afterEach(() => {
  vi.useRealTimers();
});

describe('send_zalo_personal — chạy thử (PR-6)', () => {
  it('Việc 1: 1 người nhận → gửi ngay, KHÔNG chờ trước tin đầu tiên', async () => {
    vi.useFakeTimers();
    const runner = buildRunner();
    const node = personalNode({
      zaloRecipientSource: 'manual',
      zaloRecipientPhones: phones(1),
      zaloMessage: 'Xin chào',
    });

    // KHÔNG advance timer nào — nếu code còn chờ setTimeout trước khi gửi, promise sẽ treo mãi và
    // test tự đỏ vì vượt timeout mặc định của vitest.
    const result = await runner.buildRunResultForNode(node, buildCtx(), {});

    expect(result.output.meta.attempted).toBe(0); // mock trả items:[] nên không có kết quả đẩy vào, chỉ cần xác nhận gọi API
  });

  it('Việc 1: xác nhận API thật sự được gọi ngay (không phải "không gọi gì cả")', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const node = personalNode({ zaloRecipientSource: 'manual', zaloRecipientPhones: phones(1), zaloMessage: 'Hi' });

    await runner.buildRunResultForNode(node, buildCtx(), {});

    expect(api.sendPreviewZaloPersonal).toHaveBeenCalledTimes(1);
  });

  it('Việc 4: 5 người nhận → chỉ gửi 3, onProgress báo đã chạm trần chạy thử', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const onProgress = vi.fn();
    const node = personalNode({ zaloRecipientSource: 'manual', zaloRecipientPhones: phones(5), zaloMessage: 'Hi' });

    const result = await runner.buildRunResultForNode(node, buildCtx(), { onProgress });

    expect(api.sendPreviewZaloPersonal).toHaveBeenCalledTimes(1);
    const [callArg] = api.sendPreviewZaloPersonal.mock.calls[0];
    expect(callArg.recipients).toHaveLength(3);
    expect(result.output.meta.limitedTo).toBe(3);
    expect(result.output.meta.totalAvailable).toBe(5);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('giới hạn tối đa 3 người'),
    }));
  });

  it('Việc 4: danh sách CHỈ 2 người (dưới trần) → gửi đủ 2, không báo chạm trần', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const onProgress = vi.fn();
    const node = personalNode({ zaloRecipientSource: 'manual', zaloRecipientPhones: phones(2), zaloMessage: 'Hi' });

    await runner.buildRunResultForNode(node, buildCtx(), { onProgress });

    const [callArg] = api.sendPreviewZaloPersonal.mock.calls[0];
    expect(callArg.recipients).toHaveLength(2);
    expect(onProgress.mock.calls.some((c) => String(c[0]?.message || '').includes('giới hạn tối đa'))).toBe(false);
  });
});

describe('send_zalo_friend_request — chạy thử (PR-6)', () => {
  const baseConfig = (phoneCount) => ({
    zaloFriendSource: 'manual',
    zaloFriendPhones: phones(phoneCount),
    zaloFriendContentMode: 'manual',
    zaloFriendRequestMessage: 'Kết bạn nhé',
  });

  it('Việc 4: 5 người → chỉ gửi 3 lời mời kết bạn', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const node = friendNode(baseConfig(5));

    const resultPromise = runner.buildRunResultForNode(node, buildCtx(), {});
    await vi.advanceTimersByTimeAsync(FIXED_ZALO_DELAY_MS * 3 + 500);
    await resultPromise;

    expect(api.sendPreviewZaloFriendRequest).toHaveBeenCalledTimes(3);
  });

  it('Việc 2+3: đếm ngược giữa 2 lời mời — bắn onProgress mỗi giây, số giây tụt dần, đúng định dạng "(2/2)"', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const onProgress = vi.fn();
    const node = friendNode(baseConfig(2));

    const resultPromise = runner.buildRunResultForNode(node, buildCtx(), { onProgress });
    await vi.advanceTimersByTimeAsync(FIXED_ZALO_DELAY_MS + 500);
    await resultPromise;

    const countdownMsgs = onProgress.mock.calls
      .map((c) => c[0]?.message)
      .filter((m) => String(m || '').includes('Đang chờ'));
    expect(countdownMsgs).toEqual([
      'Đang chờ 2 giây trước tin kế tiếp (2/2) — giãn cách chống spam',
      'Đang chờ 1 giây trước tin kế tiếp (2/2) — giãn cách chống spam',
    ]);
  });

  it('Việc 3: bấm Huỷ giữa lúc đang đếm ngược → dừng ngay, không gửi tin thứ hai', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const node = friendNode(baseConfig(2));
    const controller = new AbortController();

    const resultPromise = runner.buildRunResultForNode(node, buildCtx(), { signal: controller.signal });
    const assertionPromise = expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
    // Cho tin đầu gửi xong (index=0, không chờ) rồi vào giữa bước đếm ngược trước tin thứ hai.
    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await assertionPromise;

    expect(api.sendPreviewZaloFriendRequest).toHaveBeenCalledTimes(1);
  });

  it('Việc 1: 1 người → gửi ngay không chờ (không có template steps riêng cho kết bạn nên đây là ca đơn giản nhất)', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const node = friendNode(baseConfig(1));

    await runner.buildRunResultForNode(node, buildCtx(), {});

    expect(api.sendPreviewZaloFriendRequest).toHaveBeenCalledTimes(1);
  });
});

describe('send_zalo_group — chạy thử (PR-6)', () => {
  it('Việc 1: 1 nhóm → gửi ngay, KHÔNG chờ', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const node = groupNode({ zaloGroupSource: 'manual', zaloGroupIds: '1111111111', zaloGroupMessage: 'Thông báo' });

    await runner.buildRunResultForNode(node, buildCtx(), {});

    expect(api.sendPreviewZaloGroup).toHaveBeenCalledTimes(1);
  });

  it('Việc 4: 5 nhóm → chỉ gửi 3, onProgress báo đã chạm trần', async () => {
    vi.useFakeTimers();
    const api = buildApiService();
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k, parseEmailList: () => [],
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const onProgress = vi.fn();
    const fiveGroupIds = Array.from({ length: 5 }, (_, i) => `${i + 1}111111111`).join(',');
    const node = groupNode({ zaloGroupSource: 'manual', zaloGroupIds: fiveGroupIds, zaloGroupMessage: 'Thông báo' });

    const result = await runner.buildRunResultForNode(node, buildCtx(), { onProgress });

    const [callArg] = api.sendPreviewZaloGroup.mock.calls[0];
    expect(callArg.groupIds).toHaveLength(3);
    expect(result.output.meta.limitedTo).toBe(3);
    expect(result.output.meta.totalAvailable).toBe(5);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('giới hạn tối đa 3 nhóm'),
    }));
  });
});

describe('send_email — chạy thử vẫn ngủ im lặng như cũ, không đổi hành vi (PR-6 nghiệm thu)', () => {
  it('waitRandomTemplateStepDelay kênh email KHÔNG đếm ngược dù đã vá thiếu await', async () => {
    vi.useFakeTimers();
    const api = buildApiService({
      getEmailTemplateById: vi.fn().mockResolvedValue({
        data: { data: { id: 9, subject: 'Xin chào', bodyHtml: '<p>Hi</p>', bodyText: 'Hi', attachments: [] } },
      }),
      sendPreviewEmail: vi.fn().mockResolvedValue({ data: { data: { messageId: 'm', tracking: null } } }),
    });
    const runner = createCampaignNodeRunner({
      campaignId: 1, apiService: api, buildSchemaFromRows,
      applyMappingsForRow: () => ({}), normalizeKey: (k) => k,
      parseEmailList: (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean),
      renderTemplateString: (t) => t, resolveColumnKey: vi.fn(), readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(), toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });
    const onProgress = vi.fn();
    const node = {
      id: 'n_email',
      data: {
        nodeType: 'send_email',
        config: { recipientSource: 'manual', recipientEmails: phones(2).replace(/09/g, 'a@') , emailTemplateId: 9 },
      },
    };

    await runner.buildRunResultForNode(node, buildCtx(), { onProgress });

    const countdownMsgs = onProgress.mock.calls
      .map((c) => c[0]?.message)
      .filter((m) => String(m || '').includes('Đang chờ'));
    expect(countdownMsgs).toHaveLength(0);
  });
});
