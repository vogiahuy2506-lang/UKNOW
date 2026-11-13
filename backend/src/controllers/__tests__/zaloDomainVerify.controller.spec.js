import { jest } from '@jest/globals';
import zaloDomainVerifyController from '../zaloDomainVerify.controller.js';
import domainVerificationRepository from '../../repositories/domainVerification.repository.js';

describe('ZaloDomainVerifyController', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      get: jest.fn().mockReturnValue('crm.example.com'),
      path: '/zalo-platform-site-verification-abc123xyz.html',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('saveVerificationCode', () => {
    it('báo lỗi 400 nếu không có mã xác thực', async () => {
      req.body = {};
      await zaloDomainVerifyController.saveVerificationCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Vui lòng cung cấp mã xác thực tên miền' })
      );
    });

    it('tách đúng mã khi dán nguyên chuỗi zalo-platform-site-verification=XYZ', async () => {
      req.body = { verification_code: 'zalo-platform-site-verification=abcXYZ789' };
      const upsertSpy = jest.spyOn(domainVerificationRepository, 'upsertVerification').mockResolvedValue({
        domain: 'crm.example.com',
        verification_code: 'abcXYZ789',
        file_name: 'zalo-platform-site-verification-abcXYZ789.html',
      });

      await zaloDomainVerifyController.saveVerificationCode(req, res);

      expect(upsertSpy).toHaveBeenCalledWith({
        platform: 'zalo',
        domain: 'crm.example.com',
        verificationCode: 'abcXYZ789',
        fileName: 'zalo-platform-site-verification-abcXYZ789.html',
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            verification_code: 'abcXYZ789',
            file_name: 'zalo-platform-site-verification-abcXYZ789.html',
          }),
        })
      );
    });
  });

  describe('serveVerificationFile', () => {
    it('trả về 404 nếu chưa cấu hình mã xác thực', async () => {
      jest.spyOn(domainVerificationRepository, 'getVerification').mockResolvedValue(null);
      jest.spyOn(domainVerificationRepository, 'getLatestVerification').mockResolvedValue(null);

      await zaloDomainVerifyController.serveVerificationFile(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Zalo verification code not configured');
    });

    it('trả về HTML chứa mã xác thực và meta tag khi đã cấu hình', async () => {
      jest.spyOn(domainVerificationRepository, 'getVerification').mockResolvedValue({
        verification_code: 'testCode123',
        domain: 'crm.example.com',
      });

      await zaloDomainVerifyController.serveVerificationFile(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('zalo-platform-site-verification=testCode123'));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<meta name="zalo-platform-site-verification" content="testCode123" />'));
    });
  });
});

