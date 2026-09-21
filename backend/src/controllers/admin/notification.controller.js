import notificationService from '../../services/admin/notification.service.js';
import notificationTemplateService from '../../services/admin/notificationTemplate.service.js';

const handleError = (res, err) => {
  console.error('[NotificationController]', err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

// Trả về true nếu có ít nhất một tiêu chí targeting được cung cấp
function hasAnyTargeting({
  target_user_ids,
  target_emails,
  target_roles,
  target_plans,
  target_statuses,
  registered_before,
  registered_after
}) {
  return (
    (Array.isArray(target_user_ids) && target_user_ids.length > 0) ||
    (Array.isArray(target_emails) && target_emails.length > 0) ||
    (Array.isArray(target_roles) && target_roles.length > 0) ||
    (Array.isArray(target_plans) && target_plans.length > 0) ||
    (Array.isArray(target_statuses) && target_statuses.length > 0) ||
    Boolean(registered_before) ||
    Boolean(registered_after)
  );
}

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

    // Phải có ít nhất một tiêu chí targeting để tránh nháp "gửi cho tất cả" vô tình
    const hasTargeting = hasAnyTargeting({
      target_user_ids,
      target_emails,
      target_roles,
      target_plans,
      target_statuses,
      registered_before,
      registered_after
    });

    if (!hasTargeting) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất một tiêu chí người nhận (user IDs, email, role, plan, status hoặc khoảng ngày đăng ký)'
      });
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

/**
 * Render HTML email preview từ BE — NGUỒN SỰ THẬT cho iframe FE.
 *
 * LÝ DO:
 *  - Trước đây FE render layout riêng (`renderNotificationHtml` util), BE dùng
 *    `notification.service.buildEmailHtml` → 2 layout KHÁC NHAU. User feedback
 *    "email phải y chang preview".
 *  - Fix: BE render HTML đúng y email thật sẽ gửi qua SMTP. FE iframe chỉ cần
 *    hiển thị HTML này. Một mã render duy nhất, một nguồn sự thật.
 *
 * QUAN TRỌNG: handler này GỌI THẲNG `notificationService.buildEmailHtml` —
 * đây là cùng code path với email SMTP gửi đi. Không có nhánh riêng, không
 * có "preview" đặc biệt. Đảm bảo preview iframe = email thực 100%.
 *
 * Request:
 *   POST /admin/notifications/preview-email-html
 *   Body: { type?, priority?, title?, message?, html_content?, locale?, device? }
 *
 * Response:
 *   { success: true, data: { html: '<!DOCTYPE html>...' } }
 *
 * Auth: admin (route đã có middleware)
 */
export async function previewEmailHtml(req, res) {
  try {
    const {
      type = 'announcement',
      priority = 'normal',
      title,
      message,
      html_content = null
    } = req.body;

    // Tạo "notification giả" giống row từ DB. Service không cần id, chỉ các field
    // để render. Sau rewrite 21/09: dùng buildBaseTemplate — cùng khuôn header/footer
    // orange gradient với FE preview (WYSIWYG).
    const notification = {
      type,
      priority,
      title: title || '',
      message: message || '',
      html_content: html_content || null
    };

    // 1 path duy nhất qua service.buildEmailHtml → preview == email thực.
    const built = await notificationService.buildEmailHtml(notification, null);

    res.json({
      success: true,
      data: { html: built.html }
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
      return res.status(409).json({ success: false, message: 'Thông báo đã được gửi trước đó' });
    }

    if (notification.status === 'sending') {
      return res.status(409).json({ success: false, message: 'Thông báo đang được gửi' });
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
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
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
      registered_after
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Tiêu đề là bắt buộc' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Nội dung thông báo là bắt buộc' });
    }

    // Phải có ít nhất một tiêu chí targeting — nhất quán với service.sendNow
    const hasTargeting = hasAnyTargeting({
      target_user_ids,
      target_emails,
      target_roles,
      target_plans,
      target_statuses,
      registered_before,
      registered_after
    });

    if (!hasTargeting) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất một tiêu chí người nhận (user IDs, email, role, plan, status hoặc khoảng ngày đăng ký)'
      });
    }

    const result = await notificationService.sendDirect({
      type,
      title: title.trim(),
      title_en: title_en?.trim(),
      message: message.trim(),
      message_en: message_en?.trim(),
      html_content: html_content?.trim() || null,
      html_content_en: html_content_en?.trim() || null,
      metadata,
      priority,
      target_roles,
      target_plans,
      target_statuses,
      target_user_ids,
      target_emails,
      registered_before,
      registered_after,
      created_by: req.user?.id
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
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
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

    // Cho phép buffer 1 phút để tránh lệch múi giờ client/server khi người dùng chọn "hiện tại"
    const MIN_LEAD_MS = 60 * 1000;
    if (scheduledDate.getTime() <= Date.now() + MIN_LEAD_MS) {
      return res.status(400).json({ success: false, message: 'Thời gian hẹn giờ phải lớn hơn thời gian hiện tại ít nhất 1 phút' });
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
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
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
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
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

// =====================
// Notification Templates (super admin save-as)
// =====================

/**
 * GET /admin/notification-templates
 * Query: ?type_key=announcement
 * Auth: admin (de ca admin thuong co the xem va chon o tab Gui)
 */
export async function listTemplates(req, res) {
  try {
    const { type_key } = req.query;
    const data = await notificationTemplateService.listTemplates(type_key);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /admin/notification-templates/:id
 * Auth: admin
 */
export async function getTemplate(req, res) {
  try {
    const { id } = req.params;
    const template = await notificationTemplateService.getTemplate(id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Khong tim thay mau' });
    }
    res.json({ success: true, data: template });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * POST /admin/notification-templates
 * Auth: superadmin
 */
export async function createTemplate(req, res) {
  try {
    const template = await notificationTemplateService.createTemplate(req.body, req.user?.id);
    res.status(201).json({ success: true, data: template });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ success: false, message: err.message, code: err.code });
    }
    handleError(res, err);
  }
}
