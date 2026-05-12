/**
 * Đóng pg pool sau toàn bộ test (tránh Jest hang vì handle còn mở).
 */
import db from '../../src/config/database.js';

export default async function globalTeardown() {
  try {
    await db.pool.end();
  } catch {
    // pool có thể đã end trong test — bỏ qua
  }
}
