import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockDomainRepo = {
  findByLandingPageId: jest.fn(),
  findByLandingPageIdInScope: jest.fn(),
  upsertForLanding: jest.fn(),
  updateStatusById: jest.fn(),
  findByHostnameLower: jest.fn(),
  countPendingOrActiveInScope: jest.fn(),
  findAllActive: jest.fn(),
  deleteByLandingPageId: jest.fn(),
};

const mockLandingPageRepo = {
  findByIdInScope: jest.fn(),
  findById: jest.fn(),
  updateById: jest.fn(),
  updateByIdInScope: jest.fn(),
};

const mockCloudflareService = {
  isConfigured: jest.fn(),
  setupLandingPageDNS: jest.fn(),
  deleteDnsRecord: jest.fn(),
  purgeLandingCache: jest.fn().mockResolvedValue({ success: true }),
  purgeUrls: jest.fn().mockResolvedValue({ success: true }),
};


jest.unstable_mockModule('../../../repositories/landingPageDomain.repository.js', () => ({
  default: mockDomainRepo,
}));

jest.unstable_mockModule('../../../repositories/landingPage.repository.js', () => ({
  default: mockLandingPageRepo,
}));

jest.unstable_mockModule('../../cloudflare.service.js', () => ({
  default: mockCloudflareService,
}));

jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: jest.fn().mockResolvedValue({ limit: 10 }),
}));

jest.unstable_mockModule('../../../middleware/dynamicCors.middleware.js', () => ({
  clearVerifiedDomainsCache: jest.fn(),
}));

jest.unstable_mockModule('dns/promises', () => ({
  default: {
    resolve: jest.fn(),
    resolve4: jest.fn(),
    resolveTxt: jest.fn(),
  },
}));

// Khoá HMAC của mã xác minh chủ sở hữu tên miền (buildOwnershipToken) — môi trường unit không đặt JWT_SECRET.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-jwt-secret';

const dns = (await import('dns/promises')).default;
const landingPageDomainModule = await import('../landingPageDomain.service.js');
const landingPageDomainService = landingPageDomainModule.default;
const { buildOwnershipToken } = landingPageDomainModule;

const authUser = { id: 1, role: 'user_admin' };
const landingPageId = 99;
const hostname = 'lp.example.com';

const activeDomainRow = {
  id: 7,
  landingPageId,
  hostname,
  status: 'active',
  cfManaged: false,
  verifiedAt: null,
  isApexDomain: false,
};

