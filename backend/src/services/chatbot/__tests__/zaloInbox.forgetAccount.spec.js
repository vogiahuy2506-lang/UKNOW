import { describe, expect, it } from '@jest/globals';
import zaloPersonalInboxService from '../zaloInbox.service.js';

describe('zaloInbox.service forgetAccount', () => {
  it('clears zaloSettingCache for user_account and invalidates _accountCache', () => {
    const userId = 10;
    const accountId = 20;
    const cacheKey = `${userId}_${accountId}`;

    zaloPersonalInboxService.zaloSettingCache.set(cacheKey, accountId);
    zaloPersonalInboxService._accountCache.timestamp = Date.now();

    expect(zaloPersonalInboxService.zaloSettingCache.has(cacheKey)).toBe(true);
    expect(zaloPersonalInboxService._accountCache.timestamp).toBeGreaterThan(0);

    zaloPersonalInboxService.forgetAccount(userId, accountId);

    expect(zaloPersonalInboxService.zaloSettingCache.has(cacheKey)).toBe(false);
    expect(zaloPersonalInboxService._accountCache.timestamp).toBe(0);
  });
});
