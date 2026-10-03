import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ZaloRateLimiter from '../zaloRateLimiter.js';
import campaignFlowService from '../campaignFlow.service.js';
import { estimateForCampaign, estimateForScript } from '../campaignEstimate.service.js';

/**
 * Mock ở RANH GIỚI (repository / service ngoài) với đúng hình dạng thật:
 * - `findCampaignZaloAccount` trả dòng `zalo_settings` snake_case (campaignZaloSender.repository.js:150);
 * - `mapCampaignZaloAccount` bản mô phỏng đúng đầu ra thật (campaignZaloSender.service.js:1627) cho các field dùng ở đây;
 * - `getCustomersFromDataNode` trả `{ items, dataLoadMeta }` (campaignNodeData.service.js:75);
 * - ZaloRateLimiter và campaignFlowService là module THẬT (thuần).
 * Mọi số TÍNH TAY, phép tính ghi ngay trong từng ca. Giờ VN = UTC+7, khung yên lặng 23:00–06:00.
 */
const vn = (text) => new Date(`${text}+07:00`);
const NOW = vn('2026-10-05T06:00:00');

// Cấu hình production (CLAUDE.md): 80–150 giây giữa hai tin, 100 tin/giờ.
const prodLimiter = () => new ZaloRateLimiter({
  ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT: 100,
  ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT: 80_000,
  ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT: 150_000,
  ZALO_OUTBOUND_QUIET_HOURS_START_SAFE: 23,
  ZALO_OUTBOUND_QUIET_HOURS_END_SAFE: 6,
});

const zaloRow = (id, over = {}) => ({
  id, id_user: 39, display_name: `Nick ${id}`, status: 'connected', is_active: true, is_default: false,
  zalo_personal_outbound_per_hour_limit: null, zalo_personal_outbound_delay_min_ms: null,
  zalo_personal_outbound_delay_max_ms: null, user_daily_send_limit: null, ...over,
});

const mapCampaignZaloAccount = (account) => ({
  id: String(account.id),
  userId: Number(account.id_user),
  displayName: account.display_name || 'Tài khoản Zalo',
  status: account.status,
  isActive: account.is_active === true,
  isDefault: account.is_default === true,
  ...(Number.parseInt(account.zalo_personal_outbound_delay_min_ms, 10) >= 0
    ? { zaloPersonalOutboundDelayMinMs: Number.parseInt(account.zalo_personal_outbound_delay_min_ms, 10) } : {}),
  ...(Number.parseInt(account.zalo_personal_outbound_delay_max_ms, 10) >= 0
    ? { zaloPersonalOutboundDelayMaxMs: Number.parseInt(account.zalo_personal_outbound_delay_max_ms, 10) } : {}),
  ...(Number.isFinite(Number.parseInt(account.user_daily_send_limit, 10))
    ? { userDailySendLimit: Number.parseInt(account.user_daily_send_limit, 10) } : {}),
});

const node = (id, subtype, config = {}, type = 'action') => ({
  id, id_campaign: 438, node_type: type, node_subtype: subtype, node_name: subtype, execution_order: Number(id), config,
});
const connect = (from, to) => ({ source_node_id: from, target_node_id: to });

const phones = (n) => Array.from({ length: n }, (_, i) => ({ phone: `09${String(10000000 + i)}` }));

