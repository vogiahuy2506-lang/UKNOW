import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * verifyCodeWithAttemptLimit — kiểm mã email + đếm lượt sai trong một câu UPDATE.
 * Hành vi SQL thật (khoá hàng, CASE) được canh ở tests/integration/auth.test.js; ở đây canh
 * tham số, các điều kiện bắt buộc trong câu lệnh và cách map kết quả.
 */

const mockQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { default: verificationRepository } = await import('../verification.repository.js');

describe('verification.repository — verifyCodeWithAttemptLimit', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const input = { email: 'A@Test.local', code: '123456', type: 'email_verification', maxAttempts: 5 };

  /** Giá trị tham số mà placeholder `$n` (bắt bởi nhóm 1 của regex) trỏ tới — MỌI lần xuất hiện. */
  function paramsFor(sql, params, regex) {
    const found = [...sql.matchAll(regex)].map((m) => params[Number(m[1]) - 1]);
    expect(found.length).toBeGreaterThan(0);
    return [...new Set(found)];
  }

  it('mỗi placeholder trỏ đúng tham số (email / mã / loại / trần)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await verificationRepository.verifyCodeWithAttemptLimit(input);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(paramsFor(sql, params, /LOWER\(\$(\d)::text\)/g)).toEqual(['A@Test.local']);
    expect(paramsFor(sql, params, /vc\.code (?:=|<>) \$(\d)::text/g)).toEqual(['123456']);
    expect(paramsFor(sql, params, /\btype = \$(\d)::text/g)).toEqual(['email_verification']);
    expect(paramsFor(sql, params, /\$(\d)::int/g)).toEqual([5]);
  });

  it('câu lệnh chỉ chạm mã còn hiệu lực mới nhất và chặn khi attempts đã chạm trần', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await verificationRepository.verifyCodeWithAttemptLimit(input);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/^\s*UPDATE verification_codes/);
    expect(sql).toMatch(/ORDER BY created_at DESC\s+LIMIT 1/);
    expect(sql).toMatch(/vc\.attempts < \$4::int/);
    expect(sql).toMatch(/vc\.is_used = FALSE/);
    expect(sql).toMatch(/vc\.expires_at > NOW\(\)/);
    // Sai mã: cộng attempts; chạm trần thì mã chết
    expect(sql).toMatch(/ELSE vc\.attempts \+ 1 END/);
    expect(sql).toMatch(/vc\.attempts \+ 1 >= \$4::int THEN TRUE/);
  });

  it('đúng mã → trả bản ghi (bỏ cột phụ code_matched)', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 3, email: 'a@test.local', code: '123456', attempts: 2, is_used: false, code_matched: true }],
    });

    const record = await verificationRepository.verifyCodeWithAttemptLimit(input);

    expect(record).toEqual({ id: 3, email: 'a@test.local', code: '123456', attempts: 2, is_used: false });
  });

  it('sai mã (hàng được cập nhật nhưng code_matched = false) → null', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 3, attempts: 5, is_used: true, code_matched: false }],
    });

    await expect(verificationRepository.verifyCodeWithAttemptLimit(input)).resolves.toBeNull();
  });

  it('không có mã còn hiệu lực / đã hết lượt (không hàng nào) → null', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await expect(verificationRepository.verifyCodeWithAttemptLimit(input)).resolves.toBeNull();
  });
});
