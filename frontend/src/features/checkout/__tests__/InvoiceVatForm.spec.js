import { describe, it, expect } from 'vitest';
import {
  computeDisplayVat,
  isInvoiceInfoValid,
  maskAccountEmail,
  TAX_CODE_REGEX,
  ID_NUMBER_REGEX,
} from '../components/InvoiceVatForm';

describe('InvoiceVatForm utilities', () => {
  describe('TAX_CODE_REGEX', () => {
    it('matches 10 digits', () => {
      expect(TAX_CODE_REGEX.test('0312345678')).toBe(true);
    });

    it('matches 13 digits with hyphen', () => {
      expect(TAX_CODE_REGEX.test('0312345678-001')).toBe(true);
    });

    it('rejects 9 or 11 digits without branch hyphen', () => {
      expect(TAX_CODE_REGEX.test('123456789')).toBe(false);
      expect(TAX_CODE_REGEX.test('12345678901')).toBe(false);
      expect(TAX_CODE_REGEX.test('0312345678001')).toBe(false);
    });
  });

  describe('ID_NUMBER_REGEX', () => {
    it('matches 9 to 12 digits', () => {
      expect(ID_NUMBER_REGEX.test('123456789')).toBe(true);
      expect(ID_NUMBER_REGEX.test('123456789012')).toBe(true);
    });

    it('rejects 8 or 13 digits', () => {
      expect(ID_NUMBER_REGEX.test('12345678')).toBe(false);
      expect(ID_NUMBER_REGEX.test('1234567890123')).toBe(false);
    });
  });

  describe('isInvoiceInfoValid', () => {
    it('validates company invoice info', () => {
      expect(
        isInvoiceInfoValid({
          buyerType: 'company',
          taxCode: '0312345678',
          companyName: 'Công ty ABC',
          email: 'test@example.com',
        })
      ).toBe(true);

      expect(
        isInvoiceInfoValid({
          buyerType: 'company',
          taxCode: '123',
          companyName: 'Công ty ABC',
          email: 'test@example.com',
        })
      ).toBe(false);
    });

    it('validates personal invoice info', () => {
      expect(
        isInvoiceInfoValid({
          buyerType: 'personal',
          fullName: 'Nguyễn Văn A',
          idNumber: '001099012345',
          email: 'test@example.com',
        })
      ).toBe(true);

      expect(
        isInvoiceInfoValid({
          buyerType: 'personal',
          fullName: 'Nguyễn Văn A',
          idNumber: '123',
          email: 'test@example.com',
        })
      ).toBe(false);
    });
  });

  describe('computeDisplayVat', () => {
    it('returns KCT tax breakdown (vatAmount = 0, vatRate = -1, gross = net)', () => {
      const res = computeDisplayVat(499000);
      expect(res.net).toBe(499000);
      expect(res.vatAmount).toBe(0);
      expect(res.gross).toBe(499000);
      expect(res.vatRate).toBe(-1);
    });

    it('handles net 0 correctly', () => {
      expect(computeDisplayVat(0)).toEqual({
        net: 0,
        vatAmount: 0,
        gross: 0,
        vatRate: -1,
      });
    });
  });

  describe('maskAccountEmail', () => {
    it('masks local part', () => {
      expect(maskAccountEmail('admin@example.com')).toBe('ad***@example.com');
      expect(maskAccountEmail('a@example.com')).toBe('a***@example.com');
    });
  });
});
