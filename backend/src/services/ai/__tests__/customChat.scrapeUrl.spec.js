import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dns from 'node:dns';
import http from 'node:http';

const scrapeUrlWithJs = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../utils/fileExtractor.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({ stripMarkdown: (t) => t }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage: () => ({}),
  isThinkingBudgetRejection: () => false,
  joinGeminiTextParts: () => '',
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({ resolveAllowedModel: jest.fn() }));
jest.unstable_mockModule('../../chatbot/chatAttachment.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../utils/puppeteerScraper.util.js', () => ({ scrapeUrlWithJs }));

const { default: customChatService } = await import('../customChat.service.js');
const { SsrfBlockedError, SSRF_BLOCKED_CODE } = await import('../../../utils/ssrfGuard.util.js');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW_LOOPBACK = process.env.SSRF_ALLOW_LOOPBACK;
const PAGE_TEXT = 'Đây là nội dung trang dùng làm tài liệu cho kho tri thức của chatbot, đủ dài để được lưu.';

describe('customChatService.scrapeUrl — chống SSRF', () => {
  let server;
  let base;
  let hits;
  let replaceSpy;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(req.url);
      if (req.url === '/to-metadata') {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<html><head><title>x</title></head><body><p>${PAGE_TEXT}</p></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    hits = [];
    scrapeUrlWithJs.mockReset();
    replaceSpy = jest.spyOn(customChatService, '_replaceKnowledgeDocument').mockResolvedValue(['đoạn 1']);
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
    'http://127.0.0.1:5001/api/health',
    'http://[::ffff:10.0.0.1]/',
    'http://redis:6379/',
  ])('URL nội bộ %s → 400, không mở trình duyệt, không lưu', async (url) => {
    await expect(customChatService.scrapeUrl({ chatbotId: 1, userId: 2, url }))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE, status: 400 });
    expect(scrapeUrlWithJs).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('tên host phân giải ra IP nội bộ → 400', async () => {
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '172.18.0.5', family: 4 }]);
    await expect(customChatService.scrapeUrl({ chatbotId: 1, userId: 2, url: 'https://kb.attacker.example/' }))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE, status: 400 });
    expect(scrapeUrlWithJs).not.toHaveBeenCalled();
  });

  it('DNS lỗi ở bước kiểm → 503 như trước (không phải lỗi SSRF)', async () => {
    jest.spyOn(dns.promises, 'lookup').mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND khong-ton-tai.example'), { code: 'ENOTFOUND' })
    );
    await expect(customChatService.scrapeUrl({ chatbotId: 1, userId: 2, url: 'https://khong-ton-tai.example/' }))
      .rejects.toMatchObject({ status: 503 });
  });

  it('trình duyệt báo bị chặn (redirect nội bộ) → dừng, không thử lại bằng fetch', async () => {
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    scrapeUrlWithJs.mockRejectedValue(new SsrfBlockedError());
    await expect(customChatService.scrapeUrl({ chatbotId: 1, userId: 2, url: `${base}/page` }))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE, status: 400 });
    expect(hits).toEqual([]);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('Puppeteer lỗi thường → fetch dự phòng qua safeFetch và lưu nội dung', async () => {
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    scrapeUrlWithJs.mockRejectedValue(new Error('Could not find Chrome'));
    const result = await customChatService.scrapeUrl({ chatbotId: 1, userId: 2, url: `${base}/page` });
    expect(result.chunks).toBe(1);
    expect(hits).toEqual(['/page']);
    expect(replaceSpy).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'url',
      sourceKey: `${base}/page`,
      text: expect.stringContaining('nội dung trang'),
    }));
  });

  it('fetch dự phòng gặp redirect tới metadata → 400, không lưu', async () => {
    process.env.SSRF_ALLOW_LOOPBACK = 'true';
    scrapeUrlWithJs.mockRejectedValue(new Error('Could not find Chrome'));
    await expect(customChatService.scrapeUrl({ chatbotId: 1, userId: 2, url: `${base}/to-metadata` }))
      .rejects.toMatchObject({ code: SSRF_BLOCKED_CODE, status: 400 });
    expect(hits).toEqual(['/to-metadata']);
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
