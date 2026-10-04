import { describe, it, expect } from '@jest/globals';
import { estimateCampaignSend, vnDayKey } from '../campaignSendEstimate.util.js';

/**
 * Mọi số dưới đây TÍNH TAY (phép tính ghi ngay trong từng ca), không chép từ đầu ra của hàm.
 * Quy ước: giờ VN = UTC+7; khung yên lặng Zalo 23:00–06:00; "t0" = mốc bắt đầu.
 */
const vn = (text) => new Date(`${text}+07:00`);
const SEC = 1000;
const HOUR = 3600 * SEC;
const DAY = 24 * HOUR;

const zaloAccount = (over = {}) => ({
  key: '101',
  minDelayMs: 100 * SEC,
  maxDelayMs: 100 * SEC,
  perHourLimit: 100,
  dailyLimit: null,
  sentToday: 0,
  quietHours: { start: 23, end: 6 },
  ...over,
});

const emailAccount = (over = {}) => ({
  key: 'email:7',
  minDelayMs: 50,
  maxDelayMs: 250,
  perMinuteLimit: 60,
  dailyLimit: null,
  sentToday: 0,
  quietHours: null,
  ...over,
});

const group = (over = {}) => ({
  nodeId: 'n1',
  label: 'Node 1',
  channel: 'zalo_personal',
  recipients: 1,
  steps: [{ delayMs: 0, delayFrom: 'prev' }],
  sendMode: 'all',
  accounts: [zaloAccount()],
  ...over,
});

const warningCodes = (result) => result.warnings.map((w) => w.code);

describe('estimateCampaignSend — Zalo một nick, giờ yên lặng', () => {
  it('798 người x 2 node (kết bạn rồi nhắn), 1 nick, 100s/tin, nghỉ 23–6 → xong 07/10 16:16:40, 3 ngày lịch', () => {
    // Bắt đầu 05/10 06:00. Mỗi node có trạng thái nhịp riêng (nick:kênh) → node B tin đầu KHÔNG ngủ.
    // Node A (kết bạn) ngày 05/10: tin k gửi lúc 06:00 + k*100s, còn gửi khi < 23:00 (= 61.200s sau 06:00)
    //   → k*100 < 61200 → k = 0..611 → 612 tin; tin 612 sẽ rơi đúng 23:00 → giờ nghỉ → đợi tới 06:00 hôm sau,
    //   lúc đó trạng thái đã "ngủ xong" (lastAttempt = null) nên gửi NGAY 06:00.
    //   Ngày 06/10: 798 − 612 = 186 tin còn lại, k = 0..185 → tin cuối lúc 06:00 + 185*100s = 06:00 + 18.500s
    //   = 06:00 + 5h08m20s = 11:08:20.
    // Node B (cá nhân) bắt đầu lúc 11:08:20 (tin đầu gửi ngay), tới 23:00: 11h51m40s = 42.700s
    //   → k*100 < 42700 → k = 0..426 → 427 tin (tin cuối 22:58:20). Còn 798 − 427 = 371 tin → 07/10 06:00,
    //   k = 0..370 → tin cuối lúc 06:00 + 370*100s = 06:00 + 37.000s = 06:00 + 10h16m40s = 16:16:40.
    // Số tin mỗi ngày: 05/10 = 612; 06/10 = 186 + 427 = 613; 07/10 = 371 (tổng 1.596).
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [
        group({ nodeId: 'A', channel: 'zalo_friend_request', recipients: 798 }),
        group({ nodeId: 'B', channel: 'zalo_personal', recipients: 798 }),
      ],
    });
    const expectedFinish = vn('2026-10-07T16:16:40').toISOString();
    expect(result.finishAtEarliest).toBe(expectedFinish);
    expect(result.finishAtLatest).toBe(expectedFinish); // min = max = 100s, một lượt duy nhất
    expect(result.totalActions).toBe(1596);
    expect(result.perDay).toEqual([
      { date: '2026-10-05', actions: 612, perAccount: { 101: 612 } },
      { date: '2026-10-06', actions: 613, perAccount: { 101: 613 } },
      { date: '2026-10-07', actions: 371, perAccount: { 101: 371 } },
    ]);
    expect(result.perNode.map((n) => [n.nodeId, n.actions])).toEqual([['A', 798], ['B', 798]]);
    expect(result.perNode[0].finishAtLatest).toBe(vn('2026-10-06T11:08:20').toISOString());
    expect(warningCodes(result)).toEqual(expect.arrayContaining(['multi_day', 'zalo_over_safe_daily']));
    const overSafe = result.warnings.find((w) => w.code === 'zalo_over_safe_daily');
    expect(overSafe.params).toMatchObject({ accounts: ['101'], actions: 613, date: '2026-10-06', safeLimit: 150 });
    expect(result.warnings.find((w) => w.code === 'multi_day').params.days).toBe(3); // 2 ngày 10h16m → làm tròn lên 3
  });

  it('bắt đầu lúc 23:30 → tin đầu gửi đúng 06:00 hôm sau (trạng thái mới, không ngủ thêm)', () => {
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T23:30:00'),
      groups: [group({ recipients: 1 })],
    });
    expect(result.finishAtLatest).toBe(vn('2026-10-06T06:00:00').toISOString());
  });

  it('tin 1 lúc 22:59:00, tin 2 ngủ 100s tới 23:00:40 → vào giờ nghỉ → gửi đúng 06:00 (ngủ xong rồi, không ngủ lần hai)', () => {
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T22:59:00'),
      groups: [group({ recipients: 2 })],
    });
    expect(result.finishAtLatest).toBe(vn('2026-10-06T06:00:00').toISOString());
  });
});

