/**
 * PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27, PR-T3 Việc 5 — script backfill +7h cho các cột ăn theo.
 *
 * Gieo dữ liệu bằng SQL tường minh: chuỗi giờ VN dạng text ('YYYY-MM-DD HH:MI:SS') truyền làm tham
 * số rồi ép ::timestamp/::timestamptz trong câu SQL — KHÔNG truyền JS Date (cùng nguyên tắc T2),
 * đúng trạng thái dữ liệu THẬT sau khi PR-T1/T2 chạy trên production trước Việc 1 (PR-T3) deploy.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { runBackfill } from '../../scripts/backfillEmailDerivedTimestampsToVn.js';

beforeEach(async () => {
  await truncateAll();
});

function tmpBackupPath(label) {
  return path.join(os.tmpdir(), `backfill-t3-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.csv`);
}

// Tách CSV có tôn trọng field bọc dấu ngoặc kép ("...") + escape "" bên trong — bản backup của
// nhóm (d) ghi nguyên dòng JSON.stringify() làm old_value, chứa dấu phẩy/ngoặc kép thật.
// split(',') thô sẽ vỡ field đó — đây là parser tối thiểu đúng luật CSV (RFC 4180) cho 4 cột cố định.
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseBackupCsv(backupFile) {
  const text = fs.readFileSync(backupFile, 'utf8');
  const lines = text.split('\n').filter((l) => l.length > 0);
  const [header, ...dataLines] = lines;
  expect(header).toBe('table,id,column,old_value');
  return dataLines.map((line) => {
    const [table, id, column, old_value] = parseCsvLine(line);
    return { table, id, column, old_value };
  });
}

async function createCustomer({ userId, email }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email, last_email_sent_at)
     VALUES ($1, $2, NULL) RETURNING id`,
    [userId, email]
  );
  return rows[0].id;
}

async function setCustomerLastEmailSentAt(customerId, value) {
  await db.query(`UPDATE customers SET last_email_sent_at = $1::timestamp WHERE id = $2`, [value, customerId]);
}

async function createCampaign({ userId, name }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'active') RETURNING id`,
    [userId, name]
  );
  return rows[0].id;
}

async function insertEmailMessage({ customerId, campaignId = null, createdAt, isPreview = false, status = 'sent' }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (id_customer, id_campaign, status, is_preview, created_at)
     VALUES ($1, $2, $3, $4, $5::timestamp) RETURNING id`,
    [customerId, campaignId, status, isPreview, createdAt]
  );
  return rows[0].id;
}

async function insertCampaignCustomer({ campaignId, customerId, firstEmailSentAt, lastEmailSentAt, lastActivityAt }) {
  await db.query(
    `INSERT INTO campaign_customers (id_campaign, id_customer, joined_at, first_email_sent_at, last_email_sent_at, last_activity_at)
     VALUES ($1, $2, NOW(), $3::timestamp, $4::timestamp, $5::timestamp)`,
    [campaignId, customerId, firstEmailSentAt, lastEmailSentAt, lastActivityAt]
  );
}

async function insertJourneyEvent({ customerId, campaignId = null, runId = null, eventType, createdAt, eventAt, idEmailMessage = null }) {
  const { rows } = await db.query(
    `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at, created_at)
     VALUES ($1, $2, $3, $4, 'email', $5, '{}'::jsonb, $6::timestamp, $7::timestamptz) RETURNING id`,
    [customerId, campaignId, runId, eventType, idEmailMessage, eventAt, createdAt]
  );
  return rows[0].id;
}

async function readCustomer(id) {
  const { rows } = await db.query(`SELECT last_email_sent_at::text AS last_email_sent_at FROM customers WHERE id = $1`, [id]);
  return rows[0];
}

async function readJourney(id) {
  const { rows } = await db.query(`SELECT event_at::text AS event_at FROM customer_journey WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function readCampaignCustomer(campaignId, customerId) {
  const { rows } = await db.query(
    `SELECT first_email_sent_at::text AS first_email_sent_at,
            last_email_sent_at::text AS last_email_sent_at,
            last_activity_at::text AS last_activity_at
     FROM campaign_customers WHERE id_campaign = $1 AND id_customer = $2`,
    [campaignId, customerId]
  );
  return rows[0];
}

/**
 * Khuôn dữ liệu — neo vào 2026-04-15 (không phụ thuộc đồng hồ hệ thống lúc chạy test):
 *   (a) j1 email_sent  created 10:00 event_at 03:00 → khớp, sau apply event_at = 10:00
 *       j2 email_sent  created 10:00 event_at 10:00 → không khớp, bucket "+-2'"
 *       j3 email_opened created 10:00 event_at 03:00 → KHÔNG phải email_sent, không đụng
 *   (b) customer cb1: last_email_sent_at 03:00; email_messages non-preview MAX created_at 10:00 → khớp
 *       customer cb2: last_email_sent_at 10:00; email_messages created_at 10:00 → không khớp "+-2'"
 *       customer cb3: last_email_sent_at 03:00; KHÔNG có email_messages nào → loại (EXISTS fail)
 *       customer cb4: last_email_sent_at 03:00; chỉ có email_messages PREVIEW created_at 10:00 → loại
 *   (c) campaign A + customer cc1: email_messages (A,cc1) tại 09:55 và 10:05 (non-preview)
 *       → first_ref=09:55, last_ref=10:05; first_email_sent_at=02:55 (khớp), last_email_sent_at=03:05 (khớp)
 *       last_activity_at = 03:05 (= last_email_sent_at CŨ) → CŨNG +7h → 10:05
 *       campaign B + customer cc2: email_messages (B,cc2) tại 10:00 (non-preview) → ref=10:00
 *       first_email_sent_at=10:00 (không khớp), last_email_sent_at=03:00 (khớp)
 *       last_activity_at = 09:00 (KHÁC last_email_sent_at CŨ 03:00 — nghĩa là mở SAU gửi, ghi VN đúng)
 *       → last_activity_at KHÔNG được đụng, giữ nguyên 09:00
 *   (d) j5 email_sent id_email_message → status failed → xoá khi bật cờ
 *       j6 email_sent id_email_message → status sent → không xoá
 */
