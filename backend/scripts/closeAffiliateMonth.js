import 'dotenv/config';
import db from '../src/config/database.js';
import {
  closeAffiliateMonth,
  resolvePreviousMonthKey,
} from '../src/services/affiliate/affiliateMonthClosing.service.js';

/**
 * Script thủ công đóng sổ hoa hồng affiliate theo tháng.
 *
 * Cách dùng:
 *   node scripts/closeAffiliateMonth.js 2026-09
 *   node scripts/closeAffiliateMonth.js          # mặc định đóng tháng liền trước theo giờ VN
 */
async function main() {
  const argMonth = process.argv[2];
  const targetMonth = argMonth || resolvePreviousMonthKey();

  console.log(`[Script] Bắt đầu đóng sổ hoa hồng affiliate cho tháng: ${targetMonth}`);
  if (argMonth) {
    console.log(`[Script] (Tháng được chỉ định từ tham số CLI: ${argMonth})`);
  } else {
    console.log(`[Script] (Mặc định lấy tháng liền trước theo giờ VN: ${targetMonth})`);
  }

  try {
    const result = await closeAffiliateMonth(targetMonth, { force: true });
    console.log('[Script] Hoàn thành đóng sổ thành công:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('[Script] Đóng sổ thất bại:', error.message || error);
    process.exitCode = 1;
  } finally {
    await db.pool.end().catch(() => {});
  }
}

main();