describe('landingPageDomain.service SSL provisioning calls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LP_CNAME_TARGET = 'founderai.biz';
    delete process.env.SSL_PROVISION_SCRIPT;

    mockLandingPageRepo.findByIdInScope.mockResolvedValue({ id: landingPageId, isPublished: true });
    mockLandingPageRepo.findById.mockResolvedValue({
      id: landingPageId,
      slug: 'launch',
      title: 'Test',
      htmlContent: '',
      isPublished: true,
      idUser: 1,
      domainType: 'system',
      domainSubtype: null,
    });
    mockLandingPageRepo.updateById.mockResolvedValue({});
    mockLandingPageRepo.updateByIdInScope.mockResolvedValue({});
    mockDomainRepo.findByLandingPageId.mockResolvedValue(activeDomainRow);
    mockDomainRepo.findByHostnameLower.mockResolvedValue(null);
    mockDomainRepo.countPendingOrActiveInScope.mockResolvedValue(0);
    mockDomainRepo.upsertForLanding.mockResolvedValue(undefined);
    mockDomainRepo.updateStatusById.mockResolvedValue(undefined);
    mockDomainRepo.findAllActive.mockResolvedValue([]);
    mockCloudflareService.isConfigured.mockReturnValue(true);
    mockCloudflareService.setupLandingPageDNS.mockResolvedValue({
      success: true,
      zoneId: 'zone-1',
      recordId: 'record-1',
      message: 'ok',
    });
    mockCloudflareService.deleteDnsRecord.mockResolvedValue({ success: true });
    dns.resolve.mockResolvedValue(['founderai.biz']);

    jest.spyOn(landingPageDomainService, 'provisionSsl').mockResolvedValue(undefined);
  });

  it('setHostname does not throw when DNS is verified and calls provisionSsl', async () => {
    const result = await landingPageDomainService.setHostname(
      landingPageId,
      hostname,
      false,
      authUser,
    );

    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledWith(expect.objectContaining({
      landingPageId,
      hostname,
      status: 'active',
    }));
    expect(landingPageDomainService.provisionSsl).toHaveBeenCalledWith(hostname);
    expect(result.status).toBe('active');
  });

  it('verifyDns activates domain and calls provisionSsl without throwing', async () => {
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue({
      ...activeDomainRow,
      status: 'pending_verification',
    });

    const result = await landingPageDomainService.verifyDns(landingPageId, authUser);

    expect(mockDomainRepo.updateStatusById).toHaveBeenCalledWith(activeDomainRow.id, 'active');
    expect(landingPageDomainService.provisionSsl).toHaveBeenCalledWith(hostname);
    expect(result.status).toBe('active');
  });

  it('autoProvisionSubdomain persists pending status when Cloudflare is not configured', async () => {
    mockCloudflareService.isConfigured.mockReturnValue(false);

    const result = await landingPageDomainService.autoProvisionSubdomain(landingPageId, 'launch');

    expect(result).toEqual(expect.objectContaining({
      hostname: 'launch.founderai.biz',
      cfManaged: true,
      ok: false,
    }));
    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledWith(expect.objectContaining({
      landingPageId,
      hostname: 'launch.founderai.biz',
      status: 'pending_verification',
      cfManaged: true,
      cfZoneId: null,
      cfRecordId: null,
      cfHostnameId: null,
    }));
  });

  it('provisionSslForAllActiveDomains skips Cloudflare-managed platform subdomains', async () => {
    process.env.SSL_PROVISION_SCRIPT = '/tmp/ssl-auto-provision.sh';
    mockDomainRepo.findAllActive.mockResolvedValue([
      {
        id: 1,
        hostname: 'launch.founderai.biz',
        status: 'active',
        cfManaged: true,
        cfHostnameId: null,
      },
      {
        id: 2,
        hostname: 'lp.customer.com',
        status: 'active',
        cfManaged: false,
        cfHostnameId: null,
      },
    ]);

    await landingPageDomainService.provisionSslForAllActiveDomains();

    expect(landingPageDomainService.provisionSsl).toHaveBeenCalledTimes(1);
    expect(landingPageDomainService.provisionSsl).toHaveBeenCalledWith('lp.customer.com');
  });

  it('verifyDns retries Cloudflare provisioning for pending platform subdomains', async () => {
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue({
      id: 8,
      landingPageId,
      hostname: 'launch.founderai.biz',
      status: 'pending_verification',
      cfManaged: true,
      cfHostnameId: null,
      isApexDomain: false,
    });
    mockDomainRepo.findByLandingPageId.mockResolvedValue({
      id: 8,
      landingPageId,
      hostname: 'launch.founderai.biz',
      status: 'active',
      cfManaged: true,
      cfZoneId: 'zone-1',
      cfRecordId: 'record-1',
      cfHostnameId: null,
      verifiedAt: new Date(),
      isApexDomain: false,
    });

    const result = await landingPageDomainService.verifyDns(landingPageId, authUser);

    expect(mockCloudflareService.setupLandingPageDNS).toHaveBeenCalledWith('launch.founderai.biz', 'founderai.biz');
    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledWith(expect.objectContaining({
      landingPageId,
      hostname: 'launch.founderai.biz',
      status: 'active',
      cfManaged: true,
      cfZoneId: 'zone-1',
      cfRecordId: 'record-1',
    }));
    expect(landingPageDomainService.provisionSsl).not.toHaveBeenCalled();
    expect(result.status).toBe('active');
    expect(result.cfManaged).toBe(true);
  });
});

/**
 * PLAN_TEN_MIEN_RIENG (03/10/2026) — kết nối tên miền riêng CHỈ KHI DNS đã đúng; checkHostname không ghi gì;
 * remove() trả trang về link miễn phí.
 */
