/**
 * chatbotController.addUrlDocument — cào URL cho kho tri thức phải chặn SSRF: URL/redirect trỏ vào
 * địa chỉ nội bộ bị từ chối (400) và KHÔNG lưu tài liệu.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dns from 'node:dns';
import http from 'node:http';

const knowledgeBaseService = {
  getKBById: jest.fn(),
  addDocument: jest.fn(),
  enqueueDocumentProcessing: jest.fn(),
};

jest.unstable_mockModule('../../services/chatbot/knowledgeBase.service.js', () => ({ default: knowledgeBaseService }));
jest.unstable_mockModule('../../repositories/audit.repository.js', () => ({ default: { createLog: jest.fn() } }));
// Không để service WhatsApp nạp cache từ DB lúc import (không có DB trong unit test).
jest.unstable_mockModule('../../services/chatbot/whatsappBaileys.service.js', () => ({
  default: {},
  listSessions: jest.fn(() => []),
  listPersistedSessions: jest.fn(async () => []),
  sendMessage: jest.fn(),
}));

const { default: chatbotController } = await import('../chatbot.controller.js');
const { SSRF_BLOCKED_CODE } = await import('../../utils/ssrfGuard.util.js');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW_LOOPBACK = process.env.SSRF_ALLOW_LOOPBACK;
const PAGE_TEXT = 'Nội dung hướng dẫn sử dụng sản phẩm, đủ dài để được coi là cào thành công vào kho tri thức của chatbot.';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makeReq(url) {
  return {
    params: { kbId: '7' },
    body: { url, title: 'Tài liệu' },
    user: { id: 42 },
    headers: {},
    get: () => undefined,
    ip: '203.0.113.1',
  };
}

describe('chatbotController.addUrlDocument — chống SSRF', () => {
  let server;
  let base;
  let hits;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(req.url);
      if (req.url === '/to-private') {
        res.writeHead(301, { location: 'http://10.20.30.40/secret' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body><article><p>${PAGE_TEXT}</p></article></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    hits = [];
    knowledgeBaseService.getKBById.mockResolvedValue({ id: 7, chunk_size: 500, chunking_mode: 'auto' });
    knowledgeBaseService.addDocument.mockImplementation(async (kbId, ownerId, doc) => ({ id: 99, ...doc }));
    knowledgeBaseService.enqueueDocumentProcessing.mockResolvedValue(undefined);
    process.env.NODE_ENV = 'test';
    delete process.env.SSRF_ALLOW_LOOPBACK;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_ALLOW_LOOPBACK === undefined) delete process.env.SSRF_ALLOW_LOOPBACK;
    else process.env.SSRF_ALLOW_LOOPBACK = ORIGINAL_ALLOW_LOOPBACK;
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://0x7f000001:5001/api/internal',
    'http://[::1]:6379/',
    'http://uknow-campaign-backend:5001/',
  ])('URL nội bộ %s → 400 và không lưu tài liệu', async (url) => {
    const res = mockRes();
    await chatbotController.addUrlDocument(makeReq(url), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: SSRF_BLOCKED_CODE });
    expect(knowledgeBaseService.addDocument).not.toHaveBeenCalled();
  });

  it('tên host phân giải ra IP nội bộ → 400', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '192.168.10.2', family: 4 }]);
    const res = mockRes();
    await chatbotController.addUrlDocument(makeReq('https://docs.attacker.example/'), res);
    expect(res.statusCode).toBe(400);
    expect(knowledgeBaseService.addDocument).not.toHaveBeenCalled();
  });

  it('redirect tới địa chỉ nội bộ → 400 và không lưu', async () => {
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    const res = mockRes();
    await chatbotController.addUrlDocument(makeReq(`${base}/to-private`), res);
    expect(res.statusCode).toBe(400);
    expect(hits).toEqual(['/to-private']);
    expect(knowledgeBaseService.addDocument).not.toHaveBeenCalled();
  });

  it('URL công khai → cào nội dung và lưu như trước', async () => {
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    const res = mockRes();
    await chatbotController.addUrlDocument(makeReq(`${base}/guide`), res);
    expect(res.statusCode).toBe(201);
    expect(knowledgeBaseService.addDocument).toHaveBeenCalledWith(7, 42, expect.objectContaining({
      source_type: 'url',
      source_url: `${base}/guide`,
      content_text: expect.stringContaining('Nội dung hướng dẫn'),
    }));
  });
});
