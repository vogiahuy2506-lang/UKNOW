/**
 * Bảng bậc hoa hồng đối tác Affiliate — Một nguồn sự thật duy nhất cho toàn hệ thống.
 *
 * Mức doanh thu tháng:
 * - Dưới 10.000.000đ: Bậc 1 (10%)
 * - Từ 10.000.000đ đến dưới 20.000.000đ: Bậc 2 (15%)
 * - Từ 20.000.000đ đến dưới 50.000.000đ: Bậc 3 (20%)
 * - Từ 50.000.000đ đến dưới 100.000.000đ: Bậc 4 (25%)
 * - Từ 100.000.000đ trở lên: Bậc 5 (30%)
 */

export const AFFILIATE_TIERS = [
  { level: 1, minRevenue: 0,           ratePercent: 10 },
  { level: 2, minRevenue: 10_000_000,  ratePercent: 15 },
  { level: 3, minRevenue: 20_000_000,  ratePercent: 20 },
  { level: 4, minRevenue: 50_000_000,  ratePercent: 25 },
  { level: 5, minRevenue: 100_000_000, ratePercent: 30 },
];

/**
 * Xác định bậc hoa hồng dựa trên tổng doanh thu tháng hợp lệ.
 * @param {number|string} monthlyRevenue Doanh thu tháng (VND)
 * @returns {{ level: number, minRevenue: number, ratePercent: number }}
 */
export function resolveTier(monthlyRevenue) {
  const rev = Number(monthlyRevenue) || 0;
  for (let i = AFFILIATE_TIERS.length - 1; i >= 0; i--) {
    if (rev >= AFFILIATE_TIERS[i].minRevenue) {
      return AFFILIATE_TIERS[i];
    }
  }
  return AFFILIATE_TIERS[0];
}
