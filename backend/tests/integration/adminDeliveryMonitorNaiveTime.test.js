/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — trang Giám sát gửi tin của ADMIN phải đúng khi ba cột thời gian của
 * `campaign_runs` là `timestamp` KHÔNG múi giờ (giờ VN), như PRODUCTION (đo 30/09): `recentRuns[].startedAt` đi qua
 * `::timestamptz`, "lượt lỗi trong kỳ" so `completed_at` naive với NGÀY VN, mốc "cần gửi" 26/09 20:36 tính theo giờ VN.
 *
 * Vì sao cần file riêng: bootstrap.sql khai ba cột này là TIMESTAMPTZ (lệch production), nên ở mọi ca khác
 * `started_at::timestamptz` là phép no-op và thiếu nó cũng không đỏ. node-pg đọc `timestamp` naive theo múi giờ TIẾN
 * TRÌNH (UTC — script integration đặt TZ=UTC) nên lượt bắt đầu 18:00 VN ra `…T18:00:00Z` = 01:00 ngày hôm sau ở trình
 * duyệt VN; có `::timestamptz` thì ra `…T11:00:00Z`.
 *
 * File này ép ba cột về naive giống production trong beforeAll và TRẢ LẠI TIMESTAMPTZ trong afterAll: integration chạy
 * --runInBand trên MỘT DB dùng chung nên các file sau vẫn phải thấy schema gốc của bootstrap.sql.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

const RUN_TIME_COLUMNS = ['started_at', 'completed_at', 'created_at'];
const VN = "'Asia/Ho_Chi_Minh'";

async function setRunTimeColumnsType(type) {
  // Từ timestamptz sang naive: lấy giờ tường ở VN. Ngược lại: coi giờ tường là giờ VN.
  const alterations = RUN_TIME_COLUMNS
    .map((column) => `ALTER COLUMN ${column} TYPE ${type} USING (${column} AT TIME ZONE ${VN})`)
    .join(', ');
  await db.query(`ALTER TABLE campaign_runs ${alterations}`);
}

let app;
let owner;
let token;

beforeAll(async () => {
  app = createApp();
  await truncateAll();
  await setRunTimeColumnsType('timestamp');
  const admin = await createUser({ role: 'admin', username: 'adminNaive' });
  owner = await createUser({ username: 'uNaive' });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: admin.username, password: admin.plainPassword });
  token = login.body.data.accessToken;
});

afterAll(async () => {
  // Dọn lỗi thì vẫn PHẢI trả schema về (bước sau), rồi mới báo lỗi dọn.
  let cleanupError = null;
  try {
    await truncateAll();
  } catch (error) {
    cleanupError = error;
  }
  await setRunTimeColumnsType('timestamptz');
  const { rows } = await db.query(
    `SELECT DISTINCT data_type FROM information_schema.columns
      WHERE table_name = 'campaign_runs' AND column_name = ANY($1::text[])`,
    [RUN_TIME_COLUMNS]
  );
  await db.pool.end();
  if (cleanupError) throw cleanupError;
  // Trả schema chưa về đúng thì các file integration chạy sau sẽ đọc sai kiểu — nổ ngay ở đây, đừng để lệch im lặng.
  if (rows.length !== 1 || rows[0].data_type !== 'timestamp with time zone') {
    throw new Error(`campaign_runs chưa trả về TIMESTAMPTZ: ${JSON.stringify(rows)}`);
  }
});

