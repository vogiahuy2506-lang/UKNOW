import notificationRepo from '../../repositories/admin/notification.repository.js';
import emailLogRepo from '../../repositories/admin/notificationEmailLog.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';
import { renderNotificationEmailHtml } from '../../utils/notificationEmailRender.util.js';

const SENDER_NAME = process.env.MAIL_FROM_NAME || 'Founder AI';
const PRODUCT_NAME = process.env.PRODUCT_NAME || process.env.MAIL_FROM_NAME || 'Founder AI';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'info@digiso.vn';

// ─── Notification Type Config ──────────────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  MAINTENANCE: 'maintenance',
  ANNOUNCEMENT: 'announcement',
  PROMOTION: 'promotion',
  WARNING: 'warning',
  REMINDER: 'reminder',
  SECURITY: 'security'
};

/**
 * Cấu hình giao diện cho mỗi loại thông báo (header badge + tone màu).
 * Đồng bộ với TYPE_CONFIG trong NotificationTypeSelector.jsx (FE).
 */
const NOTIFICATION_TYPE_CONFIG = {
  maintenance: {
    headerColor: '#dc2626',
    badgeBg: '#fef2f2',
    badgeBorder: '#fecaca',
    badgeText: '#991b1b',
    icon: '⚠️',
    label: 'Thông báo bảo trì',
    labelEn: 'Maintenance Notice',
    footerNote: 'Nếu có thắc mắc, vui lòng liên hệ info@digiso.vn.'
  },
  announcement: {
    headerColor: '#2563eb',
    badgeBg: '#eff6ff',
    badgeBorder: '#bfdbfe',
    badgeText: '#1e40af',
    icon: '📢',
    label: 'Thông báo chung',
    labelEn: 'General Announcement',
    footerNote: 'Cảm ơn bạn đã đồng hành cùng chúng tôi.'
  },
  promotion: {
    headerColor: '#f97316',
    badgeBg: '#fff7ed',
    badgeBorder: '#fed7aa',
    badgeText: '#9a3412',
    icon: '🎁',
    label: 'Khuyến mãi đặc biệt',
    labelEn: 'Special Promotion',
    footerNote: 'Chương trình có thể kết thúc sớm hơn dự kiến khi hết lượt ưu đãi.'
  },
  warning: {
    headerColor: '#d97706',
    badgeBg: '#fffbeb',
    badgeBorder: '#fde68a',
    badgeText: '#92400e',
    icon: '🚨',
    label: 'Cảnh báo',
    labelEn: 'Warning',
    footerNote: 'Vui lòng kiểm tra và xử lý sớm nhất có thể.'
  },
  reminder: {
    headerColor: '#16a34a',
    badgeBg: '#f0fdf4',
    badgeBorder: '#bbf7d0',
    badgeText: '#166534',
    icon: '⏰',
    label: 'Nhắc nhở',
    labelEn: 'Reminder',
    footerNote: 'Đừng quên theo dõi lịch trình của bạn nhé!'
  },
  security: {
    headerColor: '#991b1b',
    badgeBg: '#fef2f2',
    badgeBorder: '#fecaca',
    badgeText: '#7f1d1d',
    icon: '🔒',
    label: 'Cảnh báo bảo mật',
    labelEn: 'Security Alert',
    footerNote: 'Nếu bạn không nhận ra hoạt động này, hãy đổi mật khẩu và liên hệ hỗ trợ ngay.'
  }
};

export const AVAILABLE_VARIABLES = [
  { key: '{{user_name}}', description: 'Tên người dùng' },
  { key: '{{user_email}}', description: 'Email người dùng' },
  { key: '{{user_plan}}', description: 'Gói dịch vụ hiện tại' },
  { key: '{{product_name}}', description: 'Tên sản phẩm' },
  { key: '{{current_date}}', description: 'Ngày hiện tại' },
  { key: '{{dashboard_url}}', description: 'Link dashboard' },
  { key: '{{support_email}}', description: 'Email hỗ trợ' }
];

