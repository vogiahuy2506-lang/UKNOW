import db from '../../config/database.js';
import { resolveTier } from '../../utils/affiliateTier.util.js';

export const AFFILIATE_MONTH_CLOSING_JOB_CODE = 'affiliate_month_closing';

/**
 * Kiểm tra cờ cho phép chạy job đóng sổ hoa hồng hàng tháng.
 * Mặc định TẮT trên production để tránh đóng sổ trên số liệu rỗng/chưa sẵn sàng.
 * Mặc định BẬT trong môi trường test/dev nếu không bị set tắt tường minh.
 */
export function isAffiliateClosingEnabled() {
  if (process.env.NODE_ENV === 'production') {
    return process.env.AFFILIATE_CLOSING_ENABLED === 'true';
  }
  if (process.env.AFFILIATE_CLOSING_ENABLED !== undefined) {
    return process.env.AFFILIATE_CLOSING_ENABLED === 'true';
  }
  return true;
}

/**
 * Tính month_key của tháng liền trước theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 * @param {Date} [referenceDate=new Date()]
 * @returns {string} định dạng 'YYYY-MM'
 */
export function resolvePreviousMonthKey(referenceDate = new Date()) {
  const vnFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = vnFormatter.formatToParts(referenceDate);
  let year = parseInt(parts.find((p) => p.type === 'year')?.value, 10);
  let month = parseInt(parts.find((p) => p.type === 'month')?.value, 10);

  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Lấy số dư ví hoa hồng hiện tại của một user (SUM amount trên affiliate_ledger).
 * @param {number|string} userId
 * @param {import('pg').PoolClient|import('pg').Pool} [queryable=db]
 * @returns {Promise<number>}
 */
export async function getAffiliateBalance(userId, queryable = db) {
  const { rows } = await queryable.query(
    'SELECT COALESCE(SUM(amount), 0)::numeric AS balance FROM affiliate_ledger WHERE user_id = $1',
    [userId]
  );
  return Math.round(Number(rows[0]?.balance || 0));
}

/**
 * Thực hiện đóng sổ tháng cho toàn bộ đối tác affiliate.
 *
 * Quy tắc nghiệp vụ (PR-A3):
 * 1. Doanh thu gross chỉ tính các event trong month_key mà người mua ĐÃ CÓ SĐT tại thời điểm đóng sổ.
 * 2. Tính bậc hoa hồng trên tổng gross, làm tròn hoa hồng về đồng (VND không có xu).
 * 3. Nếu period chưa tồn tại: INSERT affiliate_periods + INSERT affiliate_ledger (entry_type='commission').
 * 4. Đối soát event về muộn: Nếu period đã tồn tại và gross mới > gross đã lưu:
 *    - Tính lại bậc trên TỔNG MỚI (không nhân tỉ lệ cũ cho phần chênh lệch).
 *    - Ghi bút toán adjustment (+delta) vào affiliate_ledger.
 *    - Cập nhật lại affiliate_periods với số liệu mới.
 *    - Nếu delta âm: DỪNG và ghi log cảnh báo, không tự ý trừ tiền của khách.
 *
 * @param {string} [monthKeyInput] Định dạng 'YYYY-MM', mặc định là tháng liền trước theo giờ VN
 * @param {object} [options={}]
 * @param {boolean} [options.force=false] Bỏ qua kiểm tra isAffiliateClosingEnabled (dùng cho manual script)
 * @returns {Promise<object>} Tổng kết kết quả đóng sổ
 */
export async function closeAffiliateMonth(monthKeyInput, options = {}) {
  const monthKey = monthKeyInput || resolvePreviousMonthKey();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new Error(`month_key không hợp lệ (yêu cầu định dạng YYYY-MM): "${monthKey}"`);
  }

  if (!options.force && !isAffiliateClosingEnabled()) {
    console.log(`[AffiliateClosing] Bỏ qua đóng sổ tháng ${monthKey} vì AFFILIATE_CLOSING_ENABLED chưa bật`);
    return {
      status: 'noop',
      skipped: true,
      reason: 'disabled',
      monthKey,
      processedReferrers: 0,
      insertedPeriods: 0,
      adjustedPeriods: 0,
      decreasedGrossPeriods: 0,
      totalCommission: 0,
      totalAdjustment: 0,
    };
  }

  // Tìm tất cả referrer có event doanh thu trong tháng đó hoặc đã có period trong tháng đó
  const { rows: candidateRows } = await db.query(
    `SELECT DISTINCT referrer_user_id
     FROM (
       SELECT referrer_user_id FROM affiliate_revenue_events WHERE month_key = $1
       UNION
       SELECT referrer_user_id FROM affiliate_periods WHERE month_key = $1
     ) candidates
     ORDER BY referrer_user_id`,
    [monthKey]
  );

  let processedReferrers = 0;
  let insertedPeriods = 0;
  let adjustedPeriods = 0;
  let decreasedGrossPeriods = 0;
  let totalCommission = 0;
  let totalAdjustment = 0;

  for (const candidate of candidateRows) {
    const referrerId = candidate.referrer_user_id;
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Tính tổng gross revenue hiện tại: CHỈ tính buyer ĐÃ CÓ SĐT tại thời điểm này
      const { rows: grossRows } = await client.query(
        `SELECT COALESCE(SUM(e.amount), 0)::numeric AS current_gross
         FROM affiliate_revenue_events e
         JOIN users b ON b.id = e.buyer_user_id
           AND b.phone IS NOT NULL
           AND TRIM(b.phone) <> ''
         WHERE e.referrer_user_id = $1 AND e.month_key = $2`,
        [referrerId, monthKey]
      );
      const currentGross = Math.max(0, Math.round(Number(grossRows[0]?.current_gross || 0)));
      const tier = resolveTier(currentGross);
      const expectedCommission = Math.round((currentGross * tier.ratePercent) / 100);

      // 2. Kiểm tra period hiện có
      const { rows: existingPeriodRows } = await client.query(
        `SELECT id, gross_revenue, tier_level, rate_percent, commission_amount
         FROM affiliate_periods
         WHERE referrer_user_id = $1 AND month_key = $2
         FOR UPDATE`,
        [referrerId, monthKey]
      );

      if (existingPeriodRows.length === 0) {
        // Period chưa tồn tại -> Tạo mới
        const { rows: insertedPeriod } = await client.query(
          `INSERT INTO affiliate_periods (
             referrer_user_id, month_key, gross_revenue, tier_level, rate_percent, commission_amount
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (referrer_user_id, month_key) DO NOTHING
           RETURNING id, commission_amount`,
          [referrerId, monthKey, currentGross, tier.level, tier.ratePercent, expectedCommission]
        );

        if (insertedPeriod.length > 0) {
          const periodId = insertedPeriod[0].id;
          insertedPeriods += 1;

          if (expectedCommission > 0) {
            await client.query(
              `INSERT INTO affiliate_ledger (
                 user_id, entry_type, amount, ref_type, ref_id, note
               ) VALUES ($1, 'commission', $2, 'period', $3, $4)`,
              [referrerId, expectedCommission, periodId, `Hoa hồng giới thiệu tháng ${monthKey}`]
            );
            totalCommission += expectedCommission;
          }
        }
      } else {
        // Period đã tồn tại -> Đối soát event về muộn / số điện thoại được bổ sung
        const period = existingPeriodRows[0];
        const prevGross = Math.round(Number(period.gross_revenue));
        const prevCommission = Math.round(Number(period.commission_amount));

        if (currentGross > prevGross) {
          const delta = expectedCommission - prevCommission;

          if (delta < 0) {
            console.error(
              `[AffiliateClosing][ERROR] Delta âm khi đối soát event muộn: referrer=${referrerId} month=${monthKey} prevComm=${prevCommission} newComm=${expectedCommission}`
            );
          } else if (delta > 0) {
            await client.query(
              `INSERT INTO affiliate_ledger (
                 user_id, entry_type, amount, ref_type, ref_id, note
               ) VALUES ($1, 'adjustment', $2, 'period', $3, $4)`,
              [referrerId, delta, period.id, `doanh thu về muộn cho tháng ${monthKey}`]
            );

            await client.query(
              `UPDATE affiliate_periods
               SET gross_revenue = $1,
                   tier_level = $2,
                   rate_percent = $3,
                   commission_amount = $4,
                   closed_at = NOW()
               WHERE id = $5`,
              [currentGross, tier.level, tier.ratePercent, expectedCommission, period.id]
            );

            console.warn(
              `[AffiliateClosing] Điều chỉnh hoa hồng do event về muộn: referrer=${referrerId} month=${monthKey} grossCu=${prevGross} grossMoi=${currentGross} delta=+${delta}`
            );

            adjustedPeriods += 1;
            totalAdjustment += delta;
          }
        } else if (currentGross < prevGross) {
          decreasedGrossPeriods += 1;
          console.warn(
            `[AffiliateClosing] Gross giảm so với kỳ trước (buyer bị detach/mất SĐT): referrer=${referrerId} month=${monthKey} grossCu=${prevGross} grossMoi=${currentGross} (giữ nguyên hoa hồng đã ghi: ${prevCommission})`
          );
        }
      }

      await client.query('COMMIT');
      processedReferrers += 1;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[AffiliateClosing] Lỗi xử lý referrer ${referrerId} tháng ${monthKey}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    status: (insertedPeriods > 0 || adjustedPeriods > 0) ? 'success' : 'noop',
    skipped: false,
    monthKey,
    processedReferrers,
    insertedPeriods,
    adjustedPeriods,
    decreasedGrossPeriods,
    totalCommission,
    totalAdjustment,
  };
}
