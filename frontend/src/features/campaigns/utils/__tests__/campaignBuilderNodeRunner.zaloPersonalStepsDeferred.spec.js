/**
 * PLAN_GUI_NHANH_ZALO_PR3 Việc 3 — "Chạy thử" node Zalo cá nhân NHIỀU BƯỚC (template steps) phải
 * dừng gửi sớm khi backend báo 'deferred' (cổng nhịp / khoá tra số / giờ yên lặng), giống nhánh 1
 * bước. Trước đây `runZaloStepWave` chỉ gắn nhãn, vẫn gọi tiếp mọi người/bước còn lại.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';
import { buildSchemaFromRows } from '../campaignBuilderRuntime';

const DELAY_MS = 1000;

const deferredResponse = () => ({
  data: {
    data: {
      items: [{ recipient: 'x', status: 'deferred', reason: 'inter_message_delay', retryAfterMs: 60000, resumeAt: Date.now() + 60000 }],
    },
  },
});
const successResponse = () => ({
  data: { data: { items: [{ recipient: 'x', status: 'success' }] } },
});

const buildApi = (sendImpl) => ({
  getDelayConfig: vi.fn().mockResolvedValue({
    data: {
      success: true,
      data: {
        zalo_personal: { minMs: DELAY_MS, maxMs: DELAY_MS },
        zalo_friend: { minMs: DELAY_MS, maxMs: DELAY_MS },
        zalo_group: { minMs: DELAY_MS, maxMs: DELAY_MS },
        email: { minMs: 0, maxMs: 0 },
      },
    },
  }),
  getZaloTemplateById: vi.fn().mockImplementation(async (id) => ({
    data: { data: { id, bodyText: `Nội dung bước ${id}`, attachments: [] } },
  })),
  sendPreviewZaloPersonal: vi.fn().mockImplementation(sendImpl),
});

const buildRunner = (api) => createCampaignNodeRunner({
  campaignId: 1,
  apiService: api,
  buildSchemaFromRows,
  applyMappingsForRow: () => ({}),
  normalizeKey: (k) => k,
  parseEmailList: () => [],
  renderTemplateString: (t) => t,
  resolveColumnKey: vi.fn(),
  readPreviewSessionData: vi.fn(),
  writePreviewSessionData: vi.fn(),
  toastNotifier: { success: vi.fn(), error: vi.fn() },
  isRunCancelledError: () => false,
});

const account = { id: 'acc1', displayName: 'Nick', status: 'connected', isActive: true, isDefault: true };
const account2 = { id: 'acc2', displayName: 'Nick 2', status: 'connected', isActive: true, isDefault: false };
const buildCtx = (extra = {}) => ({
  selectedZaloAccount: account,
  nodeResultsById: {},
  templateCache: new Map(),
  ...extra,
});

const node = {
  id: 'n_personal_steps',
  data: {
    nodeType: 'send_zalo_personal',
    config: {
      zaloRecipientSource: 'manual',
      zaloRecipientPhones: '0900000001,0900000002,0900000003',
      zaloPersonalSendMode: 'all',
      zaloPersonalTemplateSteps: [
        { templateId: 1, delayValue: 0, delayUnit: 'minutes' },
        { templateId: 2, delayValue: 0, delayUnit: 'minutes' },
      ],
    },
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('send_zalo_personal nhiều bước — chạy thử dừng sớm khi bị hoãn (PR-3 Việc 3)', () => {
  it('1 TK: lần gọi đầu trả deferred → KHÔNG gọi API gửi thêm (2 bước x 3 người = 6 lượt, chỉ 1 lượt được gọi)', async () => {
    vi.useFakeTimers();
    const api = buildApi(deferredResponse);
    const runner = buildRunner(api);

    const promise = runner.buildRunResultForNode(node, buildCtx(), {});
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(api.sendPreviewZaloPersonal).toHaveBeenCalledTimes(1);
  });

  it('đối chứng: lần gọi thành công cả → đủ 6 lượt (dừng sớm không được cắt nhầm luồng bình thường)', async () => {
    vi.useFakeTimers();
    const api = buildApi(successResponse);
    const runner = buildRunner(api);

    const promise = runner.buildRunResultForNode(node, buildCtx(), {});
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(api.sendPreviewZaloPersonal).toHaveBeenCalledTimes(6);
  });

  it('pool 2 TK: lô đầu (2 request đang bay) trả deferred → KHÔNG lên lịch lô kế và KHÔNG chạy bước 2', async () => {
    vi.useFakeTimers();
    const api = buildApi(deferredResponse);
    const runner = buildRunner(api);
    const ctx = buildCtx({
      zaloPoolFromSelect: [account, account2],
      zaloAccounts: [account, account2],
    });

    const promise = runner.buildRunResultForNode(node, ctx, {});
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    // Lô đầu = 2 request song song (đã bay, không huỷ được); lô 2 (người thứ 3) và bước 2 không chạy.
    expect(api.sendPreviewZaloPersonal).toHaveBeenCalledTimes(2);
  });
});
