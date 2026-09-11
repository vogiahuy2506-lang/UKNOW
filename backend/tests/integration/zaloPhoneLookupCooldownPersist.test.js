/**
 * PR-2b — migration 202: zalo_settings.phone_lookup_cooldown_until phải là TIMESTAMPTZ.
 *
 * Bẫy đã cắn đúng bảng này: last_connected_at từng là timestamp naive trên production
 * trong khi schema.sql khai TIMESTAMPTZ — app ghi giờ UTC trần, đọc lại lệch 7 tiếng so
 * với cột bên cạnh dù cùng một khoảnh khắc. Cooldown mà lệch 7 tiếng thì vô dụng (có thể
 * hết hạn sớm 7h hoặc trễ 7h so với 00:00 giờ VN thật).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import zaloSettingRepository from '../../src/repositories/zalo/zaloSetting.repository.js';

beforeEach(async () => {
  await truncateAll();
});

describe('migration 202 — zalo_settings.phone_lookup_cooldown_until', () => {
  it('cột tồn tại, đúng kiểu timestamp with time zone', async () => {
    const { rows } = await db.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'zalo_settings' AND column_name = 'phone_lookup_cooldown_until'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('timestamp with time zone');
  });

  it('có index lọc theo cột này (idx_zalo_settings_phone_lookup_cooldown)', async () => {
    const { rows } = await db.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_zalo_settings_phone_lookup_cooldown'`
    );
    expect(rows.length).toBe(1);
  });

  it('ghi một mốc rồi đọc lại bằng SQL trực tiếp — chênh lệch bằng 0, không phải 7 giờ', async () => {
    const user = await createUser({ username: 'pr2b-cooldown-ts' });
    const { rows: inserted } = await db.query(
      `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
       VALUES ($1, true, 'connected', 'Test Zalo')
       RETURNING id`,
      [user.id]
    );
    const accountId = inserted[0].id;
    // Mốc cố định, KHÔNG phụ thuộc "hiện tại" — bài test chỉ quan tâm việc ghi/đọc có bảo
    // toàn đúng khoảnh khắc UTC hay không, không quan tâm cooldown còn hiệu lực hay không.
    const writtenAtMs = Date.UTC(2026, 8, 12, 0, 0, 0, 0);

    await zaloSettingRepository.setPhoneLookupCooldown(accountId, new Date(writtenAtMs));

    const { rows } = await db.query(
      `SELECT phone_lookup_cooldown_until FROM zalo_settings WHERE id = $1`,
      [accountId]
    );
    const readBackMs = new Date(rows[0].phone_lookup_cooldown_until).getTime();
    expect(readBackMs).toBe(writtenAtMs);
  });

  it('listActivePhoneLookupCooldowns() chỉ trả hàng còn hiệu lực (> NOW()), không trả hàng đã hết hạn', async () => {
    const user = await createUser({ username: 'pr2b-cooldown-active' });
    const { rows: inserted } = await db.query(
      `INSERT INTO zalo_settings (id_user, is_active, status, display_name)
       VALUES ($1, true, 'connected', 'Test Zalo 2')
       RETURNING id`,
      [user.id]
    );
    const accountId = inserted[0].id;

    // Set trực tiếp một mốc đã hết hạn (trong quá khứ xa) — không đi qua repository vì
    // setPhoneLookupCooldown chỉ nhận Date do caller tự tính, không tự validate quá khứ/tương lai.
    await db.query(
      `UPDATE zalo_settings SET phone_lookup_cooldown_until = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [accountId]
    );

    const activeExpired = await zaloSettingRepository.listActivePhoneLookupCooldowns();
    expect(activeExpired.find((row) => row.id === accountId)).toBeUndefined();

    await zaloSettingRepository.setPhoneLookupCooldown(accountId, new Date(Date.now() + 3600_000));
    const activeStillOn = await zaloSettingRepository.listActivePhoneLookupCooldowns();
    expect(activeStillOn.find((row) => row.id === accountId)).toBeTruthy();
  });
});
