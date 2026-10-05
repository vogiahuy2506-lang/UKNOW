import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 3(d) (C P2-2): lượt trợ lý hỏng để lại ba dấu vết bền — audit AI_TURN_FAILED, sự kiện `assistant_turn`, tin người dùng + tin lỗi trong
 * phiên (để F5 không mất) — và KHÔNG BAO GIỜ làm đổi/trì hoãn câu lỗi trả cho người dùng. Ranh giới giả lập: nhật ký kiểm toán, kho phiên, sổ bền.
 */
const auditLog = jest.fn();
const saveMessages = jest.fn();
const recordAiCallEvent = jest.fn(() => Promise.resolve(true));

jest.unstable_mockModule('../../audit.service.js', () => ({
  default: { log: auditLog },
  AUDIT_ACTIONS: { AI_TURN_FAILED: 'AI_TURN_FAILED' },
  AUDIT_ENTITY_TYPES: { AI_SESSION: 'ai_session' },
}));
jest.unstable_mockModule('../../../repositories/aiSession.repository.js', () => ({ saveMessages }));
jest.unstable_mockModule('../aiCallEvents.service.js', () => ({
  recordAiCallEvent,
  outcomeFromError: (error) => ({ AI_CLIENT_ABORTED: 'client_closed', AI_TIMEOUT: 'timeout', AI_PROVIDER_BUSY: 'busy' }[error?.code] || 'error'),
  errorCodeOf: (error) => String(error?.code ?? (error?.geminiStatus != null ? `GEMINI_${error.geminiStatus}` : 'UNKNOWN')),
  AI_CALL_LAYER: { GEMINI: 'gemini', APP: 'app' },
  AI_CALL_OUTCOME: { OK: 'ok', ERROR: 'error' },
}));

const { recordAssistantTurnFailure, recordPlanSlotOutcome } = await import('../assistantTurnFailure.service.js');

const reqOf = (body, userId = 5) => ({ user: { id: userId }, body });
const history = [{ role: 'assistant', content: 'Chào' }, { role: 'user', content: 'Tạo chiến dịch gửi email cho khách' }];
const timeoutError = Object.assign(new Error('AI phản hồi quá lâu. Bạn vui lòng thử lại sau ít phút.'), { code: 'AI_TIMEOUT', status: 503 });

