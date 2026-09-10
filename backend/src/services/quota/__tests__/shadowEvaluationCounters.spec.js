import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getShadowMismatchMetrics,
  recordShadowEvaluation,
  resetShadowMismatchMetrics,
} from '../sendQuotaReservation.service.js';

/**
 * Bộ đếm shadow phải trả lời được câu hỏi quyết định trước khi bật `enforce`:
 * **ranh giới hạn mức đã thật sự bị chạm hay chưa.**
 *
 * Trước 10/09/2026 bộ đếm chỉ có `total` và `mismatches`. Đo production hôm đó ra
 * `total: 130, mismatches: 0` — con số trông như bằng chứng tốt, nhưng nó KHÔNG phân biệt được
 * hai tình huống hoàn toàn khác nhau:
 *
 *   (a) hai luật gặp ranh giới nhiều lần và lần nào cũng khớp  → đủ căn cứ bật enforce
 *   (b) không ai chạm trần nên cả hai luôn trả cho-phép        → chưa kiểm được gì ở chỗ khó
 *
 * Hai luật chỉ có thể lệch nhau khi ít nhất một bên nói "từ chối". Nếu chưa từng có lượt từ chối
 * nào, `mismatches: 0` là khớp nhau một cách tầm thường. `both_denied` là bộ đếm duy nhất tách
 * được (a) khỏi (b).
 *
 * Đây cũng là lần thứ ba trong cùng đợt rà soát mà một phép đo "0" hoá ra rỗng: lần đầu grep
 * thiếu `2>&1` nên không bao giờ khớp stderr, lần hai container bị tạo mới mỗi deploy nên log cũ
 * mất, lần ba là chính chỗ này.
 */
describe('recordShadowEvaluation — bộ đếm phải tách được "khớp ở ranh giới" khỏi "chưa chạm ranh giới"', () => {
  beforeEach(() => {
    resetShadowMismatchMetrics();
  });

  it('cả hai cho phép → both_allowed, không phải both_denied', () => {
    recordShadowEvaluation({ legacyAllowed: true, atomicAllowed: true });

    const m = getShadowMismatchMetrics();
    expect(m.total).toBe(1);
    expect(m.both_allowed).toBe(1);
    expect(m.both_denied).toBe(0);
    expect(m.mismatches).toBe(0);
  });

  it('cả hai TỪ CHỐI → both_denied tăng; đây là lượt duy nhất chứng minh ranh giới bị chạm', () => {
    recordShadowEvaluation({ legacyAllowed: false, atomicAllowed: false });

    const m = getShadowMismatchMetrics();
    expect(m.total).toBe(1);
    expect(m.both_denied).toBe(1);
    expect(m.both_allowed).toBe(0);
    // Khớp nhau nên KHÔNG phải mismatch — nhưng vẫn phải đếm riêng được.
    expect(m.mismatches).toBe(0);
  });

  it('luật cũ cho phép, luật mới từ chối → mismatch có hướng, không tính vào hai bộ đếm đồng thuận', () => {
    recordShadowEvaluation({ legacyAllowed: true, atomicAllowed: false });

    const m = getShadowMismatchMetrics();
    expect(m.mismatches).toBe(1);
    expect(m.legacy_allow_atomic_deny).toBe(1);
    expect(m.legacy_deny_atomic_allow).toBe(0);
    expect(m.both_allowed).toBe(0);
    expect(m.both_denied).toBe(0);
  });

  it('luật cũ từ chối, luật mới cho phép → mismatch hướng còn lại', () => {
    recordShadowEvaluation({ legacyAllowed: false, atomicAllowed: true });

    const m = getShadowMismatchMetrics();
    expect(m.mismatches).toBe(1);
    expect(m.legacy_deny_atomic_allow).toBe(1);
    expect(m.legacy_allow_atomic_deny).toBe(0);
    expect(m.both_denied).toBe(0);
  });

  it('bất biến both_allowed + both_denied + mismatches === total, trên chuỗi trộn lẫn', () => {
    const outcomes = [
      [true, true], [true, true], [true, true],
      [false, false], [false, false],
      [true, false],
      [false, true],
      [true, true],
    ];
    for (const [legacyAllowed, atomicAllowed] of outcomes) {
      recordShadowEvaluation({ legacyAllowed, atomicAllowed });
    }

    const m = getShadowMismatchMetrics();
    expect(m.total).toBe(outcomes.length);
    expect(m.both_allowed).toBe(4);
    expect(m.both_denied).toBe(2);
    expect(m.mismatches).toBe(2);
    expect(m.both_allowed + m.both_denied + m.mismatches).toBe(m.total);
  });

  it('lỗi hạ tầng phía luật mới (không status hoặc 5xx) đếm riêng, không nuốt vào both_denied', () => {
    const infraErr = new Error('connection terminated unexpectedly');
    recordShadowEvaluation({ legacyAllowed: true, atomicAllowed: false, atomicError: infraErr });

    const m = getShadowMismatchMetrics();
    expect(m.atomic_candidate_error).toBe(1);
    expect(m.legacy_allow_atomic_deny).toBe(1);
    expect(m.both_denied).toBe(0);
  });

  it('từ chối vì hạn mức (status 403) KHÔNG bị tính là lỗi hạ tầng', () => {
    const limitErr = new Error('Đã đạt giới hạn tổng tin nhắn trong kỳ');
    limitErr.status = 403;
    recordShadowEvaluation({ legacyAllowed: false, atomicAllowed: false, atomicError: limitErr });

    const m = getShadowMismatchMetrics();
    expect(m.atomic_candidate_error).toBe(0);
    expect(m.both_denied).toBe(1);
  });
});

