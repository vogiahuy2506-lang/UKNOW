import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorageState } from '../useLocalStorageState';

describe('useLocalStorageState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('chưa có key trong storage → dùng defaultValue', () => {
    const { result } = renderHook(() => useLocalStorageState('k1', 'fallback'));
    expect(result.current[0]).toBe('fallback');
    // useEffect đầu tiên persist defaultValue vào storage.
    expect(localStorage.getItem('k1')).toBe('"fallback"');
  });

  it('defaultValue là factory function → gọi để lấy initial', () => {
    const factory = vi.fn(() => ({ heavy: true }));
    const { result } = renderHook(() => useLocalStorageState('k2', factory));
    expect(factory).toHaveBeenCalledOnce();
    expect(result.current[0]).toEqual({ heavy: true });
  });

  it('storage đã có giá trị → bỏ qua defaultValue, đọc từ storage', () => {
    localStorage.setItem('k3', JSON.stringify({ count: 42 }));
    const { result } = renderHook(() => useLocalStorageState('k3', { count: 0 }));
    expect(result.current[0]).toEqual({ count: 42 });
  });

  it('storage chứa JSON hỏng → fallback về defaultValue', () => {
    localStorage.setItem('k4', '{invalid');
    const { result } = renderHook(() => useLocalStorageState('k4', 'safe'));
    expect(result.current[0]).toBe('safe');
  });

  it('setValue → persist xuống localStorage (JSON.stringify)', () => {
    const { result } = renderHook(() => useLocalStorageState('k5', 0));
    act(() => result.current[1](123));
    expect(result.current[0]).toBe(123);
    expect(localStorage.getItem('k5')).toBe('123');
  });

  it('setValue array → persist đúng JSON array', () => {
    const { result } = renderHook(() => useLocalStorageState('k6', []));
    act(() => result.current[1](['a', 'b']));
    expect(localStorage.getItem('k6')).toBe('["a","b"]');
  });

  it('setItem throw (quota) → swallow, state vẫn cập nhật', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const { result } = renderHook(() => useLocalStorageState('k7', 'init'));
    expect(() => act(() => result.current[1]('next'))).not.toThrow();
    expect(result.current[0]).toBe('next');
    setSpy.mockRestore();
  });
});
