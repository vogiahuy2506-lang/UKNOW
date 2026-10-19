import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM PR-3 — báo khách khi chiến dịch gửi chậm vì Zalo giới hạn tra số.
 *
 * Mock đúng RANH GIỚI thật: campaignRun.repository (getRunMetadata/patchRunMetadata giữ trạng thái như jsonb `||`, clearDeferMetadataKeys
 * như toán tử `-`), campaignCrud.repository (chủ chiến dịch), database (users), notifyUsers. persistZaloDeferYieldSlot + util báo chạy THẬT.
 * Giờ giả bằng fake timers để ngày VN / giờ yên lặng xác định.
 */

let runMeta = {};
const mockGetRunMetadata = jest.fn(async () => ({ ...runMeta }));
const mockPatchRunMetadata = jest.fn(async (_runId, patch) => {
  runMeta = { ...runMeta, ...patch };
});
const mockClearDeferMetadataKeys = jest.fn(async (_runId, keys) => {
  for (const key of keys) delete runMeta[key];
});
const mockFindCampaignById = jest.fn();
const mockQuery = jest.fn();
const mockNotifyUsers = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
  withRetry: (fn) => fn(),
  isConnectionError: () => false,
  isNeon: false,
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: mockGetRunMetadata,
    patchRunMetadata: mockPatchRunMetadata,
    clearDeferMetadataKeys: mockClearDeferMetadataKeys,
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: { findCampaignById: mockFindCampaignById },
}));

jest.unstable_mockModule('../../notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
}));

const { default: campaignRunService, ZALO_DEFER_CLEAR_KEYS } = await import('../campaignRun.service.js');

const RUN_ID = 476;
const CAMPAIGN_ID = 352;

/** Giờ VN → Date (VN = UTC+7, không DST). */
const vn = (iso) => new Date(`${iso}+07:00`);

