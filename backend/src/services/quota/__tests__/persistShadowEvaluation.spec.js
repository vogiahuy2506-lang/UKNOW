import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import db from '../../../config/database.js';
import { _clearQuotaCache } from '../../../utils/userSendLimit.util.js';
import { buildDirectReservationKey } from '../sendQuotaKey.service.js';
import {
  classifyShadowEvaluation,
  persistShadowEvaluation,
  _resetPersistShadowWarnThrottle,
  reserveSendQuota,
} from '../sendQuotaReservation.service.js';

/**
 * Dấu vết bền của chế độ shadow (migration 274). Mọi ca mock db.query — không chạm CSDL thật.
 */
describe('classifyShadowEvaluation — bộ 6 cờ dùng chung cho RAM và CSDL', () => {
  const flags = (c) => ({
    isMismatch: c.isMismatch,
    candErr: c.atomicCandidateError,
    lad: c.legacyAllowAtomicDeny,
    lda: c.legacyDenyAtomicAllow,
    ba: c.bothAllowed,
    bd: c.bothDenied,
  });

  it('both_allowed', () => {
    expect(flags(classifyShadowEvaluation({ legacyAllowed: true, atomicAllowed: true })))
      .toEqual({ isMismatch: false, candErr: false, lad: false, lda: false, ba: true, bd: false });
  });
  it('both_denied', () => {
    expect(flags(classifyShadowEvaluation({ legacyAllowed: false, atomicAllowed: false, atomicError: { status: 403 } })))
      .toEqual({ isMismatch: false, candErr: false, lad: false, lda: false, ba: false, bd: true });
  });
  it('luật cũ cho, luật mới từ chối', () => {
    expect(flags(classifyShadowEvaluation({ legacyAllowed: true, atomicAllowed: false })))
      .toEqual({ isMismatch: true, candErr: false, lad: true, lda: false, ba: false, bd: false });
  });
  it('luật cũ từ chối, luật mới cho', () => {
    expect(flags(classifyShadowEvaluation({ legacyAllowed: false, atomicAllowed: true })))
      .toEqual({ isMismatch: true, candErr: false, lad: false, lda: true, ba: false, bd: false });
  });
  it('lỗi hạ tầng (không status / >=500) tính candidate error; 403 và 499 thì không', () => {
    const base = { legacyAllowed: true, atomicAllowed: false };
    expect(classifyShadowEvaluation({ ...base, atomicError: new Error('x') }).atomicCandidateError).toBe(true);
    expect(classifyShadowEvaluation({ ...base, atomicError: { status: 500 } }).atomicCandidateError).toBe(true);
    expect(classifyShadowEvaluation({ ...base, atomicError: { status: 403 } }).atomicCandidateError).toBe(false);
    expect(classifyShadowEvaluation({ ...base, atomicError: { status: 499 } }).atomicCandidateError).toBe(false);
  });
});

