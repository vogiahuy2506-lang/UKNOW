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
]);

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
      .map(([prefix, names]) => `${String(prefix).padStart(3, '0')}: ${names.join(', ')}`);

    expect(duplicates).toEqual([]);
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
