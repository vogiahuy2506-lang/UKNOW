import { describe, expect, it } from '@jest/globals';
import {
  executeWithZaloTimeoutRetry,
  isNetworkTimeoutError,
  isZaloTimeoutError,
} from '../zaloTimeoutRetry.util.js';

const makeFetchFailedError = (code = 'EAI_AGAIN') => {
  const error = new TypeError('fetch failed');
  error.cause = {
    code,
    message: `getaddrinfo ${code} tt-group-wpa.chat.zalo.me`,
  };
  return error;
};

describe('zaloTimeoutRetry.util', () => {
  describe('isZaloTimeoutError', () => {
    it('nhận diện lỗi DNS EAI_AGAIN của undici fetch failed', () => {
      const error = makeFetchFailedError('EAI_AGAIN');

      expect(isZaloTimeoutError(error)).toBe(true);
      expect(isNetworkTimeoutError(error)).toBe(true);
    });

    it('nhận diện các lỗi DNS/socket tạm thời theo code', () => {
      ['EAI_FAIL', 'ENOTFOUND', 'ECONNREFUSED', 'UND_ERR_SOCKET'].forEach((code) => {
        expect(isZaloTimeoutError(makeFetchFailedError(code))).toBe(true);
      });
    });

    it('nhận diện fallback theo message khi thiếu code', () => {
      expect(isZaloTimeoutError(new TypeError('fetch failed'))).toBe(true);
      expect(isZaloTimeoutError(new Error('socket hang up'))).toBe(true);
      expect(isZaloTimeoutError(new Error('getaddrinfo EAI_AGAIN zalo.me'))).toBe(true);
    });

    it('từ chối lỗi business không liên quan tới mạng', () => {
      expect(isZaloTimeoutError(new Error('Không tìm thấy nhóm với tài khoản hiện tại'))).toBe(false);
    });
  });

  describe('executeWithZaloTimeoutRetry', () => {
    it('retry lỗi DNS tạm thời rồi trả kết quả thành công', async () => {
      let attempts = 0;
      const retryEvents = [];

      const result = await executeWithZaloTimeoutRetry({
        operationName: 'get_all_groups',
        maxAttempts: 3,
        baseDelayMs: 1,
        onRetry: (ctx) => retryEvents.push(ctx),
        operation: async () => {
          attempts += 1;
          if (attempts < 3) throw makeFetchFailedError('EAI_AGAIN');
          return { ok: true };
        },
      });

      expect(result).toEqual({ ok: true });
      expect(attempts).toBe(3);
      expect(retryEvents).toHaveLength(2);
      expect(retryEvents[0].operationName).toBe('get_all_groups');
    });
  });
});