async function seedFixture() {
  const owner = await createUser({ username: 'ownert3', role: 'user' });
  const ids = {};

  ids.j1 = await insertJourneyEvent({ customerId: null, eventType: 'email_sent', createdAt: '2026-04-15 10:00:00+07', eventAt: '2026-04-15 03:00:00' });
  ids.j2 = await insertJourneyEvent({ customerId: null, eventType: 'email_sent', createdAt: '2026-04-15 10:00:00+07', eventAt: '2026-04-15 10:00:00' });
  ids.j3 = await insertJourneyEvent({ customerId: null, eventType: 'email_opened', createdAt: '2026-04-15 10:00:00+07', eventAt: '2026-04-15 03:00:00' });

  ids.cb1 = await createCustomer({ userId: owner.id, email: 'cb1@test.local' });
  await setCustomerLastEmailSentAt(ids.cb1, '2026-04-15 03:00:00');
  await insertEmailMessage({ customerId: ids.cb1, createdAt: '2026-04-15 10:00:00' });

  ids.cb2 = await createCustomer({ userId: owner.id, email: 'cb2@test.local' });
  await setCustomerLastEmailSentAt(ids.cb2, '2026-04-15 10:00:00');
  await insertEmailMessage({ customerId: ids.cb2, createdAt: '2026-04-15 10:00:00' });

  ids.cb3 = await createCustomer({ userId: owner.id, email: 'cb3@test.local' });
  await setCustomerLastEmailSentAt(ids.cb3, '2026-04-15 03:00:00');

  ids.cb4 = await createCustomer({ userId: owner.id, email: 'cb4@test.local' });
  await setCustomerLastEmailSentAt(ids.cb4, '2026-04-15 03:00:00');
  await insertEmailMessage({ customerId: ids.cb4, createdAt: '2026-04-15 10:00:00', isPreview: true });

  ids.campaignA = await createCampaign({ userId: owner.id, name: 'A' });
  ids.cc1 = await createCustomer({ userId: owner.id, email: 'cc1@test.local' });
  await insertEmailMessage({ customerId: ids.cc1, campaignId: ids.campaignA, createdAt: '2026-04-15 09:55:00' });
  await insertEmailMessage({ customerId: ids.cc1, campaignId: ids.campaignA, createdAt: '2026-04-15 10:05:00' });
  await insertCampaignCustomer({
    campaignId: ids.campaignA, customerId: ids.cc1,
    firstEmailSentAt: '2026-04-15 02:55:00', lastEmailSentAt: '2026-04-15 03:05:00', lastActivityAt: '2026-04-15 03:05:00',
  });

  ids.campaignB = await createCampaign({ userId: owner.id, name: 'B' });
  ids.cc2 = await createCustomer({ userId: owner.id, email: 'cc2@test.local' });
  await insertEmailMessage({ customerId: ids.cc2, campaignId: ids.campaignB, createdAt: '2026-04-15 10:00:00' });
  await insertCampaignCustomer({
    campaignId: ids.campaignB, customerId: ids.cc2,
    firstEmailSentAt: '2026-04-15 10:00:00', lastEmailSentAt: '2026-04-15 03:00:00', lastActivityAt: '2026-04-15 09:00:00',
  });

  // Khách RIÊNG cho nhóm (d) — KHÔNG dùng chung (campaignA, cc1), nếu không email_messages thêm ở
  // đây sẽ đổi MAX(created_at) tham chiếu của nhóm (c) cho đúng cặp đó (đã tự bắt qua test đỏ).
  ids.cd1 = await createCustomer({ userId: owner.id, email: 'cd1@test.local' });
  const failedMsgId = await insertEmailMessage({ customerId: ids.cd1, createdAt: '2026-04-15 11:00:00', status: 'failed' });
  const sentMsgId = await insertEmailMessage({ customerId: ids.cd1, createdAt: '2026-04-15 11:00:00', status: 'sent' });
  ids.j5 = await insertJourneyEvent({
    customerId: ids.cd1, eventType: 'email_sent',
    createdAt: '2026-04-15 11:00:00+07', eventAt: '2026-04-15 11:00:00', idEmailMessage: failedMsgId,
  });
  ids.j6 = await insertJourneyEvent({
    customerId: ids.cd1, eventType: 'email_sent',
    createdAt: '2026-04-15 11:00:00+07', eventAt: '2026-04-15 11:00:00', idEmailMessage: sentMsgId,
  });

  return ids;
}

