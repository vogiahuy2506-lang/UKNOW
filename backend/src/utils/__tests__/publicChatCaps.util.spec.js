import { describe, expect, it } from '@jest/globals';
import {
  PUBLIC_CHAT_LIMITED_CODE,
  PUBLIC_CHAT_LIMIT_MESSAGES,
  buildPublicChatLimitedError,
  buildPublicVisitorSenderKey,
  getPublicChatIpKey,
} from '../publicChatCaps.util.js';

describe('getPublicChatIpKey', () => {
  it('IPv4 giữ nguyên; không có IP → thùng chung 0.0.0.0 (chặt hơn, không phải lách)', () => {
    expect(getPublicChatIpKey({ ip: '203.0.113.7' })).toBe('203.0.113.7');
    expect(getPublicChatIpKey({ socket: { remoteAddress: '203.0.113.8' } })).toBe('203.0.113.8');
    expect(getPublicChatIpKey({})).toBe('0.0.0.0');
    expect(getPublicChatIpKey(undefined)).toBe('0.0.0.0');
  });

  it('IPv6: hai địa chỉ cùng khối /56 ra CÙNG khoá (một nhà đổi địa chỉ trong khối không né được trần)', () => {
    const a = getPublicChatIpKey({ ip: '2001:db8:abcd:1200::1' });
    const b = getPublicChatIpKey({ ip: '2001:db8:abcd:12ff:ffff:ffff:ffff:ffff' });
    const other = getPublicChatIpKey({ ip: '2001:db8:abcd:1300::1' });
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });
});

describe('buildPublicVisitorSenderKey', () => {
  const base = { chatbotId: 12, ipKey: '203.0.113.7' };

  it('có sessionId → theo sessionId (khách thật luôn gửi)', () => {
    expect(buildPublicVisitorSenderKey({ ...base, clientSessionId: '  sess_abc  ' })).toBe('sess_abc');
  });

  it('KHÔNG có sessionId → khoá ỔN ĐỊNH theo IP + chatbot (trước: chuỗi ngẫu nhiên mỗi request nên trần không bao giờ chạm)', () => {
    const k1 = buildPublicVisitorSenderKey({ ...base, clientSessionId: '' });
    const k2 = buildPublicVisitorSenderKey({ ...base, clientSessionId: undefined });
    const k3 = buildPublicVisitorSenderKey({ ...base, clientSessionId: '   ' });
    expect(k1).toBe(k2);
    expect(k1).toBe(k3);
    expect(k1).toContain('12');
    expect(k1).toContain('203.0.113.7');
  });

  it('IP khác hoặc chatbot khác → khoá khác', () => {
    const k = buildPublicVisitorSenderKey({ ...base });
    expect(buildPublicVisitorSenderKey({ ...base, ipKey: '203.0.113.8' })).not.toBe(k);
    expect(buildPublicVisitorSenderKey({ ...base, chatbotId: 13 })).not.toBe(k);
  });
});

describe('buildPublicChatLimitedError', () => {
  it.each(Object.keys(PUBLIC_CHAT_LIMIT_MESSAGES))('%s → lỗi 429 + mã PUBLIC_CHAT_LIMITED + câu tiếng Việt có dấu, không lộ số/cấu hình', (reason) => {
    const err = buildPublicChatLimitedError(reason);
    expect(err.status).toBe(429);
    expect(err.code).toBe(PUBLIC_CHAT_LIMITED_CODE);
    expect(err.message).toBe(PUBLIC_CHAT_LIMIT_MESSAGES[reason]);
    expect(err.message).toMatch(/[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệíìỉĩịọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựýỳỷỹỵđ]/);
    expect(err.message).not.toMatch(/\d/);
    expect(err.message).not.toMatch(/PUBLIC_CHAT|env|redis/i);
  });

  it('lý do lạ → câu chung chứ không undefined', () => {
    const err = buildPublicChatLimitedError('khong_biet');
    expect(err.status).toBe(429);
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(10);
  });
});
