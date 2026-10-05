import auditService, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit.service.js';
import * as aiSessionRepo from '../../repositories/aiSession.repository.js';
import { recordAiCallEvent, outcomeFromError, errorCodeOf, AI_CALL_LAYER, AI_CALL_OUTCOME } from './aiCallEvents.service.js';

/**
 * Lượt TRỢ LÝ AI hỏng (PLAN_SUA_AI_DOT4_PR10 mục 3(d), C P2-2): trước đây lỗi chỉ ở docker log + một toast ở frontend, và tin của người dùng MẤT
 * sau F5 (phiên chỉ được ghi ở nhánh thành công). Giờ mỗi lượt hỏng để lại ba dấu vết, đều best-effort (không bao giờ ném, không làm đổi câu trả
 * lỗi cho người dùng):
 *  1. nhật ký kiểm toán `AI_TURN_FAILED` (stage, code, feature — chỉ mã, không câu chữ);
 *  2. sự kiện bền `assistant_turn` (tầng 'app') cho bảng `ai_call_events`;
 *  3. lưu tin người dùng + tin lỗi vào phiên (nếu lượt đã có phiên và CHƯA được lưu) để tải lại trang vẫn thấy.
 */

/** Giai đoạn của `chat()` → tính năng AI đứng sau (để lọc nhật ký theo tính năng). */
const FEATURE_BY_STAGE = Object.freeze({
  help_router: 'help_assistant',
  smart_chat: 'smart_chat',
  charge: 'ai_credit',
});
const FEATURE_DEFAULT = 'assistant_chat';

/** Dấu hiệu đầu câu lỗi lưu vào phiên: đọc là biết đây là lượt lỗi chứ không phải câu trả lời của AI. */
const ERROR_MESSAGE_PREFIX = '⚠️ ';

export const ASSISTANT_TURN_EVENT_FEATURE = 'assistant_turn';
/** Lượt xin template của một slot kế hoạch nội dung (C-NO-P1-25-08): ok = ra `template_draft`; error = không ra. */
export const ASSISTANT_PLAN_SLOT_EVENT_FEATURE = 'assistant_plan_slot';
/** Ghi dấu vết ở NHÁNH LỖI không được trì hoãn câu trả lời lỗi quá mốc này (CSDL chậm thì mất dấu vết, không mất người dùng). */
const FAILURE_TRACE_CAP_MS = 3000;

/** Khuôn slot kế hoạch: d<ngày>-s<slot> (controller đã lọc đúng khuôn này). */
const PLAN_SLOT_KEY_RE = /^d\d+-s\d+$/i;

/** Mã `error_code` của lượt trợ lý mà Gemini trả JSON không đọc được (khách nhận câu xin lỗi soạn sẵn, KHÔNG trừ credit). */
export const ASSISTANT_PARSE_FAILED_CODE = 'AI_JSON_PARSE_FAILED';

/**
 * Lượt trợ lý KHÔNG ném lỗi nhưng Gemini trả JSON hỏng (`parseFailed` của processSmartChat): khách nhận câu xin lỗi, lượt không trừ credit. Trước đây vô hình
 * ngoài một dòng log; nay là một sự kiện `assistant_turn` / `parse_failed` để đếm được. Không audit AI_TURN_FAILED (không có ngoại lệ, phiên vẫn lưu bình thường).
 */
export function recordAssistantParseFailure({ req, ownerUserId = null }) {
  try {
    void recordAiCallEvent({
      layer: AI_CALL_LAYER.APP,
      feature: ASSISTANT_TURN_EVENT_FEATURE,
      outcome: AI_CALL_OUTCOME.PARSE_FAILED,
      errorCode: ASSISTANT_PARSE_FAILED_CODE,
      ownerUserId,
      actorUserId: req?.user?.id ?? null,
      meta: { stage: 'smart_chat', feature: 'smart_chat' },
    });
  } catch {
    // sổ bền không bao giờ được làm hỏng lượt
  }
}

/**
 * Một lượt xin template cho slot kế hoạch vừa có kết quả: ok nếu ra `template_draft`, ngược lại error (NO_TEMPLATE_DRAFT, kèm kiểu phản hồi
 * thật). Không bao giờ ném, không chờ.
 */
export function recordPlanSlotOutcome({ req, ownerUserId = null, responseType = null }) {
  try {
    const gotDraft = responseType === 'template_draft';
    void recordAiCallEvent({
      layer: AI_CALL_LAYER.APP,
      feature: ASSISTANT_PLAN_SLOT_EVENT_FEATURE,
      outcome: gotDraft ? AI_CALL_OUTCOME.OK : AI_CALL_OUTCOME.ERROR,
      errorCode: gotDraft ? null : 'NO_TEMPLATE_DRAFT',
      ownerUserId,
      actorUserId: req?.user?.id ?? null,
      meta: { responseType },
    });
  } catch {
    // sổ bền không bao giờ được làm hỏng lượt
  }
}

