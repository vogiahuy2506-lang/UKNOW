import { describe, it, expect, jest } from '@jest/globals';
import {
  recordConsents,
  getUserLatestConsents,
  getUserConsentHistory,
  hasUserConsentedToAll,
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
      consents: { terms: true, privacy: true, dpa: true },
      source: 'register',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 JestTest',
      client: mockClient,
    });

    expect(recorded).toHaveLength(3);
    expect(mockClient.query).toHaveBeenCalledTimes(3);

    // Kiểm tra thông tin từng dòng
    const termsCall = mockClient.query.mock.calls.find((c) => c[1][1] === 'terms');
    expect(termsCall).toBeDefined();
    expect(termsCall[1][0]).toBe(42);
    expect(termsCall[1][1]).toBe('terms');
    expect(termsCall[1][2]).toBe(true);
    expect(termsCall[1][3]).toBe(LEGAL_DOCUMENTS.terms.version);
    expect(termsCall[1][4]).toBe(LEGAL_DOCUMENTS.terms.hash);
    expect(termsCall[1][5]).toBe('register');
    expect(termsCall[1][6]).toBe('127.0.0.1');
    expect(termsCall[1][7]).toBe('Mozilla/5.0 JestTest');
  });

  it('getUserLatestConsents trả về map purpose -> granted mới nhất', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { purpose: 'terms', granted: true },
          { purpose: 'privacy', granted: true },
          { purpose: 'dpa', granted: true },
        ],
      }),
    };

    const latest = await getUserLatestConsents(42, mockClient);
    expect(latest).toEqual({
      terms: true,
      privacy: true,
      dpa: true,
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
          { purpose: 'terms', granted: true },
          { purpose: 'privacy', granted: true },
          { purpose: 'dpa', granted: true },
        ],
      }),
    };
    expect(await hasUserConsentedToAll(42, undefined, mockClientTrue)).toBe(true);

    const mockClientMissingOne = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { purpose: 'terms', granted: true },
          { purpose: 'privacy', granted: true },
          { purpose: 'dpa', granted: false },
        ],
      }),
    };
    expect(await hasUserConsentedToAll(42, undefined, mockClientMissingOne)).toBe(false);

    const mockClientEmpty = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    expect(await hasUserConsentedToAll(42, undefined, mockClientEmpty)).toBe(false);
  });
});
