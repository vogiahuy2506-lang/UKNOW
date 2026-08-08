import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: unifiedInboxRepository } = await import('../unifiedInbox.repository.js');
const {
  _resetAiHandoffAutoResumeCacheForTests,
} = await import('../../../utils/aiHandoffResume.util.js');

describe('unifiedInbox.repository isAiPaused (lazy auto-resume)', () => {
  beforeEach(() => {
    query.mockReset();
    _resetAiHandoffAutoResumeCacheForTests();
  });

  it('returns false when ai_paused is false', async () => {
    query.mockResolvedValueOnce({
      rows: [{ ai_paused: false, ai_paused_at: null, id_user: 1 }],
    });
    await expect(unifiedInboxRepository.isAiPaused(1, 'webchat')).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('stays paused when owner setting is null even if pause is old', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    query
      .mockResolvedValueOnce({
        rows: [{ ai_paused: true, ai_paused_at: old, id_user: 9 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ai_handoff_auto_resume_minutes: null }],
      });

    await expect(unifiedInboxRepository.isAiPaused(3, 'zalo_personal')).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toMatch(/SELECT ai_paused, ai_paused_at, id_user/i);
    expect(String(query.mock.calls[1][0])).toMatch(/ai_handoff_auto_resume_minutes/i);
  });

  it('stays paused when elapsed < setting', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    query
      .mockResolvedValueOnce({
        rows: [{ ai_paused: true, ai_paused_at: fiveMinAgo, id_user: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ai_handoff_auto_resume_minutes: 15 }],
      });

    await expect(unifiedInboxRepository.isAiPaused(2, 'channel')).resolves.toBe(true);
    expect(query.mock.calls.some((c) => /UPDATE/i.test(String(c[0])))).toBe(false);
  });

  it('clears pause and returns false when elapsed >= setting', async () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    query
      .mockResolvedValueOnce({
        rows: [{ ai_paused: true, ai_paused_at: twentyMinAgo, id_user: 4 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ai_handoff_auto_resume_minutes: 15 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(unifiedInboxRepository.isAiPaused(4, 'webchat')).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[2][0])).toMatch(/UPDATE[\s\S]*ai_paused = false/i);
  });

  it('stays paused when ai_paused_at is invalid', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ ai_paused: true, ai_paused_at: 'not-a-date', id_user: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ai_handoff_auto_resume_minutes: 15 }],
      });

    await expect(unifiedInboxRepository.isAiPaused(5, 'webchat')).resolves.toBe(true);
    expect(query.mock.calls.some((c) => /UPDATE/i.test(String(c[0])))).toBe(false);
  });
});
