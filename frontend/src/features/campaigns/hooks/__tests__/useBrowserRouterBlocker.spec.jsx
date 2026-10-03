import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, UNSAFE_NavigationContext, useLocation, useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { useBrowserRouterBlocker } from '../useBrowserRouterBlocker.js';

let latestBlocker = null;
let latestNavigator = null;

function Probe({ when }) {
  const blocker = useBrowserRouterBlocker(when);
  latestBlocker = blocker;
  return <span data-testid="state">{blocker.state}</span>;
}

function Harness({ initialWhen = true }) {
  const [when, setWhen] = useState(initialWhen);
  const [mounted, setMounted] = useState(true);
  const navigate = useNavigate();
  const loc = useLocation();
  latestNavigator = useContext(UNSAFE_NavigationContext).navigator;
  return (
    <div>
      <span data-testid="loc">{loc.pathname}</span>
      {mounted ? <Probe when={when} /> : null}
      <button onClick={() => navigate('/x')}>go-x</button>
      <button onClick={() => navigate('/r', { replace: true })}>replace-r</button>
      <button onClick={() => navigate(loc.pathname)}>go-same</button>
      <button onClick={() => setWhen(false)}>when-off</button>
      <button onClick={() => setMounted(false)}>unmount-probe</button>
      <button
        onClick={() => {
          latestBlocker.allowNext();
          navigate('/after-save', { replace: true });
        }}
      >
        allow-then-go
      </button>
      <a href="/y">link-y</a>
    </div>
  );
}

const renderHarness = (props) =>
  render(
    <BrowserRouter>
      <Harness {...props} />
    </BrowserRouter>
  );