describe('estimateCampaignSend — trần', () => {
  it('trần ngày 100 tin/nick: 300 người → 3 ngày; hai ngày sau tin đầu trễ 06:01:40 (nick còn dấu lần gửi trước nên ngủ 100s)', () => {
    // 05/10: tin k lúc 06:00 + k*100s, k = 0..99 (100 tin, tin cuối 06:00 + 9.900s = 08:45:00).
    // Tin 101: chạm trần → đợi 00:00 06/10 → giờ nghỉ → 06:00; nick còn lastAttempt → ngủ 100s → 06:01:40.
    // 06/10: 100 tin, tin cuối 06:01:40 + 9.900s = 08:46:40. 07/10: cũng 06:01:40 → tin cuối 08:46:40.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [group({ recipients: 300, accounts: [zaloAccount({ dailyLimit: 100 })] })],
    });
    expect(result.finishAtLatest).toBe(vn('2026-10-07T08:46:40').toISOString());
    expect(result.perDay.map((d) => d.actions)).toEqual([100, 100, 100]);
    const hit = result.warnings.find((w) => w.code === 'account_daily_limit');
    expect(hit.params).toEqual({ accountKey: '101', limit: 100 });
    expect(warningCodes(result)).not.toContain('zalo_over_safe_daily'); // 100 <= 150
  });

  it('đã gửi 40 tin hôm nay + trần 100 → ngày đầu chỉ còn 60 tin', () => {
    // 05/10: k = 0..59 (60 tin, cuối 06:00 + 5.900s = 07:38:20). 06/10: 06:01:40 + k*100s, k = 0..89 (90 tin)
    // → tin cuối 06:01:40 + 8.900s = 06:01:40 + 2h28m20s = 08:30:00.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [group({ recipients: 150, accounts: [zaloAccount({ dailyLimit: 100, sentToday: 40 })] })],
    });
    expect(result.perDay.map((d) => [d.date, d.actions])).toEqual([['2026-10-05', 60], ['2026-10-06', 90]]);
    expect(result.finishAtLatest).toBe(vn('2026-10-06T08:30:00').toISOString());
  });

  it('trần ngày CHUNG mọi kênh của cùng một nick: kết bạn 60 + nhắn 60, trần 100 → ngày 1 đủ 100 (60 + 40), ngày 2 còn 20', () => {
    // Node A (kết bạn): k = 0..59 → tin cuối 06:00 + 59*100s = 07:38:20, đếm 60/100.
    // Node B (cá nhân) bắt đầu 07:38:20, trạng thái nhịp riêng nên tin đầu gửi ngay; còn 40 suất → 40 tin (k = 0..39),
    // tin thứ 41 chạm trần → 00:00 06/10 → giờ nghỉ → 06:00; trạng thái có lastAttempt → ngủ 100s → 06:01:40.
    // 20 tin còn lại: k = 0..19 → tin cuối 06:01:40 + 19*100s = 06:01:40 + 31m40s = 06:33:20 (06/10).
    const account = zaloAccount({ dailyLimit: 100 });
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [
        group({ nodeId: 'A', channel: 'zalo_friend_request', recipients: 60, accounts: [account] }),
        group({ nodeId: 'B', channel: 'zalo_personal', recipients: 60, accounts: [account] }),
      ],
    });
    expect(result.perDay.map((d) => [d.date, d.actions])).toEqual([['2026-10-05', 100], ['2026-10-06', 20]]);
    expect(result.finishAtLatest).toBe(vn('2026-10-06T06:33:20').toISOString());
  });

  it('trần ngày bằng 0 → chặn hẳn: không có giờ xong, cảnh báo account_daily_limit limit 0', () => {
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [group({ recipients: 5, accounts: [zaloAccount({ dailyLimit: 0 })] })],
    });
    expect(result.finishAtLatest).toBeNull();
    expect(result.warnings).toContainEqual({ code: 'account_daily_limit', params: { accountKey: '101', limit: 0 } });
  });

  it('trần 2 tin/giờ, 5 người, 100s/tin → tin cuối t0 + 7.300s', () => {
    // #1 t0; #2 t0+100; #3 chạm trần → đợi hết giờ (t0+3.600) rồi ngủ 100s → t0+3.700; #4 t0+3.800;
    // #5 chạm trần (cửa sổ mới bắt đầu t0+3.600) → t0+7.200 rồi ngủ 100s → t0+7.300.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T08:00:00'),
      groups: [group({ recipients: 5, accounts: [zaloAccount({ perHourLimit: 2, quietHours: null })] })],
    });
    expect(result.finishAtLatest).toBe(new Date(vn('2026-10-05T08:00:00').getTime() + 7300 * SEC).toISOString());
  });
});