function makeDeps(over = {}) {
  const state = {
    campaign: { id: 438, flow_json: null },
    nodes: [],
    connections: [],
    zaloRows: { 101: zaloRow(101) },
    sentToday: {},
    emailSettings: { id: 7, email: 'chu@shop.vn', user_daily_send_limit: null },
    dataItems: {},
  };
  Object.assign(state, over.state || {});
  const deps = {
    crud: {
      findCampaignById: jest.fn(async () => state.campaign),
      findNodesByCampaignId: jest.fn(async () => state.nodes),
      findConnectionsByCampaignId: jest.fn(async () => state.connections),
    },
    flow: campaignFlowService,
    nodeData: {
      getCustomersFromDataNode: jest.fn(async (dataNode) => {
        const entry = state.dataItems[String(dataNode.id)];
        if (entry instanceof Error) throw entry;
        return { items: entry || [], dataLoadMeta: {} };
      }),
    },
    zaloLimiter: prodLimiter(),
    emailDelay: { minMs: 50, maxMs: 250 },
    zaloSender: { mapCampaignZaloAccount, parseListText: (text) => Array.from(new Set(String(text || '').split(/[\n,;]/g).map((s) => s.trim()).filter(Boolean))) },
    zaloRepo: { findCampaignZaloAccount: jest.fn(async (id) => state.zaloRows[id] || null) },
    emailRepo: {
      findEmailSettingsById: jest.fn(async () => state.emailSettings),
      findDefaultEmailSettings: jest.fn(async () => state.emailSettings),
    },
    countZaloSentToday: jest.fn(async (id) => state.sentToday[id] || 0),
    countEmailSentToday: jest.fn(async () => 0),
    checkSendQuota: jest.fn(async () => ({ allowed: true })),
    getAdapterDescriptor: jest.fn(() => null),
    applyAccountDelayOverride: jest.fn((key, policy) => policy),
    estimateRepo: { findOtherCampaignsInUse: jest.fn(async () => ({ campaigns: [], schedules: [], nodes: [] })) },
    env: {},
    now: () => NOW,
    ...(over.deps || {}),
  };
  return { deps, state };
}

/** Chiến dịch 438: trigger → đọc sheet 798 SĐT → kết bạn → nhắn cá nhân, cùng nick 101. */
const campaign438Nodes = () => ([
  node(1, 'start', {}, 'trigger'),
  node(2, 'read_sheet', { sheetUrl: 'https://docs.google.com/spreadsheets/d/x' }, 'data'),
  node(3, 'send_zalo_friend_request', { zaloAccountId: '101', zaloFriendSource: 'node', zaloFriendNodeId: '2', zaloFriendField: 'phone' }),
  node(4, 'send_zalo_personal', {
    zaloAccountId: '101', zaloRecipientType: 'phone', zaloRecipientSource: 'node', zaloRecipientNodeId: '2', zaloRecipientField: 'phone',
  }),
]);
const campaign438Connections = () => [connect(1, 2), connect(2, 3), connect(3, 4)];

const codes = (result) => result.warnings.map((w) => w.code);

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('estimateForCampaign — chiến dịch kiểu 438 (1 nick, 2 node, 798 SĐT)', () => {
  it('đếm 798 người từ node sheet, 1.596 thao tác; xong 07/10 07:25:20 (80s) / 07/10 22:52:00 (115s) / 08/10 21:25:00 (150s)', async () => {
    // Bắt đầu 05/10 06:00. Mỗi node có trạng thái nhịp riêng; node B tin đầu gửi ngay sau tin cuối node A.
    // 80s: ngày = 61.200s/80 → k = 0..764 → 765 tin. A: 765 + 33 (ngày 2, cuối 06:00 + 32*80s = 06:42:40).
    //   B bắt đầu 06:42:40, tới 23:00 là 58.640s → k*80 < 58640 → k = 0..732 → 733 tin; còn 65 tin ngày 3:
    //   cuối 06:00 + 64*80s = 07:25:20 (07/10).
    // 115s: ngày → k*115 < 61200 → k = 0..532 → 533 tin. A: 533 + 265 (ngày 2, cuối 06:00 + 264*115s = 14:26:00).
    //   B bắt đầu 14:26:00, tới 23:00 là 30.840s → k*115 < 30840 → k = 0..268 → 269 tin; còn 529 tin ngày 3:
    //   cuối 06:00 + 528*115s = 06:00 + 16h52m = 22:52:00 (07/10).
    // 150s: ngày → k*150 < 61200 → k = 0..407 → 408 tin. A: 408 + 390 (ngày 2, cuối 06:00 + 389*150s = 22:12:30).
    //   B bắt đầu 22:12:30, tới 23:00 là 2.850s → k*150 < 2850 → k = 0..18 → 19 tin; còn 779 tin: ngày 3 = 408,
    //   ngày 4 = 371, cuối 06:00 + 370*150s = 06:00 + 15h25m = 21:25:00 (08/10).
    const { deps } = makeDeps({ state: { nodes: campaign438Nodes(), connections: campaign438Connections(), dataItems: { 2: phones(798) } } });
    const result = await estimateForCampaign({ campaignId: 438, ownerUserId: 39, startAt: NOW, deps });

    expect(result.totalActions).toBe(1596);
    expect(result.perNode.map((n) => [n.nodeId, n.recipients, n.actions])).toEqual([['3', 798, 798], ['4', 798, 798]]);
    expect(result.finishAtEarliest).toBe(vn('2026-10-07T07:25:20').toISOString());
    expect(result.finishAtTypical).toBe(vn('2026-10-07T22:52:00').toISOString());
    expect(result.finishAtLatest).toBe(vn('2026-10-08T21:25:00').toISOString());
    expect(codes(result)).toEqual(expect.arrayContaining(['multi_day', 'zalo_over_safe_daily', 'zalo_phone_lookup_unmodeled']));
    expect(result.warnings.find((w) => w.code === 'zalo_phone_lookup_unmodeled').params.nodes).toEqual(['3', '4']);
    expect(result.accounts).toEqual([{ key: 'zalo:101', channel: 'zalo', label: 'Nick 101', dailyLimit: null, sentToday: 0 }]);
    expect(deps.nodeData.getCustomersFromDataNode).toHaveBeenCalledTimes(1); // đọc node sheet MỘT lần cho cả hai node
  });

  it('đọc node sheet bị lỗi/timeout → KHÔNG ném: recipient_count_unknown, node đó 0 người', async () => {
    const { deps } = makeDeps({
      state: { nodes: campaign438Nodes(), connections: campaign438Connections(), dataItems: { 2: new Error('Sheet 504') } },
    });
    const result = await estimateForCampaign({ campaignId: 438, ownerUserId: 39, startAt: NOW, deps });
    expect(result.totalActions).toBe(0);
    const unknown = result.warnings.filter((w) => w.code === 'recipient_count_unknown');
    expect(unknown.map((w) => [w.params.nodeId, w.params.reason])).toEqual([['3', 'error'], ['4', 'error']]);
  });

  it('chiến dịch không tồn tại → null', async () => {
    const { deps } = makeDeps();
    deps.crud.findCampaignById.mockResolvedValueOnce(null);
    await expect(estimateForCampaign({ campaignId: 999, ownerUserId: 39, deps })).resolves.toBeNull();
  });
});