describe('landingPageDomain.service — tên miền riêng chỉ kết nối khi DNS đúng', () => {
  const freeRow = {
    id: 5,
    landingPageId,
    hostname: 'launch.founderai.biz',
    status: 'active',
    cfManaged: true,
    cfZoneId: 'zone-1',
    cfRecordId: 'rec-1',
    cfHostnameId: null,
    isApexDomain: false,
  };
  const customRow = { ...activeDomainRow, status: 'active', cfManaged: false, isApexDomain: false };
  const landing = {
    id: landingPageId,
    slug: 'launch',
    title: 'Test',
    htmlContent: '<p>x</p>',
    isPublished: true,
    idUser: 1,
    workspaceOwnerId: 1,
    domainType: 'system',
  };

  const dnsNotFound = () => Object.assign(new Error('queryCname ENOTFOUND'), { code: 'ENOTFOUND' });
  const txtValueFor = (ownerId, host) => `founderai-verify=${buildOwnershipToken(ownerId, host)}`;

  function expectNoDomainWrites() {
    expect(mockDomainRepo.upsertForLanding).not.toHaveBeenCalled();
    expect(mockDomainRepo.deleteByLandingPageId).not.toHaveBeenCalled();
    expect(mockDomainRepo.updateStatusById).not.toHaveBeenCalled();
    expect(mockLandingPageRepo.updateByIdInScope).not.toHaveBeenCalled();
    expect(mockCloudflareService.deleteDnsRecord).not.toHaveBeenCalled();
    expect(mockCloudflareService.setupLandingPageDNS).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LP_CNAME_TARGET = 'founderai.biz';
    delete process.env.LP_APEX_FIXED_IP;
    delete process.env.SSL_PROVISION_SCRIPT;

    mockLandingPageRepo.findByIdInScope.mockResolvedValue(landing);
    mockLandingPageRepo.updateByIdInScope.mockResolvedValue({});
    mockDomainRepo.findByLandingPageId.mockResolvedValue(freeRow);
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue(freeRow);
    mockDomainRepo.findByHostnameLower.mockResolvedValue(null);
    mockDomainRepo.countPendingOrActiveInScope.mockResolvedValue(1);
    mockDomainRepo.upsertForLanding.mockResolvedValue(undefined);
    mockDomainRepo.deleteByLandingPageId.mockResolvedValue(true);
    mockCloudflareService.isConfigured.mockReturnValue(true);
    mockCloudflareService.setupLandingPageDNS.mockResolvedValue({
      success: true,
      zoneId: 'zone-2',
      recordId: 'rec-2',
      message: 'ok',
    });
    mockCloudflareService.deleteDnsRecord.mockResolvedValue({ success: true });
    dns.resolve.mockRejectedValue(dnsNotFound());
    dns.resolve4.mockRejectedValue(dnsNotFound());
    dns.resolveTxt.mockRejectedValue(Object.assign(new Error('queryTxt ENODATA'), { code: 'ENODATA' }));

    jest.spyOn(landingPageDomainService, 'provisionSsl').mockResolvedValue(undefined);
  });

  it('setHostname khi DNS CHƯA đúng → 422 kèm bảng DNS cần thêm; KHÔNG ghi gì, KHÔNG đụng subdomain miễn phí', async () => {
    const err = await landingPageDomainService
      .setHostname(landingPageId, 'lp.example.com', false, authUser)
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(422);
    expect(err.message).toMatch(/lp\.example\.com/);
    expect(err.data).toEqual(expect.objectContaining({
      verified: false,
      reason: 'not_found',
      hostname: 'lp.example.com',
      isApexDomain: false,
      dnsRecords: [
        { type: 'CNAME', host: 'lp', value: 'founderai.biz', ttl: 3600 },
        { type: 'TXT', host: '_founderai-verify.lp', value: `founderai-verify=${buildOwnershipToken(1, 'lp.example.com')}`, ttl: 3600 },
      ],
      cnameTarget: 'founderai.biz',
    }));
    expectNoDomainWrites();
    expect(landingPageDomainService.provisionSsl).not.toHaveBeenCalled();
  });

  it('setHostname khi DNS đúng, trang đang dùng link miễn phí → upsert hàng riêng active THAY hàng miễn phí, dọn DNS Cloudflare cũ, domain_type=custom, không xoá hàng', async () => {
    dns.resolve.mockResolvedValue(['founderai.biz']);
    dns.resolveTxt.mockResolvedValue([[txtValueFor(1, 'lp.example.com')]]);

    const result = await landingPageDomainService.setHostname(landingPageId, 'lp.example.com', false, authUser);

    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledTimes(1);
    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledWith(expect.objectContaining({
      landingPageId,
      hostname: 'lp.example.com',
      status: 'active',
      cfManaged: false,
      cfZoneId: null,
      cfRecordId: null,
      isApexDomain: false,
    }));
    // Hàng miễn phí bị upsert thay thế trong MỘT câu lệnh — không xoá hàng trước.
    expect(mockDomainRepo.deleteByLandingPageId).not.toHaveBeenCalled();
    expect(mockCloudflareService.deleteDnsRecord).toHaveBeenCalledWith('zone-1', 'rec-1');
    expect(mockLandingPageRepo.updateByIdInScope).toHaveBeenCalledWith(
      landingPageId,
      expect.objectContaining({ domainType: 'custom', domainSubtype: 'subdomain' }),
      expect.anything()
    );
    expect(landingPageDomainService.provisionSsl).toHaveBeenCalledWith('lp.example.com');
    expect(result.configured).toBe(true);
  });

  it('checkHostname KHÔNG ghi gì dù DNS đúng hay sai; trả verified + bảng bản ghi + câu hướng dẫn', async () => {
    const wrong = await landingPageDomainService.checkHostname(landingPageId, 'lp.example.com', false, authUser);
    expect(wrong).toEqual(expect.objectContaining({
      verified: false,
      dnsRecords: [
        expect.objectContaining({ type: 'CNAME', host: 'lp', value: 'founderai.biz' }),
        expect.objectContaining({ type: 'TXT', host: '_founderai-verify.lp' }),
      ],
    }));
    expect(wrong.message).toMatch(/lp\.example\.com/);

    dns.resolve.mockResolvedValue(['founderai.biz']);
    dns.resolveTxt.mockResolvedValue([[txtValueFor(1, 'lp.example.com')]]);
    const right = await landingPageDomainService.checkHostname(landingPageId, 'lp.example.com', false, authUser);
    expect(right.verified).toBe(true);

    expectNoDomainWrites();
    expect(landingPageDomainService.provisionSsl).not.toHaveBeenCalled();
  });

  it('checkHostname tên miền chính (apex) → bản ghi A tới IP cố định của hệ thống', async () => {
    process.env.LP_APEX_FIXED_IP = '203.0.113.9';
    dns.resolve4.mockResolvedValue(['203.0.113.9']);
    dns.resolveTxt.mockResolvedValue([[txtValueFor(1, 'example.com')]]);

    const result = await landingPageDomainService.checkHostname(landingPageId, 'example.com', true, authUser);

    expect(result).toEqual(expect.objectContaining({
      verified: true,
      isApexDomain: true,
      apexFixedIp: '203.0.113.9',
      dnsRecords: [
        { type: 'A', host: '@', value: '203.0.113.9', ttl: 3600 },
        { type: 'TXT', host: '_founderai-verify', value: txtValueFor(1, 'example.com'), ttl: 3600 },
      ],
    }));
    expectNoDomainWrites();
  });

  it('checkHostname báo trước các điều kiện của "Kết nối": trang chưa xuất bản → 400; hostname trang khác → 409', async () => {
    mockLandingPageRepo.findByIdInScope.mockResolvedValue({ ...landing, isPublished: false });
    await expect(landingPageDomainService.checkHostname(landingPageId, 'lp.example.com', false, authUser))
      .rejects.toMatchObject({ statusCode: 400 });

    mockLandingPageRepo.findByIdInScope.mockResolvedValue(landing);
    mockDomainRepo.findByHostnameLower.mockResolvedValue({ id: 99, landingPageId: 12345, hostname: 'lp.example.com' });
    await expect(landingPageDomainService.checkHostname(landingPageId, 'lp.example.com', false, authUser))
      .rejects.toMatchObject({ statusCode: 409 });
    expectNoDomainWrites();
  });

  it('remove: tên miền riêng + có slug → cấp subdomain miễn phí THAY hàng riêng (upsert), domain_type=system, không xoá hàng trước', async () => {
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue(customRow);
    mockLandingPageRepo.findByIdInScope.mockResolvedValue({ ...landing, domainType: 'custom' });
    mockDomainRepo.findByLandingPageId.mockResolvedValue({ ...freeRow, cfZoneId: 'zone-2', cfRecordId: 'rec-2' });

    const result = await landingPageDomainService.remove(landingPageId, authUser);

    expect(mockCloudflareService.setupLandingPageDNS).toHaveBeenCalledWith('launch.founderai.biz', 'founderai.biz');
    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledWith(expect.objectContaining({
      landingPageId,
      hostname: 'launch.founderai.biz',
      status: 'active',
      cfManaged: true,
    }));
    expect(mockDomainRepo.deleteByLandingPageId).not.toHaveBeenCalled();
    expect(mockLandingPageRepo.updateByIdInScope).toHaveBeenCalledWith(
      landingPageId,
      expect.objectContaining({ domainType: 'system', domainSubtype: null }),
      expect.anything()
    );
    expect(result).toEqual(expect.objectContaining({ ok: true, configured: true, hostname: 'launch.founderai.biz', cfManaged: true }));
  });

  it('remove: trang KHÔNG có slug → 400, không xoá, không cấp, không đổi domain_type', async () => {
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue(customRow);
    mockLandingPageRepo.findByIdInScope.mockResolvedValue({ ...landing, slug: null, domainType: 'custom' });

    await expect(landingPageDomainService.remove(landingPageId, authUser))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/slug/) });
    expectNoDomainWrites();
  });

  it('remove: cấp subdomain miễn phí THẤT BẠI → báo lỗi và GIỮ tên miền riêng (không ghi hàng pending đè lên)', async () => {
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue(customRow);
    mockLandingPageRepo.findByIdInScope.mockResolvedValue({ ...landing, domainType: 'custom' });
    mockCloudflareService.setupLandingPageDNS.mockResolvedValue({ success: false, message: 'CF từ chối' });

    await expect(landingPageDomainService.remove(landingPageId, authUser))
      .rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('giữ nguyên') });

    expect(mockDomainRepo.upsertForLanding).not.toHaveBeenCalled();
    expect(mockDomainRepo.deleteByLandingPageId).not.toHaveBeenCalled();
    expect(mockLandingPageRepo.updateByIdInScope).not.toHaveBeenCalled();
  });

  it('remove: Cloudflare chưa cấu hình → cũng giữ tên miền riêng (không ghi pending đè)', async () => {
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue(customRow);
    mockLandingPageRepo.findByIdInScope.mockResolvedValue({ ...landing, domainType: 'custom' });
    mockCloudflareService.isConfigured.mockReturnValue(false);

    await expect(landingPageDomainService.remove(landingPageId, authUser)).rejects.toMatchObject({ statusCode: 502 });
    expect(mockDomainRepo.upsertForLanding).not.toHaveBeenCalled();
  });

  it('remove: trang đang dùng link miễn phí (không có tên miền riêng) → 400, KHÔNG xoá link miễn phí', async () => {
    await expect(landingPageDomainService.remove(landingPageId, authUser))
      .rejects.toMatchObject({ statusCode: 400 });
    expectNoDomainWrites();
  });

  it('remove chạy lại được: hàng đã là miễn phí nhưng domain_type còn custom → chỉ sửa nốt domain_type', async () => {
    mockLandingPageRepo.findByIdInScope.mockResolvedValue({ ...landing, domainType: 'custom' });

    const result = await landingPageDomainService.remove(landingPageId, authUser);

    expect(mockLandingPageRepo.updateByIdInScope).toHaveBeenCalledWith(
      landingPageId,
      expect.objectContaining({ domainType: 'system' }),
      expect.anything()
    );
    expect(mockDomainRepo.upsertForLanding).not.toHaveBeenCalled();
    expect(mockDomainRepo.deleteByLandingPageId).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

/**
 * PLAN_TEN_MIEN_TXT (20/10/2026) — tên miền riêng phải chứng minh chủ sở hữu bằng bản ghi TXT
 * `_founderai-verify.<hostname>` = `founderai-verify=<token>`; token gắn với workspace + hostname.
 */
describe('landingPageDomain.service — xác minh chủ sở hữu tên miền bằng TXT', () => {
  const workspaceA = { id: 1, role: 'user_admin' };
  const workspaceB = { id: 2, role: 'user_admin' };
  const host = 'lp.example.com';
  const freeRow = {
    id: 5,
    landingPageId,
    hostname: 'launch.founderai.biz',
    status: 'active',
    cfManaged: true,
    cfZoneId: 'zone-1',
    cfRecordId: 'rec-1',
    cfHostnameId: null,
    isApexDomain: false,
  };
  const landingOf = (ownerId) => ({
    id: landingPageId,
    slug: 'launch',
    title: 'Test',
    htmlContent: '<p>x</p>',
    isPublished: true,
    idUser: ownerId,
    workspaceOwnerId: ownerId,
    domainType: 'system',
  });
  const txtOf = (ownerId, hostname = host) => `founderai-verify=${buildOwnershipToken(ownerId, hostname)}`;
  const dnsError = (code) => Object.assign(new Error(`query ${code}`), { code });

  function expectNoDomainWrites() {
    expect(mockDomainRepo.upsertForLanding).not.toHaveBeenCalled();
    expect(mockDomainRepo.updateStatusById).not.toHaveBeenCalled();
    expect(mockLandingPageRepo.updateByIdInScope).not.toHaveBeenCalled();
    expect(mockCloudflareService.deleteDnsRecord).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LP_CNAME_TARGET = 'founderai.biz';
    delete process.env.LP_APEX_FIXED_IP;
    delete process.env.SSL_PROVISION_SCRIPT;

    mockLandingPageRepo.findByIdInScope.mockResolvedValue(landingOf(1));
    mockLandingPageRepo.updateByIdInScope.mockResolvedValue({});
    mockDomainRepo.findByLandingPageId.mockResolvedValue(freeRow);
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue(freeRow);
    mockDomainRepo.findByHostnameLower.mockResolvedValue(null);
    mockDomainRepo.countPendingOrActiveInScope.mockResolvedValue(1);
    mockDomainRepo.upsertForLanding.mockResolvedValue(undefined);
    mockCloudflareService.isConfigured.mockReturnValue(true);
    mockCloudflareService.deleteDnsRecord.mockResolvedValue({ success: true });
    // Mặc định: CNAME đã trỏ đúng, TXT chưa có.
    dns.resolve.mockResolvedValue(['founderai.biz']);
    dns.resolve4.mockRejectedValue(dnsError('ENOTFOUND'));
    dns.resolveTxt.mockRejectedValue(dnsError('ENODATA'));

    jest.spyOn(landingPageDomainService, 'provisionSsl').mockResolvedValue(undefined);
  });

  describe('buildOwnershipToken', () => {
    it('cùng workspace + cùng hostname (khác hoa/thường, khoảng trắng) → cùng token; 32 ký tự hex', () => {
      const a = buildOwnershipToken(1, 'lp.example.com');
      expect(a).toMatch(/^[0-9a-f]{32}$/);
      expect(buildOwnershipToken(1, 'LP.Example.COM')).toBe(a);
      expect(buildOwnershipToken('1', ' lp.example.com ')).toBe(a);
    });

    it('khác workspace → khác token; khác hostname → khác token', () => {
      const a = buildOwnershipToken(1, 'lp.example.com');
      expect(buildOwnershipToken(2, 'lp.example.com')).not.toBe(a);
      expect(buildOwnershipToken(1, 'www.example.com')).not.toBe(a);
      // Ranh giới ghép chuỗi: dấu ':' phân tách workspace và hostname nên (1, "2.example.com") ≠ (12, ".example.com").
      expect(buildOwnershipToken(1, '2.example.com')).not.toBe(buildOwnershipToken(12, '.example.com'));
    });

    it('thiếu JWT_SECRET → ném lỗi rõ, không dùng chuỗi cố định', () => {
      const saved = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        expect(() => buildOwnershipToken(1, host)).toThrow(/JWT_SECRET/);
      } finally {
        process.env.JWT_SECRET = saved;
      }
    });

    it('thiếu workspace hoặc hostname → ném lỗi (không sinh token cho chuỗi rỗng)', () => {
      expect(() => buildOwnershipToken(undefined, host)).toThrow();
      expect(() => buildOwnershipToken(1, '')).toThrow();
    });
  });

  it('A kiểm hostname mới, CNAME đúng, CHƯA có TXT → verified=false, lý do txt_missing, bảng có dòng TXT với token của A, câu hướng dẫn nêu tên + giá trị', async () => {
    const result = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);

    expect(result).toEqual(expect.objectContaining({ verified: false, reason: 'txt_missing' }));
    expect(result.dnsRecords).toEqual([
      { type: 'CNAME', host: 'lp', value: 'founderai.biz', ttl: 3600 },
      { type: 'TXT', host: '_founderai-verify.lp', value: txtOf(1), ttl: 3600 },
    ]);
    expect(result.message).toContain('TXT');
    expect(result.message).toContain(txtOf(1));
    expect(result.message).toContain('_founderai-verify.lp.example.com');
    expect(dns.resolveTxt).toHaveBeenCalledWith('_founderai-verify.lp.example.com');
    expectNoDomainWrites();
  });

  it('A thêm TXT đúng → checkHostname verified=true và setHostname thành công, ghi hàng riêng active', async () => {
    dns.resolveTxt.mockResolvedValue([[txtOf(1)]]);

    const check = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);
    expect(check.verified).toBe(true);

    const result = await landingPageDomainService.setHostname(landingPageId, host, false, workspaceA);

    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledWith(expect.objectContaining({
      landingPageId,
      hostname: host,
      status: 'active',
      cfManaged: false,
    }));
    expect(landingPageDomainService.provisionSsl).toHaveBeenCalledWith(host);
    expect(result.configured).toBe(true);
  });

  it('B (workspace khác) nhập cùng hostname, CNAME đúng, TXT là của A → 422 txt_wrong, KHÔNG ghi gì (token B ≠ token A)', async () => {
    mockLandingPageRepo.findByIdInScope.mockResolvedValue(landingOf(2));
    dns.resolveTxt.mockResolvedValue([[txtOf(1)]]);

    const err = await landingPageDomainService
      .setHostname(landingPageId, host, false, workspaceB)
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(422);
    expect(err.data).toEqual(expect.objectContaining({ verified: false, reason: 'txt_wrong' }));
    // Bảng bản ghi B được hướng dẫn thêm là token CỦA B, không phải của A.
    const txtRow = err.data.dnsRecords.find((r) => r.type === 'TXT');
    expect(txtRow.value).toBe(txtOf(2));
    expect(txtRow.value).not.toBe(txtOf(1));
    expectNoDomainWrites();
    expect(landingPageDomainService.provisionSsl).not.toHaveBeenCalled();
  });

  it('setHostname khi CNAME đúng nhưng chưa có TXT → 422 txt_missing, KHÔNG ghi gì, không đụng Cloudflare', async () => {
    const err = await landingPageDomainService
      .setHostname(landingPageId, host, false, workspaceA)
      .then(() => null, (e) => e);

    expect(err.statusCode).toBe(422);
    expect(err.data).toEqual(expect.objectContaining({ verified: false, reason: 'txt_missing', hostname: host }));
    expect(err.message).toContain(txtOf(1));
    expectNoDomainWrites();
  });

  it('CNAME sai thì không tra TXT (lỗi CNAME báo trước); bảng bản ghi vẫn có dòng TXT để khách cài một lượt', async () => {
    dns.resolve.mockResolvedValue(['nhaquangcao.vn']);

    const result = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);

    expect(result).toEqual(expect.objectContaining({ verified: false, reason: 'wrong_target' }));
    expect(result.dnsRecords.map((r) => r.type)).toEqual(['CNAME', 'TXT']);
    expect(dns.resolveTxt).not.toHaveBeenCalled();
  });

  it('landing ĐANG active với đúng hostname này, bấm kết nối lại → KHÔNG đòi TXT (không tra TXT), thành công', async () => {
    const own = { ...freeRow, id: 9, hostname: host, status: 'active', cfManaged: false, cfZoneId: null, cfRecordId: null };
    mockDomainRepo.findByLandingPageId.mockResolvedValue(own);
    // TXT không có (đã bị xoá khỏi DNS) — vẫn phải qua.
    dns.resolveTxt.mockRejectedValue(dnsError('ENODATA'));

    const check = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);
    expect(check.verified).toBe(true);

    const result = await landingPageDomainService.setHostname(landingPageId, 'LP.Example.com', false, workspaceA);

    expect(dns.resolveTxt).not.toHaveBeenCalled();
    expect(mockDomainRepo.upsertForLanding).toHaveBeenCalledWith(expect.objectContaining({ hostname: host, status: 'active' }));
    expect(result.configured).toBe(true);
  });

  it('ngoại lệ chỉ áp cho ĐÚNG hostname đang active: landing đang active ở hostname A, đổi sang hostname B khác → vẫn đòi TXT', async () => {
    const own = { ...freeRow, id: 9, hostname: 'cu.example.com', status: 'active', cfManaged: false };
    mockDomainRepo.findByLandingPageId.mockResolvedValue(own);

    const err = await landingPageDomainService
      .setHostname(landingPageId, host, false, workspaceA)
      .then(() => null, (e) => e);

    expect(err.statusCode).toBe(422);
    expect(err.data.reason).toBe('txt_missing');
    expectNoDomainWrites();
  });

  it('hàng pending_verification cùng hostname KHÔNG được hưởng ngoại lệ (chỉ active): setHostname vẫn đòi TXT', async () => {
    mockDomainRepo.findByLandingPageId.mockResolvedValue({ ...freeRow, id: 9, hostname: host, status: 'pending_verification', cfManaged: false });

    const err = await landingPageDomainService
      .setHostname(landingPageId, host, false, workspaceA)
      .then(() => null, (e) => e);

    expect(err.statusCode).toBe(422);
    expect(err.data.reason).toBe('txt_missing');
  });

  it('hàng pending_verification cũ qua verifyDns → hành vi cũ: CNAME đúng là active, KHÔNG tra TXT', async () => {
    const pending = { id: 9, landingPageId, hostname: host, status: 'pending_verification', cfManaged: false, isApexDomain: false };
    mockDomainRepo.findByLandingPageIdInScope.mockResolvedValue(pending);
    mockDomainRepo.findByLandingPageId.mockResolvedValue({ ...pending, status: 'active' });

    const result = await landingPageDomainService.verifyDns(landingPageId, workspaceA);

    expect(dns.resolveTxt).not.toHaveBeenCalled();
    expect(mockDomainRepo.updateStatusById).toHaveBeenCalledWith(9, 'active');
    expect(result.status).toBe('active');
  });

  describe('đọc bản ghi TXT', () => {
    it('TXT bị chia nhiều mảnh (mảng các mảng) → nối lại các mảnh của MỘT bản ghi rồi so', async () => {
      const value = txtOf(1);
      dns.resolveTxt.mockResolvedValue([[value.slice(0, 10), value.slice(10, 25), value.slice(25)]]);

      const result = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);

      expect(result.verified).toBe(true);
    });

    it('nhiều bản ghi TXT cùng tên, chỉ một bản khớp (không phải phần tử đầu) → khớp', async () => {
      dns.resolveTxt.mockResolvedValue([
        ['v=spf1 include:_spf.example.com ~all'],
        ['founderai-verify=0000000000000000000000000000dead'],
        [txtOf(1)],
      ]);

      const result = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);

      expect(result.verified).toBe(true);
    });

    it('khách dán kèm dấu nháy kép / khoảng trắng thừa → vẫn khớp', async () => {
      dns.resolveTxt.mockResolvedValue([[`  "${txtOf(1)}"  `]]);

      const result = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);

      expect(result.verified).toBe(true);
    });

    it('có TXT nhưng không bản nào khớp → txt_wrong, kèm giá trị đang có trong câu hướng dẫn', async () => {
      dns.resolveTxt.mockResolvedValue([['founderai-verify=sai-gia-tri'], ['khac']]);

      const result = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);

      expect(result).toEqual(expect.objectContaining({ verified: false, reason: 'txt_wrong' }));
      expect(result.message).toContain('founderai-verify=sai-gia-tri');
      expect(result.message).toContain(txtOf(1));
    });

    it('ENOTFOUND cũng là chưa có bản ghi (txt_missing)', async () => {
      dns.resolveTxt.mockRejectedValue(dnsError('ENOTFOUND'));

      const result = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);

      expect(result).toEqual(expect.objectContaining({ verified: false, reason: 'txt_missing' }));
    });

    it('lỗi DNS tạm thời (timeout/SERVFAIL) → reason transient, không kết luận "thiếu TXT"; setHostname 422 và không ghi gì', async () => {
      dns.resolveTxt.mockRejectedValue(dnsError('ETIMEOUT'));

      const check = await landingPageDomainService.checkHostname(landingPageId, host, false, workspaceA);
      expect(check).toEqual(expect.objectContaining({ verified: false, reason: 'transient' }));
      expect(check.message).toMatch(/tạm thời/);

      await expect(landingPageDomainService.setHostname(landingPageId, host, false, workspaceA))
        .rejects.toMatchObject({ statusCode: 422 });
      expectNoDomainWrites();
    });

    it('tên miền chính (apex): TXT ở _founderai-verify.<hostname>, hiển thị host _founderai-verify (không có phần đuôi)', async () => {
      process.env.LP_APEX_FIXED_IP = '203.0.113.9';
      dns.resolve4.mockResolvedValue(['203.0.113.9']);
      dns.resolveTxt.mockResolvedValue([[txtOf(1, 'example.com')]]);

      const result = await landingPageDomainService.checkHostname(landingPageId, 'example.com', true, workspaceA);

      expect(dns.resolveTxt).toHaveBeenCalledWith('_founderai-verify.example.com');
      expect(result.verified).toBe(true);
      expect(result.dnsRecords).toEqual([
        { type: 'A', host: '@', value: '203.0.113.9', ttl: 3600 },
        { type: 'TXT', host: '_founderai-verify', value: txtOf(1, 'example.com'), ttl: 3600 },
      ]);
    });
  });
});
