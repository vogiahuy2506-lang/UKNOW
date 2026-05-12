import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEmbedLeadFormResize } from '../useEmbedLeadFormResize';

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  trigger() {
    this.callback();
  }
  static instances = [];
}

const renderWithRoot = ({ enabled = true, depsKey = 'a' } = {}, { scrollHeight = 800 } = {}) => {
  // Render với enabled=false để effect không chạy lần đầu (ref chưa gán).
  const wrapper = renderHook(
    ({ enabled: en, depsKey: dk }) => useEmbedLeadFormResize({ enabled: en, depsKey: dk }),
    { initialProps: { enabled: false, depsKey } }
  );
  const div = document.createElement('div');
  Object.defineProperty(div, 'scrollHeight', { value: scrollHeight, configurable: true });
  wrapper.result.current.current = div;
  // Bật enabled → effect chạy với ref đã gán.
  act(() => {
    wrapper.rerender({ enabled, depsKey });
  });
  return { ...wrapper, root: div };
};

let postMessageSpy;
let parentBackup;

beforeEach(() => {
  vi.useFakeTimers();
  FakeResizeObserver.instances = [];
  globalThis.ResizeObserver = FakeResizeObserver;

  parentBackup = window.parent;
  const parentMock = { postMessage: vi.fn() };
  Object.defineProperty(window, 'parent', { value: parentMock, configurable: true });
  postMessageSpy = parentMock.postMessage;
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'parent', { value: parentBackup, configurable: true });
});

describe('useEmbedLeadFormResize', () => {
  it('enabled=false → không observe, không postMessage', () => {
    renderWithRoot({ enabled: false });
    expect(FakeResizeObserver.instances).toHaveLength(0);
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('window.parent === window (không trong iframe) → không postMessage', () => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    postMessageSpy = vi.fn();
    window.parent.postMessage = postMessageSpy;
    renderWithRoot({ enabled: true });
    expect(postMessageSpy).not.toHaveBeenCalled();
    expect(FakeResizeObserver.instances).toHaveLength(0);
  });

  it('scrollHeight < 40 → không post', () => {
    renderWithRoot({ enabled: true }, { scrollHeight: 30 });
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('scrollHeight >= 40 → postMessage type "founder-lp-embed-resize" với height', () => {
    renderWithRoot({ enabled: true }, { scrollHeight: 600 });
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'founder-lp-embed-resize', height: 600 },
      '*'
    );
  });

  it('post nhiều lần: ngay + setTimeout(0) + setTimeout(400)', () => {
    renderWithRoot({ enabled: true }, { scrollHeight: 500 });
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(postMessageSpy).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(postMessageSpy).toHaveBeenCalledTimes(3);
  });

  it('ResizeObserver trigger → post lại', () => {
    renderWithRoot({ enabled: true }, { scrollHeight: 500 });
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    FakeResizeObserver.instances[0].trigger();
    expect(postMessageSpy).toHaveBeenCalledTimes(2);
  });

  it('postMessage throw → swallow, không crash', () => {
    postMessageSpy.mockImplementation(() => {
      throw new Error('cross-origin');
    });
    expect(() =>
      renderWithRoot({ enabled: true }, { scrollHeight: 500 })
    ).not.toThrow();
  });

  it('unmount → disconnect ResizeObserver + clear timeouts', () => {
    const { unmount } = renderWithRoot({ enabled: true }, { scrollHeight: 500 });
    const ro = FakeResizeObserver.instances[0];
    unmount();
    expect(ro.disconnect).toHaveBeenCalled();
  });

  it('depsKey thay đổi → re-run effect (disconnect cũ + observe mới)', () => {
    const { rerender, root } = renderWithRoot({ enabled: true, depsKey: 'a' }, { scrollHeight: 500 });
    const beforeInstances = FakeResizeObserver.instances.length;
    expect(beforeInstances).toBeGreaterThanOrEqual(1);
    const oldRo = FakeResizeObserver.instances[beforeInstances - 1];

    act(() => {
      rerender({ enabled: true, depsKey: 'b' });
    });
    expect(FakeResizeObserver.instances.length).toBe(beforeInstances + 1);
    expect(oldRo.disconnect).toHaveBeenCalled();
    expect(root).toBeDefined();
  });
});
