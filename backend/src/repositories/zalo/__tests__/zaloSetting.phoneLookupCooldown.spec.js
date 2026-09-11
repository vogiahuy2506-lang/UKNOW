import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2b: hai hàm mới của zaloSetting.repository cho cooldown tra số sống sót qua deploy.
 */

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));
jest.unstable_mockModule('../../../utils/zaloCookieCrypto.util.js', () => ({
  decryptZaloCookieRow: (row) => row,
  encryptZaloCookie: (v) => v,
}));

const { default: repository } = await import('../zaloSetting.repository.js');

describe('zaloSetting.repository — phone lookup cooldown (PR-2b)', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('setPhoneLookupCooldown UPDATE đúng cột, đúng WHERE id = $1', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const untilDate = new Date('2026-09-12T00:00:00.000Z');

    await repository.setPhoneLookupCooldown(501, untilDate);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE\s+zalo_settings/i);
    expect(sql).toMatch(/phone_lookup_cooldown_until\s*=\s*\$2/i);
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\$1/i);
    expect(params).toEqual([501, untilDate]);
  });

  it('listActivePhoneLookupCooldowns SELECT chỉ hàng còn hiệu lực (WHERE ... > NOW())', async () => {
    const rows = [{ id: 501, phone_lookup_cooldown_until: new Date('2026-09-12T00:00:00.000Z') }];
    query.mockResolvedValueOnce({ rows });

    const result = await repository.listActivePhoneLookupCooldowns();

    expect(result).toEqual(rows);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT\s+id,\s*phone_lookup_cooldown_until/i);
    expect(sql).toMatch(/FROM\s+zalo_settings/i);
    expect(sql).toMatch(/phone_lookup_cooldown_until\s*>\s*NOW\(\)/i);
  });
});
