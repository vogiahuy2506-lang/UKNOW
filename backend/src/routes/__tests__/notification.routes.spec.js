import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * /api/notifications/* — route + controller + service THẬT, repository giả. authMiddleware giả theo header:
 *   không header → 401; "Bearer user" → chủ (id 5); "Bearer employee" → nhân viên id 12 đang làm việc trong workspace của chủ 9.
 */
const mockList = jest.fn();
const mockCountUnread = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockListByUser = jest.fn();
const mockUpsertPreference = jest.fn();
const mockListSettings = jest.fn();

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    const header = req.headers.authorization;
    if (header === 'Bearer user') {
      req.user = { id: 5, role: 'user', activeContext: { type: 'self', ownerId: 5 } };
    } else if (header === 'Bearer employee') {
      req.user = { id: 12, role: 'user', activeContext: { type: 'employee', ownerId: 9, permissions: {} } };
    } else {
      return res.status(401).json({ success: false, message: 'Không tìm thấy token xác thực' });
    }
    return next();
  },
}));
jest.unstable_mockModule('../../repositories/notification/userNotification.repository.js', () => ({
  default: {
    list: mockList,
    countUnread: mockCountUnread,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
  },
}));
jest.unstable_mockModule('../../repositories/notification/notificationPreference.repository.js', () => ({
  default: { listByUser: mockListByUser, upsert: mockUpsertPreference },
}));
jest.unstable_mockModule('../../repositories/notification/notificationEventSetting.repository.js', () => ({
  default: { listAll: mockListSettings },
}));

const { default: notificationRoutes } = await import('../notification.routes.js');
const { clearEventSettingsCache } = await import('../../services/notification/notificationDispatch.service.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);
  return app;
}

const row = (over = {}) => ({
  id: '101',
  event_type: 'campaign_run_failed',
  title: 'Chiến dịch lỗi',
  title_en: 'Campaign failed',
  message: 'Nội dung',
  message_en: null,
  link: '/app/campaigns',
  severity: 'error',
  metadata: { runId: 7 },
  notification_id: null,
  read_at: null,
  created_at: '2026-10-10T01:00:00.000Z',
  ...over,
});

