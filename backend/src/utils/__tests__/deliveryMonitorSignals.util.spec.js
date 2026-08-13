import { describe, expect, it } from '@jest/globals';
import {
  buildZaloSilentDropHourlySql,
  buildZaloSilentDropSignals,
  classifyDeliveryMonitorFailure,
  resolveZaloSilentDropAlertThresholds,
  ZALO_SILENT_DROP_SIGNAL_CODE,
} from '../deliveryMonitorSignals.util.js';
import { ZALO_SEND_NOT_DELIVERED_MARKER, ZALO_SILENT_DROP_LABEL } from '../zaloDispatchDelivery.util.js';

describe('classifyDeliveryMonitorFailure', () => {
  it('empty → unknown', () => {
    expect(classifyDeliveryMonitorFailure('')).toBe('unknown');
    expect(classifyDeliveryMonitorFailure(null)).toBe('unknown');
  });

  it('nhận silent drop trước matcher spam/limit', () => {
    expect(classifyDeliveryMonitorFailure(`${ZALO_SEND_NOT_DELIVERED_MARKER} anti-spam limit`))
      .toBe('zalo_silent_drop');
    expect(classifyDeliveryMonitorFailure(ZALO_SILENT_DROP_LABEL)).toBe('zalo_silent_drop');
    expect(classifyDeliveryMonitorFailure('ZALO_SILENT_DROP')).toBe('zalo_silent_drop');
  });

  it('giữ nhóm lỗi cũ', () => {
    expect(classifyDeliveryMonitorFailure('rate limit exceeded')).toBe('rate_limit');
    expect(classifyDeliveryMonitorFailure('account banned for spam')).toBe('provider_block');
    expect(classifyDeliveryMonitorFailure('ETIMEDOUT')).toBe('network_timeout');
    expect(classifyDeliveryMonitorFailure('session cookie expired')).toBe('account_session');
    expect(classifyDeliveryMonitorFailure('recipient unreachable')).toBe('recipient_invalid');
    expect(classifyDeliveryMonitorFailure('SMTP mail server error')).toBe('email_provider');
    expect(classifyDeliveryMonitorFailure('something else')).toBe('other');
  });
});

describe('resolveZaloSilentDropAlertThresholds', () => {
  it('mặc định 10 attempts / 30% / 50% critical', () => {
    expect(resolveZaloSilentDropAlertThresholds({})).toEqual({
      minAttempts: 10,
      minRate: 0.3,
      criticalRate: 0.5,
      maxSignals: 8,
    });
  });

  it('nhận rate dạng 30 hoặc 0.30', () => {
    expect(resolveZaloSilentDropAlertThresholds({
      ZALO_SILENT_DROP_ALERT_MIN_ATTEMPTS: '8',
      ZALO_SILENT_DROP_ALERT_RATE: '25',
      ZALO_SILENT_DROP_ALERT_CRITICAL_RATE: '0.6',
    })).toMatchObject({ minAttempts: 8, minRate: 0.25, criticalRate: 0.6 });
  });
});

describe('buildZaloSilentDropHourlySql', () => {
  it('admin query không lọc user; user query gắn id_user = $1', () => {
    const adminSql = buildZaloSilentDropHourlySql();
    expect(adminSql).toMatch(/INTERVAL '1 hour'/);
    expect(adminSql).toMatch(/errorCategory/);
    expect(adminSql).toMatch(/account_id IS NOT NULL/);
    expect(adminSql).not.toMatch(/id_user/);

    const userSql = buildZaloSilentDropHourlySql({ userScoped: true });
    expect(userSql).toMatch(/c\.id_user = \$1/);
    expect(userSql).toMatch(/JOIN campaigns/);
  });
});

describe('buildZaloSilentDropSignals', () => {
  const env = {};

  it('không báo khi mẫu nhỏ (1/2, 9/9)', () => {
    expect(buildZaloSilentDropSignals([
      { account_id: 42, account_name: 'A', attempts: 2, silent_drops: 1 },
      { account_id: 7, account_name: 'B', attempts: 9, silent_drops: 9 },
    ], env)).toEqual([]);
  });

  it('cảnh báo khi ≥10 lượt và ≥30%, critical khi ≥50%', () => {
    const signals = buildZaloSilentDropSignals([
      { account_id: 42, account_name: 'MỸ - SHTT', attempts: 10, silent_drops: 3 },
      { account_id: 9, account_name: 'Hot', attempts: 20, silent_drops: 12 },
      { account_id: 3, account_name: 'Low', attempts: 20, silent_drops: 2 },
    ], env);

    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      code: ZALO_SILENT_DROP_SIGNAL_CODE,
      level: 'critical',
      accountId: 9,
      accountName: 'Hot',
      silentDrops: 12,
      attempts: 20,
      value: 60,
    });
    expect(signals[1]).toMatchObject({
      level: 'warning',
      accountId: 42,
      accountName: 'MỸ - SHTT',
      value: 30,
    });
  });

  it('không đưa payload khách hàng; thiếu tên thì fallback #id', () => {
    const [signal] = buildZaloSilentDropSignals([
      { account_id: '15', account_name: '  ', attempts: 10, silent_drops: 5 },
    ], env);
    expect(signal.accountName).toBe('#15');
    expect(JSON.stringify(signal)).not.toMatch(/phone|groupId|msgId/i);
  });

  it('bỏ account_id không hợp lệ', () => {
    expect(buildZaloSilentDropSignals([
      { account_id: null, account_name: 'x', attempts: 20, silent_drops: 10 },
    ], env)).toEqual([]);
  });
});
