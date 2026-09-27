/**
 * PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27, PR-T2 — script backfill +7h.
 *
 * Gieo dữ liệu bằng SQL tường minh: chuỗi giờ VN dạng text ('YYYY-MM-DD HH:MI:SS') truyền làm tham
 * số rồi ép ::timestamp trong câu SQL — KHÔNG truyền JS Date. node-pg gửi tham số chuỗi nguyên văn,
 * không có logic timezone nào can thiệp, nên cột nhận đúng chữ số đã viết bất kể TZ tiến trình —
 * đúng trạng thái dữ liệu THẬT sau khi PR-T1 chạy trên production (viết bằng SQL/NOW(), không qua
 * JS Date), tránh lặp lại chính lỗi mà PR-T1/T2 đang sửa.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import db from '../../src/config/database.js';
import { truncateAll } from './helpers/db.js';
import { runBackfill } from '../../scripts/backfillEmailTimestampsToVn.js';

beforeEach(async () => {
  await truncateAll();
});

function tmpBackupPath(label) {
  return path.join(os.tmpdir(), `backfill-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.csv`);
}

async function insertEmailRow({ createdAt, sentAt = null, bouncedAt = null }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (recipient_email, status, created_at, sent_at, bounced_at)
     VALUES ('khach@example.com', 'sent', $1::timestamp, $2::timestamp, $3::timestamp)
     RETURNING id`,
    [createdAt, sentAt, bouncedAt]
  );
  return rows[0].id;
}

async function insertNotificationLogRow({ createdAt, sentAt = null }) {
  const { rows } = await db.query(
    `INSERT INTO notification_email_logs (email, created_at, sent_at)
     VALUES ('khach@example.com', $1::timestamp, $2::timestamp)
     RETURNING id`,
    [createdAt, sentAt]
  );
  return rows[0].id;
}

async function readEmailRow(id) {
  const { rows } = await db.query(
    `SELECT sent_at::text AS sent_at, bounced_at::text AS bounced_at FROM email_messages WHERE id = $1`,
    [id]
  );
  return rows[0];
}

async function readNotificationRow(id) {
  const { rows } = await db.query(
    `SELECT sent_at::text AS sent_at FROM notification_email_logs WHERE id = $1`,
    [id]
  );
  return rows[0];
}

function parseBackupCsv(backupFile) {
  const text = fs.readFileSync(backupFile, 'utf8');
  const lines = text.split('\n').filter((l) => l.length > 0);
  const [header, ...dataLines] = lines;
  expect(header).toBe('table,id,column,old_value');
  return dataLines.map((line) => {
    const [table, id, column, ...rest] = line.split(',');
    return { table, id: Number(id), column, old_value: rest.join(',') };
  });
}

/**
 * Khuôn dữ liệu dùng chung cho mọi ca — neo vào 2026-04-15 (đúng tháng dữ liệu thật bị lệch trên
 * production, mục 1 của plan) để không phụ thuộc đồng hồ hệ thống lúc chạy test.
 *   a1 email_7h            : created 10:00, sent 03:00       → khớp (a), sau apply sent = 10:00
 *   a2 email_correct       : created 10:00, sent 10:00       → không khớp, bucket "+-2'"
 *   a3 email_sent_null     : created 10:00, sent NULL        → không đụng, không rơi bucket nào
 *   a4 email_3h_no_signature: created 10:00, sent 07:00      → không khớp, bucket "2'..6h"
 *   b1 bounced_match       : created 10:00, sent 10:00, bounced 03:30 → khớp (b), sau apply bounced = 10:30
 *   b2 bounced_1h_correct  : created 10:00, sent 10:00, bounced 09:00 → không khớp, bucket "2'..6h"
 *   c1 notif_7h            : created 10:00, sent 03:00       → khớp (c), sau apply sent = 10:00
 *   c2 notif_correct       : created 10:00, sent 10:00       → không khớp, bucket "+-2'"
 */
async function seedFixture() {
  const CREATED = '2026-04-15 10:00:00';
  const ids = {};
  ids.a1 = await insertEmailRow({ createdAt: CREATED, sentAt: '2026-04-15 03:00:00' });
  ids.a2 = await insertEmailRow({ createdAt: CREATED, sentAt: '2026-04-15 10:00:00' });
  ids.a3 = await insertEmailRow({ createdAt: CREATED, sentAt: null });
  ids.a4 = await insertEmailRow({ createdAt: CREATED, sentAt: '2026-04-15 07:00:00' });
  ids.b1 = await insertEmailRow({ createdAt: CREATED, sentAt: '2026-04-15 10:00:00', bouncedAt: '2026-04-15 03:30:00' });
  ids.b2 = await insertEmailRow({ createdAt: CREATED, sentAt: '2026-04-15 10:00:00', bouncedAt: '2026-04-15 09:00:00' });
  ids.c1 = await insertNotificationLogRow({ createdAt: CREATED, sentAt: '2026-04-15 03:00:00' });
  ids.c2 = await insertNotificationLogRow({ createdAt: CREATED, sentAt: '2026-04-15 10:00:00' });
  return ids;
}