/**
 * Notification Service
 * Handles all business logic for notifications
 */
export default {
  // =====================
  // CRUD Operations
  // =====================

  async createNotification(data) {
    return notificationRepo.create(data);
  },

  async updateNotification(id, data) {
    return notificationRepo.updateById(id, data);
  },

  async deleteNotification(id) {
    return notificationRepo.deleteById(id);
  },

  async getNotifications(query) {
    return notificationRepo.findAll(query);
  },

  async getNotificationById(id) {
    return notificationRepo.findById(id);
  },

  // =====================
  // Targeting
  // =====================

  async previewRecipients(criteria) {
    const recipients = await notificationRepo.getEligibleRecipients({
      ...criteria,
      limit: 10
    });
    const count = await notificationRepo.countEligibleRecipients(criteria);
    return {
      recipients,
      total: count,
      showing: Math.min(10, recipients.length)
    };
  },

  async countRecipients(criteria) {
    return notificationRepo.countEligibleRecipients(criteria);
  },

  // =====================
  // Variable Replacement
  // =====================

  replaceVariables(content, user) {
    if (!content) return content;
    // Chịu null/undefined user — dùng placeholder khi gọi từ preview (chưa có user
    // nhận cụ thể). Trước đây `user.full_name` trên null → "Cannot read properties
    // of null (reading 'full_name')".
    const u = user || {};

    return content
      .replace(/\{\{user_name\}\}/g, u.full_name || u.username || 'bạn')
      .replace(/\{\{user_email\}\}/g, u.email || '')
      .replace(/\{\{user_plan\}\}/g, this.formatPlanName(u.plan) || 'Miễn phí')
      .replace(/\{\{product_name\}\}/g, PRODUCT_NAME)
      .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }))
      .replace(/\{\{dashboard_url\}\}/g, FRONTEND_URL)
      .replace(/\{\{support_email\}\}/g, SUPPORT_EMAIL);
  },

  formatPlanName(plan) {
    const planNames = {
      free: 'Miễn phí',
      starter: 'Starter',
      pro: 'Pro',
      enterprise: 'Enterprise'
    };
    return planNames[plan] || plan || 'Miễn phí';
  },

  // =====================
  // Email Building
  // =====================

  /**
   * Escape HTML để an toàn khi chèn nội dung user-generated vào email.
   * Áp dụng cho title/message/replaceVariables.
   */
  escapeHtml(input) {
    if (input == null) return '';
    return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Build email HTML cho 1 notification + user nhận.
   *
   * 1 PATH DUY NHẤT cho CẢ:
   *   - Preview iframe FE (notification.controller#previewEmailHtml)
   *   - Email gửi qua SMTP (notification.service#sendNow/sendDirect)
   * Dùng shared renderer `renderNotificationEmailHtml` để đảm bảo preview iframe
   * y chang email thực 100%. Khi `html_content` có (do admin "Save As Template"),
   * pipeline là: (1) replace `{{...}}` bằng user data → (2) sanitize (strip
   * `<script>`, `<style>`, event handler, CSS injection) → nhúng vào layout gradient.
   * Khi không có `html_content` thì dùng `message` plain text.
   *
   * @param {Object} notification
   * @param {Object|null} user - user nhận (null cho preview, dùng sample user mặc định)
   * @returns {{subject: string, html: string, titleEn: string|null, messageEn: string|null}}
   */
  async buildEmailHtml(notification, user) {
    const { html: title } = { html: this.replaceVariables(notification.title || '', user) };
    const subject = `[${PRODUCT_NAME}] ${title}`;

    // 1 PATH DUY NHẤT qua shared renderer → đảm bảo preview == email thực.
    // Sau rewrite 19/09: renderer không còn nhận `device` (html_content là body
    // email tuyệt đối, không có layout wrapper responsive cố định).
    const builtHtml = renderNotificationEmailHtml({
      notification,
      user,
      locale: 'vi'
    });

    return {
      subject,
      html: builtHtml,
      titleEn: notification.title_en ? this.replaceVariables(notification.title_en, user) : null,
      messageEn: notification.message_en ? this.replaceVariables(notification.message_en, user) : null
    };
  },

  // =====================
  // Sending
  // =====================

  /**
   * Send notification to all eligible recipients
   */
  async sendNow(id) {
    const notification = await notificationRepo.findById(id);
    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.status === 'sending') {
      throw Object.assign(new Error('Thông báo đang được gửi'), { status: 409 });
    }
    if (notification.status === 'sent') {
      throw Object.assign(new Error('Thông báo đã được gửi trước đó'), { status: 409 });
    }

    // Update status to sending
    await notificationRepo.updateById(id, { status: 'sending' });

    let recipients;
    try {
      recipients = await notificationRepo.getEligibleRecipients({
        roles: notification.target_roles,
        plans: notification.target_plans,
        statuses: notification.target_statuses,
        userIds: notification.target_user_ids,
        emails: notification.target_emails,
        registeredBefore: notification.registered_before,
        registeredAfter: notification.registered_after
      });
    } catch (err) {
      await notificationRepo.markAsFailed(id);
      throw err;
    }

    if (recipients.length === 0) {
      await notificationRepo.updateById(id, { status: 'sent', recipient_count: 0, sent_at: new Date() });
      return { sent: 0, failed: 0, total: 0, failedEmails: [] };
    }

    // Create email logs and get their IDs
    const logs = recipients.map(user => ({
      notification_id: id,
      user_id: user.id,
      email: user.email,
      status: 'pending'
    }));
    const createdLogs = await emailLogRepo.createBatch(logs);

    let sent = 0;
    let failed = 0;
    const failedEmails = [];

    // Send to recipients in parallel with bounded concurrency
    const CONCURRENCY = 5;
    let cursor = 0;
    const errors = [];

    const worker = async () => {
      while (cursor < recipients.length) {
        const i = cursor++;
        const user = recipients[i];
        const logId = createdLogs[i]?.id;
        try {
          // 1 PATH DUY NHẤT qua buildEmailHtml → renderNotificationEmailHtml.
          // Email thực và preview iframe chung code path, đảm bảo layout khớp 100%.
          const emailContent = await this.buildEmailHtml(notification, user);

          if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_NOTIFICATION_EMAIL === '1') {
            console.log(`[NotificationService] → sending to ${user.email} | subject="${emailContent.subject}" | html.length=${emailContent.html.length}`);
          }

          await sendSystemEmail({
            to: user.email,
            subject: emailContent.subject,
            html: emailContent.html
          });

          if (logId) {
            await emailLogRepo.updateStatus(logId, 'sent', { sent_at: new Date() });
          }
          sent++;
        } catch (err) {
          console.error(`[NotificationService] Failed to send to ${user.email}:`, err.message);
          if (logId) {
            await emailLogRepo.markAsFailed(logId, err.message);
          }
          failed++;
          failedEmails.push(user.email);
          errors.push(err);
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, recipients.length) }, () => worker());
    await Promise.all(workers);

    // Update notification stats
    await notificationRepo.updateStats(id, { sent, failed });
    await notificationRepo.markAsSent(id);
    await notificationRepo.updateById(id, { recipient_count: recipients.length });

    return { sent, failed, total: recipients.length, failedEmails };
  },

  /**
   * Send notification directly with data (create + send)
   */
  async sendDirect(data) {
    const notification = await notificationRepo.create({
      ...data,
      status: 'sending',
      created_by: data.created_by
    });

    return this.sendNow(notification.id);
  },

  /**
   * Schedule notification for later
   */
  async scheduleNotification(id, scheduledAt) {
    const notification = await notificationRepo.findById(id);
    if (!notification) {
      throw Object.assign(new Error('Không tìm thấy thông báo'), { status: 404 });
    }

    const schedulableStatuses = ['draft', 'scheduled', 'failed'];
    if (!schedulableStatuses.includes(notification.status)) {
      throw Object.assign(
        new Error(`Không thể hẹn giờ thông báo ở trạng thái "${notification.status}"`),
        { status: 409 }
      );
    }

    return notificationRepo.updateById(id, {
      schedule_type: 'scheduled',
      scheduled_at: scheduledAt,
      status: 'scheduled'
    });
  },

  /**
   * Cancel scheduled notification
   */
  async cancelScheduled(id) {
    return notificationRepo.updateScheduleStatus(id, 'cancelled');
  },

  // =====================
  // Recurring
  // =====================

  /**
   * Process scheduled notifications (called by cron)
   */
  async processScheduledNotifications() {
    const now = new Date();
    const dueNotifications = await notificationRepo.getScheduledNotifications(now);

    const results = [];
    for (const notification of dueNotifications) {
      try {
        const result = await this.sendNow(notification.id);
        results.push({ id: notification.id, success: true, result });

        // Handle recurring notifications
        if (notification.is_recurring && notification.recurrence_pattern) {
          const nextSendAt = this.calculateNextSendDate(
            now,
            notification.recurrence_pattern,
            notification.recurrence_end_date
          );

          if (nextSendAt) {
            await notificationRepo.createRecurringChild(notification.id, nextSendAt);
          }
        }
      } catch (err) {
        console.error(`[NotificationService] Failed to send scheduled notification ${notification.id}:`, err);
        await notificationRepo.markAsFailed(notification.id);
        results.push({ id: notification.id, success: false, error: err.message });
      }
    }

    return results;
  },

  /**
   * Calculate next send date for recurring notifications
   */
  calculateNextSendDate(currentDate, pattern, endDate) {
    let nextDate = new Date(currentDate);

    switch (pattern) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      default:
        return null;
    }

    if (endDate && nextDate > new Date(endDate)) {
      return null;
    }

    return nextDate;
  },

  // =====================
  // Stats & Logs
  // =====================

  /**
   * Get notification stats
   */
  async getNotificationStats(id) {
    const notification = await notificationRepo.findById(id);
    if (!notification) {
      throw new Error('Notification not found');
    }

    const emailStats = await emailLogRepo.getStatsByNotificationId(id);

    return {
      ...notification,
      email_stats: {
        total: parseInt(emailStats.total, 10),
        pending: parseInt(emailStats.pending, 10),
        sent: parseInt(emailStats.sent, 10),
        delivered: parseInt(emailStats.delivered, 10),
        opened: parseInt(emailStats.opened, 10),
        bounced: parseInt(emailStats.bounced, 10),
        failed: parseInt(emailStats.failed, 10)
      }
    };
  },

  /**
   * Get email logs for notification
   */
  async getEmailLogs(notificationId, params) {
    return emailLogRepo.findByNotificationId(notificationId, params);
  },

  /**
   * Get dashboard stats
   */
  async getDashboardStats() {
    return notificationRepo.getDashboardStats();
  },

  // =====================
  // Templates
  // =====================

  /**
   * Get notification types with labels
   */
  getNotificationTypes() {
    return Object.entries(NOTIFICATION_TYPES).map(([key, value]) => {
      const config = NOTIFICATION_TYPE_CONFIG[value] || {};
      return {
        value,
        label: config.label || value,
        headerColor: config.headerColor || '#6b7280',
        icon: config.icon || '📨'
      };
    });
  },

  /**
   * Get available variables
   */
  getAvailableVariables() {
    return AVAILABLE_VARIABLES;
  },

  /**
   * Get template preview
   */
  getTemplatePreview(type) {
    const config = NOTIFICATION_TYPE_CONFIG[type] || NOTIFICATION_TYPE_CONFIG.announcement;
    return {
      type,
      label: config.label,
      labelEn: config.labelEn,
      headerColor: config.headerColor,
      icon: config.icon,
      badgeBg: config.badgeBg,
      badgeBorder: config.badgeBorder,
      badgeText: config.badgeText
    };
  }
};