describe('backfillEmailDerivedTimestampsToVn — dry-run', () => {
  it('đếm đúng số khớp mỗi nhóm + đúng bucket, KHÔNG đổi dữ liệu', async () => {
    const ids = await seedFixture();
    const before = { j1: await readJourney(ids.j1), cb1: await readCustomer(ids.cb1) };

    const result = await runBackfill({ apply: false, log: () => {} });

    expect(result.mode).toBe('dry-run');
    expect(result.groups['customer_journey.event_at'].matched).toBe(1); // j1
    expect(result.groups['customer_journey.event_at'].buckets["+-2'"]).toBe(3); // j2 + j5 + j6 (đúng giờ, không dấu 7h)
    expect(result.groups['customers.last_email_sent_at'].matched).toBe(1); // cb1
    expect(result.groups['customers.last_email_sent_at'].buckets["+-2'"]).toBe(1); // cb2
    expect(result.groups['campaign_customers.first_last_email_sent_at'].matched).toBe(2); // cc1(A) + cc2(B)
    expect(result.groups['campaign_customers.first_last_email_sent_at'].firstMatched).toBe(1); // chỉ cc1
    expect(result.groups['campaign_customers.first_last_email_sent_at'].lastMatched).toBe(2); // cc1 + cc2
    expect(result.deletedFailedJourney.candidateCount).toBe(1); // j5

    expect(await readJourney(ids.j1)).toEqual(before.j1);
    expect(await readCustomer(ids.cb1)).toEqual(before.cb1);
  });
});

