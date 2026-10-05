import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PR-10 mục 7 (D-15, D-OLD-C4, D-OLD-C24): ba luật cảnh báo đọc `ai_call_events` — bắn ĐÚNG ngưỡng, KHÔNG bắn dưới ngưỡng (ca biên `>` vs `>=` được ghim) —
 * và ngưỡng chỉ có MỘT nguồn (AI_ALERT_DEFAULTS khớp migration 286 + bootstrap). SQL thật của các metric chạy ở tests/integration/aiCallEventsAlerts.test.js.
 */
const mockMetrics = {
  metricAiErrorRate: jest.fn(),
  metricAiErrorBreakdown: jest.fn(),
  metricAiFallbackCount: jest.fn(),
  metricAiUsageWriteFailed: jest.fn(),
  metricAiTokenSpike: jest.fn(),
};

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  ...mockMetrics,
  listRules: jest.fn(async () => []),
  lastEventForRule: jest.fn(async () => null),
  insertEvent: jest.fn(async () => ({ id: 1 })),
}));

const { evaluateRuleForTests, AI_ALERT_DEFAULTS } = await import('../alertEvaluator.service.js');

const errorRule = (extra = {}) => ({ code: 'ai_error_rate_high', thresholdValue: 0.2, windowMinutes: 30, config: { minCalls: 20 }, ...extra });
const fallbackRule = (extra = {}) => ({ code: 'ai_fallback_spike', thresholdValue: 10, windowMinutes: 60, config: {}, ...extra });
const writeRule = (extra = {}) => ({ code: 'ai_usage_write_failed', thresholdValue: 0, windowMinutes: 60, config: {}, ...extra });
const errorRate = (total, failed) => ({ total, failed, rate: total > 0 ? failed / total : 0 });

describe('ai_error_rate_high', () => {
  beforeEach(() => {
    mockMetrics.metricAiErrorRate.mockReset();
    mockMetrics.metricAiErrorBreakdown.mockReset().mockResolvedValue({
      topFeatures: [{ feature: 'chatbot_reply', failed: 4 }],
      topCodes: [{ code: 'AI_PROVIDER_BUSY', failed: 3 }, { code: 'AI_TIMEOUT', failed: 1 }],
    });
  });

  it('đọc đúng cửa sổ của luật (30 phút)', async () => {
    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(0, 0));
    await evaluateRuleForTests(errorRule());
    expect(mockMetrics.metricAiErrorRate).toHaveBeenCalledWith(30);
  });

  it('BIÊN mẫu: 19 lượt (dưới 20) dù lỗi 100% → KHÔNG bắn; đúng 20 lượt thì tính', async () => {
    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(19, 19));
    expect(await evaluateRuleForTests(errorRule())).toBeNull();

    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(20, 20));
    expect(await evaluateRuleForTests(errorRule())).not.toBeNull();
  });

  it('BIÊN tỉ lệ: đúng 20% (4/20) → KHÔNG bắn (chỉ > 20%); 5/20 = 25% → bắn', async () => {
    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(20, 4));
    expect(await evaluateRuleForTests(errorRule())).toBeNull();

    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(20, 5));
    const hit = await evaluateRuleForTests(errorRule());
    expect(hit.measuredValue).toBe(0.25);
    expect(hit.message).toContain('25.0%');
    expect(hit.message).toContain('5/20');
  });

  it('dưới ngưỡng rõ ràng (1/100) → KHÔNG bắn, và KHÔNG tốn truy vấn chi tiết', async () => {
    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(100, 1));
    expect(await evaluateRuleForTests(errorRule())).toBeNull();
    expect(mockMetrics.metricAiErrorBreakdown).not.toHaveBeenCalled();
  });

  it('nội dung cảnh báo nêu tính năng lỗi nhiều nhất + mã lỗi; payload mang chi tiết', async () => {
    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(40, 20));
    const hit = await evaluateRuleForTests(errorRule());
    expect(hit.message).toContain('chatbot_reply (4)');
    expect(hit.message).toContain('AI_PROVIDER_BUSY (3)');
    expect(hit.payload).toMatchObject({ total: 40, failed: 20, windowMinutes: 30, minCalls: 20, topFeatures: [{ feature: 'chatbot_reply', failed: 4 }] });
  });

  it('truy vấn chi tiết hỏng → cảnh báo VẪN bắn (không mất vì phần phụ)', async () => {
    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(40, 20));
    mockMetrics.metricAiErrorBreakdown.mockRejectedValue(new Error('DB chậm'));
    const hit = await evaluateRuleForTests(errorRule());
    expect(hit).not.toBeNull();
    expect(hit.message).not.toContain('nhiều nhất ở');
  });

  it('ngưỡng/cửa sổ/minCalls lấy từ dòng luật; thiếu thì rơi về AI_ALERT_DEFAULTS', async () => {
    mockMetrics.metricAiErrorRate.mockResolvedValue(errorRate(10, 6));
    // luật nới minCalls=10 và ngưỡng 50% → 60% bắn
    expect(await evaluateRuleForTests(errorRule({ thresholdValue: 0.5, windowMinutes: 15, config: { minCalls: 10 } }))).not.toBeNull();
    expect(mockMetrics.metricAiErrorRate).toHaveBeenLastCalledWith(15);

    // luật thiếu hết (null) → mặc định: 10 lượt < 20 → không bắn; cửa sổ mặc định 30
    mockMetrics.metricAiErrorRate.mockClear();
    expect(await evaluateRuleForTests(errorRule({ thresholdValue: null, windowMinutes: null, config: {} }))).toBeNull();
    expect(mockMetrics.metricAiErrorRate).toHaveBeenCalledWith(AI_ALERT_DEFAULTS.ai_error_rate_high.windowMinutes);
  });
});

