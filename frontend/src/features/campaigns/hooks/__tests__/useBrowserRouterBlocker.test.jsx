import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';

const { mockNavigator, mockUseLocation } = vi.hoisted(() => ({
  mockNavigator: { block: undefined, push: undefined },
  mockUseLocation: vi.fn(() => ({ pathname: '/', search: '', hash: '' })),
}));

vi.mock('react-router-dom', () => ({
  UNSAFE_NavigationContext: React.createContext({ navigator: mockNavigator }),
  useLocation: mockUseLocation,
}));

import { useBrowserRouterBlocker } from '../useBrowserRouterBlocker';

const setMockNavigator = (next) => {
  mockNavigator.block = next?.block;
  mockNavigator.push = next?.push;
};

const fireAnchorClick = (anchor, eventInit = {}) => {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...eventInit,
  });
  act(() => {
    anchor.dispatchEvent(event);
  });
  return event;
};

beforeEach(() => {
  setMockNavigator(null);
  document.body.innerHTML = '';
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: '/current', search: '', hash: '', origin: 'http://localhost', assign: vi.fn() },
  });
  window.history.replaceState({ idx: 0 }, '');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBrowserRouterBlocker — when=false', () => {
  it('state mặc định "unblocked"', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(false));
    expect(result.current.state).toBe('unblocked');
    expect(typeof result.current.proceed).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('không gắn listener click khi when=false', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    renderHook(() => useBrowserRouterBlocker(false));
    const clickCalls = spy.mock.calls.filter((c) => c[0] === 'click');
    expect(clickCalls).toHaveLength(0);
    spy.mockRestore();
  });
});

describe('useBrowserRouterBlocker — when=true via navigator.block (data-router style)', () => {
  it('gọi navigator.block với handler, unblock chạy khi cleanup', () => {
    const unblock = vi.fn();
    const block = vi.fn(() => unblock);
    setMockNavigator({ block });

    const { unmount } = renderHook(() => useBrowserRouterBlocker(true));
    expect(block).toHaveBeenCalledTimes(1);
    expect(typeof block.mock.calls[0][0]).toBe('function');

    unmount();
    expect(unblock).toHaveBeenCalled();
  });

  it('handler nhận transition → state="blocked"', () => {
    let capturedHandler;
    const unblock = vi.fn();
    const block = vi.fn((handler) => {
      capturedHandler = handler;
      return unblock;
    });
    setMockNavigator({ block });

    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    expect(result.current.state).toBe('unblocked');

    act(() => {
      capturedHandler({ retry: vi.fn() });
    });
    expect(result.current.state).toBe('blocked');
  });
});

describe('useBrowserRouterBlocker — proceed', () => {
  it('proceed: gọi retry rồi clear blockedTransition', () => {
    let capturedHandler;
    const unblock = vi.fn();
    const innerRetry = vi.fn();
    const block = vi.fn((h) => {
      capturedHandler = h;
      return unblock;
    });
    setMockNavigator({ block });

    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    act(() => {
      capturedHandler({ retry: innerRetry });
    });
    expect(result.current.state).toBe('blocked');

    act(() => {
      result.current.proceed();
    });

    expect(innerRetry).toHaveBeenCalled();
    expect(unblock).toHaveBeenCalled();
    expect(result.current.state).toBe('unblocked');
  });

  it('proceed khi chưa blocked → no-op (không crash)', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(false));
    expect(() => act(() => result.current.proceed())).not.toThrow();
    expect(result.current.state).toBe('unblocked');
  });
});

describe('useBrowserRouterBlocker — reset', () => {
  it('reset clear blockedTransition không gọi retry', () => {
    let capturedHandler;
    const innerRetry = vi.fn();
    const block = vi.fn((h) => {
      capturedHandler = h;
      return vi.fn();
    });
    setMockNavigator({ block });

    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    act(() => {
      capturedHandler({ retry: innerRetry });
    });
    expect(result.current.state).toBe('blocked');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toBe('unblocked');
    expect(innerRetry).not.toHaveBeenCalled();
  });
});

describe('useBrowserRouterBlocker — anchor click fallback (no navigator.block)', () => {
  beforeEach(() => {
    setMockNavigator({ block: undefined, push: vi.fn() });
  });

  it('click anchor nội bộ khác path → preventDefault + state="blocked"', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'http://localhost/other';
    document.body.appendChild(a);

    const event = fireAnchorClick(a);
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.state).toBe('blocked');
  });

  it('click anchor cross-origin → KHÔNG block', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'https://google.com/x';
    document.body.appendChild(a);

    const event = fireAnchorClick(a);
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.state).toBe('unblocked');
  });

  it('click anchor target="_blank" → KHÔNG block', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'http://localhost/other';
    a.target = '_blank';
    document.body.appendChild(a);

    const event = fireAnchorClick(a);
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.state).toBe('unblocked');
  });

  it('click anchor có [download] → KHÔNG block', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'http://localhost/file.pdf';
    a.setAttribute('download', '');
    document.body.appendChild(a);

    const event = fireAnchorClick(a);
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.state).toBe('unblocked');
  });

  it('href bắt đầu "#" → KHÔNG block', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'http://localhost/current#section';
    a.setAttribute('href', '#section');
    document.body.appendChild(a);

    const event = fireAnchorClick(a);
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.state).toBe('unblocked');
  });

  it('href mailto: → KHÔNG block', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.setAttribute('href', 'mailto:hello@x.com');
    document.body.appendChild(a);

    const event = fireAnchorClick(a);
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.state).toBe('unblocked');
  });

  it('meta/ctrl click → KHÔNG block', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'http://localhost/other';
    document.body.appendChild(a);

    const event = fireAnchorClick(a, { metaKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.state).toBe('unblocked');
  });

  it('click cùng path hiện tại → KHÔNG block', () => {
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'http://localhost/current';
    document.body.appendChild(a);

    const event = fireAnchorClick(a);
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.state).toBe('unblocked');
  });

  it('proceed sau khi anchor click → gọi navigator.push với path đích', () => {
    const push = vi.fn();
    setMockNavigator({ push });
    const { result } = renderHook(() => useBrowserRouterBlocker(true));
    const a = document.createElement('a');
    a.href = 'http://localhost/target?x=1#h';
    document.body.appendChild(a);

    fireAnchorClick(a);
    expect(result.current.state).toBe('blocked');

    act(() => {
      result.current.proceed();
    });
    expect(push).toHaveBeenCalledWith('/target?x=1#h');
    expect(result.current.state).toBe('unblocked');
  });
});

describe('useBrowserRouterBlocker — cleanup', () => {
  it('chuyển when từ true → false trong khi đang blocked → clear blockedTransition', () => {
    let capturedHandler;
    const block = vi.fn((h) => {
      capturedHandler = h;
      return vi.fn();
    });
    setMockNavigator({ block });

    const { result, rerender } = renderHook(({ when }) => useBrowserRouterBlocker(when), {
      initialProps: { when: true },
    });
    act(() => {
      capturedHandler({ retry: vi.fn() });
    });
    expect(result.current.state).toBe('blocked');

    rerender({ when: false });
    expect(result.current.state).toBe('unblocked');
  });
});