describe('/api/notifications', () => {
  let app;
  beforeEach(() => {
    jest.resetAllMocks();
    clearEventSettingsCache();
    app = makeApp();
    mockListSettings.mockResolvedValue([]);
    mockListByUser.mockResolvedValue(new Map());
    mockList.mockResolvedValue({ rows: [], total: 0 });
    mockCountUnread.mockResolvedValue(0);
    mockMarkRead.mockResolvedValue(null);
    mockMarkAllRead.mockResolvedValue(0);
    mockUpsertPreference.mockResolvedValue(undefined);
  });

  describe('xác thực', () => {
    it.each([
      ['get', '/api/notifications'],
      ['get', '/api/notifications/unread-count'],
      ['get', '/api/notifications/preferences'],
      ['put', '/api/notifications/preferences'],
      ['post', '/api/notifications/read-all'],
      ['post', '/api/notifications/101/read'],
    ])('%s %s không token → 401', async (method, url) => {
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /', () => {
    it('trả { items, unreadCount, pagination } trong data, map camelCase + cờ read', async () => {
      mockList.mockResolvedValue({
        rows: [row(), row({ id: '100', read_at: '2026-10-10T02:00:00.000Z', title_en: null })],
        total: 2,
      });
      mockCountUnread.mockResolvedValue(1);

      const res = await request(app).get('/api/notifications').set('Authorization', 'Bearer user');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBe(1);
      expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
      expect(res.body.data.items[0]).toEqual({
        id: 101,
        eventType: 'campaign_run_failed',
        title: 'Chiến dịch lỗi',
        titleEn: 'Campaign failed',
        message: 'Nội dung',
        messageEn: null,
        link: '/app/campaigns',
        severity: 'error',
        metadata: { runId: 7 },
        notificationId: null,
        read: false,
        readAt: null,
        createdAt: '2026-10-10T01:00:00.000Z',
      });
      expect(res.body.data.items[1].read).toBe(true);
      expect(res.body.data.items[1].titleEn).toBeNull();
    });

    it('NHÂN VIÊN đọc theo id của CHÍNH MÌNH (12), không phải chủ workspace (9)', async () => {
      await request(app).get('/api/notifications').set('Authorization', 'Bearer employee').expect(200);
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ userId: 12 }));
      expect(mockCountUnread).toHaveBeenCalledWith(12);
    });

    it('?unread=1&page=3&limit=10 → lọc chưa đọc + phân trang; limit bị chặn trần 50', async () => {
      await request(app).get('/api/notifications?unread=1&page=3&limit=10').set('Authorization', 'Bearer user').expect(200);
      expect(mockList).toHaveBeenLastCalledWith({ userId: 5, page: 3, limit: 10, unreadOnly: true });

      await request(app).get('/api/notifications?limit=500').set('Authorization', 'Bearer user').expect(200);
      expect(mockList).toHaveBeenLastCalledWith({ userId: 5, page: 1, limit: 50, unreadOnly: false });
    });

    it('lỗi DB → 500 chuẩn', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockList.mockRejectedValue(new Error('db down'));
      const res = await request(app).get('/api/notifications').set('Authorization', 'Bearer user');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, message: 'Lỗi server' });
    });
  });

  describe('GET /unread-count', () => {
    it('trả { unreadCount } theo id người thao tác', async () => {
      mockCountUnread.mockResolvedValue(7);
      const res = await request(app).get('/api/notifications/unread-count').set('Authorization', 'Bearer employee');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ unreadCount: 7 });
      expect(mockCountUnread).toHaveBeenCalledWith(12);
    });
  });

  describe('POST /:id/read', () => {
    it('thông báo của NGƯỜI KHÁC (hoặc không tồn tại) → 404, repo được hỏi đúng cặp (id, người gọi)', async () => {
      mockMarkRead.mockResolvedValue(null);
      const res = await request(app).post('/api/notifications/101/read').set('Authorization', 'Bearer user');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(mockMarkRead).toHaveBeenCalledWith('101', 5);
    });

    it('của chính mình → 200 { id, readAt }', async () => {
      mockMarkRead.mockResolvedValue({ id: '101', read_at: '2026-10-10T03:00:00.000Z' });
      const res = await request(app).post('/api/notifications/101/read').set('Authorization', 'Bearer employee');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: 101, readAt: '2026-10-10T03:00:00.000Z' });
      expect(mockMarkRead).toHaveBeenCalledWith('101', 12);
    });

    it('id không phải số → 400, không chạm DB', async () => {
      const res = await request(app).post('/api/notifications/abc/read').set('Authorization', 'Bearer user');
      expect(res.status).toBe(400);
      expect(mockMarkRead).not.toHaveBeenCalled();
    });
  });

  describe('POST /read-all', () => {
    it('đánh dấu hết của chính người gọi, trả số dòng', async () => {
      mockMarkAllRead.mockResolvedValue(4);
      const res = await request(app).post('/api/notifications/read-all').set('Authorization', 'Bearer user');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ updated: 4 });
      expect(mockMarkAllRead).toHaveBeenCalledWith(5);
    });
  });

  describe('GET /preferences', () => {
    it('chỉ liệt kê sự kiện audience=user (7 mục), không có sự kiện của admin', async () => {
      const res = await request(app).get('/api/notifications/preferences').set('Authorization', 'Bearer user');
      expect(res.status).toBe(200);
      expect(res.body.data.map((item) => item.eventType)).toEqual([
        'admin_broadcast',
        'campaign_run_completed',
        'campaign_run_failed',
        'campaign_approval_required',
        'campaign_schedule_skipped',
        'support_ticket_replied',
        'support_ticket_closed',
      ]);
    });

    it('emailEnabled HIỆU LỰC: mặc định theo catalog; người dùng tắt → false; loại khoá luôn true dù có dòng tuỳ chọn false', async () => {
      mockListByUser.mockResolvedValue(new Map([
        ['campaign_run_failed', false],
        ['campaign_approval_required', false],
      ]));

      const res = await request(app).get('/api/notifications/preferences').set('Authorization', 'Bearer user');
      const byKey = Object.fromEntries(res.body.data.map((item) => [item.eventType, item]));

      expect(byKey.campaign_run_completed).toMatchObject({ emailEnabled: false, userCanDisableEmail: true, inAppEnabled: true });
      expect(byKey.campaign_run_failed).toMatchObject({ emailEnabled: false, userCanDisableEmail: true, systemEmailEnabled: true });
      expect(byKey.campaign_schedule_skipped).toMatchObject({ emailEnabled: true, userCanDisableEmail: true });
      expect(byKey.campaign_approval_required).toMatchObject({ emailEnabled: true, userCanDisableEmail: false });
      expect(byKey.support_ticket_replied).toMatchObject({ emailEnabled: true, userCanDisableEmail: false });
      expect(byKey.campaign_run_failed.label).toBeTruthy();
      expect(byKey.campaign_run_failed.labelEn).toBeTruthy();
      expect(byKey.campaign_run_failed.description).toBeTruthy();
    });

    it('super admin tắt email loại này → emailEnabled false + systemEmailEnabled false', async () => {
      mockListSettings.mockResolvedValue([{
        eventType: 'campaign_schedule_skipped', inAppEnabled: true, emailEnabled: false,
        userCanDisableEmail: true, updatedBy: 1, updatedAt: null,
      }]);
      const res = await request(app).get('/api/notifications/preferences').set('Authorization', 'Bearer user');
      const item = res.body.data.find((entry) => entry.eventType === 'campaign_schedule_skipped');
      expect(item).toMatchObject({ emailEnabled: false, systemEmailEnabled: false });
    });
  });

  describe('PUT /preferences', () => {
    const put = (body, who = 'Bearer user') => request(app).put('/api/notifications/preferences').set('Authorization', who).send(body);

    it('loại KHÔNG cho tắt (campaign_approval_required) → 400 NOTIFICATION_EMAIL_LOCKED, không ghi', async () => {
      const res = await put({ eventType: 'campaign_approval_required', emailEnabled: false });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NOTIFICATION_EMAIL_LOCKED');
      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('khoá không có trong catalog → 400; khoá của admin (support_ticket_created) → 400', async () => {
      expect((await put({ eventType: 'khong_co', emailEnabled: false })).status).toBe(400);
      expect((await put({ eventType: 'support_ticket_created', emailEnabled: false })).status).toBe(400);
      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('emailEnabled không phải boolean → 400', async () => {
      expect((await put({ eventType: 'campaign_run_failed', emailEnabled: 'false' })).status).toBe(400);
      expect((await put({ eventType: 'campaign_run_failed' })).status).toBe(400);
      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('email của loại này đang bị HỆ THỐNG tắt → 400 NOTIFICATION_EMAIL_DISABLED_BY_SYSTEM', async () => {
      mockListSettings.mockResolvedValue([{
        eventType: 'campaign_run_failed', inAppEnabled: true, emailEnabled: false,
        userCanDisableEmail: true, updatedBy: 1, updatedAt: null,
      }]);
      const res = await put({ eventType: 'campaign_run_failed', emailEnabled: true });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NOTIFICATION_EMAIL_DISABLED_BY_SYSTEM');
      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('tắt email loại cho phép → 200, ghi theo id người gọi (nhân viên ghi cho chính mình), trả mục sau cập nhật', async () => {
      const res = await put({ eventType: 'campaign_run_failed', emailEnabled: false }, 'Bearer employee');
      expect(res.status).toBe(200);
      expect(mockUpsertPreference).toHaveBeenCalledWith(12, 'campaign_run_failed', false);
      expect(res.body.data).toMatchObject({ eventType: 'campaign_run_failed', emailEnabled: false, userCanDisableEmail: true });
    });

    it('admin mở khoá (user_can_disable_email=false → true) thì người dùng tắt được; ngược lại (khoá) thì bị chặn', async () => {
      mockListSettings.mockResolvedValue([
        { eventType: 'campaign_approval_required', inAppEnabled: true, emailEnabled: true, userCanDisableEmail: true, updatedBy: 1, updatedAt: null },
        { eventType: 'campaign_run_failed', inAppEnabled: true, emailEnabled: true, userCanDisableEmail: false, updatedBy: 1, updatedAt: null },
      ]);
      expect((await put({ eventType: 'campaign_approval_required', emailEnabled: false })).status).toBe(200);
      expect((await put({ eventType: 'campaign_run_failed', emailEnabled: false })).status).toBe(400);
    });
  });
});