describe('estimateCampaignSend — nhiều nick', () => {
  it('2 nick chia đôi 100 người: 50 lô song song → tin cuối 06:00 + 49*100s = 07:21:40 (1 nick: 08:45:00)', () => {
    // Lô j gửi lúc t0 + (j−1)*100s (mỗi nick ngủ 100s giữa hai lô; lô 1 trạng thái mới nên gửi ngay).
    // 50 lô → lô cuối j=50: 49*100s = 4.900s = 1h21m40s.
    const two = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [group({ recipients: 100, accounts: [zaloAccount({ key: '1' }), zaloAccount({ key: '2' })] })],
    });
    expect(two.finishAtLatest).toBe(vn('2026-10-05T07:21:40').toISOString());
    const one = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [group({ recipients: 100 })],
    });
    // 99 khoảng * 100s = 9.900s = 2h45m → 08:45:00
    expect(one.finishAtLatest).toBe(vn('2026-10-05T08:45:00').toISOString());
    expect(two.perDay[0].perAccount).toEqual({ 1: 50, 2: 50 });
  });
});

describe('estimateCampaignSend — chuỗi nhiều bước & thứ tự node', () => {
  const chain = (over = {}) => group({
    nodeId: 'mail',
    channel: 'email',
    recipients: 2,
    sendMode: 'schedule',
    steps: [
      { delayMs: 0, delayFrom: 'prev' },
      { delayMs: DAY, delayFrom: 'prev' },
      { delayMs: DAY, delayFrom: 'prev' },
    ],
    accounts: [emailAccount({ minDelayMs: 0, maxDelayMs: 0 })],
    ...over,
  });

  it('3 bước cách 1 ngày: bước 3 lúc t0 + 2 ngày (nhanh nhất); mỗi lần nhặt lại cộng độ trễ nhặt run (0 / 30s / 60s)', () => {
    // Bước 1 lúc 10:00 05/10 → bước 2 đến hạn 10:00 06/10 → bước 3 đến hạn 10:00 07/10.
    // earliest: nhặt lại ngay (0s) → 07/10 10:00:00.
    // typical: 2 lần nhặt lại * 30s → bước 2 lúc 10:00:30 (hạn bước 3 = 10:00:30 hôm sau) → nhặt +30s → 10:01:00.
    // latest: 2 lần * 60s → bước 2 lúc 10:01:00, bước 3 lúc 10:02:00.
    const result = estimateCampaignSend({ startAt: vn('2026-10-05T10:00:00'), groups: [chain()] });
    expect(result.finishAtEarliest).toBe(vn('2026-10-07T10:00:00').toISOString());
    expect(result.finishAtTypical).toBe(vn('2026-10-07T10:01:00').toISOString());
    expect(result.finishAtLatest).toBe(vn('2026-10-07T10:02:00').toISOString());
    expect(result.totalActions).toBe(6); // 2 người x 3 bước
    expect(warningCodes(result)).toContain('multi_day');
  });

  it('delayFrom "start": hạn tính từ lúc người đó xong bước 1, không phải từ bước liền trước', () => {
    // Bước 2 sau 1 ngày (start) → 10:00 06/10; bước 3 sau 1 ngày (start) → 10:00 06/10 cũng đến hạn ngay sau bước 2
    // (firstSentAt + 1 ngày, không + 2 ngày) → bước 3 cùng ngày với bước 2: xong 06/10 10:00 (nhanh nhất).
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T10:00:00'),
      groups: [chain({
        steps: [
          { delayMs: 0, delayFrom: 'prev' },
          { delayMs: DAY, delayFrom: 'start' },
          { delayMs: DAY, delayFrom: 'start' },
        ],
      })],
    });
    expect(result.finishAtEarliest).toBe(vn('2026-10-06T10:00:00').toISOString());
  });

  it('sendMode khác "schedule" → bước sau đến hạn NGAY dù có độ trễ (computeStepDueAt)', () => {
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T10:00:00'),
      groups: [chain({ sendMode: 'all' })],
    });
    expect(result.finishAtLatest).toBe(vn('2026-10-05T10:00:00').toISOString());
    expect(warningCodes(result)).not.toContain('multi_day');
  });

  it('THỨ TỰ NODE: node B gửi bước 1 ngay sau bước 1 của node A, KHÔNG đợi bước 2 của A (hôm sau)', () => {
    // engine: lượt 1 duyệt A (bước 1 cho mọi người, bước 2 chưa đến hạn → bỏ qua) rồi sang B; bước 2 của A
    // chỉ chạy ở lượt nhặt lại sau 1 ngày. => B xong lúc 10:00 05/10, A xong 10:00 06/10.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T10:00:00'),
      groups: [
        chain({
          nodeId: 'A', recipients: 1,
          steps: [{ delayMs: 0, delayFrom: 'prev' }, { delayMs: DAY, delayFrom: 'prev' }],
        }),
        group({ nodeId: 'B', channel: 'email', recipients: 1, accounts: [emailAccount({ key: 'email:8', minDelayMs: 0, maxDelayMs: 0 })] }),
      ],
    });
    const byId = Object.fromEntries(result.perNode.map((n) => [n.nodeId, n]));
    expect(byId.B.finishAtEarliest).toBe(vn('2026-10-05T10:00:00').toISOString());
    expect(byId.A.finishAtEarliest).toBe(vn('2026-10-06T10:00:00').toISOString());
  });

  it('kênh adapter (recipient_major): 3 người 2 bước (trễ 5 phút), 10s/tin → bước 2 của người cuối lúc t0 + 330s', () => {
    // Lượt 1: r0 t0, r1 t0+10, r2 t0+20 (bước 2 chưa đến hạn). Nhặt lại ở hạn sớm nhất (t0+300, r0).
    // r0 bước 2: ngủ 10s → t0+310; r1 (hạn t0+10+300=310 <= 310) → t0+320; r2 (hạn 320) → t0+330.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T10:00:00'),
      groups: [group({
        nodeId: 'tg', channel: 'telegram', order: 'recipient_major', recipients: 3, sendMode: 'schedule',
        steps: [{ delayMs: 0, delayFrom: 'prev' }, { delayMs: 300 * SEC, delayFrom: 'prev' }],
        accounts: [{ key: 'tg:1', minDelayMs: 10 * SEC, maxDelayMs: 10 * SEC, quietHours: null }],
      })],
    });
    expect(result.finishAtEarliest).toBe(new Date(vn('2026-10-05T10:00:00').getTime() + 330 * SEC).toISOString());
  });

  it('chạy liên tục (continuous): chỉ ước tính lượt đầu = bước 1, kèm cảnh báo continuous_mode', () => {
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T10:00:00'),
      groups: [chain()],
      options: { continuous: true },
    });
    expect(result.finishAtLatest).toBe(vn('2026-10-05T10:00:00').toISOString());
    expect(result.totalActions).toBe(2);
    expect(warningCodes(result)).toContain('continuous_mode');
  });
});

