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

    // 2. Lấy danh sách tài khoản cần cứu hộ (còn cookie)
    const findRes = await client.query(
      `
      SELECT id, id_user, display_name, zalo_phone, status, restore_fail_count, first_restore_fail_at, updated_at
      FROM zalo_settings
      WHERE status = 'disconnected'
        AND is_active = TRUE
        AND cookie_text IS NOT NULL
        AND cookie_text <> ''
      ORDER BY id ASC
      LIMIT $1;
      `,
      [batchSize]
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
      console.log('\n[DRY-RUN] Sẽ cập nhật các tài khoản trên về status = "connected", restore_fail_count = 0.');
      console.log('Chạy lại không có cờ --dry-run để thực thi.');
      return;
    }

    // 3. Thực thi cập nhật
    const accountIds = targetAccounts.map((a) => a.id);
    const updateRes = await client.query(
      `
      UPDATE zalo_settings
      SET status = 'connected',
          restore_fail_count = 0,
          first_restore_fail_at = NULL,
          last_restore_attempt_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::int[])
      RETURNING id, id_user, display_name, status;
      `,
      [accountIds]
    );

    console.log(`\n🎉 Đã khôi phục ${updateRes.rowCount} tài khoản về hàng đợi "connected":`);
    console.table(updateRes.rows);

    console.log('\n💡 Bước tiếp theo:');
    console.log('1. Keep-alive cron (chạy mỗi 5 phút) sẽ tự động thử khôi phục session cho các tài khoản trên.');
    console.log('2. Tài khoản sống sẽ duy trì "connected". Tài khoản chết thật sẽ tự chuyển về "needs_reauth" sau 5 lần / 60 phút.');
    console.log('3. Kiểm tra log backend: [ZaloKeepAlive] hoặc [ZaloRestore].');
  } catch (err) {
    console.error('❌ Lỗi khi thực thi script cứu hộ:', err);
  } finally {
    client.release();
    await db.pool.end();
  }
}

rescueAccounts();
