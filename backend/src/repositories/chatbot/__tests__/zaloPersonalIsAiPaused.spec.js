import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: zaloPersonalRepository } = await import('../zaloPersonal.repository.js');
const {
  _resetAiHandoffAutoResumeCacheForTests,
} = await import('../../../utils/aiHandoffResume.util.js');

/**
 * PLAN_VA_BAT_TAT_AI_2026-09-28 PR-B (mục 6) — bản song sinh của
 * repositories/ai/__tests__/conversationAiPaused.spec.js, cho zaloPersonal.repository.js.isAiPaused
 * (bảng zalo_personal_conversations riêng, không nhận tham số conversationType).
 */
describe('zaloPersonal.repository isAiPaused (lazy auto-resume)', () => {
  beforeEach(() => {
    query.mockReset();
    _resetAiHandoffAutoResumeCacheForTests();
  });

  it('returns false when ai_paused is false', async () => {
    query.mockResolvedValueOnce({
      rows: [{ ai_paused: false, ai_paused_at: null, id_user: 1 }],
    });
    await expect(zaloPersonalRepository.isAiPaused(1)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('stays paused when elapsed < setting (không chạm UPDATE)', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    query
      .mockResolvedValueOnce({
        rows: [{ ai_paused: true, ai_paused_at: fiveMinAgo, id_user: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ai_handoff_auto_resume_minutes: 15 }],
      });

    await expect(zaloPersonalRepository.isAiPaused(2)).resolves.toBe(true);
    expect(query.mock.calls.some((c) => /UPDATE/i.test(String(c[0])))).toBe(false);
  });

  it('clears pause and returns false when elapsed >= setting — UPDATE kèm mốc ai_paused_at VỪA ĐỌC', async () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    query
      .mockResolvedValueOnce({
        rows: [{ ai_paused: true, ai_paused_at: twentyMinAgo, id_user: 4 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ai_handoff_auto_resume_minutes: 15 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(zaloPersonalRepository.isAiPaused(4)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(3);
    const [updateSql, updateParams] = query.mock.calls[2];
    expect(String(updateSql)).toMatch(/UPDATE[\s\S]*ai_paused = false/i);
    // PLAN_VA_BAT_TAT_AI_2026-09-28 PR-B (mục 6): tránh xoá nhầm một lần tạm dừng MỚI (tay hoặc
    // auto) ghi đúng trong cửa sổ đua giữa lúc đọc và lúc UPDATE này chạy.
    expect(String(updateSql)).toMatch(/WHERE id = \$1 AND ai_paused = true AND ai_paused_at = \$2/i);
    expect(updateParams).toEqual([4, twentyMinAgo]);
  });

  it('stays paused when owner setting is null even if pause is old (manual pause, ai_paused_at NULL)', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    query
      .mockResolvedValueOnce({
        rows: [{ ai_paused: true, ai_paused_at: old, id_user: 9 }],
      })
      .mockResolvedValueOnce({
        rows: [{ ai_handoff_auto_resume_minutes: null }],
      });

    await expect(zaloPersonalRepository.isAiPaused(3)).resolves.toBe(true);
    expect(query.mock.calls.some((c) => /UPDATE/i.test(String(c[0])))).toBe(false);
  });
});
