import { getBillingCycle } from '../../utils/billingCycle.util.js';
import { todayVn } from '../../utils/formBooking.util.js';
import usageTrackingService from '../payment/usageTracking.service.js';
import { getActorTotals, getChannelTotals } from '../stats/sendStats.service.js';
import * as teamOverviewRepository from '../../repositories/user/teamOverview.repository.js';
import { findOwnerIdForEmployee } from '../../repositories/user/employee.repository.js';

/**
 * Khối "Hoạt động nhóm" (trang Nhân viên) và thẻ "Tiến độ của bạn" (nhân viên) — PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30,
 * PR-7. MỘT nguồn số cho cả hai: thẻ của nhân viên chính là dòng của họ trong bảng.
 *
 * Định nghĩa từng cột (plan mục 2):
 *   - Chiến dịch đang chạy: số chiến dịch (người tạo = dòng đó) có ≥ 1 lượt `running`; `waiting` = trong số đó, chiến dịch
 *     đang chờ tới giờ. KHÔNG phải "đang bật" (campaigns.status = 'active').
 *   - Tin đã gửi tháng này: đếm TỪ BẢNG TIN qua module sendStats, theo `actor_user_id`, tháng lịch VN, KHÔNG gồm lời mời
 *     kết bạn Zalo (không phải "tin") và không gồm gửi nhanh (is_preview — sendStats luôn loại). `failed` = số ĐÍCH chưa
 *     gửi được (không phải số lần thử).
 *   - Lượt AI kỳ này: KỲ của chủ (getBillingCycle), ví của chủ, dòng do người đó thực hiện, loại dòng bán Marketplace;
 *     kèm hạn mức nhân viên (`period_ai_credit_limit`, null = không đặt) — cùng con số cổng chặn so.
 *   - Hoạt động gần nhất: xem findLastActivityByActor.
 *
 * Dòng "Cả công ty" = số của CHÍNH module sendStats (getChannelTotals) và của CHÍNH hàm cổng chặn (getCreditUsageForCycle)
 * — bằng số "Đã gửi" trang Báo cáo cùng khoảng "tháng này" và bằng "đã dùng" ở trang Thanh toán. Dòng "Khác" =
 * công ty − Σ các dòng đã hiện (nhân viên đã rời nhóm, hoặc dòng chưa ghi người thực hiện); chỉ trả khi > 0.
 *
 * ĐIỂM LỆCH ĐÃ BIẾT (chưa sửa, ngoài phạm vi PR-7): người thực hiện của email/Zalo = `campaign.created_by ||
 * campaign.id_user` (campaignEmailSender.service.js), còn Telegram/WhatsApp ghi `actor_user_id` = người đang chạy lượt
 * (campaignChannelRunner.service.js) — không phải người tạo chiến dịch. Chiến dịch Telegram/WhatsApp do nhân viên A tạo
 * nhưng chủ bấm chạy thì tin tính cho chủ, trong khi cột "chiến dịch đang chạy" vẫn tính cho A.
 */

// Lời mời kết bạn Zalo là dòng riêng, không cộng vào "tin" (plan mục 2). Khoá kênh theo registry.
const EXCLUDED_MESSAGE_CHANNELS = Object.freeze(['zalo_friend_request']);

const toCount = (value) => Number(value) || 0;

