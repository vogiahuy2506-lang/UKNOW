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
