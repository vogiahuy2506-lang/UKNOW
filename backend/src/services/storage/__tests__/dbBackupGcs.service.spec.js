import { describe, expect, it, jest } from '@jest/globals';
import { PassThrough, Readable, Writable } from 'node:stream';
import {
  planRetentionDeletes,
  evaluateBackupFreshness,
  uploadDbBackup,
  runDbBackupUploadCli,
} from '../dbBackupGcs.service.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-29T00:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const f = (name, msAgo) => ({ name: `db-backups/${name}`, metadata: { timeCreated: iso(msAgo) } });

/** Bucket giả: ghi vào bộ nhớ, `sizeOverride` để mô phỏng size lệch. */
function makeBucket({ existing = [], sizeOverride = null } = {}) {
  const objects = new Map(existing.map((e) => [e.name, e]));
  const deleted = [];
  const written = {};
  const bucket = {
    deleted,
    written,
    objects,
    file(name) {
      return {
        name,
        createWriteStream(opts) {
          written[name] = { opts, bytes: 0 };
          return new Writable({
            write(chunk, _e, cb) {
              written[name].bytes += chunk.length;
              cb();
            },
            final(cb) {
              objects.set(name, { name, metadata: { timeCreated: iso(0) } });
              cb();
            },
          });
        },
        async getMetadata() {
          return [{ size: String(sizeOverride ?? written[name].bytes) }];
        },
        async delete() {
          deleted.push(name);
          objects.delete(name);
        },
      };
    },
    async getFiles({ prefix }) {
      return [[...objects.values()].filter((o) => o.name.startsWith(prefix))];
    },
  };
  return bucket;
}

describe('dbBackupGcs — dọn bản quá hạn', () => {
  it('35 bản, keep 30 ngày: xoá đúng bản quá hạn, không xoá bản vừa tải', () => {
    const files = [];
    for (let i = 0; i < 30; i += 1) files.push(f(`new${i}.dump`, i * DAY + 1000)); // 0..29 ngày
    for (let i = 0; i < 5; i += 1) files.push(f(`old${i}.dump`, (31 + i) * DAY));
    files.push({ name: 'db-backups/vua-tai.dump', metadata: { timeCreated: iso(0) } });
    const del = planRetentionDeletes(files, { keepDays: 30, now: NOW, justUploaded: 'db-backups/vua-tai.dump' });
    expect(del.sort()).toEqual([0, 1, 2, 3, 4].map((i) => `db-backups/old${i}.dump`).sort());
  });

  it('không bao giờ xoá bản vừa tải dù nó bị coi là cũ (đồng hồ lệch)', () => {
    const files = [f('a.dump', 40 * DAY), f('b.dump', 41 * DAY), f('c.dump', 42 * DAY), f('d.dump', 43 * DAY)];
    const del = planRetentionDeletes(files, { keepDays: 30, now: NOW, justUploaded: 'db-backups/a.dump' });
    expect(del).not.toContain('db-backups/a.dump');
  });

  it('còn 2 bản (một bản cũ) → không xoá gì', () => {
    const files = [f('old.dump', 90 * DAY), f('new.dump', 0)];
    expect(planRetentionDeletes(files, { keepDays: 30, now: NOW, justUploaded: 'db-backups/new.dump' })).toEqual([]);
  });

  it('luôn để lại ít nhất 3 bản', () => {
    const files = [f('o1.dump', 90 * DAY), f('o2.dump', 80 * DAY), f('o3.dump', 70 * DAY), f('n.dump', 0)];
    const del = planRetentionDeletes(files, { keepDays: 30, now: NOW, justUploaded: 'db-backups/n.dump' });
    expect(del).toEqual(['db-backups/o1.dump']);
  });
});

