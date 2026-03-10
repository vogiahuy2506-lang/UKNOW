import db from '../../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import emailSettingsController from '../../controllers/emailSettings.controller.js';
import campaignFlowService from './campaignFlow.service.js';
import { classifyBounceType, isSmtpAuthConfigError } from '../../utils/emailBounce.utils.js';
import { decryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';

class CampaignEmailSenderService {
  constructor() {
    // Cache SMTP transporter theo settings.id để tái sử dụng kết nối TCP thay vì mở mới mỗi email.
    // Key: `smtp:{settings.id}`, Value: nodemailer transporter.
    this.transporterCache = new Map();
  }

  /**
   * Lấy hoặc tạo mới SMTP transporter cho một settings.id.
   * Transporter được tạo với pool=true để tái sử dụng kết nối TCP.
   *
   * @param {object} settings DB row từ email_settings
   * @returns {import('nodemailer').Transporter}
   */
  getOrCreateTransporter(settings) {
    const cacheKey = `smtp:${settings.id}`;
    if (this.transporterCache.has(cacheKey)) {
      return this.transporterCache.get(cacheKey);
    }
    const transporter = emailSettingsController.createSmtpTransporter({
      host: settings.smtp_host,
      port: settings.smtp_port,
      username: settings.smtp_username,
      password: decryptSmtpSecret(settings.smtp_password),
    });
    this.transporterCache.set(cacheKey, transporter);
    return transporter;
  }

  /**
   * Xóa transporter khỏi cache khi settings thay đổi hoặc kết nối lỗi auth.
   *
   * @param {string|number} settingsId
   */
  invalidateTransporter(settingsId) {
    const cacheKey = `smtp:${settingsId}`;
    const existing = this.transporterCache.get(cacheKey);
    if (existing && typeof existing.close === 'function') {
      try { existing.close(); } catch { /* bỏ qua */ }
    }
    this.transporterCache.delete(cacheKey);
  }

  /**
   * Send email for one customer in campaign execution.
   *
   * Trước khi gửi, kiểm tra trạng thái unsubscribe / hard bounce của khách hàng.
   * Nếu khách hàng đã unsubscribe hoặc bị hard bounce, trả về object bỏ qua (skipped).
   *
   * Nếu SMTP lỗi khi gửi, phân loại bounce (hard/soft), cập nhật DB và trả về object bounce.
   *
   * @param {object} actionNode
   * @param {object} customer
   * @param {object} campaign
   * @param {number} runId
   * @returns {Promise<{status: 'success'|'skipped'|'bounced'|'failed', to: string, reason?: string, bounceType?: string, errorType?: string, error?: string}>}
   */
  async sendEmailToCustomer(actionNode, customer, campaign, runId) {
    const config = actionNode.config || {};

    let templateId = config.emailTemplateId || config.templateId;
    let templateMappings = [];

    if (Array.isArray(config.emailSteps) && config.emailSteps.length > 0) {
      const firstStep = config.emailSteps[0];
      templateId = firstStep.templateId || templateId;
      templateMappings = firstStep.templateMappings || [];
    }

    let template = null;
    if (templateId) {
      const templateResult = await db.query(
        'SELECT * FROM email_templates WHERE id = $1',
        [templateId]
      );
      if (templateResult.rows.length > 0) {
        template = templateResult.rows[0];
      }
    }

    let settingsResult;
    if (config.fromEmailId) {
      settingsResult = await db.query(
        "SELECT * FROM email_settings WHERE id = $1 AND id_user = $2 AND status = 'active'",
        [config.fromEmailId, campaign.id_user]
      );
    } else {
      settingsResult = await db.query(
        "SELECT * FROM email_settings WHERE id_user = $1 AND status = 'active' LIMIT 1",
        [campaign.id_user]
      );
    }

    if (settingsResult.rows.length === 0) {
      throw new Error('Chưa cấu hình email settings');
    }

    const settings = settingsResult.rows[0];

    if (!settings.email) {
      throw new Error('Email settings không có địa chỉ email (source)');
    }

    let subject;
    let htmlBody;
    let textBody;
    let attachments = [];

    if (template) {
      subject = template.subject || 'Thông báo từ UKNOW';
      htmlBody = template.body_html || template.html_content || '';
      textBody = template.body_text || template.text_content || '';
      attachments = template.attachments || [];
    } else {
      subject = config.emailSubject || config.subject || 'Thông báo từ UKNOW';
      htmlBody = config.emailBody || config.htmlContent || config.body || '';
      textBody = config.textContent || config.textBody || '';

      if (!subject && !htmlBody) {
        throw new Error('Không có email template hoặc nội dung email trong config');
      }
    }

    const replacements = {};

    if (Array.isArray(templateMappings) && templateMappings.length > 0) {
      for (const mapping of templateMappings) {
        const key = mapping.key || mapping.variableName;
        if (!key) continue;

        let value = '';

        if (mapping.sourceType === 'manual') {
          value = mapping.value || '';
        } else if (mapping.sourceType === 'node' || mapping.sourceType === 'column') {
          const resolvedValue = campaignFlowService.getFieldValue(customer, {
            mode: 'node',
            field: mapping.field,
            nodeId: mapping.nodeId,
            value: mapping.value,
          });
          value = resolvedValue ?? mapping.value ?? '';
        } else {
          value = mapping.value || '';
        }

        value = String(value || '');

        replacements[`{{${key}}}`] = value;
        replacements[`{{ ${key} }}`] = value;
        replacements[`{${key}}`] = value;
      }

    }

    if (!replacements['{full_name}']) {
      replacements['{full_name}'] = customer.full_name || customer.email;
    }
    if (!replacements['{email}']) {
      replacements['{email}'] = customer.email;
    }
    if (!replacements['{courses}']) {
      replacements['{courses}'] = Array.isArray(customer.interested_courses)
        ? customer.interested_courses.join(', ')
        : '';
    }

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      subject = subject.replace(regex, value);
      htmlBody = htmlBody.replace(regex, value);
      textBody = textBody.replace(regex, value);
    }

    if (!subject || subject.trim() === '') subject = 'Thông báo từ UKNOW';
    if (!htmlBody || htmlBody.trim() === '') htmlBody = textBody || 'Email từ UKNOW';
    if (!textBody || textBody.trim() === '') textBody = htmlBody.replace(/<[^>]*>/g, '');

    console.info(
      `[CampaignRun][Email] attempt run=${runId} campaign=${campaign.id} node=${actionNode?.id || 'unknown'} `
      + `to=${customer.email} template=${templateId || 'custom'} fromEmailId=${settings.id}`
    );

    let customerId = null;
    if (customer.email) {
      const customerResult = await db.query(
        'SELECT id, email_subscribed, email_hard_bounced FROM customers WHERE id_user = $1 AND LOWER(email) = $2 LIMIT 1',
        [campaign.id_user, customer.email.toLowerCase()]
      );
      const customerRow = customerResult.rows[0] || null;
      customerId = customerRow?.id || null;

      // Bỏ qua khách hàng đã hủy đăng ký nhận email
      if (customerRow && customerRow.email_subscribed === false) {
        console.info(`[CampaignRun][Email] skip run=${runId} to=${customer.email} reason=unsubscribed`);
        return { to: customer.email, status: 'skipped', reason: 'unsubscribed' };
      }

      // Bỏ qua khách hàng bị hard bounce vĩnh viễn
      if (customerRow && customerRow.email_hard_bounced === true) {
        console.info(`[CampaignRun][Email] skip run=${runId} to=${customer.email} reason=hard_bounced`);
        return { to: customer.email, status: 'skipped', reason: 'hard_bounced' };
      }
    }

    const trackingToken = uuidv4();
    const trackingBaseUrl = String(process.env.TRACKING_BASE_URL || '').trim() || 'http://localhost:5000';

    /**
     * Theo yêu cầu nghiệp vụ mới:
     * - Ưu tiên gửi file dưới dạng attachment thật trong email.
     * - Không chèn block link tài liệu đính kèm vào body nữa.
     * Tracking open/click link trong body vẫn được giữ qua buildTrackedHtml.
     */
    const trackedHtmlContent = emailSettingsController.buildTrackedHtml(
      htmlBody,
      trackingBaseUrl,
      trackingToken,
      campaign.id,
      customerId,
      runId
    );

    const realMailAttachments = Array.isArray(attachments) && attachments.length > 0
      ? await emailSettingsController.buildMailAttachments(attachments)
      : [];

    // Tái sử dụng transporter đã cache để tránh mở TCP connection mới mỗi email.
    const transporter = this.getOrCreateTransporter(settings);

    let info;
    try {
      info = await transporter.sendMail({
        from: `"${settings.name}" <${settings.email}>`,
        to: customer.email,
        subject: subject || 'Email từ UKNOW',
        text: textBody,
        html: trackedHtmlContent || `<p>${textBody}</p>`,
        attachments: realMailAttachments.length ? realMailAttachments : undefined,
      });
    } catch (smtpError) {
      const smtpConfigError = isSmtpAuthConfigError(smtpError);
      const bounceType = classifyBounceType(smtpError);
      const bounceReason = String(smtpError?.message || '').slice(0, 500);
      const shortBounceReason = bounceReason.slice(0, 180);
      if (smtpConfigError) {
        console.warn(
          `[CampaignRun][Email] smtp_config_error run=${runId} to=${customer.email} `
          + `reason=${shortBounceReason}`
        );
      } else {
        console.warn(
          `[CampaignRun][Email] bounced run=${runId} to=${customer.email} `
          + `type=${bounceType} reason=${shortBounceReason}`
        );
      }

      // Cập nhật email_message nếu đã được insert (sẽ insert trước khi throw bounce)
      // Ở đây chưa insert nên chỉ log thống kê SMTP settings và trả bounce result.
      // Ghi thống kê tạm thời để biết đã cố gửi
      await db.query(
        'UPDATE email_settings SET daily_sent_count = daily_sent_count + 1, total_sent_count = total_sent_count + 1 WHERE id = $1',
        [settings.id]
      ).catch(() => {});

      // Lỗi auth/config SMTP → xóa transporter khỏi cache để lần gửi kế tiếp không tái dùng session lỗi.
      if (smtpConfigError) {
        this.invalidateTransporter(settings.id);
      }

      // Lỗi cấu hình SMTP (ví dụ 535) không phải bounce của người nhận.
      if (smtpConfigError) {
        const failedAt = new Date();
        try {
          const failedTrackingToken = uuidv4();
          await emailSettingsController.logEmailSent({
            userId: campaign.id_user,
            campaignId: campaign.id,
            customerId,
            emailTemplateId: null,
            fromEmailId: settings.id,
            to: customer.email,
            subject,
            trackedHtmlContent: null,
            plainTextContent: textBody,
            trackingToken: failedTrackingToken,
            info: { messageId: null },
            sentAt: failedAt,
            setting: settings,
            runId,
          });
          await db.query(
            `UPDATE email_messages
             SET status = 'failed', bounce_reason = $1
             WHERE tracking_token = $2`,
            [bounceReason, failedTrackingToken]
          );
        } catch (logErr) {
          console.error('[sendEmailToCustomer] Lỗi ghi log SMTP config error:', logErr.message);
        }

        return {
          to: customer.email,
          status: 'failed',
          errorType: 'smtp_config',
          error: bounceReason,
        };
      }

      // Hard bounce: đánh dấu khách hàng để bỏ qua lần gửi tiếp theo
      if (bounceType === 'hard' && customerId) {
        await db.query(
          'UPDATE customers SET email_hard_bounced = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [customerId]
        ).catch((e) => console.error('[sendEmailToCustomer] Lỗi cập nhật hard bounce:', e.message));
        console.info(`[CampaignRun][Email] mark_hard_bounce run=${runId} customerId=${customerId}`);
      }

      // Ghi log email_message với status bounced
      const bouncedAt = new Date();
      try {
        const bounceTrackingToken = uuidv4();
        await emailSettingsController.logEmailSent({
          userId: campaign.id_user,
          campaignId: campaign.id,
          customerId,
          emailTemplateId: null,
          fromEmailId: settings.id,
          to: customer.email,
          subject,
          trackedHtmlContent: null,
          plainTextContent: textBody,
          trackingToken: bounceTrackingToken,
          info: { messageId: null },
          sentAt: bouncedAt,
          setting: settings,
          runId,
        });
        // Cập nhật email_message vừa insert sang status bounced
        await db.query(
          `UPDATE email_messages
           SET status = 'bounced', bounced_at = $1, bounce_reason = $2
           WHERE tracking_token = $3`,
          [bouncedAt, bounceReason, bounceTrackingToken]
        );
      } catch (logErr) {
        console.error('[sendEmailToCustomer] Lỗi ghi log bounce:', logErr.message);
      }

      return {
        to: customer.email,
        status: 'bounced',
        bounceType,
        bounceReason,
      };
    }

    console.info(
      `[CampaignRun][Email] success run=${runId} to=${customer.email} messageId=${info?.messageId || 'n/a'}`
    );

    await db.query(
      'UPDATE email_settings SET daily_sent_count = daily_sent_count + 1, total_sent_count = total_sent_count + 1 WHERE id = $1',
      [settings.id]
    );

    const sentAt = new Date();
    if (config.saveMessageLog !== false) {
      try {
        await emailSettingsController.logEmailSent({
          userId: campaign.id_user,
          campaignId: campaign.id,
          customerId,
          emailTemplateId: templateId,
          fromEmailId: settings.id,
          to: customer.email,
          subject,
          trackedHtmlContent,
          plainTextContent: textBody,
          trackingToken,
          info,
          sentAt,
          setting: settings,
          runId,
        });
      } catch (logError) {
        console.error('[sendEmailToCustomer] Lỗi lưu log:', logError.message);
      }
    }

    return {
      to: customer.email,
      status: 'success',
      messageId: info?.messageId || null,
      from: settings.email || null,
      sentAt,
      subject: subject || 'Email từ UKNOW',
      tracking: {
        token: trackingToken,
        baseUrl: trackingBaseUrl,
      },
    };
  }
}

export default new CampaignEmailSenderService();
