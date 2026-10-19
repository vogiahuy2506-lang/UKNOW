import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetRunMetadata = jest.fn();
const mockPatchRunMetadata = jest.fn();
const mockFindCampaignById = jest.fn();
const mockNotifyUsers = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: mockGetRunMetadata,
    patchRunMetadata: mockPatchRunMetadata,
  },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: { findCampaignById: mockFindCampaignById },
}));

jest.unstable_mockModule('../../services/notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
}));

const {
  isPhoneLookupCooldownReason,
  recordPhoneLookupDeferDay,
  buildSendingSlowCopy,
  notifyCampaignSendingSlow,
  SENDING_SLOW_RENOTIFY_MS,
} = await import('../campaignSlowSendNotify.util.js');

// 12:00 giờ VN (05:00Z) các ngày 19–22/10/2026 — giữa ngày nên không dính biên ngày VN.
const vnNoon = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T05:00:00.000Z`);

describe('campaignSlowSendNotify.util — isPhoneLookupCooldownReason', () => {
  it('nhận đủ 3 reason khoá tra số, không nhận reason khác', () => {
    expect(isPhoneLookupCooldownReason('phone_lookup_cooldown')).toBe(true);
    expect(isPhoneLookupCooldownReason('phone_lookup_cooldown_api_error')).toBe(true);
    expect(isPhoneLookupCooldownReason('all_accounts_phone_lookup_cooldown')).toBe(true);
    expect(isPhoneLookupCooldownReason('quiet_hours')).toBe(false);
    expect(isPhoneLookupCooldownReason('rate_limited')).toBe(false);
    expect(isPhoneLookupCooldownReason(undefined)).toBe(false);
  });
});

describe('campaignSlowSendNotify.util — recordPhoneLookupDeferDay', () => {
  it('ngày 1 (chưa có gì): ghi [d1], KHÔNG báo', () => {
    expect(recordPhoneLookupDeferDay(undefined, vnNoon(19))).toEqual({ days: ['20261019'], shouldNotify: false });
  });

  it('ngày 2 liền kề: báo', () => {
    expect(recordPhoneLookupDeferDay(['20261019'], vnNoon(20))).toEqual({
      days: ['20261019', '20261020'],
      shouldNotify: true,
    });
  });

  it('cùng ngày gọi lại: không trùng ngày; ngày 1 vẫn không báo', () => {
    expect(recordPhoneLookupDeferDay(['20261019'], vnNoon(19))).toEqual({ days: ['20261019'], shouldNotify: false });
  });

  it('cách quãng (ngày 1 và ngày 3): KHÔNG báo', () => {
    expect(recordPhoneLookupDeferDay(['20261019'], vnNoon(21))).toEqual({
      days: ['20261019', '20261021'],
      shouldNotify: false,
    });
  });

  it('lúc 00:30 VN (= 17:30Z hôm trước) tính là ngày VN mới, không phải ngày UTC', () => {
    const justAfterMidnightVn = new Date('2026-10-19T17:30:00.000Z'); // 00:30 VN 20/10
    expect(recordPhoneLookupDeferDay(['20261019'], justAfterMidnightVn)).toEqual({
      days: ['20261019', '20261020'],
      shouldNotify: true,
    });
  });

  it('giữ tối đa 7 ngày gần nhất, bỏ phần tử sai định dạng', () => {
    const existing = ['20261010', '20261011', '20261012', '20261013', '20261014', '20261015', '20261016', 'rác', 42, null];
    const out = recordPhoneLookupDeferDay(existing, vnNoon(19));
    expect(out.days).toEqual(['20261011', '20261012', '20261013', '20261014', '20261015', '20261016', '20261019']);
    const many = Array.from({ length: 9 }, (_, i) => `2026100${i + 1}`);
    expect(recordPhoneLookupDeferDay(many, vnNoon(19)).days).toHaveLength(7);
    expect(recordPhoneLookupDeferDay(many, vnNoon(19)).days.at(-1)).toBe('20261019');
  });
});

describe('campaignSlowSendNotify.util — buildSendingSlowCopy', () => {
  it('phone_lookup: tiêu đề + nội dung đúng plan, không có con số "30"', () => {
    const copy = buildSendingSlowCopy('phone_lookup', 'Khai giảng', 'Zalo A');
    expect(copy.title).toBe('Chiến dịch «Khai giảng» đang gửi rất chậm');
    expect(copy.message).toContain('Tài khoản Zalo «Zalo A» bị Zalo giới hạn số lần tra số điện thoại mỗi ngày');
    expect(copy.message).toContain('Hệ thống vẫn tự gửi tiếp mỗi sáng.');
    expect(copy.message).not.toMatch(/30/);
    expect(copy.titleEn).toBeTruthy();
    expect(copy.messageEn).toBeTruthy();
  });

  it('stranger_ban: câu cấm nhắn người lạ; thiếu tên tài khoản vẫn thành câu hoàn chỉnh', () => {
    const copy = buildSendingSlowCopy('stranger_ban', 'Khai giảng', null);
    expect(copy.message).toContain('Tài khoản Zalo đang bị Zalo tạm cấm nhắn tin cho người chưa kết bạn.');
    expect(copy.message).toContain('sẽ thử lại vào sáng mai');
  });
});

describe('campaignSlowSendNotify.util — notifyCampaignSendingSlow', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetRunMetadata.mockReset();
    mockPatchRunMetadata.mockReset();
    mockFindCampaignById.mockReset();
    mockNotifyUsers.mockReset();
    mockNotifyUsers.mockResolvedValue({ inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    mockPatchRunMetadata.mockResolvedValue(null);
    mockFindCampaignById.mockResolvedValue({ id: 7, id_user: 55, campaign_name: 'Khai giảng' });
    mockQuery.mockResolvedValue({ rows: [{ id: 55 }] });
  });

  it('lần đầu: claim cờ TRƯỚC khi gửi, gọi notifyUsers đúng sự kiện/link/dedupeKey, không cần mẫu email', async () => {
    mockGetRunMetadata.mockResolvedValue({});
    const now = vnNoon(20);
    const out = await notifyCampaignSendingSlow({ runId: 9, campaignId: 7, cause: 'phone_lookup', accountName: 'Zalo A', now });

    expect(out).toEqual({ sent: true });
    expect(mockPatchRunMetadata).toHaveBeenCalledWith(9, { sendingSlowNotifiedAt: now.toISOString() });
    expect(mockPatchRunMetadata.mock.invocationCallOrder[0]).toBeLessThan(mockNotifyUsers.mock.invocationCallOrder[0]);
    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    const arg = mockNotifyUsers.mock.calls[0][0];
    expect(arg).toMatchObject({
      eventType: 'campaign_sending_slow',
      userIds: [55],
      link: '/app/campaigns/7',
      severity: 'warning',
      dedupeKey: `run:9:sending_slow:${now.toISOString()}`,
      metadata: { runId: 9, campaignId: 7, cause: 'phone_lookup' },
    });
    expect(arg.title).toBe('Chiến dịch «Khai giảng» đang gửi rất chậm');
    expect(arg.email).toBeUndefined();
  });

  it('cờ < 7 ngày: bỏ qua, không claim, không gửi', async () => {
    const now = vnNoon(26);
    mockGetRunMetadata.mockResolvedValue({ sendingSlowNotifiedAt: vnNoon(20).toISOString() }); // 6 ngày trước
    const out = await notifyCampaignSendingSlow({ runId: 9, campaignId: 7, cause: 'phone_lookup', now });
    expect(out).toEqual({ skipped: true, reason: 'already_notified' });
    expect(mockPatchRunMetadata).not.toHaveBeenCalled();
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });

  it('cờ đúng 7 ngày trở lên: báo lại', async () => {
    const now = new Date(vnNoon(20).getTime() + SENDING_SLOW_RENOTIFY_MS);
    mockGetRunMetadata.mockResolvedValue({ sendingSlowNotifiedAt: vnNoon(20).toISOString() });
    const out = await notifyCampaignSendingSlow({ runId: 9, campaignId: 7, cause: 'phone_lookup', now });
    expect(out).toEqual({ sent: true });
  });

  it('nhận cause stranger_ban (PR-4 dùng sau) với câu riêng', async () => {
    mockGetRunMetadata.mockResolvedValue({});
    await notifyCampaignSendingSlow({ runId: 9, campaignId: 7, cause: 'stranger_ban', accountName: 'Zalo A', now: vnNoon(20) });
    const arg = mockNotifyUsers.mock.calls[0][0];
    expect(arg.metadata.cause).toBe('stranger_ban');
    expect(arg.message).toContain('tạm cấm nhắn tin cho người chưa kết bạn');
  });

  it('cause lạ: bỏ qua, không đụng DB', async () => {
    const out = await notifyCampaignSendingSlow({ runId: 9, campaignId: 7, cause: 'khac' });
    expect(out).toEqual({ skipped: true, reason: 'unknown_cause' });
    expect(mockGetRunMetadata).not.toHaveBeenCalled();
  });

  it('không có chủ chiến dịch: đã claim cờ nhưng không gửi', async () => {
    mockGetRunMetadata.mockResolvedValue({});
    mockFindCampaignById.mockResolvedValue(null);
    const out = await notifyCampaignSendingSlow({ runId: 9, campaignId: 7, cause: 'phone_lookup', now: vnNoon(20) });
    expect(out).toEqual({ skipped: true, reason: 'no_owner' });
    expect(mockNotifyUsers).not.toHaveBeenCalled();
  });
});
