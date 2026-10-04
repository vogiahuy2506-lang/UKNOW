/**
 * Chặn lịch chồng nhau của CÙNG một chiến dịch (PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04, mục 4.1).
 *
 * Vì sao: tới giờ mà chiến dịch còn run `running` thì scheduler bỏ qua lượt (và tắt lịch `once`) — người dùng đặt
 * "3/10, 4/10, 5/10" cho chiến dịch cần 3 ngày thì hai lịch sau mất im lặng. Chặn ngay lúc đặt lịch bằng ước tính
 * `finishAtLatest` (nhịp CHẬM NHẤT — không bao giờ dùng nhịp trung bình để chặn).
 *
 * Luật:
 * - chỉ xét lịch BẬT của chiến dịch (gồm lịch đang tạo/sửa), liệt kê các lần nổ trong 60 ngày tới;
 * - sắp xếp; mỗi cặp LIỀN KỀ có ÍT NHẤT MỘT lần thuộc lịch đang tạo/sửa: `finishAtLatest(lần trước) > lần sau` → chồng;
 * - lịch cũ đã chồng nhau từ trước mà không liên quan lịch đang sửa → KHÔNG chặn;
 * - ước tính lỗi / không đếm được người nhận / không có node gửi → KHÔNG chặn (trả cảnh báo).
 *
 * Phụ thuộc truyền qua `deps` để spec mock đúng ranh giới (repository lịch + ước tính).
 */
import { listScheduleFireTimes, toHanoiDateKey, HANOI_TIME_ZONE } from '../../utils/campaignScheduleCron.util.js';

export const SCHEDULE_OVERLAP_CODE = 'SCHEDULE_OVERLAP';
export const SCHEDULE_OVERLAP_SUGGESTIONS = ['use_steps', 'add_accounts', 'spread_schedule'];

const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 60;
/** Số lần ước tính tối đa cho một lượt kiểm (mỗi lần đếm người nhận + đọc nick). Quá số này dùng thời lượng lớn nhất đã đo. */
const MAX_ESTIMATE_CALLS = 8;
const CHECK_TIMEOUT_MS = 25_000;
/** Cảnh báo ước tính nghĩa là "không biết thời lượng" → không chặn, báo lại cho người dùng. */
const UNVERIFIED_WARNING_CODES = new Set(['recipient_count_unknown', 'estimate_incomplete', 'no_send_node']);

