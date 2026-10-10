/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-3 — unit test cho các hàm THUẦN của
 * campaignChannelRunner.service.js (không chạm DB).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  isWithinQuietHours,
  computeQuietHoursWaitMs,
  runAdapterSendNode,
  __recordSendForTest,
  __computePerHourWaitMsForTest,
  __resetPerHourWindowForTest,
} from '../campaignChannelRunner.service.js';

const QUIET_23_TO_6 = { startHour: 23, endHour: 6 };

/** Dựng epoch ms cho một giờ VN (UTC+7) cụ thể, dùng Date.UTC để KHÔNG phụ thuộc TZ tiến trình. */
function vnHourToEpochMs(hour, minute = 0) {
  const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
  return Date.UTC(2026, 8, 27, hour, minute, 0, 0) - VN_UTC_OFFSET_MS;
}

describe('campaignChannelRunner.isWithinQuietHours — vắt nửa đêm 23h VN -> 6h VN', () => {
  it('22:59 VN — ngoài khung', () => {
    expect(isWithinQuietHours(vnHourToEpochMs(22, 59), QUIET_23_TO_6)).toBe(false);
  });

  it('23:00 VN — trong khung', () => {
    expect(isWithinQuietHours(vnHourToEpochMs(23, 0), QUIET_23_TO_6)).toBe(true);
  });

  it('05:59 VN — trong khung', () => {
    expect(isWithinQuietHours(vnHourToEpochMs(5, 59), QUIET_23_TO_6)).toBe(true);
  });

  it('06:00 VN — ngoài khung', () => {
    expect(isWithinQuietHours(vnHourToEpochMs(6, 0), QUIET_23_TO_6)).toBe(false);
  });

  it('quietHours null — không bao giờ trong khung', () => {
    expect(isWithinQuietHours(vnHourToEpochMs(23, 30), null)).toBe(false);
  });

  it('khung không vắt nửa đêm (startHour < endHour) — 10:00-14:00 VN', () => {
    const QUIET_10_TO_14 = { startHour: 10, endHour: 14 };
    expect(isWithinQuietHours(vnHourToEpochMs(9, 59), QUIET_10_TO_14)).toBe(false);
    expect(isWithinQuietHours(vnHourToEpochMs(10, 0), QUIET_10_TO_14)).toBe(true);
    expect(isWithinQuietHours(vnHourToEpochMs(13, 59), QUIET_10_TO_14)).toBe(true);
    expect(isWithinQuietHours(vnHourToEpochMs(14, 0), QUIET_10_TO_14)).toBe(false);
  });
});

describe('campaignChannelRunner — cửa sổ trượt perHourLimit', () => {
  const key = 'unit_test_channel::unit_test_account';

  beforeEach(() => {
    __resetPerHourWindowForTest();
  });

  it('chưa chạm trần — chờ 0ms', () => {
    const now = Date.now();
    __recordSendForTest(key, now - 1000);
    expect(__computePerHourWaitMsForTest(key, 3, now)).toBe(0);
  });

  it('vừa chạm trần — chờ tới khi mốc cũ nhất rớt khỏi cửa sổ 1 giờ', () => {
    const now = Date.now();
    const oldest = now - 10 * 60 * 1000; // 10 phút trước
    __recordSendForTest(key, oldest);
    __recordSendForTest(key, now - 5 * 60 * 1000);
    const waitMs = __computePerHourWaitMsForTest(key, 2, now);
    const expected = (oldest + 60 * 60 * 1000) - now; // còn 50 phút nữa mốc cũ nhất mới rớt cửa sổ
    expect(waitMs).toBeGreaterThan(0);
    expect(Math.abs(waitMs - expected)).toBeLessThan(50);
  });

  it('mốc quá 1 giờ tự rớt khỏi cửa sổ — không còn chạm trần', () => {
    const now = Date.now();
    __recordSendForTest(key, now - 61 * 60 * 1000); // 61 phút trước — ngoài cửa sổ 1 giờ
    expect(__computePerHourWaitMsForTest(key, 1, now)).toBe(0);
  });

  it('perHourLimit = 0/undefined — không giới hạn', () => {
    const now = Date.now();
    __recordSendForTest(key, now - 1000);
    __recordSendForTest(key, now - 500);
    expect(__computePerHourWaitMsForTest(key, 0, now)).toBe(0);
    expect(__computePerHourWaitMsForTest(key, undefined, now)).toBe(0);
  });
});

describe('campaignChannelRunner.computeQuietHoursWaitMs — PR-5, waitMs tới hết khung yên lặng', () => {
  it('22:00 VN, khung 23->6 — ngoài khung → 0', () => {
    expect(computeQuietHoursWaitMs(vnHourToEpochMs(22, 0), QUIET_23_TO_6)).toBe(0);
  });

  it('23:30 VN, khung 23->6 (vắt nửa đêm) — còn 6.5 giờ tới 6:00 SÁNG MAI', () => {
    const expectedMs = 6.5 * 60 * 60 * 1000;
    expect(computeQuietHoursWaitMs(vnHourToEpochMs(23, 30), QUIET_23_TO_6)).toBe(expectedMs);
  });

  it('05:00 VN, khung 23->6 (vắt nửa đêm) — còn 1 giờ tới 6:00 CÙNG NGÀY', () => {
    const expectedMs = 1 * 60 * 60 * 1000;
    expect(computeQuietHoursWaitMs(vnHourToEpochMs(5, 0), QUIET_23_TO_6)).toBe(expectedMs);
  });

  it('quietHours null — 0 (không có gì phải chờ)', () => {
    expect(computeQuietHoursWaitMs(vnHourToEpochMs(23, 30), null)).toBe(0);
  });

  it('khung không vắt nửa đêm (10->14 VN), đang trong khung lúc 12:00 — còn 2 giờ', () => {
    const QUIET_10_TO_14 = { startHour: 10, endHour: 14 };
    expect(computeQuietHoursWaitMs(vnHourToEpochMs(12, 0), QUIET_10_TO_14)).toBe(2 * 60 * 60 * 1000);
  });
});

