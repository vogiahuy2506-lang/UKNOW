import { describe, expect, it } from '@jest/globals';
import {
  AI_OUTSIDE_HOURS_SOURCE,
  AI_RATE_LIMITED_SOURCE,
  AI_UNAVAILABLE_REASON,
  AI_UNAVAILABLE_SOURCE,
  LEGACY_APOLOGY_PREFIX,
  NOT_AI_REPLY_SOURCES,
  classifyAiFailure,
  unavailableMetadata,
} from '../aiUnavailable.util.js';
import { VISITOR_CHAT_ERROR_MESSAGE, VISITOR_CHAT_UNAVAILABLE_MESSAGE } from '../../services/ai/aiCreditMeter.service.js';

describe('classifyAiFailure — phân loại theo ĐÚNG hình dạng lỗi thật của aiCreditMeter / aiUsageMeter', () => {
  it('hết credit (aiCreditMeter._exhausted) → credit_exhausted', () => {
    const err = Object.assign(new Error('x'), { status: 402, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', upgradeRequired: true });
    expect(classifyAiFailure(err)).toBe(AI_UNAVAILABLE_REASON.CREDIT_EXHAUSTED);
  });

  it('gói hết hạn (aiCreditMeter._subscriptionExpired: cũng resource ai_credit nhưng subscriptionExpired) → subscription_expired', () => {
    const err = Object.assign(new Error('x'), { status: 402, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', subscriptionExpired: true });
    expect(classifyAiFailure(err)).toBe(AI_UNAVAILABLE_REASON.SUBSCRIPTION_EXPIRED);
  });

  it('chạm hạn mức token (aiUsageMeter) → ai_token_limit', () => {
    const err = Object.assign(new Error('x'), { code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_token' });
    expect(classifyAiFailure(err)).toBe(AI_UNAVAILABLE_REASON.TOKEN_LIMIT);
  });

  it('mọi lỗi khác (Google 503, timeout, null, chuỗi) → ai_error', () => {
    expect(classifyAiFailure(new Error('Google 503'))).toBe(AI_UNAVAILABLE_REASON.AI_ERROR);
    expect(classifyAiFailure(Object.assign(new Error('x'), { code: 'AI_PROVIDER_BUSY' }))).toBe(AI_UNAVAILABLE_REASON.AI_ERROR);
    expect(classifyAiFailure(Object.assign(new Error('x'), { code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'storage' }))).toBe(AI_UNAVAILABLE_REASON.AI_ERROR);
    expect(classifyAiFailure(null)).toBe(AI_UNAVAILABLE_REASON.AI_ERROR);
    expect(classifyAiFailure('lỗi')).toBe(AI_UNAVAILABLE_REASON.AI_ERROR);
  });
});

describe('unavailableMetadata', () => {
  it('kết quả chatRouter là câu xin lỗi → metadata nhãn + lý do; câu trả lời thường → {} (để spread)', () => {
    expect(unavailableMetadata({ source: AI_UNAVAILABLE_SOURCE, reason: 'credit_exhausted' }))
      .toEqual({ source: 'ai_unavailable', reason: 'credit_exhausted' });
    expect(unavailableMetadata({ source: AI_UNAVAILABLE_SOURCE })).toEqual({ source: 'ai_unavailable', reason: 'ai_error' });
    expect(unavailableMetadata({ type: 'text', content: 'Dạ có ạ' })).toEqual({});
    expect(unavailableMetadata(null)).toEqual({});
    expect(unavailableMetadata(undefined)).toEqual({});
  });
});

describe('LEGACY_APOLOGY_PREFIX — lọc tin xin lỗi CŨ (chưa có nhãn) khỏi bản tin tuần', () => {
  it('cả hai câu xin lỗi cố định của aiCreditMeter vẫn bắt đầu bằng đúng chuỗi này (đổi câu mà quên chuỗi → bản tin lại đếm nhầm)', () => {
    expect(VISITOR_CHAT_UNAVAILABLE_MESSAGE.startsWith(LEGACY_APOLOGY_PREFIX)).toBe(true);
    expect(VISITOR_CHAT_ERROR_MESSAGE.startsWith(LEGACY_APOLOGY_PREFIX)).toBe(true);
  });
});

// EXTRA-A5/A6: bộ lọc SQL của bản tin tuần đọc mảng này — ghim TỪNG phần tử (thiếu một nhãn là câu tĩnh đó lại bị đếm là "AI trả lời").
describe('NOT_AI_REPLY_SOURCES — mọi nhãn bản tin tuần KHÔNG đếm là "AI trả lời"', () => {
  it('đúng 3 nhãn, giá trị khớp với nơi ghi ở các kênh', () => {
    expect(AI_OUTSIDE_HOURS_SOURCE).toBe('ai_outside_hours');
    expect(AI_RATE_LIMITED_SOURCE).toBe('ai_rate_limited');
    expect(NOT_AI_REPLY_SOURCES).toEqual(['ai_unavailable', 'ai_outside_hours', 'ai_rate_limited']);
    expect(Object.isFrozen(NOT_AI_REPLY_SOURCES)).toBe(true);
  });
});
