import { describe, it, expect, jest } from '@jest/globals';
import {
  recordConsents,
  getUserLatestConsents,
  getUserConsentHistory,
  hasUserConsentedToAll,
  hasConsentedCurrent,
  isConsentVersionOutdated,
} from '../userConsent.repository.js';
import { LEGAL_DOCUMENTS } from '../../../config/legalDocuments.config.js';

describe('userConsent.repository', () => {
  it('recordConsents chèn đủ các dòng với đúng version, hash, source, IP, UA', async () => {
    const mockClient = {
      query: jest.fn().mockImplementation((sql, params) => {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              user_id: params[0],
              purpose: params[1],
              granted: params[2],
              document_version: params[3],
              document_hash: params[4],
              source: params[5],
              ip_address: params[6],
              user_agent: params[7],
              created_at: new Date(),
            },
          ],
        });
      }),
    };

    const recorded = await recordConsents({
      userId: 42,
      consents: {
        terms: true,
        privacy: true,
        dpa: true,
      },
      source: 'register',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 JestTest',
      client: mockClient,
    });

    expect(recorded).toHaveLength(3);
    expect(mockClient.query).toHaveBeenCalledTimes(3);

    // Kiểm tra thông tin từng dòng
    const termsCall = mockClient.query.mock.calls.find((call) => call[1][1] === 'terms');
    expect(termsCall).toBeDefined();
    expect(termsCall[1][0]).toBe(42);
    expect(termsCall[1][2]).toBe(true);
    expect(termsCall[1][3]).toBe(LEGAL_DOCUMENTS.terms.version);
    expect(termsCall[1][4]).toBe(LEGAL_DOCUMENTS.terms.hash);
    expect(termsCall[1][5]).toBe('register');
    expect(termsCall[1][6]).toBe('127.0.0.1');
    expect(termsCall[1][7]).toBe('Mozilla/5.0 JestTest');
  });

  it('getUserLatestConsents trả về map purpose -> { granted, document_version } mới nhất', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { purpose: 'terms', granted: true, document_version: '2026-09-10' },
          { purpose: 'privacy', granted: true, document_version: '2026-09-10' },
          { purpose: 'dpa', granted: true, document_version: '2026-09-10' },
        ],
      }),
    };

    const latest = await getUserLatestConsents(42, mockClient);
    expect(latest).toEqual({
      terms: { granted: true, document_version: '2026-09-10' },
      privacy: { granted: true, document_version: '2026-09-10' },
      dpa: { granted: true, document_version: '2026-09-10' },
    });
  });

  it('getUserLatestConsents trả về null khi không có dòng nào', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const latest = await getUserLatestConsents(99, mockClient);
    expect(latest).toBeNull();
  });

  it('hasUserConsentedToAll kiểm tra đủ 3 điều kiện bắt buộc', async () => {
    const mockClientTrue = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { purpose: 'terms', granted: true, document_version: '2026-09-10' },
          { purpose: 'privacy', granted: true, document_version: '2026-09-10' },
          { purpose: 'dpa', granted: true, document_version: '2026-09-10' },
        ],
      }),
    };
    expect(await hasUserConsentedToAll(42, undefined, mockClientTrue)).toBe(true);

    const mockClientMissingOne = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { purpose: 'terms', granted: true, document_version: '2026-09-10' },
          { purpose: 'privacy', granted: true, document_version: '2026-09-10' },
          { purpose: 'dpa', granted: false, document_version: '2026-09-10' },
        ],
      }),
    };
    expect(await hasUserConsentedToAll(42, undefined, mockClientMissingOne)).toBe(false);

    const mockClientEmpty = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    expect(await hasUserConsentedToAll(42, undefined, mockClientEmpty)).toBe(false);
  });

  describe('hasConsentedCurrent & isConsentVersionOutdated (mục 2.4 plan)', () => {
    it('đủ 3 purpose + đúng version hiện hành → hasConsentedCurrent = true, isConsentVersionOutdated = false', () => {
      const consents = {
        terms: { granted: true, document_version: LEGAL_DOCUMENTS.terms.version },
        privacy: { granted: true, document_version: LEGAL_DOCUMENTS.privacy.version },
        dpa: { granted: true, document_version: LEGAL_DOCUMENTS.dpa.version },
      };

      expect(hasConsentedCurrent(consents)).toBe(true);
      expect(isConsentVersionOutdated(consents)).toBe(false);
    });

    it('đủ 3 purpose nhưng 1 purpose có version cũ → hasConsentedCurrent = false, isConsentVersionOutdated = true', () => {
      const consents = {
        terms: { granted: true, document_version: '2026-09-01' }, // Cũ hơn 2026-09-10
        privacy: { granted: true, document_version: LEGAL_DOCUMENTS.privacy.version },
        dpa: { granted: true, document_version: LEGAL_DOCUMENTS.dpa.version },
      };

      expect(hasConsentedCurrent(consents)).toBe(false);
      expect(isConsentVersionOutdated(consents)).toBe(true);
    });

    it('thiếu 1 purpose bắt buộc → hasConsentedCurrent = false', () => {
      const consents = {
        terms: { granted: true, document_version: LEGAL_DOCUMENTS.terms.version },
        privacy: { granted: true, document_version: LEGAL_DOCUMENTS.privacy.version },
      };

      expect(hasConsentedCurrent(consents)).toBe(false);
      // Đã có ít nhất 1 consent nhưng chưa đủ/đúng hiện hành → outdated = true
      expect(isConsentVersionOutdated(consents)).toBe(true);

      // Chưa có bất kỳ consent nào → outdated = false
      expect(hasConsentedCurrent(null)).toBe(false);
      expect(isConsentVersionOutdated(null)).toBe(false);
      expect(hasConsentedCurrent({})).toBe(false);
      expect(isConsentVersionOutdated({})).toBe(false);
    });
  });
});
