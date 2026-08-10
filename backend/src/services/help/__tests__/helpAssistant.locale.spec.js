import { normalizeLocale, OVERVIEW_RE } from '../helpAssistant.service.js';

describe('helpAssistant locale helpers', () => {
  it('normalizeLocale maps en and defaults to vi', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('EN')).toBe('en');
    expect(normalizeLocale('vi')).toBe('vi');
    expect(normalizeLocale(undefined)).toBe('vi');
    expect(normalizeLocale('fr')).toBe('vi');
  });

  it('OVERVIEW_RE matches EN and VI overview questions', () => {
    expect(OVERVIEW_RE.test('what can you do')).toBe(true);
    expect(OVERVIEW_RE.test('What can I do?')).toBe(true);
    expect(OVERVIEW_RE.test('features of the product')).toBe(true);
    expect(OVERVIEW_RE.test('bạn làm được gì')).toBe(true);
    expect(OVERVIEW_RE.test('how to create campaign')).toBe(false);
  });
});
