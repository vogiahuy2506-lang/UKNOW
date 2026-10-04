/**
 * Chiến dịch 438 (Zalo, 798 SĐT, 1 nick #101, 2 nhánh) — hình dạng ĐÚNG hợp đồng API
 * `GET /api/campaigns/:id/estimate` (PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04). Mốc giờ tính tay
 * (giờ VN = UTC+7): bắt đầu 05/10 06:00, xong sớm 07/10 07:25, xong muộn 08/10 21:25.
 */
export const ESTIMATE_438 = {
  startAt: '2026-10-04T23:00:00.000Z', // 05/10 06:00 VN
  finishAtEarliest: '2026-10-07T00:25:00.000Z', // 07/10 07:25 VN
  finishAtTypical: '2026-10-07T15:52:00.000Z', // 07/10 22:52 VN
  finishAtLatest: '2026-10-08T14:25:00.000Z', // 08/10 21:25 VN
  totalActions: 1596,
  perNode: [
    {
      nodeId: 'n1', label: 'Kết bạn', channel: 'zalo_friend_request', recipients: 798, steps: 1,
      accounts: ['zalo:101'], actions: 798, finishAtEarliest: '2026-10-06T02:00:00.000Z', finishAtLatest: '2026-10-06T14:00:00.000Z',
    },
  ],
  perDay: [
    { date: '2026-10-05', actions: 560, perAccount: { 'zalo:101': 560 } },
    { date: '2026-10-06', actions: 560, perAccount: { 'zalo:101': 560 } },
    { date: '2026-10-07', actions: 476, perAccount: { 'zalo:101': 476 } },
  ],
  accounts: [{ key: 'zalo:101', channel: 'zalo', label: 'Nick Minh Zalo', dailyLimit: null, sentToday: 0 }],
  warnings: [
    { code: 'multi_day', params: { days: 4, finishAtLatest: '2026-10-08T14:25:00.000Z' } },
    { code: 'zalo_over_safe_daily', params: { accountKey: 'zalo:101', date: '2026-10-05', actions: 560, safeLimit: 150, accounts: ['zalo:101'], days: 3 } },
    { code: 'zalo_phone_lookup_unmodeled', params: { nodes: ['n1'] } },
  ],
};