describe('recordAssistantTurnFailure', () => {
  beforeEach(() => {
    auditLog.mockReset().mockResolvedValue(undefined);
    saveMessages.mockReset().mockResolvedValue(true);
    recordAiCallEvent.mockClear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('lượt hỏng trong phiên có sẵn → audit AI_TURN_FAILED (stage/code/feature), sự kiện assistant_turn, và LƯU tin người dùng + tin lỗi', async () => {
    const result = await recordAssistantTurnFailure({
      req: reqOf({ history, sessionId: 12 }),
      stage: 'smart_chat',
      error: timeoutError,
      errorMessage: timeoutError.message,
      ownerUserId: 4,
    });

    expect(result).toEqual({ audited: true, saved: true });
    expect(auditLog).toHaveBeenCalledWith({
      userId: 5,
      category: 'system',
      action: 'AI_TURN_FAILED',
      entityType: 'ai_session',
      entityId: 12,
      details: { sessionId: 12, stage: 'smart_chat', code: 'AI_TIMEOUT', feature: 'smart_chat' },
    });
    expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    expect(recordAiCallEvent).toHaveBeenCalledWith({
      layer: 'app',
      feature: 'assistant_turn',
      outcome: 'timeout',
      errorCode: 'AI_TIMEOUT',
      httpStatus: null,
      ownerUserId: 4,
      actorUserId: 5,
      meta: { stage: 'smart_chat', feature: 'smart_chat', hasSession: true },
    });
    expect(saveMessages).toHaveBeenCalledWith(
      12,
      5,
      'Tạo chiến dịch gửi email cho khách',
      { type: 'text', content: '⚠️ AI phản hồi quá lâu. Bạn vui lòng thử lại sau ít phút.', data: { turnFailed: true, code: 'AI_TIMEOUT', stage: 'smart_chat' } },
      [],
    );
  });

  it('giai đoạn → tính năng: help_router → help_assistant, charge → ai_credit, giai đoạn lạ → assistant_chat', async () => {
    for (const [stage, feature] of [['help_router', 'help_assistant'], ['charge', 'ai_credit'], ['prepare', 'assistant_chat']]) {
      auditLog.mockClear();
      // eslint-disable-next-line no-await-in-loop
      await recordAssistantTurnFailure({ req: reqOf({ history, sessionId: 1 }), stage, error: timeoutError, errorMessage: 'x' });
      expect(auditLog.mock.calls[0][0].details).toMatchObject({ stage, feature });
    }
  });

  it('lượt ĐẦU (chưa có phiên) → vẫn audit + sự kiện nhưng KHÔNG tạo/lưu phiên (tránh phiên mồ côi một lượt lỗi)', async () => {
    await recordAssistantTurnFailure({ req: reqOf({ history }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x' });
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog.mock.calls[0][0]).toMatchObject({ entityId: null, details: { sessionId: null } });
    expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    expect(saveMessages).not.toHaveBeenCalled();
  });

  it('lỗi xảy ra SAU khi lượt đã được lưu (turnPersisted) → không lưu lần hai (không nhân đôi tin người dùng)', async () => {
    await recordAssistantTurnFailure({ req: reqOf({ history, sessionId: 12 }), stage: 'charge', error: timeoutError, errorMessage: 'x', turnPersisted: true });
    expect(saveMessages).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it('tin cuối không phải của người dùng / rỗng → không lưu', async () => {
    await recordAssistantTurnFailure({ req: reqOf({ history: [{ role: 'assistant', content: 'a' }], sessionId: 12 }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x' });
    await recordAssistantTurnFailure({ req: reqOf({ history: [{ role: 'user', content: '   ' }], sessionId: 12 }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x' });
    expect(saveMessages).not.toHaveBeenCalled();
  });

  it('KHÔNG ghi câu lỗi gốc / nội dung người dùng vào audit và sự kiện (chỉ mã + giai đoạn)', async () => {
    const leaky = Object.assign(new Error('Lỗi với khách Nguyễn Văn A, SĐT 0912345678'), { code: 'SOMETHING_BAD' });
    await recordAssistantTurnFailure({
      req: reqOf({ history: [{ role: 'user', content: 'Gửi cho 0912345678' }], sessionId: 3 }),
      stage: 'smart_chat',
      error: leaky,
      errorMessage: 'Có lỗi',
    });
    const dumped = JSON.stringify([auditLog.mock.calls, recordAiCallEvent.mock.calls]);
    expect(dumped).not.toMatch(/Nguyễn Văn A|0912345678/);
    expect(dumped).toContain('SOMETHING_BAD');
  });

  describe('KHÔNG BAO GIỜ làm hỏng / trì hoãn câu lỗi', () => {
    it('audit ném → vẫn ghi sự kiện và lưu phiên; không ném', async () => {
      auditLog.mockRejectedValue(new Error('audit sập'));
      const result = await recordAssistantTurnFailure({ req: reqOf({ history, sessionId: 12 }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x' });
      expect(result).toEqual({ audited: false, saved: true });
      expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    });

    it('lưu phiên ném → không ném', async () => {
      saveMessages.mockRejectedValue(new Error('DB sập'));
      await expect(recordAssistantTurnFailure({ req: reqOf({ history, sessionId: 12 }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x' }))
        .resolves.toMatchObject({ saved: false });
    });

    it('sổ bền ném đồng bộ → không ném', async () => {
      recordAiCallEvent.mockImplementationOnce(() => { throw new Error('sổ bền hỏng'); });
      await expect(recordAssistantTurnFailure({ req: reqOf({ history, sessionId: 12 }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x' }))
        .resolves.toBeDefined();
    });

    it('CSDL treo mãi → câu lỗi chỉ bị trì hoãn tối đa ~3 giây rồi vẫn trả', async () => {
      jest.useFakeTimers();
      try {
        auditLog.mockReturnValue(new Promise(() => {}));
        const pending = recordAssistantTurnFailure({ req: reqOf({ history, sessionId: 12 }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x' });
        await jest.advanceTimersByTimeAsync(3100);
        await expect(pending).resolves.toMatchObject({ timedOut: true });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('đếm lượt xin template slot kế hoạch (C-NO-P1-25-08)', () => {
    it('lượt slot hỏng vì lỗi → thêm một sự kiện assistant_plan_slot / error mang mã lỗi', async () => {
      await recordAssistantTurnFailure({ req: reqOf({ history, sessionId: 1, planSlotKey: 'd2-s1' }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x', planSlotKey: 'd2-s1' });
      const features = recordAiCallEvent.mock.calls.map(([e]) => e.feature);
      expect(features).toEqual(['assistant_turn', 'assistant_plan_slot']);
      expect(recordAiCallEvent.mock.calls[1][0]).toMatchObject({ outcome: 'error', errorCode: 'AI_TIMEOUT' });
    });

    it('planSlotKey sai khuôn → không đếm', async () => {
      await recordAssistantTurnFailure({ req: reqOf({ history }), stage: 'smart_chat', error: timeoutError, errorMessage: 'x', planSlotKey: 'abc' });
      expect(recordAiCallEvent.mock.calls.map(([e]) => e.feature)).toEqual(['assistant_turn']);
    });

    it('recordPlanSlotOutcome: ra template_draft → ok; ra kiểu khác → error NO_TEMPLATE_DRAFT kèm kiểu thật', () => {
      recordPlanSlotOutcome({ req: reqOf({}), ownerUserId: 4, responseType: 'template_draft' });
      recordPlanSlotOutcome({ req: reqOf({}), ownerUserId: 4, responseType: 'text' });
      expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({ feature: 'assistant_plan_slot', outcome: 'ok', errorCode: null, ownerUserId: 4, actorUserId: 5 });
      expect(recordAiCallEvent.mock.calls[1][0]).toMatchObject({
        feature: 'assistant_plan_slot', outcome: 'error', errorCode: 'NO_TEMPLATE_DRAFT', meta: { responseType: 'text' },
      });
    });

    it('recordPlanSlotOutcome: sổ bền ném đồng bộ → không ném', () => {
      recordAiCallEvent.mockImplementationOnce(() => { throw new Error('sổ bền hỏng'); });
      expect(() => recordPlanSlotOutcome({ req: reqOf({}), responseType: 'text' })).not.toThrow();
    });
  });
});
