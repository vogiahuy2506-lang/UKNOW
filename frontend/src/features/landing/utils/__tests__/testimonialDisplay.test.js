import { describe, it, expect } from 'vitest';
import { initialsFromDisplayName } from '../testimonialDisplay';

describe('initialsFromDisplayName', () => {
  it('null/undefined/empty → "?"', () => {
    expect(initialsFromDisplayName(null)).toBe('?');
    expect(initialsFromDisplayName(undefined)).toBe('?');
    expect(initialsFromDisplayName('')).toBe('?');
    expect(initialsFromDisplayName('   ')).toBe('?');
  });

  it('2 từ → đầu họ + đầu tên (uppercase)', () => {
    expect(initialsFromDisplayName('Nguyễn An')).toBe('NA');
    expect(initialsFromDisplayName('alice smith')).toBe('AS');
  });

  it('3+ từ → đầu họ + đầu chữ cuối', () => {
    expect(initialsFromDisplayName('Nguyễn Văn An')).toBe('NA');
    expect(initialsFromDisplayName('John F. Kennedy')).toBe('JK');
  });

  it('1 từ → 2 ký tự đầu, uppercase', () => {
    expect(initialsFromDisplayName('alice')).toBe('AL');
    expect(initialsFromDisplayName('X')).toBe('X');
  });

  it('whitespace nhiều giữa các từ → vẫn parse đúng', () => {
    expect(initialsFromDisplayName('  Alice    Smith  ')).toBe('AS');
  });

  it('số ở đầu vẫn lấy', () => {
    expect(initialsFromDisplayName('123 ABC')).toBe('1A');
  });
});
