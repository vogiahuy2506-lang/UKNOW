import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const zaloMessageRepository = (await import('../../../repositories/campaign/zaloMessage.repository.js')).default;

describe('zaloMessage.repository findExistingSentCampaignZaloMessage', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  it('returns null when required fields missing', async () => {
    expect(await zaloMessageRepository.findExistingSentCampaignZaloMessage({})).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('queries sent zalo_messages by run, campaign, channel, recipient, step', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 42, sent_at: new Date() }] });
    const row = await zaloMessageRepository.findExistingSentCampaignZaloMessage({
      runId: 10,
      campaignId: 5,
      channel: 'zalo_personal',
      recipientKey: '0901234567',
      zaloStep: 2,
    });
    expect(row).toEqual({ id: 42, sent_at: expect.any(Date) });
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/tracking_metadata->>'status'/);
    expect(params).toEqual([10, 5, 'zalo_personal', '0901234567', 2]);
  });
});

describe('zaloMessage.repository mergeZaloMessageTrackingMetadata (PR-3)', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [] });
  });

  it('metadata KHÔNG có status (vd chỉ linkTargets) → không đổi cột status (COALESCE giữ nguyên)', async () => {
    await zaloMessageRepository.mergeZaloMessageTrackingMetadata(99, { linkTargets: ['a', 'b'] });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/status\s*=\s*COALESCE\(\$3,\s*status\)/i);
    expect(params).toEqual([99, JSON.stringify({ linkTargets: ['a', 'b'] }), null]);
  });

  it('metadata có status → đổi cả cột status lẫn tracking_metadata JSONB', async () => {
    await zaloMessageRepository.mergeZaloMessageTrackingMetadata(99, { status: 'sent', uid: 'u1' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/tracking_metadata\s*=\s*COALESCE\(tracking_metadata/i);
    expect(sql).toMatch(/status\s*=\s*COALESCE\(\$3,\s*status\)/i);
    expect(params).toEqual([99, JSON.stringify({ status: 'sent', uid: 'u1' }), 'sent']);
  });
});

describe('zaloMessage.repository markAbandonedIfStillQueued (PR-3)', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [] });
  });

  it('UPDATE có điều kiện chỉ đụng dòng còn status=queued, không cần cờ nào khác', async () => {
    await zaloMessageRepository.markAbandonedIfStillQueued(501);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/SET[\s\S]*status\s*=\s*'aborted'/i);
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\$1/i);
    expect(sql).toMatch(/AND\s+COALESCE\(tracking_metadata->>'status',\s*''\)\s*=\s*'queued'/i);
    expect(params).toEqual([501]);
  });

  it('gọi hai lần liên tiếp ra cùng một câu lệnh — idempotent theo thiết kế (SQL tự lọc, không cần JS kiểm tra)', async () => {
    await zaloMessageRepository.markAbandonedIfStillQueued(501);
    await zaloMessageRepository.markAbandonedIfStillQueued(501);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][0]).toBe(db.query.mock.calls[1][0]);
    expect(db.query.mock.calls[0][1]).toEqual(db.query.mock.calls[1][1]);
  });
});
