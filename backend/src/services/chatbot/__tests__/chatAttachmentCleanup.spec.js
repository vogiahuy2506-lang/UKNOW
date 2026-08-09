import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { isKeyReferenced } = await import('../chatAttachmentCleanup.service.js');

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
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('skips missing tables (42P01) but still works if another table answers', async () => {
    const missing = Object.assign(new Error('relation "webchat_messages" does not exist'), {
      code: '42P01',
    });
    mockQuery
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
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
