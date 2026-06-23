import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  encryptSmtpSecret,
  decryptSmtpSecret,
  isEncryptedSmtpSecret,
} from '../smtpSecretCrypto.js';

describe('smtpSecretCrypto', () => {
  const originalKey = process.env.SMTP_SECRET_KEY;

  beforeEach(() => {
    process.env.SMTP_SECRET_KEY = 'unit-test-smtp-secret-key';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SMTP_SECRET_KEY;
    else process.env.SMTP_SECRET_KEY = originalKey;
  });

  it('encrypt/decrypt round-trip với SMTP_SECRET_KEY', () => {
    const encrypted = encryptSmtpSecret('SG.my-api-key');
    expect(isEncryptedSmtpSecret(encrypted)).toBe(true);
    expect(decryptSmtpSecret(encrypted)).toBe('SG.my-api-key');
  });

  it('plaintext cũ (chưa mã hóa) trả nguyên khi decrypt', () => {
    expect(decryptSmtpSecret('plain-password')).toBe('plain-password');
  });

  it('thiếu SMTP_SECRET_KEY → throw rõ ràng', () => {
    delete process.env.SMTP_SECRET_KEY;
    expect(() => encryptSmtpSecret('secret')).toThrow(/SMTP_SECRET_KEY/i);
  });
});
