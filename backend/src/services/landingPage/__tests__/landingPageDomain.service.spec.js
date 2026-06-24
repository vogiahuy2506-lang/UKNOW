import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const dnsResolve = jest.fn();
const dnsResolve4 = jest.fn();
const findByLandingPageIdInScope = jest.fn();
const updateStatusById = jest.fn();

jest.unstable_mockModule('dns/promises', () => ({
  default: {
    resolve: dnsResolve,
    resolve4: dnsResolve4,
    resolveCname: dnsResolve,
  },
}));

jest.unstable_mockModule('../../../repositories/landingPageDomain.repository.js', () => ({
  default: {
    findByLandingPageIdInScope,
    updateStatusById,
    findByLandingPageId: jest.fn(),
    findActiveByHostname: jest.fn(),
    findByHostnameLower: jest.fn(),
    countPendingOrActiveInScope: jest.fn(),
    upsertForLanding: jest.fn(),
    deleteByLandingPageId: jest.fn(),
    findPendingDomains: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../repositories/landingPage.repository.js', () => ({
  default: {
    findByIdInScope: jest.fn(),
  },
}));

jest.unstable_mockModule('../../cloudflare.service.js', () => ({
  default: {
    isConfigured: jest.fn(() => false),
    setupLandingPageDNS: jest.fn(),
    deleteDnsRecord: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: jest.fn(() => ({ limit: null })),
}));

jest.unstable_mockModule('../../../utils/landingHtmlInjection.util.js', () => ({
  resolveFrontendOriginFromEnv: jest.fn(() => 'https://app.founderai.biz'),
}));

const {
  buildDnsVerificationErrorMessage,
  checkCnameStatus,
  default: landingPageDomainService,
} = await import('../landingPageDomain.service.js');

const dnsError = (code) => Object.assign(new Error(code), { code });

describe('landingPageDomain.service DNS verification', () => {
  beforeEach(() => {
    dnsResolve.mockReset();
    dnsResolve4.mockReset();
    findByLandingPageIdInScope.mockReset();
    updateStatusById.mockReset();
    process.env.LP_CNAME_TARGET = 'founderai.biz';
    process.env.LP_APEX_FIXED_IP = '103.110.87.210';
  });

  describe('checkCnameStatus', () => {
    it('trả ok khi CNAME khớp target', async () => {
      dnsResolve.mockResolvedValue(['FounderAI.biz.']);

      await expect(checkCnameStatus('lp.example.com', 'founderai.biz')).resolves.toEqual({
        verified: true,
        reason: 'ok',
        found: ['founderai.biz'],
        isApexDomain: false,
        currentIp: null,
      });
    });

    it('phân loại wrong_target khi CNAME trỏ sai', async () => {
      dnsResolve.mockResolvedValue(['wrong.example.com.']);

      await expect(checkCnameStatus('lp.example.com', 'founderai.biz')).resolves.toEqual({
        verified: false,
        reason: 'wrong_target',
        found: ['wrong.example.com'],
        isApexDomain: false,
        currentIp: null,
      });
    });

    it('phân loại ENOTFOUND thành not_found', async () => {
      dnsResolve.mockRejectedValue(dnsError('ENOTFOUND'));

      await expect(checkCnameStatus('missing.example.com', 'founderai.biz')).resolves.toMatchObject({
        verified: false,
        reason: 'not_found',
      });
    });

    it('phân loại ENODATA thành no_cname khi A-record không khớp', async () => {
      dnsResolve.mockRejectedValue(dnsError('ENODATA'));
      dnsResolve4.mockResolvedValueOnce(['203.0.113.10']);
      dnsResolve4.mockResolvedValueOnce(['203.0.113.20']);

      await expect(checkCnameStatus('example.com', 'founderai.biz')).resolves.toMatchObject({
        verified: false,
        reason: 'no_cname',
      });
    });

    it('trả no_cname khi apex domain không có CNAME và A-record không khớp', async () => {
      dnsResolve.mockRejectedValue(dnsError('ENODATA'));
      dnsResolve4.mockResolvedValueOnce(['203.0.113.10']);
      dnsResolve4.mockResolvedValueOnce(['203.0.113.20']);

      await expect(checkCnameStatus('example.com', 'founderai.biz')).resolves.toMatchObject({
        verified: false,
        reason: 'no_cname',
        isApexDomain: true,
      });
    });

    it('chấp nhận apex domain khi A-record trỏ đúng platform IP', async () => {
      dnsResolve.mockRejectedValue(dnsError('ENODATA'));
      dnsResolve4.mockResolvedValue(['103.110.87.210']);

      await expect(checkCnameStatus('apexdomain.com', 'founderai.biz')).resolves.toMatchObject({
        verified: true,
        reason: 'ok',
        isApexDomain: true,
      });
    });

    it('phân loại lỗi DNS tạm thời thành transient', async () => {
      dnsResolve.mockRejectedValue(dnsError('ESERVFAIL'));

      await expect(checkCnameStatus('lp.example.com', 'founderai.biz')).resolves.toMatchObject({
        verified: false,
        reason: 'transient',
      });
    });
  });

  describe('buildDnsVerificationErrorMessage', () => {
    it('not_found nhắc kiểm tra đúng nhà cung cấp DNS/nameserver', () => {
      const message = buildDnsVerificationErrorMessage(
        { reason: 'not_found', found: [] },
        'giahuy.digibook.com.vn',
        'founderai.biz'
      );

      expect(message).toContain('chưa tồn tại trong DNS công khai');
      expect(message).toContain('dig NS digibook.com.vn');
      expect(message).toContain('nhà cung cấp');
    });

    it('wrong_target hiển thị target hiện tại', () => {
      const message = buildDnsVerificationErrorMessage(
        { reason: 'wrong_target', found: ['wrong.example.com'] },
        'lp.example.com',
        'founderai.biz'
      );

      expect(message).toContain('CNAME chưa đúng');
      expect(message).toContain('wrong.example.com');
    });
  });

  describe('verifyDns', () => {
    const authUser = { id: 1, role: 'user' };
    const row = {
      id: 9,
      landingPageId: 99,
      hostname: 'giahuy.digibook.com.vn',
      status: 'pending_verification',
      cfManaged: false,
    };

    it('trả message not_found cụ thể thay vì bảo chờ propagate', async () => {
      findByLandingPageIdInScope.mockResolvedValue(row);
      dnsResolve.mockRejectedValue(dnsError('ENOTFOUND'));

      await expect(landingPageDomainService.verifyDns(99, authUser)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('chưa tồn tại trong DNS công khai'),
      });
    });

    it('trả message no_cname khi hostname tồn tại nhưng thiếu CNAME', async () => {
      findByLandingPageIdInScope.mockResolvedValue(row);
      dnsResolve.mockRejectedValue(dnsError('ENODATA'));
      dnsResolve4.mockResolvedValueOnce(['203.0.113.10']);
      dnsResolve4.mockResolvedValueOnce(['203.0.113.20']);

      await expect(landingPageDomainService.verifyDns(99, authUser)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('không có bản ghi CNAME'),
      });
    });

    it('trả message transient riêng cho lỗi DNS tạm thời', async () => {
      findByLandingPageIdInScope.mockResolvedValue(row);
      dnsResolve.mockRejectedValue(dnsError('ETIMEOUT'));

      await expect(landingPageDomainService.verifyDns(99, authUser)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Đang chờ DNS propagate'),
      });
    });
  });
});
