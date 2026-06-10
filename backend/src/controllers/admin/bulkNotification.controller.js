import * as bulkNotificationService from '../../services/admin/bulkNotification.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

export async function getRecipientCount(_req, res) {
  try {
    const count = await bulkNotificationService.getRecipientCount();
    res.json({ success: true, data: { count } });
  } catch (err) {
    handleError(res, err);
  }
}

export async function sendNotification(req, res) {
  try {
    const { title, message, duration_minutes, start_time } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Tiêu đề là bắt buộc.' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Nội dung thông báo là bắt buộc.' });
    }

    const result = await bulkNotificationService.sendMaintenanceNotification({
      title: title.trim(),
      message: message.trim(),
      durationMinutes: duration_minutes ? parseInt(duration_minutes, 10) : null,
      startTime: start_time || null,
    });

    // success = true nếu request hoàn thành (dù có thể 1 số email thất bại)
    // success = false chỉ khi toàn bộ đều thất bại
    const allFailed = result.sent === 0 && result.total > 0;

    let responseMessage;
    if (allFailed) {
      responseMessage = `Gửi thất bại toàn bộ ${result.total} email. Vui lòng thử lại sau.`;
    } else if (result.failed === 0) {
      responseMessage = `Đã gửi thành công ${result.sent}/${result.total} email.`;
    } else {
      responseMessage = `Đã gửi ${result.sent}/${result.total} email. ${result.failed} email thất bại (xem chi tiết trong console).`;
    }

    res.json({
      success: !allFailed,
      message: responseMessage,
      data: {
        sent: result.sent,
        failed: result.failed,
        total: result.total,
      },
    });
  } catch (err) {
    console.error('[BulkNotification] Lỗi nghiêm trọng:', err);
    handleError(res, err);
  }
}