const formatVn = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HANOI_TIME_ZONE, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`;
};

export const buildScheduleOverlapMessage = ({ previousFireAt, estimatedFinishAt, nextFireAt }) => (
  `Lượt chạy lúc ${formatVn(new Date(previousFireAt))} dự kiến xong khoảng ${formatVn(new Date(estimatedFinishAt))}, `
  + `lịch kế tiếp lúc ${formatVn(new Date(nextFireAt))} sẽ bị bỏ qua. `
  + 'Hãy dùng chuỗi tin nhiều bước trong một node gửi, thêm tài khoản gửi, hoặc giãn lịch.'
);

async function loadDefaultDeps() {
  const [{ default: scheduleRepo }, { estimateForCampaign }] = await Promise.all([
    import('../../repositories/campaign/campaignSchedule.repository.js'),
    import('./campaignEstimate.service.js'),
  ]);
  return { scheduleRepo, estimateForCampaign, now: () => new Date() };
}

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'OVERLAP_CHECK_TIMEOUT' })), ms);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

async function runCheck({ campaignId, ownerUserId, candidate, deps }) {
  const now = deps.now();
  const until = new Date(now.getTime() + HORIZON_DAYS * DAY_MS);

  const saved = (await deps.scheduleRepo.findEnabledByCampaign(campaignId))
    .filter((row) => candidate.id == null || Number(row.id) !== Number(candidate.id));
  const candidateRow = {
    id: candidate.id ?? null,
    enabled: true,
    schedule_type: candidate.scheduleType,
    cron_expression: candidate.cronExpression,
    last_run_at: candidate.lastRunAt ?? null,
    created_at: candidate.createdAt ?? now,
  };

  const fires = [];
  const collect = (row, isCandidate) => {
    listScheduleFireTimes(row, { now, until }).forEach((at) => fires.push({
      at, scheduleId: row.id == null ? null : Number(row.id), isCandidate,
    }));
  };
  saved.forEach((row) => collect(row, false));
  collect(candidateRow, true);
  fires.sort((a, b) => a.at.getTime() - b.at.getTime());

  // Cặp liền kề có ít nhất một lần thuộc lịch đang tạo/sửa. Lịch cũ chồng nhau từ trước không bị tính.
  const pairs = [];
  for (let i = 0; i < fires.length - 1; i += 1) {
    if (fires[i].isCandidate || fires[i + 1].isCandidate) pairs.push([fires[i], fires[i + 1]]);
  }
  if (pairs.length === 0) return { overlap: null, warnings: [] };

  const todayKey = toHanoiDateKey(now);
  const durationByKey = new Map();
  let estimateCalls = 0;
  let maxDurationMs = 0;
  const unverified = new Map();

  /** Thời lượng chạy (ms) nếu bắt đầu ở `startAt`, hoặc null khi không biết. Cùng giờ-trong-ngày thì dùng lại. */
  const durationFor = async (startAt) => {
    const dayKey = toHanoiDateKey(startAt);
    // Lượt hôm nay còn bị ảnh hưởng bởi "đã gửi hôm nay" của nick → khoá riêng theo ngày; ngày khác chỉ phụ thuộc giờ nổ.
    const key = dayKey === todayKey ? `d:${dayKey}:${formatVn(startAt)}` : `t:${formatVn(startAt).slice(0, 5)}`;
    if (durationByKey.has(key)) return durationByKey.get(key);
    if (estimateCalls >= MAX_ESTIMATE_CALLS) return maxDurationMs > 0 ? maxDurationMs : null;
    estimateCalls += 1;
    let duration = null;
    try {
      const estimate = await deps.estimateForCampaign({
        campaignId, ownerUserId, startAt, continuous: false,
      });
      (estimate?.warnings || []).forEach((warning) => {
        if (UNVERIFIED_WARNING_CODES.has(warning?.code) && !unverified.has(warning.code)) unverified.set(warning.code, warning);
      });
      const finish = estimate?.finishAtLatest ? new Date(estimate.finishAtLatest).getTime() : NaN;
      const hasUnverified = (estimate?.warnings || []).some((warning) => UNVERIFIED_WARNING_CODES.has(warning?.code));
      if (estimate && !hasUnverified && Number(estimate.totalActions) > 0 && Number.isFinite(finish)) {
        duration = Math.max(0, finish - startAt.getTime());
      }
    } catch (error) {
      console.warn('[CampaignScheduleOverlap] Ước tính lỗi — không chặn lịch:', error?.message || error);
    }
    durationByKey.set(key, duration);
    if (duration != null) maxDurationMs = Math.max(maxDurationMs, duration);
    return duration;
  };

  for (const [previous, next] of pairs) {
    // eslint-disable-next-line no-await-in-loop
    const duration = await durationFor(previous.at);
    if (duration == null) continue;
    const finishAt = new Date(previous.at.getTime() + duration);
    if (finishAt.getTime() > next.at.getTime()) {
      const overlap = {
        previousFireAt: previous.at.toISOString(),
        estimatedFinishAt: finishAt.toISOString(),
        nextFireAt: next.at.toISOString(),
        scheduleIds: [...new Set([previous.scheduleId, next.scheduleId].filter((id) => id != null))],
      };
      return { overlap, warnings: [] };
    }
  }
  return { overlap: null, warnings: [...unverified.values()] };
}

/**
 * Kiểm lịch (đang tạo / sửa, ĐANG BẬT) có làm lượt trước chạy chưa xong mà lượt sau đã nổ không.
 * Không bao giờ ném: lỗi → `{ overlap: null, warnings: [] }` (ước tính hỏng không được cản người dùng đặt lịch).
 *
 * @param {{ campaignId: number, ownerUserId: number, candidate: { id?: number|null, scheduleType: string, cronExpression: string, lastRunAt?: any, createdAt?: any }, deps?: object }} input
 * @returns {Promise<{ overlap: null | { previousFireAt: string, estimatedFinishAt: string, nextFireAt: string, scheduleIds: number[] }, warnings: Array<{code: string, params: object}> }>}
 */
export async function checkScheduleOverlap({ campaignId, ownerUserId, candidate, deps = null }) {
  try {
    const resolved = deps || await loadDefaultDeps();
    return await withTimeout(runCheck({ campaignId, ownerUserId, candidate, deps: resolved }), CHECK_TIMEOUT_MS);
  } catch (error) {
    console.warn('[CampaignScheduleOverlap] Không kiểm được lịch chồng — không chặn:', error?.message || error);
    return { overlap: null, warnings: [] };
  }
}

export default { checkScheduleOverlap, buildScheduleOverlapMessage, SCHEDULE_OVERLAP_CODE, SCHEDULE_OVERLAP_SUGGESTIONS };
