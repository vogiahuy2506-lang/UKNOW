/**
 * PR-3 — cột zalo_messages.status nói dối (61.649 dòng production từng 'pending' vĩnh viễn,
 * trạng thái thật nằm trong tracking_metadata->>'status').
 *
 * Ba việc kiểm bằng DB thật:
 * 1. markAbandonedIfStillQueued() chỉ đụng dòng còn 'queued', không đụng sent/failed/aborted.
 * 2. Câu backfill dữ liệu cũ trong plan (UPDATE ... SET status = tracking_metadata->>'status')
 *    đưa cột status khớp đúng JSONB.
 * 3. mergeZaloMessageTrackingMetadata ghi cả hai (cột + JSONB) qua DB thật, không chỉ mock.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll } from './helpers/db.js';
import zaloMessageRepository from '../../src/repositories/campaign/zaloMessage.repository.js';

beforeEach(async () => {
  await truncateAll();
});

async function insertZaloMessage({ status = 'pending', metaStatus = null, channel = 'zalo_personal' }) {
  const trackingMetadata = metaStatus ? { status: metaStatus } : {};
  const { rows } = await db.query(
    `INSERT INTO zalo_messages (channel, status, tracking_metadata)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [channel, status, JSON.stringify(trackingMetadata)]
  );
  return rows[0].id;
}

async function readRow(id) {
  const { rows } = await db.query(
    `SELECT status, tracking_metadata FROM zalo_messages WHERE id = $1`,
    [id]
  );
  return rows[0];
}

describe('PR-3 — zalo_messages.status (markAbandonedIfStillQueued)', () => {
  it('dòng còn queued → đóng sổ thành aborted (cả cột lẫn JSONB)', async () => {
    const id = await insertZaloMessage({ status: 'pending', metaStatus: 'queued' });

    await zaloMessageRepository.markAbandonedIfStillQueued(id);

    const row = await readRow(id);
    expect(row.status).toBe('aborted');
    expect(row.tracking_metadata.status).toBe('aborted');
  });

  it('dòng đã sent → KHÔNG bị đụng vào', async () => {
    const id = await insertZaloMessage({ status: 'pending', metaStatus: 'sent' });

    await zaloMessageRepository.markAbandonedIfStillQueued(id);

    const row = await readRow(id);
    expect(row.status).toBe('pending'); // cột status của test này cố ý KHÔNG backfill trước —
    // điểm cần chứng minh là markAbandonedIfStillQueued không viết đè lên, không phải giá trị cột.
    expect(row.tracking_metadata.status).toBe('sent');
  });

  it('dòng đã failed → KHÔNG bị đụng vào', async () => {
    const id = await insertZaloMessage({ status: 'pending', metaStatus: 'failed' });

    await zaloMessageRepository.markAbandonedIfStillQueued(id);

    const row = await readRow(id);
    expect(row.tracking_metadata.status).toBe('failed');
  });

  it('dòng đã aborted (đóng sổ trước đó) → KHÔNG bị đụng lại lần hai', async () => {
    const id = await insertZaloMessage({ status: 'pending', metaStatus: 'aborted' });

    await zaloMessageRepository.markAbandonedIfStillQueued(id);

    const row = await readRow(id);
    expect(row.tracking_metadata.status).toBe('aborted');
  });

  it('gọi hai lần liên tiếp trên cùng dòng queued → kết quả giống hệt lần đầu (idempotent)', async () => {
    const id = await insertZaloMessage({ status: 'pending', metaStatus: 'queued' });

    await zaloMessageRepository.markAbandonedIfStillQueued(id);
    const afterFirst = await readRow(id);
    await zaloMessageRepository.markAbandonedIfStillQueued(id);
    const afterSecond = await readRow(id);

    expect(afterSecond.status).toBe('aborted');
    expect(afterSecond.tracking_metadata.status).toBe('aborted');
    expect(afterSecond).toEqual(afterFirst);
  });
});

describe('PR-3 — mergeZaloMessageTrackingMetadata ghi cả cột status lẫn JSONB (DB thật)', () => {
  it('metadata không có status (vd chỉ linkTargets) → cột status giữ nguyên', async () => {
    const id = await insertZaloMessage({ status: 'queued', metaStatus: 'queued' });

    await zaloMessageRepository.mergeZaloMessageTrackingMetadata(id, { linkTargets: ['x'] });

    const row = await readRow(id);
    expect(row.status).toBe('queued'); // không bị NULL hoá bởi lần merge không kèm status
    expect(row.tracking_metadata.linkTargets).toEqual(['x']);
    expect(row.tracking_metadata.status).toBe('queued'); // JSONB cũ vẫn còn (COALESCE || merge)
  });

  it('metadata có status: sent → cả cột lẫn JSONB đổi thành sent', async () => {
    const id = await insertZaloMessage({ status: 'pending', metaStatus: 'queued' });

    await zaloMessageRepository.mergeZaloMessageTrackingMetadata(id, { status: 'sent', uid: 'u1' });

    const row = await readRow(id);
    expect(row.status).toBe('sent');
    expect(row.tracking_metadata.status).toBe('sent');
    expect(row.tracking_metadata.uid).toBe('u1');
  });
});

describe('PR-3 — backfill dữ liệu cũ (dòng mồ côi production)', () => {
  it('UPDATE backfill đưa cột status khớp đúng tracking_metadata->>status (sent/failed/queued)', async () => {
    const sentId = await insertZaloMessage({ status: 'pending', metaStatus: 'sent' });
    const failedId = await insertZaloMessage({ status: 'pending', metaStatus: 'failed' });
    const queuedId = await insertZaloMessage({ status: 'pending', metaStatus: 'queued' });
    const noMetaId = await insertZaloMessage({ status: 'pending', metaStatus: null });

    await db.query(
      `UPDATE zalo_messages
          SET status = tracking_metadata->>'status'
        WHERE tracking_metadata->>'status' IN ('sent','failed','queued')
          AND status IS DISTINCT FROM tracking_metadata->>'status'`
    );

    expect((await readRow(sentId)).status).toBe('sent');
    expect((await readRow(failedId)).status).toBe('failed');
    expect((await readRow(queuedId)).status).toBe('queued');
    // Không có tracking_metadata->>'status' → không nằm trong danh sách backfill, giữ nguyên
    // giá trị cột cũ (đây chính là hành vi AN TOÀN: không đoán mò trạng thái cho dòng thiếu dữ liệu).
    expect((await readRow(noMetaId)).status).toBe('pending');
  });
});