describe('useBrowserRouterBlocker', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/start');
    latestBlocker = null;
  });
  afterEach(() => cleanup());

  it('navigate() bằng code khi when → blocked, URL chưa đổi', () => {
    renderHarness();
    fireEvent.click(screen.getByText('go-x'));
    expect(screen.getByTestId('state').textContent).toBe('blocked');
    expect(screen.getByTestId('loc').textContent).toBe('/start');
    expect(window.location.pathname).toBe('/start');
  });

  it('navigate(replace) cũng bị chặn', () => {
    renderHarness();
    fireEvent.click(screen.getByText('replace-r'));
    expect(screen.getByTestId('state').textContent).toBe('blocked');
    expect(screen.getByTestId('loc').textContent).toBe('/start');
  });

  it('proceed → tới đúng đích đã bấm', () => {
    renderHarness();
    fireEvent.click(screen.getByText('go-x'));
    act(() => latestBlocker.proceed());
    expect(screen.getByTestId('loc').textContent).toBe('/x');
    expect(screen.getByTestId('state').textContent).toBe('unblocked');
  });

  it('reset → ở lại, hết blocked', () => {
    renderHarness();
    fireEvent.click(screen.getByText('go-x'));
    act(() => latestBlocker.reset());
    expect(screen.getByTestId('state').textContent).toBe('unblocked');
    expect(screen.getByTestId('loc').textContent).toBe('/start');
  });

  it('when=false → đi thẳng', () => {
    renderHarness({ initialWhen: false });
    fireEvent.click(screen.getByText('go-x'));
    expect(screen.getByTestId('loc').textContent).toBe('/x');
  });

  it('when bật rồi tắt → đi thẳng', () => {
    renderHarness();
    fireEvent.click(screen.getByText('when-off'));
    fireEvent.click(screen.getByText('go-x'));
    expect(screen.getByTestId('loc').textContent).toBe('/x');
  });

  it('gỡ bọc khi Probe unmount: navigate sau đó đi thẳng và navigator.push về hàm gốc', () => {
    renderHarness();
    const wrappedPush = latestNavigator.push;
    fireEvent.click(screen.getByText('unmount-probe'));
    expect(latestNavigator.push).not.toBe(wrappedPush);
    fireEvent.click(screen.getByText('go-x'));
    expect(screen.getByTestId('loc').textContent).toBe('/x');
  });

  it('navigate tới chính trang hiện tại không bị chặn', () => {
    renderHarness();
    fireEvent.click(screen.getByText('go-same'));
    expect(screen.getByTestId('state').textContent).toBe('unblocked');
  });

  it('allowNext cho qua đúng MỘT lần, rồi lại chặn', () => {
    renderHarness();
    fireEvent.click(screen.getByText('allow-then-go'));
    expect(screen.getByTestId('loc').textContent).toBe('/after-save');
    expect(screen.getByTestId('state').textContent).toBe('unblocked');
    fireEvent.click(screen.getByText('go-x'));
    expect(screen.getByTestId('state').textContent).toBe('blocked');
    expect(screen.getByTestId('loc').textContent).toBe('/after-save');
  });

  it('thẻ <a> nội bộ khi when → blocked, proceed tới đích', () => {
    renderHarness();
    fireEvent.click(screen.getByText('link-y'));
    expect(screen.getByTestId('state').textContent).toBe('blocked');
    expect(window.location.pathname).toBe('/start');
    act(() => latestBlocker.proceed());
    expect(screen.getByTestId('loc').textContent).toBe('/y');
  });

  it('popstate (nút Back) khi when → blocked', async () => {
    renderHarness({ initialWhen: false });
    fireEvent.click(screen.getByText('go-x'));
    expect(screen.getByTestId('loc').textContent).toBe('/x');
    // bật chặn: cần when=true → render lại harness mới trên trang /x
    cleanup();
    renderHarness();
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('blocked'));
  });

  // Review 03/10 (Chromium thật): listener popstate gắn TRƯỚC (như BrowserRouter) chạy trước và làm trang bị gỡ
  // → Back đi thẳng không hỏi. Hook phải nghe ở capture và chặn mọi listener khác khi đang chặn; proceed thì cho đi.
  it('popstate khi when: listener gắn TRƯỚC (vai router) KHÔNG nhận sự kiện; URL được trả về; proceed → router nhận và đi', async () => {
    renderHarness({ initialWhen: false });
    fireEvent.click(screen.getByText('go-x'));
    expect(window.location.pathname).toBe('/x');
    cleanup();
    const earlier = vi.fn();
    window.addEventListener('popstate', earlier);
    try {
      renderHarness();
      act(() => {
        window.history.back();
      });
      await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('blocked'));
      // URL được trả về /x (lần popstate trả về cũng bị nuốt), listener gắn trước chưa từng chạy.
      await waitFor(() => expect(window.location.pathname).toBe('/x'));
      await new Promise((r) => setTimeout(r, 30));
      expect(earlier).not.toHaveBeenCalled();
      expect(screen.getByTestId('loc').textContent).toBe('/x');

      act(() => latestBlocker.proceed());
      await waitFor(() => expect(window.location.pathname).toBe('/start'));
      await waitFor(() => expect(earlier).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/start'));
    } finally {
      window.removeEventListener('popstate', earlier);
    }
  });

  it('bộ gác popstate gắn NGAY lúc nạp module (để đứng trước listener của BrowserRouter gắn lúc mount)', async () => {
    vi.resetModules();
    const spy = vi.spyOn(window, 'addEventListener');
    try {
      await import('../useBrowserRouterBlocker.js');
      expect(spy.mock.calls.some(([type, , options]) => type === 'popstate' && options === true)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('popstate khi when=false: không chặn, listener khác nhận bình thường', async () => {
    renderHarness({ initialWhen: false });
    fireEvent.click(screen.getByText('go-x'));
    const earlier = vi.fn();
    window.addEventListener('popstate', earlier);
    try {
      act(() => {
        window.history.back();
      });
      await waitFor(() => expect(earlier).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('state').textContent).toBe('unblocked');
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/start'));
    } finally {
      window.removeEventListener('popstate', earlier);
    }
  });
});
