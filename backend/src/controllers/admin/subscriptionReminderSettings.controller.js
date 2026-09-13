import {
  getReminderSettings,
  updateReminderSettings,
} from '../../services/payment/subscriptionReminderSettings.service.js';

function handleError(res, error) {
  if (error?.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error('[subscriptionReminderSettings] request failed:', error);
  return res.status(500).json({
    success: false,
    message: error?.code === '42P01'
      ? 'Database chưa cập nhật migration lịch nhắc hạn'
      : 'Không thể xử lý cấu hình lịch nhắc hạn',
  });
}

export async function getSettings(req, res) {
  try {
    const data = await getReminderSettings();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateSettings(req, res) {
  try {
    const data = await updateReminderSettings(req.body, req.user.id);
    return res.json({ success: true, data, message: 'Đã lưu cấu hình lịch nhắc hạn' });
  } catch (error) {
    return handleError(res, error);
  }
}