describe('estimateCampaignSend — email', () => {
  it('166 người, 50–250ms/thư, 60 thư/phút → vài phút: nhanh nhất 122,3s / điển hình 126,9s / chậm nhất 131,5s', () => {
    // earliest (50ms): #1..#60 lúc 0,50,..,2.950ms (59*50); #61 đợi hết phút (60.000) + ngủ 50 = 60.050;
    //   #120 = 60.050 + 59*50 = 63.000; #121 = 120.000 + 50 = 120.050; #166 = 120.050 + 45*50 = 122.300ms.
    // typical (150ms): #61 = 60.150; #121 = 120.150; #166 = 120.150 + 45*150 = 126.900ms.
    // latest (250ms): #61 = 60.250; #121 = 120.250; #166 = 120.250 + 45*250 = 131.500ms.
    const t0 = vn('2026-10-05T10:00:00').getTime();
    const result = estimateCampaignSend({
      startAt: new Date(t0),
      groups: [group({ nodeId: 'mail', channel: 'email', recipients: 166, accounts: [emailAccount()] })],
    });
    expect(result.finishAtEarliest).toBe(new Date(t0 + 122_300).toISOString());
    expect(result.finishAtTypical).toBe(new Date(t0 + 126_900).toISOString());
    expect(result.finishAtLatest).toBe(new Date(t0 + 131_500).toISOString());
    expect(result.warnings).toEqual([]);
  });

  it('166 người nhưng trần ngày 100 → xong sau nửa đêm (2 ngày lịch): 00:01:00,3 sáng hôm sau', () => {
    // Ngày 1 (bắt đầu 10:00, 50ms): 100 thư (#61..#100 lúc 60.050 + k*50, #100 = 62.000ms). #101 chạm trần →
    // đợi 00:00 06/10 (M) → sang cửa sổ phút mới, ngủ 50ms → M+50. #101..#160 = M+50 + k*50 (cuối M+3.000);
    // #161 đợi hết phút → M+60.000 + 50 = M+60.050; #166 = M+60.050 + 5*50 = M+60.300ms = 00:01:00,3.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T10:00:00'),
      groups: [group({
        nodeId: 'mail', channel: 'email', recipients: 166,
        accounts: [emailAccount({ minDelayMs: 50, maxDelayMs: 50, dailyLimit: 100 })],
      })],
    });
    const midnight = vn('2026-10-06T00:00:00').getTime();
    expect(result.finishAtEarliest).toBe(new Date(midnight + 60_300).toISOString());
    expect(result.perDay.map((d) => [d.date, d.actions])).toEqual([['2026-10-05', 100], ['2026-10-06', 66]]);
    expect(result.warnings.find((w) => w.code === 'account_daily_limit').params).toEqual({ accountKey: 'email:7', limit: 100 });
  });
});

