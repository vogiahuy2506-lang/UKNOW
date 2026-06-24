import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockDomainRepo = {
  findByLandingPageId: jest.fn(),
  findByLandingPageIdInScope: jest.fn(),
  upsertForLanding: jest.fn(),
  updateStatusById: jest.fn(),
  findByHostnameLower: jest.fn(),
  countPendingOrActiveInScope: jest.fn(),
};

const mockLandingPageRepo = {
  findByIdInScope: jest.fn(),
};

jest.unstable_mockModule('../../../repositories/landingPageDomain.repository.js', () => ({
  default: mockDomainRepo,
}));

jest.unstable_mockModule('../../../repositories/landingPage.repository.js', () => ({
  default: mockLandingPageRepo,
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
    mockDomainRepo.findByLandingPageId.mockResolvedValue(activeDomainRow);
    mockDomainRepo.findByHostnameLower.mockResolvedValue(null);
    mockDomainRepo.countPendingOrActiveInScope.mockResolvedValue(0);
    mockDomainRepo.upsertForLanding.mockResolvedValue(undefined);
    mockDomainRepo.updateStatusById.mockResolvedValue(undefined);
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
});