describe('ai_fallback_spike', () => {
  beforeEach(() => mockMetrics.metricAiFallbackCount.mockReset());

  it('BIÊN: đúng 10 lượt/giờ → KHÔNG bắn; 11 → bắn, nêu model chính hay lỗi', async () => {
    mockMetrics.metricAiFallbackCount.mockResolvedValue({ count: 10, topPrimaryModel: 'gemini-3.5-flash' });
    expect(await evaluateRuleForTests(fallbackRule())).toBeNull();

    mockMetrics.metricAiFallbackCount.mockResolvedValue({ count: 11, topPrimaryModel: 'gemini-3.5-flash' });
    const hit = await evaluateRuleForTests(fallbackRule());
    expect(hit.measuredValue).toBe(11);
    expect(hit.message).toContain('11 lượt');
    expect(hit.message).toContain('gemini-3.5-flash');
    expect(mockMetrics.metricAiFallbackCount).toHaveBeenLastCalledWith(60);
  });

  it('không có lượt dự phòng nào → không bắn', async () => {
    mockMetrics.metricAiFallbackCount.mockResolvedValue({ count: 0, topPrimaryModel: null });
    expect(await evaluateRuleForTests(fallbackRule())).toBeNull();
  });

  it('thiếu ngưỡng ở dòng luật → mặc định 10', async () => {
    mockMetrics.metricAiFallbackCount.mockResolvedValue({ count: 10, topPrimaryModel: null });
    expect(await evaluateRuleForTests(fallbackRule({ thresholdValue: null }))).toBeNull();
    mockMetrics.metricAiFallbackCount.mockResolvedValue({ count: 11, topPrimaryModel: null });
    expect(await evaluateRuleForTests(fallbackRule({ thresholdValue: null }))).not.toBeNull();
  });
});

describe('ai_usage_write_failed', () => {
  beforeEach(() => mockMetrics.metricAiUsageWriteFailed.mockReset());

  it('BIÊN: 0 lần → KHÔNG bắn; đúng 1 lần → bắn (ngưỡng > 0), nêu token đã mất khỏi sổ', async () => {
    mockMetrics.metricAiUsageWriteFailed.mockResolvedValue({ count: 0, lostTokens: 0 });
    expect(await evaluateRuleForTests(writeRule())).toBeNull();

    mockMetrics.metricAiUsageWriteFailed.mockResolvedValue({ count: 1, lostTokens: 12345 });
    const hit = await evaluateRuleForTests(writeRule());
    expect(hit.measuredValue).toBe(1);
    expect(hit.message).toContain('1 lần');
    expect(hit.message).toMatch(/12\.345|12,345/);
    expect(mockMetrics.metricAiUsageWriteFailed).toHaveBeenLastCalledWith(60);
  });
});

describe('ngưỡng chỉ có MỘT nguồn: AI_ALERT_DEFAULTS ↔ migration 286 ↔ bootstrap', () => {
  const root = process.cwd();
  const migration = fs.readFileSync(path.join(root, 'migrations/286_ai_call_events_alert_rules.sql'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(root, 'tests/integration/sql/bootstrap.sql'), 'utf8');

  /** Dòng `value` của MỘT luật trong khối INSERT: threshold, window, channel, severity, cooldown, config. */
  const seedRow = (sql, code) => {
    const at = sql.indexOf(`'${code}'`);
    expect(at).toBeGreaterThan(-1);
    const m = sql.slice(at).match(/\n\s*([0-9.]+),\s*([0-9]+),\s*'email',\s*'(critical|warning)',\s*([0-9]+),\s*\n?\s*'(\{[^']*\})'::jsonb/);
    expect(m).not.toBeNull();
    return { threshold: Number(m[1]), windowMinutes: Number(m[2]), severity: m[3], cooldown: Number(m[4]), config: JSON.parse(m[5]) };
  };

  it.each(['ai_error_rate_high', 'ai_fallback_spike', 'ai_usage_write_failed'])('%s: số trong migration và bootstrap = mặc định trong code', (code) => {
    const defaults = AI_ALERT_DEFAULTS[code];
    for (const sql of [migration, bootstrap]) {
      const row = seedRow(sql, code);
      expect(row.threshold).toBe(defaults.threshold);
      expect(row.windowMinutes).toBe(defaults.windowMinutes);
      if (defaults.minCalls != null) expect(row.config.minCalls).toBe(defaults.minCalls);
    }
  });

  it('mức độ + cooldown: lỗi AI critical (vượt đêm), dự phòng/ghi hỏng warning; migration và bootstrap giống nhau', () => {
    expect(seedRow(migration, 'ai_error_rate_high')).toMatchObject({ severity: 'critical', cooldown: 120 });
    expect(seedRow(migration, 'ai_fallback_spike')).toMatchObject({ severity: 'warning', cooldown: 360 });
    expect(seedRow(migration, 'ai_usage_write_failed')).toMatchObject({ severity: 'warning', cooldown: 360 });
    for (const code of ['ai_error_rate_high', 'ai_fallback_spike', 'ai_usage_write_failed']) {
      expect(seedRow(bootstrap, code)).toEqual(seedRow(migration, code));
    }
  });

  it('migration chỉ INSERT … ON CONFLICT DO NOTHING (chạy lại không đè ngưỡng admin đã chỉnh); không DROP/ALTER', () => {
    const sqlOnly = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sqlOnly).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
    expect(sqlOnly).not.toMatch(/\bDROP\b|\bALTER\b|\bUPDATE\b|\bDELETE\b/i);
  });
});
