import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetFiles = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  listRules: jest.fn(),
  lastEventForRule: jest.fn(),
  insertEvent: jest.fn(),
  listAdminAlertEmails: jest.fn(),
}));
jest.unstable_mockModule('../../storage/storageBackend.js', () => ({
  getStorageBackend: () => ({ bucket: { getFiles: mockGetFiles } }),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');
const capacity = await import('../../../utils/storageCapacity.util.js');

const HOUR = 3600 * 1000;
const filesAgo = (...hours) => [[hours.map((h, i) => ({
  name: `db-backups/b${i}.dump`,
  metadata: { timeCreated: new Date(Date.now() - h * HOUR).toISOString() },
}))]][0];

describe('alertEvaluator — db_backup_stale', () => {
  const rule = { code: 'db_backup_stale', thresholdValue: 1, config: { maxAgeHours: 30 } };
  const prev = process.env.STORAGE_BACKEND;
  beforeEach(() => {
    process.env.STORAGE_BACKEND = 'gcs';
    mockGetFiles.mockReset();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = prev;
  });

  it('bản mới nhất 2h → không hit', async () => {
    mockGetFiles.mockResolvedValueOnce(filesAgo(2, 50));
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('bản mới nhất 31h → hit, thông điệp nêu tuổi', async () => {
    mockGetFiles.mockResolvedValueOnce(filesAgo(31, 60));
    const hit = await evaluateRuleForTests(rule);
    expect(hit).not.toBeNull();
    expect(hit.message).toMatch(/31\.0 giờ/);
  });

  it('không có bản nào → hit', async () => {
    mockGetFiles.mockResolvedValueOnce([[]]);
    const hit = await evaluateRuleForTests(rule);
    expect(hit.message).toMatch(/chưa có bản sao lưu/);
  });

  it('GCS lỗi → hit kèm thông điệp lỗi (không nuốt)', async () => {
    mockGetFiles.mockRejectedValueOnce(new Error('boom-gcs'));
    const hit = await evaluateRuleForTests(rule);
    expect(hit.message).toMatch(/boom-gcs/);
  });

  it('STORAGE_BACKEND != gcs → không hit, không gọi GCS', async () => {
    process.env.STORAGE_BACKEND = 'local';
    expect(await evaluateRuleForTests(rule)).toBeNull();
    expect(mockGetFiles).not.toHaveBeenCalled();
  });
});

describe('alertEvaluator — disk_usage_high', () => {
  const rule = { code: 'disk_usage_high', thresholdValue: 1, config: { thresholdPercent: 85 } };
  const reader = (percent) => async () => ({
    filesystem: 'x', mount: '/', total: 100 * 1024 ** 3, used: percent * 1024 ** 3, available: (100 - percent) * 1024 ** 3, percent,
  });
  afterEach(() => capacity.__resetStorageCapacityForTests());

  it('70% → không hit', async () => {
    capacity.__setStorageCapacityReaderForTests(reader(70));
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('90% → hit, nêu % và dung lượng trống', async () => {
    capacity.__setStorageCapacityReaderForTests(reader(90));
    const hit = await evaluateRuleForTests(rule);
    expect(hit).not.toBeNull();
    expect(hit.message).toMatch(/90\.0%/);
    expect(hit.message).toMatch(/10\.0 GB/);
  });

  it('không đọc được đĩa → hit (không im lặng)', async () => {
    capacity.__setStorageCapacityReaderForTests(async () => { throw new Error('df fail'); });
    const hit = await evaluateRuleForTests(rule);
    expect(hit.message).toMatch(/Không đọc được/);
  });
});

describe('seed luật cảnh báo (migration 265 + bootstrap)', () => {
  it('cả hai luật có trong migration và bootstrap, kênh email, cooldown 360 phút', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = process.cwd();
    const migration = fs.readFileSync(path.join(root, 'migrations/265_db_backup_disk_alert_rules.sql'), 'utf8');
    const bootstrap = fs.readFileSync(path.join(root, 'tests/integration/sql/bootstrap.sql'), 'utf8');
    for (const code of ['db_backup_stale', 'disk_usage_high']) {
      expect(migration).toContain(`'${code}'`);
      expect(bootstrap).toContain(`'${code}'`);
    }
    expect((migration.match(/'email', '(?:critical|warning)', 360/g) || []).length).toBe(2);
  });
});
