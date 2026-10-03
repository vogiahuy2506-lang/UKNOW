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
  },
}));

const dns = (await import('dns/promises')).default;
const landingPageDomainService = (await import('../landingPageDomain.service.js')).default;

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
      dnsRecords: [{ type: 'CNAME', host: 'lp', value: 'founderai.biz', ttl: 3600 }],
      cnameTarget: 'founderai.biz',
    }));
    expectNoDomainWrites();
    expect(landingPageDomainService.provisionSsl).not.toHaveBeenCalled();
  });

  it('setHostname khi DNS đúng, trang đang dùng link miễn phí → upsert hàng riêng active THAY hàng miễn phí, dọn DNS Cloudflare cũ, domain_type=custom, không xoá hàng', async () => {
    dns.resolve.mockResolvedValue(['founderai.biz']);

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
      dnsRecords: [expect.objectContaining({ type: 'CNAME', host: 'lp', value: 'founderai.biz' })],
    }));
    expect(wrong.message).toMatch(/lp\.example\.com/);

    dns.resolve.mockResolvedValue(['founderai.biz']);
    const right = await landingPageDomainService.checkHostname(landingPageId, 'lp.example.com', false, authUser);
    expect(right.verified).toBe(true);

    expectNoDomainWrites();
    expect(landingPageDomainService.provisionSsl).not.toHaveBeenCalled();
  });

  it('checkHostname tên miền chính (apex) → bản ghi A tới IP cố định của hệ thống', async () => {
    process.env.LP_APEX_FIXED_IP = '203.0.113.9';
    dns.resolve4.mockResolvedValue(['203.0.113.9']);

    const result = await landingPageDomainService.checkHostname(landingPageId, 'example.com', true, authUser);

    expect(result).toEqual(expect.objectContaining({
      verified: true,
      isApexDomain: true,
      apexFixedIp: '203.0.113.9',
      dnsRecords: [{ type: 'A', host: '@', value: '203.0.113.9', ttl: 3600 }],
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
