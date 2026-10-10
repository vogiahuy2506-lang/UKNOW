import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn(async () => ({ rows: [] }));
jest.unstable_mockModule('../../config/database.js', () => ({ default: { query } }));

const repo = await import('../storage.repository.js');

describe('storage.repository — đối soát', () => {
  beforeEach(() => query.mockClear());

  it('listStorageObjectsForReconcile quét cả dòng orphaned có storage_key', async () => {
    await repo.listStorageObjectsForReconcile({ afterId: 0, limit: 10 });
    const [sql, params] = query.mock.calls[0];
    expect(params[1]).toEqual(['active', 'temp', 'cleanup_pending', 'orphaned']);
    expect(sql).toContain("state <> 'orphaned' OR storage_key IS NOT NULL");
  });

  it('QUOTA_USAGE_STATES (tính dung lượng) KHÔNG chứa orphaned', () => {
    expect(repo.QUOTA_USAGE_STATES).toEqual(['active', 'temp', 'cleanup_pending']);
  });

  it('restoreOrphanedStorageObject chỉ đụng dòng đang orphaned', async () => {
    await repo.restoreOrphanedStorageObject(7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("state = 'orphaned'");
    expect(sql).toContain("SET state = 'active'");
    expect(params).toEqual([7]);
  });
});
