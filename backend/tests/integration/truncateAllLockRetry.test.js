import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll } from './helpers/db.js';

let lockHolder;

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  if (!lockHolder) return;
  await lockHolder.query('ROLLBACK').catch(() => {});
  lockHolder.release();
  lockHolder = null;
});

describe('truncateAll integration cleanup', () => {
  it('retries a short-lived conflicting table lock instead of timing out the Jest hook', async () => {
    lockHolder = await db.getClient();
    await lockHolder.query('BEGIN');
    await lockHolder.query('LOCK TABLE users IN ACCESS SHARE MODE');

    const releaseLock = new Promise((resolve, reject) => {
      setTimeout(() => {
        lockHolder.query('COMMIT')
          .then(() => {
            lockHolder.release();
            lockHolder = null;
            resolve();
          })
          .catch(reject);
      }, 1200);
    });

    await expect(truncateAll()).resolves.toBeUndefined();
    await releaseLock;
  });
});
