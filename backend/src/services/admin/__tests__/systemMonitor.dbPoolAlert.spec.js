import { describe, it, expect, jest } from '@jest/globals';

// Không để unit test chạm DB/Redis thật khi import service.
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { pool: { options: { max: 20 }, totalCount: 0, idleCount: 0, waitingCount: 0 } },
}));
jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({
  default: {
    getRedisStats: jest.fn().mockResolvedValue({ available: false }),
    getQueueMetrics: jest.fn().mockResolvedValue(null),
  },
}));
jest.unstable_mockModule('../../../middleware/domainResolver.js', () => ({
  getDomainResolverCacheStats: jest.fn(() => ({})),
}));
jest.unstable_mockModule('../../../utils/storageCapacity.util.js', () => ({
  getStorageCapacityPolicy: jest.fn(() => ({ warningPercent: 80, criticalPercent: 90 })),
  getStorageCapacityState: jest.fn(() => 'ok'),
  getStorageCapacitySummary: jest.fn().mockResolvedValue({ readable: true }),
  getStoragePaths: jest.fn(() => ({})),
}));

const { getDbPoolStats, buildDbPoolAlerts } = await import('../systemMonitor.service.js');

const pool = ({ max = 25, total, idle, waiting = 0 }) => ({
  options: { max }, totalCount: total, idleCount: idle, waitingCount: waiting,
});

describe('DB pool — cảnh báo theo kết nối ĐANG BẬN, không theo tổng kết nối mở', () => {
  it('production 11/10: 21/25 mở nhưng 21 rảnh, 0 chờ → KHÔNG cảnh báo', () => {
    const stats = getDbPoolStats(pool({ total: 21, idle: 21 }));
    expect(stats).toMatchObject({ total: 21, idle: 21, busy: 0, busyPercent: 0, percent: 84 });
    expect(buildDbPoolAlerts(stats)).toEqual([]);
  });

  it('19/25 đang bận (76%) → warning', () => {
    const alerts = buildDbPoolAlerts(getDbPoolStats(pool({ total: 20, idle: 1 })));
    expect(alerts).toEqual([
      { level: 'warning', code: 'DB_POOL_WARNING', message: 'DB pool 19/25 busy, 0 waiting' },
    ]);
  });

  it('18/25 đang bận (72%) → chưa cảnh báo', () => {
    expect(buildDbPoolAlerts(getDbPoolStats(pool({ total: 25, idle: 7 })))).toEqual([]);
  });

  it('bận hết + có hàng chờ → critical, thông điệp nêu số đang chờ', () => {
    const alerts = buildDbPoolAlerts(getDbPoolStats(pool({ total: 25, idle: 0, waiting: 3 })));
    expect(alerts).toEqual([
      { level: 'critical', code: 'DB_POOL_HIGH', message: 'DB pool 25/25 busy, 3 waiting' },
    ]);
  });

  it('23/25 đang bận (92%) → critical', () => {
    expect(buildDbPoolAlerts(getDbPoolStats(pool({ total: 23, idle: 0 })))[0].code).toBe('DB_POOL_HIGH');
  });

  it('pool không đọc được → không cảnh báo', () => {
    const broken = { get options() { throw new Error('boom'); } };
    const stats = getDbPoolStats(broken);
    expect(stats.available).toBe(false);
    expect(buildDbPoolAlerts(stats)).toEqual([]);
  });
});
