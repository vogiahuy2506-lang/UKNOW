import sendStats from '../stats/sendStats.service.js';
import userDeliveryMonitorRepository from '../../repositories/user/userDeliveryMonitor.repository.js';
import deliveryMonitorRepository from '../../repositories/admin/deliveryMonitor.repository.js';
import {
  buildZaloSilentDropHourlySql,
  buildZaloSilentDropSignals,
} from '../../utils/deliveryMonitorSignals.util.js';
import {
  getVnToday,
  resolvePlanned,
  resolveWaiting,
  toIso,
} from '../../utils/runDisplay.util.js';

// Giữ export cũ: spec và nơi khác import `getVnToday` từ service này.
export { getVnToday };

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — trang "Giám sát gửi tin" trả lời MỘT câu: hôm nay gửi tới đâu rồi,
 * có gì đang kẹt. Số theo khoảng thời gian dài thuộc trang Báo cáo.
 *
 * Mọi con số ĐẾM TIN đi qua module services/stats/sendStats.service.js (đọc bảng tin, "chưa gửi được" đếm theo người
 * nhận đã trừ lần gửi lại thành công, `aborted` không phải lỗi). File này KHÔNG được tự đếm từ customer_journey,
 * bộ đếm campaign_runs hay nhật ký node campaign_executions — ba nguồn đó đã làm màn cũ đếm đôi và báo "tụt" giả.
 */

const RECENT_RUNS_LIMIT = 10;
const HOURLY_WINDOW_HOURS = 24;
const FAILURES_LIMIT = 200;

// Lời mời kết bạn Zalo là một kênh riêng của module đếm (plan mục 2): không cộng vào "tin" đã gửi / chưa gửi được.
const FRIEND_REQUEST_CHANNEL = 'zalo_friend_request';

function toPositiveInt(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[0-9]{1,15}$/.test(value) && Number(value) > 0) return Number(value);
  return null;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Tổng hôm nay: kênh "tin" cộng lại, lời mời kết bạn tách riêng. */
function buildToday(channelTotals, date) {
  const messageChannels = channelTotals.filter((row) => row.channel !== FRIEND_REQUEST_CHANNEL);
  const friendRequests = channelTotals.find((row) => row.channel === FRIEND_REQUEST_CHANNEL);
  return {
    date,
    sent: messageChannels.reduce((sum, row) => sum + row.sent, 0),
    failed: messageChannels.reduce((sum, row) => sum + row.failed, 0),
    byChannel: messageChannels.map(({ channel, sent, failed }) => ({ channel, sent, failed })),
    friendRequests: { sent: friendRequests?.sent ?? 0, failed: friendRequests?.failed ?? 0 },
  };
}

/** 10 lượt mới nhất + số đã gửi / chưa gửi được của từng lượt (cộng mọi kênh của lượt, đọc từ bảng tin). */
async function loadRecentRuns(scope, ownerId) {
  const rows = await userDeliveryMonitorRepository.listRecentRuns({ ownerId, limit: RECENT_RUNS_LIMIT });
  const totals = await sendStats.getRunTotals(scope, rows.map((row) => Number(row.id)));
  return { rows, totals };
}

/**
 * Tổng quan "hôm nay" của một chủ tài khoản.
 *
 * @param {{ userId: number }} input `userId` = chủ tài khoản (controller đã đổi nhân viên → chủ)
 * @returns {Promise<{
 *   generatedAt: string,
 *   today: { date: string, sent: number, failed: number,
 *     byChannel: Array<{ channel: string, sent: number, failed: number }>,
 *     friendRequests: { sent: number, failed: number } },
 *   hourly: Array<{ hour: string, channel: string, sent: number, failed: number }>,
 *   runs: Array<{ runId: number, campaignId: number, campaignName: string, campaignType: string, status: string,
 *     startedAt: string|null, waitingUntil: string|null, waitingReason: string|null,
 *     sent: number, failed: number, planned: number|null }>,
 *   waiting: { count: number, first: { campaignName: string, waitingReason: string|null, waitingUntil: string }|null },
 *   running: number,
 *   signals: Array<object>
 * }>}
 */
