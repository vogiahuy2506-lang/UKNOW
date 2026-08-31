import { describe, expect, it } from '@jest/globals';
import { safeMetadataTimestampSql } from '../metadataTimestampSql.util.js';

describe('safeMetadataTimestampSql', () => {
  it('builds a guarded parser instead of directly casting JSON text', () => {
    const sql = safeMetadataTimestampSql("crs.meta->>'nextDueAt'");

    expect(sql).toContain('make_timestamptz');
    expect(sql).toContain('CASE');
    expect(sql).toContain('TRIM(COALESCE(crs.meta->>\'nextDueAt\', \'\'))');
    expect(sql).not.toContain("(crs.meta->>'nextDueAt')::timestamptz");
    expect(sql).toContain("substring(TRIM(COALESCE(crs.meta->>'nextDueAt', '')) FROM 6 FOR 2)");
  });

  it('requires a source SQL expression', () => {
    expect(() => safeMetadataTimestampSql('')).toThrow('requires a non-empty SQL expression');
  });
});