describe('campaignChannelRunner.runAdapterSendNode — PLAN_TELEGRAM_0_NGUOI_NHAN: 0 người nhận là LỖI, không phải "xong"', () => {
  const buildCtx = (recipients) => ({
    descriptor: {
      key: 'telegram',
      adapter: {
        resolveAccount: async () => ({ accountKey: '7' }),
        resolveRecipients: async () => recipients,
      },
    },
    runId: 1,
    campaignId: 2,
    userId: 3,
    workspaceOwnerId: 3,
    node: { id: 4152 },
    config: { recipientSource: 'telegram_conversations', steps: [{ message: 'hi' }] },
    nodeOutputs: {},
    lastOutputItems: [],
    ensureRunStillRunning: async () => {},
  });

  it('adapter trả mảng rỗng -> ném CHANNEL_NO_RECIPIENTS (không partialResult, không trả total:0)', async () => {
    const error = await runAdapterSendNode(buildCtx([])).then(() => null, (e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('CHANNEL_NO_RECIPIENTS');
    expect(error.message).toContain('4152');
    expect(error.partialResult).toBeUndefined();
  });
});

describe('campaignChannelRunner.runAdapterSendNode — PR-E2: nguồn người nhận telegram_groups', () => {
  const buildCtx = (config, lastOutputItems = []) => {
    const resolveRecipients = jest.fn(async () => []);
    return {
      resolveRecipients,
      ctx: {
        descriptor: {
          key: 'telegram',
          adapter: { resolveAccount: async () => ({ accountKey: '7' }), resolveRecipients },
        },
        runId: 1,
        campaignId: 2,
        userId: 3,
        workspaceOwnerId: 3,
        node: { id: 4152 },
        config,
        nodeOutputs: {},
        lastOutputItems,
        ensureRunStillRunning: async () => {},
      },
    };
  };

  it('telegram_groups -> rows lấy đúng từ recipientKeys (danh sách tĩnh, như manual)', async () => {
    const groups = [
      { recipientKey: '-1001', display: 'Nhóm A' },
      { recipientKey: '-1002', display: 'Nhóm B' },
      { recipientKey: '  ', display: 'rỗng' },
    ];
    const { ctx, resolveRecipients } = buildCtx({ recipientSource: 'telegram_groups', recipientKeys: groups }, [{ recipientKey: 'x' }]);
    await runAdapterSendNode(ctx).catch(() => {});
    expect(resolveRecipients).toHaveBeenCalledTimes(1);
    expect(resolveRecipients.mock.calls[0][0].rows).toEqual([groups[0], groups[1]]);
  });

  it('nguồn lạ vẫn rơi về lastOutputItems như cũ', async () => {
    const last = [{ recipientKey: '123' }];
    const { ctx, resolveRecipients } = buildCtx({ recipientSource: 'nguon_la', recipientKeys: [{ recipientKey: '-1' }] }, last);
    await runAdapterSendNode(ctx).catch(() => {});
    expect(resolveRecipients.mock.calls[0][0].rows).toBe(last);
  });
});

describe('campaignChannelRunner.runAdapterSendNode — PLAN_GIAO_TK_TG_WA H2: phạm vi tài khoản của người kích hoạt', () => {
  const buildCtx = (extra = {}) => {
    const resolveAccount = jest.fn(async () => ({ accountKey: '7' }));
    return {
      resolveAccount,
      ctx: {
        descriptor: { key: 'telegram', adapter: { resolveAccount, resolveRecipients: async () => [] } },
        runId: 1,
        campaignId: 2,
        userId: 3,
        workspaceOwnerId: 3,
        node: { id: 4152 },
        config: { recipientSource: 'telegram_conversations', steps: [{ message: 'hi' }] },
        nodeOutputs: {},
        lastOutputItems: [],
        ensureRunStillRunning: async () => {},
        ...extra,
      },
    };
  };

  it('chuyển nguyên accessibleChannelRefs xuống adapter.resolveAccount (chốt chung của tầng gửi)', async () => {
    const refs = { telegram: ['7'], whatsapp_baileys: [] };
    const { ctx, resolveAccount } = buildCtx({ accessibleChannelRefs: refs });
    await runAdapterSendNode(ctx).catch(() => {});
    expect(resolveAccount).toHaveBeenCalledTimes(1);
    expect(resolveAccount.mock.calls[0][0].accessibleChannelRefs).toBe(refs);
  });

  it('lỗi 403 CHANNEL_ACCOUNT_NOT_ASSIGNED của adapter được ném nguyên, KHÔNG gọi resolveRecipients', async () => {
    const resolveRecipients = jest.fn(async () => []);
    const notAssigned = Object.assign(new Error('Tài khoản Telegram này chưa được giao cho bạn.'), { status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    const ctx = {
      descriptor: { key: 'telegram', adapter: { resolveAccount: async () => { throw notAssigned; }, resolveRecipients } },
      runId: 1, campaignId: 2, userId: 3, workspaceOwnerId: 3, node: { id: 1 }, config: {}, nodeOutputs: {}, lastOutputItems: [],
      ensureRunStillRunning: async () => {},
      accessibleChannelRefs: { telegram: [], whatsapp_baileys: [] },
    };
    await expect(runAdapterSendNode(ctx)).rejects.toBe(notAssigned);
    expect(resolveRecipients).not.toHaveBeenCalled();
  });
});
