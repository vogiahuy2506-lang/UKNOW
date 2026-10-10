import { serverError } from '../../helpers.js';
import { listEventSettings, updateEventSettings } from '../../services/notification/notificationEventSettings.service.js';

/**
 * Cấu hình sự kiện thông báo của super admin (`/api/admin/notification-events/*`).
 */

export async function list(req, res) {
  try {
    return res.json({ success: true, data: await listEventSettings() });
  } catch (error) {
    return serverError(res, 'list notification events', error);
  }
}

export async function update(req, res) {
  try {
    const data = await updateEventSettings(req.params.eventType, req.body || {}, req.user.id);
    return res.json({ success: true, data });
  } catch (error) {
    if (error?.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return serverError(res, 'update notification event', error);
  }
}
