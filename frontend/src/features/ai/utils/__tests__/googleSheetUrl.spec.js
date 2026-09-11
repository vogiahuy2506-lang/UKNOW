import { describe, expect, it } from 'vitest';
import { isValidGoogleSheetUrl } from '../googleSheetUrl.js';

describe('isValidGoogleSheetUrl', () => {
  it('returns true for standard Google Sheets URLs', () => {
    expect(isValidGoogleSheetUrl('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit')).toBe(true);
    expect(isValidGoogleSheetUrl('http://docs.google.com/spreadsheets/d/abc123xyz')).toBe(true);
    expect(isValidGoogleSheetUrl('https://docs.google.com/spreadsheets/d/123/edit#gid=0')).toBe(true);
    expect(isValidGoogleSheetUrl('  https://docs.google.com/spreadsheets/d/123  ')).toBe(true);
  });

  it('returns false for invalid or non-sheet inputs', () => {
    expect(isValidGoogleSheetUrl('')).toBe(false);
    expect(isValidGoogleSheetUrl('   ')).toBe(false);
    expect(isValidGoogleSheetUrl(null)).toBe(false);
    expect(isValidGoogleSheetUrl(undefined)).toBe(false);
    expect(isValidGoogleSheetUrl(12345)).toBe(false);
    expect(isValidGoogleSheetUrl('https://docs.google.com/document/d/123')).toBe(false);
    expect(isValidGoogleSheetUrl('https://example.com/file.xlsx')).toBe(false);
  });
});