/**
 * @param {object} p
 * @param {import('express').Request} p.req
 * @param {string} p.stage giai đoạn đang chạy khi hỏng ('prepare' | 'help_router' | 'smart_chat' | 'charge')
 * @param {Error} p.error
 * @param {string} p.errorMessage câu lỗi người dùng thấy (từ buildAiErrorPayload) — cũng là nội dung tin lỗi lưu vào phiên
 * @param {number|null} p.ownerUserId chủ workspace (để sự kiện bền gắn đúng chủ)
 * @param {boolean} [p.turnPersisted=false] phiên đã ghi tin của lượt này rồi (lỗi xảy ra SAU khi lưu) → không lưu lần hai
 * @param {string} [p.planSlotKey] định danh slot kế hoạch của lượt (nếu là lượt xin template slot) → đếm thêm vào `assistant_plan_slot`
 * @returns {Promise<{ audited: boolean, saved: boolean }>}
 */
export async function recordAssistantTurnFailure(args) {
  let timer;
  const cap = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ audited: false, saved: false, timedOut: true }), FAILURE_TRACE_CAP_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([traceAssistantTurnFailure(args), cap]);
  } finally {
    clearTimeout(timer);
  }
}

async function traceAssistantTurnFailure({ req, stage, error, errorMessage, ownerUserId = null, turnPersisted = false, planSlotKey = null }) {
  const result = { audited: false, saved: false };
  try {
    const actorId = req?.user?.id ?? null;
    const code = errorCodeOf(error);
    const feature = FEATURE_BY_STAGE[stage] || FEATURE_DEFAULT;
    const sessionId = Number(req?.body?.sessionId);
    const hasSession = Number.isInteger(sessionId) && sessionId > 0;

    // 1) Nhật ký kiểm toán — chỉ mã + giai đoạn (không câu lỗi: có thể kèm nội dung do người dùng gõ).
    try {
      await auditService.log({
        userId: actorId,
        category: 'system',
        action: AUDIT_ACTIONS.AI_TURN_FAILED,
        entityType: AUDIT_ENTITY_TYPES.AI_SESSION,
        entityId: hasSession ? sessionId : null,
        details: { sessionId: hasSession ? sessionId : null, stage, code, feature },
      });
      result.audited = true;
    } catch {
      // auditService.log tự nuốt lỗi; bọc thêm cho chắc.
    }

    // 2) Sự kiện bền (không await — đường lỗi không được chờ CSDL).
    void recordAiCallEvent({
      layer: AI_CALL_LAYER.APP,
      feature: ASSISTANT_TURN_EVENT_FEATURE,
      outcome: outcomeFromError(error),
      errorCode: code,
      httpStatus: error?.geminiStatus ?? null,
      ownerUserId,
      actorUserId: actorId,
      meta: { stage, feature, hasSession },
    });
    // Lượt xin template slot kế hoạch hỏng vì lỗi (không phải vì ra sai kiểu) cũng phải nằm trong số đếm slot.
    if (typeof planSlotKey === 'string' && PLAN_SLOT_KEY_RE.test(planSlotKey.trim())) {
      void recordAiCallEvent({
        layer: AI_CALL_LAYER.APP,
        feature: ASSISTANT_PLAN_SLOT_EVENT_FEATURE,
        outcome: AI_CALL_OUTCOME.ERROR,
        errorCode: code,
        ownerUserId,
        actorUserId: actorId,
        meta: { stage },
      });
    }

    // 3) Lưu tin người dùng + tin lỗi vào phiên (để F5 không mất). Chỉ khi: có phiên sẵn, lượt chưa được lưu, tin cuối là tin người dùng.
    // Lượt ĐẦU của hội thoại (chưa có phiên) cố ý KHÔNG tạo phiên mới: client không nhận được sessionId từ phản hồi lỗi, bấm gửi lại sẽ tạo
    // thêm một phiên nữa và phiên "chỉ có một lượt lỗi" nằm mồ côi trong danh sách.
    const history = Array.isArray(req?.body?.history) ? req.body.history : [];
    const last = history[history.length - 1];
    if (hasSession && !turnPersisted && last?.role === 'user' && actorId != null) {
      const userContent = String(last.content ?? '');
      if (userContent.trim()) {
        const saved = await aiSessionRepo.saveMessages(sessionId, actorId, userContent, {
          type: 'text',
          content: `${ERROR_MESSAGE_PREFIX}${String(errorMessage || '').trim() || 'Lượt này chưa xử lý được.'}`,
          data: { turnFailed: true, code, stage },
        }, []);
        result.saved = saved === true;
      }
    }
  } catch (failure) {
    // Ghi dấu vết hỏng không bao giờ được che mất lỗi gốc của lượt.
    console.warn('[AI] Không ghi được dấu vết lượt trợ lý lỗi:', failure?.message || failure);
  }
  return result;
}