describe('estimateForCampaign — nick', () => {
  it('KHÔNG có node chọn tài khoản: node Zalo thứ hai dùng lại nick của node đầu (engine selectedZaloAccount), bỏ qua id riêng', async () => {
    const nodes = [
      node(1, 'start', {}, 'trigger'),
      node(2, 'send_zalo_personal', { zaloAccountId: '7', zaloRecipientSource: 'manual', zaloRecipientPhones: '0901000001\n0901000002' }),
      node(3, 'send_zalo_personal', { zaloAccountId: '8', zaloRecipientSource: 'manual', zaloRecipientPhones: '0902000001' }),
    ];
    const { deps } = makeDeps({ state: { nodes, connections: [connect(1, 2), connect(2, 3)], zaloRows: { 7: zaloRow(7), 8: zaloRow(8) } } });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(deps.zaloRepo.findCampaignZaloAccount.mock.calls.map(([id]) => id)).toEqual([7]);
    expect(result.perNode.map((n) => n.accounts)).toEqual([['zalo:7'], ['zalo:7']]);
    expect(result.totalActions).toBe(3);
  });

  it('select_zalo_account pool [1,2] → node gửi dùng CẢ HAI nick, người nhận chia đôi', async () => {
    // 4 người, 2 nick → 2 lô song song. Hai nick mới, lô 1 gửi ngay (06:00), lô 2 sau 115s (typical) = 06:01:55.
    const nodes = [
      node(1, 'start', {}, 'trigger'),
      node(2, 'select_zalo_account', { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['1', '2'], zaloAccountId: '9' }),
      node(3, 'send_zalo_personal', { zaloRecipientSource: 'manual', zaloRecipientPhones: '0901,0902,0903,0904' }),
    ];
    const { deps } = makeDeps({ state: { nodes, connections: [connect(1, 2), connect(2, 3)], zaloRows: { 1: zaloRow(1), 2: zaloRow(2), 9: zaloRow(9) } } });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(result.perNode[0].accounts).toEqual(['zalo:1', 'zalo:2']);
    expect(deps.zaloRepo.findCampaignZaloAccount.mock.calls.map(([id]) => id)).toEqual([1, 2]); // zaloAccountId sót lại (9) không dùng
    expect(result.finishAtTypical).toBe(vn('2026-10-05T06:01:55').toISOString());
    expect(result.perDay[0].perAccount).toEqual({ 'zalo:1': 2, 'zalo:2': 2 });
  });

  it('tốc độ ghi đè theo nick + trần ngày + đã gửi hôm nay được đọc từ tài khoản: trần 100, đã gửi 40, 150 người, 100s/tin', async () => {
    // Cùng phép tính ca "đã gửi 40 tin" của hàm thuần: ngày 1 còn 60 tin, ngày 2 còn 90 tin → xong 06/10 08:30:00.
    const nodes = [
      node(1, 'start', {}, 'trigger'),
      node(2, 'send_zalo_personal', { zaloAccountId: '101', zaloRecipientSource: 'manual', zaloRecipientPhones: Array.from({ length: 150 }, (_, i) => `0903${String(100000 + i)}`).join('\n') }),
    ];
    const { deps } = makeDeps({
      state: {
        nodes, connections: [connect(1, 2)],
        zaloRows: { 101: zaloRow(101, { zalo_personal_outbound_delay_min_ms: 100000, zalo_personal_outbound_delay_max_ms: 100000, user_daily_send_limit: 100 }) },
        sentToday: { 101: 40 },
      },
    });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(result.finishAtLatest).toBe(vn('2026-10-06T08:30:00').toISOString());
    expect(result.perDay.map((d) => d.actions)).toEqual([60, 90]);
    expect(result.warnings.find((w) => w.code === 'account_daily_limit').params).toEqual({ accountKey: 'zalo:101', limit: 100 });
    expect(result.accounts[0]).toMatchObject({ dailyLimit: 100, sentToday: 40 });
  });
});