/** Các mốc là literal `YYYY-MM-DD HH:MM:SS` (giờ VN) hoặc biểu thức SQL naive. */
async function insertRun({ name, startedAt, createdAt = startedAt, completedAt = null, totalRecipients = 0, status = 'completed', metadata = {} }) {
  const campaign = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $1, $1, $2, 'email', 'active', NOW()) RETURNING id`,
    [owner.id, name]
  );
  const literal = (value) => (/^\d{4}-/.test(value) ? `TIMESTAMP '${value}'` : value);
  const run = await db.query(
    `INSERT INTO campaign_runs
       (id_campaign, workspace_owner_id, run_type, status, started_at, created_at, completed_at, total_recipients, run_metadata)
     VALUES ($1, $2, 'manual', $3, ${literal(startedAt)}, ${literal(createdAt)}, ${completedAt ? literal(completedAt) : 'NULL'}, $4, $5::jsonb)
     RETURNING id`,
    [campaign.rows[0].id, owner.id, status, totalRecipients, JSON.stringify(metadata)]
  );
  const runId = Number(run.rows[0].id);
  // Một tin đã gửi (mọi thời điểm) để có số "đã gửi" so với "cần gửi".
  await db.query(
    `INSERT INTO email_messages
       (workspace_owner_id, actor_user_id, id_campaign, id_run, recipient_email, email_step, status, is_preview,
        tracking_token, sent_at, created_at)
     VALUES ($1, $1, $2, $3, 'a@t.vn', 1, 'sent', FALSE, md5(random()::text || clock_timestamp()::text), LOCALTIMESTAMP, LOCALTIMESTAMP)`,
    [owner.id, campaign.rows[0].id, runId]
  );
  return runId;
}

async function getData(query = '') {
  const res = await request(app).get(`/api/admin/delivery-monitor/overview${query}`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.data;
}

const runsByName = (data) => Object.fromEntries(data.recentRuns.map((run) => [run.campaignName, run]));

describe('campaign_runs với cột thời gian NAIVE (như production) — trang admin', () => {
  it('điều kiện đầu vào: ba cột đã là "timestamp without time zone" — nếu không thì các ca dưới rỗng nghĩa', async () => {
    const { rows } = await db.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'campaign_runs' AND column_name = ANY($1::text[]) ORDER BY column_name`,
      [RUN_TIME_COLUMNS]
    );
    expect(rows).toEqual([
      { column_name: 'completed_at', data_type: 'timestamp without time zone' },
      { column_name: 'created_at', data_type: 'timestamp without time zone' },
      { column_name: 'started_at', data_type: 'timestamp without time zone' },
    ]);
  });

  it('startedAt là đúng thời điểm: 18:00 VN = 11:00 UTC; 23:30 VN vẫn cùng ngày; 05:00 VN là 22:00 UTC hôm trước', async () => {
    await insertRun({ name: 'r18', startedAt: '2026-09-29 18:00:00' });
    await insertRun({ name: 'r2330', startedAt: '2026-09-29 23:30:00' });
    await insertRun({ name: 'r05', startedAt: '2026-09-29 05:00:00' });
    const runs = runsByName(await getData());
    expect(runs.r18.startedAt).toBe('2026-09-29T11:00:00.000Z');
    expect(runs.r2330.startedAt).toBe('2026-09-29T16:30:00.000Z');
    expect(runs.r05.startedAt).toBe('2026-09-28T22:00:00.000Z');
  });

  it('mốc 26/09 20:36 tính theo GIỜ VN của created_at naive: 20:35:59 → planned null; đúng 20:36:00 → planned = total', async () => {
    await insertRun({ name: 'truoc-moc', startedAt: '2026-09-26 20:35:59', totalRecipients: 500 });
    await insertRun({ name: 'dung-moc', startedAt: '2026-09-26 20:36:00', totalRecipients: 500 });
    const runs = runsByName(await getData());
    expect(runs['truoc-moc']).toMatchObject({ sent: 1, planned: null });
    expect(runs['dung-moc']).toMatchObject({ sent: 1, planned: 500 });
  });

  it('lượt lỗi trong kỳ so completed_at naive với NGÀY VN: 23:59:59 hôm qua thuộc 7d, 00:00:00 hôm nay thuộc hôm nay', async () => {
    const before = (await getData('?window=today')).runs.failed;
    const before7 = (await getData('?window=7d')).runs.failed;
    await insertRun({
      name: 'loi-hom-qua', status: 'failed',
      startedAt: "(CURRENT_DATE - 1)::timestamp + interval '23:00:00'",
      completedAt: "CURRENT_DATE::timestamp - interval '1 second'",
    });
    await insertRun({
      name: 'loi-hom-nay', status: 'failed',
      startedAt: "CURRENT_DATE::timestamp - interval '1 hour'",
      completedAt: 'CURRENT_DATE::timestamp',
    });
    expect((await getData('?window=today')).runs.failed).toBe(before + 1);
    expect((await getData('?window=7d')).runs.failed).toBe(before7 + 2);
  });

  it('lượt chờ: waitingUntil là chuỗi ISO UTC đúng mốc trong metadata (dựng ở SQL, không lệch múi giờ)', async () => {
    const until = new Date(Date.now() + 90 * 60_000).toISOString();
    await insertRun({
      name: 'cho-hạn-mức', status: 'running', startedAt: 'LOCALTIMESTAMP',
      metadata: { quotaDeferredUntil: until, quotaDeferredReason: 'plan_quota_daily' },
    });
    const runs = runsByName(await getData());
    expect(runs['cho-hạn-mức']).toMatchObject({ status: 'running', waitingUntil: until, waitingReason: 'plan_quota_daily' });
  });
});
