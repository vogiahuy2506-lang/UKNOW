/**
 * P8b — "Chạy thử" trong trình dựng cho node send_telegram / send_whatsapp: GỬI THẬT tối đa 1 tin cho người đầu tiên qua
 * quick-send (thay cho nhánh cũ `dry_run_not_supported`). Ranh giới giả đúng hình dạng thật của axios:
 * `{ data: { data: { item } } }` (200 luôn kèm item.status = success|failed|deferred); lỗi toàn cục là HTTP error có `response`.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';
import { buildNodeSuccessValidation } from '../campaignBuilderRunExecutor';
import { buildSchemaFromRows } from '../campaignBuilderRuntime';
import { TEST_RUN_MAX_SEND_ADAPTER } from '../campaignBuilderAdapterTestSend';

const sentItem = (recipientKey) => ({ data: { data: { item: { recipientKey, status: 'success', messageId: 'm1' } } } });
const httpError = (status, message, code) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status, data: { message, code } },
});

const buildApi = (overrides = {}) => ({
  sendQuickAdapterMessage: vi.fn((channel, payload) => Promise.resolve(sentItem(payload.recipientKey))),
  getQuickSendAdapterConversations: vi.fn().mockResolvedValue({
    data: { data: [{ recipientKey: '1001', name: 'An' }, { recipientKey: '1002', name: 'Bình' }] },
  }),
  ...overrides,
});

const buildRunner = (apiService) => createCampaignNodeRunner({
  campaignId: 1,
  apiService,
  buildSchemaFromRows,
  isRunCancelledError: () => false,
});

const waNode = (config) => ({
  id: 'n-wa',
  data: { nodeType: 'send_whatsapp', config: { whatsappSessionKey: '40-default', steps: [{ message: 'Xin chào' }], ...config } },
});
const tgNode = (config) => ({
  id: 'n-tg',
  data: { nodeType: 'send_telegram', config: { telegramAccountId: '7', steps: [{ message: 'Xin chào' }], ...config } },
});

describe('chạy thử node WhatsApp/Telegram — gửi THẬT tối đa 1 người', () => {
  it('trần cứng là 1 (chặt hơn Zalo)', () => {
    expect(TEST_RUN_MAX_SEND_ADAPTER).toBe(1);
  });

  it('WhatsApp nhập tay 3 số -> gọi quick-send ĐÚNG 1 lần cho số đầu, đúng kênh/tài khoản/nội dung', async () => {
    const api = buildApi();
    const result = await buildRunner(api).buildRunResultForNode(
      waNode({ recipientSource: 'manual', recipientKeys: '0912345678\n0913345678\n0914345678' }),
      {},
      {}
    );
    expect(api.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    const [channel, payload, options] = api.sendQuickAdapterMessage.mock.calls[0];
    expect(channel).toBe('whatsapp');
    expect(payload).toEqual({ sessionKey: '40-default', recipientKey: '84912345678', message: 'Xin chào' });
    expect(options.idempotencyKey).toBeTruthy();
    expect(result.output.items).toHaveLength(1);
    expect(result.output.meta).toMatchObject({ attempted: 1, sent: 1, failed: 0, totalItems: 3, limitedTo: 1, realSend: true });
    expect(result.output.skipped).toBeUndefined();
    expect(result.output.ok).toBeUndefined();
  });

  it('báo rõ khi danh sách có nhiều người hơn trần (onProgress info)', async () => {
    const onProgress = vi.fn();
    await buildRunner(buildApi()).buildRunResultForNode(
      waNode({ recipientSource: 'manual', recipientKeys: '0912345678, 0913345678' }),
      {},
      { onProgress }
    );
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: 'info',
      message: expect.stringContaining('THẬT 1 tin'),
    }));
  });

  it('Telegram nguồn hội thoại: lấy hội thoại của tài khoản, gửi cho người ĐẦU TIÊN, accountId đúng', async () => {
    const api = buildApi();
    const result = await buildRunner(api).buildRunResultForNode(tgNode({ recipientSource: 'telegram_conversations' }), {}, {});
    expect(api.getQuickSendAdapterConversations).toHaveBeenCalledWith('telegram', '7', {});
    expect(api.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    expect(api.sendQuickAdapterMessage.mock.calls[0][0]).toBe('telegram');
    expect(api.sendQuickAdapterMessage.mock.calls[0][1]).toMatchObject({ accountId: '7', recipientKey: '1001' });
    expect(result.output.meta.totalItems).toBe(2);
  });

  it('Telegram nhóm đã chọn: gửi cho nhóm đầu (chat id âm)', async () => {
    const api = buildApi();
    await buildRunner(api).buildRunResultForNode(
      tgNode({
        recipientSource: 'telegram_groups',
        recipientKeys: [{ recipientKey: '-1001', display: 'Nhóm A' }, { recipientKey: '-1002', display: 'Nhóm B' }],
      }),
      {},
      {}
    );
    expect(api.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    expect(api.sendQuickAdapterMessage.mock.calls[0][1].recipientKey).toBe('-1001');
  });

  it('WhatsApp nhóm đã chọn: gửi jid @g.us nguyên vẹn (không chuẩn hoá SĐT)', async () => {
    const api = buildApi();
    await buildRunner(api).buildRunResultForNode(
      waNode({
        recipientSource: 'whatsapp_groups',
        recipientKeys: [{ recipientKey: '120363012345678901@g.us', display: 'Khách VIP' }, { recipientKey: '120363012345678902@g.us' }],
      }),
      {},
      {}
    );
    expect(api.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    expect(api.sendQuickAdapterMessage.mock.calls[0][1].recipientKey).toBe('120363012345678901@g.us');
  });

  it('WhatsApp nguồn khối dữ liệu: lấy dòng đầu, điền {{biến}} theo cột của DÒNG ĐÓ trước khi gửi', async () => {
    const api = buildApi();
    const ctx = {
      nodeResultsById: {
        'n-sheet': { output: { items: [{ sdt: '0912345678', 'Họ tên': 'Lan' }, { sdt: '0913345678', 'Họ tên': 'Mai' }] } },
      },
    };
    await buildRunner(api).buildRunResultForNode(
      waNode({
        recipientSource: 'node',
        recipientNodeId: 'n-sheet',
        recipientColumn: 'sdt',
        steps: [{ message: 'Chào {{ten}}, cảm ơn bạn' }],
      }),
      ctx,
      {}
    );
    expect(api.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    expect(api.sendQuickAdapterMessage.mock.calls[0][1]).toMatchObject({
      recipientKey: '84912345678',
      message: 'Chào Lan, cảm ơn bạn',
    });
  });

  it('kèm tệp đính kèm của bước đầu (chỉ các trường cần thiết)', async () => {
    const api = buildApi();
    await buildRunner(api).buildRunResultForNode(
      waNode({
        recipientSource: 'manual',
        recipientKeys: '0912345678',
        steps: [{ message: 'Báo giá', attachments: [{ key: 'uploads/40/a.pdf', name: 'a.pdf', size: 10, junk: 'x' }] }],
      }),
      {},
      {}
    );
    expect(api.sendQuickAdapterMessage.mock.calls[0][1].attachments).toEqual([
      { key: 'uploads/40/a.pdf', name: 'a.pdf', size: 10 },
    ]);
  });

  it('lỗi HTTP sau khi gọi API (409 chưa kết nối) -> KHÔNG ném (tránh trình chạy thử lại và gửi thật lần 2), item failed kèm câu lỗi', async () => {
    const api = buildApi({
      sendQuickAdapterMessage: vi.fn().mockRejectedValue(httpError(409, 'Tài khoản WhatsApp chưa kết nối — quét lại QR.', 'WHATSAPP_ACCOUNT_NOT_READY')),
    });
    const result = await buildRunner(api).buildRunResultForNode(
      waNode({ recipientSource: 'manual', recipientKeys: '0912345678' }),
      {},
      {}
    );
    expect(api.sendQuickAdapterMessage).toHaveBeenCalledTimes(1);
    expect(result.output.items[0]).toMatchObject({
      status: 'failed',
      errorCode: 'WHATSAPP_ACCOUNT_NOT_READY',
      error: 'Tài khoản WhatsApp chưa kết nối — quét lại QR.',
    });
    expect(result.output.meta).toMatchObject({ sent: 0, failed: 1 });
  });

  it('người nhận bị hoãn (deferred) -> item deferred, không tính là đã gửi', async () => {
    const api = buildApi({
      sendQuickAdapterMessage: vi.fn().mockResolvedValue({ data: { data: { item: { status: 'deferred', reason: 'quiet_hours' } } } }),
    });
    const result = await buildRunner(api).buildRunResultForNode(
      waNode({ recipientSource: 'manual', recipientKeys: '0912345678' }),
      {},
      {}
    );
    expect(result.output.meta).toMatchObject({ sent: 0, deferred: 1, failed: 0 });
  });

  it('thiếu tài khoản / nội dung / người nhận -> ném lỗi TRƯỚC khi gọi API (chưa gửi gì)', async () => {
    const api = buildApi();
    const runner = buildRunner(api);
    await expect(runner.buildRunResultForNode(waNode({ whatsappSessionKey: '', recipientSource: 'manual', recipientKeys: '0912345678' }), {}, {}))
      .rejects.toThrow(/tài khoản/i);
    await expect(runner.buildRunResultForNode(waNode({ recipientSource: 'manual', recipientKeys: '0912345678', steps: [{ message: '  ' }] }), {}, {}))
      .rejects.toThrow(/nội dung/i);
    await expect(runner.buildRunResultForNode(waNode({ recipientSource: 'manual', recipientKeys: 'abc' }), {}, {}))
      .rejects.toThrow(/người nhận/i);
    expect(api.sendQuickAdapterMessage).not.toHaveBeenCalled();
  });

  it('huỷ chạy (AbortError) được ném lên để trình chạy dừng, không bị nuốt thành item failed', async () => {
    const abort = Object.assign(new Error('canceled'), { name: 'AbortError' });
    const api = buildApi({ sendQuickAdapterMessage: vi.fn().mockRejectedValue(abort) });
    await expect(buildRunner(api).buildRunResultForNode(
      waNode({ recipientSource: 'manual', recipientKeys: '0912345678' }),
      {},
      {}
    )).rejects.toBe(abort);
  });

  it('node lạ KHÁC vẫn rơi vào nhánh mặc định {ok:true} — không phá hành vi cũ', async () => {
    const result = await buildRunner(buildApi()).buildRunResultForNode(
      { id: 'n2', data: { nodeType: 'some_future_unknown_node_type', config: {} } },
      {},
      {}
    );
    expect(result.output).toEqual({ ok: true });
  });
});

describe('buildNodeSuccessValidation — send_telegram / send_whatsapp (chạy thử gửi thật)', () => {
  const resultOf = (meta, items = []) => ({ output: { meta, items } });

  it('đã gửi -> success, nói rõ "THẬT"', () => {
    const v = buildNodeSuccessValidation('send_whatsapp', resultOf({ sent: 1, attempted: 1, totalItems: 5 }));
    expect(v.status).toBe('success');
    expect(v.message).toContain('THẬT');
    expect(v.message).toContain('WhatsApp');
    expect(v.message).toContain('1/5');
  });

  it('bị hoãn -> success nhưng nói CHƯA gửi', () => {
    const v = buildNodeSuccessValidation('send_telegram', resultOf({ sent: 0, deferred: 1, attempted: 1, totalItems: 1 }));
    expect(v.status).toBe('success');
    expect(v.message).toContain('Chưa gửi');
  });

  it('thất bại -> failed kèm câu lỗi (dừng luồng chạy thử)', () => {
    const v = buildNodeSuccessValidation('send_whatsapp', resultOf({ sent: 0, failed: 1 }, [{ status: 'failed', error: 'Khách đã từ chối nhận tin' }]));
    expect(v.status).toBe('failed');
    expect(v.message).toContain('Khách đã từ chối nhận tin');
  });
});
