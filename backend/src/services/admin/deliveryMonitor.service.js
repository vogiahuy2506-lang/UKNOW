import outboundMessageQueueService from '../queue/outboundMessageQueue.service.js';
import sendStats, { normalizeScope } from '../stats/sendStats.service.js';
import deliveryMonitorRepository from '../../repositories/admin/deliveryMonitor.repository.js';
import { getInternalUserIds } from '../../constants/internalAccounts.js';
import {
  addDaysToIsoDate,
  getVnHour,
  getVnToday,
  resolvePlanned,
  resolveWaiting,
  toIso,
  toNumber,
} from '../../utils/runDisplay.util.js';
import {
  buildZaloSilentDropHourlySql,
  buildZaloSilentDropSignals,
  classifyDeliveryMonitorFailure,
} from '../../utils/deliveryMonitorSignals.util.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — trang "Giám sát gửi tin" của ADMIN, cùng khuôn và cùng nguồn số với
 * trang của người dùng (services/user/userDeliveryMonitor.service.js), khác ở phạm vi: TOÀN HỆ THỐNG, loại tài khoản nội
 * bộ (constants/internalAccounts.js) trừ khi bật `includeInternal`, hoặc lọc MỘT chủ bằng `ownerId`.
 *
 * Mọi con số ĐẾM TIN đi qua module services/stats/sendStats.service.js (đọc bảng tin; "chưa gửi được" đếm theo đích đã
 * trừ lần gửi lại thành công; `aborted` không phải lỗi). File này KHÔNG được tự đếm từ customer_journey, bộ đếm
 * campaign_runs hay nhật ký node campaign_executions — ba nguồn đó làm màn cũ cộng ba đơn vị khác nhau vào "Tin lỗi",
 * bỏ lượt chạy sống lâu khỏi "đang chạy" và để bộ đếm phình của 14 lượt cũ thắng.
 *
 * Cửa sổ: `today` | `7d` | `30d` — NGÀY VN theo lịch, gồm trọn ngày hôm nay (7d = 6 ngày trước + hôm nay). Mọi số tin dùng
 * cùng một cửa sổ nên thẻ, biểu đồ, bảng lý do và bảng khách cộng khớp nhau; `today` khớp đúng thẻ "hôm nay" của trang
 * người dùng. "Đang gửi / đang chờ" xét MỌI lượt `running`, không theo cửa sổ.
 */

const WINDOW_DAYS = Object.freeze({ today: 1, '7d': 7, '30d': 30 });
export const WINDOW_KEYS = Object.freeze(Object.keys(WINDOW_DAYS));
const DEFAULT_WINDOW_KEY = 'today';

const RECENT_RUNS_LIMIT = 20;
const TOP_OWNERS_LIMIT = 10;
const FAILURE_REASONS_LIMIT = 10;

// Hàng đợi có ≥ ngần này job đang chờ / đang xử lý thì báo nghẽn. KHÔNG cộng `delayed`: job hẹn thử lại nằm ở đó là chờ
// hợp lệ (retry 3 giờ), không phải worker không theo kịp.
const QUEUE_BACKLOG_THRESHOLD = 100;

// Lời mời kết bạn Zalo là một kênh riêng của module đếm (plan mục 2): không cộng vào "tin" đã gửi / chưa gửi được.
const FRIEND_REQUEST_CHANNEL = 'zalo_friend_request';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toPositiveInt(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[0-9]{1,15}$/.test(value) && Number(value) > 0) return Number(value);
  return null;
}

function resolveWindow(windowKey, today) {
  const days = WINDOW_DAYS[windowKey];
  return { key: windowKey, fromDate: addDaysToIsoDate(today, -(days - 1)), toDate: today };
}

