import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * /api/admin/notifications — kiểm `channels` ở create / update / send-direct và câu trả lời sau khi gửi (PR-3).
 * Route + controller THẬT (requireRole thật); service giả.
 */
const mockCreateNotification = jest.fn();
const mockUpdateNotification = jest.fn();
const mockSendDirect = jest.fn();
const mockSendNow = jest.fn();
const mockGetById = jest.fn();
const channelOff = () => Object.assign(new Error('Kênh Chuông đang tắt trong Cấu hình kênh'), { status: 400 });

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    const header = req.headers.authorization;
    if (header === 'Bearer admin') {
      req.user = { id: 1, role: 'admin', activeContext: { type: 'self', ownerId: 1 } };
    } else if (header === 'Bearer user') {
      req.user = { id: 5, role: 'user', activeContext: { type: 'self', ownerId: 5 } };
    } else {
      return res.status(401).json({ success: false, message: 'Không tìm thấy token xác thực' });
    }
    return next();
  },
}));
jest.unstable_mockModule('../../services/admin/notification.service.js', () => ({
  default: {
    createNotification: mockCreateNotification,
    updateNotification: mockUpdateNotification,
    sendDirect: mockSendDirect,
    sendNow: mockSendNow,
    getNotificationById: mockGetById,
  },
}));
jest.unstable_mockModule('../../services/admin/notificationTemplate.service.js', () => ({ default: {} }));

const { default: routes } = await import('../adminNotification.routes.js');

const app = express();
app.use(express.json());
app.use('/api/admin/notifications', routes);

const admin = (req) => req.set('Authorization', 'Bearer admin');
const BASE_BODY = { title: 'Bảo trì', message: 'Nội dung', target_user_ids: [39] };

describe('/api/admin/notifications — channels', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateNotification.mockResolvedValue({ id: 9 });
    mockUpdateNotification.mockResolvedValue({ id: 9 });
    mockGetById.mockResolvedValue({ id: 9, status: 'draft' });
    mockSendDirect.mockResolvedValue({
      sent: 1, failed: 0, total: 1, failedEmails: [], emailTotal: 1, emailSkipped: 0, inApp: 1, channels: ['email', 'in_app'],
    });
    mockSendNow.mockResolvedValue({
      sent: 0, failed: 0, total: 4, failedEmails: [], emailTotal: 0, emailSkipped: 0, inApp: 4, channels: ['in_app'],
    });
  });

  it('user thường → 403, không chạm service', async () => {
    const res = await request(app)
      .post('/api/admin/notifications/send-direct')
      .set('Authorization', 'Bearer user')
      .send({ ...BASE_BODY, channels: ['email'] });
    expect(res.status).toBe(403);
    expect(mockSendDirect).not.toHaveBeenCalled();
  });

  it.each([
    ['rỗng', []],
    ['giá trị lạ', ['email', 'sms']],
    ['không phải mảng', 'email'],
    ['null', null],
  ])('send-direct với channels %s → 400, KHÔNG tạo/gửi bản tin', async (_label, channels) => {
    const res = await admin(request(app).post('/api/admin/notifications/send-direct')).send({ ...BASE_BODY, channels });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockSendDirect).not.toHaveBeenCalled();
  });

  it.each([
    ['rỗng', []],
    ['giá trị lạ', ['push']],
  ])('tạo bản tin (nháp/hẹn giờ) với channels %s → 400', async (_label, channels) => {
    const res = await admin(request(app).post('/api/admin/notifications')).send({ ...BASE_BODY, channels });
    expect(res.status).toBe(400);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('PATCH với channels rỗng → 400; không gửi channels → vẫn cập nhật bình thường', async () => {
    const bad = await admin(request(app).patch('/api/admin/notifications/9')).send({ channels: [] });
    expect(bad.status).toBe(400);
    expect(mockUpdateNotification).not.toHaveBeenCalled();

    const ok = await admin(request(app).patch('/api/admin/notifications/9')).send({ title: 'Đổi tiêu đề' });
    expect(ok.status).toBe(200);
    expect(mockUpdateNotification).toHaveBeenCalledWith('9', { title: 'Đổi tiêu đề' });
  });

  it('channels hợp lệ được chuẩn hoá (bỏ trùng, email trước) rồi truyền xuống service', async () => {
    const created = await admin(request(app).post('/api/admin/notifications')).send({ ...BASE_BODY, channels: ['in_app', 'email', 'in_app'] });
    expect(created.status).toBe(201);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ channels: ['email', 'in_app'] }));

    const sent = await admin(request(app).post('/api/admin/notifications/send-direct')).send({ ...BASE_BODY, channels: ['in_app'] });
    expect(sent.status).toBe(200);
    expect(mockSendDirect).toHaveBeenCalledWith(expect.objectContaining({ channels: ['in_app'], created_by: 1 }));

    const patched = await admin(request(app).patch('/api/admin/notifications/9')).send({ channels: ['in_app', 'email'] });
    expect(patched.status).toBe(200);
    expect(mockUpdateNotification).toHaveBeenCalledWith('9', { channels: ['email', 'in_app'] });
  });

  it('không gửi channels (client cũ) → service nhận channels undefined (kho sẽ mặc định {email})', async () => {
    const res = await admin(request(app).post('/api/admin/notifications/send-direct')).send(BASE_BODY);
    expect(res.status).toBe(200);
    expect(mockSendDirect.mock.calls[0][0].channels).toBeUndefined();
  });

  it('service báo kênh đang tắt trong Cấu hình kênh → create / PATCH / send-direct / send đều trả 400 kèm đúng câu', async () => {
    mockCreateNotification.mockRejectedValue(channelOff());
    mockUpdateNotification.mockRejectedValue(channelOff());
    mockSendDirect.mockRejectedValue(channelOff());
    mockSendNow.mockRejectedValue(channelOff());

    const responses = [
      await admin(request(app).post('/api/admin/notifications')).send({ ...BASE_BODY, channels: ['in_app'] }),
      await admin(request(app).patch('/api/admin/notifications/9')).send({ channels: ['in_app'] }),
      await admin(request(app).post('/api/admin/notifications/send-direct')).send({ ...BASE_BODY, channels: ['in_app'] }),
      await admin(request(app).post('/api/admin/notifications/9/send')).send({}),
    ];

    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, message: 'Kênh Chuông đang tắt trong Cấu hình kênh' });
    }
  });

  it('send-direct trả câu tổng kết có cả email lẫn chuông', async () => {
    const res = await admin(request(app).post('/api/admin/notifications/send-direct')).send({ ...BASE_BODY, channels: ['email', 'in_app'] });
    expect(res.body).toMatchObject({
      success: true,
      message: 'Đã gửi thành công 1/1 email. Đã gửi 1 thông báo chuông',
      data: { inApp: 1, emailTotal: 1 },
    });
  });

  it('/:id/send của bản tin chỉ-chuông: success=true dù không email nào đi (không bị coi là "thất bại toàn bộ")', async () => {
    const res = await admin(request(app).post('/api/admin/notifications/9/send')).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Đã gửi 4 thông báo chuông');
  });
});
