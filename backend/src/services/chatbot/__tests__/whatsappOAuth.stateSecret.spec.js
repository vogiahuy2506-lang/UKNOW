/**
 * Khoá ký state OAuth (whatsappOAuth.service.js): OAUTH_STATE_SECRET → JWT_SECRET → thiếu cả hai
 * thì ném lỗi lúc dùng, không có chuỗi cố định dự phòng.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import crypto from 'crypto';

const {
  getOAuthStateSecret,
  signState,
  verifyState,
} = await import('../whatsappOAuth.service.js');

const ORIGINAL = {
  OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function craft(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

describe('whatsappOAuth.service — khoá ký state OAuth', () => {
  beforeEach(() => {
    delete process.env.OAUTH_STATE_SECRET;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('ưu tiên OAUTH_STATE_SECRET, thiếu thì dùng JWT_SECRET', () => {
    process.env.JWT_SECRET = 'jwt-secret';
    expect(getOAuthStateSecret()).toBe('jwt-secret');
    process.env.OAUTH_STATE_SECRET = 'state-secret';
    expect(getOAuthStateSecret()).toBe('state-secret');
  });

  it('thiếu cả hai → getOAuthStateSecret/signState/verifyState đều ném lỗi rõ ràng (không ký/kiểm bằng chuỗi cố định)', () => {
    const legacy = craft({ flow: 'whatsapp_embedded_signup', userId: 1, exp: Math.floor(Date.now() / 1000) + 600 }, 'uknow-oauth-state');
    expect(() => getOAuthStateSecret()).toThrow(/OAUTH_STATE_SECRET/);
    expect(() => signState({ flow: 'x' })).toThrow(/OAUTH_STATE_SECRET/);
    expect(() => verifyState(legacy)).toThrow(/OAUTH_STATE_SECRET/);
  });

  it('ký rồi kiểm lại được, giữ nguyên payload + thêm exp', () => {
    process.env.OAUTH_STATE_SECRET = 'state-secret';
    const token = signState({ flow: 'facebook_oauth', chatbot_id: 5 });
    const payload = verifyState(token);
    expect(payload).toEqual(expect.objectContaining({ flow: 'facebook_oauth', chatbot_id: 5 }));
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('đổi khoá sau khi ký → state cũ không còn hợp lệ', () => {
    process.env.OAUTH_STATE_SECRET = 'state-secret';
    const token = signState({ flow: 'facebook_oauth' });
    process.env.OAUTH_STATE_SECRET = 'rotated-secret';
    expect(verifyState(token)).toBeNull();
  });

  it.each([
    ['hết hạn', { flow: 'f', exp: Math.floor(Date.now() / 1000) - 1 }],
    ['thiếu exp', { flow: 'f' }],
    ['exp không phải số', { flow: 'f', exp: 'never' }],
  ])('state ký đúng khoá nhưng %s → null', (_label, payload) => {
    process.env.OAUTH_STATE_SECRET = 'state-secret';
    expect(verifyState(craft(payload, 'state-secret'))).toBeNull();
  });

  it.each([
    ['rỗng', ''],
    ['không có dấu chấm', 'abcdef'],
    ['chữ ký sai độ dài', 'eyJhIjoxfQ.x'],
  ])('token %s → null', (_label, token) => {
    process.env.OAUTH_STATE_SECRET = 'state-secret';
    expect(verifyState(token)).toBeNull();
  });
});
