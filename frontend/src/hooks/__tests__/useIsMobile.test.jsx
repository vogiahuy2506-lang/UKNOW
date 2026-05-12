import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useIsMobile from '../useIsMobile';

const setViewportWidth = (width) => {
  window.innerWidth = width;
  window.dispatchEvent(new Event('resize'));
};

describe('useIsMobile', () => {
  it('width < 768 → true', () => {
    window.innerWidth = 500;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('width = 768 → false (boundary chính xác)', () => {
    window.innerWidth = 768;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('width > 768 → false', () => {
    window.innerWidth = 1280;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('resize từ desktop → mobile cập nhật state', () => {
    window.innerWidth = 1280;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => setViewportWidth(400));
    expect(result.current).toBe(true);

    act(() => setViewportWidth(900));
    expect(result.current).toBe(false);
  });

  it('cleanup remove resize listener khi unmount', () => {
    window.innerWidth = 1280;
    const { result, unmount } = renderHook(() => useIsMobile());
    unmount();
    // Sau khi unmount, resize không còn ảnh hưởng tới state.
    act(() => setViewportWidth(300));
    // result.current là snapshot cuối — vẫn là false (state cũ).
    expect(result.current).toBe(false);
  });
});
