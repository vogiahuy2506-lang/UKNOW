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
const { default: leadService, parseMarketingConsent, mapLeadRowToCampaignItem } = await import('../lead.service.js');

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

  describe('Nghị định 330/2026: marketingConsent 3 trạng thái', () => {
    beforeEach(() => {
      mockLandingRepo.findPublishedBySlug.mockResolvedValue({
        id: 1,
        idUser: 10,
        customConfig: { leadForm: { version: 1, fixedFields: {}, customFields: [] } },
      });
    });

    it('form có ô tick, không tick (marketingConsent: false) → LƯU FALSE, KHÔNG báo lỗi 400', async () => {
      const { row } = await leadService.createPublicLead({ ...baseBody, marketingConsent: false });
      expect(mockLeadRepo.insertLead).toHaveBeenCalledTimes(1);
      expect(mockLeadRepo.insertLead.mock.calls[0][0].marketingConsent).toBe(false);
      expect(row.id).toBe(99);
    });

    it('form không có ô tick (thiếu marketingConsent) → LƯU NULL (chưa hỏi), KHÔNG báo lỗi', async () => {
      const bodyWithoutConsent = { ...baseBody };
      delete bodyWithoutConsent.marketingConsent;
      const { row } = await leadService.createPublicLead(bodyWithoutConsent);
      expect(mockLeadRepo.insertLead).toHaveBeenCalledTimes(1);
      expect(mockLeadRepo.insertLead.mock.calls[0][0].marketingConsent).toBeNull();
      expect(row.id).toBe(99);
    });

    it('form urlencoded gửi marketingConsent="on" (HTML checkbox mặc định) → LƯU TRUE', async () => {
      const { row } = await leadService.createPublicLead({ ...baseBody, marketingConsent: 'on' });
      expect(mockLeadRepo.insertLead).toHaveBeenCalledTimes(1);
      expect(mockLeadRepo.insertLead.mock.calls[0][0].marketingConsent).toBe(true);
      expect(row.id).toBe(99);
    });

    it('form gửi snake_case marketing_consent="false" → LƯU FALSE', async () => {
      const bodySnake = { ...baseBody };
      delete bodySnake.marketingConsent;
      bodySnake.marketing_consent = 'false';
      const { row } = await leadService.createPublicLead(bodySnake);
      expect(mockLeadRepo.insertLead).toHaveBeenCalledTimes(1);
      expect(mockLeadRepo.insertLead.mock.calls[0][0].marketingConsent).toBe(false);
      expect(row.id).toBe(99);
    });
  });
});

describe('parseMarketingConsent utility', () => {
  it('nhánh TRUE: true, 1, "true", "on", "1", hoa thường "ON", "True"', () => {
    expect(parseMarketingConsent(true)).toBe(true);
    expect(parseMarketingConsent(1)).toBe(true);
    expect(parseMarketingConsent('true')).toBe(true);
    expect(parseMarketingConsent('on')).toBe(true);
    expect(parseMarketingConsent('1')).toBe(true);
    expect(parseMarketingConsent('ON')).toBe(true);
    expect(parseMarketingConsent('True')).toBe(true);
    expect(parseMarketingConsent('  on  ')).toBe(true);
  });

  it('nhánh FALSE: false, 0, "false", "0", hoa thường "FALSE"', () => {
    expect(parseMarketingConsent(false)).toBe(false);
    expect(parseMarketingConsent(0)).toBe(false);
    expect(parseMarketingConsent('false')).toBe(false);
    expect(parseMarketingConsent('0')).toBe(false);
    expect(parseMarketingConsent('FALSE')).toBe(false);
    expect(parseMarketingConsent('  false  ')).toBe(false);
  });

  it('nhánh NULL (chưa hỏi): null, undefined, "", "abc", {}, []', () => {
    expect(parseMarketingConsent(null)).toBeNull();
    expect(parseMarketingConsent(undefined)).toBeNull();
    expect(parseMarketingConsent('')).toBeNull();
    expect(parseMarketingConsent('maybe')).toBeNull();
    expect(parseMarketingConsent({})).toBeNull();
    expect(parseMarketingConsent([])).toBeNull();
  });
});

describe('mapLeadRowToCampaignItem — bảo toàn NULL qua đường đọc', () => {
  it('giữ nguyên marketingConsent=null khi DB là null (chưa hỏi, không ép thành false)', () => {
    const row = { id: 1, last_name: 'Trần', first_name: 'B', email: 'b@test.local', marketing_consent: null };
    const item = mapLeadRowToCampaignItem(row);
    expect(item.marketingConsent).toBeNull();
  });

  it('giữ nguyên marketingConsent=false khi người dùng chủ động từ chối', () => {
    const row = { id: 2, last_name: 'Lê', first_name: 'C', email: 'c@test.local', marketing_consent: false };
    const item = mapLeadRowToCampaignItem(row);
    expect(item.marketingConsent).toBe(false);
  });

  it('giữ nguyên marketingConsent=true khi người dùng đã đồng ý', () => {
    const row = { id: 3, last_name: 'Phạm', first_name: 'D', email: 'd@test.local', marketing_consent: true };
    const item = mapLeadRowToCampaignItem(row);
    expect(item.marketingConsent).toBe(true);
  });
});
