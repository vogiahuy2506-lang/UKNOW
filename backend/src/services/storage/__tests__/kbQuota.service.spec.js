import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const client = {
  query: jest.fn(async () => ({ rows: [] })),
  release: jest.fn(),
};
const acquireKbQuotaLock = jest.fn();
const countInvalidActivePlanKbLimits = jest.fn();
const getEffectiveKbLimits = jest.fn();
const getKbUsage = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => client) },
}));
jest.unstable_mockModule('../../../repositories/kbQuota.repository.js', () => ({
  acquireKbQuotaLock,
  countInvalidActivePlanKbLimits,
  getEffectiveKbLimits,
  getKbUsage,
}));

const {
  assertKbQuotaDelta,
  countExtractedChars,
  validateActivePlanKbLimits,
  withKbQuotaLock,
} = await import('../kbQuota.service.js');

describe('kbQuota.service', () => {
  const originalFlag = process.env.STORAGE_KB_LIMIT_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STORAGE_KB_LIMIT_ENABLED;
    getEffectiveKbLimits.mockResolvedValue({ maxDocuments: '3', maxExtractedChars: '100' });
    getKbUsage.mockResolvedValue({ documentCount: '2', extractedChars: '90' });
    countInvalidActivePlanKbLimits.mockResolvedValue(0);
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.STORAGE_KB_LIMIT_ENABLED;
    else process.env.STORAGE_KB_LIMIT_ENABLED = originalFlag;
  });

  it('counts Unicode code points consistently with PostgreSQL char_length', () => {
    expect(countExtractedChars('A😀B')).toBe(3);
  });

  it('records shadow usage without blocking when enforcement is off', () => {
    expect(() => assertKbQuotaDelta({
      documentCount: 3,
      extractedChars: 100,
      maxDocuments: 3,
      maxExtractedChars: 100,
    }, { documentDelta: 1, charDelta: 1 })).not.toThrow();
  });

  it('rejects document and character positive deltas when enforcement is on', () => {
    process.env.STORAGE_KB_LIMIT_ENABLED = 'true';
    const usage = {
      documentCount: 3,
      extractedChars: 100,
      maxDocuments: 3,
      maxExtractedChars: 100,
    };
    expect(() => assertKbQuotaDelta(usage, { documentDelta: 1 }))
      .toThrow(expect.objectContaining({ code: 'KB_DOCUMENT_LIMIT_EXCEEDED', status: 409 }));
    expect(() => assertKbQuotaDelta(usage, { charDelta: 1 }))
      .toThrow(expect.objectContaining({ code: 'KB_CHAR_LIMIT_EXCEEDED', status: 409 }));
  });

  it('holds the workspace advisory lock only around usage and mutation transaction', async () => {
    const mutation = jest.fn(async ({ usage, assertDelta }) => {
      expect(usage).toEqual({
        documentCount: 2,
        extractedChars: 90,
        maxDocuments: 3,
        maxExtractedChars: 100,
      });
      assertDelta({ documentDelta: 1, charDelta: 10 });
      return 'done';
    });

    await expect(withKbQuotaLock(42, mutation)).resolves.toBe('done');

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(acquireKbQuotaLock).toHaveBeenCalledWith(client, 42);
    expect(getKbUsage).toHaveBeenCalledWith(42, client);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('fails startup validation when enabled and an active plan is incomplete', async () => {
    process.env.STORAGE_KB_LIMIT_ENABLED = 'true';
    countInvalidActivePlanKbLimits.mockResolvedValue(2);
    await expect(validateActivePlanKbLimits()).rejects.toThrow('2 invalid');
  });
});