describe('estimateCampaignSend — biên', () => {
  it('không có người nhận → xong ngay, 0 thao tác, không cảnh báo', () => {
    const result = estimateCampaignSend({ startAt: vn('2026-10-05T10:00:00'), groups: [group({ recipients: 0 })] });
    expect(result.totalActions).toBe(0);
    expect(result.finishAtLatest).toBe(vn('2026-10-05T10:00:00').toISOString());
    expect(result.warnings).toEqual([]);
  });

  it('vnDayKey đổi ngày theo giờ VN, không theo UTC', () => {
    // 2026-10-05T17:30Z = 00:30 06/10 giờ VN.
    expect(vnDayKey(Date.parse('2026-10-05T17:30:00Z'))).toBe('2026-10-06');
    expect(vnDayKey(Date.parse('2026-10-05T16:59:59Z'))).toBe('2026-10-05');
  });
});

describe('estimateCampaignSend — initialProgress (phần CÒN LẠI của lượt đang chạy, PR-5)', () => {
  it('799 người x 2 node, node 1 xong hết + node 2 xong 300 → chỉ còn 499 tin ở node 2, xong 05/10 19:50:00', () => {
    // Node 1 (kết bạn): không còn việc → untouched 0. Node 2: untouched = 799 − 300 = 499.
    // Bắt đầu 05/10 06:00, 1 nick, 100 s/tin: tin k gửi lúc 06:00 + k×100 s, k = 0..498 (tin đầu không ngủ).
    // 498 × 100 = 49.800 s = 13h50m00s → tin cuối 19:50:00 (< 23:00 nên không đụng giờ nghỉ). Tổng 499 tin.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [
        group({ nodeId: 'A', channel: 'zalo_friend_request', recipients: 799, initialProgress: { untouched: 0, partial: [] } }),
        group({ nodeId: 'B', channel: 'zalo_personal', recipients: 799, initialProgress: { untouched: 799 - 300, partial: [] } }),
      ],
    });
    expect(result.totalActions).toBe(499);
    expect(result.finishAtLatest).toBe(vn('2026-10-05T19:50:00').toISOString());
    expect(result.perNode.find((n) => n.nodeId === 'B').recipients).toBe(499);
    expect(warningCodes(result)).not.toContain('multi_day');
  });

  it('chuỗi 2 bước cách 1 ngày: người xong bước 1 chờ tới hạn trong sổ (12:00), người mới đi cả hai bước → xong 06/10 06:01:40', () => {
    // Bắt đầu 05/10 06:00; 100 s/tin; sendMode schedule, bước 2 sau 1 ngày kể từ bước trước.
    // Người B (chưa gửi gì): bước 1 lúc 06:00 (tin đầu không ngủ) → hạn bước 2 = 06/10 06:00.
    // Người A (đã xong bước 1, sổ ghi hạn 05/10 12:00): chưa đến hạn lúc 06:00 → bỏ qua lượt đầu; lượt sau bắt đầu 12:00,
    //   tin này phải ngủ 100 s (đã có tin trước) → gửi 12:01:40.
    // Lượt sau nữa bắt đầu 06/10 06:00: bước 2 của B, ngủ 100 s → 06:01:40 (kịch bản nhanh nhất, độ trễ đánh thức 0).
    // Tổng 3 tin; người nhận còn lại = 2.
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [
        group({
          nodeId: 'A',
          sendMode: 'schedule',
          recipients: 99, // bị thay bằng initialProgress
          steps: [{ delayMs: 0, delayFrom: 'prev' }, { delayMs: DAY, delayFrom: 'prev' }],
          initialProgress: {
            untouched: 1,
            partial: [{ stepsDone: 1, dueAtMs: vn('2026-10-05T12:00:00').getTime(), count: 1 }],
          },
        }),
      ],
    });
    expect(result.finishAtEarliest).toBe(vn('2026-10-06T06:01:40').toISOString());
    expect(result.totalActions).toBe(3);
    expect(result.perNode[0].recipients).toBe(2);
  });

  it('người đã xong đủ bước (stepsDone >= số bước) bị bỏ; không còn ai → xong ngay, 0 tin', () => {
    const result = estimateCampaignSend({
      startAt: vn('2026-10-05T06:00:00'),
      groups: [group({ initialProgress: { untouched: 0, partial: [{ stepsDone: 1, dueAtMs: null, count: 5 }] } })],
    });
    expect(result.totalActions).toBe(0);
    expect(result.finishAtLatest).toBe(vn('2026-10-05T06:00:00').toISOString());
  });
});
