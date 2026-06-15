import EventEmitter from 'node:events';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const markAccountDisconnectedById = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignZaloSender.repository.js', () => ({
  default: {
    markAccountDisconnectedById,
  },
}));

const { default: zaloAccountSessionService } = await import('../zaloAccountSession.service.js');

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function createApi() {
  return {
    listener: new EventEmitter(),
  };
}

describe('zaloAccountSession.service', () => {
  let warnSpy;

  beforeEach(() => {
    markAccountDisconnectedById.mockReset();
    markAccountDisconnectedById.mockResolvedValue(undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    zaloAccountSessionService.clearAccountApi(10);
    zaloAccountSessionService.clearAccountApi(11);
  });

  it('marks account disconnected and clears memory when Zalo closes duplicate session', async () => {
    const api = createApi();
    zaloAccountSessionService.setAccountApi(10, api);
    zaloAccountSessionService.attachListenerErrorGuard(10, api, 'unit-test');

    api.listener.emit('closed', 3000, 'DuplicateConnection');
    await flushPromises();

    expect(markAccountDisconnectedById).toHaveBeenCalledWith('10');
    expect(zaloAccountSessionService.getAccountApi(10)).toBeNull();
  });

  it('handles disconnected and closed from the same close only once', async () => {
    const api = createApi();
    zaloAccountSessionService.setAccountApi(10, api);
    zaloAccountSessionService.attachListenerErrorGuard(10, api, 'unit-test');

    api.listener.emit('disconnected', 3000, 'DuplicateConnection');
    api.listener.emit('closed', 3000, 'DuplicateConnection');
    await flushPromises();

    expect(markAccountDisconnectedById).toHaveBeenCalledTimes(1);
    expect(zaloAccountSessionService.getAccountApi(10)).toBeNull();
  });

  it('preserves DB status and clears memory for abnormal close', async () => {
    const api = createApi();
    zaloAccountSessionService.setAccountApi(10, api);
    zaloAccountSessionService.attachListenerErrorGuard(10, api, 'unit-test');

    api.listener.emit('closed', 1006, 'AbnormalClosure');
    await flushPromises();

    expect(markAccountDisconnectedById).not.toHaveBeenCalled();
    expect(zaloAccountSessionService.getAccountApi(10)).toBeNull();
  });

  it('ignores close events from a stale listener after a newer API is registered', async () => {
    const oldApi = createApi();
    const newApi = createApi();
    zaloAccountSessionService.setAccountApi(10, oldApi);
    zaloAccountSessionService.attachListenerErrorGuard(10, oldApi, 'unit-test');
    zaloAccountSessionService.setAccountApi(10, newApi);

    oldApi.listener.emit('closed', 3000, 'DuplicateConnection');
    await flushPromises();

    expect(markAccountDisconnectedById).not.toHaveBeenCalled();
    expect(zaloAccountSessionService.getAccountApi(10)).toBe(newApi);
  });
});