/** Tổng: kênh "tin" cộng lại, lời mời kết bạn tách riêng, kèm % chưa gửi được trên (đã gửi + chưa gửi được). */
function buildTotals(channelTotals) {
  const messageChannels = channelTotals.filter((row) => row.channel !== FRIEND_REQUEST_CHANNEL);
  const friendRequests = channelTotals.find((row) => row.channel === FRIEND_REQUEST_CHANNEL);
  const sent = messageChannels.reduce((sum, row) => sum + row.sent, 0);
  const failed = messageChannels.reduce((sum, row) => sum + row.failed, 0);
  const attempts = sent + failed;
  return {
    sent,
    failed,
    failedPercent: attempts > 0 ? Math.round((failed / attempts) * 1000) / 10 : null,
    byChannel: messageChannels.map(({ channel, sent: channelSent, failed: channelFailed }) => ({
      channel,
      sent: channelSent,
      failed: channelFailed,
    })),
    friendRequests: { sent: friendRequests?.sent ?? 0, failed: friendRequests?.failed ?? 0 },
  };
}

/** Lượt đang chờ (mốc còn ở tương lai): đếm, lý do (nhiều nhất trước) và lượt tự chạy lại sớm nhất. */
function buildWaiting(runningRows, nowMs) {
  const waitingRuns = runningRows
    .map((row) => ({ row, waiting: resolveWaiting(row, nowMs) }))
    .filter((item) => item.waiting)
    .sort((a, b) => Date.parse(a.waiting.until) - Date.parse(b.waiting.until));

  const byReason = new Map();
  for (const { waiting } of waitingRuns) {
    byReason.set(waiting.reason, (byReason.get(waiting.reason) || 0) + 1);
  }
  const reasons = [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || String(a.reason ?? '').localeCompare(String(b.reason ?? '')));

  const soonest = waitingRuns[0];
  return {
    count: waitingRuns.length,
    reasons,
    first: soonest
      ? {
        campaignName: soonest.row.campaign_name,
        waitingReason: soonest.waiting.reason,
        waitingUntil: soonest.waiting.until,
      }
      : null,
  };
}

function sumRunTotals(runTotals) {
  const byRun = new Map();
  for (const row of runTotals) {
    const acc = byRun.get(row.runId) || { sent: 0, failed: 0 };
    acc.sent += row.sent;
    acc.failed += row.failed;
    byRun.set(row.runId, acc);
  }
  return byRun;
}

function displayName(owner) {
  if (!owner) return { name: null, username: null };
  const fullName = String(owner.full_name || '').trim();
  return { name: fullName || owner.username, username: owner.username };
}

function buildQueue(queueMetrics) {
  if (!queueMetrics) return { available: false };
  return {
    available: true,
    waiting: toNumber(queueMetrics.waiting),
    active: toNumber(queueMetrics.active),
    // Job hẹn thử lại — chờ hợp lệ, hiện riêng và KHÔNG cộng vào "đang xử lý".
    delayed: toNumber(queueMetrics.delayed),
  };
}

function buildSignals({ queue, strangerBlockedCount, silentDropRows }) {
  const signals = [];
  const processing = queue.available ? queue.waiting + queue.active : 0;
  if (processing >= QUEUE_BACKLOG_THRESHOLD) {
    signals.push({ level: 'warning', code: 'queue_backlog', value: processing });
  }
  // stranger_blocked không phải lỗi gửi thường — Zalo đang chặn nhắn người lạ, dấu hiệu tài khoản sắp bị khoá.
  if (strangerBlockedCount > 0) {
    signals.push({ level: 'critical', code: 'stranger_blocked_detected', value: strangerBlockedCount });
  }
  signals.push(...buildZaloSilentDropSignals(silentDropRows));
  return signals;
}

