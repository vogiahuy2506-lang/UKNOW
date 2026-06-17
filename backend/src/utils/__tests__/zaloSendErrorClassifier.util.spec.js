import { describe, it, expect } from '@jest/globals';
import {
  classifyZaloSendError,
  isZaloPhoneLookupRateLimitError,
} from '../zaloSendErrorClassifier.util.js';

describe('zaloSendErrorClassifier.util', () => {
  describe('isZaloPhoneLookupRateLimitError', () => {
    it('nhận diện lỗi tra số quá nhiều', () => {
      expect(isZaloPhoneLookupRateLimitError(new Error('Tìm số điện thoại quá nhiều, vui lòng thử lại sau'))).toBe(true);
      expect(isZaloPhoneLookupRateLimitError(new Error('Quá nhiều lần trong 1 giờ — hành vi bất thường'))).toBe(true);
      expect(isZaloPhoneLookupRateLimitError(new Error('Vượt quá số request cho phép'))).toBe(true);
    });

    it('từ chối lỗi không liên quan', () => {
      expect(isZaloPhoneLookupRateLimitError(new Error('Không tìm thấy user Zalo theo số 0901234567'))).toBe(false);
    });

    it('chỉ đọc error.message, không quét cause/response', () => {
      const err = new Error('Lỗi khác');
      err.cause = { message: 'Tìm số điện thoại quá nhiều' };
      expect(isZaloPhoneLookupRateLimitError(err)).toBe(false);
    });
  });

  describe('classifyZaloSendError', () => {
    it('map tra số quá nhiều → PHONE_LOOKUP_RATE_LIMIT', () => {
      const result = classifyZaloSendError(new Error('Tìm số điện thoại quá nhiều'), { stage: 'lookup' });
      expect(result.category).toBe('PHONE_LOOKUP_RATE_LIMIT');
      expect(result.label).toContain('Tra số quá nhiều');
    });

    it('map không tìm thấy user → RECIPIENT_NOT_FOUND', () => {
      const result = classifyZaloSendError(new Error('Không tìm thấy user Zalo theo số 0901234567'));
      expect(result.category).toBe('RECIPIENT_NOT_FOUND');
    });

    it('map timeout → TIMEOUT kèm số lần thử', () => {
      const err = new Error('Connect Timeout Error');
      err.code = 'UND_ERR_CONNECT_TIMEOUT';
      err.zaloRetry = { attempt: 3 };
      const result = classifyZaloSendError(err);
      expect(result.category).toBe('TIMEOUT');
      expect(result.label).toContain('3 lần');
    });

    it('map mất session → ACCOUNT_DISCONNECTED', () => {
      const result = classifyZaloSendError(new Error('Phiên đăng nhập Zalo không còn hiệu lực'));
      expect(result.category).toBe('ACCOUNT_DISCONNECTED');
    });

    it('map chặn người lạ → NOT_FRIEND_OR_BLOCKED', () => {
      const result = classifyZaloSendError(new Error('Người dùng chặn không nhận tin nhắn từ người lạ'));
      expect(result.category).toBe('NOT_FRIEND_OR_BLOCKED');
    });

    it('fallback UNKNOWN giữ message thô', () => {
      const result = classifyZaloSendError(new Error('Lỗi SDK lạ XYZ'));
      expect(result.category).toBe('UNKNOWN');
      expect(result.label).toBe('Lỗi SDK lạ XYZ');
    });
  });
});