describe('backfillEmailTimestampsToVn — dry-run', () => {
  it('không đổi dữ liệu và trả đúng số khớp + đúng số theo khoảng KHÔNG khớp', async () => {
    const ids = await seedFixture();
    const before = {
      a1: await readEmailRow(ids.a1),
      b1: await readEmailRow(ids.b1),
      c1: await readNotificationRow(ids.c1),
    };

    const result = await runBackfill({ apply: false, log: () => {} });

    expect(result.mode).toBe('dry-run');
    expect(result.groups['email_messages.sent_at'].matched).toBe(1);
    expect(result.groups['email_messages.sent_at'].buckets["+-2'"]).toBe(3); // a2, b1, b2
    expect(result.groups['email_messages.sent_at'].buckets["2'..6h"]).toBe(1); // a4
    expect(result.groups['email_messages.bounced_at'].matched).toBe(1);
    expect(result.groups['email_messages.bounced_at'].buckets["2'..6h"]).toBe(1); // b2
    expect(result.groups['notification_email_logs.sent_at'].matched).toBe(1);
    expect(result.groups['notification_email_logs.sent_at'].buckets["+-2'"]).toBe(1); // c2
    expect(result.notificationExtra).toEqual({ delivered_at: 0, opened_at: 0, bounced_at: 0 });

    // Không đổi dữ liệu.
    expect(await readEmailRow(ids.a1)).toEqual(before.a1);
    expect(await readEmailRow(ids.b1)).toEqual(before.b1);
    expect(await readNotificationRow(ids.c1)).toEqual(before.c1);
  });
});

describe('backfillEmailTimestampsToVn — apply', () => {
  it('sửa đúng 3 dòng khớp, giữ nguyên các dòng còn lại, backup đúng giá trị cũ', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-ok');

    const result = await runBackfill({ apply: true, backupFile, log: () => {} });

    expect(result.mode).toBe('apply');
    expect(result.groups['email_messages.sent_at'].updated).toBe(1);
    expect(result.groups['email_messages.bounced_at'].updated).toBe(1);
    expect(result.groups['notification_email_logs.sent_at'].updated).toBe(1);

    expect((await readEmailRow(ids.a1)).sent_at).toBe('2026-04-15 10:00:00');
    expect((await readEmailRow(ids.a2)).sent_at).toBe('2026-04-15 10:00:00');
    expect((await readEmailRow(ids.a3)).sent_at).toBeNull();
    expect((await readEmailRow(ids.a4)).sent_at).toBe('2026-04-15 07:00:00');
    expect((await readEmailRow(ids.b1)).bounced_at).toBe('2026-04-15 10:30:00');
    expect((await readEmailRow(ids.b2)).bounced_at).toBe('2026-04-15 09:00:00');
    expect((await readNotificationRow(ids.c1)).sent_at).toBe('2026-04-15 10:00:00');
    expect((await readNotificationRow(ids.c2)).sent_at).toBe('2026-04-15 10:00:00');

    const backupRows = parseBackupCsv(backupFile);
    expect(backupRows).toHaveLength(3);
    // ids.a1/ids.b1 (email_messages.id, BIGSERIAL) về dạng CHUỖI từ node-pg (tránh mất độ chính xác
    // ngoài Number.MAX_SAFE_INTEGER); ids.c1 (notification_email_logs.id, SERIAL/int4) về dạng số.
    // parseBackupCsv ép Number() cho cả hai nên so sánh cũng ép Number() cho nhất quán.
    expect(backupRows).toEqual([
      { table: 'email_messages', id: Number(ids.a1), column: 'sent_at', old_value: '2026-04-15 03:00:00' },
      { table: 'email_messages', id: Number(ids.b1), column: 'bounced_at', old_value: '2026-04-15 03:30:00' },
      { table: 'notification_email_logs', id: Number(ids.c1), column: 'sent_at', old_value: '2026-04-15 03:00:00' },
    ]);

    fs.unlinkSync(backupFile);
  });

  it('idempotent: chạy lần 2 sửa 0 dòng, backup chỉ có header', async () => {
    const ids = await seedFixture();
    const backupFile1 = tmpBackupPath('apply-run1');
    await runBackfill({ apply: true, backupFile: backupFile1, log: () => {} });

    const backupFile2 = tmpBackupPath('apply-run2');
    const result2 = await runBackfill({ apply: true, backupFile: backupFile2, log: () => {} });

    expect(result2.groups['email_messages.sent_at'].updated).toBe(0);
    expect(result2.groups['email_messages.bounced_at'].updated).toBe(0);
    expect(result2.groups['notification_email_logs.sent_at'].updated).toBe(0);
    expect(parseBackupCsv(backupFile2)).toHaveLength(0);

    // Giá trị vẫn đúng sau lần 2 (không bị cộng thêm 7h một lần nữa).
    expect((await readEmailRow(ids.a1)).sent_at).toBe('2026-04-15 10:00:00');
    expect((await readEmailRow(ids.b1)).bounced_at).toBe('2026-04-15 10:30:00');
    expect((await readNotificationRow(ids.c1)).sent_at).toBe('2026-04-15 10:00:00');

    fs.unlinkSync(backupFile1);
    fs.unlinkSync(backupFile2);
  });

  it('batchSize=2 cho kết quả giống hệt batchSize mặc định (5000)', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-batch2');

    const result = await runBackfill({ apply: true, batchSize: 2, backupFile, log: () => {} });

    expect(result.groups['email_messages.sent_at'].updated).toBe(1);
    expect(result.groups['email_messages.bounced_at'].updated).toBe(1);
    expect(result.groups['notification_email_logs.sent_at'].updated).toBe(1);
    expect((await readEmailRow(ids.a1)).sent_at).toBe('2026-04-15 10:00:00');
    expect((await readEmailRow(ids.a2)).sent_at).toBe('2026-04-15 10:00:00');
    expect((await readEmailRow(ids.a4)).sent_at).toBe('2026-04-15 07:00:00');
    expect((await readEmailRow(ids.b1)).bounced_at).toBe('2026-04-15 10:30:00');
    expect((await readEmailRow(ids.b2)).bounced_at).toBe('2026-04-15 09:00:00');
    expect((await readNotificationRow(ids.c1)).sent_at).toBe('2026-04-15 10:00:00');
    expect(parseBackupCsv(backupFile)).toHaveLength(3);

    fs.unlinkSync(backupFile);
  });

  it('thiếu --backup-file → throw trước khi đụng DB, dữ liệu không đổi', async () => {
    const ids = await seedFixture();
    const before = await readEmailRow(ids.a1);

    await expect(runBackfill({ apply: true, log: () => {} })).rejects.toThrow(/--backup-file/);

    expect(await readEmailRow(ids.a1)).toEqual(before);
  });

  it('--batch-size không hợp lệ (0, NaN) hoặc --backup-file nuốt nhầm cờ → throw, dữ liệu không đổi', async () => {
    const ids = await seedFixture();
    const before = await readEmailRow(ids.a1);

    await expect(runBackfill({ apply: false, batchSize: 0, log: () => {} })).rejects.toThrow(/--batch-size/);
    await expect(runBackfill({ apply: true, batchSize: Number.NaN, backupFile: tmpBackupPath('nan'), log: () => {} }))
      .rejects.toThrow(/--batch-size/);
    await expect(runBackfill({ apply: true, backupFile: '--apply', log: () => {} })).rejects.toThrow(/--backup-file/);

    expect(await readEmailRow(ids.a1)).toEqual(before);
  });

  it('backupFile đã tồn tại → từ chối, không ghi đè, dữ liệu không đổi', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-existing');
    fs.writeFileSync(backupFile, 'da co san\n');
    const before = await readEmailRow(ids.a1);

    await expect(runBackfill({ apply: true, backupFile, log: () => {} })).rejects.toThrow(/đã tồn tại/);

    expect(fs.readFileSync(backupFile, 'utf8')).toBe('da co san\n');
    expect(await readEmailRow(ids.a1)).toEqual(before);

    fs.unlinkSync(backupFile);
  });
});

