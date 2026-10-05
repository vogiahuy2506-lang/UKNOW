/**
 * Integration test (PostgreSQL THẬT) cho sổ lỗi AI bền + 3 luật cảnh báo mới + sửa `ai_cost_spike` + dọn sổ (PLAN_SUA_AI_DOT4_PR10 mục 1, 2, 7).
 *
 * Phần đơn vị (ngưỡng, ca biên `>`/`>=`, ngưỡng một nguồn) đã có ở src/services/admin/__tests__/alertEvaluator.aiCallEvents.spec.js với repository
 * giả. Ở đây kiểm cái repository giả không kiểm được: SQL thật — cửa sổ thời gian, tầng 'gemini' vs 'app', mẫu số không tính client_closed/blocked,
 * `meta` JSONB, nhóm theo tính năng/mã/model, loại embedding khỏi tổng token, xoá theo lô, và dòng luật seed từ bootstrap.sql (phản chiếu migration 286).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import {
  metricAiErrorRate,
  metricAiErrorBreakdown,
  metricAiFallbackCount,
  metricAiUsageWriteFailed,
  metricAiTokenSpike,
  listRules,
} from '../../src/repositories/admin/alert.repository.js';
import { evaluateRuleForTests, AI_ALERT_DEFAULTS } from '../../src/services/admin/alertEvaluator.service.js';
import { recordAiCallEvent } from '../../src/services/ai/aiCallEvents.service.js';
import { deleteOlderThanDays } from '../../src/repositories/ai/aiCallEvent.repository.js';
import { cleanupAiCallEvents } from '../../src/services/admin/dataRetentionCleanup.service.js';

const originalFlag = process.env.AI_CALL_EVENTS_ENABLED;

beforeEach(async () => {
  process.env.AI_CALL_EVENTS_ENABLED = 'true'; // NODE_ENV=test mặc định tắt ghi sự kiện; ở đây cần ghi thật
  await truncateAll();
  await db.query('DELETE FROM ai_call_events');
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env.AI_CALL_EVENTS_ENABLED;
  else process.env.AI_CALL_EVENTS_ENABLED = originalFlag;
});

/** Chèn nhiều dòng thẳng bằng SQL (không qua service) với thời điểm tuỳ ý. */
async function seed(rows) {
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO ai_call_events (created_at, layer, feature, model, outcome, http_status, error_code, meta)
       VALUES (NOW() - ($1 || ' minutes')::interval, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [String(r.agoMinutes ?? 1), r.layer ?? 'gemini', r.feature ?? 'chatbot_reply', r.model ?? 'gemini-x',
        r.outcome, r.httpStatus ?? null, r.errorCode ?? null, JSON.stringify(r.meta ?? {})],
    );
  }
}
const many = (n, template) => Array.from({ length: n }, () => ({ ...template }));

describe('ghi sự kiện qua một cửa (service + repository thật)', () => {
  it('recordAiCallEvent ghi đúng một dòng: kiểu cột, meta JSONB đã ép (không nội dung), id không có khoá ngoại', async () => {
    const ok = await recordAiCallEvent({
      layer: 'gemini', feature: 'chatbot_reply', model: 'gemini-2.5-flash', outcome: 'fallback_ok', httpStatus: 503,
      errorCode: 'AI_PROVIDER_BUSY', durationMs: 4321, ownerUserId: 987654, actorUserId: 987655,
      meta: { fallbackUsed: true, primaryModel: 'gemini-x', reply: 'Xin chào anh Nguyễn Văn A' },
    });
    expect(ok).toBe(true);
    const { rows } = await db.query('SELECT * FROM ai_call_events');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      owner_user_id: '987654', actor_user_id: '987655', layer: 'gemini', feature: 'chatbot_reply', model: 'gemini-2.5-flash',
      outcome: 'fallback_ok', http_status: 503, error_code: 'AI_PROVIDER_BUSY', duration_ms: 4321,
    });
    expect(rows[0].meta).toEqual({ fallbackUsed: true, primaryModel: 'gemini-x', droppedMeta: 1 });
    expect(JSON.stringify(rows[0])).not.toContain('Nguyễn');
    expect(rows[0].created_at).toBeInstanceOf(Date);
  });

  it('chủ NULL (khách vãng lai) vẫn ghi được', async () => {
    await recordAiCallEvent({ feature: 'hero_consultation', outcome: 'ok' });
    const { rows } = await db.query('SELECT owner_user_id, layer FROM ai_call_events');
    expect(rows).toEqual([{ owner_user_id: null, layer: 'gemini' }]);
  });
});

