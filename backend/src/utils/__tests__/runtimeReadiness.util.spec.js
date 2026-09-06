import { afterEach, describe, expect, it } from '@jest/globals';
import {
  getRuntimeReadiness,
  markRuntimeFailed,
  markRuntimeReady,
  markRuntimeStarting,
} from '../runtimeReadiness.util.js';

describe('runtime readiness state', () => {
  afterEach(() => {
    markRuntimeReady();
  });

  it('remains closed while critical startup is in progress', () => {
    markRuntimeStarting();
    expect(getRuntimeReadiness()).toMatchObject({ ready: false, phase: 'starting', failure: null });
  });

  it('records startup failure without exposing a ready state', () => {
    markRuntimeStarting();
    markRuntimeFailed(Object.assign(new Error('queue unavailable'), { code: 'QUEUE_UNAVAILABLE' }));

    expect(getRuntimeReadiness()).toMatchObject({
      ready: false,
      phase: 'failed',
      failure: 'QUEUE_UNAVAILABLE',
    });
  });
});
