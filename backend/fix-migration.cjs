const db = require('./src/config/database.js').default;

async function fixMigration() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    // Xóa record migration 115 để nó chạy lại
    await client.query("DELETE FROM schema_migrations WHERE filename = '115_marketplace.sql'");
    await client.query('COMMIT');
    console.log('✓ Đã xóa record migration 115');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Lỗi:', e.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixMigration();
