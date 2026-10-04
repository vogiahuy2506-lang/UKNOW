/**
 * H-04 — log truy cập (morgan) không được ghi JWT / vé nguyên văn.
 */
import { describe, expect, it } from '@jest/globals';
import express from 'express';
import morgan from 'morgan';
import request from 'supertest';
import { createAccessLogMiddleware, redactUrlSecrets } from '../accessLog.util.js';

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiYUBiLmNvbSJ9.chu-ky-gia';

describe('redactUrlSecrets', () => {
  it('che ?token= và ?ticket= nhưng giữ phần còn lại của URL', () => {
    expect(redactUrlSecrets(`/api/ai/chatbot/inbox/stream?token=${JWT}`))
      .toBe('/api/ai/chatbot/inbox/stream?token=[redacted]');
    expect(redactUrlSecrets('/api/ai/chatbot/inbox/stream?ticket=AbC_123-xyz'))
      .toBe('/api/ai/chatbot/inbox/stream?ticket=[redacted]');
  });

  it('che đúng tham số giữa chuỗi query, không đụng tham số khác', () => {
    expect(redactUrlSecrets(`/x?a=1&token=${JWT}&ownerContext=42`))
      .toBe('/x?a=1&token=[redacted]&ownerContext=42');
    expect(redactUrlSecrets('/x?search=nguyen&limit=20')).toBe('/x?search=nguyen&limit=20');
  });

  it('không phân biệt hoa thường; che cả access_token / refresh_token', () => {
    expect(redactUrlSecrets('/x?TOKEN=abc&Access_Token=def&refresh_token=ghi'))
      .toBe('/x?TOKEN=[redacted]&Access_Token=[redacted]&refresh_token=[redacted]');
  });

  it('không che từ chỉ chứa chữ token (vd csrftoken_name, mytoken=)', () => {
    expect(redactUrlSecrets('/x?mytoken=abc')).toBe('/x?mytoken=abc');
  });

  it('null / undefined → chuỗi rỗng', () => {
    expect(redactUrlSecrets(undefined)).toBe('');
    expect(redactUrlSecrets(null)).toBe('');
  });
});

describe('createAccessLogMiddleware', () => {
  it('dòng log thật của morgan không chứa JWT, vẫn có phương thức + đường dẫn + mã trạng thái', async () => {
    const lines = [];
    const app = express();
    app.use(createAccessLogMiddleware(morgan, { stream: { write: (line) => lines.push(line) } }));
    app.get('/api/ai/chatbot/inbox/stream', (_req, res) => res.status(401).json({ ok: false }));

    await request(app).get(`/api/ai/chatbot/inbox/stream?token=${JWT}`);

    const logged = lines.join('');
    expect(logged).not.toContain(JWT);
    expect(logged).not.toContain('eyJhbGci');
    expect(logged).toContain('GET /api/ai/chatbot/inbox/stream?token=[redacted]');
    expect(logged).toContain('401');
  });
});