describe('estimateForCampaign — email', () => {
  const emailNodes = (extra = {}) => ([
    node(1, 'start', {}, 'trigger'),
    node(2, 'send_email', {
      recipientSource: 'manual',
      recipientEmails: Array.from({ length: 166 }, (_, i) => `khach${i}@mail.vn`).join('\n'),
      emailSteps: [{ templateId: 5 }],
      ...extra,
    }),
  ]);

  it('166 thư, mặc định 60 thư/phút, 50–250ms → 122,3s / 131,5s, không cảnh báo nhiều ngày', async () => {
    // Cùng phép tính ca email của hàm thuần: nhanh nhất 122.300ms, chậm nhất 131.500ms.
    const { deps } = makeDeps({ state: { nodes: emailNodes(), connections: [connect(1, 2)] } });
    const result = await estimateForCampaign({ campaignId: 437, ownerUserId: 39, startAt: NOW, deps });
    expect(result.finishAtEarliest).toBe(new Date(NOW.getTime() + 122_300).toISOString());
    expect(result.finishAtLatest).toBe(new Date(NOW.getTime() + 131_500).toISOString());
    expect(codes(result)).not.toContain('multi_day');
    expect(result.accounts).toEqual([{ key: 'email:7', channel: 'email', label: 'chu@shop.vn', dailyLimit: null, sentToday: 0 }]);
  });

  it('biến môi trường SMTP_RATE_LIMIT_PER_MINUTE_ACCOUNT_7=30 được tôn trọng → nhanh nhất 300,8s', async () => {
    // 30 thư/phút: cửa sổ w0 = #1..#30, ..., w4 = #121..#150, w5 = #151..#166 bắt đầu 5*60.000 = 300.000ms.
    // #151 = 300.000 + 50 (ngủ) = 300.050; #166 = 300.050 + 15*50 = 300.800ms.
    const { deps } = makeDeps({ state: { nodes: emailNodes(), connections: [connect(1, 2)] }, deps: { env: { SMTP_RATE_LIMIT_PER_MINUTE_ACCOUNT_7: '30' } } });
    const result = await estimateForCampaign({ campaignId: 437, ownerUserId: 39, startAt: NOW, deps });
    expect(result.finishAtEarliest).toBe(new Date(NOW.getTime() + 300_800).toISOString());
  });

  it('chuỗi 3 bước cách 1 ngày (sendMode schedule, delayFrom prev) → bước 3 sau 2 ngày', async () => {
    const steps = [
      { templateId: 1 },
      { templateId: 2, delayValue: 1, delayUnit: 'days', delayFrom: 'prev' },
      { templateId: 3, delayValue: 1, delayUnit: 'days', delayFrom: 'prev' },
    ];
    const { deps } = makeDeps({
      state: {
        nodes: emailNodes({ recipientEmails: 'a@mail.vn', emailSteps: steps, sendMode: 'schedule' }),
        connections: [connect(1, 2)],
      },
      deps: { emailDelay: { minMs: 0, maxMs: 0 } },
    });
    const result = await estimateForCampaign({ campaignId: 437, ownerUserId: 39, startAt: vn('2026-10-05T10:00:00'), deps });
    expect(result.finishAtEarliest).toBe(vn('2026-10-07T10:00:00').toISOString());
    expect(result.totalActions).toBe(3);
  });
});

