import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * D-21 (PLAN_SUA_AI_DOT4 PR-3): POST /api/chatbot/inbox/ai-activity/summarize đọc cache TRƯỚC cổng credit.
 *
 * Test dựng ĐÚNG chuỗi middleware của route thật (`chatbot.routes.js`): `requireSelfContext` → `serveCachedSummary`
 * → `assertAiCreditAvailable` THẬT → `summarizeActivity` THẬT. Chỉ giả ranh giới: xác thực, service tóm tắt (đúng hình dạng
 * `{ date, dayKey, summaries, cached }`), bộ đo credit (`assertAvailable` / `consume`).
 *
 * Vì sao dựng cả route thay vì gọi riêng controller: thứ tự middleware chính là điều cần kiểm — đặt cache SAU cổng credit thì
 * controller vẫn xanh nhưng khách hết credit không xem lại được bản đã trả tiền.
 */
const currentUser = { id: 1, role: 'user', phone: '0900000001', activeContext: { type: 'self', contextPlanId: 1 } };

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => { req.user = currentUser; next(); },
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  sseLimiter: (req, res, next) => next(),
  aiLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/storageCapacity.middleware.js', () => ({
  storageCapacityGuard: () => (req, res, next) => next(),
}));

const makeMockController = (name) => new Proxy({}, {
  get: (_t, prop) => (req, res) => res.json({ success: true, controller: name, method: String(prop) }),
});
jest.unstable_mockModule('../../controllers/chatbot.controller.js', () => ({ default: makeMockController('chatbot') }));
jest.unstable_mockModule('../../controllers/unifiedInbox.controller.js', () => ({ default: makeMockController('unifiedInbox') }));
jest.unstable_mockModule('../../controllers/zaloPersonalSync.controller.js', () => ({ default: makeMockController('zaloPersonalSync') }));
jest.unstable_mockModule('../../controllers/chatbot/chatbotContactAlert.controller.js', () => ({ default: makeMockController('chatbotContactAlert') }));

const findFreshCachedSummary = jest.fn();
const summarizeDailyActivity = jest.fn();
jest.unstable_mockModule('../../services/chatbot/aiActivity.service.js', () => ({
  default: { findFreshCachedSummary, summarizeDailyActivity },
}));

const assertAvailable = jest.fn();
const consume = jest.fn();
jest.unstable_mockModule('../../services/ai/aiCreditMeter.service.js', () => ({
  default: { assertAvailable, consume },
}));

jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({ resolveWorkspaceOwnerId: () => 1 }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({ AUDIT_ACTIONS: {}, AUDIT_ENTITY_TYPES: {}, logWorkspace: jest.fn() }));
jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({ getWorkspaceAuditContext: () => ({}) }));

const { default: chatbotRoutes } = await import('../chatbot.routes.js');

const app = express();
app.use(express.json());
app.use('/api/chatbot', chatbotRoutes);

const SUMMARY = [{ conversationId: 5, y_chinh: 'Khách hỏi giá', khach_muon_gi: 'Giá', can_nguoi_that_khong: false }];
const CACHED = { date: '2026-10-03', dayKey: '20261003', summaries: SUMMARY, cached: true, updatedAt: '2026-10-03T03:05:00.000Z' };
const FRESH = { date: '2026-10-03', dayKey: '20261003', summaries: SUMMARY, cached: false, updatedAt: '2026-10-03T04:00:00.000Z' };
const OUT_OF_CREDIT = () => Object.assign(new Error('Bạn đã dùng hết credit AI trong kỳ.'), {
  status: 402, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', used: 10, limit: 10,
});

const post = () => request(app).post('/api/chatbot/inbox/ai-activity/summarize').send({ date: '2026-10-03' });

describe('POST /inbox/ai-activity/summarize — cache đứng trước cổng credit (D-21)', () => {
  beforeEach(() => {
    findFreshCachedSummary.mockReset().mockResolvedValue(null);
    summarizeDailyActivity.mockReset().mockResolvedValue(FRESH);
    assertAvailable.mockReset().mockResolvedValue({ skip: false });
    consume.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('HẾT CREDIT nhưng có bản đã lưu còn tươi → 200 bản đã lưu; cổng credit KHÔNG bị chạm, KHÔNG gọi Gemini, KHÔNG trừ', async () => {
    findFreshCachedSummary.mockResolvedValue(CACHED);
    assertAvailable.mockRejectedValue(OUT_OF_CREDIT());

    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: CACHED });
    expect(assertAvailable).not.toHaveBeenCalled();
    expect(summarizeDailyActivity).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('HẾT CREDIT và KHÔNG có cache tươi → 402 từ cổng credit, không sinh mới', async () => {
    assertAvailable.mockRejectedValue(OUT_OF_CREDIT());

    const res = await post();

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ success: false, code: 'RESOURCE_LIMIT_EXCEEDED' });
    expect(summarizeDailyActivity).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('còn credit, không cache tươi → sinh mới và trừ ĐÚNG 1 lần', async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body.data.cached).toBe(false);
    expect(assertAvailable).toHaveBeenCalledTimes(1);
    expect(summarizeDailyActivity).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(1, expect.objectContaining({ feature: 'inbox_ai_summary' }));
  });

  it('lượt chờ chung kết quả (bấm đôi, service trả cached:true) → KHÔNG trừ lần hai', async () => {
    summarizeDailyActivity.mockResolvedValue({ ...FRESH, cached: true, deduped: true });

    const res = await post();

    expect(res.status).toBe(200);
    expect(consume).not.toHaveBeenCalled();
  });

  it('đọc cache LỖI → không chặn tính năng: đi tiếp cổng credit rồi sinh mới như cũ', async () => {
    findFreshCachedSummary.mockRejectedValue(new Error('connection terminated'));

    const res = await post();

    expect(res.status).toBe(200);
    expect(assertAvailable).toHaveBeenCalledTimes(1);
    expect(summarizeDailyActivity).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('nhân viên (không phải chủ) vẫn bị chặn ở requireSelfContext TRƯỚC khi đọc cache', async () => {
    const saved = { ...currentUser };
    Object.assign(currentUser, { activeContext: { type: 'employee', ownerId: 99, contextPlanId: 1, permissions: { inbox_view: true } } });
    try {
      const res = await post();
      expect(res.status).toBe(403);
      expect(findFreshCachedSummary).not.toHaveBeenCalled();
    } finally {
      Object.assign(currentUser, saved);
    }
  });
});