describe('backfillEmailDerivedTimestampsToVn — apply (không xoá journey)', () => {
  it('sửa đúng các dòng khớp, giữ nguyên các dòng còn lại, KHÔNG xoá journey khi thiếu cờ', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-ok');

    const result = await runBackfill({ apply: true, backupFile, log: () => {} });

    expect(result.groups['customer_journey.event_at'].updated).toBe(1);
    expect(result.groups['customers.last_email_sent_at'].updated).toBe(1);
    expect(result.groups['campaign_customers.first_last_email_sent_at'].updated).toBe(2);
    expect(result.deletedFailedJourney).toBeNull(); // apply nhưng không bật --delete-failed-journey

    expect((await readJourney(ids.j1)).event_at).toBe('2026-04-15 10:00:00');
    expect((await readJourney(ids.j2)).event_at).toBe('2026-04-15 10:00:00');
    expect((await readJourney(ids.j3)).event_at).toBe('2026-04-15 03:00:00'); // email_opened, không đụng

    expect((await readCustomer(ids.cb1)).last_email_sent_at).toBe('2026-04-15 10:00:00');
    expect((await readCustomer(ids.cb2)).last_email_sent_at).toBe('2026-04-15 10:00:00');
    expect((await readCustomer(ids.cb3)).last_email_sent_at).toBe('2026-04-15 03:00:00'); // không email_messages, giữ nguyên
    expect((await readCustomer(ids.cb4)).last_email_sent_at).toBe('2026-04-15 03:00:00'); // chỉ preview, giữ nguyên

    const ccA = await readCampaignCustomer(ids.campaignA, ids.cc1);
    expect(ccA.first_email_sent_at).toBe('2026-04-15 09:55:00');
    expect(ccA.last_email_sent_at).toBe('2026-04-15 10:05:00');
    expect(ccA.last_activity_at).toBe('2026-04-15 10:05:00'); // = last_email_sent_at CŨ → cũng +7h

    const ccB = await readCampaignCustomer(ids.campaignB, ids.cc2);
    expect(ccB.first_email_sent_at).toBe('2026-04-15 10:00:00'); // không khớp, giữ nguyên
    expect(ccB.last_email_sent_at).toBe('2026-04-15 10:00:00');
    expect(ccB.last_activity_at).toBe('2026-04-15 09:00:00'); // KHÁC last_email_sent_at CŨ → mở sau gửi, KHÔNG đụng

    // customer_journey (d) vẫn còn nguyên vì thiếu --delete-failed-journey.
    expect(await readJourney(ids.j5)).not.toBeNull();
    expect(await readJourney(ids.j6)).not.toBeNull();

    fs.unlinkSync(backupFile);
  });

  it('idempotent: chạy lần 2 sửa 0 dòng', async () => {
    await seedFixture();
    const backupFile1 = tmpBackupPath('apply-run1');
    await runBackfill({ apply: true, backupFile: backupFile1, log: () => {} });

    const backupFile2 = tmpBackupPath('apply-run2');
    const result2 = await runBackfill({ apply: true, backupFile: backupFile2, log: () => {} });

    expect(result2.groups['customer_journey.event_at'].updated).toBe(0);
    expect(result2.groups['customers.last_email_sent_at'].updated).toBe(0);
    expect(result2.groups['campaign_customers.first_last_email_sent_at'].updated).toBe(0);

    fs.unlinkSync(backupFile1);
    fs.unlinkSync(backupFile2);
  });

  it('backup CSV có đủ dòng cũ cho cả 3 nhóm (kể cả last_activity_at của cc1)', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-backup');

    await runBackfill({ apply: true, backupFile, log: () => {} });

    const rows = parseBackupCsv(backupFile);
    expect(rows).toContainEqual({ table: 'customer_journey', id: String(ids.j1), column: 'event_at', old_value: '2026-04-15 03:00:00' });
    expect(rows).toContainEqual({ table: 'customers', id: String(ids.cb1), column: 'last_email_sent_at', old_value: '2026-04-15 03:00:00' });
    expect(rows).toContainEqual({
      table: 'campaign_customers', id: `${ids.campaignA}:${ids.cc1}`, column: 'first_email_sent_at', old_value: '2026-04-15 02:55:00',
    });
    expect(rows).toContainEqual({
      table: 'campaign_customers', id: `${ids.campaignA}:${ids.cc1}`, column: 'last_email_sent_at', old_value: '2026-04-15 03:05:00',
    });
    expect(rows).toContainEqual({
      table: 'campaign_customers', id: `${ids.campaignA}:${ids.cc1}`, column: 'last_activity_at', old_value: '2026-04-15 03:05:00',
    });
    // cc2 (campaignB) không được backup last_activity_at vì không đụng tới.
    expect(rows.find((r) => r.id === `${ids.campaignB}:${ids.cc2}` && r.column === 'last_activity_at')).toBeUndefined();

    fs.unlinkSync(backupFile);
  });

  it('batchSize=1 cho kết quả giống hệt batchSize mặc định', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-batch1');

    const result = await runBackfill({ apply: true, batchSize: 1, backupFile, log: () => {} });

    expect(result.groups['customer_journey.event_at'].updated).toBe(1);
    expect(result.groups['customers.last_email_sent_at'].updated).toBe(1);
    expect(result.groups['campaign_customers.first_last_email_sent_at'].updated).toBe(2);
    expect((await readJourney(ids.j1)).event_at).toBe('2026-04-15 10:00:00');
    const ccA = await readCampaignCustomer(ids.campaignA, ids.cc1);
    expect(ccA.last_activity_at).toBe('2026-04-15 10:05:00');

    fs.unlinkSync(backupFile);
  });
});

