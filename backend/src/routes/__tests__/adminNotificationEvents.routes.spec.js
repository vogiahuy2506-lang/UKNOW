import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * /api/admin/notification-events — route + controller + service THẬT (requireRole thật), repository giả.
 */
const mockListSettings = jest.fn();
const mockUpsert = jest.fn();

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
jest.unstable_mockModule('../../repositories/notification/notificationEventSetting.repository.js', () => ({
  default: { listAll: mockListSettings, upsert: mockUpsert },
}));
jest.unstable_mockModule('../../repositories/notification/userNotification.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/notification/notificationPreference.repository.js', () => ({ default: {} }));

const { default: routes } = await import('../adminNotificationEvents.routes.js');
const { getEffectiveEventSettings, clearEventSettingsCache } = await import('../../services/notification/notificationDispatch.service.js');

const app = express();
app.use(express.json());
app.use('/api/admin/notification-events', routes);

const dbRow = (eventType, over = {}) => ({
  eventType, inAppEnabled: true, emailEnabled: true, userCanDisableEmail: true, updatedBy: 1, updatedAt: '2026-10-10T00:00:00.000Z', ...over,
});

describe('/api/admin/notification-events', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearEventSettingsCache();
    mockListSettings.mockResolvedValue([]);
    mockUpsert.mockResolvedValue(undefined);
  });

  it('không token → 401; user thường → 403 (cả GET và PUT)', async () => {
    expect((await request(app).get('/api/admin/notification-events')).status).toBe(401);
    expect((await request(app).get('/api/admin/notification-events').set('Authorization', 'Bearer user')).status).toBe(403);
    expect((await request(app).put('/api/admin/notification-events/campaign_run_failed').set('Authorization', 'Bearer user').send({ emailEnabled: false })).status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('GET → đủ 9 mục catalog; chưa có dòng DB thì settings = mặc định + isDefault:true; có dòng thì lấy dòng DB', async () => {
    mockListSettings.mockResolvedValue([dbRow('campaign_run_completed', { emailEnabled: true })]);

    const res = await request(app).get('/api/admin/notification-events').set('Authorization', 'Bearer admin');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(9);
    const byKey = Object.fromEntries(res.body.data.map((item) => [item.key, item]));
    expect(byKey.campaign_run_failed.settings).toEqual({
      inAppEnabled: true, emailEnabled: false, userCanDisableEmail: true, updatedBy: null, updatedAt: null, isDefault: true,
    });
    expect(byKey.campaign_run_completed.defaults).toEqual({ inApp: true, email: false });
    expect(byKey.campaign_run_completed.settings).toMatchObject({ emailEnabled: true, isDefault: false, updatedBy: 1 });
    expect(byKey.support_ticket_created.audience).toBe('admin');
    expect(byKey.campaign_approval_required.catalogUserCanDisableEmail).toBe(false);
  });

  it('PUT khoá lạ → 404; body rỗng → 400; trường không phải boolean → 400; không ghi gì', async () => {
    const put = (url, body) => request(app).put(url).set('Authorization', 'Bearer admin').send(body);
    expect((await put('/api/admin/notification-events/khong_co', { emailEnabled: false })).status).toBe(404);
    expect((await put('/api/admin/notification-events/campaign_run_failed', {})).status).toBe(400);
    expect((await put('/api/admin/notification-events/campaign_run_failed', { emailEnabled: 'no' })).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('PUT một phần: trường thiếu giữ giá trị hiện tại (DB hoặc mặc định), ghi updatedBy = admin, trả mục mới', async () => {
    mockListSettings
      .mockResolvedValueOnce([dbRow('campaign_run_failed', { inAppEnabled: false })]) // trước khi ghi
      .mockResolvedValueOnce([dbRow('campaign_run_failed', { inAppEnabled: false, emailEnabled: false })]); // sau khi ghi

    const res = await request(app)
      .put('/api/admin/notification-events/campaign_run_failed')
      .set('Authorization', 'Bearer admin')
      .send({ emailEnabled: false });

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith({
      eventType: 'campaign_run_failed',
      inAppEnabled: false, // giữ từ DB
      emailEnabled: false, // mới
      userCanDisableEmail: true, // giữ mặc định/DB
      updatedBy: 1,
    });
    expect(res.body.data.settings).toMatchObject({ inAppEnabled: false, emailEnabled: false, isDefault: false });
  });

  it('PUT xoá cache dispatcher NGAY: cấu hình mới có hiệu lực trước khi hết 60 giây', async () => {
    mockListSettings.mockResolvedValue([]);
    expect((await getEffectiveEventSettings('campaign_run_failed')).emailEnabled).toBe(false); // nạp cache (mặc định chỉ chuông)
    const callsBefore = mockListSettings.mock.calls.length;

    mockListSettings.mockResolvedValue([dbRow('campaign_run_failed', { emailEnabled: true })]);
    await request(app)
      .put('/api/admin/notification-events/campaign_run_failed')
      .set('Authorization', 'Bearer admin')
      .send({ emailEnabled: true })
      .expect(200);

    expect(mockListSettings.mock.calls.length).toBeGreaterThan(callsBefore);
    expect((await getEffectiveEventSettings('campaign_run_failed')).emailEnabled).toBe(true);
  });
});
