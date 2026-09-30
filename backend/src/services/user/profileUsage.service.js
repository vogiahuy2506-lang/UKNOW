/**
 * Số "đã dùng" hiển thị trên hồ sơ và trang Thanh toán (GET /users/profile).
 *
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — MỌI đồng hồ ở đây gọi ĐÚNG hàm mà cổng chặn dùng, cùng kỳ:
 *   - tin gửi   : userSendLimit.util.js (countEmailSentInCycle / countZaloSentInCycle / countCombinedSentInCycle,
 *                 countEmailSentToday / countZaloSentToday) với kỳ của getBillingCycle;
 *   - tài nguyên: userResourceLimit.util.js getResourceUsageSnapshot (landing page, tài khoản Zalo / Email /
 *                 WhatsApp / Telegram). Chatbot và nhân viên có cổng riêng nên gọi hàm của chính cổng đó.
 * KHÔNG viết SQL đếm riêng ở đây. Trước đây findProfileUsageCounts / findStructuralUsageCounts tự đếm từ
 * `customer_journey` qua cột `campaign_id` (chưa từng được ghi) và từ bảng/cột không tồn tại (`chatbots`,
 * `landing_pages.owner_user_id`), rồi `.catch` nuốt lỗi → trang luôn hiện 0 trong khi cổng vẫn chặn.
 *
 * Lỗi từng phần: đồng hồ nào hỏng thì console.error kèm TÊN đồng hồ và trả null cho đúng đồng hồ đó (FE hiện "—"),
 * các đồng hồ khác vẫn có số. TUYỆT ĐỐI không trả 0 giả. Hai hàm xuất khẩu không bao giờ ném lỗi.
 */
import { getBillingCycle } from '../../utils/billingCycle.util.js';
import {
  countEmailSentInCycle,
  countZaloSentInCycle,
  countCombinedSentInCycle,
  countEmailSentToday,
  countZaloSentToday,
} from '../../utils/userSendLimit.util.js';
import { getResourceUsageSnapshot } from '../../utils/userResourceLimit.util.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import { resolveEffectiveCeiling } from '../payment/topupLock.service.js';
import { computeEmployeeLimitInfo } from './employee.service.js';

/** Các tài nguyên cổng tạo mới đọc qua RESOURCE_LIMIT_MAP (userResourceLimit.util.js). */
const MAP_RESOURCE_KEYS = ['landingPages', 'zaloAccounts', 'emailAccounts', 'whatsappAccounts', 'telegramAccounts'];

/** Cùng phép ép số nguyên với `toInt` của cổng gửi tin (userSendLimit.util.js). */
const toIntOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
};

/** Chạy một đồng hồ; hỏng thì log tên đồng hồ và trả null (không bao giờ ném). */
async function readMeter(meter, billingUserId, read) {
  try {
    return await read();
  } catch (error) {
    console.error('[Profile] đồng hồ lỗi, trả null', { meter, billingUserId, message: error?.message });
    return null;
  }
}

/**
 * Tin đã gửi trong KỲ của gói (30 ngày từ ngày kích hoạt) — đúng số cổng gửi tin so với hạn mức.
 *
 * - Email : countEmailSentInCycle (7 trạng thái thư đã gửi + gửi nhanh) so với `monthly_email_limit`.
 * - Nhắn tin (Zalo + Telegram + WhatsApp, cùng hạn mức `monthly_zalo_limit`): countZaloSentInCycle — hàm này đã
 *   cộng sẵn kênh adapter (campaign_channel_messages) và gửi nhanh.
 * - Tổng kỳ : countCombinedSentInCycle so với `messages_per_period`, CHỈ khi gói đặt trần tổng.
 * - Hôm nay : CHỈ khi gói có trần ngày tương ứng (countEmailSentToday / countZaloSentToday — cấp chủ tài khoản,
 *   không phải bản `countEmployee*` cấp nhân viên).
 *
 * @param {number|string} billingUserId chủ tài khoản đã resolve (owner khi nhân viên ở ngữ cảnh chủ)
 * @param {{ daily_email_limit?: any, daily_zalo_limit?: any, messages_per_period?: any }|null} planRow dòng gói của hồ sơ
 * @returns {Promise<{
 *   cycleStart: Date|null, cycleEnd: Date|null,
 *   emailSentCycle: number|null, messagingSentCycle: number|null, combinedSentCycle: number|null,
 *   emailSentToday: number|null, messagingSentToday: number|null,
 * }>}
 */
