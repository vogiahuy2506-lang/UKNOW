import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * PR-5 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11): POST /api/forms/ai-draft.
 *
 * Dựng ĐÚNG chuỗi middleware + controller của route thật (`form.routes.js` + `form.controller.js` THẬT, `aiCredit.middleware.js` THẬT,
 * `getWorkspaceContext` và `buildAiErrorPayload` THẬT). Chỉ giả ranh giới: xác thực, quyền, giới hạn tần suất (đếm số lần chạy),
 * dịch vụ AI soạn biểu mẫu, bộ đo credit (`assertAvailable` / `consume`) và các dịch vụ nặng của controller không liên quan.
 *
 * Điều cần chứng minh ở tầng route (không phải ở tầng dịch vụ): hết credit / hết hạn gói / nhân viên vượt hạn mức → chặn TRƯỚC khi gọi
 * model; thành công → trừ ĐÚNG 1 lần, theo CHỦ workspace; lỗi bất kỳ sau cổng → KHÔNG trừ; thiếu quyền `forms` → không chạm gì.
 */
let currentUser;
let deniedPermissions = [];
const limiterRuns = jest.fn();

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => { req.user = currentUser; next(); },
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  requirePasswordChange: (req, res, next) => next(),
  requirePhone: (req, res, next) => next(),
  requireActivePlan: (req, res, next) => next(),
  requirePermission: (permission) => (req, res, next) => (
    deniedPermissions.includes(permission)
      ? res.status(403).json({ success: false, message: 'Không có quyền', code: 'FORBIDDEN' })
      : next()
  ),
}));
jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  aiLimiter: (req, res, next) => { limiterRuns(); next(); },
}));

const draftForm = jest.fn();
jest.unstable_mockModule('../../services/ai/aiFormDraft.service.js', () => ({ draftForm, default: { draftForm } }));

const assertAvailable = jest.fn();
const consume = jest.fn();
jest.unstable_mockModule('../../services/ai/aiCreditMeter.service.js', () => ({ default: { assertAvailable, consume } }));

// Phần còn lại của controller (không liên quan tới route này) — chỉ để module nạp được mà không chạm CSDL / kho tệp.
jest.unstable_mockModule('../../services/form.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({ AUDIT_ACTIONS: {}, AUDIT_ENTITY_TYPES: {}, logWorkspace: jest.fn() }));
jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({ getWorkspaceAuditContext: () => ({}) }));
jest.unstable_mockModule('../../services/formAsset.service.js', () => ({ ingestFormAsset: jest.fn() }));
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({ StorageQuotaExceededError: class extends Error {} }));
jest.unstable_mockModule('../../services/storage/storageBackend.js', () => ({ getStorageBackend: jest.fn() }));

const { default: formRoutes } = await import('../form.routes.js');

const app = express();
app.use(express.json());
app.use('/api/forms', formRoutes);

const OWNER = { id: 7, role: 'user', phone: '0900000007', activeContext: { type: 'self', contextPlanId: 1 } };
const EMPLOYEE = {
  id: 31,
  role: 'user',
  phone: '0900000031',
  activeContext: { type: 'employee', ownerId: 7, membershipId: 4, permissions: { forms: true } },
};

const DRAFT = {
  mode: 'create',
  kind: 'consult',
  title: 'Đăng ký học thử',
  description: '',
  fields: [{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }],
  settings: { consentEnabled: true, notifyOwner: true },
  bookingConfig: null,
  paymentConfig: null,
  needsAttention: [],
  usage: { creditCost: 1 },
};
const BODY = { description: 'Form đăng ký học thử', mode: 'create', locale: 'vi', kind: 'consult', productId: 3 };

const outOfCredit = () => Object.assign(new Error('Bạn đã dùng hết lượt AI trong kỳ — nâng cấp gói để tiếp tục'), {
  status: 402, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', used: 50, limit: 50, upgradeRequired: true,
});

const post = (body = BODY) => request(app).post('/api/forms/ai-draft').send(body);

