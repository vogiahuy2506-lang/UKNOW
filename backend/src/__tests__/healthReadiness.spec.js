import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { markRuntimeReady, markRuntimeStarting } from '../utils/runtimeReadiness.util.js';

describe('GET /api/health readiness contract', () => {
  afterEach(() => {
    markRuntimeReady();
  });

  it('returns 503 until critical post-listen startup finishes', async () => {
    markRuntimeStarting();

    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('starting');
  });

  it('returns 200 only after runtime readiness is marked ready', async () => {
    markRuntimeReady();

    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
