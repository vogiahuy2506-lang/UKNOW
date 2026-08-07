import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  markAccountRegistered,
  isAccountRegistered,
  unmarkAccountRegistered,
  removeAccount,
  listRegisteredAccounts,
} from '../zaloAccountRegistry.service.js';

describe('zaloAccountRegistry', () => {
  beforeEach(() => {
    for (const id of listRegisteredAccounts()) {
      removeAccount(id);
    }
  });

  it('unmarkAccountRegistered allows re-bind after session clear', () => {
    markAccountRegistered(42);
    expect(isAccountRegistered(42)).toBe(true);
    unmarkAccountRegistered(42);
    expect(isAccountRegistered(42)).toBe(false);
  });
});
