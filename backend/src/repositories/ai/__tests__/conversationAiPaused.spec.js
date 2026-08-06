import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: unifiedInboxRepository } = await import('../unifiedInbox.repository.js');

describe('unifiedInbox.repository isAiPaused (no auto-resume)', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns false when ai_paused is false', async () => {
    query.mockResolvedValueOnce({ rows: [{ ai_paused: false }] });
    await expect(unifiedInboxRepository.isAiPaused(1, 'webchat')).resolves.toBe(false);
  });

  it('returns true when paused — stays paused regardless of age', async () => {
    query.mockResolvedValueOnce({ rows: [{ ai_paused: true }] });
    await expect(unifiedInboxRepository.isAiPaused(2, 'channel')).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not auto-resume old pauses', async () => {
    query.mockResolvedValueOnce({ rows: [{ ai_paused: true }] });
    await expect(unifiedInboxRepository.isAiPaused(3, 'zalo_personal')).resolves.toBe(true);
    // Only SELECT — never UPDATE to clear pause
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toMatch(/SELECT ai_paused/i);
  });
});