/**
 * Ngày 10/09/2026 một lượt lệch thật xảy ra trên production — legacy từ chối "2/1 email", atomic
 * cho phép — và KHÔNG truy được nguyên nhân, vì dòng log chỉ có:
 *
 *   Shadow mismatch for user 1 (email): legacy=false, atomic=true, error=none
 *
 * Ba thứ thiếu khiến nó vô dụng: không có hạn mức và số đếm mà atomic đọc được (nên không phân
 * biệt "đọc hụt hạn mức" với "đếm hụt lượt gửi"), và `user 1` in ra là `ownerContextId || userId`
 * chứ không phải billing user mà atomic thật sự tính. Tiến trình chết là mất luôn manh mối.
 *
 * Test này ghim những trường đó phải có mặt trong log.
 */
describe('dòng log lệch phải mang đủ số để truy nguyên nhân trong MỘT lần tái hiện', () => {
  let warnSpy;

  beforeEach(() => {
    resetShadowMismatchMetrics();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('in ra billingUserId, planId, dailyLimit và dailyCount của nhánh atomic', () => {
    recordShadowEvaluation({
      legacyAllowed: false,
      atomicAllowed: true,
      userId: 1,
      billingUserId: 1,
      channel: 'email',
      atomicBillingUserId: 77,
      atomicDiag: { billingUserId: 77, planId: 18, dailyLimit: 1, dailyCount: 2 },
      legacyDetail: 'limitType=daily limit=1 count=2 billingUserId=1',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0][0];

    // Vế quyết định: billing user của atomic phải phân biệt được với userId trong ngữ cảnh.
    expect(line).toContain('billingUserId=77');
    expect(line).toContain('planId=18');
    expect(line).toContain('dailyLimit=1');
    expect(line).toContain('dailyCount=2');
    expect(line).toContain('limitType=daily');
    expect(line).toContain('legacy=false');
    expect(line).toContain('atomic=true');
  });

  it('thiếu chẩn đoán thì in "?" chứ không in "undefined" hay ném lỗi', () => {
    recordShadowEvaluation({
      legacyAllowed: true, atomicAllowed: false, userId: 5, channel: 'zalo',
    });

    const line = warnSpy.mock.calls[0][0];
    expect(line).not.toContain('undefined');
    expect(line).toContain('dailyCount=?');
  });

  it('không lệch thì KHÔNG log gì', () => {
    recordShadowEvaluation({ legacyAllowed: true, atomicAllowed: true, userId: 1, channel: 'email' });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