export async function getUserDeliveryMonitorOverview({ userId } = {}) {
  const ownerId = toPositiveInt(userId);
  if (ownerId == null) {
    throw new TypeError('userDeliveryMonitor: userId phải là số nguyên dương (chủ tài khoản)');
  }
  const scope = { ownerId };
  const now = new Date();
  const nowMs = now.getTime();
  const today = getVnToday(now);

  const [channelTotals, hourlyRows, recentRuns, runningRows, silentDropRows] = await Promise.all([
    sendStats.getChannelTotals(scope, { fromDate: today, toDate: today }),
    sendStats.getHourlySeries(scope, { hours: HOURLY_WINDOW_HOURS }),
    loadRecentRuns(scope, ownerId),
    userDeliveryMonitorRepository.listRunningRuns({ ownerId }),
    // Tín hiệu "Zalo gửi mà không tới" giữ nguyên như trước (một truy vấn 1 giờ gần nhất theo tài khoản Zalo).
    deliveryMonitorRepository.safeQuery(buildZaloSilentDropHourlySql({ userScoped: true }), [ownerId], []),
  ]);

  const totalsByRun = new Map();
  for (const row of recentRuns.totals) {
    const acc = totalsByRun.get(row.runId) || { sent: 0, failed: 0 };
    acc.sent += row.sent;
    acc.failed += row.failed;
    totalsByRun.set(row.runId, acc);
  }

  const runs = recentRuns.rows.map((row) => {
    const runId = Number(row.id);
    const { sent, failed } = totalsByRun.get(runId) || { sent: 0, failed: 0 };
    // Mốc chờ chỉ có nghĩa với lượt đang chạy; lượt đã xong / dừng còn sót khoá defer trong metadata thì bỏ qua.
    const waiting = row.status === 'running' ? resolveWaiting(row, nowMs) : null;
    return {
      runId,
      campaignId: Number(row.id_campaign),
      campaignName: row.campaign_name,
      campaignType: row.campaign_type,
      status: row.status,
      startedAt: toIso(row.started_at),
      waitingUntil: waiting?.until ?? null,
      waitingReason: waiting?.reason ?? null,
      sent,
      failed,
      planned: resolvePlanned(row, sent),
    };
  });

  // "Đang chờ" / "đang gửi" xét trên MỌI lượt running của chủ, không chỉ 10 lượt mới nhất.
  const waitingRuns = runningRows
    .map((row) => ({ row, waiting: resolveWaiting(row, nowMs) }))
    .filter((item) => item.waiting)
    .sort((a, b) => Date.parse(a.waiting.until) - Date.parse(b.waiting.until));
  const soonest = waitingRuns[0];

  return {
    generatedAt: now.toISOString(),
    today: buildToday(channelTotals, today),
    hourly: hourlyRows.filter((row) => row.channel !== FRIEND_REQUEST_CHANNEL),
    runs,
    waiting: {
      count: waitingRuns.length,
      first: soonest
        ? {
          campaignName: soonest.row.campaign_name,
          waitingReason: soonest.waiting.reason,
          waitingUntil: soonest.waiting.until,
        }
        : null,
    },
    running: runningRows.length - waitingRuns.length,
    signals: buildZaloSilentDropSignals(silentDropRows),
  };
}

/**
 * Người nhận CHƯA GỬI ĐƯỢC của một lượt chạy (trang Giám sát gửi tin, bấm số "Chưa gửi được" ở hàng lượt chạy).
 * Mỗi người/bước một dòng (người thử 3 lần rồi gửi được thì KHÔNG có mặt), lần lỗi mới nhất trước; `aborted` (tin chưa
 * từng gửi: hoãn / bỏ qua / lượt bị dừng) không phải lỗi. Số phần tử (khi chưa chạm trần 200) đúng bằng `failed` của lượt
 * ở overview vì cùng một module đếm.
 *
 * @param {object} input
 * @param {number} input.userId chủ tài khoản
 * @param {number|string} input.runId
 * @returns {Promise<{ runId: number, recipientAudit: object|null, failures: Array<{
 *   channel: string, recipient: string|null, recipientDisplay: string|null, reason: string|null,
 *   attempts: number, lastAt: Date|string|null }> }>}
 */
export async function getRunFailures({ userId, runId }) {
  const ownerId = toPositiveInt(userId);
  const safeRunId = toPositiveInt(runId);
  if (ownerId == null || safeRunId == null) {
    throw httpError(400, 'Tham số không hợp lệ');
  }

  // Kiểm lượt thuộc chủ TRƯỚC khi đọc tin: id của người khác không được lộ người nhận.
  const run = await userDeliveryMonitorRepository.findOwnedRun({ ownerId, runId: safeRunId });
  if (!run) {
    throw httpError(404, 'Không tìm thấy lượt chạy');
  }

  const failures = await sendStats.listFinalFailures({ ownerId }, { runId: safeRunId, limit: FAILURES_LIMIT });

  return {
    runId: safeRunId,
    recipientAudit: run.recipient_audit || null,
    failures: failures.map((failure) => ({
      channel: failure.channel,
      recipient: failure.recipient,
      recipientDisplay: failure.recipientDisplay,
      reason: failure.reason,
      attempts: failure.attempts,
      lastAt: failure.at,
    })),
  };
}
