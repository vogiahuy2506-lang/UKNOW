import notificationRepo from '../../repositories/admin/notification.repository.js';
import emailLogRepo from '../../repositories/admin/notificationEmailLog.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';

const SENDER_NAME = process.env.MAIL_FROM_NAME || 'Founder AI';
const PRODUCT_NAME = process.env.MAIL_FROM_NAME || 'Founder AI';
const LOGO_URL = 'https://founderai.biz/logo.png';

// ─── Logo Cache ────────────────────────────────────────────────────────────────

let cachedLogoDataUri = null;
let logoCacheTime = 0;
const LOGO_CACHE_DURATION = 1000 * 60 * 60;

async function getLogoDataUri() {
  const now = Date.now();
  if (cachedLogoDataUri && (now - logoCacheTime) < LOGO_CACHE_DURATION) {
    return cachedLogoDataUri;
  }
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) throw new Error('Logo fetch failed');
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/png';
    cachedLogoDataUri = `data:${mimeType};base64,${base64}`;
    logoCacheTime = now;
    return cachedLogoDataUri;
  } catch (err) {
    console.error('[NotificationService] Failed to fetch logo:', err.message);
    return null;
  }
}

// ─── Notification Type Config ──────────────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  MAINTENANCE: 'maintenance',
  ANNOUNCEMENT: 'announcement',
  PROMOTION: 'promotion',
  WARNING: 'warning',
  REMINDER: 'reminder',
  SECURITY: 'security'
};

