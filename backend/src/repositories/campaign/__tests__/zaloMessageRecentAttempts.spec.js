import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-S2: `zalo_messages.sent_at` là timestamp NAIVE giờ VN, Node production chạy UTC — mốc cửa sổ
 * phải tính trong SQL (LOCALTIMESTAMP), không bind Date JS (lệch 7h); mốc trả ra đổi về thời điểm
 * thật bằng AT TIME ZONE. Test ghim câu SQL vì DB dev (+07) không lộ được lỗi này.
 */

const queryMock = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: queryMock },
}));

const { default: zaloMessageRepository } = await import('../zaloMessage.repository.js');

describe('zaloMessageRepository.listRecentOutboundAttemptsByAccount', () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({
      rows: [{
        account_id: '7',
        attempt_count: 3,
        first_attempt_at: new Date('2026-09-29T09:00:00.000Z'),
        last_attempt_at: new Date('2026-09-29T09:10:00.000Z'),
      }],
    });
  });

  it('cửa sổ tính trong SQL bằng LOCALTIMESTAMP, tham số là kênh + windowMs (số), không có Date', async () => {
    await zaloMessageRepository.listRecentOutboundAttemptsByAccount('zalo_group', 3600000);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/sent_at >= LOCALTIMESTAMP - \(\$2::bigint \* INTERVAL '1 millisecond'\)/);
    expect(sql).toMatch(/AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)::timestamptz AS first_attempt_at/);
    expect(sql).toMatch(/AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)::timestamptz AS last_attempt_at/);
    expect(sql).not.toMatch(/status/);
    expect(sql).not.toMatch(/is_preview/);
    expect(params).toEqual(['zalo_group', 3600000]);
  });

  it('map hàng về accountId (chuỗi), attemptCount, mốc Date', async () => {
    const out = await zaloMessageRepository.listRecentOutboundAttemptsByAccount('zalo_personal', 3600000);

    expect(out).toEqual([{
      accountId: '7',
      attemptCount: 3,
      firstAttemptAt: new Date('2026-09-29T09:00:00.000Z'),
      lastAttemptAt: new Date('2026-09-29T09:10:00.000Z'),
    }]);
  });
});