/**
 * Tổng quan gửi tin toàn hệ thống (hoặc một chủ) của một cửa sổ.
 *
 * @param {object} [input]
 * @param {'today'|'7d'|'30d'} [input.window] mặc định 'today'; giá trị khác → lỗi 400
 * @param {boolean} [input.includeInternal] true = gồm cả tài khoản nội bộ (mặc định loại; bị bỏ qua khi có `ownerId`)
 * @param {number|string|null} [input.ownerId] lọc MỘT chủ tài khoản (số liệu khớp trang Giám sát của chủ đó); ghi đè
 *   việc loại tài khoản nội bộ — chọn đích danh thì hiện đích danh
 * @returns {Promise<{
 *   generatedAt: string,
 *   window: { key: string, fromDate: string, toDate: string },
 *   filter: { ownerId: number|null, includeInternal: boolean, excludedOwnerIds: number[] },
 *   totals: { sent: number, failed: number, failedPercent: number|null,
 *     byChannel: Array<{ channel: string, sent: number, failed: number }>,
 *     friendRequests: { sent: number, failed: number } },
 *   series: { unit: 'hour'|'day', rows: Array<{ hour?: string, day?: string, channel: string, sent: number, failed: number }> },
 *   runs: { sending: number, failed: number,
 *     waiting: { count: number, reasons: Array<{ reason: string|null, count: number }>,
 *       first: { campaignName: string, waitingReason: string|null, waitingUntil: string }|null } },
 *   failureReasons: Array<{ channel: string, reason: string|null, category: string, count: number, lastAt: Date }>,
 *   topOwners: Array<{ ownerId: number, name: string|null, username: string|null, sent: number, failed: number }>,
 *   recentRuns: Array<{ runId: number, campaignId: number, campaignName: string, campaignType: string,
 *     ownerId: number, ownerName: string|null, ownerUsername: string|null, status: string, startedAt: string|null,
 *     waitingUntil: string|null, waitingReason: string|null, sent: number, failed: number, planned: number|null }>,
 *   queue: { available: boolean, waiting?: number, active?: number, delayed?: number },
 *   alerts: { open: number },
 *   signals: Array<object>
 * }>}
 */
