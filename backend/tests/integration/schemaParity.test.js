/**
 * Schema parity guards (PLAN_SCHEMA_DRIFT S-2).
 * Uses shared checkCoreSchema — same logic as `npm run check:schema` (S-5).
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { checkCoreSchema } from '../../src/utils/coreSchemaCheck.util.js';

describe('schema parity — live test DB (S-2)', () => {
  beforeAll(() => {
    createApp();
  });

  it('core schema matches expected (092/093)', async () => {
    const result = await checkCoreSchema(db);
    if (result.warnings.length) {
      // eslint-disable-next-line no-console
      console.warn('[schemaParity] warnings:', result.warnings);
    }
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
