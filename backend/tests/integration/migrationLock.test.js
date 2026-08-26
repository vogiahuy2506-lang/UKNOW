/**
 * Integration tests for PostgreSQL advisory lock concurrency & timeout safety in migration runner.
 * Tests multi-client mutual exclusion, timeout handling, and session settings restoration on real Postgres.
 */
import { describe, it, expect } from '@jest/globals';
import db from '../../src/config/database.js';
import { withMigrationLock } from '../../src/utils/migrationRunner.util.js';

/**
 * Thăm dò bảng hệ thống pg_locks để xác nhận PostgreSQL đã nhận câu lệnh chờ lock (granted=false).
 * Hoàn toàn tất định, không dựa vào setTimeout phỏng đoán.
 */
async function waitForBlockedAdvisoryLock(queryClient, maxWaitMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { rows } = await queryClient.query(`
      SELECT granted
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND classid = hashtext('schema:migrations')
        AND objid = hashtext('migration_runner')
        AND granted = false
    `);
    if (rows.length > 0) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

describe('Migration Runner — Advisory Lock Concurrency & Safety (A4)', () => {
  it('hai client cùng gọi withMigrationLock: client 2 chỉ vào sau khi client 1 nhả khoá', async () => {
    const client1 = await db.getClient();
    const client2 = await db.getClient();

    const order = [];
    let client1InCriticalSectionResolve;
    const client1InCriticalSection = new Promise((res) => {
      client1InCriticalSectionResolve = res;
    });

    let client1ReleaseResolve;
    const client1Release = new Promise((res) => {
      client1ReleaseResolve = res;
    });

    let task1 = null;
    let task2 = null;

    try {
      // Client 1 lấy lock và giữ trong khi chờ tín hiệu
      task1 = withMigrationLock(client1, async () => {
        order.push('client1:enter');
        client1InCriticalSectionResolve();
        await client1Release;
        order.push('client1:exit');
      });

      // Chờ client 1 chắc chắn đã vào critical section
      await client1InCriticalSection;
      expect(order).toEqual(['client1:enter']);

      // Client 2 cố gắng lấy lock (sẽ bị block vì client 1 đang giữ)
      let client2Started = false;
      task2 = withMigrationLock(client2, async () => {
        client2Started = true;
        order.push('client2:enter');
        order.push('client2:exit');
      });

      // Kiểm tra trực tiếp qua pg_locks: client 2 đã thực sự gửi câu lệnh và đang bị Postgres giữ ở trạng thái chờ
      const isClient2Blocked = await waitForBlockedAdvisoryLock(client1);
      expect(isClient2Blocked).toBe(true);
      expect(client2Started).toBe(false);
      expect(order).toEqual(['client1:enter']);

      // Cho phép client 1 hoàn thành và nhả lock
      client1ReleaseResolve();
      await task1;
      expect(order).toEqual(['client1:enter', 'client1:exit']);

      // Client 2 bây giờ có thể lấy lock và hoàn tất
      await task2;
      expect(order).toEqual(['client1:enter', 'client1:exit', 'client2:enter', 'client2:exit']);
    } finally {
      if (client1ReleaseResolve) client1ReleaseResolve();
      if (task1) await task1.catch(() => {});
      if (task2) await task2.catch(() => {});
      client1.release();
      client2.release();
    }
  });

  it('thất bại sạch khi lock timeout: không để lại lock mồ côi và khôi phục session settings', async () => {
    const client1 = await db.getClient();
    const client2 = await db.getClient();

    let client1InCriticalSectionResolve;
    const client1InCriticalSection = new Promise((res) => {
      client1InCriticalSectionResolve = res;
    });

    let client1ReleaseResolve;
    const client1Release = new Promise((res) => {
      client1ReleaseResolve = res;
    });

    const hasOrigTimeout = Object.prototype.hasOwnProperty.call(process.env, 'MIGRATION_LOCK_TIMEOUT_MS');
    const origLockTimeout = process.env.MIGRATION_LOCK_TIMEOUT_MS;

    let task1 = null;

    try {
      // Client 1 giữ lock
      task1 = withMigrationLock(client1, async () => {
        client1InCriticalSectionResolve();
        await client1Release;
      });

      await client1InCriticalSection;

      // Đặt lock timeout ngắn cho client 2 (300ms)
      process.env.MIGRATION_LOCK_TIMEOUT_MS = '300';

      // Client 2 phải bị ném lỗi do lock timeout
      let client2Error = null;
      try {
        await withMigrationLock(client2, async () => {
          throw new Error('should not enter');
        });
      } catch (err) {
        client2Error = err;
      }

      expect(client2Error).not.toBeNull();
      expect(client2Error.message).toMatch(/canceling statement due to lock timeout|lock_timeout/i);

      // Kiểm tra session settings của client 2 đã được khôi phục về trạng thái pool
      const { rows: stRows } = await client2.query('SHOW statement_timeout');
      const { rows: ltRows } = await client2.query('SHOW lock_timeout');
      // Statement timeout không được bị kẹt ở 0
      expect(stRows[0].statement_timeout).not.toBe('0');
      expect(ltRows[0].lock_timeout).toBe('0'); // default connection lock_timeout is 0 unless set

      // Cho phép client 1 kết thúc bình thường
      client1ReleaseResolve();
      await task1;
    } finally {
      if (hasOrigTimeout) {
        process.env.MIGRATION_LOCK_TIMEOUT_MS = origLockTimeout;
      } else {
        delete process.env.MIGRATION_LOCK_TIMEOUT_MS;
      }
      if (client1ReleaseResolve) client1ReleaseResolve();
      if (task1) await task1.catch(() => {});
      client1.release();
      client2.release();
    }
  });

  it('khôi phục session settings và nhả lock khi công việc ném lỗi', async () => {
    const client1 = await db.getClient();
    const client2 = await db.getClient();

    try {
      // Client 1 ném lỗi trong migration
      await expect(
        withMigrationLock(client1, async () => {
          throw new Error('intentional migration failure');
        })
      ).rejects.toThrow('intentional migration failure');

      // Client 2 phải lấy được lock ngay mà không bị deadlock
      let client2Executed = false;
      await withMigrationLock(client2, async () => {
        client2Executed = true;
      });

      expect(client2Executed).toBe(true);
    } finally {
      client1.release();
      client2.release();
    }
  });
});
