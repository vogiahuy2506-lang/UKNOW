import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  buildLegacyDetail,
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

/**
 * Ngày 11/09/2026, dòng log của một lượt lệch thật in ra:
 *
 *   legacy=true [limitType=? limit=? count=0 billingUserId=1], atomic=false ... (2/1 email)
 *
 * `count=0` KHÔNG phải số đo được — `okResult()` trong userSendLimit.util.js trả
 * `currentCount: 0` và `limit: null` cứng cho MỌI lượt cho phép. Đọc nó như số đếm thật dẫn tới
 * kết luận "luật cũ đếm 0, luật mới đếm 2", và từ đó là cả một giả thuyết sai về lệch đồng hồ
 * giữa Node và Postgres — mất gần một tiếng mới phát hiện.
 *
 * Luật rút ra: một trường chẩn đoán chỉ được in ra khi nó thật sự được ĐO. Trường mặc định cứng
 * phải nói rõ là không biết, vì người đọc log không có cách nào phân biệt hai thứ đó.
 */
describe('buildLegacyDetail — nhánh CHO PHÉP không được in số đếm giả', () => {
  /** Đúng hình dạng okResult() trả về: count 0 và limit null là HẰNG SỐ, không phải phép đo. */
  const OK_SHAPED = {
    allowed: true, limitType: null, limit: null, currentCount: 0, resetAt: null,
    message: null, billingUserId: 1,
  };

  /** Đúng hình dạng denyResult() trả về: ở đây count/limit là số đo thật. */
  const DENY_SHAPED = {
    allowed: false, limitType: 'daily', limit: 1, currentCount: 2, resetAt: new Date(),
    message: 'Đã đạt giới hạn gửi email trong ngày (2/1 email).', billingUserId: 1,
  };

  it('luật cũ cho phép → nói KHÔNG đo được, tuyệt đối không in "count=0"', () => {
    const detail = buildLegacyDetail(OK_SHAPED, null);

    expect(detail).toContain('KHONG do duoc');
    expect(detail).not.toContain('count=0');
    expect(detail).not.toContain('limit=null');
  });

  it('luật cũ TỪ CHỐI → vẫn in đủ limit/count vì lúc đó chúng là số đo thật', () => {
    const detail = buildLegacyDetail(DENY_SHAPED, null);

    expect(detail).toContain('limitType=daily');
    expect(detail).toContain('limit=1');
    expect(detail).toContain('count=2');
    expect(detail).toContain('billingUserId=1');
  });

  it('luật cũ ném lỗi → in nguyên thông điệp lỗi', () => {
    const detail = buildLegacyDetail(null, new Error('DB connection lost'));
    expect(detail).toBe('error=DB connection lost');
  });

  it('không có kết quả lẫn lỗi → null, không dựng chuỗi rỗng gây hiểu nhầm', () => {
    expect(buildLegacyDetail(null, null)).toBeNull();
  });

  it('chuỗi dựng ra đi nguyên vẹn vào dòng log', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      resetShadowMismatchMetrics();
      recordShadowEvaluation({
        legacyAllowed: true,
        atomicAllowed: false,
        userId: 1,
        billingUserId: 1,
        channel: 'email',
        atomicBillingUserId: 1,
        atomicDiag: { billingUserId: 1, planId: 18, dailyLimit: 1, dailyCount: 2 },
        legacyDetail: buildLegacyDetail(OK_SHAPED, null),
      });

      const line = warnSpy.mock.calls[0][0];
      expect(line).toContain('KHONG do duoc');
      expect(line).not.toContain('count=0');
      // Phía atomic vẫn phải có số thật để so — đó mới là bên đo được.
      expect(line).toContain('dailyCount=2');
      expect(line).toContain('dailyLimit=1');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