/** Tháng này theo lịch VN: từ ngày 1 tới hôm nay (gồm trọn hôm nay). */
function currentMonthWindow(now = new Date()) {
  const today = todayVn(now);
  return { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
}

const sumBy = (items, pick) => items.reduce((total, item) => total + toCount(pick(item)), 0);

const iso = (value) => (value ? new Date(value).toISOString() : null);

/**
 * @param {number} ownerId chủ tài khoản (luôn lấy từ token/membership, không bao giờ từ client)
 * @param {{ employeeId?: number|null }} [options] `employeeId`: chỉ một nhân viên (thẻ "Tiến độ của bạn")
 * @returns {Promise<{
 *   period: { fromDate: string, toDate: string },
 *   aiCycle: { start: string, end: string }|null,
 *   owner: object|null,
 *   employees: object[],
 *   other: { sentThisMonth: number, failedThisMonth: number, aiCreditsUsed: number|null }|null,
 *   company: object|null
 * }>}
 */
export async function getTeamOverview(ownerId, { employeeId = null } = {}) {
  const ownerKey = Number(ownerId);
  if (!Number.isInteger(ownerKey) || ownerKey <= 0) {
    throw new TypeError('teamOverview: ownerId phải là số nguyên dương');
  }
  const single = employeeId != null;
  const period = currentMonthWindow();

  // Ngữ cảnh chủ được truyền tường minh: nếu chủ không có gói mà lại là nhân viên của chủ khác, getBillingCycle(ownerId)
  // trần sẽ đổi sang gói của chủ khác — cổng chặn luôn truyền ownerContextId nên ở đây cũng vậy.
  const [members, ownerProfile, cycle] = await Promise.all([
    teamOverviewRepository.findTeamMembers(ownerKey, { employeeId }),
    single ? null : teamOverviewRepository.findOwnerProfile(ownerKey),
    getBillingCycle(ownerKey, { ownerContextId: ownerKey }),
  ]);
  const hasCycle = Boolean(cycle?.hasPlan && cycle.cycleStart && cycle.cycleEnd);
  const aiCycle = hasCycle ? { start: iso(cycle.cycleStart), end: iso(cycle.cycleEnd) } : null;

  // Khoá tra bảng luôn là SỐ (sendStats / SQL trả actor dạng số); `id` trong dòng trả ra giữ nguyên kiểu của cột.
  const actorIds = members.map((member) => Number(member.id));
  if (!single) actorIds.push(ownerKey);
  const scope = { ownerId: ownerKey };
  const statsOptions = { excludeChannels: EXCLUDED_MESSAGE_CHANNELS };

  const [actorTotals, channelTotals, running, aiByActor, companyAi, planLimits, lastActive] = await Promise.all([
    actorIds.length > 0 ? getActorTotals(scope, period, statsOptions) : [],
    single ? null : getChannelTotals(scope, period, statsOptions),
    actorIds.length > 0 ? teamOverviewRepository.findRunningCampaignsByCreator(ownerKey) : [],
    hasCycle && actorIds.length > 0
      ? teamOverviewRepository.findAiCreditUsedByActor(ownerKey, cycle.cycleStart, cycle.cycleEnd)
      : [],
    hasCycle && !single ? usageTrackingService.getCreditUsageForCycle(ownerKey, cycle) : null,
    single ? null : usageTrackingService.getUserPlanLimits(ownerKey),
    teamOverviewRepository.findLastActivityByActor(ownerKey, actorIds),
  ]);

  const sentByActor = new Map(actorTotals.map((row) => [row.actorUserId, row]));
  const runningByActor = new Map(running.map((row) => [row.actorId, row]));
  const aiUsedByActor = new Map(aiByActor.map((row) => [row.actorId, row.used]));
  const lastActiveByActor = new Map(lastActive.map((row) => [row.actorId, row.lastActiveAt]));

  const buildRow = (person, { aiCreditsUsed, aiCreditsLimit = null }) => {
    const key = Number(person.id);
    return {
      id: person.id,
      username: person.username,
      fullName: person.fullName ?? null,
      avatarUrl: person.avatarUrl ?? null,
      status: person.status,
      runningCampaigns: toCount(runningByActor.get(key)?.running),
      waitingCampaigns: toCount(runningByActor.get(key)?.waiting),
      sentThisMonth: toCount(sentByActor.get(key)?.sent),
      failedThisMonth: toCount(sentByActor.get(key)?.failed),
      aiCreditsUsed: hasCycle ? aiCreditsUsed : null,
      aiCreditsLimit,
      lastActiveAt: iso(lastActiveByActor.get(key)),
    };
  };

  const employees = members.map((member) => ({
    ...buildRow(member, {
      aiCreditsUsed: toCount(aiUsedByActor.get(Number(member.id))),
      aiCreditsLimit: member.periodAiCreditLimit,
    }),
    memberStatus: member.memberStatus,
  }));

  if (single) {
    return { period, aiCycle, owner: null, employees, other: null, company: null };
  }

  // Dòng chủ: lượt AI của chủ gồm cả dòng chưa ghi người thực hiện (actor NULL — chủ dùng AI trước khi sổ ghi người
  // thực hiện, hoặc đường ghi không truyền actor). Tin đã gửi thì CHỈ đúng actor = chủ: dòng tin không rõ người thực hiện
  // rơi vào "Khác" (đúng nhãn "không xác định") thay vì bị đoán là của chủ (migration 242 cũng không đoán).
  const ownerRow = ownerProfile
    ? buildRow(ownerProfile, {
      aiCreditsUsed: toCount(aiUsedByActor.get(ownerKey)) + toCount(aiUsedByActor.get(null)),
      aiCreditsLimit: null,
    })
    : null;

  const companySent = sumBy(channelTotals, (row) => row.sent);
  const companyFailed = sumBy(channelTotals, (row) => row.failed);
  const companyAiUsed = hasCycle ? toCount(companyAi?.used) : null;
  const planAiLimit = Number(planLimits?.ai_credits_per_period) || 0;

  const shown = ownerRow ? [ownerRow, ...employees] : employees;
  const otherSent = Math.max(0, companySent - sumBy(shown, (row) => row.sentThisMonth));
  const otherFailed = Math.max(0, companyFailed - sumBy(shown, (row) => row.failedThisMonth));
  const otherAi = hasCycle ? Math.max(0, companyAiUsed - sumBy(shown, (row) => row.aiCreditsUsed)) : null;
  const hasOther = otherSent > 0 || otherFailed > 0 || toCount(otherAi) > 0;

  return {
    period,
    aiCycle,
    owner: ownerRow,
    employees,
    other: hasOther
      ? { sentThisMonth: otherSent, failedThisMonth: otherFailed, aiCreditsUsed: otherAi }
      : null,
    company: {
      sentThisMonth: companySent,
      failedThisMonth: companyFailed,
      aiCreditsUsed: companyAiUsed,
      aiCreditsLimit: hasCycle && planAiLimit > 0 ? planAiLimit : null,
    },
  };
}

/**
 * Thẻ "Tiến độ của bạn" của nhân viên — CÙNG hàm với bảng của chủ, lọc một người. `ownerId` luôn từ token/membership,
 * không bao giờ từ client.
 *
 * @returns {Promise<object|null>} dòng của nhân viên kèm `period` và `aiCycle`; null nếu không thuộc nhóm nào
 */
export async function getMyContribution({ userId, activeContext }) {
  const employeeId = Number(userId);
  let ownerId = null;

  if (activeContext?.type === 'employee' && activeContext.ownerId) {
    ownerId = Number(activeContext.ownerId);
  } else {
    ownerId = await findOwnerIdForEmployee(employeeId);
  }

  if (!ownerId) return null;

  const overview = await getTeamOverview(ownerId, { employeeId });
  const row = overview.employees[0];
  if (!row) return null;
  return { ...row, period: overview.period, aiCycle: overview.aiCycle };
}

export default { getTeamOverview, getMyContribution };
