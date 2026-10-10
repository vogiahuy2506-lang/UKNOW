import { serverError } from '../helpers.js';
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  listPreferences,
  setEmailPreference,
} from '../services/notification/notificationInbox.service.js';

/**
 * Chuông thông báo + tuỳ chọn email của người đang đăng nhập (`/api/notifications/*`).
 * Luôn theo `req.user.id` — người thao tác thật, KHÔNG theo `activeContext.ownerId`.
 */

function respondKnownError(res, error, label) {
  if (error?.status >= 400 && error.status < 500) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  }
  return serverError(res, label, error);
}

function isTruthyFlag(value) {
  return value === '1' || value === 'true';
}

export async function list(req, res) {
  try {
    const data = await listNotifications(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      unreadOnly: isTruthyFlag(req.query.unread),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return respondKnownError(res, error, 'list notifications');
  }
}

export async function unreadCount(req, res) {
  try {
    return res.json({ success: true, data: await getUnreadCount(req.user.id) });
  } catch (error) {
    return respondKnownError(res, error, 'unread-count notifications');
  }
}

export async function markRead(req, res) {
  try {
    return res.json({ success: true, data: await markNotificationRead(req.user.id, req.params.id) });
  } catch (error) {
    return respondKnownError(res, error, 'mark-read notification');
  }
}

export async function markAllRead(req, res) {
  try {
    return res.json({ success: true, data: await markAllNotificationsRead(req.user.id) });
  } catch (error) {
    return respondKnownError(res, error, 'read-all notifications');
  }
}

export async function getPreferences(req, res) {
  try {
    return res.json({ success: true, data: await listPreferences(req.user.id) });
  } catch (error) {
    return respondKnownError(res, error, 'get notification preferences');
  }
}

export async function updatePreference(req, res) {
  try {
    const data = await setEmailPreference(req.user.id, req.body?.eventType, req.body?.emailEnabled);
    return res.json({ success: true, data });
  } catch (error) {
    return respondKnownError(res, error, 'update notification preference');
  }
}
