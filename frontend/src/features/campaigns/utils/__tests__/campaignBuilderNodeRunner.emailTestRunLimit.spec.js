/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, PR-5 (Việc 8) — nút "chạy thử" node send_email trong
 * trình dựng phải luôn có trần, kể cả khi người dùng KHÔNG bật giới hạn riêng. Trước PR này,
 * `maxSendEnabled=false` (mặc định của mọi node cũ) nghĩa là gửi preview cho TOÀN BỘ danh sách —
 * đây là cái phanh duy nhất của nút chạy thử, gỡ trắng nó là bấm thử một node bắn cho cả 1.000
 * người. Không đụng `config.maxSendEnabled`/`maxSendCount` đã lưu trên node — chỉ đổi cách hiểu.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';
import { buildSchemaFromRows, parseEmailList, renderTemplateString } from '../campaignBuilderRuntime';

const TEMPLATE = {
  id: 5,
  subject: 'Xin chào',
  bodyHtml: '<p>Nội dung</p>',
  bodyText: 'Nội dung',
  attachments: [],
};

const buildRunner = ({ sendPreviewEmail }) => createCampaignNodeRunner({
  campaignId: 1,
  apiService: {
    getEmailTemplateById: vi.fn().mockResolvedValue({ data: { data: TEMPLATE } }),
    sendPreviewEmail,
    // PLAN_GIOI_HAN_GUI_THEO_NGAY tiếp nối 2026-09-23, PR-6 Việc 2: getDelayRangeByChannel() thiếu
    // await đã được vá — trước đây thiếu mock này khiến resolveDelayConfig() rơi vào catch (fallback
    // 1000ms) MÀ delay vẫn ra NaN→0ms do bug thiếu await nên test luôn chạy tức thời "trùng hợp
    // đúng". Vá xong bug thì delay THẬT sự chờ 1000ms fallback mỗi bước, làm 30 người/29 bước vượt
    // timeout 5s của test. Mock minMs/maxMs = 0 để test vẫn chạy tức thời, đúng ý ban đầu của PR-5
    // (kiểm số lượng gửi, không kiểm giãn cách).
    getDelayConfig: vi.fn().mockResolvedValue({
      data: { success: true, data: { email: { minMs: 0, maxMs: 0 } } },
    }),
  },
  buildSchemaFromRows,
  applyMappingsForRow: () => ({}),
  normalizeKey: (k) => k,
  parseEmailList,
  renderTemplateString,
  resolveColumnKey: vi.fn(),
  readPreviewSessionData: vi.fn(),
  writePreviewSessionData: vi.fn(),
  toastNotifier: { success: vi.fn(), error: vi.fn() },
  isRunCancelledError: () => false,
});

const buildNode = (config) => ({
  id: 'node_send_email',
  data: { nodeType: 'send_email', config },
});

const manualEmails = (count) => Array.from({ length: count }, (_, i) => `nguoi${i}@example.com`).join(',');

const runNodeWithSpy = async (config) => {
  const sendPreviewEmail = vi.fn().mockResolvedValue({ data: { data: { messageId: 'm', tracking: null } } });
  const runner = buildRunner({ sendPreviewEmail });
  const node = buildNode(config);
  const ctx = { templateCache: new Map(), mapping: null };
  const result = await runner.buildRunResultForNode(node, ctx, {});
  return { result, sendPreviewEmail };
};

describe('send_email — trần cứng cho nút chạy thử (PR-5 Việc 8)', () => {
  it('config CŨ không có maxSendEnabled (undefined, giống mọi node trước PR này) + 30 người nhận → chỉ gửi thử tối đa 20', async () => {
    const { result, sendPreviewEmail } = await runNodeWithSpy({
      recipientSource: 'manual',
      recipientEmails: manualEmails(30),
      emailTemplateId: TEMPLATE.id,
    });

    expect(sendPreviewEmail).toHaveBeenCalledTimes(20);
    expect(result.output.meta.limitedTo).toBe(20);
    expect(result.output.meta.attempted).toBe(20);
    expect(result.input.maxSendCount).toBe(20);
  });

  it('maxSendEnabled: false tường minh + 25 người nhận → vẫn chặn ở 20, không phải gửi hết 25', async () => {
    const { sendPreviewEmail } = await runNodeWithSpy({
      recipientSource: 'manual',
      recipientEmails: manualEmails(25),
      emailTemplateId: TEMPLATE.id,
      maxSendEnabled: false,
    });

    expect(sendPreviewEmail).toHaveBeenCalledTimes(20);
  });

  it('danh sách CHỈ 5 người (dưới trần mặc định) → gửi đủ 5, không bớt thêm', async () => {
    const { result, sendPreviewEmail } = await runNodeWithSpy({
      recipientSource: 'manual',
      recipientEmails: manualEmails(5),
      emailTemplateId: TEMPLATE.id,
    });

    expect(sendPreviewEmail).toHaveBeenCalledTimes(5);
    expect(result.output.meta.limitedTo).toBe(20);
  });

  it('người dùng TỰ bật + đặt 3 → tôn trọng đúng số người dùng chọn (không bị ép về 20)', async () => {
    const { sendPreviewEmail } = await runNodeWithSpy({
      recipientSource: 'manual',
      recipientEmails: manualEmails(10),
      emailTemplateId: TEMPLATE.id,
      maxSendEnabled: true,
      maxSendCount: 3,
    });

    expect(sendPreviewEmail).toHaveBeenCalledTimes(3);
  });

  it('người dùng TỰ bật + đặt 500 (cao hơn trần mặc định) → vẫn tôn trọng lựa chọn của họ, không ép về 20', async () => {
    const { sendPreviewEmail } = await runNodeWithSpy({
      recipientSource: 'manual',
      recipientEmails: manualEmails(30),
      emailTemplateId: TEMPLATE.id,
      maxSendEnabled: true,
      maxSendCount: 500,
    });

    expect(sendPreviewEmail).toHaveBeenCalledTimes(30); // chỉ có 30 người trong danh sách, không đủ 500
  });
});
