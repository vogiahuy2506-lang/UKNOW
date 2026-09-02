/**
 * Script cứu hộ 49 tài khoản Zalo kẹt ở trạng thái disconnected (PR-2)
 *
 * Cách chạy an toàn:
 * 1. Chạy thử trước (Dry-run):
 *    node scripts/rescueDisconnectedZaloAccounts.js --dry-run
 *
 * 2. Cứu hộ theo đợt 10 tài khoản (mặc định):
 *    node scripts/rescueDisconnectedZaloAccounts.js --batch-size=10
 *
 * 3. Sau mỗi đợt, chờ 5-15 phút để keep-alive cron thử khôi phục, kiểm tra log:
 *    SELECT status, count(*) FROM zalo_settings GROUP BY status;
 */

import 'dotenv/config';
// KHONG dung `import { pool }` — config/database.js chi co default export
// { query, getClient, pool, withRetry, isConnectionError }, khong co named export nao
// ten `pool`. Moi script khac trong scripts/ deu dung `db.pool`. Xem ghi chu cung noi
// dung o cleanupStalledRuns.js:112.
import db from '../src/config/database.js';

async function rescueAccounts() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const batchSizeArg = args.find((a) => a.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 10;

  console.log('====================================================');
  console.log('🛠️  ZALO DISCONNECTED RESCUE SCRIPT (PR-2)');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (Không thay đổi DB)' : 'LIVE EXECUTION'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('====================================================\n');

  const client = await db.pool.connect();
  try {
    // 1. Thống kê hiện trạng
    const statRes = await client.query(`
      SELECT 
        status,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE cookie_text IS NOT NULL AND cookie_text <> '') AS con_cookie,
        COUNT(*) FILTER (WHERE cookie_text IS NULL OR cookie_text = '') AS mat_cookie
      FROM zalo_settings
      WHERE is_active = TRUE
      GROUP BY status
      ORDER BY status;
    `);

    console.log('📊 Hiện trạng tài khoản Zalo trong DB:');
    console.table(statRes.rows);

    // 2a. Đếm và cảnh báo các tài khoản disconnected trùng số với tài khoản đang
    // connected. Zalo chỉ cho MỘT phiên sống trên một số — hồi sinh tài khoản này sẽ
    // khiến cron đăng nhập lại và ĐÁ VĂNG phiên đang chạy của tài khoản connected.
    // Đã đo trên production 02/09: 4 tài khoản rơi vào ca này, trong đó có tài khoản
    // đang dùng để gửi tin thật.
    const skippedRes = await client.query(`
      SELECT d.id, d.display_name, d.zalo_phone, c.id AS conflicts_with_id, c.display_name AS conflicts_with_name
      FROM zalo_settings d
      JOIN zalo_settings c
        ON regexp_replace(COALESCE(c.zalo_phone, ''), '^\\+?84', '0')
         = regexp_replace(COALESCE(d.zalo_phone, ''), '^\\+?84', '0')
       AND c.status = 'connected' AND c.is_active = TRUE
      WHERE d.status = 'disconnected' AND d.is_active = TRUE
        AND NULLIF(TRIM(COALESCE(d.zalo_phone, '')), '') IS NOT NULL
    `);
    if (skippedRes.rows.length > 0) {
      console.log(`\n⚠️  Loại ${skippedRes.rows.length} tài khoản vì TRÙNG SỐ với phiên đang sống (không cứu, tránh đá văng phiên đang chạy):`);
      console.table(skippedRes.rows);
    }
    const skippedIds = skippedRes.rows.map((r) => r.id);

    // 2b. Lấy danh sách tài khoản cần cứu hộ (còn cookie), loại các id trùng số ở trên,
    // ưu tiên tài khoản mới rớt gần đây nhất — đó cũng là khách đang dùng thật, và tỉ lệ
    // cứu thành công cao hơn hẳn so với tài khoản đã chết từ nhiều tháng trước.
    const findRes = await client.query(
      `
      SELECT id, id_user, display_name, zalo_phone, status, restore_fail_count, first_restore_fail_at, updated_at
      FROM zalo_settings
      WHERE status = 'disconnected'
        AND is_active = TRUE
        AND cookie_text IS NOT NULL
        AND cookie_text <> ''
        AND NOT (id = ANY($2::int[]))
      ORDER BY updated_at DESC
      LIMIT $1;
      `,
      [batchSize, skippedIds.length > 0 ? skippedIds : [0]]
    );

    const targetAccounts = findRes.rows;
    if (targetAccounts.length === 0) {
      console.log('✅ Không còn tài khoản disconnected nào còn cookie cần cứu hộ.');
      return;
    }

    console.log(`\n🎯 Tìm thấy ${targetAccounts.length} tài khoản trong đợt này:`);
    console.table(
      targetAccounts.map((a) => ({
        id: a.id,
        user_id: a.id_user,
        name: a.display_name,
        phone: a.zalo_phone,
        fails: a.restore_fail_count,
      }))
    );

    if (isDryRun) {
      console.log('\n[DRY-RUN] Sẽ đổi các tài khoản trên về status = "connected" (giữ nguyên restore_fail_count; lùi first_restore_fail_at về updated_at cũ nếu đang trống).');
      console.log('Chạy lại không có cờ --dry-run để thực thi.');
      return;
    }

    // 3. Thực thi cập nhật.
    //
    // CỐ Ý KHÔNG reset restore_fail_count.
    //
    // recordRestoreFailure chỉ chuyển tài khoản sang 'needs_reauth' khi đủ 5 lần thất bại
    // VÀ đã qua 60 phút kể từ first_restore_fail_at. Nếu xoá mốc thời gian cũ, đồng hồ 60
    // phút chạy lại từ đầu — tài khoản chết thật sẽ mang trạng thái 'connected' suốt hơn
    // một giờ, và findDefaultZaloSettingId (chọn theo status='connected' ORDER BY id ASC)
    // có thể chọn trúng nó làm tài khoản gửi mặc định cho chiến dịch mới.
    //
    // ĐÍNH CHÍNH (đo được ngay sau đợt 1): tài khoản có fail_count=0 lúc cứu (đa số 41
    // tài khoản còn lại) thì first_restore_fail_at đang NULL — không có mốc cũ nào để
    // "giữ nguyên". Đồng hồ 60 phút vẫn chạy lại từ đầu dù không đụng gì tới cột này.
    // Đo thật: id 68 (fail_count=0 trước khi cứu) sau 15 phút đã thất bại 4 lần nhưng vẫn
    // kẹt ở 'connected' vì chưa đủ 60 phút — sẽ mất gần 1 giờ mới trôi về 'needs_reauth'.
    //
    // SỬA: lùi first_restore_fail_at về đúng thời điểm tài khoản bị đánh dấu disconnected
    // (chính là updated_at TRƯỚC câu UPDATE này — vế phải đọc giá trị CŨ của dòng, không
    // phải CURRENT_TIMESTAMP đang gán bên dưới). Về nghĩa là đúng: tài khoản đã hỏng từ
    // lúc đó, không phải từ lúc ta bấm cứu. Về hiệu quả: điều kiện 60 phút thoả ngay cho
    // MỌI tài khoản (kể cả fail_count=0), nên tài khoản chết trôi về 'needs_reauth' sau
    // tối đa 5 lần thử (~25 phút) thay vì gần 1 giờ.
    //
    // Kết quả sau khi sửa:
    //  - Tài khoản SỐNG: khôi phục thành công, markAccountConnected tự reset bộ đếm về 0.
    //  - Tài khoản CHẾT: rơi về 'needs_reauth' sau tối đa 5 lần thử, bất kể fail_count
    //    trước khi cứu là 0 hay đã có sẵn.
    const accountIds = targetAccounts.map((a) => a.id);
    const updateRes = await client.query(
      `
      UPDATE zalo_settings
      SET status = 'connected',
          first_restore_fail_at = COALESCE(first_restore_fail_at, updated_at),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::int[])
      RETURNING id, id_user, display_name, status, restore_fail_count, first_restore_fail_at;
      `,
      [accountIds]
    );

    console.log(`\n🎉 Đã khôi phục ${updateRes.rowCount} tài khoản về hàng đợi "connected":`);
    console.table(updateRes.rows);

    console.log('\n💡 Bước tiếp theo:');
    console.log('1. Keep-alive cron (chạy mỗi 5 phút) sẽ tự động thử khôi phục session cho các tài khoản trên.');
    console.log('2. Tài khoản sống sẽ duy trì "connected" (bộ đếm thất bại tự reset khi khôi phục thành công).');
    console.log('   Tài khoản chết thật sẽ trôi về "needs_reauth" sau tối đa 5 lần thử (~25 phút) —');
    console.log('   mốc 60 phút đã được lùi về đúng thời điểm tài khoản bị ngắt, không phải lúc cứu.');
    console.log('3. Kiểm tra log backend: [ZaloKeepAlive] hoặc [ZaloRestore].');
  } catch (err) {
    console.error('❌ Lỗi khi thực thi script cứu hộ:', err);
  } finally {
    client.release();
    await db.pool.end();
  }
}

rescueAccounts();
