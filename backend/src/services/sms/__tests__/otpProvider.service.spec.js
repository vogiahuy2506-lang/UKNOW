import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-1 (xác thực SĐT bằng OTP) — otpProvider.service.js.
 * Xem _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4.2.
 */

const post = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { post },
}));

const { sendOtp, isPhoneOtpEnabled } = await import('../otpProvider.service.js');

const ENV_KEYS = ['PHONE_OTP_PROVIDER', 'ESMS_API_KEY', 'ESMS_SECRET_KEY', 'ESMS_BRANDNAME'];
let savedEnv = {};

describe('otpProvider.service', () => {
  beforeEach(() => {
    post.mockReset();
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  describe('isPhoneOtpEnabled', () => {
    it('PHONE_OTP_PROVIDER rỗng/không đặt → false (tắt im lặng)', () => {
      expect(isPhoneOtpEnabled()).toBe(false);
    });

    it('PHONE_OTP_PROVIDER="mock" → true', () => {
      process.env.PHONE_OTP_PROVIDER = 'mock';
      expect(isPhoneOtpEnabled()).toBe(true);
    });

    it('PHONE_OTP_PROVIDER="esms" → true', () => {
      process.env.PHONE_OTP_PROVIDER = 'esms';
      expect(isPhoneOtpEnabled()).toBe(true);
    });

    it('PHONE_OTP_PROVIDER giá trị lạ (typo) → false', () => {
      process.env.PHONE_OTP_PROVIDER = 'zalo-zns-typo';
      expect(isPhoneOtpEnabled()).toBe(false);
    });
  });

  describe('sendOtp — provider mock', () => {
    it('không gọi mạng (axios.post không được gọi)', async () => {
      process.env.PHONE_OTP_PROVIDER = 'mock';
      const result = await sendOtp({ phone: '0912345678', code: '123456' });
      expect(result).toEqual({ provider: 'mock', providerMessageId: 'mock' });
      expect(post).not.toHaveBeenCalled();
    });

    it('không log mã OTP ra console.log', async () => {
      process.env.PHONE_OTP_PROVIDER = 'mock';
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await sendOtp({ phone: '0912345678', code: '999999' });
      const loggedText = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(loggedText).not.toContain('999999');
      logSpy.mockRestore();
    });
  });

  describe('sendOtp — provider esms', () => {
    it('thiếu ESMS_API_KEY/SECRET/BRANDNAME → throw, không gọi axios', async () => {
      process.env.PHONE_OTP_PROVIDER = 'esms';
      await expect(sendOtp({ phone: '0912345678', code: '123456' })).rejects.toThrow(
        /ESMS_API_KEY|ESMS_SECRET_KEY|ESMS_BRANDNAME/
      );
      expect(post).not.toHaveBeenCalled();
    });

    it('cấu hình đủ, CodeResult=100 → thành công, gọi đúng endpoint POST JSON', async () => {
      process.env.PHONE_OTP_PROVIDER = 'esms';
      process.env.ESMS_API_KEY = 'key';
      process.env.ESMS_SECRET_KEY = 'secret';
      process.env.ESMS_BRANDNAME = 'FounderAI';
      post.mockResolvedValue({ data: { CodeResult: '100', SMSID: 'abc123' } });

      const result = await sendOtp({ phone: '0912345678', code: '123456' });

      expect(result).toEqual({ provider: 'esms', providerMessageId: 'abc123' });
      expect(post).toHaveBeenCalledTimes(1);
      const [url, body] = post.mock.calls[0];
      expect(url).toBe('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/');
      expect(body).toMatchObject({
        ApiKey: 'key',
        SecretKey: 'secret',
        Phone: '0912345678',
        SmsType: '2',
        Brandname: 'FounderAI',
        IsUnicode: '0',
      });
      // Nội dung phải chứa mã, nhưng test này không phải nơi cấm log — cấm log là ở console.*.
      expect(body.Content).toContain('123456');
    });

    it('CodeResult khác 100 (vd 104 brandname chưa duyệt) → throw', async () => {
      process.env.PHONE_OTP_PROVIDER = 'esms';
      process.env.ESMS_API_KEY = 'key';
      process.env.ESMS_SECRET_KEY = 'secret';
      process.env.ESMS_BRANDNAME = 'FounderAI';
      post.mockResolvedValue({ data: { CodeResult: '104' } });

      await expect(sendOtp({ phone: '0912345678', code: '123456' })).rejects.toThrow(/eSMS/);
    });

    it('axios ném lỗi mạng → throw lỗi rõ ràng, không lộ nội dung lỗi gốc chứa mã', async () => {
      process.env.PHONE_OTP_PROVIDER = 'esms';
      process.env.ESMS_API_KEY = 'key';
      process.env.ESMS_SECRET_KEY = 'secret';
      process.env.ESMS_BRANDNAME = 'FounderAI';
      post.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(sendOtp({ phone: '0912345678', code: '123456' })).rejects.toThrow(/eSMS/);
    });
  });

  describe('sendOtp — provider rỗng/không hợp lệ', () => {
    it('PHONE_OTP_PROVIDER rỗng → throw rõ ràng (không âm thầm coi như đã gửi)', async () => {
      await expect(sendOtp({ phone: '0912345678', code: '123456' })).rejects.toThrow(
        /PHONE_OTP_PROVIDER/
      );
    });

    it('PHONE_OTP_PROVIDER giá trị lạ → throw', async () => {
      process.env.PHONE_OTP_PROVIDER = 'zns-not-implemented-yet';
      await expect(sendOtp({ phone: '0912345678', code: '123456' })).rejects.toThrow(
        /PHONE_OTP_PROVIDER/
      );
    });
  });
});
