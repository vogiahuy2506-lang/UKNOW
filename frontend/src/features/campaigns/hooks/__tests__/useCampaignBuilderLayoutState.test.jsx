import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useCampaignBuilderLayoutState from '../useCampaignBuilderLayoutState';

const DEFAULT_PROPS = {
  showRunLogs: false,
  logListMinWidth: 200,
  logDetailMinWidth: 300,
};

const fireWindowEvent = (type, init = {}) => {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, init);
  act(() => {
    window.dispatchEvent(event);
  });
};

const fireMouseMove = (clientX = 0, clientY = 0) => {
  const event = new MouseEvent('mousemove', { bubbles: true, clientX, clientY });
  act(() => {
    window.dispatchEvent(event);
  });
};

const fireMouseUp = () => {
  const event = new MouseEvent('mouseup', { bubbles: true });
  act(() => {
    window.dispatchEvent(event);
  });
};

beforeEach(() => {
  localStorage.clear();
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280, writable: true });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCampaignBuilderLayoutState — defaults & storage', () => {
  it('defaults: runLogHeight=256, logListWidth=240, builderSidebarWidth=240, mọi isResizing=false', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    expect(result.current.runLogHeight).toBe(256);
    expect(result.current.logListWidth).toBe(240);
    expect(result.current.builderSidebarWidth).toBe(240);
    expect(result.current.isResizingLog).toBe(false);
    expect(result.current.isResizingLogSplit).toBe(false);
    expect(result.current.isResizingBuilderSidebar).toBe(false);
    expect(result.current.logPanelRef.current).toBeNull();
  });

  it('restore từ localStorage khi mount', () => {
    localStorage.setItem('founder_builder_runLogHeight', '320');
    localStorage.setItem('founder_builder_logListWidth', '280');
    localStorage.setItem('founder_builder_sidebarWidth', '250');
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    expect(result.current.runLogHeight).toBe(320);
    expect(result.current.logListWidth).toBe(280);
    expect(result.current.builderSidebarWidth).toBe(250);
  });
});

describe('useCampaignBuilderLayoutState — handleLogResizeStart', () => {
  it('preventDefault + stopPropagation + isResizingLog=true', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientY: 500,
    };
    act(() => {
      result.current.handleLogResizeStart(event);
    });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.isResizingLog).toBe(true);
  });

  it('mousemove khi đang resize log → setRunLogHeight (clamp 180–60% viewport)', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleLogResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientY: 600,
      });
    });
    fireMouseMove(0, 500);
    expect(result.current.runLogHeight).toBe(356);

    fireMouseMove(0, 100000);
    expect(result.current.runLogHeight).toBe(180);

    fireMouseMove(0, -100000);
    const maxHeight = Math.round(window.innerHeight * 0.6);
    expect(result.current.runLogHeight).toBe(maxHeight);
  });

  it('mouseup khi đang resize → isResizingLog=false + cleanup cursor', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleLogResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientY: 600,
      });
    });
    expect(document.body.style.cursor).toBe('row-resize');
    fireMouseUp();
    expect(result.current.isResizingLog).toBe(false);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });
});

describe('useCampaignBuilderLayoutState — handleLogSplitResizeStart', () => {
  it('isResizingLogSplit=true + preventDefault', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 200 };
    act(() => {
      result.current.handleLogSplitResizeStart(event);
    });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.isResizingLogSplit).toBe(true);
  });

  it('mousemove khi đang resize split → setLogListWidth (clamp theo logListMinWidth)', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleLogSplitResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
      });
    });
    fireMouseMove(50, 0);
    expect(result.current.logListWidth).toBeGreaterThanOrEqual(DEFAULT_PROPS.logListMinWidth);

    fireMouseMove(0, 0);
    expect(result.current.logListWidth).toBe(DEFAULT_PROPS.logListMinWidth);
  });

  it('mouseup → isResizingLogSplit=false', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleLogSplitResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 0,
      });
    });
    expect(document.body.style.cursor).toBe('col-resize');
    fireMouseUp();
    expect(result.current.isResizingLogSplit).toBe(false);
    expect(document.body.style.cursor).toBe('');
  });
});

describe('useCampaignBuilderLayoutState — handleBuilderSidebarResizeStart', () => {
  it('isResizingBuilderSidebar=true', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleBuilderSidebarResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
      });
    });
    expect(result.current.isResizingBuilderSidebar).toBe(true);
  });

  it('mousemove → setBuilderSidebarWidth (clamp theo viewport bounds)', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleBuilderSidebarResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
      });
    });
    fireMouseMove(150, 0);
    expect(result.current.builderSidebarWidth).toBeGreaterThanOrEqual(210);
    expect(result.current.builderSidebarWidth).toBeLessThanOrEqual(340);

    fireMouseMove(100000, 0);
    expect(result.current.builderSidebarWidth).toBeLessThanOrEqual(340);

    fireMouseMove(-100000, 0);
    expect(result.current.builderSidebarWidth).toBeGreaterThanOrEqual(210);
  });

  it('mouseup → isResizingBuilderSidebar=false', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleBuilderSidebarResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
      });
    });
    fireMouseUp();
    expect(result.current.isResizingBuilderSidebar).toBe(false);
  });
});

describe('useCampaignBuilderLayoutState — viewport bounds', () => {
  it('viewport < 768 → min sidebar = 160', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleBuilderSidebarResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 0,
      });
    });
    fireMouseMove(-100000, 0);
    expect(result.current.builderSidebarWidth).toBe(160);
  });

  it('viewport 768-1024 → min sidebar = 176', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleBuilderSidebarResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 0,
      });
    });
    fireMouseMove(-100000, 0);
    expect(result.current.builderSidebarWidth).toBe(176);
  });
});

describe('useCampaignBuilderLayoutState — showRunLogs sync', () => {
  it('showRunLogs=true → sync logListWidth qua clamp', () => {
    const { result } = renderHook(() =>
      useCampaignBuilderLayoutState({ ...DEFAULT_PROPS, showRunLogs: true })
    );
    expect(result.current.logListWidth).toBeGreaterThanOrEqual(DEFAULT_PROPS.logListMinWidth);
  });

  it('window resize → re-clamp logListWidth khi showRunLogs=true', () => {
    const { result } = renderHook(() =>
      useCampaignBuilderLayoutState({ ...DEFAULT_PROPS, showRunLogs: true })
    );
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    fireWindowEvent('resize');
    expect(result.current.logListWidth).toBeGreaterThanOrEqual(DEFAULT_PROPS.logListMinWidth);
  });
});

describe('useCampaignBuilderLayoutState — click suppression', () => {
  it('sau resize log start → suppressClickRef.current=true; click capture preventDefault', () => {
    const { result } = renderHook(() => useCampaignBuilderLayoutState(DEFAULT_PROPS));
    act(() => {
      result.current.handleLogResizeStart({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientY: 0,
      });
    });

    const clickEvent = new Event('click', { bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(clickEvent, 'preventDefault');
    act(() => {
      window.dispatchEvent(clickEvent);
    });
    expect(preventSpy).toHaveBeenCalled();
  });
});
