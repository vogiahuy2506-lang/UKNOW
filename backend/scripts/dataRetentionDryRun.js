#!/usr/bin/env node
/**
 * Script dry-run kiểm tra số lượng bản ghi thoả mãn điều kiện dọn dẹp theo thời hạn lưu trữ.
 * Theo khuôn mẫu an toàn: CHỈ ĐỌC (SELECT COUNT(*)), TỪ CHỐI mọi cờ xoá/thay đổi.
 *
 * Chạy:
 *   cd backend && node scripts/dataRetentionDryRun.js
 */
import 'dotenv/config';
import { countRetentionEligibleRows } from '../src/services/admin/dataRetentionCleanup.service.js';

// Bảo vệ an toàn: Từ chối nếu có bất kỳ cờ thay đổi/xoá nào
const dangerousFlags = ['--apply', '--delete', '--force', '--write', '--cleanup', '--execute'];
const passedDangerous = process.argv.filter((arg) => dangerousFlags.includes(arg.toLowerCase()));
if (passedDangerous.length > 0) {
  console.error(`❌ LỖI BẢO MẬT: Script này CHỈ DÙNG ĐỂ ĐẾM (Dry-run), tuyệt đối không nhận cờ thực thi: ${passedDangerous.join(', ')}`);
  process.exit(1);
}

console.log('================================================================');
console.log('🔍 DRY-RUN: BÁO CÁO THỐNG KÊ DỮ LIỆU ĐẠT ĐIỀU KIỆN DỌN DẸP (PR-N4)');
console.log('================================================================\n');

try {
  const counts = await countRetentionEligibleRows();

  const reportData = [
    {
      'Dữ liệu': 'Khách hàng (customers)',
      'Thời hạn': '90 ngày',
      'Mốc tính': 'users.deleted_at của chủ sở hữu',
      'Số dòng thoả mãn': counts.customers,
    },
    {
      'Dữ liệu': 'Khách tiềm năng (leads)',
      'Thời hạn': '24 tháng / 90 ngày',
      'Mốc tính': 'created_at hoặc 90 ngày sau users.deleted_at',
      'Số dòng thoả mãn': counts.leads,
    },
    {
      'Dữ liệu': 'Chiến dịch (campaign_runs)',
      'Thời hạn': '24 tháng',
      'Mốc tính': 'created_at',
      'Số dòng thoả mãn': counts.campaign_runs,
    },
    {
      'Dữ liệu': 'Thống kê lượt xem (landing_page_events)',
      'Thời hạn': '13 tháng',
      'Mốc tính': 'created_at',
      'Số dòng thoả mãn': counts.landing_page_events,
    },
    {
      'Dữ liệu': 'Biểu mẫu liên hệ (contact_submissions)',
      'Thời hạn': '24 tháng',
      'Mốc tính': 'created_at',
      'Số dòng thoả mãn': counts.contact_submissions,
    },
  ];

  console.table(reportData);

  console.log('\n----------------------------------------------------------------');
  console.log('📌 THỐNG KÊ NHÓM TÀI KHOẢN XOÁ MỀM CŨ:');
  console.log(`- Số tài khoản có status='deleted' nhưng deleted_at IS NULL: ${counts.legacy_deleted_users}`);
  console.log('  (Nhóm này KHÔNG CÓ mốc xác thực nên sẽ KHÔNG BAO GIỜ bị dọn dẹp dữ liệu con).');
  console.log('----------------------------------------------------------------\n');
  console.log('✔ Quá trình dry-run hoàn tất an toàn. Không có dữ liệu nào bị thay đổi.');
  process.exit(0);
} catch (error) {
  console.error('❌ Lỗi khi thực hiện dry-run:', error.message);
  process.exit(1);
}