describe('POST /api/forms/ai-draft', () => {
  beforeEach(() => {
    currentUser = OWNER;
    deniedPermissions = [];
    limiterRuns.mockReset();
    draftForm.mockReset().mockResolvedValue(DRAFT);
    assertAvailable.mockReset().mockResolvedValue({ skip: false, billingUserId: 7 });
    consume.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('thành công: 200 + nháp, gọi dịch vụ với CHỦ workspace + người bấm, trừ ĐÚNG 1 credit feature form_draft', async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: DRAFT });
    expect(draftForm).toHaveBeenCalledTimes(1);
    expect(draftForm).toHaveBeenCalledWith({
      ownerId: 7, actorUserId: 7, description: 'Form đăng ký học thử', kind: 'consult', productId: 3, locale: 'vi', existingForm: undefined, mode: 'create',
    });
    expect(limiterRuns).toHaveBeenCalledTimes(1);
    expect(assertAvailable).toHaveBeenCalledTimes(1);
    expect(assertAvailable).toHaveBeenCalledWith(7, { ownerContextId: null, forceBillable: false });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(7, expect.objectContaining({ feature: 'form_draft', creditContext: { skip: false, billingUserId: 7 } }));
  });

  it('thiếu mode → mặc định create; suggest/rewrite chuyển existingForm xuống dịch vụ', async () => {
    await post({ description: 'x' });
    expect(draftForm.mock.calls[0][0].mode).toBe('create');

    const existingForm = { title: 'T', fields: [{ type: 'short_text', label: 'Tên' }] };
    await post({ mode: 'suggest_questions', existingForm });
    expect(draftForm.mock.calls[1][0]).toMatchObject({ mode: 'suggest_questions', existingForm });
  });

  it('nhân viên: chi phí + hồ sơ theo CHỦ (ownerId = 7), người bấm là nhân viên; cổng credit nhận ngữ cảnh chủ', async () => {
    currentUser = EMPLOYEE;
    const res = await post();

    expect(res.status).toBe(200);
    expect(draftForm.mock.calls[0][0]).toMatchObject({ ownerId: 7, actorUserId: 31 });
    expect(assertAvailable).toHaveBeenCalledWith(31, { ownerContextId: 7, forceBillable: false });
    expect(consume).toHaveBeenCalledWith(31, expect.objectContaining({ feature: 'form_draft' }));
  });

  it('HẾT CREDIT → 402 đúng mã mà frontend AI khác hiểu; KHÔNG gọi model, KHÔNG trừ', async () => {
    assertAvailable.mockRejectedValue(outOfCredit());

    const res = await post();

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      success: false, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', used: 50, limit: 50, upgradeRequired: true,
    });
    expect(draftForm).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('gói HẾT HẠN → 402 (subscriptionExpired) và không gọi model', async () => {
    assertAvailable.mockRejectedValue(Object.assign(new Error('Gói đã hết hạn. Vui lòng gia hạn để tiếp tục dùng AI.'), {
      status: 402, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', subscriptionExpired: true, upgradeRequired: true,
    }));
    const res = await post();
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(draftForm).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('nhân viên vượt hạn mức AI chủ đặt → 403 EMPLOYEE_AI_LIMIT_EXCEEDED, không gọi model', async () => {
    currentUser = EMPLOYEE;
    assertAvailable.mockRejectedValue(Object.assign(new Error('Bạn đã dùng hết hạn mức AI trong ngày (5/5)'), {
      status: 403, code: 'EMPLOYEE_AI_LIMIT_EXCEEDED', resource: 'ai_credit', used: 5, limit: 5,
    }));
    const res = await post();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMPLOYEE_AI_LIMIT_EXCEEDED');
    expect(draftForm).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('lỗi hạ tầng khi kiểm credit → 500 câu chung, không gọi model, không lộ chi tiết', async () => {
    assertAvailable.mockRejectedValue(new Error('connection terminated at pg pool'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain('pg pool');
    expect(draftForm).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('nháp không hợp lệ (502) / đầu vào sai (400) → đúng mã, KHÔNG trừ credit', async () => {
    draftForm.mockRejectedValue(Object.assign(new Error('AI không trả về biểu mẫu hợp lệ, vui lòng thử lại.'), { status: 502, code: 'AI_FORM_DRAFT_INVALID_OUTPUT' }));
    let res = await post();
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ success: false, code: 'AI_FORM_DRAFT_INVALID_OUTPUT' });

    draftForm.mockRejectedValue(Object.assign(new Error('Vui lòng mô tả biểu mẫu bạn cần.'), { status: 400, statusCode: 400, code: 'INVALID_AI_FORM_DRAFT_REQUEST' }));
    res = await post({ description: '' });
    expect(res.status).toBe(400);

    // lỗi chuẩn hoá của util dùng statusCode (không phải status)
    draftForm.mockRejectedValue(Object.assign(new Error('Sản phẩm không hợp lệ'), { statusCode: 400, code: 'INVALID_PRODUCT_ID' }));
    res = await post();
    expect(res.status).toBe(400);
    expect(consume).not.toHaveBeenCalled();
  });

  it('Google quá tải (503) → câu tiếng Việt + mã AI_PROVIDER_BUSY (không lộ JSON tiếng Anh), KHÔNG trừ credit', async () => {
    draftForm.mockRejectedValue(Object.assign(new Error('Gemini API Error (503): {"error":{"message":"overloaded"}}'), { geminiStatus: 503, status: 503 }));
    const res = await post();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_PROVIDER_BUSY');
    expect(res.body.message).not.toContain('Gemini API Error');
    expect(consume).not.toHaveBeenCalled();
  });

  it('thiếu quyền forms → 403 và KHÔNG chạm cổng credit / model', async () => {
    deniedPermissions = ['forms'];
    const res = await post();
    expect(res.status).toBe(403);
    expect(assertAvailable).not.toHaveBeenCalled();
    expect(draftForm).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
});
