import { describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import recipientLedgerRepository from '../../src/repositories/campaign/recipientLedger.repository.js';
import { safeMetadataTimestampSql } from '../../src/utils/metadataTimestampSql.util.js';

const SAFE_TIMESTAMP_SQL = safeMetadataTimestampSql('samples.raw_value');

describe('safeMetadataTimestampSql — PostgreSQL compatibility', () => {
  it('parses canonical timestamps and turns malformed JSON metadata into NULL without failing the query', async () => {
    const result = await db.query(
      `WITH samples(label, raw_value) AS (
         VALUES
           ('utc', '2026-08-31T08:30:15.123Z'),
           ('offset', '2026-08-31T15:30:15.123+07:00'),
           ('leap_day', '2028-02-29T00:00:00Z'),
           ('no_milliseconds', '2026-08-31T08:30:15Z'),
           ('bad_text', 'not-a-timestamp'),
           ('bad_calendar', '2026-02-29T08:30:15Z'),
           ('bad_month', '2026-99-01T08:30:15Z'),
           ('bad_hour', '2026-08-31T25:30:15Z'),
           ('bad_offset', '2026-08-31T08:30:15+14:01')
       ), parsed AS (
         SELECT label, ${SAFE_TIMESTAMP_SQL} AS parsed_at
         FROM samples
       )
       SELECT
         label,
         CASE
           WHEN parsed_at IS NULL THEN NULL
           ELSE to_char(
             parsed_at AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
           )
         END AS parsed_at
       FROM parsed
       ORDER BY label`
    );

    expect(Object.fromEntries(result.rows.map((row) => [row.label, row.parsed_at]))).toEqual({
      bad_calendar: null,
      bad_hour: null,
      bad_month: null,
      bad_offset: null,
      bad_text: null,
      leap_day: '2028-02-29T00:00:00.000Z',
      no_milliseconds: '2026-08-31T08:30:15.000Z',
      offset: '2026-08-31T08:30:15.123Z',
      utc: '2026-08-31T08:30:15.123Z',
    });
  });

  it('keeps the recipient-ledger aggregate query executable', async () => {
    const result = await recipientLedgerRepository.countPendingDue(-1);

    expect(Number(result.pending_count)).toBe(0);
    expect(Number(result.pending_without_future_due)).toBe(0);
    expect(Number(result.pending_with_retry_meta)).toBe(0);
    expect(result.next_due_at).toBeNull();
  });
});