// Đột biến "bỏ AND (matchWhere) ở UPDATE, chỉ còn WHERE id = ANY($1)" KHÔNG có ca nào bắt được — cố ý
// không viết ca giả vờ bắt (review 27/09 bỏ ca expect(true) cũ, giữ lời giải thích):
// Cấu trúc thật của applyGroup(): trong CÙNG một transaction, SELECT ... FOR UPDATE trả về `ids`
// đúng lúc đó đang khớp matchWhere, rồi UPDATE chạy NGAY SAU đó (không có câu lệnh nào khác xen
// giữa, không có await nhường CPU cho việc khác kịp sửa các dòng này — FOR UPDATE còn giữ khoá
// dòng, chặn mọi phiên khác ghi đè). Vì vậy tại thời điểm UPDATE chạy, tập `ids` LUÔN chắc chắn
// vẫn khớp matchWhere như lúc SELECT — không tồn tại khoảng hở thời gian để giá trị đổi giữa hai
// câu lệnh. Bỏ `AND (matchWhere)` ở UPDATE (chỉ còn `WHERE id = ANY($1)`) vì vậy KHÔNG tạo ra
// khác biệt quan sát được ở bất kỳ test nào, kể cả chạy 2 lần: lần 2 SELECT lại tự trả `ids` rỗng
// (dòng đã sửa không còn khớp matchWhere), UPDATE (có hay không lặp điều kiện) đều không đụng gì.
// Điều kiện lặp lại này là lưới an toàn cho một lần sửa code SAU NÀY (vd tách SELECT và UPDATE ra
// hai bước riêng, hoặc thêm một await giữa hai câu lệnh) — không phải vá lỗi đang quan sát được
// trong kiến trúc hiện tại, nên không viết ca test giả vờ bắt được nó.
