import notificationRepo from '../../repositories/admin/notification.repository.js';
import emailLogRepo from '../../repositories/admin/notificationEmailLog.repository.js';
import { sendSystemEmail, buildBaseTemplate } from '../../utils/systemEmail.util.js';

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

    return content
      .replace(/\{\{user_name\}\}/g, user.full_name || user.username || 'bạn')
      .replace(/\{\{user_email\}\}/g, user.email || '')
      .replace(/\{\{user_plan\}\}/g, this.formatPlanName(user.plan) || 'Miễn phí')
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

  async buildEmailHtml(notification, user) {
    const config = NOTIFICATION_TYPE_CONFIG[notification.type] || NOTIFICATION_TYPE_CONFIG.announcement;

    const title = this.replaceVariables(notification.title, user);
    const message = this.replaceVariables(notification.message, user);
    const titleEn = notification.title_en ? this.replaceVariables(notification.title_en, user) : null;
    const messageEn = notification.message_en ? this.replaceVariables(notification.message_en, user) : null;

    const safeTitle = this.escapeHtml(title);
    const safeMessage = this.escapeHtml(message);
    const safeFullName = this.escapeHtml(user.full_name || user.username || 'bạn');
    const safeEmail = this.escapeHtml(user.email || '');

    const priorityBadge = notification.priority === 'urgent'
      ? `<span style="display:inline-block;background:#dc2626;color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Ưu tiên cao</span>`
      : notification.priority === 'high'
        ? `<span style="display:inline-block;background:#f97316;color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Ưu tiên</span>`
        : '';

    const subject = `[${PRODUCT_NAME}] ${title}`;

    const html = this.generateNotificationEmail({
      type: notification.type,
      config,
      title: safeTitle,
      message: safeMessage,
      priorityBadge,
      fullName: safeFullName,
      email: safeEmail,
      planName: this.escapeHtml(this.formatPlanName(user.plan))
    });

    return {
      subject,
      html,
      titleEn,
      messageEn
    };
  },

  /**
   * Render nội dung email cho thông báo superadmin.
   * Layout nhất quán với các template khác trong systemEmail.util.js:
   * - Greeting cá nhân hoá
   * - Box tiêu đề (badge tone màu theo loại)
   * - Box nội dung (white card)
   * - CTA cho promotion
   * - Support block
   * - User info chip
   */
  generateNotificationEmail({ type, config, title, message, priorityBadge, fullName, email, planName }) {
    const planChip = planName && planName !== 'Miễn phí'
      ? `<span style="display:inline-block;background:#f97316;color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${planName}</span>`
      : '';

    const initial = (fullName || 'U').charAt(0).toUpperCase();

    const content = `
      <!-- Greeting -->
      <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">
        Xin chào <strong style="color:#f97316">${fullName}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
        Bạn có một thông báo mới từ <strong>${PRODUCT_NAME}</strong>:
      </p>

      <!-- Title Box (badge tone màu theo loại) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${config.badgeBg};border:2px solid ${config.badgeBorder};border-radius:14px;margin-bottom:20px">
        <tr>
          <td style="padding:18px 22px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${config.badgeText};text-transform:uppercase;letter-spacing:1px">
              ${config.icon} ${type === 'announcement' ? 'Tiêu đề' : config.label}
            </p>
            <h2 style="margin:0;font-size:20px;font-weight:700;color:#1f2937;line-height:1.4">
              ${title}
              ${priorityBadge ? '&nbsp;' + priorityBadge : ''}
            </h2>
          </td>
        </tr>
      </table>

      <!-- Message Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:24px">
        <tr>
          <td style="padding:18px 22px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">
              📝 Nội dung
            </p>
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap">${message}</p>
          </td>
        </tr>
      </table>

      ${type === 'promotion' ? `
      <!-- CTA cho khuyến mãi -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td align="center">
            <a href="${FRONTEND_URL}"
               style="display:inline-block;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);color:#fff;font-size:15px;font-weight:600;
                      padding:13px 32px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
              Khám phá ưu đãi →
            </a>
          </td>
        </tr>
      </table>
      ` : ''}

      <!-- Support -->
      <p style="margin:0 0 18px;font-size:13px;color:#6b7280;line-height:1.6">
        Nếu có thắc mắc, vui lòng liên hệ
        <a href="mailto:${SUPPORT_EMAIL}" style="color:#f97316;text-decoration:none;font-weight:500">${SUPPORT_EMAIL}</a>.
      </p>

      <!-- User Info Chip -->
      ${email ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:10px;margin-top:8px">
        <tr>
          <td style="padding:12px 16px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="36" valign="middle" style="padding-right:10px">
                  <div style="width:36px;height:36px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);border-radius:8px;text-align:center;line-height:36px;color:#fff;font-weight:700;font-size:14px">${initial}</div>
                </td>
                <td valign="middle" style="font-size:13px;color:#374151">
                  <p style="margin:0;font-weight:600;color:#92400e">${fullName}</p>
                  <p style="margin:2px 0 0;color:#b45309;font-size:12px">${email}</p>
                </td>
                ${planChip ? `<td width="auto" align="right" valign="middle">${planChip}</td>` : ''}
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ` : ''}
    `;

    return buildBaseTemplate({
      subtitle: config.label,
      content,
      footerNote: config.footerNote
    });
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
          const emailContent = await this.buildEmailHtml(notification, user);
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
