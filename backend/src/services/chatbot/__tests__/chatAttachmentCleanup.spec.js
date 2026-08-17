import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';

const mockQuery = jest.fn();
const mockResolveAbs = jest.fn((key) => (key ? `/abs/${key}` : null));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    resolveAbsolutePathFromKey: mockResolveAbs,
  },
}));

jest.unstable_mockModule('../../storage/storageObject.service.js', () => ({
  markDeletedAfterUnlink: jest.fn(async ({ physicalPaths }) => {
    for (const filePath of physicalPaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return null;
  }),
}));

const unlinkSpy = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
const readdirSpy = jest.spyOn(fs, 'readdir').mockResolvedValue([]);
const statSpy = jest.spyOn(fs, 'stat');

const {
  isKeyReferenced,
  isKeyInCatalog,
  cleanupExpiredCatalogRows,
  cleanupOrphanChatAttachments,
} = await import('../chatAttachmentCleanup.service.js');

describe('isKeyReferenced fail-closed', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns true when any table references the key', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    await expect(isKeyReferenced('uploads/1/chat/a.pdf')).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns false only when at least one table answered and none matched', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(isKeyReferenced('uploads/1/chat/orphan.pdf')).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });

  it('skips missing tables (42P01) but still works if another table answers', async () => {
    const missing = Object.assign(new Error('relation "webchat_messages" does not exist'), {
      code: '42P01',
    });
    mockQuery
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(isKeyReferenced('uploads/1/chat/a.pdf')).resolves.toBe(false);
  });

  it('throws when every table is missing (42P01) — do not treat as orphan', async () => {
    const missing = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    mockQuery.mockRejectedValue(missing);

    await expect(isKeyReferenced('uploads/1/chat/a.pdf')).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_CLEANUP_DB_UNREACHABLE',
    });
  });

  it('rethrows connection errors instead of treating key as unreferenced', async () => {
    const boom = Object.assign(new Error('Connection terminated unexpectedly'), {
      code: '57P01',
    });
    mockQuery.mockRejectedValue(boom);

    await expect(isKeyReferenced('uploads/1/chat/a.pdf')).rejects.toThrow(
      /Connection terminated unexpectedly/
    );
  });
});

describe('expires_at catalog cleanup', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveAbs.mockClear();
    unlinkSpy.mockReset().mockResolvedValue(undefined);
    readdirSpy.mockReset().mockResolvedValue([]);
    statSpy.mockReset();
  });

  it('expired row → unlink file + sidecar + DELETE row', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/SELECT id, storage_key/i.test(sql)) {
        return { rows: [{ id: 11, storage_key: 'uploads/1/chat/old.pdf' }], rowCount: 1 };
      }
      if (/DELETE FROM chat_attachments/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await cleanupExpiredCatalogRows();

    expect(mockResolveAbs).toHaveBeenCalledWith('uploads/1/chat/old.pdf');
    expect(unlinkSpy).toHaveBeenCalledWith('/abs/uploads/1/chat/old.pdf');
    expect(unlinkSpy).toHaveBeenCalledWith('/abs/uploads/1/chat/old.pdf.txt');
    const deleteCall = mockQuery.mock.calls.find(([sql]) => sql.includes('DELETE FROM chat_attachments'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1]).toEqual([11]);
    expect(result).toMatchObject({ expiredScanned: 1, rowsDeleted: 1, filesDeleted: 1 });
  });

  it('expired row with active message reference is SKIPPED from deletion', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/SELECT id, storage_key/i.test(sql)) {
        return { rows: [{ id: 11, storage_key: 'uploads/1/chat/referenced.pdf' }], rowCount: 1 };
      }
      if (/webchat_messages/i.test(sql)) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await cleanupExpiredCatalogRows();
    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(result.rowsDeleted).toBe(0);
  });

  it('no expired rows → nothing unlinked', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await cleanupExpiredCatalogRows();
    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(result.rowsDeleted).toBe(0);
  });

  it('ENOENT on unlink is swallowed; row still deleted', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/SELECT id, storage_key/i.test(sql)) {
        return { rows: [{ id: 3, storage_key: 'uploads/1/chat/gone.pdf' }], rowCount: 1 };
      }
      if (/DELETE FROM chat_attachments/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    unlinkSpy.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const result = await cleanupExpiredCatalogRows();
    expect(result.rowsDeleted).toBe(1);
    const deleteCall = mockQuery.mock.calls.find(([sql]) => sql.includes('DELETE FROM chat_attachments'));
    expect(deleteCall).toBeDefined();
  });

  it('catalog SELECT failure throws (fail-closed, no orphan pass)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    await expect(cleanupOrphanChatAttachments()).rejects.toThrow(/Connection terminated/);
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('isKeyInCatalog true → orphan sweep skips unlink', async () => {
    // Pass 1: no expired
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // list one old file under uploads/9/chat/
    const dirent = (name, isDirectory) => ({
      name,
      isDirectory: () => isDirectory,
      isFile: () => !isDirectory,
    });
    readdirSpy
      .mockResolvedValueOnce([dirent('9', true)]) // uploads/
      .mockResolvedValueOnce([dirent('kept.pdf', false)]); // uploads/9/chat/
    statSpy.mockResolvedValue({ mtimeMs: Date.now() - 100 * 24 * 60 * 60 * 1000 });

    // isKeyInCatalog → true (has row)
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const result = await cleanupOrphanChatAttachments();
    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.rowsDeleted).toBe(0);
  });

  it('legacy orphan pass reports but does not unlink while the durable delete gate is off', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const dirent = (name, isDirectory) => ({
      name,
      isDirectory: () => isDirectory,
      isFile: () => !isDirectory,
    });
    readdirSpy
      .mockResolvedValueOnce([dirent('9', true)])
      .mockResolvedValueOnce([dirent('quarantine.pdf', false)]);
    statSpy.mockResolvedValue({ mtimeMs: Date.now() - 100 * 24 * 60 * 60 * 1000 });

    const result = await cleanupOrphanChatAttachments({ deleteUntracked: false });

    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      untrackedDeleteEnabled: false,
      untrackedDeleteCandidates: 1,
      deleted: 0,
      skipped: 1,
    });
  });

  it('legacy orphan pass unlinks only when the durable delete gate is enabled', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const dirent = (name, isDirectory) => ({
      name,
      isDirectory: () => isDirectory,
      isFile: () => !isDirectory,
    });
    readdirSpy
      .mockResolvedValueOnce([dirent('9', true)])
      .mockResolvedValueOnce([dirent('orphan.pdf', false)]);
    statSpy.mockResolvedValue({ mtimeMs: Date.now() - 100 * 24 * 60 * 60 * 1000 });

    const result = await cleanupOrphanChatAttachments({ deleteUntracked: true });

    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('orphan.pdf'));
    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('orphan.pdf.txt'));
    expect(result).toMatchObject({
      untrackedDeleteEnabled: true,
      untrackedDeleteCandidates: 1,
      deleted: 1,
    });
  });

  it('isKeyInCatalog queries storage_key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(isKeyInCatalog('uploads/1/chat/x.pdf')).resolves.toBe(false);
    expect(mockQuery.mock.calls[0][0]).toMatch(/FROM chat_attachments WHERE storage_key/);
  });
});
