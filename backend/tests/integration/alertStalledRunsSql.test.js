import { describe, expect, it } from '@jest/globals';
import { metricStalledRuns } from '../../src/repositories/admin/alert.repository.js';

describe('metricStalledRuns — PostgreSQL compatibility', () => {
  it('executes the run-level defer predicate on PostgreSQL', async () => {
    await expect(metricStalledRuns(48)).resolves.toEqual(expect.any(Array));
  });
});
