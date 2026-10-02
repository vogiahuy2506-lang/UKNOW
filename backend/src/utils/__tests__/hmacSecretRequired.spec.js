/**
 * Khoá HMAC của file token, ref đính kèm chat và băm IP form: không còn chuỗi cố định dự phòng.
 *  - fileDownloadToken / chatAttachmentRef: thiếu JWT_SECRET → ném lỗi rõ ràng lúc ký/kiểm.
 *  - formIpHash: thiếu cả FORM_IP_HASH_SECRET lẫn JWT_SECRET → không băm (null) + log lỗi, không ném
 *    (nơi gọi duy nhất coi null là "không có IP", bài nộp form vẫn được nhận).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'crypto';

const ORIGINAL = {
  JWT_SECRET: process.env.JWT_SECRET,
  FORM_IP_HASH_SECRET: process.env.FORM_IP_HASH_SECRET,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

describe('fileDownloadToken — bắt buộc JWT_SECRET', () => {
  let generateFileToken;
  let verifyFileToken;

  beforeEach(async () => {
    ({ generateFileToken, verifyFileToken } = await import('../fileDownloadToken.js'));
  });

  afterEach(restoreEnv);

  it('có JWT_SECRET → ký rồi kiểm lại được', () => {
    process.env.JWT_SECRET = 'file-token-secret';
    const token = generateFileToken('uploads/1/a.png', 2, 3, 'x@test.local');
    expect(verifyFileToken(token)).toEqual(expect.objectContaining({ sk: 'uploads/1/a.png', c: 2, u: 3 }));
  });

  it('thiếu JWT_SECRET → generateFileToken ném lỗi nêu tên biến', () => {
    delete process.env.JWT_SECRET;
    expect(() => generateFileToken('uploads/1/a.png', null, null, null)).toThrow(/JWT_SECRET/);
  });

  it('thiếu JWT_SECRET → token ký bằng chuỗi dự phòng cũ không được chấp nhận', () => {
    delete process.env.JWT_SECRET;
    const payload = Buffer.from(JSON.stringify({ sk: 'uploads/1/a.png' })).toString('base64url');
    const forged = `${payload}.${hmac('changeme-set-JWT_SECRET', payload)}`;
    expect(() => verifyFileToken(forged)).toThrow(/JWT_SECRET/);
  });
});

describe('chatAttachmentRef — bắt buộc JWT_SECRET', () => {
  let signChatAttachmentRef;
  let resolveChatAttachmentRef;

  beforeEach(async () => {
    ({ signChatAttachmentRef, resolveChatAttachmentRef } = await import('../chatAttachmentRef.js'));
  });

  afterEach(restoreEnv);

  it('có JWT_SECRET → ký rồi kiểm lại được', () => {
    process.env.JWT_SECRET = 'chat-ref-secret';
    const ref = signChatAttachmentRef('uploads/1/chat/a.pdf', { chatbotId: 5, sid: 's1' });
    expect(resolveChatAttachmentRef(ref, { chatbotId: 5, sid: 's1' }).sk).toBe('uploads/1/chat/a.pdf');
  });

  it('thiếu JWT_SECRET → ký và kiểm đều ném lỗi nêu tên biến', () => {
    delete process.env.JWT_SECRET;
    expect(() => signChatAttachmentRef('uploads/1/chat/a.pdf', { chatbotId: 5 })).toThrow(/JWT_SECRET/);
    const payload = Buffer.from(JSON.stringify({ sk: 'uploads/1/chat/a.pdf', cb: 5, exp: Date.now() + 60000 })).toString('base64url');
    const forged = `${payload}.${hmac('changeme-set-JWT_SECRET', payload)}`;
    expect(() => resolveChatAttachmentRef(forged, { chatbotId: 5 })).toThrow(/JWT_SECRET/);
  });
});

describe('formIpHash — không băm bằng khoá cố định', () => {
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    jest.resetModules();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    restoreEnv();
  });

  const hexHmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

  it('ưu tiên FORM_IP_HASH_SECRET', async () => {
    process.env.FORM_IP_HASH_SECRET = 'ip-secret';
    process.env.JWT_SECRET = 'jwt-secret';
    const { hashSubmitterIp } = await import('../formIpHash.util.js');
    expect(hashSubmitterIp('203.0.113.7')).toBe(hexHmac('ip-secret', '203.0.113.7'));
  });

  it('thiếu FORM_IP_HASH_SECRET → dùng JWT_SECRET (cảnh báo một lần)', async () => {
    delete process.env.FORM_IP_HASH_SECRET;
    process.env.JWT_SECRET = 'jwt-secret';
    const { hashSubmitterIp } = await import('../formIpHash.util.js');
    expect(hashSubmitterIp('203.0.113.7')).toBe(hexHmac('jwt-secret', '203.0.113.7'));
    hashSubmitterIp('203.0.113.8');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('thiếu cả hai → trả null (không ném), log lỗi một lần', async () => {
    delete process.env.FORM_IP_HASH_SECRET;
    delete process.env.JWT_SECRET;
    const { hashSubmitterIp } = await import('../formIpHash.util.js');
    expect(hashSubmitterIp('203.0.113.7')).toBeNull();
    expect(hashSubmitterIp('203.0.113.8')).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toMatch(/FORM_IP_HASH_SECRET/);
  });

  it('ipKey rỗng → null như cũ', async () => {
    process.env.FORM_IP_HASH_SECRET = 'ip-secret';
    const { hashSubmitterIp } = await import('../formIpHash.util.js');
    expect(hashSubmitterIp('')).toBeNull();
  });
});
