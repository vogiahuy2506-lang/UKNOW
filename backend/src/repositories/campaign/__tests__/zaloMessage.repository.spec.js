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