describe('estimateForCampaign — cảnh báo từ dữ kiện ngoài', () => {
  const oneZaloNode = () => ({
    nodes: [
      node(1, 'start', {}, 'trigger'),
      node(2, 'send_zalo_personal', { zaloAccountId: '101', zaloRecipientSource: 'manual', zaloRecipientPhones: '0901000001\n0901000002\n0901000003' }),
    ],
    connections: [connect(1, 2)],
  });

  it('hạn mức gói không đủ → plan_quota_insufficient với đúng số thao tác cần (qua checkSendQuota requiredCount)', async () => {
    const { deps } = makeDeps({ state: oneZaloNode() });
    deps.checkSendQuota.mockResolvedValueOnce({
      allowed: false, limitType: 'monthly', limit: 1000, currentCount: 999, resetAt: new Date('2026-11-01T00:00:00Z'), message: 'het',
    });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(deps.checkSendQuota).toHaveBeenCalledWith({ userId: 39, channel: 'zalo', requiredCount: 3 });
    expect(result.warnings.find((w) => w.code === 'plan_quota_insufficient').params).toEqual({
      channel: 'zalo', required: 3, limit: 1000, currentCount: 999, limitType: 'monthly', resetAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('hạn mức gói còn đủ → không cảnh báo; checkSendQuota ném lỗi → bỏ qua, không vỡ', async () => {
    const { deps } = makeDeps({ state: oneZaloNode() });
    const ok = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(codes(ok)).not.toContain('plan_quota_insufficient');
    deps.checkSendQuota.mockRejectedValueOnce(new Error('db down'));
    const failed = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(codes(failed)).not.toContain('plan_quota_insufficient');
  });

  it('nick đang được chiến dịch KHÁC dùng: run đang chạy và lịch bật trong 7 ngày được liệt kê; lịch 30 ngày nữa thì KHÔNG; không cộng vào số', async () => {
    const zaloNode = (campaignId, accountId) => ({ id_campaign: campaignId, id: campaignId * 10, node_type: 'action', node_subtype: 'send_zalo_personal', config: { zaloAccountId: String(accountId) } });
    const { deps } = makeDeps({ state: oneZaloNode() });
    deps.estimateRepo.findOtherCampaignsInUse.mockResolvedValueOnce({
      campaigns: [
        { id: 90, campaign_name: 'Đang chạy', is_running: true },
        { id: 91, campaign_name: 'Lịch hằng ngày', is_running: false },
        { id: 92, campaign_name: 'Lịch năm sau', is_running: false },
        { id: 93, campaign_name: 'Nick khác', is_running: true },
      ],
      schedules: [
        { id: 1, id_campaign: 91, schedule_type: 'daily', cron_expression: '0 9 * * *', enabled: true, last_run_at: null, created_at: '2026-10-01T00:00:00Z' },
        // cron 1 lần ngày 5/12 → cách NOW (05/10) > 7 ngày
        { id: 2, id_campaign: 92, schedule_type: 'once', cron_expression: '0 9 5 12 *', enabled: true, last_run_at: null, created_at: '2026-10-01T00:00:00Z' },
      ],
      nodes: [zaloNode(90, 101), zaloNode(91, 101), zaloNode(92, 101), zaloNode(93, 555)],
    });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    const shared = result.warnings.find((w) => w.code === 'shared_account');
    expect(shared.params).toEqual({
      accountKey: 'zalo:101',
      label: 'Nick 101',
      campaigns: [
        { id: 90, name: 'Đang chạy', reason: 'running' },
        { id: 91, name: 'Lịch hằng ngày', reason: 'scheduled' },
      ],
    });
    expect(result.totalActions).toBe(3); // tải của chiến dịch khác KHÔNG cộng vào
    expect(deps.estimateRepo.findOtherCampaignsInUse).toHaveBeenCalledWith({ ownerUserId: 39, excludeCampaignId: 1 });
  });

  it('tra chiến dịch khác bị lỗi → bỏ qua cảnh báo shared_account, ước tính vẫn trả về', async () => {
    const { deps } = makeDeps({ state: oneZaloNode() });
    deps.estimateRepo.findOtherCampaignsInUse.mockRejectedValueOnce(new Error('timeout'));
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(codes(result)).not.toContain('shared_account');
    expect(result.totalActions).toBe(3);
  });

  it('không có node gửi → no_send_node', async () => {
    const { deps } = makeDeps({ state: { nodes: [node(1, 'start', {}, 'trigger')], connections: [] } });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, deps });
    expect(codes(result)).toContain('no_send_node');
  });

  it('continuous=true → chỉ lượt đầu + cảnh báo continuous_mode', async () => {
    const { deps } = makeDeps({ state: oneZaloNode() });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: NOW, continuous: true, deps });
    expect(codes(result)).toContain('continuous_mode');
  });
});

