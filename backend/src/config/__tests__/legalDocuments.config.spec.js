import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import {
  LEGAL_DOCUMENTS,
  REQUIRED_REGISTRATION_PURPOSES,
  getLegalDocument,
  computeDocumentHash,
  validateRegistrationConsents,
} from '../legalDocuments.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../../../../frontend');

describe('legalDocuments.config', () => {
  it('định nghĩa đủ 3 văn bản bắt buộc lúc đăng ký', () => {
    expect(REQUIRED_REGISTRATION_PURPOSES).toEqual(['terms', 'privacy', 'dpa']);
    for (const purpose of REQUIRED_REGISTRATION_PURPOSES) {
      const doc = getLegalDocument(purpose);
      expect(doc).toBeDefined();
      expect(doc.purpose).toBe(purpose);
      expect(doc.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(doc.title).toBeTruthy();
      expect(doc.path).toBeTruthy();
    }
  });

  it('hash của 3 văn bản phải khớp chính xác với nội dung file frontend hiện hành', () => {
    for (const purpose of REQUIRED_REGISTRATION_PURPOSES) {
      const doc = getLegalDocument(purpose);
      const filePath = path.join(FRONTEND_DIR, doc.frontendRelativePath);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf8');
      const actualHash = computeDocumentHash(content);

      expect(actualHash).toBe(doc.hash);
    }
  });

  it('getLegalDocument trả về null nếu purpose không tồn tại', () => {
    expect(getLegalDocument('unknown_purpose')).toBeNull();
  });

  describe('validateRegistrationConsents', () => {
    it('trả về true khi cả 3 mục đích đều là true', () => {
      expect(
        validateRegistrationConsents({
          terms: true,
          privacy: true,
          dpa: true,
        })
      ).toBe(true);
    });

    it('ném lỗi 400 CONSENT_REQUIRED khi consents là null hoặc không phải object', () => {
      expect(() => validateRegistrationConsents(null)).toThrow(
        expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' })
      );
      expect(() => validateRegistrationConsents(undefined)).toThrow(
        expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' })
      );
      expect(() => validateRegistrationConsents('invalid')).toThrow(
        expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' })
      );
    });

    it('ném lỗi 400 CONSENT_REQUIRED khi thiếu 1 trong 3 trường', () => {
      expect(() =>
        validateRegistrationConsents({ terms: true, privacy: true })
      ).toThrow(expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' }));

      expect(() =>
        validateRegistrationConsents({ terms: true, dpa: true })
      ).toThrow(expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' }));

      expect(() =>
        validateRegistrationConsents({ privacy: true, dpa: true })
      ).toThrow(expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' }));
    });

    it('ném lỗi 400 CONSENT_REQUIRED khi có trường là false hoặc truthy không phải boolean true', () => {
      expect(() =>
        validateRegistrationConsents({ terms: true, privacy: true, dpa: false })
      ).toThrow(expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' }));

      expect(() =>
        validateRegistrationConsents({ terms: 'true', privacy: true, dpa: true })
      ).toThrow(expect.objectContaining({ status: 400, code: 'CONSENT_REQUIRED' }));
    });
  });
});
