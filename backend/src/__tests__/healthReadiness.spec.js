import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { markRuntimeReady, markRuntimeStarting } from '../utils/runtimeReadiness.util.js';

describe('GET /api/health readiness contract', () => {
  let app;

  // Vì sao cần timeout riêng (đã làm đỏ Deploy Backend 06/09 hai lượt liên tiếp):
  // MỌI request tới /api/health đều đi qua dynamicCors (app.js:108) và
  // domainResolver (app.js:143) — cả hai đọc DB. Bộ unit test không có DB nên mỗi
  // request phải chờ hết timeout kết nối rồi mới tới handler, đo được ~5,03s/request
  // khi trỏ DB vào cổng chết. Con số đó nằm ngay trên ngưỡng mặc định 5s của Jest,
  // nên máy dev có DB thì xanh còn CI thì đỏ.
  //
  // Chi phí này là MỖI REQUEST chứ không phải một lần, nên hâm nóng trước không
  // giải quyết được — phải nâng timeout của chính test. 30s cho biên độ rộng.
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
  }, 30000);

  it('returns 200 only after runtime readiness is marked ready', async () => {
    markRuntimeReady();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  }, 30000);
});
