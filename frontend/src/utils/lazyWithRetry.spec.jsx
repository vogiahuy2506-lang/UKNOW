import React, { Suspense } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { lazyWithRetry, isChunkLoadError } from './lazyWithRetry.js';

class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) return <div>boundary:{this.state.error.message}</div>;
    return this.props.children;
  }
}

const renderLazy = (Comp) =>
  render(
    <Boundary>
      <Suspense fallback={<div>dang-tai</div>}>
        <Comp />
      </Suspense>
    </Boundary>,
  );

const CHUNK_MSG = 'Failed to fetch dynamically imported module: https://x/assets/Foo-abc.js';

describe('lazyWithRetry', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nhan dien dung cac thong bao loi tai chunk', () => {
    expect(isChunkLoadError(new Error(CHUNK_MSG))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('TypeError: x is undefined'))).toBe(false);
  });

  it('import thanh cong thi render trang, khong reload', async () => {
    const reload = vi.fn();
    const Comp = lazyWithRetry(() => Promise.resolve({ default: () => <div>trang-ok</div> }), { reload });
    renderLazy(Comp);
    expect(await screen.findByText('trang-ok')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it('loi chunk lan dau: reload dung mot lan va giu man cho (khong hien loi)', async () => {
    const reload = vi.fn();
    const Comp = lazyWithRetry(() => Promise.reject(new Error(CHUNK_MSG)), { reload });
    renderLazy(Comp);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.getByText('dang-tai')).toBeTruthy();
    expect(screen.queryByText(/boundary:/)).toBeNull();
  });

  it('chi reload mot lan: da co co sessionStorage thi nem loi len ErrorBoundary', async () => {
    const reload = vi.fn();
    const failing = () => Promise.reject(new Error(CHUNK_MSG));
    // Lan 1: reload va dat co
    const First = lazyWithRetry(failing, { reload });
    const first = renderLazy(First);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    first.unmount();
    // Lan 2 (sau reload, cung URL, chunk van loi): khong reload nua, hien loi
    const Second = lazyWithRetry(failing, { reload });
    renderLazy(Second);
    expect(await screen.findByText(`boundary:${CHUNK_MSG}`)).toBeTruthy();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('loi khong phai loi chunk thi nem ngay, khong reload', async () => {
    const reload = vi.fn();
    const Comp = lazyWithRetry(() => Promise.reject(new Error('boom noi bo')), { reload });
    renderLazy(Comp);
    expect(await screen.findByText('boundary:boom noi bo')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('import thanh cong thi xoa co de lan deploy sau con duoc reload', async () => {
    const reload = vi.fn();
    window.sessionStorage.setItem(`lazy-retry-reloaded:${window.location.pathname}${window.location.search}`, '1');
    const Comp = lazyWithRetry(() => Promise.resolve({ default: () => <div>trang-ok</div> }), { reload });
    renderLazy(Comp);
    await screen.findByText('trang-ok');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('sessionStorage bi chan (nem loi) thi khong reload de tranh lap vo han', async () => {
    const reload = vi.fn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const Comp = lazyWithRetry(() => Promise.reject(new Error(CHUNK_MSG)), { reload });
    renderLazy(Comp);
    expect(await screen.findByText(`boundary:${CHUNK_MSG}`)).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});
