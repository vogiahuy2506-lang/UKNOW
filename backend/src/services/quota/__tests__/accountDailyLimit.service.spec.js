/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, Việc 2 — checkAccountDailyLimit.
 * Ca quan trọng nhất: `limit == null` phải rẻ (không chạm DB) — đây là đường mặc định của gần như
 * mọi tài khoản khi PR-1 vừa lên (chưa mở UI đặt giá trị ở PR-4/6).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockCountEmail = jest.fn();
const mockCountZalo = jest.fn();
// `accountDailyLimit.service.js` cũng import `getVnDayBoundaries` từ `sendQuotaReservation.service.js`
// (theo đúng lệnh giao: dùng lại mốc ngày VN, không tự tính lại) — module đó import RẤT nhiều thứ
// khác từ chính `sendQuota.repository.js`. Mock cả module là thay THẨN CẢ file, nên phải khai đủ mọi
// export mà sendQuotaReservation.service.js cần, nếu không ESM báo "does not provide an export
// named …" ngay lúc link. Chỉ 2 hàm đếm tài khoản là cái test này thật sự điều khiển; còn lại là
// jest.fn() rỗng vì getVnDayBoundaries() (hàm thuần) không gọi tới chúng.
jest.unstable_mockModule('../../../repositories/sendQuota.repository.js', () => ({
  countEmailSentTodayByAccount: mockCountEmail,
  countZaloSentTodayByAccount: mockCountZalo,
  acquireWorkspaceQuotaLock: jest.fn(),
  createReservation: jest.fn(),
  findReservationByKey: jest.fn(),
  findReservationById: jest.fn(),
  transitionReservationState: jest.fn(),
  validateReservationKey: jest.fn(),
  validateProviderReference: jest.fn(),
  validateFailureCode: jest.fn(),
  countEmailSentTodayWithLedger: jest.fn(),
  countZaloSentTodayWithLedger: jest.fn(),
  countEmailSentInCycleWithLedger: jest.fn(),
  countZaloSentInCycleWithLedger: jest.fn(),
  countCombinedSentInCycleWithLedger: jest.fn(),
  countEmployeeSentTodayWithLedger: jest.fn(),
  countEmployeeSentInCycleWithLedger: jest.fn(),
  getWorkspacePlanLimits: jest.fn(),
  getEmployeeSendLimits: jest.fn(),
  getWalletAvailableBalance: jest.fn(),
}));

const { checkAccountDailyLimit } = await import('../accountDailyLimit.service.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkAccountDailyLimit — limit == null (không giới hạn)', () => {
  it('trả allowed:true ngay, KHÔNG gọi hàm đếm nào (đường mặc định phải rẻ)', async () => {
    const result = await checkAccountDailyLimit({ channel: 'email', accountId: 5, limit: null });

    expect(result).toEqual({ allowed: true });
    expect(mockCountEmail).not.toHaveBeenCalled();
    expect(mockCountZalo).not.toHaveBeenCalled();
  });

  it('cũng đúng với kênh zalo', async () => {
    const result = await checkAccountDailyLimit({ channel: 'zalo', accountId: 9, limit: null });
    expect(result).toEqual({ allowed: true });
    expect(mockCountZalo).not.toHaveBeenCalled();
  });

  it('limit undefined (chưa truyền) cũng coi như không giới hạn', async () => {
    const result = await checkAccountDailyLimit({ channel: 'email', accountId: 5 });
    expect(result).toEqual({ allowed: true });
    expect(mockCountEmail).not.toHaveBeenCalled();
  });
});

describe('checkAccountDailyLimit — email có giới hạn', () => {
  it('chưa chạm giới hạn → allowed:true, gọi đúng hàm đếm email với accountId', async () => {
    mockCountEmail.mockResolvedValue(50);

    const result = await checkAccountDailyLimit({ channel: 'email', accountId: 5, limit: 100 });

    expect(result).toEqual({ allowed: true });
    expect(mockCountEmail).toHaveBeenCalledTimes(1);
    expect(mockCountEmail.mock.calls[0][1]).toBe(5);
    expect(mockCountZalo).not.toHaveBeenCalled();
  });

  it('đúng bằng giới hạn (currentCount + quantity === limit) → vẫn allowed (biên không bị chặn oan)', async () => {
    mockCountEmail.mockResolvedValue(99);
    const result = await checkAccountDailyLimit({ channel: 'email', accountId: 5, limit: 100 });
    expect(result).toEqual({ allowed: true });
  });

  it('vượt giới hạn → allowed:false kèm limit/currentCount/resetAt', async () => {
    mockCountEmail.mockResolvedValue(100);

    const result = await checkAccountDailyLimit({
      channel: 'email', accountId: 5, limit: 100, now: new Date('2026-09-22T01:30:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(100);
    expect(result.currentCount).toBe(100);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it('quantity > 1: cộng thêm số tin sắp gửi trước khi so với limit', async () => {
    mockCountEmail.mockResolvedValue(95);

    const result = await checkAccountDailyLimit({ channel: 'email', accountId: 5, limit: 100, quantity: 10 });

    expect(result.allowed).toBe(false);
    expect(result.currentCount).toBe(95);
  });
});

describe('checkAccountDailyLimit — zalo có giới hạn', () => {
  it('gọi đúng hàm đếm zalo, không đụng hàm đếm email', async () => {
    mockCountZalo.mockResolvedValue(10);

    const result = await checkAccountDailyLimit({ channel: 'zalo', accountId: 77, limit: 50 });

    expect(result).toEqual({ allowed: true });
    expect(mockCountZalo).toHaveBeenCalledTimes(1);
    expect(mockCountZalo.mock.calls[0][1]).toBe(77);
    expect(mockCountEmail).not.toHaveBeenCalled();
  });

  it('vượt giới hạn zalo → allowed:false', async () => {
    mockCountZalo.mockResolvedValue(50);
    const result = await checkAccountDailyLimit({ channel: 'zalo', accountId: 77, limit: 50 });
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(50);
  });
});

describe('checkAccountDailyLimit — resetAt là ranh giới ngày VN, giống mốc dùng cho hạn mức gói', () => {
  it('08:30 giờ VN (01:30 UTC) ngày 22/09 → resetAt = 17:00 UTC cùng ngày (00:00 VN hôm sau)', async () => {
    mockCountEmail.mockResolvedValue(100);
    const now = new Date('2026-09-22T01:30:00.000Z'); // 08:30 VN

    const result = await checkAccountDailyLimit({ channel: 'email', accountId: 5, limit: 100, now });

    expect(result.resetAt.toISOString()).toBe('2026-09-22T17:00:00.000Z');
  });
});

describe('checkAccountDailyLimit — kênh không hợp lệ', () => {
  it('ném lỗi rõ ràng thay vì gọi nhầm hàm đếm', async () => {
    await expect(checkAccountDailyLimit({ channel: 'telegram', accountId: 1, limit: 10 }))
      .rejects.toThrow(/kênh không hợp lệ/);
    expect(mockCountEmail).not.toHaveBeenCalled();
    expect(mockCountZalo).not.toHaveBeenCalled();
  });
});