const EMAIL_TEMPLATES = {
  maintenance: { headerColor: '#dc2626', icon: '⚠️', label: 'Thông báo bảo trì' },
  announcement: { headerColor: '#2563eb', icon: '📢', label: 'Thông báo chung' },
  promotion: { headerColor: '#f97316', icon: '🎁', label: 'Khuyến mãi' },
  warning: { headerColor: '#eab308', icon: '🚨', label: 'Cảnh báo' },
  reminder: { headerColor: '#22c55e', icon: '⏰', label: 'Nhắc nhở' },
  security: { headerColor: '#991b1b', icon: '🔒', label: 'Bảo mật' }
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

// ─── Base Template ─────────────────────────────────────────────────────────────

function buildBaseTemplate({ subtitle, content, footerNote }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:28px 32px 22px;text-align:center">
                    <img src="${LOGO_URL}" alt="${SENDER_NAME}" height="36" style="display:block;margin:0 auto 10px;max-width:150px;object-fit:contain">
                    <p style="margin:0;font-size:17px;font-weight:700;color:#ffffff">${SENDER_NAME}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.8);letter-spacing:.5px;text-transform:uppercase">${subtitle}</p>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px">
                <tr>
                  <td>
                    ${content}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 8px;text-align:center;font-size:11px;color:#6b7280">
              <p style="margin:0 0 4px;font-weight:600">Đơn vị chủ quản: Công ty TNHH Giải pháp số Digiso</p>
              <p style="margin:0 0 4px">Địa chỉ: Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh, Đ. Võ Trường Toản, KP. 6, Phường Linh Trung, Thành phố Thủ Đức.</p>
              <p style="margin:0">Điện thoại: (+84) 879529079 (Hotline) | Email: info@digiso.vn</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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
      .replace(/\{\{support_email\}\}/g, 'info@digiso.vn');
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

  async buildEmailHtml(notification, user) {
    const template = EMAIL_TEMPLATES[notification.type] || EMAIL_TEMPLATES.announcement;

    const title = this.replaceVariables(notification.title, user);
    const message = this.replaceVariables(notification.message, user);
    const titleEn = notification.title_en ? this.replaceVariables(notification.title_en, user) : null;
    const messageEn = notification.message_en ? this.replaceVariables(notification.message_en, user) : null;

    const priorityBadge = notification.priority === 'urgent'
      ? `<span style="display:inline-block;background:#dc2626;color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Ưu tiên cao</span>`
      : notification.priority === 'high'
        ? `<span style="display:inline-block;background:#f97316;color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Ưu tiên</span>`
        : '';

    const subject = `[${PRODUCT_NAME}] ${title}`;

    const logoDataUri = await getLogoDataUri();
    const html = this.generateEmailTemplate({
      type: notification.type,
      headerColor: template.headerColor,
      icon: template.icon,
      label: template.label,
      title,
      message,
      priorityBadge,
      user,
      logoDataUri
    });

    return {
      subject,
      html,
      titleEn,
      messageEn
    };
  },

  generateEmailTemplate({ type, headerColor, icon, label, title, message, priorityBadge, user, logoDataUri }) {
    const bgColors = {
      maintenance: '#fef2f2',
      announcement: '#fff7ed',
      promotion: '#fff7ed',
      warning: '#fefce8',
      reminder: '#f0fdf4',
      security: '#fef2f2'
    };
    const borderColors = {
      maintenance: '#fecaca',
      announcement: '#fed7aa',
      promotion: '#fed7aa',
      warning: '#fef08a',
      reminder: '#bbf7d0',
      security: '#fecaca'
    };

    const bg = bgColors[type] || '#fff7ed';
    const border = borderColors[type] || '#fed7aa';

    const content = `
      <!-- Greeting -->
      <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">
        Xin chào <strong style="color:#f97316">${user.full_name || user.username || 'bạn'}</strong>,
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">
        Chúng tôi có thông báo dành cho bạn:
      </p>

      <!-- Title Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:2px solid ${border};border-radius:14px;margin-bottom:20px">
        <tr>
          <td style="padding:20px 24px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">
              ${icon} Tiêu đề
            </p>
            <h2 style="margin:0;font-size:20px;font-weight:700;color:#1f2937;line-height:1.4">
              ${title}
              ${priorityBadge ? '&nbsp;' + priorityBadge : ''}
            </h2>
          </td>
        </tr>
      </table>

      <!-- Message Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:28px">
        <tr>
          <td style="padding:20px 24px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">
              📝 Nội dung
            </p>
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap">${message}</p>
          </td>
        </tr>
      </table>

      <!-- Support -->
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">
        Nếu có thắc mắc, vui lòng liên hệ
        <a href="mailto:info@digiso.vn" style="color:#f97316;text-decoration:none;font-weight:500">info@digiso.vn</a>.
      </p>
    `;

    return buildBaseTemplate({
      subtitle: label,
      content,
      footerNote: 'Email tự động từ hệ thống. Vui lòng không reply trực tiếp.',
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

    // Update status to sending
    await notificationRepo.updateById(id, { status: 'sending' });

    // Get eligible recipients
    const recipients = await notificationRepo.getEligibleRecipients({
      roles: notification.target_roles,
      plans: notification.target_plans,
      statuses: notification.target_statuses,
      userIds: notification.target_user_ids,
      emails: notification.target_emails,
      registeredBefore: notification.registered_before,
      registeredAfter: notification.registered_after
    });

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

    // Send to each recipient with delay
    for (let i = 0; i < recipients.length; i++) {
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
      }

      // Delay to avoid rate limiting
      if (i < recipients.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Update notification stats
    await notificationRepo.updateStats(id, { sent, failed });
    await notificationRepo.markAsSent(id);

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
      throw new Error('Notification not found');
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
    return Object.entries(NOTIFICATION_TYPES).map(([key, value]) => ({
      value,
      label: EMAIL_TEMPLATES[value]?.label || value,
      headerColor: EMAIL_TEMPLATES[value]?.headerColor || '#6b7280'
    }));
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
    const template = EMAIL_TEMPLATES[type] || EMAIL_TEMPLATES.announcement;
    return {
      type,
      label: template.label,
      headerColor: template.headerColor,
      icon: template.icon
    };
  }
};
