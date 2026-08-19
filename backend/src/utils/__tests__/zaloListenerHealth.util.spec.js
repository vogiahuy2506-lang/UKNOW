import { jest } from '@jest/globals';
import {
  getListenerSocketState,
  isListenerSocketHealthy,
  WS_CLOSED,
  WS_CLOSING,
  WS_CONNECTING,
  WS_OPEN,
} from '../zaloListenerHealth.util.js';

const makeApi = (ws) => ({ listener: { start: jest.fn(), ws } });

describe('zaloListenerHealth.util', () => {
  it('không có api → chết', () => {
    expect(getListenerSocketState(null)).toEqual({
      healthy: false,
      reason: 'no_api',
      readyState: null,
    });
  });

  it('api không có listener → chết', () => {
    expect(getListenerSocketState({}).reason).toBe('no_listener');
    expect(getListenerSocketState({ listener: {} }).reason).toBe('no_listener');
  });

  it('listener.ws null (zca-js reset sau khi socket đóng) → chết', () => {
    const state = getListenerSocketState(makeApi(null));
    expect(state).toEqual({ healthy: false, reason: 'socket_closed', readyState: null });
  });

  it('socket OPEN → sống', () => {
    expect(getListenerSocketState(makeApi({ readyState: WS_OPEN }))).toEqual({
      healthy: true,
      reason: 'open',
      readyState: WS_OPEN,
    });
  });

  it('socket CONNECTING (vừa restore) → coi là sống, không giết socket mới', () => {
    expect(isListenerSocketHealthy(makeApi({ readyState: WS_CONNECTING }))).toBe(true);
  });

  it('socket CLOSING / CLOSED → chết', () => {
    expect(getListenerSocketState(makeApi({ readyState: WS_CLOSING }))).toEqual({
      healthy: false,
      reason: 'socket_closing',
      readyState: WS_CLOSING,
    });
    expect(getListenerSocketState(makeApi({ readyState: WS_CLOSED }))).toEqual({
      healthy: false,
      reason: 'socket_closed',
      readyState: WS_CLOSED,
    });
  });

  it('readyState rác → chết, readyState null', () => {
    expect(getListenerSocketState(makeApi({ readyState: 'zombie' }))).toEqual({
      healthy: false,
      reason: 'socket_closed',
      readyState: null,
    });
  });
});
