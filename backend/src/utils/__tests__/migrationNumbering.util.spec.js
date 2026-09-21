import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

/**
 * Only enforce unique numeric prefixes from this floor upward.
 * Older duplicates are grandfathered — renaming already-applied files is dangerous.
 * See PLAN_SCHEMA_DRIFT.md S-3.
 *
 * Floor is 92, not 94: 091 is already duplicated across branches
 * (091_voucher_pending_and_code_reuse.sql here, 091_security_hardening_p0_fixes.sql
 * on the security branch — both already applied to the shared test DB, so neither
 * can be renamed). 092+ is where new work lands and must stay unique.
 */
const ENFORCE_FROM_PREFIX = 92;

/**
 * Historical duplicate prefixes (do not rename). Documented so future readers
 * don't treat them as accidental omissions from the uniqueness rule.
 *
 * 91 is listed ahead of the merge: this branch carries only one 091 file today,
 * so the assertion below is a subset check rather than an exact match.
 */
const GRANDFATHERED_DUPLICATE_PREFIXES = Object.freeze([
  18, 19, 21, 28, 32, 33, 34, 35, 40, 55, 58, 64, 65, 66, 73, 91,
  // 50: `050_create_telegram_accounts.sql` (fe86e428, 11/09/2026) bị đánh nhầm số — đúng ra là
  // 205. Không đổi tên được: file đã nằm trên origin/main, chốt append-only
  // (migrationSafety.util.js — D/R đều là vi phạm, chỉ có cửa thoát cho sửa nội dung). File chưa
  // từng chạy ở đâu (deploy backend của fe86e428 đỏ trước bước migrate), runner sắp theo tên nên
  // nó chạy ngay trước 050_remove_landing_templates.sql — CREATE TABLE IF NOT EXISTS, không đụng
  // bảng cũ, vô hại. Số 205 trở đi dùng cho migration mới.
  50,
]);

/**
 * Số trùng TỪ ngưỡng enforce trở lên mà không gỡ được — ghim ĐÚNG cặp file, không phải cả con số:
 * thêm một file 231 thứ ba, hay bất kỳ số trùng nào khác, vẫn đỏ.
 *
 * 231: `231_campaign_schedules_unique_enabled.sql` (c0e75db9, 21/09/2026 14:16 — ĐÃ chạy trên production)
 * và `231_facebook_channel_connections.sql` (62204480, cùng ngày 16:48) được hai người đánh số song song.
 * Không đổi tên được file nào: cả hai đã nằm trên origin/main, mà chốt append-only
 * (migrationSafety.util.js) coi D/R là vi phạm, không có cửa thoát. Runner sắp theo TÊN FILE nên thứ tự
 * vẫn tất định (campaign_… trước facebook_…), hai file đụng hai bảng khác nhau, không phụ thuộc nhau.
 * Migration mới dùng số 234 trở đi.
 */
const PINNED_DUPLICATES_ABOVE_FLOOR = Object.freeze({
  231: ['231_campaign_schedules_unique_enabled.sql', '231_facebook_channel_connections.sql'],
});

/** SQL files without NNN_ prefix — allowlist only. */
const ALLOWLISTED_UNPREFIXED = Object.freeze(['custom_chatbot_chunks.sql']);

const PREFIX_RE = /^(\d{3})_.+\.sql$/;

describe('migration numbering (PLAN_SCHEMA_DRIFT S-3)', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  it('mọi file .sql có tiền tố NNN_ trừ allowlist', () => {
    const unprefixed = files.filter((f) => !PREFIX_RE.test(f) && !ALLOWLISTED_UNPREFIXED.includes(f));
    expect(unprefixed).toEqual([]);
  });

  it(`không có số migration trùng từ ${String(ENFORCE_FROM_PREFIX).padStart(3, '0')} trở đi`, () => {
    const byPrefix = new Map();
    for (const file of files) {
      const match = file.match(PREFIX_RE);
      if (!match) continue;
      const prefix = Number.parseInt(match[1], 10);
      if (prefix < ENFORCE_FROM_PREFIX) continue;
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push(file);
    }

    const duplicates = [...byPrefix.entries()]
      .filter(([, names]) => names.length > 1)
      .filter(([prefix, names]) => {
        const pinned = PINNED_DUPLICATES_ABOVE_FLOOR[prefix];
        return !pinned || JSON.stringify([...names].sort()) !== JSON.stringify([...pinned].sort());
      })
      .map(([prefix, names]) => `${String(prefix).padStart(3, '0')}: ${names.join(', ')}`);

    expect(duplicates).toEqual([]);
  });

  it('cặp trùng số đã ghim vẫn còn đúng hai file đó (gỡ được thì xoá khỏi danh sách ghim)', () => {
    for (const [prefix, pinned] of Object.entries(PINNED_DUPLICATES_ABOVE_FLOOR)) {
      const actual = files.filter((f) => f.startsWith(`${String(prefix).padStart(3, '0')}_`)).sort();
      expect(actual).toEqual([...pinned].sort());
    }
  });

  it('mọi số trùng dưới ngưỡng enforce đều nằm trong grandfather list', () => {
    const byPrefix = new Map();
    for (const file of files) {
      const match = file.match(PREFIX_RE);
      if (!match) continue;
      const prefix = Number.parseInt(match[1], 10);
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push(file);
    }

    const actualDuplicates = [...byPrefix.entries()]
      .filter(([prefix, names]) => prefix < ENFORCE_FROM_PREFIX && names.length > 1)
      .map(([prefix]) => prefix)
      .sort((a, b) => a - b);

    const unlisted = actualDuplicates.filter(
      (prefix) => !GRANDFATHERED_DUPLICATE_PREFIXES.includes(prefix)
    );
    expect(unlisted).toEqual([]);
  });
});