async function defer(reason, waitMs, extra = {}) {
  await expect(
    campaignRunService.persistZaloDeferYieldSlot({
      runId: RUN_ID,
      campaignId: CAMPAIGN_ID,
      waitMs,
      reason,
      accountId: 142,
      accountName: 'Zalo A',
      ...extra,
    })
  ).rejects.toMatchObject({ code: 'RUN_YIELD_SLOT' });
  // Báo chạy fire-and-forget — chờ hàng đợi vi tác vụ + I/O giả xong.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

/** Hoãn khoá tra số lúc `at` (giờ VN) tới đúng 00:00 VN hôm sau, như production. */
async function deferPhoneLookupAt(at, reason = 'phone_lookup_cooldown_api_error') {
  jest.setSystemTime(vn(at));
  const midnight = vn(`${at.slice(0, 10)}T00:00:00`).getTime() + 24 * 60 * 60 * 1000;
  await defer(reason, midnight - Date.now());
}

const slowCalls = () => mockNotifyUsers.mock.calls.filter(([arg]) => arg.eventType === 'campaign_sending_slow');

describe('campaignRun.service — gửi chậm vì khoá tra số (PR-3)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    runMeta = {};
    mockGetRunMetadata.mockClear();
    mockPatchRunMetadata.mockClear();
    mockClearDeferMetadataKeys.mockClear();
    mockFindCampaignById.mockReset();
    mockQuery.mockReset();
    mockNotifyUsers.mockReset();
    mockFindCampaignById.mockResolvedValue({ id: CAMPAIGN_ID, id_user: 39, campaign_name: 'Chăm sóc sau hội thảo' });
    mockQuery.mockResolvedValue({ rows: [{ id: 39 }] });
    mockNotifyUsers.mockResolvedValue({ inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Việc 3.1 — mốc chạy tiếp thật (gộp giờ yên lặng)', () => {
    it('khoá tra số chờ tới 00:00 VN, giờ yên lặng 23–6: zaloOutboundResumeEffectiveAt = 06:00 VN, zaloOutboundDeferredUntil vẫn 00:00 VN', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00');

      expect(runMeta.zaloOutboundDeferredUntil).toBe(vn('2026-10-20T00:00:00').toISOString());
      expect(runMeta.zaloOutboundResumeEffectiveAt).toBe(vn('2026-10-20T06:00:00').toISOString());
    });

    it('hoãn vì rate_limited lúc 14:00 (ngoài giờ yên lặng): effective = until', async () => {
      jest.setSystemTime(vn('2026-10-19T14:00:00'));
      await defer('rate_limited', 90_000);

      expect(runMeta.zaloOutboundDeferredUntil).toBe(vn('2026-10-19T14:01:30').toISOString());
      expect(runMeta.zaloOutboundResumeEffectiveAt).toBe(runMeta.zaloOutboundDeferredUntil);
    });

    it('khi chạy tiếp, _exitIfRunDeferredUntilFuture dọn cả mốc chạy tiếp thật cùng 3 khoá cũ, GIỮ phoneLookupDeferVnDays', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00');
      expect(runMeta.phoneLookupDeferVnDays).toEqual(['20261019']);

      // 06:30 hôm sau: mốc đã qua → chạy tiếp.
      jest.setSystemTime(vn('2026-10-20T06:30:00'));
      const exited = await campaignRunService._exitIfRunDeferredUntilFuture(RUN_ID, { resumedBy: 'test' });

      expect(exited).toBe(false);
      expect(mockClearDeferMetadataKeys).toHaveBeenCalledWith(RUN_ID, ZALO_DEFER_CLEAR_KEYS);
      expect(ZALO_DEFER_CLEAR_KEYS).toEqual(expect.arrayContaining([
        'zaloOutboundDeferredUntil', 'zaloDeferredReason', 'zaloDeferredAt', 'zaloOutboundResumeEffectiveAt',
      ]));
      expect(runMeta.zaloOutboundResumeEffectiveAt).toBeUndefined();
      expect(runMeta.zaloOutboundDeferredUntil).toBeUndefined();
      expect(runMeta.phoneLookupDeferVnDays).toEqual(['20261019']);
    });

    it('còn trong thời gian hoãn: thoát sớm, KHÔNG dọn khoá', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00');
      jest.setSystemTime(vn('2026-10-19T20:00:00'));
      mockClearDeferMetadataKeys.mockClear();

      expect(await campaignRunService._exitIfRunDeferredUntilFuture(RUN_ID)).toBe(true);
      expect(mockClearDeferMetadataKeys).not.toHaveBeenCalled();
      expect(runMeta.zaloOutboundResumeEffectiveAt).toBe(vn('2026-10-20T06:00:00').toISOString());
    });
  });

  describe('Việc 3.3 — kích hoạt chuông khoá tra số ≥ 2 ngày VN liền kề', () => {
    it('ngày 1 hoãn khoá tra số: ghi phoneLookupDeferVnDays=[d1], KHÔNG chuông', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00');

      expect(runMeta.phoneLookupDeferVnDays).toEqual(['20261019']);
      expect(slowCalls()).toHaveLength(0);
    });

    it('ngày 2 (liền) hoãn: chuông ĐÚNG 1 lần, event campaign_sending_slow, link trang chiến dịch, cờ sendingSlowNotifiedAt được ghi', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00');
      await deferPhoneLookupAt('2026-10-20T07:30:00');

      expect(runMeta.phoneLookupDeferVnDays).toEqual(['20261019', '20261020']);
      const calls = slowCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toMatchObject({
        eventType: 'campaign_sending_slow',
        userIds: [39],
        link: `/app/campaigns/${CAMPAIGN_ID}`,
        severity: 'warning',
        metadata: { runId: RUN_ID, campaignId: CAMPAIGN_ID, cause: 'phone_lookup' },
      });
      expect(calls[0][0].title).toBe('Chiến dịch «Chăm sóc sau hội thảo» đang gửi rất chậm');
      expect(calls[0][0].message).toContain('«Zalo A»');
      expect(runMeta.sendingSlowNotifiedAt).toBe(vn('2026-10-20T07:30:00').toISOString());
    });

    it('cả 3 reason khoá tra số đều được đếm (phone_lookup_cooldown, _api_error, all_accounts_)', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00', 'phone_lookup_cooldown');
      await deferPhoneLookupAt('2026-10-20T07:30:00', 'all_accounts_phone_lookup_cooldown');
      expect(runMeta.phoneLookupDeferVnDays).toEqual(['20261019', '20261020']);
      expect(slowCalls()).toHaveLength(1);
    });

    it('ngày 2 hoãn lần nữa và ngày 3–8: không chuông thêm (cờ < 7 ngày)', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00');
      await deferPhoneLookupAt('2026-10-20T07:30:00');
      expect(slowCalls()).toHaveLength(1);

      await deferPhoneLookupAt('2026-10-20T09:00:00'); // ngày 2 lần nữa
      for (const day of [21, 22, 23, 24, 25, 26]) { // ngày 3–8 (cờ đặt 20/10 07:30 → còn hiệu lực tới 27/10 07:30)
        // eslint-disable-next-line no-await-in-loop
        await deferPhoneLookupAt(`2026-10-${day}T07:30:00`);
      }
      expect(slowCalls()).toHaveLength(1);
    });

    it('ngày 1 và ngày 3 (cách quãng): không chuông', async () => {
      await deferPhoneLookupAt('2026-10-19T14:00:00');
      await deferPhoneLookupAt('2026-10-21T07:30:00');

      expect(runMeta.phoneLookupDeferVnDays).toEqual(['20261019', '20261021']);
      expect(slowCalls()).toHaveLength(0);
    });

    it('hoãn vì lý do KHÁC (quiet_hours / rate_limited) không đếm ngày, không chuông', async () => {
      jest.setSystemTime(vn('2026-10-19T23:30:00'));
      await defer('quiet_hours', 6.5 * 3600_000);
      jest.setSystemTime(vn('2026-10-20T14:00:00'));
      await defer('rate_limited', 60_000);

      expect(runMeta.phoneLookupDeferVnDays).toBeUndefined();
      expect(slowCalls()).toHaveLength(0);
    });

    it('lỗi gửi chuông không làm hỏng việc hoãn run (vẫn ném RUN_YIELD_SLOT, metadata đã ghi)', async () => {
      mockNotifyUsers.mockRejectedValue(new Error('boom'));
      await deferPhoneLookupAt('2026-10-19T14:00:00');
      await deferPhoneLookupAt('2026-10-20T07:30:00');

      expect(runMeta.zaloOutboundDeferredUntil).toBeDefined();
      expect(runMeta.phoneLookupDeferVnDays).toEqual(['20261019', '20261020']);
    });
  });
});