describe('persistShadowEvaluation', () => {
  let origQuery;
  let dateNowSpy;
  let warnSpy;

  beforeEach(() => {
    origQuery = db.query;
    db.query = jest.fn().mockResolvedValue({ rows: [] });
    // 23:30 UTC 02/10 = 06:30 VN 03/10 -> vn_day phải là 2026-10-03 (bắt lỗi múi giờ)
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 2, 23, 30, 0));
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    _resetPersistShadowWarnThrottle();
  });

  afterEach(() => {
    db.query = origQuery;
    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('lượt khớp (cả hai cho phép) -> đúng 1 UPSERT, both_allowed=1, vn_day theo giờ VN', async () => {
    await persistShadowEvaluation({ legacyAllowed: true, atomicAllowed: true, channel: 'email', userId: 5 });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO send_quota_shadow_daily');
    expect(sql).toContain('ON CONFLICT (vn_day, channel)');
    // [vn_day, channel, both_allowed, both_denied, lad, lda, candErr]
    expect(params).toEqual(['2026-10-03', 'email', 1, 0, 0, 0, 0]);
  });

  it('lệch legacy=true/atomic=false -> UPSERT lad=1 + 1 INSERT mismatches đủ trường', async () => {
    await persistShadowEvaluation({
      legacyAllowed: true,
      atomicAllowed: false,
      atomicError: new Error('boom'),
      userId: 7,
      billingUserId: 8,
      atomicBillingUserId: 9,
      channel: 'zalo',
      atomicDiag: { planId: 18, dailyLimit: 1, dailyCount: 2 },
      legacyDetail: 'limitType=daily limit=1 count=2 billingUserId=9',
      sourceType: 'campaign',
    });

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][1]).toEqual(['2026-10-03', 'zalo', 0, 0, 1, 0, 1]);
    const [sql2, p2] = db.query.mock.calls[1];
    expect(sql2).toContain('INSERT INTO send_quota_shadow_mismatches');
    expect(p2).toEqual([
      '2026-10-03', 'zalo', 7, 8, 9, true, false,
      'limitType=daily limit=1 count=2 billingUserId=9',
      JSON.stringify({ planId: 18, dailyLimit: 1, dailyCount: 2 }),
      'boom', 'campaign',
    ]);
  });

  it('atomicError.status=403 KHÔNG tính atomic_candidate_error; status undefined thì có', async () => {
    await persistShadowEvaluation({ legacyAllowed: true, atomicAllowed: false, atomicError: { status: 403, message: 'full' }, channel: 'email' });
    expect(db.query.mock.calls[0][1][6]).toBe(0);
    db.query.mockClear();
    await persistShadowEvaluation({ legacyAllowed: true, atomicAllowed: false, atomicError: { message: 'infra' }, channel: 'email' });
    expect(db.query.mock.calls[0][1][6]).toBe(1);
  });

  it('db.query ném -> không ném ra ngoài, console.warn đúng 1 lần dù gọi 5 lần trong 60 giây', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    for (let i = 0; i < 5; i++) {
      await expect(persistShadowEvaluation({ legacyAllowed: true, atomicAllowed: true, channel: 'email' })).resolves.toBeUndefined();
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Không ghi được dấu vết shadow');
  });

  it('db.query không phải hàm -> return, không gọi gì', async () => {
    db.query = undefined;
    await expect(persistShadowEvaluation({ legacyAllowed: true, atomicAllowed: true, channel: 'email' })).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('reserveSendQuota (shadow) không chờ câu ghi dấu vết', () => {
  it('trả về dù db.query của persist treo mãi (không await)', async () => {
    _clearQuotaCache();
    const origQuery = db.query;
    const origGetClient = db.getClient;
    db.query = jest.fn().mockImplementation(() => new Promise(() => {}));
    db.getClient = jest.fn().mockRejectedValueOnce(new Error('candidate connection failed'));
    let timer;
    try {
      const key = buildDirectReservationKey({
        channel: 'email', billingUserId: 1, clientKey: 'persist_no_await', recipient: 'p@test.vn',
      });
      const res = await Promise.race([
        reserveSendQuota(
          { userId: 1, roleCode: 'admin', channel: 'email', quantity: 1, reservationKey: key, requestFingerprint: 'e'.repeat(64) },
          { modeOverride: 'shadow' },
        ),
        new Promise((resolve) => { timer = setTimeout(() => resolve('TIMEOUT'), 1500); }),
      ]);
      expect(res).not.toBe('TIMEOUT');
      expect(res.mode).toBe('shadow');
      // và persist đã thật sự được khởi chạy (câu UPSERT đã được gọi)
      expect(db.query.mock.calls.some(([sql]) => String(sql).includes('send_quota_shadow_daily'))).toBe(true);
    } finally {
      clearTimeout(timer);
      db.query = origQuery;
      db.getClient = origGetClient;
    }
  });
});