describe('dbBackupGcs — uploadDbBackup', () => {
  it('STDIN 1234 byte → object db-backups/x.dump, size khớp, không xoá gì', async () => {
    const bucket = makeBucket();
    const res = await uploadDbBackup({ bucket, fileName: 'x.dump', input: Readable.from([Buffer.alloc(1234, 1)]), now: NOW });
    expect(res).toMatchObject({ name: 'x.dump', bytes: 1234, deleted: 0 });
    expect(bucket.written['db-backups/x.dump'].opts).toMatchObject({ resumable: true, contentType: 'application/octet-stream' });
    expect(bucket.deleted).toEqual([]);
  });

  it('size object lệch số byte nhận → xoá object và ném lỗi', async () => {
    const bucket = makeBucket({ sizeOverride: 999 });
    await expect(
      uploadDbBackup({ bucket, fileName: 'x.dump', input: Readable.from([Buffer.alloc(1234, 1)]), now: NOW }),
    ).rejects.toThrow(/lech/);
    expect(bucket.deleted).toEqual(['db-backups/x.dump']);
  });

  it('STDIN rỗng → coi là lỗi, xoá object', async () => {
    const bucket = makeBucket();
    const input = new PassThrough();
    input.end();
    await expect(uploadDbBackup({ bucket, fileName: 'x.dump', input, now: NOW })).rejects.toThrow();
    expect(bucket.deleted).toEqual(['db-backups/x.dump']);
  });

  it('tên file có đường dẫn → từ chối', async () => {
    await expect(
      uploadDbBackup({ bucket: makeBucket(), fileName: '../x.dump', input: Readable.from([Buffer.alloc(1)]) }),
    ).rejects.toThrow();
  });

  it('dọn bản quá hạn sau khi tải nhưng giữ bản vừa tải', async () => {
    const bucket = makeBucket({
      existing: [f('o1.dump', 60 * DAY), f('n1.dump', 1 * DAY), f('n2.dump', 2 * DAY), f('n3.dump', 3 * DAY)],
    });
    const res = await uploadDbBackup({ bucket, fileName: 'x.dump', input: Readable.from([Buffer.alloc(10, 1)]), now: NOW });
    expect(res.deleted).toBe(1);
    expect(bucket.deleted).toEqual(['db-backups/o1.dump']);
  });
});

describe('dbBackupGcs — CLI', () => {
  it('thành công → exit 0, in một dòng JSON không chứa tên bucket', async () => {
    const log = jest.fn();
    const code = await runDbBackupUploadCli({
      argv: ['x.dump'], stdin: Readable.from([Buffer.alloc(5, 1)]), bucket: makeBucket(), log, err: jest.fn(), now: NOW,
    });
    expect(code).toBe(0);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ ok: true, bytes: 5 });
  });

  it('size lệch → exit 1', async () => {
    const code = await runDbBackupUploadCli({
      argv: ['x.dump'], stdin: Readable.from([Buffer.alloc(5, 1)]), bucket: makeBucket({ sizeOverride: 4 }),
      log: jest.fn(), err: jest.fn(), now: NOW,
    });
    expect(code).toBe(1);
  });

  it('thiếu tên file → exit 2', async () => {
    const code = await runDbBackupUploadCli({ argv: [], stdin: Readable.from([]), bucket: makeBucket(), err: jest.fn() });
    expect(code).toBe(2);
  });
});

describe('dbBackupGcs — evaluateBackupFreshness', () => {
  const opts = { maxAgeHours: 30, now: NOW };
  it('bản mới nhất 2h → không cũ', () => {
    expect(evaluateBackupFreshness([f('a', 2 * 3600 * 1000)], opts).stale).toBe(false);
  });
  it('bản mới nhất 31h → cũ', () => {
    expect(evaluateBackupFreshness([f('a', 31 * 3600 * 1000), f('b', 90 * 3600 * 1000)], opts).stale).toBe(true);
  });
  it('không có bản nào → cũ', () => {
    expect(evaluateBackupFreshness([], opts)).toMatchObject({ stale: true, count: 0 });
  });
});
