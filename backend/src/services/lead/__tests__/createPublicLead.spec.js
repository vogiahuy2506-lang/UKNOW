import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLeadRepo = {
  insertLead: jest.fn(),
  findFiltered: jest.fn(),
  countFiltered: jest.fn(),
};
const mockLandingRepo = {
  findPublishedBySlug: jest.fn(),
  listLeadFormConfigsInScope: jest.fn(),
};
const mockEventRepo = {
  insert: jest.fn(),
};

jest.unstable_mockModule('../../../repositories/lead.repository.js', () => ({ default: mockLeadRepo }));
jest.unstable_mockModule('../../../repositories/landingPage.repository.js', () => ({ default: mockLandingRepo }));
jest.unstable_mockModule('../../../repositories/landingPageEvent.repository.js', () => ({ default: mockEventRepo }));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn(async () => false),
}));

const { resourceIsLocked } = await import('../../../utils/topupLockGate.util.js');
const leadService = (await import('../lead.service.js')).default;

const baseBody = {
  lastName: 'Nguyen',
  firstName: 'An',
  email: 'an@u.local',
  phone: '0901234567',
  marketingConsent: true,
  occupation: 'Freelancer',
  interestArea: 'AI cho Giáo dục',
  landingPageSlug: 'pub-lead',
};

describe('LeadService.createPublicLead fail-closed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resourceIsLocked.mockResolvedValue(false);
    mockEventRepo.insert.mockResolvedValue({ id: 1 });
    mockLeadRepo.insertLead.mockImplementation(async (payload) => ({ id: 99, ...payload }));
  });

  it('thiếu slug → 400, không insert', async () => {
    await expect(leadService.createPublicLead({ ...baseBody, landingPageSlug: '' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/trang đích/i) });
    expect(mockLeadRepo.insertLead).not.toHaveBeenCalled();
  });

  it('slug unpublished → 400, không fallback user 1', async () => {
    mockLandingRepo.findPublishedBySlug.mockResolvedValue(null);
    await expect(leadService.createPublicLead(baseBody))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mockLeadRepo.insertLead).not.toHaveBeenCalled();
  });

  it('hidden occupation bị ignore dù client spoof', async () => {
    mockLandingRepo.findPublishedBySlug.mockResolvedValue({
      id: 7,
      idUser: 42,
      customConfig: {
        leadForm: {
          version: 1,
          fixedFields: { occupation: { visible: false }, interestArea: { visible: true } },
          customFields: [],
        },
      },
    });
    const { row } = await leadService.createPublicLead(baseBody);
    expect(mockLeadRepo.insertLead).toHaveBeenCalledTimes(1);
    expect(mockLeadRepo.insertLead.mock.calls[0][0].idUser).toBe(42);
    expect(mockLeadRepo.insertLead.mock.calls[0][0].occupation).toBe('');
    expect(mockLeadRepo.insertLead.mock.calls[0][0].interestArea).toBe('AI cho Giáo dục');
    expect(row.id).toBe(99);
    expect(mockEventRepo.insert).toHaveBeenCalledTimes(1);
  });
});
