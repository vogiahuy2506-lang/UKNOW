/**
 * tiktokOAuth.service.spec.js
 *
 * Unit test cho pure functions trong tiktokOAuth.service:
 * - signState / verifyState (HMAC state, chống CSRF, Bẫy 11)
 * - isRegionSupported (Bẫy 14: EEA/CH/UK blocked)
 *
 * Network calls (exchangeCodeForToken, refreshAccessToken, getUserInfo, revokeToken)
 * KHÔNG test ở đây — sẽ test riêng ở integration test với mock fetch (PR-2).
 *
 * Match pattern từ `backend/src/services/chatbot/__tests__/` (Jest + ESM).
 */

import { describe, expect, test, beforeEach, afterAll } from '@jest/globals';
import crypto from 'crypto';

const {
  signState,
  verifyState,
  isRegionSupported,
  getStateSecret,
  DEFAULT_SCOPES,
} = await import('../tiktokOAuth.service.js');

describe('tiktokOAuth.service — state signing (HMAC, Bẫy 11)', () => {
  const ORIGINAL_SECRET = process.env.OAUTH_STATE_SECRET;

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'test-state-secret-for-jest';
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.OAUTH_STATE_SECRET;
    } else {
      process.env.OAUTH_STATE_SECRET = ORIGINAL_SECRET;
    }
  });

  test('getStateSecret: thiếu cả OAUTH_STATE_SECRET và JWT_SECRET thì throw', () => {
    const orig = process.env.OAUTH_STATE_SECRET;
    const origJwt = process.env.JWT_SECRET;
    delete process.env.OAUTH_STATE_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(() => getStateSecret()).toThrow(/Chưa cấu hình OAUTH_STATE_SECRET/);
    } finally {
      if (orig !== undefined) process.env.OAUTH_STATE_SECRET = orig;
      if (origJwt !== undefined) process.env.JWT_SECRET = origJwt;
    }
  });

  test('signState: trả về state có 4 phần (userId.nonce.createdAt.sig)', () => {
    const { state, nonce, createdAt } = signState(42);
    const parts = state.split('.');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('42');
    expect(parts[1]).toBe(nonce);
    expect(String(Number.parseInt(parts[2], 10))).toBe(String(createdAt));
    expect(parts[3]).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
  });

  test('signState: mỗi lần gọi cho nonce khác nhau (random)', () => {
    const a = signState(1);
    const b = signState(1);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.state).not.toBe(b.state);
  });

  test('verifyState: round-trip thành công', () => {
    const { state } = signState(123);
    const result = verifyState(state);
    expect(result.userId).toBe(123);
  });

  test('verifyState: state bị tamper (đổi userId) → throw', () => {
    const { state } = signState(1);
    const parts = state.split('.');
    const tampered = `999.${parts[1]}.${parts[2]}.${parts[3]}`;
    expect(() => verifyState(tampered)).toThrow(/chữ ký không khớp/);
  });

  test('verifyState: state với secret khác → throw', () => {
    const { state } = signState(1);
    process.env.OAUTH_STATE_SECRET = 'attacker-secret';
    try {
      expect(() => verifyState(state)).toThrow(/chữ ký không khớp/);
    } finally {
      process.env.OAUTH_STATE_SECRET = 'test-state-secret-for-jest';
    }
  });

  test('verifyState: state hết hạn (>10 phút) → throw', () => {
    const { nonce } = signState(1);
    const oldCreatedAt = Date.now() - 11 * 60 * 1000; // 11 phút trước
    // Tự dựng state "hợp lệ chữ ký" nhưng timestamp cũ
    const payload = `1.${nonce}.${oldCreatedAt}`;
    const sig = crypto
      .createHmac('sha256', process.env.OAUTH_STATE_SECRET)
      .update(payload)
      .digest('base64url');
    const stale = `${payload}.${sig}`;
    expect(() => verifyState(stale)).toThrow(/hết hạn/);
  });

  test('verifyState: state không phải string → throw', () => {
    expect(() => verifyState(null)).toThrow();
    expect(() => verifyState(undefined)).toThrow();
    expect(() => verifyState(123)).toThrow();
  });

  test('verifyState: state không đúng 4 phần → throw', () => {
    expect(() => verifyState('only.two')).toThrow(/sai định dạng/);
    expect(() => verifyState('one.two.three.four.five')).toThrow(/sai định dạng/);
  });
});

describe('tiktokOAuth.service — isRegionSupported (Bẫy 14)', () => {
  test('APAC → true (Việt Nam user)', () => {
    expect(isRegionSupported('APAC')).toBe(true);
  });

  test('LATAM, METAP, NA → true', () => {
    expect(isRegionSupported('LATAM')).toBe(true);
    expect(isRegionSupported('METAP')).toBe(true);
    expect(isRegionSupported('NA')).toBe(true);
  });

  test('EEA, CH, UK → false (Business Messaging API blocked)', () => {
    expect(isRegionSupported('EEA')).toBe(false);
    expect(isRegionSupported('CH')).toBe(false);
    expect(isRegionSupported('UK')).toBe(false);
  });

  test('Case-insensitive: apac → true, eea → false', () => {
    expect(isRegionSupported('apac')).toBe(true);
    expect(isRegionSupported('eea')).toBe(false);
  });

  test('null / undefined / empty → false', () => {
    expect(isRegionSupported(null)).toBe(false);
    expect(isRegionSupported(undefined)).toBe(false);
    expect(isRegionSupported('')).toBe(false);
  });

  test('Region lạ (CN, JP) → false (chưa được TikTok hỗ trợ chính thức)', () => {
    expect(isRegionSupported('CN')).toBe(false);
    expect(isRegionSupported('JP')).toBe(false);
  });
});

describe('tiktokOAuth.service — DEFAULT_SCOPES', () => {
  test('Scope tối thiểu cho Business Messaging: user.info.basic, dm.*, business.*', () => {
    expect(DEFAULT_SCOPES).toContain('user.info.basic');
    expect(DEFAULT_SCOPES).toContain('dm.message.send');
    expect(DEFAULT_SCOPES).toContain('dm.message.read');
    expect(DEFAULT_SCOPES).toContain('dm.conversation.list');
    expect(DEFAULT_SCOPES).toContain('dm.webhook.subscribe');
  });
});