describe('estimateForCampaign — startAt', () => {
  const sentTodayCampaign = () => {
    const nodes = [
      node(1, 'start', {}, 'trigger'),
      node(2, 'send_zalo_personal', {
        zaloAccountId: '101', zaloRecipientSource: 'manual',
        zaloRecipientPhones: Array.from({ length: 150 }, (_, i) => `0903${String(100000 + i)}`).join('\n'),
      }),
    ];
    return {
      nodes, connections: [connect(1, 2)],
      zaloRows: { 101: zaloRow(101, { zalo_personal_outbound_delay_min_ms: 100000, zalo_personal_outbound_delay_max_ms: 100000, user_daily_send_limit: 100 }) },
      sentToday: { 101: 40 },
    };
  };

  it('hẹn bắt đầu NGÀY KHÁC: số đã gửi hôm nay không trừ vào ngày đầu → 100 + 50 tin, xong 07/10 07:23:20', async () => {
    // Bắt đầu 06/10 06:00 (hôm nay là 05/10): ngày đầu đủ 100 tin (k = 0..99), ngày sau 50 tin: 06:01:40 + 49*100s
    // = 06:01:40 + 1h21m40s = 07:23:20 (07/10).
    const { deps } = makeDeps({ state: sentTodayCampaign() });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: vn('2026-10-06T06:00:00'), deps });
    expect(result.perDay.map((d) => [d.date, d.actions])).toEqual([['2026-10-06', 100], ['2026-10-07', 50]]);
    expect(result.finishAtLatest).toBe(vn('2026-10-07T07:23:20').toISOString());
  });

  it('startAt trong quá khứ → tính từ bây giờ (không ước tính về quá khứ)', async () => {
    const { deps } = makeDeps({ state: sentTodayCampaign() });
    const result = await estimateForCampaign({ campaignId: 1, ownerUserId: 39, startAt: vn('2026-10-01T06:00:00'), deps });
    expect(result.startAt).toBe(NOW.toISOString());
    expect(result.perDay.map((d) => d.actions)).toEqual([60, 90]); // vẫn trừ 40 đã gửi hôm nay
  });
});

describe('estimateForScript — chiến dịch chưa lưu (camelCase)', () => {
  it('nodeSubtype/sourceNodeId camelCase cho cùng kết quả đường với chiến dịch đã lưu', async () => {
    const script = {
      nodes: [
        { id: 'trg', nodeType: 'trigger', nodeSubtype: 'start', config: {} },
        { id: 'mail', nodeType: 'action', nodeSubtype: 'send_email', config: { recipientSource: 'manual', recipientEmails: 'a@x.vn,b@x.vn,c@x.vn' } },
      ],
      connections: [{ sourceNodeId: 'trg', targetNodeId: 'mail' }],
    };
    const { deps } = makeDeps();
    const result = await estimateForScript({ script, ownerUserId: 39, startAt: NOW, deps });
    expect(result.totalActions).toBe(3);
    expect(result.perNode[0]).toMatchObject({ nodeId: 'mail', channel: 'email', recipients: 3 });
    expect(deps.crud.findCampaignById).not.toHaveBeenCalled();
    expect(deps.estimateRepo.findOtherCampaignsInUse).not.toHaveBeenCalled(); // chưa lưu → chưa có "chiến dịch khác" cần loại trừ
  });
});
