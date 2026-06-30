import notificationService from '../../services/admin/notification.service.js';

const handleError = (res, err) => {
  console.error('[NotificationController]', err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

// =====================
// CRUD Operations
// =====================

/**
 * Create a new notification (draft)
 */
export async function createNotification(req, res) {
  try {
    const {
      type = 'announcement',
      title,
      title_en,
      message,
      message_en,
      html_content,
      html_content_en,
      metadata,
      priority = 'normal',
      target_roles,
      target_plans,
      target_statuses,
      target_user_ids,
      target_emails,
      registered_before,
      registered_after,
      schedule_type = 'now',
      scheduled_at,
      recurrence_pattern,
      recurrence_end_date,
      is_recurring = false
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Tiêu đề là bắt buộc' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Nội dung thông báo là bắt buộc' });
    }

    const notification = await notificationService.createNotification({
      type,
      title: title.trim(),
      title_en: title_en?.trim(),
      message: message.trim(),
      message_en: message_en?.trim(),
      html_content,
      html_content_en,
      metadata,
      priority,
      target_roles,
      target_plans,
      target_statuses,
      target_user_ids,
      target_emails,
      registered_before,
      registered_after,
      schedule_type,
      scheduled_at,
      recurrence_pattern,
      recurrence_end_date,
      is_recurring,
      created_by: req.user?.id
    });

    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Update notification by ID
 */
export async function updateNotification(req, res) {
  try {
    const { id } = req.params;
    const notification = await notificationService.updateNotification(id, req.body);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({ success: true, data: notification });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Delete notification by ID
 */
export async function deleteNotification(req, res) {
  try {
    const { id } = req.params;
    const deleted = await notificationService.deleteNotification(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({ success: true, message: 'Đã xóa thông báo' });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Get all notifications with filters
 */
export async function getNotifications(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      search,
      start_date,
      end_date
    } = req.query;

    const result = await notificationService.getNotifications({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      type,
      status,
      search,
      startDate: start_date,
      endDate: end_date
    });

    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Get single notification by ID
 */
export async function getNotificationById(req, res) {
  try {
    const { id } = req.params;
    const notification = await notificationService.getNotificationById(id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({ success: true, data: notification });
  } catch (err) {
    handleError(res, err);
  }
}

// =====================
// Targeting & Preview
// =====================

/**
 * Preview recipients based on criteria
 */
export async function previewRecipients(req, res) {
  try {
    const {
      roles,
      plans,
      statuses,
      user_ids,
      emails,
      registered_before,
      registered_after
    } = req.body;

    const result = await notificationService.previewRecipients({
      roles,
      plans,
      statuses,
      userIds: user_ids,
      emails,
      registeredBefore: registered_before,
      registeredAfter: registered_after
    });

    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Count eligible recipients
 */
export async function countRecipients(req, res) {
  try {
    const {
      roles,
      plans,
      statuses,
      user_ids,
      emails,
      registered_before,
      registered_after
    } = req.body;

    const count = await notificationService.countRecipients({
      roles,
      plans,
      statuses,
      userIds: user_ids,
      emails,
      registeredBefore: registered_before,
      registeredAfter: registered_after
    });

    res.json({ success: true, data: { count } });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Preview notification content with variables replaced
 */
export async function previewNotification(req, res) {
  try {
    const { title, message, title_en, message_en, type, user_id } = req.body;

    const sampleUser = {
      full_name: 'Nguyễn Văn Test',
      username: 'testuser',
      email: 'test@example.com',
      plan: 'pro',
      status: 'active'
    };

    const service = notificationService;
    const previewTitle = service.replaceVariables(title, sampleUser);
    const previewMessage = service.replaceVariables(message, sampleUser);
    const previewTitleEn = title_en ? service.replaceVariables(title_en, sampleUser) : null;
    const previewMessageEn = message_en ? service.replaceVariables(message_en, sampleUser) : null;

    res.json({
      success: true,
      data: {
        original: { title, message, title_en, message_en },
        preview: {
          title: previewTitle,
          message: previewMessage,
          title_en: previewTitleEn,
          message_en: previewMessageEn
        },
        variables: {
          available: service.getAvailableVariables(),
          replaced: ['user_name', 'user_email', 'user_plan', 'product_name', 'current_date']
        }
      }
    });
  } catch (err) {
    handleError(res, err);
  }
}

// =====================
// Sending
// =====================

/**
 * Send notification immediately
 */
export async function sendNotification(req, res) {
  try {
    const { id } = req.params;
    const notification = await notificationService.getNotificationById(id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    if (notification.status === 'sent') {
      return res.status(400).json({ success: false, message: 'Thông báo đã được gửi trước đó' });
    }

    if (notification.status === 'sending') {
      return res.status(400).json({ success: false, message: 'Thông báo đang được gửi' });
    }

    // Start sending in background and return immediately
    // For large campaigns, we could use a job queue here
    const result = await notificationService.sendNow(id);

    const allFailed = result.sent === 0 && result.total > 0;
    let responseMessage;
    if (allFailed) {
      responseMessage = `Gửi thất bại toàn bộ ${result.total} email`;
    } else if (result.failed === 0) {
      responseMessage = `Đã gửi thành công ${result.sent}/${result.total} email`;
    } else {
      responseMessage = `Đã gửi ${result.sent}/${result.total} email, ${result.failed} thất bại`;
    }

    res.json({
      success: !allFailed,
      message: responseMessage,
      data: result
    });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Create and send notification directly
 */
export async function createAndSend(req, res) {
  try {
    const {
      type = 'announcement',
      title,
      title_en,
      message,
      message_en,
      metadata,
      priority = 'normal',
      target_roles,
      target_plans,
      target_statuses,
      target_user_ids,
      target_emails,
      registered_before,
      registered_after
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Tiêu đề là bắt buộc' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Nội dung thông báo là bắt buộc' });
    }

    // Kiểm tra có ít nhất một tiêu chí targeting
    const hasTargeting = (
      (target_user_ids && target_user_ids.length > 0) ||
      (target_emails && target_emails.length > 0)
    );

    if (!hasTargeting) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vui lòng chọn ít nhất một người nhận hoặc nhập email cụ thể' 
      });
    }

    const result = await notificationService.sendDirect({
      type,
      title: title.trim(),
      title_en: title_en?.trim(),
      message: message.trim(),
      message_en: message_en?.trim(),
      metadata,
      priority,
      target_user_ids,
      target_emails
    });

    const allFailed = result.sent === 0 && result.total > 0;
    let responseMessage;
    if (allFailed) {
      responseMessage = `Gửi thất bại toàn bộ ${result.total} email`;
    } else if (result.failed === 0) {
      responseMessage = `Đã gửi thành công ${result.sent}/${result.total} email`;
    } else {
      responseMessage = `Đã gửi ${result.sent}/${result.total} email, ${result.failed} thất bại`;
    }

    res.json({
      success: !allFailed,
      message: responseMessage,
      data: result
    });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Schedule notification for later
 */
export async function scheduleNotification(req, res) {
  try {
    const { id } = req.params;
    const { scheduled_at } = req.body;

    if (!scheduled_at) {
      return res.status(400).json({ success: false, message: 'Thời gian hẹn giờ là bắt buộc' });
    }

    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Định dạng ngày không hợp lệ' });
    }

    if (scheduledDate <= new Date()) {
      return res.status(400).json({ success: false, message: 'Thời gian hẹn giờ phải lớn hơn thời gian hiện tại' });
    }

    const notification = await notificationService.scheduleNotification(id, scheduledDate);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({
      success: true,
      message: `Đã hẹn giờ gửi lúc ${scheduledDate.toLocaleString('vi-VN')}`,
      data: notification
    });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Cancel scheduled notification
 */
export async function cancelScheduled(req, res) {
  try {
    const { id } = req.params;
    const notification = await notificationService.cancelScheduled(id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({ success: true, message: 'Đã hủy thông báo hẹn giờ', data: notification });
  } catch (err) {
    handleError(res, err);
  }
}

// =====================
// Stats & Logs
// =====================

/**
 * Get notification stats
 */
export async function getNotificationStats(req, res) {
  try {
    const { id } = req.params;
    const stats = await notificationService.getNotificationStats(id);

    if (!stats) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({ success: true, data: stats });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Get email logs for notification
 */
export async function getEmailLogs(req, res) {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const result = await notificationService.getEmailLogs(id, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status
    });

    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Get dashboard stats
 */
export async function getDashboardStats(req, res) {
  try {
    const stats = await notificationService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    handleError(res, err);
  }
}

// =====================
// Templates
// =====================

/**
 * Get notification types
 */
export async function getNotificationTypes(req, res) {
  try {
    const types = notificationService.getNotificationTypes();
    res.json({ success: true, data: types });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Get available variables
 */
export async function getAvailableVariables(req, res) {
  try {
    const variables = notificationService.getAvailableVariables();
    res.json({ success: true, data: variables });
  } catch (err) {
    handleError(res, err);
  }
}
