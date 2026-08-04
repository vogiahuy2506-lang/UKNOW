import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();
const setAiPaused = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

// Re-import after mock — repository reads db at call time
const { default: unifiedInboxRepository } = await import('../unifiedInbox.repository.js');

describe('unifiedInbox.repository isAiPaused', () => {
  beforeEach(() => {
    query.mockReset();
    setAiPaused.mockReset();
  });

  it('returns false when ai_paused is false', async () => {
    query.mockResolvedValueOnce({ rows: [{ ai_paused: false, ai_paused_at: null }] });
    await expect(unifiedInboxRepository.isAiPaused(1, 'webchat')).resolves.toBe(false);
  });

  it('returns true when paused and within resume window', async () => {
    query.mockResolvedValueOnce({
      rows: [{ ai_paused: true, ai_paused_at: new Date().toISOString() }],
    });
    await expect(unifiedInboxRepository.isAiPaused(2, 'channel', 30)).resolves.toBe(true);
  });

  it('auto-resumes when pause older than resumeMinutes', async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    query
      .mockResolvedValueOnce({ rows: [{ ai_paused: true, ai_paused_at: old }] })
      .mockResolvedValueOnce({ rows: [] }); // setAiPaused update
    await expect(unifiedInboxRepository.isAiPaused(3, 'zalo_personal', 30)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
