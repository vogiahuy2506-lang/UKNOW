const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Quy về ngày lịch (bỏ giờ/phút) theo giờ VN, dùng UTC làm mốc trung tính để cộng/so ngày an toàn. */
function toVnDateOnlyUtc(date) {
  const s = date.toLocaleDateString('en-CA', { timeZone: VN_TZ }); // 'YYYY-MM-DD'
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Đếm số ngày làm việc (bỏ Thứ Bảy/Chủ Nhật) đã trôi qua kể từ `requestedAt` tới `referenceDate`
 * (mặc định "bây giờ"), theo giờ Việt Nam. Ngày tạo yêu cầu KHÔNG được tính — chỉ đếm từ hôm
 * sau trở đi tới hết ngày tham chiếu.
 *
 * Không trừ ngày lễ — repo không có nguồn dữ liệu lịch lễ. Đếm thiếu 1-2 ngày lễ làm số NHỎ
 * hơn thực tế, tức NGHIÊM HƠN với thời hạn 7 ngày làm việc đã hứa (ToS 15.3) — an toàn hơn là
 * đếm dư khiến một yêu cầu thực đã quá hạn nhưng chưa được cảnh báo.
 *
 * @param {string|Date|null|undefined} requestedAt
 * @param {Date} [referenceDate]
 * @returns {number}
 */
export function countBusinessDaysElapsed(requestedAt, referenceDate = new Date()) {
  if (!requestedAt) return 0;
  const start = new Date(requestedAt);
  if (Number.isNaN(start.getTime())) return 0;

  const startDate = toVnDateOnlyUtc(start);
  const refDate = toVnDateOnlyUtc(referenceDate);

  let count = 0;
  const cursor = new Date(startDate);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= refDate.getTime()) {
    const dayOfWeek = cursor.getUTCDay(); // 0 = CN, 6 = T7
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Mức độ khẩn cấp của MỘT yêu cầu rút PENDING so với lời hứa "chi trả trong 07 ngày làm việc"
 * (trang công bố + ToS 15.3). Chỉ áp dụng cho status === 'pending' — yêu cầu đã paid/rejected
 * dù cũ tới đâu cũng không còn ý nghĩa "đang giữ tiền quá hạn".
 *
 * @param {{ status?: string, requested_at?: string|Date|null }} withdrawal
 * @param {Date} [referenceDate]
 * @returns {{ level: 'warning'|'overdue', businessDays: number, text: string } | null}
 */
export function getWithdrawalUrgency(withdrawal, referenceDate = new Date()) {
  if (!withdrawal || withdrawal.status !== 'pending') return null;
  const businessDays = countBusinessDaysElapsed(withdrawal.requested_at, referenceDate);
  if (businessDays > 7) {
    return { level: 'overdue', businessDays, text: `Quá hạn ${businessDays - 7} ngày` };
  }
  if (businessDays >= 6) {
    return { level: 'warning', businessDays, text: 'Còn 1 ngày' };
  }
  return null;
}
