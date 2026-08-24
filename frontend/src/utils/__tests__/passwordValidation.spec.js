import { describe, it, expect } from 'vitest';
import { isValidPassword, PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '../passwordValidation.js';

describe('passwordValidation utility', () => {
  it('defines PASSWORD_MIN_LENGTH as 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(isValidPassword('Test1')).toBe(false);
    expect(isValidPassword('Pass123')).toBe(false);
    expect(isValidPassword('')).toBe(false);
    expect(isValidPassword(null)).toBe(false);
  });

  it('rejects passwords without numbers', () => {
    expect(isValidPassword('abcdefgh')).toBe(false);
    expect(isValidPassword('PassWordOnly')).toBe(false);
  });

  it('rejects passwords without letters', () => {
    expect(isValidPassword('12345678')).toBe(false);
    expect(isValidPassword('1234567890')).toBe(false);
  });

  it('accepts passwords with >= 8 chars containing both letters and numbers', () => {
    expect(isValidPassword('Test1234')).toBe(true);
    expect(isValidPassword('pass12345')).toBe(true);
    expect(isValidPassword('P@ssw0rd!')).toBe(true);
    expect(isValidPassword('Complex123456789!')).toBe(true);
  });

  it('PASSWORD_PATTERN matches strings with both letter and number', () => {
    expect(PASSWORD_PATTERN.test('Test1234')).toBe(true);
    expect(PASSWORD_PATTERN.test('12345678')).toBe(false);
    expect(PASSWORD_PATTERN.test('abcdefgh')).toBe(false);
  });
});