describe('backfillEmailDerivedTimestampsToVn — --delete-failed-journey', () => {
  it('CHỈ xoá khi bật cờ; backup JSON nguyên dòng trước khi xoá; không đụng dòng sent', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-delete');

    const result = await runBackfill({ apply: true, backupFile, deleteFailedJourney: true, log: () => {} });

    expect(result.deletedFailedJourney.deletedCount).toBe(1);
    expect(await readJourney(ids.j5)).toBeNull();
    expect(await readJourney(ids.j6)).not.toBeNull();

    const rows = parseBackupCsv(backupFile);
    const deletedRow = rows.find((r) => r.table === 'customer_journey' && r.id === String(ids.j5) && r.column === '__deleted_row__');
    expect(deletedRow).toBeDefined();
    const parsed = JSON.parse(deletedRow.old_value);
    expect(parsed.id).toBe(ids.j5);
    expect(parsed.event_type).toBe('email_sent');

    fs.unlinkSync(backupFile);
  });

  it('dry-run LUÔN báo số dòng (d) kể cả không truyền cờ (chỉ đọc, không xoá)', async () => {
    const ids = await seedFixture();
    const result = await runBackfill({ apply: false, log: () => {} });
    expect(result.deletedFailedJourney.candidateCount).toBe(1);
    expect(await readJourney(ids.j5)).not.toBeNull();
  });
});

describe('backfillEmailDerivedTimestampsToVn — validation', () => {
  it('thiếu --backup-file khi apply → throw trước khi đụng DB', async () => {
    const ids = await seedFixture();
    const before = await readCustomer(ids.cb1);

    await expect(runBackfill({ apply: true, log: () => {} })).rejects.toThrow(/--backup-file/);

    expect(await readCustomer(ids.cb1)).toEqual(before);
  });

  it('--batch-size không hợp lệ → throw, dữ liệu không đổi', async () => {
    const ids = await seedFixture();
    const before = await readCustomer(ids.cb1);

    await expect(runBackfill({ apply: false, batchSize: 0, log: () => {} })).rejects.toThrow(/--batch-size/);
    await expect(runBackfill({ apply: true, batchSize: Number.NaN, backupFile: tmpBackupPath('nan'), log: () => {} }))
      .rejects.toThrow(/--batch-size/);

    expect(await readCustomer(ids.cb1)).toEqual(before);
  });

  it('backupFile đã tồn tại → từ chối, không ghi đè', async () => {
    const ids = await seedFixture();
    const backupFile = tmpBackupPath('apply-existing');
    fs.writeFileSync(backupFile, 'da co san\n');
    const before = await readCustomer(ids.cb1);

    await expect(runBackfill({ apply: true, backupFile, log: () => {} })).rejects.toThrow(/đã tồn tại/);

    expect(fs.readFileSync(backupFile, 'utf8')).toBe('da co san\n');
    expect(await readCustomer(ids.cb1)).toEqual(before);
  });
});
