// Dùng chung cho các spec của UserDeliveryMonitorPage (PR-4b). Không phải spec (tên không khớp *.spec.*).
import viTranslations from '../../../i18n/vi';

const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);

/** Bộ dịch giả lập ĐÚNG từ điển vi.js (như useI18n thật: thay `{tham_số}`, thiếu khoá thì trả nguyên khoá). */
export const mockT = (key, params) => {
  const val = getNestedTranslation(viTranslations, key);
  if (typeof val !== 'string') return key;
  if (!params) return val;
  return Object.entries(params).reduce((str, [k, v]) => str.replace(`{${k}}`, v), val);
};

// 03:30 giờ VN ngày 30/09/2026 — lúc ngày UTC (29/09) và ngày VN (30/09) khác nhau.
export const GENERATED_AT = '2026-09-29T20:30:00.000Z';

export const EMPTY_BY_CHANNEL = [
  { channel: 'email', sent: 0, failed: 0 },
  { channel: 'zalo_personal', sent: 0, failed: 0 },
  { channel: 'zalo_group', sent: 0, failed: 0 },
  { channel: 'telegram', sent: 0, failed: 0 },
  { channel: 'whatsapp', sent: 0, failed: 0 },
];

/** Phản hồi `GET /delivery-monitor/overview` mới (PR-4b). `overrides` ghi đè từng trường cấp một. */
export function buildOverview(overrides = {}) {
  return {
    generatedAt: GENERATED_AT,
    today: {
      date: '2026-09-30',
      sent: 0,
      failed: 0,
      byChannel: EMPTY_BY_CHANNEL,
      friendRequests: { sent: 0, failed: 0 },
    },
    hourly: [],
    runs: [],
    waiting: { count: 0, first: null },
    running: 0,
    signals: [],
    ...overrides,
  };
}

/** Một dòng của `runs`. */
export function buildRun(overrides = {}) {
  return {
    runId: 1,
    campaignId: 1,
    campaignName: 'Chiến dịch',
    campaignType: 'email',
    status: 'completed',
    startedAt: '2026-09-29T11:00:00.000Z', // 18:00 giờ VN ngày 29/09
    waitingUntil: null,
    waitingReason: null,
    sent: 0,
    failed: 0,
    planned: null,
    ...overrides,
  };
}

/** Bọc mảng thành đáp ứng của axios (`res.data.data`). */
export const asAxios = (data) => ({ data: { data } });