describe('metricAiErrorRate — SQL thật', () => {
  it('mẫu số = ok + fallback_ok + error + busy + timeout; KHÔNG tính client_closed, blocked, tầng app, hay dòng ngoài cửa sổ', async () => {
    await seed([
      ...many(15, { outcome: 'ok' }),
      ...many(2, { outcome: 'fallback_ok' }),
      ...many(2, { outcome: 'error' }),
      { outcome: 'busy' },
      { outcome: 'timeout' },
      ...many(3, { outcome: 'client_closed' }),
      { outcome: 'blocked' },
      ...many(10, { layer: 'app', outcome: 'error' }), // tầng app: lỗi Google không được đếm hai lần
      ...many(5, { outcome: 'error', agoMinutes: 120 }), // ngoài cửa sổ 30 phút
    ]);

    const m = await metricAiErrorRate(30);
    expect(m.total).toBe(21);
    expect(m.failed).toBe(4);
    expect(m.rate).toBeCloseTo(4 / 21, 6);
  });

  it('cửa sổ rộng hơn thì thấy cả dòng cũ; bảng rỗng → 0, không chia cho 0', async () => {
    expect(await metricAiErrorRate(30)).toEqual({ total: 0, failed: 0, rate: 0 });
    await seed([{ outcome: 'ok' }, { outcome: 'error', agoMinutes: 120 }]);
    expect((await metricAiErrorRate(30)).total).toBe(1);
    expect((await metricAiErrorRate(180)).total).toBe(2);
  });

  it('luật seed từ bootstrap bắn đúng ngưỡng với SQL thật: 19 lượt dù lỗi hết → không; 20 lượt 25% → bắn kèm tính năng + mã lỗi; đúng 20% → không', async () => {
    const rule = (await listRules()).find((r) => r.code === 'ai_error_rate_high');
    expect(rule).toBeTruthy();

    await seed(many(19, { outcome: 'error', errorCode: 'AI_TIMEOUT' }));
    expect(await evaluateRuleForTests(rule)).toBeNull();

    await db.query('DELETE FROM ai_call_events');
    await seed([
      ...many(15, { outcome: 'ok' }),
      ...many(3, { outcome: 'busy', errorCode: 'AI_PROVIDER_BUSY', feature: 'landing_page' }),
      ...many(2, { outcome: 'error', errorCode: 'GEMINI_404', feature: 'chatbot_reply' }),
    ]);
    const hit = await evaluateRuleForTests(rule);
    expect(hit).not.toBeNull();
    expect(hit.measuredValue).toBeCloseTo(0.25, 6);
    expect(hit.message).toContain('landing_page (3)');
    expect(hit.message).toContain('AI_PROVIDER_BUSY (3)');
    expect(hit.payload.topFeatures[0]).toEqual({ feature: 'landing_page', failed: 3 });

    await db.query('DELETE FROM ai_call_events');
    await seed([...many(16, { outcome: 'ok' }), ...many(4, { outcome: 'error' })]); // đúng 20%
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });
});

