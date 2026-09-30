/**
 * PR-10b — hai lỗi SQL phía admin, kiểm trên PostgreSQL thật (test mock trọn DB không bắt được vụ lệch
 * trạng thái/tuổi dòng):
 *  - C-22: bộ lọc "Kẹt" của trang Hoá đơn điện tử liệt kê cả hoá đơn ĐÃ phát hành (issued/cqt_ok);
 *  - C6-01: `deleteOlderThan(14 ngày)` xoá luôn dòng lịch sử của job chạy hằng tháng → "Chưa ghi nhận".
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { findEinvoices } = await import('../../src/repositories/admin/adminEinvoice.repository.js');
const { metricStuckEinvoices } = await import('../../src/repositories/admin/alert.repository.js');
const { deleteOlderThan } = await import('../../src/repositories/admin/cronJobRun.repository.js');

async function insertEinvoice(user, orderCode, { status, errorCode = null, hoursOld = 30 }) {
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, amount, user_email, user_id, status, payment_method)
     VALUES ($1, 110000, $2, $3, 'success', 'payos') RETURNING id`,
    [orderCode, user.email, user.id],
  );
  const ref = `UK${orderCode}`;
  await db.query(
    `INSERT INTO einvoices (order_id, ma_tra_cuu, mtchieu, khmshdon, khhdon, status, email_status, error_code,
                            created_at, updated_at)
     VALUES ($1, $2, $3, '1', 'C26TAT', $4, 'pending', $5,
             NOW() - make_interval(hours => $6), NOW() - make_interval(hours => $6))`,
    [rows[0].id, ref, ref.slice(0, 20), status, errorCode, hoursOld],
  );
  return orderCode;
}

describe('C-22 — lọc "Kẹt" của trang Hoá đơn điện tử không liệt kê hoá đơn đã phát hành', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('issued/cqt_ok cũ 30 giờ KHÔNG kẹt; pending/processing/retryable-failed quá hạn = stalled; cqt_rejected = dead', async () => {
    const user = await createUser({ username: 'einv-stuck-owner' });
    const issued = await insertEinvoice(user, 9100001, { status: 'issued' });
    const cqtOk = await insertEinvoice(user, 9100002, { status: 'cqt_ok' });
    const pendingOld = await insertEinvoice(user, 9100003, { status: 'pending' });
    const processingOld = await insertEinvoice(user, 9100004, { status: 'processing' });
    const failedRetryableOld = await insertEinvoice(user, 9100005, { status: 'failed', errorCode: 'timeout' });
    const rejected = await insertEinvoice(user, 9100006, { status: 'cqt_rejected' });
    const failedDead = await insertEinvoice(user, 9100007, { status: 'failed', errorCode: 'BAD_TAX_CODE' });
    const pendingFresh = await insertEinvoice(user, 9100008, { status: 'pending', hoursOld: 1 });
    const refunded = await insertEinvoice(user, 9100009, { status: 'failed', errorCode: 'ORDER_REFUNDED' });

    const { rows, total } = await findEinvoices({ status: 'stuck', staleHours: 6, page: 1, limit: 50 });
    // order_code là BIGINT nên pg trả chuỗi — ép số để so sánh.
    const codes = rows.map((r) => Number(r.orderCode)).sort((x, y) => x - y);

    expect(codes).toEqual([pendingOld, processingOld, failedRetryableOld, rejected, failedDead].sort((x, y) => x - y));
    for (const notStuck of [issued, cqtOk, pendingFresh, refunded]) {
      expect(codes).not.toContain(notStuck);
    }
    expect(total).toBe(5);
  });

  it('số hoá đơn kẹt ở trang admin = dead + stalled của cảnh báo (cùng một định nghĩa)', async () => {
    const user = await createUser({ username: 'einv-stuck-owner-2' });
    await insertEinvoice(user, 9200001, { status: 'issued' });
    await insertEinvoice(user, 9200002, { status: 'cqt_ok' });
    await insertEinvoice(user, 9200003, { status: 'pending' });
    await insertEinvoice(user, 9200004, { status: 'cqt_rejected' });

    const page = await findEinvoices({ status: 'stuck', staleHours: 6, page: 1, limit: 50 });
    const alertMetric = await metricStuckEinvoices(6);

    expect(page.total).toBe(2);
    expect(page.total).toBe(alertMetric.deadCount + alertMetric.stalledCount);
  });
});

describe('C6-01 — lịch sử cron của job hằng tháng được giữ lâu hơn 14 ngày', () => {
  const MONTHLY = 'pr10_test_monthly_job';
  const DAILY = 'pr10_test_daily_job';

  const seed = async (jobCode, daysAgo) => {
    await db.query(
      `INSERT INTO cron_job_runs (job_code, status, result, started_at, finished_at)
       VALUES ($1, 'success', '{}'::jsonb,
               NOW() - make_interval(days => $2), NOW() - make_interval(days => $2))`,
      [jobCode, daysAgo],
    );
  };
  const remaining = async (jobCode) => (await db.query(
    `SELECT EXTRACT(DAY FROM NOW() - started_at)::int AS age FROM cron_job_runs WHERE job_code = $1 ORDER BY started_at DESC`,
    [jobCode],
  )).rows.map((r) => r.age);
  const cleanup = () => db.query(`DELETE FROM cron_job_runs WHERE job_code = ANY($1::text[])`, [[MONTHLY, DAILY]]);

  beforeEach(cleanup);
  afterEach(cleanup);

  it('job tháng: dòng 20 ngày còn, dòng 60 ngày bị xoá; job thường: dòng 20 ngày bị xoá như cũ', async () => {
    await seed(MONTHLY, 20);
    await seed(MONTHLY, 60);
    await seed(DAILY, 20);
    await seed(DAILY, 3);

    await deleteOlderThan({ olderThanDays: 14, keepJobCodes: [MONTHLY] });

    expect(await remaining(MONTHLY)).toEqual([20]);
    expect(await remaining(DAILY)).toEqual([3]);
  });

  it('không truyền keepJobCodes → hành vi cũ: mọi dòng > 14 ngày đều bị xoá', async () => {
    await seed(MONTHLY, 20);
    await seed(MONTHLY, 5);

    await deleteOlderThan({ olderThanDays: 14 });

    expect(await remaining(MONTHLY)).toEqual([5]);
  });
});
