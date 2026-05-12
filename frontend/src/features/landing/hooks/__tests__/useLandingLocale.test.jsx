import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLandingLocale, LANDING_LOCALE_STORAGE_KEY } from '../useLandingLocale';

describe('useLandingLocale', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mặc định "vi" khi localStorage rỗng + set document.lang="vi" + lưu vào storage', () => {
    const { result } = renderHook(() => useLandingLocale());
    expect(result.current.locale).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
    expect(window.localStorage.getItem(LANDING_LOCALE_STORAGE_KEY)).toBe('vi');
    expect(result.current.copy).toBeDefined();
    expect(typeof result.current.copy).toBe('object');
  });

  it('restore "en" từ localStorage khi mount', () => {
    window.localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, 'en');
    const { result } = renderHook(() => useLandingLocale());
    expect(result.current.locale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('giá trị storage không hợp lệ → fallback "vi"', () => {
    window.localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, 'fr');
    const { result } = renderHook(() => useLandingLocale());
    expect(result.current.locale).toBe('vi');
  });

  it('setLocale("en") → đổi locale + copy đổi theo', () => {
    const { result } = renderHook(() => useLandingLocale());
    const viCopy = result.current.copy;
    act(() => result.current.setLocale('en'));
    expect(result.current.locale).toBe('en');
    expect(result.current.copy).not.toBe(viCopy);
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem(LANDING_LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('setLocale giá trị không hợp lệ → không đổi (giữ "vi")', () => {
    const { result } = renderHook(() => useLandingLocale());
    act(() => result.current.setLocale('fr'));
    expect(result.current.locale).toBe('vi');
    act(() => result.current.setLocale(null));
    expect(result.current.locale).toBe('vi');
  });

  it('setLocale callback ổn định (reference giữ nguyên giữa các render)', () => {
    const { result, rerender } = renderHook(() => useLandingLocale());
    const firstSetter = result.current.setLocale;
    rerender();
    expect(result.current.setLocale).toBe(firstSetter);
  });

  it('lỗi localStorage.setItem không crash hook', () => {
    const { result } = renderHook(() => useLandingLocale());
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => act(() => result.current.setLocale('en'))).not.toThrow();
    expect(result.current.locale).toBe('en');
    spy.mockRestore();
  });
});
