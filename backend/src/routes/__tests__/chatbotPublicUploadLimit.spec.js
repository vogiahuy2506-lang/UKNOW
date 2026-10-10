import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * Đường tải tệp CÔNG KHAI của web chat (không đăng nhập, multer memoryStorage → cả tệp nằm RAM) có trần riêng 20 MB,
 * thấp hơn trần 100 MB của đường có đăng nhập. Dựng ĐÚNG router `chatbotPublic.routes.js`; chỉ giả ranh giới
 * (CORS, bộ giới hạn, kiểm dung lượng đĩa, controller).
 */
const passthrough = (req, res, next) => next();
const uploadHandler = jest.fn((req, res) => res.json({ success: true, size: req.file?.size ?? 0 }));

jest.unstable_mockModule('../../middleware/dynamicCors.middleware.js', () => ({ allowAllCorsMiddleware: passthrough }));
jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  publicChatLimiter: passthrough,
  publicUploadLimiter: passthrough,
  publicChatPollIpLimiter: passthrough,
  publicChatPollSessionLimiter: passthrough,
}));
jest.unstable_mockModule('../../middleware/storageCapacity.middleware.js', () => ({ storageCapacityGuard: () => passthrough }));
jest.unstable_mockModule('../../utils/storageCapacity.util.js', () => ({ getStoragePaths: () => ({ uploads: '/tmp' }) }));
jest.unstable_mockModule('../../controllers/chatbot.controller.js', () => ({
  default: new Proxy({}, {
    get: (_t, name) => ({ bind: () => (name === 'uploadPublicChatAttachment' || name === 'uploadPublicChatAttachmentById' ? uploadHandler : passthrough) }),
  }),
}));

const { default: router } = await import('../chatbotPublic.routes.js');
const { MAX_PUBLIC_UPLOAD_FILE_MB, MAX_PUBLIC_UPLOAD_FILE_BYTES } = await import('../../utils/uploadLimits.util.js');

const app = express();
app.use('/', router);

describe('web chat công khai — trần tải tệp', () => {
  beforeEach(() => uploadHandler.mockClear());

  it('trần công khai là 20 MB', () => {
    expect(MAX_PUBLIC_UPLOAD_FILE_MB).toBe(20);
    expect(MAX_PUBLIC_UPLOAD_FILE_BYTES).toBe(20 * 1024 * 1024);
  });

  it('tệp 21 MB → 413 + câu tiếng Việt nêu 20MB, controller KHÔNG được gọi', async () => {
    const res = await request(app)
      .post('/custom-chatbot/id/5/attachment')
      .attach('file', Buffer.alloc(21 * 1024 * 1024, 1), 'to.pdf');
    expect(res.status).toBe(413);
    expect(res.body.message).toContain('20MB');
    expect(res.body.code).toBe('FILE_TOO_LARGE');
    expect(uploadHandler).not.toHaveBeenCalled();
  });

  it('cả đường theo widgetKey cũng bị trần 20 MB', async () => {
    const res = await request(app)
      .post('/custom-chatbot/abc/attachment')
      .attach('file', Buffer.alloc(21 * 1024 * 1024, 1), 'to.pdf');
    expect(res.status).toBe(413);
  });

  it('ĐỐI CHỨNG: tệp 1 MB đi qua tới controller', async () => {
    const res = await request(app)
      .post('/custom-chatbot/id/5/attachment')
      .attach('file', Buffer.alloc(1024 * 1024, 1), 'nho.pdf');
    expect(res.status).toBe(200);
    expect(uploadHandler).toHaveBeenCalledTimes(1);
  });
});
