#!/usr/bin/env node
/**
 * Một lần: bù dữ liệu cũ cho Marketplace chiến dịch kèm mẫu (PLAN_MARKETPLACE_CHIEN_DICH_KEM_MAU_2026-10-19, PR-3).
 *
 *  1. Listing chiến dịch cũ  — nhúng nội dung mẫu SỐNG của người bán vào snapshot (`snapshot_data.templates`) + gỡ dữ liệu gắn người bán
 *     (tài khoản gửi, người nhận nhập tay, nguồn sheet/form/landing/tag…). Listing có mẫu đã mất → CHỈ BÁO, không sửa.
 *  2. Chiến dịch đã mua (còn `draft`, 0 lượt chạy) — tạo bản sao mẫu cho người mua (+ chép tệp đính kèm sang `uploads/<người mua>/`,
 *     ghi sổ dung lượng), đổi id mẫu và gỡ dữ liệu người bán ở `campaign_nodes.config` + `flow_json`. Mỗi chiến dịch MỘT transaction.
 *
 * Mặc định DRY-RUN (chỉ in bảng, không ghi DB, không chép tệp). Thêm --apply để ghi. Chạy lại an toàn (không nhân đôi mẫu/tệp).
 *
 * Usage:
 *   node scripts/backfillMarketplaceCampaignTemplates.js                       # dry-run
 *   node scripts/backfillMarketplaceCampaignTemplates.js --apply               # ghi thật
 *   node scripts/backfillMarketplaceCampaignTemplates.js --listing=2,4 --campaign=10   # giới hạn phạm vi
 *   node scripts/backfillMarketplaceCampaignTemplates.js --json                # in thêm báo cáo JSON
 * Trên VPS (thư mục làm việc của container là /app):
 *   docker exec uknow-campaign-backend node scripts/backfillMarketplaceCampaignTemplates.js
 *   docker exec uknow-campaign-backend node scripts/backfillMarketplaceCampaignTemplates.js --apply
 *
 * Mã thoát: 0 = xong (kể cả có mục bỏ qua); 1 = có mục LỖI hoặc lỗi nghiêm trọng.
 */
// Nạp backend/.env (DB_HOST…, STORAGE_BACKEND…) như các script khác — thiếu thì `docker exec … node scripts/…` nối nhầm 127.0.0.1:5432.
import 'dotenv/config';
import db from '../src/config/database.js';
import {
  formatBackfillReport,
  runMarketplaceCampaignBackfill,
} from '../src/services/marketplace/marketplaceCampaignBackfill.service.js';

const apply = process.argv.includes('--apply');
const asJson = process.argv.includes('--json');

function readIdList(flag) {
  const arg = process.argv.find((item) => item.startsWith(`${flag}=`));
  if (!arg) return null;
  const ids = arg.slice(flag.length + 1).split(',').map((value) => value.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !/^\d{1,15}$/.test(id))) {
    throw new Error(`${flag} phải là danh sách id số, ví dụ ${flag}=2,4`);
  }
  return ids;
}

async function main() {
  const report = await runMarketplaceCampaignBackfill({
    apply,
    listingIds: readIdList('--listing'),
    campaignIds: readIdList('--campaign'),
    log: (line) => console.error(line),
  });
  console.log(formatBackfillReport(report));
  if (asJson) console.log(JSON.stringify(report, null, 2));
  if (report.totals.errors > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[marketplace-backfill] FATAL:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end().catch(() => {});
  });
