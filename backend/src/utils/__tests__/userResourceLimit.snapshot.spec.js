/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-3 — getResourceUsageSnapshot: "đã dùng / trần" đọc-không-khoá cho
 * trang Thanh toán, phải BẰNG số cổng tạo mới (checkUserResourceLimit / enforceResourceLimitTx) dùng để chặn.
 * Unit test ghim hình dạng kết quả, phép cộng slot mua thêm và cách xử lý lỗi từng phần; số đếm thật trên bảng thật
 * (và so sánh trực tiếp với checkUserResourceLimit) do integration profileUsageSnapshot.test.js kiểm.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockQuery = jest.fn();
const sumActiveTopupGrants = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));
jest.unstable_mockModule('../../repositories/payment/topup.repository.js', () => ({
  sumActiveTopupGrants,
  findExpiringUnrenewedGrants: jest.fn(),
}));

const { getResourceUsageSnapshot } = await import('../userResourceLimit.util.js');

/** Hàng `users` mà getUserLimitRow đọc (các cột max_* của chủ tài khoản). */
let limitRow;
/** Số đếm theo tên bảng (đọc từ câu `SELECT COUNT(*) … FROM <bảng>` của countResourceForUser). */
let countsByTable;

function installDb() {
  mockQuery.mockImplementation(async (sql) => {
    const text = String(sql);
    if (/FROM users/.test(text)) return { rows: limitRow ? [limitRow] : [] };
    const table = /FROM\s+(\w+)/.exec(text)?.[1];
    if (table && table in countsByTable) {
      const value = countsByTable[table];
      if (value instanceof Error) throw value;
      return { rows: [{ total: value }] };
    }
    throw new Error(`unexpected query: ${text.slice(0, 80)}`);
  });
}

let errorSpy;

beforeEach(() => {
  mockQuery.mockReset();
  sumActiveTopupGrants.mockReset();
  sumActiveTopupGrants.mockResolvedValue(0);
  limitRow = {
    max_landing_pages: 5,
    max_zalo_accounts: null,
    max_email_accounts: 0,
    max_whatsapp_accounts: 2,
    max_telegram_accounts: 3,
  };
  countsByTable = {
    landing_pages: 2,
    zalo_settings: 7,
    email_settings: 0,
    whatsapp_baileys_session_creds: 1,
    telegram_accounts: 3,
  };
  installDb();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

const KEYS = ['landingPages', 'zaloAccounts', 'emailAccounts', 'whatsappAccounts', 'telegramAccounts'];

describe('getResourceUsageSnapshot', () => {
  it('trả { used, limit } cho từng khoá: NULL = không giới hạn (null), 0 giữ nguyên 0, số thường giữ nguyên', async () => {
    const snapshot = await getResourceUsageSnapshot(10, KEYS);

    expect(snapshot).toEqual({
      landingPages: { used: 2, limit: 5 },
      zaloAccounts: { used: 7, limit: null },
      emailAccounts: { used: 0, limit: 0 },
      whatsappAccounts: { used: 1, limit: 2 },
      telegramAccounts: { used: 3, limit: 3 },
    });
  });

  it('trần hiệu lực = trần gốc + slot mua thêm còn hạn (cùng resolveEffectiveLimit với cổng); NULL thì không cộng', async () => {
    sumActiveTopupGrants.mockImplementation(async (_userId, itemKey) => (
      { landing_pages: 3, zalo_accounts: 4, telegram_accounts: 1 }[itemKey] ?? 0
    ));

    const snapshot = await getResourceUsageSnapshot(10, KEYS);

    expect(snapshot.landingPages.limit).toBe(8); // 5 + 3
    expect(snapshot.telegramAccounts.limit).toBe(4); // 3 + 1
    expect(snapshot.zaloAccounts.limit).toBeNull(); // gốc NULL = không giới hạn: mua thêm không đổi nghĩa
    expect(snapshot.emailAccounts.limit).toBe(0); // 0 + 0
    expect(sumActiveTopupGrants).toHaveBeenCalledWith(10, 'landing_pages', expect.anything());
    expect(sumActiveTopupGrants).toHaveBeenCalledWith(10, 'telegram_accounts', expect.anything());
  });

  it('đếm đúng bảng/chủ như cổng: landing theo COALESCE(workspace_owner_id, id_user), WhatsApp theo tiền tố session_key', async () => {
    await getResourceUsageSnapshot(10, ['landingPages', 'whatsappAccounts', 'zaloAccounts']);

    const sqls = mockQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => /FROM landing_pages\s+WHERE COALESCE\(workspace_owner_id, id_user\) = \$1/.test(sql))).toBe(true);
    expect(sqls.some((sql) => /FROM whatsapp_baileys_session_creds\s+WHERE split_part\(session_key, '-', 1\)::bigint = \$1/.test(sql))).toBe(true);
    expect(sqls.some((sql) => /FROM zalo_settings\s+WHERE id_user = \$1/.test(sql))).toBe(true);
  });

  it('CHỈ ĐỌC: không lấy advisory lock, không ghi', async () => {
    await getResourceUsageSnapshot(10, KEYS);

    const sqls = mockQuery.mock.calls.map(([sql]) => String(sql).toLowerCase());
    expect(sqls.some((sql) => sql.includes('advisory'))).toBe(false);
    expect(sqls.some((sql) => /\b(insert|update|delete)\b/.test(sql))).toBe(false);
  });

  it('đọc hàng users MỘT lần cho mọi khoá', async () => {
    await getResourceUsageSnapshot(10, KEYS);

    const userReads = mockQuery.mock.calls.filter(([sql]) => /FROM users/.test(String(sql)));
    expect(userReads).toHaveLength(1);
  });

  it('một tài nguyên đếm lỗi → null cho ĐÚNG nó + log tên; các tài nguyên khác vẫn có số (không 0 giả)', async () => {
    countsByTable.zalo_settings = new Error('zalo_settings down');

    const snapshot = await getResourceUsageSnapshot(10, KEYS);

    expect(snapshot.zaloAccounts).toBeNull();
    expect(snapshot.landingPages).toEqual({ used: 2, limit: 5 });
    expect(snapshot.telegramAccounts).toEqual({ used: 3, limit: 3 });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ resource: 'zaloAccounts', userId: 10, message: 'zalo_settings down' })
    );
  });

  it('không đọc được hàng trần (lỗi DB khác 42703) → mọi khoá null, không ném ra ngoài', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM users/.test(String(sql))) throw new Error('connection reset');
      return { rows: [{ total: 1 }] };
    });

    const snapshot = await getResourceUsageSnapshot(10, ['landingPages', 'zaloAccounts']);

    expect(snapshot).toEqual({ landingPages: null, zaloAccounts: null });
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('thiếu cột trần (42703) → coi như không giới hạn, đúng cách cổng xử lý', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/FROM users/.test(String(sql))) throw Object.assign(new Error('column does not exist'), { code: '42703' });
      return { rows: [{ total: 4 }] };
    });

    const snapshot = await getResourceUsageSnapshot(10, ['landingPages']);

    expect(snapshot).toEqual({ landingPages: { used: 4, limit: null } });
  });

  it('khoá không có trong RESOURCE_LIMIT_MAP là lỗi lập trình → ném ngay, chưa chạy truy vấn nào', async () => {
    await expect(getResourceUsageSnapshot(10, ['landingPages', 'khong_co'])).rejects.toThrow(/Resource key không hợp lệ/);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
