import notificationRepo from '../../repositories/admin/notification.repository.js';
import emailLogRepo from '../../repositories/admin/notificationEmailLog.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';

const SENDER_NAME = process.env.SYSTEM_EMAIL_NAME || 'FounderAI';
const PRODUCT_NAME = process.env.SYSTEM_EMAIL_NAME || 'FounderAI';
const DASHBOARD_URL = process.env.FRONTEND_URL || 'https://founderai.vn';
const SYSTEM_LOGO_URL = process.env.SYSTEM_LOGO_URL || `${DASHBOARD_URL}/logo.png`;

// Cache for logo data URI
let cachedLogoDataUri = null;
let logoCacheTime = 0;
const LOGO_CACHE_DURATION = 1000 * 60 * 60; // 1 hour

async function getLogoDataUri() {
  const now = Date.now();
  if (cachedLogoDataUri && (now - logoCacheTime) < LOGO_CACHE_DURATION) {
    return cachedLogoDataUri;
  }
  
  try {
    const response = await fetch(SYSTEM_LOGO_URL);
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

// Notification types configuration
export const NOTIFICATION_TYPES = {
  MAINTENANCE: 'maintenance',
  ANNOUNCEMENT: 'announcement',
  PROMOTION: 'promotion',
  WARNING: 'warning',
  REMINDER: 'reminder',
  SECURITY: 'security'
};

// Email template configurations by type
const EMAIL_TEMPLATES = {
  maintenance: {
    headerColor: '#dc2626',
    icon: 'warning',
    label: 'Thông báo bảo trì',
    defaultTitle: 'Bảo trì hệ thống định kỳ'
  },
  announcement: {
    headerColor: '#2563eb',
    icon: 'info',
    label: 'Thông báo chung',
    defaultTitle: 'Thông báo từ FounderAI'
  },
  promotion: {
    headerColor: '#f97316',
    icon: 'gift',
    label: 'Khuyến mãi',
    defaultTitle: 'Ưu đãi đặc biệt dành cho bạn'
  },
  warning: {
    headerColor: '#eab308',
    icon: 'alert',
    label: 'Cảnh báo',
    defaultTitle: 'Cảnh báo quan trọng'
  },
  reminder: {
    headerColor: '#22c55e',
    icon: 'clock',
    label: 'Nhắc nhở',
    defaultTitle: 'Nhắc nhở từ FounderAI'
  },
  security: {
    headerColor: '#991b1b',
    icon: 'shield',
    label: 'Bảo mật',
    defaultTitle: 'Thông báo bảo mật'
  }
};

// Available variables for replacement
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

  /**
   * Create a new notification (draft)
   */
  async createNotification(data) {
    return notificationRepo.create(data);
  },

  /**
   * Update notification by ID
   */
  async updateNotification(id, data) {
    return notificationRepo.updateById(id, data);
  },

  /**
   * Delete notification by ID
   */
  async deleteNotification(id) {
    return notificationRepo.deleteById(id);
  },

  /**
   * Get notifications with filters
   */
  async getNotifications(query) {
    return notificationRepo.findAll(query);
  },

  /**
   * Get single notification by ID
   */
  async getNotificationById(id) {
    return notificationRepo.findById(id);
  },

  // =====================
  // Targeting
  // =====================

  /**
   * Preview recipients based on criteria
   */
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

  /**
   * Count eligible recipients
   */
  async countRecipients(criteria) {
    return notificationRepo.countEligibleRecipients(criteria);
  },

  // =====================
  // Variable Replacement
  // =====================

  /**
   * Replace variables in content with user data
   */
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
      .replace(/\{\{dashboard_url\}\}/g, DASHBOARD_URL)
      .replace(/\{\{support_email\}\}/g, 'support@digiso.vn');
  },

  /**
   * Format plan name for display
   */
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
   * Build email HTML based on notification type
   */
  async buildEmailHtml(notification, user) {
    const template = EMAIL_TEMPLATES[notification.type] || EMAIL_TEMPLATES.announcement;

    // Replace variables
    const title = this.replaceVariables(notification.title, user);
    const message = this.replaceVariables(notification.message, user);
    const titleEn = notification.title_en ? this.replaceVariables(notification.title_en, user) : null;
    const messageEn = notification.message_en ? this.replaceVariables(notification.message_en, user) : null;

    const priorityBadge = notification.priority === 'urgent'
      ? `<span style="background:#dc2626;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600">ƯU TIÊN CAO</span>`
      : notification.priority === 'high'
        ? `<span style="background:#f97316;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600">ƯU TIÊN</span>`
        : '';

    const subject = `[FounderAI] ${title}`;

    // Get logo as data URI (embedded)
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

  /**
   * Generate email HTML template
   */
  generateEmailTemplate({ type, headerColor, icon, label, title, message, priorityBadge, user, logoDataUri }) {
    const year = new Date().getFullYear();

    const iconEmoji = {
      warning: '⚠️',
      info: '📢',
      gift: '🎁',
      alert: '🚨',
      clock: '⏰',
      shield: '🔒'
    }[icon] || '📢';

    const backgroundColor = {
      maintenance: '#fef2f2',
      announcement: '#fff7ed',
      promotion: '#fff7ed',
      warning: '#fefce8',
      reminder: '#f0fdf4',
      security: '#fef2f2'
    }[type] || '#fff7ed';

    const borderColor = {
      maintenance: '#fecaca',
      announcement: '#fed7aa',
      promotion: '#fed7aa',
      warning: '#fef08a',
      reminder: '#bbf7d0',
      security: '#fecaca'
    }[type] || '#fed7aa';

    // Header with logo (use embedded data URI)
    const logoHtml = logoDataUri
      ? `<img src="${logoDataUri}" alt="${SENDER_NAME}" style="max-height:48px;max-width:160px;object-fit:contain;display:block;">`
      : '';

    return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:680px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">

    <!-- Header with gradient -->
    <div style="background:linear-gradient(135deg, #f97316 0%, #ea580c 100%);padding:24px 40px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="display:flex;align-items:center;gap:16px">
            ${logoHtml ? `<div style="background:rgba(255,255,255,0.2);padding:6px;border-radius:8px">${logoHtml}</div>` : ''}
            <div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">${SENDER_NAME}</h1>
              <p style="margin:2px 0 0;color:rgba(255,255,255,.85);font-size:13px">${label}</p>
            </div>
          </div>
        </div>
        ${priorityBadge ? `<span style="background:#dc2626;color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Ưu tiên cao</span>` : ''}
      </div>
    </div>

    <!-- Body -->
    <div style="padding:40px">
      <!-- Greeting -->
      <div style="margin-bottom:24px">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.6">
          Xin chào <strong style="color:#f97316">${user.full_name || user.username || 'bạn'}</strong>,
        </p>
        <p style="margin:8px 0 0;font-size:14px;color:#6b7280;line-height:1.6">
          Chúng tôi có thông báo quan trọng dành cho bạn:
        </p>
      </div>

      <!-- Title Box -->
      <div style="background:${backgroundColor};border:2px solid ${borderColor};border-radius:16px;padding:24px;margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="color:#f97316">🔔</span>
          <p style="margin:0;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px">
            Tiêu đề thông báo
          </p>
        </div>
        <h2 style="margin:0;font-size:22px;font-weight:700;color:#1f2937;line-height:1.4">${title}</h2>
      </div>

      <!-- Message Box -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="color:#6b7280">📝</span>
          <p style="margin:0;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">
            Nội dung
          </p>
        </div>
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap">${message}</p>
      </div>

      <!-- Support -->
      <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">
        Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ:
        <a href="mailto:support@digiso.vn" style="color:#f97316;text-decoration:none;font-weight:500">support@digiso.vn</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;background:#1f2937">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:14px;font-weight:700;color:#fff">${PRODUCT_NAME}</span>
            <span style="font-size:10px;color:#9ca3af;background:#374751;padding:2px 6px;border-radius:8px">${year}</span>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af">
            Email tự động, vui lòng không reply trực tiếp.
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <a href="#" style="color:#9ca3af;text-decoration:none;font-size:12px">Chính sách bảo mật</a>
          <span style="color:#4b5563">·</span>
          <a href="#" style="color:#9ca3af;text-decoration:none;font-size:12px">Hủy đăng ký</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
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
