import {
  getFunnelCohorts,
  getTimeToFirstSend,
} from '../../repositories/admin/adminFunnel.repository.js';
import { isValidYmd } from './revenueDefinitions.js';

/** Bốn bước của phễu, theo thứ tự — khoá trùng với các cột của cohort (xem adminFunnel.repository.js). */
export const FUNNEL_STEP_KEYS = Object.freeze(['registered', 'channelConnected', 'firstSend', 'paid']);

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Mỗi bước kèm "% so với bước trước" và "mất ở bước này". Bước đầu không có bước trước (null). Bước trước = 0 thì
 * không có phần trăm hợp lệ (null, không phải 0% hay 100%).
 */
export function buildFunnelSteps(totals) {
  return FUNNEL_STEP_KEYS.map((key, index) => {
    const count = Number(totals[key] || 0);
    if (index === 0) return { key, count, pctOfPrevious: null, lost: null };
    const previous = Number(totals[FUNNEL_STEP_KEYS[index - 1]] || 0);
    return {
      key,
      count,
      pctOfPrevious: previous > 0 ? round1((count / previous) * 100) : null,
      lost: previous - count,
    };
  });
}

/**
 * Phễu kích hoạt theo cohort tháng đăng ký, chỉ tính KHÁCH (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9).
 * @param {{ since?: string|null }} [options] 'YYYY-MM-DD' — mặc định 12 tháng dương lịch gần nhất
 */
export async function getFunnelOverview({ since } = {}) {
  const hasSince = since != null && since !== '';
  if (hasSince && (typeof since !== 'string' || !isValidYmd(since))) {
    throw { status: 400, message: 'since không hợp lệ (định dạng YYYY-MM-DD)' };
  }
  const sinceArg = hasSince ? since : null;
  const [{ since: resolvedSince, cohorts }, timeToFirstSend] = await Promise.all([
    getFunnelCohorts({ since: sinceArg }),
    getTimeToFirstSend({ since: sinceArg }),
  ]);

  const totals = cohorts.reduce(
    (acc, c) => {
      for (const key of FUNNEL_STEP_KEYS) acc[key] += c[key];
      acc.paidWithoutSend += c.paidWithoutSend;
      return acc;
    },
    { registered: 0, channelConnected: 0, firstSend: 0, paid: 0, paidWithoutSend: 0 }
  );

  return {
    since: resolvedSince,
    steps: buildFunnelSteps(totals),
    paidWithoutSend: totals.paidWithoutSend,
    cohorts,
    timeToFirstSend,
  };
}