describe('metricAiErrorBreakdown — SQL thật', () => {
  it('top tính năng và top mã lỗi, chỉ tầng gemini + outcome lỗi + trong cửa sổ', async () => {
    await seed([
      ...many(3, { outcome: 'busy', feature: 'a', errorCode: 'AI_PROVIDER_BUSY' }),
      ...many(2, { outcome: 'timeout', feature: 'b', errorCode: 'AI_TIMEOUT' }),
      { outcome: 'error', feature: 'b', errorCode: null },
      ...many(9, { outcome: 'ok', feature: 'c' }),
      ...many(9, { layer: 'app', outcome: 'error', feature: 'z', errorCode: 'X' }),
    ]);
    const b = await metricAiErrorBreakdown(30);
    expect(b.topFeatures).toEqual([{ feature: 'a', failed: 3 }, { feature: 'b', failed: 3 }]); // hoà số lỗi → theo tên
    expect(b.topCodes).toEqual([{ code: 'AI_PROVIDER_BUSY', failed: 3 }, { code: 'AI_TIMEOUT', failed: 2 }, { code: 'error', failed: 1 }]);
  });
});

describe('metricAiFallbackCount — SQL thật', () => {
  it('chỉ đếm fallback_ok tầng gemini trong cửa sổ, nêu model chính hay lỗi nhất', async () => {
    await seed([
      ...many(6, { outcome: 'fallback_ok', meta: { primaryModel: 'gemini-a' } }),
      ...many(3, { outcome: 'fallback_ok', meta: { primaryModel: 'gemini-b' } }),
      { outcome: 'fallback_ok' }, // thiếu primaryModel → unknown
      ...many(4, { outcome: 'fallback_ok', agoMinutes: 180 }), // ngoài cửa sổ 60 phút
      ...many(5, { outcome: 'ok' }),
      ...many(5, { layer: 'app', outcome: 'fallback_ok' }),
    ]);
    expect(await metricAiFallbackCount(60)).toEqual({ count: 10, topPrimaryModel: 'gemini-a' });
    expect(await metricAiFallbackCount(240)).toMatchObject({ count: 14 });
  });

  it('luật seed: đúng 10 lượt/giờ → không bắn; 11 → bắn', async () => {
    const rule = (await listRules()).find((r) => r.code === 'ai_fallback_spike');
    await seed(many(10, { outcome: 'fallback_ok', meta: { primaryModel: 'gemini-a' } }));
    expect(await evaluateRuleForTests(rule)).toBeNull();
    await seed([{ outcome: 'fallback_ok', meta: { primaryModel: 'gemini-a' } }]);
    expect((await evaluateRuleForTests(rule)).message).toContain('11 lượt');
  });
});

describe('metricAiUsageWriteFailed — SQL thật', () => {
  it('đếm error_code USAGE_WRITE_FAILED (mọi tầng) trong cửa sổ; cộng token đã mất, bỏ qua giá trị không phải số', async () => {
    await seed([
      { layer: 'app', outcome: 'error', errorCode: 'USAGE_WRITE_FAILED', meta: { totalTokens: 1000 } },
      { layer: 'app', outcome: 'error', errorCode: 'USAGE_WRITE_FAILED', meta: { totalTokens: 234 } },
      { layer: 'app', outcome: 'error', errorCode: 'USAGE_WRITE_FAILED', meta: { totalTokens: 'abc' } },
      { layer: 'app', outcome: 'error', errorCode: 'USAGE_WRITE_FAILED', agoMinutes: 600, meta: { totalTokens: 99999 } }, // ngoài cửa sổ
      { layer: 'app', outcome: 'error', errorCode: 'OTHER', meta: { totalTokens: 5 } },
    ]);
    expect(await metricAiUsageWriteFailed(60)).toEqual({ count: 3, lostTokens: 1234 });
    expect(await metricAiUsageWriteFailed(1200)).toMatchObject({ count: 4 });
  });

  it('luật seed: 0 lần → không; 1 lần → bắn', async () => {
    const rule = (await listRules()).find((r) => r.code === 'ai_usage_write_failed');
    expect(await evaluateRuleForTests(rule)).toBeNull();
    await seed([{ layer: 'app', outcome: 'error', errorCode: 'USAGE_WRITE_FAILED', meta: { totalTokens: 7 } }]);
    expect((await evaluateRuleForTests(rule)).measuredValue).toBe(1);
  });
});

