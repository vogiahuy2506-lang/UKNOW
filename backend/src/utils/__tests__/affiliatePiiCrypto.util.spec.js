import {
  encryptAffiliatePii,
  decryptAffiliatePii,
  isEncryptedAffiliatePii,
  getAffiliatePiiCryptoKey,
} from '../affiliatePiiCrypto.util.js';

describe('affiliatePiiCrypto.util', () => {
  const originalEnv = process.env.AFFILIATE_PII_SECRET_KEY;

  beforeEach(() => {
    process.env.AFFILIATE_PII_SECRET_KEY = 'test-affiliate-secret-key-32-chars-long!!';
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.AFFILIATE_PII_SECRET_KEY = originalEnv;
    } else {
      delete process.env.AFFILIATE_PII_SECRET_KEY;
    }
  });

  test('Mã hóa và giải mã số CCCD thành công roundtrip', () => {
    const rawId = '001200012345';
    const encrypted = encryptAffiliatePii(rawId);

    expect(encrypted).not.toBe(rawId);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(isEncryptedAffiliatePii(encrypted)).toBe(true);
    expect(encrypted.includes(rawId)).toBe(false);

    const decrypted = decryptAffiliatePii(encrypted);
    expect(decrypted).toBe(rawId);
  });

  test('Không mã hóa lặp lại nếu chuỗi đã có prefix enc:v1:', () => {
    const rawId = '001200012345';
    const encrypted = encryptAffiliatePii(rawId);
    const encryptedTwice = encryptAffiliatePii(encrypted);

    expect(encryptedTwice).toBe(encrypted);
  });

  test('Throw error khi thiếu biến môi trường AFFILIATE_PII_SECRET_KEY', () => {
    delete process.env.AFFILIATE_PII_SECRET_KEY;

    expect(() => getAffiliatePiiCryptoKey()).toThrow(
      'Thiếu biến môi trường AFFILIATE_PII_SECRET_KEY'
    );
    expect(() => encryptAffiliatePii('001200012345')).toThrow(
      'Thiếu biến môi trường AFFILIATE_PII_SECRET_KEY'
    );
  });

  test('Trả về chuỗi rỗng khi input rỗng/null/undefined', () => {
    expect(encryptAffiliatePii('')).toBe('');
    expect(encryptAffiliatePii(null)).toBe('');
    expect(decryptAffiliatePii('')).toBe('');
    expect(decryptAffiliatePii(null)).toBe('');
  });
});
