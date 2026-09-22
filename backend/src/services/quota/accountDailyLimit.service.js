/**
 * Giới hạn gửi/ngày do NGƯỜI DÙNG tự đặt cho TỪNG TÀI KHOẢN GỬI (email_settings / zalo_settings),
 * khác trục với hạn mức GÓI (sendQuotaReservation.service.js, theo billing user).
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, Việc 2.
 *
 * Không chặn — chỉ báo cho chỗ gọi để tự quyết định hoãn/dừng (Việc 3, 4). Không có ledger, không
 * reservation: đếm thẳng từ email_messages/zalo_messages tại thời điểm kiểm tra (đọc, không ghi).
 */
import db from '../../config/database.js';
import {
  countEmailSentTodayByAccount,
  countZaloSentTodayByAccount,
} from '../../repositories/sendQuota.repository.js';
import { getVnDayBoundaries } from './sendQuotaReservation.service.js';

const COUNTERS_BY_CHANNEL = {
  email: countEmailSentTodayByAccount,
  zalo: countZaloSentTodayByAccount,
};

/**
 * @param {object} params
 * @param {'email'|'zalo'} params.channel
 * @param {number|string} params.accountId — `email_settings.id` hoặc `zalo_settings.id`
 * @param {number|null} params.limit — `user_daily_send_limit`; null = không giới hạn
 * @param {number} [params.quantity] — số tin sắp gửi thêm (mặc định 1)
 * @param {import('pg').Pool|import('pg').PoolClient} [params.queryable]
 * @param {Date} [params.now]
 * @returns {Promise<{allowed: true} | {allowed: false, limit: number, currentCount: number, resetAt: Date}>}
 */
export async function checkAccountDailyLimit({
  channel,
  accountId,
  limit,
  quantity = 1,
  queryable = db,
  now = new Date(),
}) {
  // Đường mặc định (chưa ai đặt giới hạn) phải rẻ — không chạm DB. Đây là ca của gần như mọi
  // tài khoản hôm nay (Việc 1 vừa lên, chưa mở UI ở Việc 5/6).
  if (limit == null) return { allowed: true };

  const counter = COUNTERS_BY_CHANNEL[channel];
  if (!counter) {
    throw new Error(`checkAccountDailyLimit: kênh không hợp lệ '${channel}'`);
  }

  const { vnDayStart, vnDayEnd } = getVnDayBoundaries(now);
  const currentCount = await counter(queryable, accountId, vnDayStart, vnDayEnd);

  if (currentCount + quantity <= limit) return { allowed: true };

  return { allowed: false, limit, currentCount, resetAt: vnDayEnd };
}
