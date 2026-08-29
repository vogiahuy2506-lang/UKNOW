import { describe, expect, it, beforeEach } from '@jest/globals';
import zaloPersonalInboxService from '../zaloInbox.service.js';

describe('zaloInbox cache & LRU isolation', () => {
  beforeEach(() => {
    zaloPersonalInboxService._groupNameCache.clear();
    zaloPersonalInboxService._userProfileCache.clear();
    zaloPersonalInboxService.zaloSettingCache.clear();
  });

  it('stores group names and user profiles in isolated LRU caches with accountId prefix', () => {
    zaloPersonalInboxService._groupNameCache.set('acc_1:group:g100', 'Group Alpha');
    zaloPersonalInboxService._userProfileCache.set('acc_1:user:u200', { displayName: 'Nguyen Van A' });

    expect(zaloPersonalInboxService._groupNameCache.get('acc_1:group:g100')).toBe('Group Alpha');
    expect(zaloPersonalInboxService._userProfileCache.get('acc_1:user:u200')).toEqual({ displayName: 'Nguyen Van A' });

    // Isolation check: group cache doesn't have user key and vice versa
    expect(zaloPersonalInboxService._groupNameCache.get('acc_1:user:u200')).toBeNull();
    expect(zaloPersonalInboxService._userProfileCache.get('acc_1:group:g100')).toBeNull();
  });

  it('clears group names and user profiles for the forgotten account only', () => {
    // Account 1 data
    zaloPersonalInboxService._groupNameCache.set('acc_1:group:g1', 'Group 1');
    zaloPersonalInboxService._groupNameCache.set('acc_1:group:g2', 'Group 2');
    zaloPersonalInboxService._userProfileCache.set('acc_1:user:u1', { displayName: 'User 1' });
    zaloPersonalInboxService.zaloSettingCache.set('user123_acc_1', 'setting_1');

    // Account 2 data
    zaloPersonalInboxService._groupNameCache.set('acc_2:group:g3', 'Group 3');
    zaloPersonalInboxService._userProfileCache.set('acc_2:user:u2', { displayName: 'User 2' });
    zaloPersonalInboxService.zaloSettingCache.set('user123_acc_2', 'setting_2');

    // Forget Account 1
    zaloPersonalInboxService.forgetAccount('user123', 'acc_1');

    // Account 1 entries are cleared
    expect(zaloPersonalInboxService._groupNameCache.get('acc_1:group:g1')).toBeNull();
    expect(zaloPersonalInboxService._groupNameCache.get('acc_1:group:g2')).toBeNull();
    expect(zaloPersonalInboxService._userProfileCache.get('acc_1:user:u1')).toBeNull();
    expect(zaloPersonalInboxService.zaloSettingCache.has('user123_acc_1')).toBe(false);

    // Account 2 entries remain intact
    expect(zaloPersonalInboxService._groupNameCache.get('acc_2:group:g3')).toBe('Group 3');
    expect(zaloPersonalInboxService._userProfileCache.get('acc_2:user:u2')).toEqual({ displayName: 'User 2' });
    expect(zaloPersonalInboxService.zaloSettingCache.has('user123_acc_2')).toBe(true);
  });

  it('LRUCache evicts oldest items when max size is exceeded', () => {
    const customCache = new (zaloPersonalInboxService._groupNameCache.constructor)(3, 60000);
    customCache.set('k1', 'v1');
    customCache.set('k2', 'v2');
    customCache.set('k3', 'v3');
    expect(customCache.size).toBe(3);

    // Add 4th item -> k1 is evicted
    customCache.set('k4', 'v4');
    expect(customCache.size).toBe(3);
    expect(customCache.get('k1')).toBeNull();
    expect(customCache.get('k2')).toBe('v2');
    expect(customCache.get('k4')).toBe('v4');
  });
});
