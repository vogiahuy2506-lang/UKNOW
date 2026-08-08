import { describe, it, expect } from 'vitest';
import { getAiBillingBlockState } from '../subscriptionStatus.util.js';

describe('getAiBillingBlockState', () => {
  const billingOk = { isFullyExpired: false };

  it('trả null cho admin', () => {
    expect(getAiBillingBlockState({
      isAdmin: true,
      billingStatus: billingOk,
      aiCredits: { used: 100, limit: 10 },
    })).toBeNull();
  });

  it('trả expired khi gói hết hạn hoàn toàn', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: { isFullyExpired: true },
      aiCredits: { used: 0, limit: 100 },
    })).toEqual({ type: 'expired' });
  });

  it('trả credits khi hết hạn mức gói và ví rỗng', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: billingOk,
      aiCredits: { used: 100, limit: 100 },
      walletRemaining: 0,
    })).toEqual({ type: 'credits' });
  });

  it('không chặn khi hết hạn mức gói nhưng ví còn credit', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: billingOk,
      aiCredits: { used: 100, limit: 100 },
      walletRemaining: 5,
    })).toBeNull();
  });

  it('không chặn khi còn hạn mức gói', () => {
    expect(getAiBillingBlockState({
      isAdmin: false,
      billingStatus: billingOk,
      aiCredits: { used: 50, limit: 100 },
      walletRemaining: 0,
    })).toBeNull();
  });
});
