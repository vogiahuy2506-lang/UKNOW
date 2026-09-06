import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { markRuntimeReady, markRuntimeStarting } from '../utils/runtimeReadiness.util.js';

describe('GET /api/health readiness contract', () => {
  let app;

  // createApp() nạp toàn bộ router/controller/service của backend. Trên CI nguội
  // việc này vượt quá timeout mặc định 5s của Jest (đã làm đỏ Deploy Backend
  // 06/09), trong khi máy dev đủ nhanh nên không lộ ra. Dựng MỘT lần với timeout
  // rộng rồi dùng lại: readiness là state cấp module và handler đọc lại nó ở từng
  // request, nên không cần app mới cho mỗi trạng thái.
  beforeAll(() => {
    app = createApp();
  }, 60000);

  afterEach(() => {
    markRuntimeReady();
  });

  it('returns 503 until critical post-listen startup finishes', async () => {
    markRuntimeStarting();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('starting');
  });

  it('returns 200 only after runtime readiness is marked ready', async () => {
    markRuntimeReady();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