export async function getDeliveryMonitorOverview({ window: windowInput, includeInternal = false, ownerId: ownerInput } = {}) {
  const windowKey = windowInput == null || windowInput === '' ? DEFAULT_WINDOW_KEY : String(windowInput);
  if (!WINDOW_KEYS.includes(windowKey)) {
    throw httpError(400, `Khoảng thời gian không hợp lệ (chọn một trong: ${WINDOW_KEYS.join(', ')})`);
  }
  let ownerId = null;
  if (ownerInput != null && ownerInput !== '') {
    ownerId = toPositiveInt(ownerInput);
    if (ownerId == null) throw httpError(400, 'ownerId không hợp lệ');
  }

  const now = new Date();
  const nowMs = now.getTime();
  const today = getVnToday(now);
  const window = resolveWindow(windowKey, today);
  const range = { fromDate: window.fromDate, toDate: window.toDate };

  const excludeOwnerIds = ownerId == null && !includeInternal ? getInternalUserIds() : [];
  const scope = normalizeScope(ownerId != null ? { ownerId } : { ownerId: null, excludeOwnerIds });
  const rankingOptions = { limit: TOP_OWNERS_LIMIT, excludeChannels: [FRIEND_REQUEST_CHANNEL] };

  // "Hôm nay" vẽ theo GIỜ từ 00:00 tới giờ hiện tại (cửa sổ neo ranh giới giờ chẵn, cùng cửa sổ với thẻ tổng);
  // 7 / 30 ngày vẽ theo NGÀY.
  const seriesUnit = windowKey === 'today' ? 'hour' : 'day';
  const seriesPromise = seriesUnit === 'hour'
    ? sendStats.getHourlySeries(scope, { hours: getVnHour(now) + 1 })
    : sendStats.getDailySeries(scope, range);

  const [
    channelTotals,
    seriesRows,
    failureReasonRows,
    ownerTotalRows,
    runningRows,
    recentRunRows,
    failedRuns,
    queueMetrics,
    openAlerts,
    strangerBlockedCount,
    silentDropRows,
  ] = await Promise.all([
    sendStats.getChannelTotals(scope, range),
    seriesPromise,
    sendStats.getFailureReasons(scope, range, { ...rankingOptions, limit: FAILURE_REASONS_LIMIT }),
    sendStats.getOwnerTotals(scope, range, rankingOptions),
    deliveryMonitorRepository.listRunningRuns({ scope }),
    deliveryMonitorRepository.listRecentRuns({ scope, limit: RECENT_RUNS_LIMIT }),
    deliveryMonitorRepository.countFailedRuns({ scope, window: range }),
    outboundMessageQueueService.getQueueMetrics(),
    deliveryMonitorRepository.countOpenAlertRules(),
    deliveryMonitorRepository.countStrangerBlocked({ scope, window: range }),
    // Tín hiệu "Zalo gửi mà không tới" (1 giờ gần nhất theo tài khoản Zalo) giữ nguyên như trang cũ. Lọc một chủ thì
    // theo đúng phạm vi của trang người dùng; toàn hệ thống thì không loại tài khoản nội bộ (đây là tín hiệu hạ tầng).
    ownerId != null
      ? deliveryMonitorRepository.safeQuery(buildZaloSilentDropHourlySql({ userScoped: true }), [ownerId], [])
      : deliveryMonitorRepository.safeQuery(buildZaloSilentDropHourlySql(), [], []),
  ]);

  // Số tin của từng lượt (cộng mọi kênh, đọc từ bảng tin — KHÔNG đọc bộ đếm campaign_runs), không theo cửa sổ.
  const runTotals = await sendStats.getRunTotals(scope, recentRunRows.map((row) => Number(row.id)));
  const totalsByRun = sumRunTotals(runTotals);

  const ownerIds = [...new Set([
    ...ownerTotalRows.map((row) => row.ownerId),
    ...recentRunRows.map((row) => Number(row.owner_id)),
  ])];
  const owners = new Map((await deliveryMonitorRepository.findOwners(ownerIds)).map((owner) => [Number(owner.id), owner]));

  const recentRuns = recentRunRows.map((row) => {
    const runId = Number(row.id);
    const { sent, failed } = totalsByRun.get(runId) || { sent: 0, failed: 0 };
    // Mốc chờ chỉ có nghĩa với lượt đang chạy; lượt đã xong / dừng còn sót khoá defer trong metadata thì bỏ qua.
    const waiting = row.status === 'running' ? resolveWaiting(row, nowMs) : null;
    const owner = displayName(owners.get(Number(row.owner_id)));
    return {
      runId,
      campaignId: Number(row.id_campaign),
      campaignName: row.campaign_name,
      campaignType: row.campaign_type,
      ownerId: Number(row.owner_id),
      ownerName: owner.name,
      ownerUsername: owner.username,
      status: row.status,
      startedAt: toIso(row.started_at),
      waitingUntil: waiting?.until ?? null,
      waitingReason: waiting?.reason ?? null,
      sent,
      failed,
      planned: resolvePlanned(row, sent),
    };
  });

  const waiting = buildWaiting(runningRows, nowMs);
  const queue = buildQueue(queueMetrics);

  return {
    generatedAt: now.toISOString(),
    window,
    filter: { ownerId, includeInternal: Boolean(includeInternal), excludedOwnerIds: scope.excludeOwnerIds },
    totals: buildTotals(channelTotals),
    series: {
      unit: seriesUnit,
      rows: seriesRows.filter((row) => row.channel !== FRIEND_REQUEST_CHANNEL),
    },
    runs: {
      sending: runningRows.length - waiting.count,
      failed: failedRuns,
      waiting,
    },
    failureReasons: failureReasonRows.map((row) => ({
      channel: row.channel,
      reason: row.reason,
      category: classifyDeliveryMonitorFailure(row.reason),
      count: row.count,
      lastAt: row.lastAt,
    })),
    topOwners: ownerTotalRows.map((row) => {
      const owner = displayName(owners.get(row.ownerId));
      return { ownerId: row.ownerId, name: owner.name, username: owner.username, sent: row.sent, failed: row.failed };
    }),
    recentRuns,
    queue,
    alerts: { open: openAlerts },
    signals: buildSignals({ queue, strangerBlockedCount, silentDropRows }),
  };
}