describe('ai_cost_spike không đếm embedding (D-OLD-C24)', () => {
  async function usage(userId, { feature, kind, tokens, hoursAgo = 0 }) {
    await db.query(
      `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end, metadata, created_at)
       VALUES ($1, 'ai_token', $2, NOW() - INTERVAL '40 days', NOW() + INTERVAL '40 days', $3::jsonb, NOW() - ($4 || ' hours')::interval)`,
      [userId, tokens, JSON.stringify({ feature, ...(kind ? { kind } : {}) }), String(hoursAgo)],
    );
  }

  it('một lượt nạp tài liệu lớn (embedding 5 triệu token) KHÔNG làm tổng hôm nay vọt; cả tử số lẫn TB 7 ngày bỏ embedding', async () => {
    const user = await createUser({ email: 'spike@test.com', username: 'spike' });
    // Hôm nay: 1.000 token trả lời + 5.000.000 token embedding.
    await usage(user.id, { feature: 'chatbot_reply', tokens: 1000 });
    await usage(user.id, { feature: 'embedding_kb_ingest', kind: 'embedding', tokens: 5_000_000 });
    await usage(user.id, { feature: 'embedding', tokens: 77 }); // chỉ có feature, không có kind — vẫn loại
    // 30 giờ trước (rơi vào cửa sổ 7 ngày trước hôm nay): 1.000 token trả lời + 9.000.000 embedding.
    await usage(user.id, { feature: 'chatbot_reply', tokens: 1000, hoursAgo: 30 });
    await usage(user.id, { feature: 'embedding_rag_query', kind: 'embedding', tokens: 9_000_000, hoursAgo: 30 });

    const m = await metricAiTokenSpike();
    expect(m.todayTokens).toBe(1000);
    expect(m.avgPrev7).toBe(1000);
    expect(m.ratio).toBe(1);
  });
});

describe('dọn sổ > 30 ngày (cron data_retention_cleanup)', () => {
  async function seedAged(daysAgo, n) {
    await db.query(
      `INSERT INTO ai_call_events (created_at, feature, outcome)
       SELECT NOW() - ($1 || ' days')::interval, 'x', 'ok' FROM generate_series(1, $2)`,
      [String(daysAgo), n],
    );
  }

  it('cleanupAiCallEvents xoá dòng > 30 ngày (nhiều lô), giữ dòng ≤ 30 ngày, lần hai xoá 0', async () => {
    await seedAged(31, 25);
    await seedAged(45, 10);
    await seedAged(29, 7);
    const deleted = await cleanupAiCallEvents({ batchSize: 10 }); // 35 dòng cũ → 4 lô
    expect(deleted).toBe(35);
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM ai_call_events');
    expect(rows[0].n).toBe(7);
    expect(await cleanupAiCallEvents()).toBe(0);
  });

  it('deleteOlderThanDays tôn trọng số ngày truyền vào', async () => {
    await seedAged(3, 4);
    await seedAged(1, 2);
    expect(await deleteOlderThanDays(2)).toBe(4);
  });
});

describe('dòng luật seed từ bootstrap (phản chiếu migration 286)', () => {
  it('3 luật có mặt, đúng kênh/mức độ/ngưỡng như mặc định trong code', async () => {
    const rules = await listRules();
    for (const code of ['ai_error_rate_high', 'ai_fallback_spike', 'ai_usage_write_failed']) {
      const rule = rules.find((r) => r.code === code);
      expect(rule).toBeTruthy();
      expect(rule.channel).toBe('email');
      expect(rule.enabled).toBe(true);
      expect(Number(rule.thresholdValue)).toBe(AI_ALERT_DEFAULTS[code].threshold);
      expect(Number(rule.windowMinutes)).toBe(AI_ALERT_DEFAULTS[code].windowMinutes);
    }
    expect(rules.find((r) => r.code === 'ai_error_rate_high').severity).toBe('critical');
    expect(rules.find((r) => r.code === 'ai_error_rate_high').config).toEqual({ minCalls: 20 });
  });
});
