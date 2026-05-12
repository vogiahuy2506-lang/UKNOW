import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollPersistence } from '../useScrollPersistence';

/**
 * jsdom không có RAF/scroll thật → ta cần stub requestAnimationFrame và fake timer
 * để throttle setTimeout trigger được trong test.
 */
beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    cb();
    return 1;
  });
});

const renderHookWithScrollElement = (key, throttleMs = 150) => {
  const fakeEl = document.createElement('div');
  Object.assign(fakeEl, { scrollTop: 0, scrollLeft: 0 });
  document.body.appendChild(fakeEl);

  const ref = { current: fakeEl };
  const hookResult = renderHook(() => useScrollPersistence(key, ref, throttleMs));
  return { ref, fakeEl, hookResult };
};

describe('useScrollPersistence', () => {
  it('khi mount: restore scrollTop/scrollLeft từ localStorage (qua RAF)', () => {
    localStorage.setItem(
      'scroll:list',
      JSON.stringify({ scrollTop: 250, scrollLeft: 30 })
    );
    const { fakeEl } = renderHookWithScrollElement('scroll:list');
    // RAF stubbed → sync, scroll position được khôi phục ngay.
    expect(fakeEl.scrollTop).toBe(250);
    expect(fakeEl.scrollLeft).toBe(30);
  });

  it('storage hỏng → không throw, scroll vẫn ở 0', () => {
    localStorage.setItem('scroll:bad', '{invalid');
    const { fakeEl } = renderHookWithScrollElement('scroll:bad');
    expect(fakeEl.scrollTop).toBe(0);
    expect(fakeEl.scrollLeft).toBe(0);
  });

  it('scroll event → sau throttle, persist xuống localStorage', () => {
    vi.useFakeTimers();
    const { fakeEl } = renderHookWithScrollElement('scroll:t1', 100);
    fakeEl.scrollTop = 120;
    fakeEl.scrollLeft = 0;
    act(() => {
      fakeEl.dispatchEvent(new Event('scroll'));
    });
    expect(localStorage.getItem('scroll:t1')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const stored = JSON.parse(localStorage.getItem('scroll:t1'));
    expect(stored).toEqual({ scrollTop: 120, scrollLeft: 0 });
    vi.useRealTimers();
  });

  it('nhiều scroll liên tiếp → chỉ 1 lần persist (debounce)', () => {
    vi.useFakeTimers();
    const { fakeEl } = renderHookWithScrollElement('scroll:t2', 100);
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    fakeEl.scrollTop = 10;
    act(() => fakeEl.dispatchEvent(new Event('scroll')));
    fakeEl.scrollTop = 20;
    act(() => fakeEl.dispatchEvent(new Event('scroll')));
    fakeEl.scrollTop = 30;
    act(() => fakeEl.dispatchEvent(new Event('scroll')));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Chỉ 1 lần setItem (debounce gộp).
    expect(setSpy).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem('scroll:t2'));
    expect(stored.scrollTop).toBe(30);
    setSpy.mockRestore();
    vi.useRealTimers();
  });

  it('unmount → remove listener, scroll sau đó không persist', () => {
    vi.useFakeTimers();
    const { fakeEl, hookResult } = renderHookWithScrollElement('scroll:t3', 100);
    hookResult.unmount();
    fakeEl.scrollTop = 999;
    act(() => fakeEl.dispatchEvent(new Event('scroll')));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(localStorage.getItem('scroll:t3')).toBeNull();
    vi.useRealTimers();
  });
});