export async function getProfileSendUsage(billingUserId, planRow) {
  let cycle = null;
  try {
    cycle = await getBillingCycle(billingUserId);
  } catch (error) {
    console.error('[Profile] đồng hồ lỗi, trả null', { meter: 'sendCycle', billingUserId, message: error?.message });
  }
  // Chưa có gói (hoặc không dựng được kỳ) thì không có "kỳ" để đếm — cổng cũng bỏ qua trần kỳ trong trường hợp này.
  const hasCycle = Boolean(cycle?.hasPlan && cycle.cycleStart && cycle.cycleEnd);
  const dailyEmailLimit = toIntOrNull(planRow?.daily_email_limit);
  const dailyZaloLimit = toIntOrNull(planRow?.daily_zalo_limit);
  const messagesPerPeriod = toIntOrNull(planRow?.messages_per_period);

  const [
    emailSentCycle,
    messagingSentCycle,
    combinedSentCycle,
    emailSentToday,
    messagingSentToday,
  ] = await Promise.all([
    hasCycle
      ? readMeter('emailSentCycle', billingUserId, () => countEmailSentInCycle(billingUserId, cycle.cycleStart, cycle.cycleEnd))
      : null,
    hasCycle
      ? readMeter('messagingSentCycle', billingUserId, () => countZaloSentInCycle(billingUserId, cycle.cycleStart, cycle.cycleEnd))
      : null,
    hasCycle && messagesPerPeriod !== null
      ? readMeter('combinedSentCycle', billingUserId, () => countCombinedSentInCycle(billingUserId, cycle.cycleStart, cycle.cycleEnd))
      : null,
    dailyEmailLimit !== null
      ? readMeter('emailSentToday', billingUserId, () => countEmailSentToday(billingUserId))
      : null,
    dailyZaloLimit !== null
      ? readMeter('messagingSentToday', billingUserId, () => countZaloSentToday(billingUserId))
      : null,
  ]);

  return {
    cycleStart: hasCycle ? cycle.cycleStart : null,
    cycleEnd: hasCycle ? cycle.cycleEnd : null,
    emailSentCycle,
    messagingSentCycle,
    combinedSentCycle,
    emailSentToday,
    messagingSentToday,
  };
}

/**
 * Chatbot: cổng tạo (chatbot.controller.js createCustomChatbot) KHÔNG đi qua RESOURCE_LIMIT_MAP — đếm
 * `custom_chatbots.is_active = true` (chatbotRepository.countActiveChatbotsByUser, chatbot đã xoá mềm không tính)
 * và trần = `plans.max_chatbots` + slot mua thêm còn hạn. `resolveEffectiveCeiling(…, 'chatbots')` là đúng công
 * thức đó (normalizeCeiling + sumActiveTopupGrants; không có gói → 0). Infinity = không giới hạn → null.
 */
async function readChatbotUsage(billingUserId) {
  const [used, ceiling] = await Promise.all([
    chatbotRepository.countActiveChatbotsByUser(billingUserId),
    resolveEffectiveCeiling(billingUserId, 'chatbots'),
  ]);
  return { used, limit: Number.isFinite(ceiling) ? ceiling : null };
}

/**
 * Nhân viên: computeEmployeeLimitInfo là công thức DUY NHẤT của cổng thêm nhân viên (assertCanAddEmployee) lẫn
 * trang Nhân viên (getEmployeeLimitMeta) — đếm chỉ nhân viên `active` và tài khoản chưa xoá
 * (countActiveEmployees), trần = plans.max_employees + slot mua thêm; -1 = không giới hạn; chưa có gói = 0.
 */
async function readEmployeeUsage(billingUserId) {
  const info = await computeEmployeeLimitInfo(billingUserId);
  let limit = info.effectiveMax;
  if (!info.hasActivePlan) limit = 0;
  else if (info.maxEmployees === -1) limit = null;
  return { used: info.current, limit };
}

/**
 * "Đã dùng / trần" của mọi tài nguyên cấu trúc hiển thị ở trang Thanh toán. Mỗi mục là `{ used, limit }`
 * (limit null = không giới hạn) hoặc null khi đồng hồ đó lỗi.
 *
 * @param {number|string} billingUserId
 * @returns {Promise<Record<'chatbots'|'landingPages'|'zaloAccounts'|'emailAccounts'|'whatsappAccounts'|'telegramAccounts'|'employees',
 *   {used: number, limit: number|null}|null>>}
 */
export async function getProfileResourceUsage(billingUserId) {
  const [mapped, chatbots, employees] = await Promise.all([
    getResourceUsageSnapshot(billingUserId, MAP_RESOURCE_KEYS).catch((error) => {
      console.error('[Profile] đồng hồ lỗi, trả null', { meter: 'resources', billingUserId, message: error?.message });
      return {};
    }),
    readMeter('chatbots', billingUserId, () => readChatbotUsage(billingUserId)),
    readMeter('employees', billingUserId, () => readEmployeeUsage(billingUserId)),
  ]);

  return {
    chatbots,
    landingPages: mapped.landingPages ?? null,
    zaloAccounts: mapped.zaloAccounts ?? null,
    emailAccounts: mapped.emailAccounts ?? null,
    whatsappAccounts: mapped.whatsappAccounts ?? null,
    telegramAccounts: mapped.telegramAccounts ?? null,
    employees,
  };
}
