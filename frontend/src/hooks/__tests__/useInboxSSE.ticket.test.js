/**
 * H-04 — luồng SSE xin vé ngắn hạn rồi mới mở EventSource; JWT không bao giờ nằm trên URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.payload-co-email.chu-ky';

const authState = { user: { id: 7 }, activeContext: { type: 'self', ownerId: 7 } };
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => authState,
}));

const createInboxStreamTicket = vi.fn();
vi.mock('../../services/chatbotApi', () => ({
  default: { createInboxStreamTicket: (...args) => createInboxStreamTicket(...args) },
}));

class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  close() {
    this.closed = true;
  }
}

const { useInboxSSE } = await import('../useInboxSSE');

beforeEach(() => {
  FakeEventSource.instances = [];
  createInboxStreamTicket.mockReset();
  vi.stubGlobal('EventSource', FakeEventSource);
  localStorage.setItem('accessToken', ACCESS_TOKEN);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('useInboxSSE — vé SSE', () => {
  it('xin vé rồi mở EventSource với ?ticket=, URL không chứa JWT', async () => {
    createInboxStreamTicket.mockResolvedValue({ success: true, data: { ticket: 'vé-1', expiresInSeconds: 60 } });

    renderHook(() => useInboxSSE(vi.fn(), vi.fn()));

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const { url } = FakeEventSource.instances[0];
    expect(createInboxStreamTicket).toHaveBeenCalledTimes(1);
    expect(url).toContain('ticket=');
    expect(url).not.toContain(ACCESS_TOKEN);
    expect(url).not.toContain('token=');
  });

  it('xin vé thất bại → không mở EventSource', async () => {
    createInboxStreamTicket.mockRejectedValue(new Error('403'));

    renderHook(() => useInboxSSE(vi.fn(), vi.fn()));

    await waitFor(() => expect(createInboxStreamTicket).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('rời trang trong lúc chờ vé → vé về trễ bị bỏ, không mở EventSource mồ côi', async () => {
    let resolveTicket;
    createInboxStreamTicket.mockImplementation(() => new Promise((resolve) => { resolveTicket = resolve; }));

    const { unmount } = renderHook(() => useInboxSSE(vi.fn(), vi.fn()));
    await waitFor(() => expect(createInboxStreamTicket).toHaveBeenCalled());

    unmount();
    await act(async () => {
      resolveTicket({ success: true, data: { ticket: 'vé-trễ' } });
      await Promise.resolve();
    });

    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

describe('useInboxSSE — nhịp sống và callback (H-26)', () => {
  const connectOne = async (handlers = {}) => {
    createInboxStreamTicket.mockResolvedValue({ success: true, data: { ticket: 'vé-1' } });
    const utils = renderHook((props) => useInboxSSE(props.onNew, props.onUnread, props.onReconnected), {
      initialProps: { onNew: handlers.onNew || vi.fn(), onUnread: vi.fn(), onReconnected: handlers.onReconnected },
    });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    return utils;
  };

  it('sự kiện ping của server reset bộ đếm 60 giây: kết nối khoẻ không bị cắt', async () => {
    await connectOne();
    const source = FakeEventSource.instances[0];
    vi.useFakeTimers();
    act(() => { source.listeners.connected(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    act(() => { source.listeners.ping(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });

    expect(source.closed).toBe(false);
    expect(createInboxStreamTicket).toHaveBeenCalledTimes(1);
  });

  it('im lặng hoàn toàn 60 giây (không ping) → client tự đóng để nối lại', async () => {
    await connectOne();
    const source = FakeEventSource.instances[0];
    vi.useFakeTimers();
    act(() => { source.listeners.connected(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });

    expect(source.closed).toBe(true);
  });

  it('đổi callback giữa các lần render KHÔNG đóng/mở lại EventSource, và tin đến gọi callback MỚI nhất', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = await connectOne({ onNew: first });
    const source = FakeEventSource.instances[0];

    rerender({ onNew: second, onUnread: vi.fn() });
    act(() => { source.listeners['inbox:new_message']({ data: JSON.stringify({ conversationId: 1 }) }); });

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(source.closed).toBe(false);
    expect(createInboxStreamTicket).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ conversationId: 1 });
  });

  it('lần "connected" đầu không gọi onReconnected; lần nối lại sau đó thì có', async () => {
    const onReconnected = vi.fn();
    await connectOne({ onReconnected });
    const source = FakeEventSource.instances[0];

    act(() => { source.listeners.connected(); });
    expect(onReconnected).not.toHaveBeenCalled();

    act(() => { source.listeners.connected(); });
    expect(onReconnected).toHaveBeenCalledTimes(1);
  });
});
