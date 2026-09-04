import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import campaignEmailSenderRepository from '../../repositories/campaign/campaignEmailSender.repository.js';
import emailSettingsController from '../../controllers/emailSettings.controller.js';
import emailSettingsSmtpService from '../email/emailSettingsSmtp.service.js';
import campaignFlowService from './campaignFlow.service.js';
import {
  classifyBounceType,
  isRecipientAddressNotFoundError,
  isSmtpAuthConfigError,
  isSmtpProviderRateLimitError,
} from '../../utils/emailBounce.utils.js';
import { decryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';
import { resolveFromAddress, extractBrandDomain, resolveEnvelopeFrom } from '../../utils/emailFromAddress.util.js';
import outboundMessageQueueService, {
  OUTBOUND_MESSAGE_JOB_TYPES,
} from '../queue/outboundMessageQueue.service.js';
import { deriveVariablesForText } from '../../utils/templateVariableAutoMap.util.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  markSendQuotaUncertain,
} from '../quota/sendQuotaReservation.service.js';
import { buildCampaignReservationKey, computeRequestFingerprint } from '../quota/sendQuotaKey.service.js';

class CampaignEmailSenderService {
  constructor() {
    // Cache SMTP transporter theo settings.id để tái sử dụng kết nối TCP thay vì mở mới mỗi email.
    // Key: `smtp:{settings.id}`, Value: nodemailer transporter.
    this.transporterCache = new Map();
    // Cache metadata theo từng run/node để giảm query lặp template/settings cho mỗi recipient.
    // Key: `run:{runId}:node:{nodeId}`, Value: { templates: Map, settings: Map, lastAccessAt }.
    this.runNodeCache = new Map();
    this.RUN_NODE_CACHE_TTL_MS = 30 * 60 * 1000;
    this.RUN_NODE_CACHE_MAX_KEYS = 500;
    // State rate-limit in-memory cho email theo SMTP account.
    this.rateLimitStateMap = new Map();
    this.RATE_LIMIT_STATE_TTL_MS = 90 * 60 * 1000;
    // Khoảng cách tối thiểu giữa các lần retry khi provider rate-limit.
    this.SMTP_LIMIT_RETRY_DELAY_MIN_MS = 24 * 60 * 60 * 1000;
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
   * Gửi email raw qua SMTP settings, không ghi email_messages/campaign stats/customer journey.
   *
   * @param {object} input
   * @param {object} input.settings email_settings row
   * @param {string} input.to email người nhận
   * @param {string} input.subject tiêu đề email
   * @param {string} input.html nội dung HTML
   * @param {string} [input.text] nội dung text
   * @param {Array<object>} [input.attachments]
   * @param {string} [input.from]
   * @param {string} [input.replyTo]
   * @returns {Promise<{info: object, messageId: string|null, sendMs: number}>}
   */
  async sendRawEmail({
    settings,
    to,
    subject,
    html,
    text = '',
    attachments = [],
    from = null,
    replyTo = null,
    envelope = null,
  }) {
    const transporter = this.getOrCreateTransporter(settings);
    const sendStartedAt = Date.now();

    await this.applyEmailSendRateLimit({ settings });
    const info = await transporter.sendMail({
      from: from || resolveFromAddress(settings),
      replyTo: replyTo || settings.reply_to || undefined,
      to,
      ...(envelope ? { envelope } : {}),
      subject: subject || 'Email từ Founder AI',
      text: text || String(html || '').replace(/<[^>]*>/g, ''),
      html: html || `<p>${text || ''}</p>`,
      attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined,
    });

    return {
      info,
      messageId: info?.messageId || null,
      sendMs: Date.now() - sendStartedAt,
    };
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
   * Đọc biến môi trường dạng số nguyên dương.
   *
   * @param {string} envName tên biến môi trường
   * @param {number} defaultValue giá trị mặc định
   * @returns {number}
   */
  parsePositiveIntEnv(envName, defaultValue) {
    const parsed = Number.parseInt(process.env?.[envName], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
    return parsed;
  }

  /**
   * Lấy cấu hình retry khi gặp giới hạn gửi từ provider SMTP.
   *
   * Luồng:
   * 1. Đọc `SMTP_LIMIT_RETRY_DELAY_MS` (mặc định = `SMTP_LIMIT_RETRY_DELAY_MIN_MS`, 24 giờ).
   * 2. Đọc `SMTP_LIMIT_MAX_RETRIES` — mặc định 60 lần nếu không set env.
   *
   * @returns {{delayMs: number, maxRetries: number}}
   */
  resolveProviderRateLimitRetryConfig() {
    const configuredDelayMs = this.parsePositiveIntEnv(
      'SMTP_LIMIT_RETRY_DELAY_MS',
      this.SMTP_LIMIT_RETRY_DELAY_MIN_MS
    );
    return {
      delayMs: Math.max(this.SMTP_LIMIT_RETRY_DELAY_MIN_MS, configuredDelayMs),
      // Trần số lần thử lại khi SMTP/SMTP provider báo rate-limit (override bằng SMTP_LIMIT_MAX_RETRIES).
      maxRetries: this.parsePositiveIntEnv('SMTP_LIMIT_MAX_RETRIES', 60),
    };
  }

  /**
   * Chuẩn hóa text thời gian retry để hiển thị trong log/thông báo.
   *
   * Luồng hoạt động:
   * 1. Quy đổi `delayMs` sang tổng số phút và ép tối thiểu 1 phút.
   * 2. Nếu dưới 60 phút thì trả text theo phút.
   * 3. Nếu từ 60 phút trở lên thì trả text theo giờ, kèm phút lẻ nếu có.
   *
   * @param {number} delayMs thời gian chờ retry (milliseconds)
   * @returns {string} nhãn tiếng Việt dễ đọc (ví dụ: "3 giờ", "1 giờ 30 phút")
   */
  formatRetryDelayLabel(delayMs) {
    const totalMinutes = Math.max(1, Math.round((Number(delayMs) || 0) / 60000));
    if (totalMinutes < 60) return `${totalMinutes} phút`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${hours} giờ`;
    return `${hours} giờ ${minutes} phút`;
  }

  /**
   * Kiểm tra mốc retry tuyệt đối từ metadata để ngăn gửi sớm hơn lịch.
   *
   * Luồng hoạt động:
   * 1. Đọc `scheduledRetryAt` từ `retryMeta` và parse về timestamp.
   * 2. Nếu timestamp không hợp lệ hoặc đã tới hạn thì cho phép gửi ngay.
   * 3. Nếu chưa tới hạn, trả về delay còn lại để caller tự re-enqueue đúng lịch.
   *
   * @param {object|null} retryMeta metadata retry hiện tại
   * @returns {{scheduledAtIso: string|null, scheduledAtMs: number|null, remainingDelayMs: number}}
   */
  resolveRetryScheduleGuard(retryMeta = null) {
    const scheduledAtIso = String(retryMeta?.scheduledRetryAt || '').trim();
    if (!scheduledAtIso) {
      return { scheduledAtIso: null, scheduledAtMs: null, remainingDelayMs: 0 };
    }
    const scheduledAtMs = Date.parse(scheduledAtIso);
    if (!Number.isFinite(scheduledAtMs)) {
      return { scheduledAtIso: null, scheduledAtMs: null, remainingDelayMs: 0 };
    }
    // Chừa 1 giây tolerance để tránh lệch nhỏ giữa clock app và Redis/worker.
    const remainingDelayMs = Math.max(0, scheduledAtMs - Date.now() - 1000);
    return { scheduledAtIso, scheduledAtMs, remainingDelayMs };
  }

  /**
   * Tạm dừng theo milliseconds.
   *
   * @param {number} ms thời gian chờ
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number.parseInt(ms, 10) || 0)));
  }

  /**
   * Tạo khóa cache theo run/node để gom query lặp của cùng một action node.
   *
   * @param {string|number} runId
   * @param {string|number} nodeId
   * @returns {string}
   */
  buildRunNodeCacheKey(runId, nodeId) {
    const safeRunId = String(runId || 'unknown').trim() || 'unknown';
    const safeNodeId = String(nodeId || 'unknown').trim() || 'unknown';
    return `run:${safeRunId}:node:${safeNodeId}`;
  }

  /**
   * Lấy bucket cache theo run/node, đồng thời dọn cache cũ để tránh tăng RAM vô hạn.
   *
   * @param {string|number} runId
   * @param {string|number} nodeId
   * @returns {{templates: Map<string, any>, settings: Map<string, any>, lastAccessAt: number}}
   */
  getOrCreateRunNodeCache(runId, nodeId) {
    const now = Date.now();
    for (const [key, value] of this.runNodeCache.entries()) {
      if (!value || typeof value !== 'object') {
        this.runNodeCache.delete(key);
        continue;
      }
      const lastAccessAt = Number.parseInt(value.lastAccessAt, 10) || 0;
      if ((now - lastAccessAt) > this.RUN_NODE_CACHE_TTL_MS) {
        this.runNodeCache.delete(key);
      }
    }

    const cacheKey = this.buildRunNodeCacheKey(runId, nodeId);
    if (this.runNodeCache.has(cacheKey)) {
      const existing = this.runNodeCache.get(cacheKey);
      existing.lastAccessAt = now;
      return existing;
    }

    if (this.runNodeCache.size >= this.RUN_NODE_CACHE_MAX_KEYS) {
      const oldestEntry = this.runNodeCache.entries().next().value;
      if (oldestEntry?.[0]) {
        this.runNodeCache.delete(oldestEntry[0]);
      }
    }

    const created = {
      templates: new Map(),
      settings: new Map(),
      lastAccessAt: now,
    };
    this.runNodeCache.set(cacheKey, created);
    return created;
  }

  /**
   * Lấy template email có cache theo run/node.
   *
   * Luồng hoạt động:
   * 1. Kiểm tra cache bucket của run/node theo templateId.
   * 2. Nếu chưa có thì query DB 1 lần, rồi lưu cache.
   * 3. Trả về template object hoặc null nếu không tồn tại.
   *
   * @param {object} input
   * @param {string|number} input.runId id run hiện tại
   * @param {string|number} input.nodeId id node hiện tại
   * @param {string|number} input.templateId id template cần lấy
   * @returns {Promise<object|null>}
   */
  async getTemplateByRunNodeCache({ runId, nodeId, templateId }) {
    if (!templateId) return null;
    const bucket = this.getOrCreateRunNodeCache(runId, nodeId);
    const templateKey = String(templateId).trim();
    if (bucket.templates.has(templateKey)) {
      return bucket.templates.get(templateKey);
    }
    const template = await campaignEmailSenderRepository.findEmailTemplateById(templateId);
    bucket.templates.set(templateKey, template);
    return template;
  }

  /**
   * Lấy SMTP settings có cache theo run/node + user/fromEmailId.
   *
   * @param {object} input
   * @param {string|number} input.runId id run hiện tại
   * @param {string|number} input.nodeId id node hiện tại
   * @param {string|number} input.userId id user sở hữu campaign
   * @param {string|number|null} input.fromEmailId id account gửi, null nếu lấy mặc định
   * @returns {Promise<object>}
   */
  async getEmailSettingsByRunNodeCache({
    runId,
    nodeId,
    userId,
    fromEmailId = null,
  }) {
    const bucket = this.getOrCreateRunNodeCache(runId, nodeId);
    const settingsKey = `user:${String(userId || '').trim()}::from:${String(fromEmailId || 'default').trim() || 'default'}`;
    if (bucket.settings.has(settingsKey)) {
      return bucket.settings.get(settingsKey);
    }
    const settings = fromEmailId
      ? await campaignEmailSenderRepository.findEmailSettingsById(fromEmailId, userId)
      : await campaignEmailSenderRepository.findDefaultEmailSettings(userId);
    if (!settings) {
      throw new Error('Chưa cấu hình email settings');
    }
    bucket.settings.set(settingsKey, settings);
    return settings;
  }

  /**
   * Trả về giới hạn gửi tối đa theo SMTP account trong mỗi phút.
   *
   * @param {object} input
   * @param {object} input.settings SMTP settings hiện tại
   * @returns {{accountPerMinute: number}}
   */
  resolveEmailRateLimitConfig({ settings }) {
    const accountPerMinute = this.parsePositiveIntEnv('SMTP_RATE_LIMIT_PER_MINUTE_ACCOUNT', 60);
    // Cho phép override theo chính account SMTP cụ thể.
    const accountSpecificKey = `SMTP_RATE_LIMIT_PER_MINUTE_ACCOUNT_${String(settings?.id || '').trim()}`;
    const accountSpecificLimit = this.parsePositiveIntEnv(accountSpecificKey, accountPerMinute);
    return {
      accountPerMinute: accountSpecificLimit,
    };
  }

  /**
   * Lấy hoặc tạo state rate-limit cho một key.
   *
   * @param {string} key
   * @returns {{windowStartMs: number, sentCount: number, tail: Promise<void>, lastAccessAt: number}}
   */
  getOrCreateRateLimitState(key) {
    const now = Date.now();
    for (const [stateKey, state] of this.rateLimitStateMap.entries()) {
      if (!state || typeof state !== 'object') {
        this.rateLimitStateMap.delete(stateKey);
        continue;
      }
      if ((now - (Number.parseInt(state.lastAccessAt, 10) || 0)) > this.RATE_LIMIT_STATE_TTL_MS) {
        this.rateLimitStateMap.delete(stateKey);
      }
    }

    const normalizedKey = String(key || '').trim();
    if (this.rateLimitStateMap.has(normalizedKey)) {
      const existing = this.rateLimitStateMap.get(normalizedKey);
      existing.lastAccessAt = now;
      return existing;
    }
    const created = {
      windowStartMs: now,
      sentCount: 0,
      tail: Promise.resolve(),
      lastAccessAt: now,
    };
    this.rateLimitStateMap.set(normalizedKey, created);
    return created;
  }

  /**
   * Chặn theo rate-limit cho một key với cơ chế queue tuần tự.
   *
   * @param {object} input
   * @param {string} input.key khóa limiter
   * @param {number} input.limitPerMinute số email tối đa / phút
   * @returns {Promise<void>}
   */
  async throttleByRateLimit({ key, limitPerMinute }) {
    const safeLimit = Number.parseInt(limitPerMinute, 10);
    if (!key || !Number.isFinite(safeLimit) || safeLimit <= 0) return;
    const state = this.getOrCreateRateLimitState(key);
    const task = state.tail.then(async () => {
      const now = Date.now();
      const elapsed = now - state.windowStartMs;
      if (elapsed >= 60_000) {
        state.windowStartMs = now;
        state.sentCount = 0;
      }
      if (state.sentCount >= safeLimit) {
        const waitMs = Math.max(0, 60_000 - (now - state.windowStartMs));
        if (waitMs > 0) {
          await this.sleep(waitMs);
        }
        state.windowStartMs = Date.now();
        state.sentCount = 0;
      }
      state.sentCount += 1;
      state.lastAccessAt = Date.now();
    });
    // Giữ chuỗi task luôn tiếp tục kể cả khi có exception ở nhánh trước.
    state.tail = task.catch(() => {});
    await task;
  }

  /**
   * Áp dụng rate-limit theo SMTP account trước khi gửi email thực tế.
   *
   * @param {object} input
   * @param {object} input.settings SMTP settings hiện tại
   * @returns {Promise<void>}
   */
  async applyEmailSendRateLimit({ settings }) {
    const config = this.resolveEmailRateLimitConfig({ settings });
    await this.throttleByRateLimit({
      key: `smtp_account:${String(settings?.id || '').trim()}`,
      limitPerMinute: config.accountPerMinute,
    });
  }

  /**
   * Send email for one customer in campaign execution.
   *
   * Luồng này đẩy job vào BullMQ để worker xử lý gửi mail có retry/backoff.
   * Nếu BullMQ/Redis chưa sẵn sàng, hệ thống tự fallback chạy inline để không gián đoạn.
   *
   * @param {object} actionNode
   * @param {object} customer
   * @param {object} campaign
   * @param {number} runId
   * @param {object|null} [sendMeta] metadata ghi DB: `emailStep` (1-based) cho cột email_messages.email_step
   * @returns {Promise<{status: 'success'|'skipped'|'bounced'|'failed', to: string, reason?: string, bounceType?: string, errorType?: string, error?: string, retryScheduledAt?: string|null}>}
   */
  async sendEmailToCustomer(actionNode, customer, campaign, runId, retryMeta = null, sendMeta = null) {
    return outboundMessageQueueService.enqueueAndWait({
      type: OUTBOUND_MESSAGE_JOB_TYPES.EMAIL_SEND,
      payload: {
        actionNode,
        customer,
        campaign,
        runId,
        retryMeta,
        sendMeta,
      },
      jobOptions: { attempts: 1 },
    });
  }

  /**
   * Hàm gửi email thực thi trực tiếp.
   * Hàm này được worker BullMQ gọi để xử lý một recipient cụ thể.
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
   * @param {object|null} retryMeta metadata retry nội bộ cho job delay
   * @param {object|null} [sendMeta] `{ emailStep }` bước email trong node (1-based) để ghi email_messages
   * @returns {Promise<{status: 'success'|'skipped'|'bounced'|'failed', to: string, reason?: string, bounceType?: string, errorType?: string, error?: string, retryScheduledAt?: string|null}>}
   */
  async sendEmailToCustomerDirect(actionNode, customer, campaign, runId, retryMeta = null, sendMeta = null) {
    const retryScheduleGuard = this.resolveRetryScheduleGuard(retryMeta);
    if (retryScheduleGuard.remainingDelayMs > 0) {
      const retryDelayLabel = this.formatRetryDelayLabel(this.resolveProviderRateLimitRetryConfig().delayMs);
      // Không enqueue thêm job BullMQ trì hoãn: job đó nếu gửi thành công sẽ không cập nhật ledger
      // (campaign_run_recipient_steps), khiến lần chạy chiến dịch sau vẫn coi step chưa xong và gửi trùng cùng template.
      // Luồng đúng: trả về trạng thái chờ retry để campaignRun ghi nextDueAt; scheduler/resume sẽ gọi lại.
      return {
        to: customer?.email || '',
        status: 'failed',
        errorType: 'smtp_rate_limited_retry_scheduled',
        error: `Email chưa tới giờ retry, hệ thống giữ lịch theo mốc ${retryDelayLabel} (chiến dịch sẽ thử lại khi tới hạn).`,
        retryScheduledAt: retryScheduleGuard.scheduledAtIso,
        retryAttemptCount: Number.parseInt(retryMeta?.smtpLimitRetryCount, 10) || 0,
      };
    }

    // Quota reservation atomic được giữ chỗ ngay trước provider call (xem gần this.sendRawEmail bên dưới),
    // không check sớm ở đây nữa: PR-Q4a Wave 2 (docs/PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md).
    const config = actionNode.config || {};
    const nodeId = actionNode?.id || 'unknown';
    const parsedLogNodeId = Number.parseInt(String(actionNode?.id ?? '').trim(), 10);
    const parsedLogEmailStep = Number.parseInt(String(sendMeta?.emailStep ?? '').trim(), 10);
    const logNodeIdForDb = Number.isFinite(parsedLogNodeId) ? parsedLogNodeId : null;
    const logEmailStepForDb = Number.isFinite(parsedLogEmailStep) ? parsedLogEmailStep : null;

    let templateId = config.emailTemplateId || config.templateId;
    let templateMappings = [];

    const firstStepConfig = Array.isArray(config.emailSteps) && config.emailSteps.length > 0
      ? config.emailSteps[0]
      : null;
    const currentStepConfig = (Array.isArray(config.emailSteps) && Number.isInteger(sendMeta?.emailStep) && config.emailSteps[sendMeta.emailStep - 1])
      ? config.emailSteps[sendMeta.emailStep - 1]
      : firstStepConfig;

    if (currentStepConfig) {
      templateId = currentStepConfig.templateId || templateId;
      templateMappings = currentStepConfig.templateMappings || [];
    }
    const shouldEnableEmailClickTracking = currentStepConfig?.enableLinkTracking !== false;

    const template = await this.getTemplateByRunNodeCache({
      runId,
      nodeId,
      templateId,
    });
    const settings = await this.getEmailSettingsByRunNodeCache({
      runId,
      nodeId,
      userId: campaign.id_user,
      fromEmailId: config.fromEmailId || null,
    });

    if (!settings.email) {
      throw new Error('Email settings không có địa chỉ email (source)');
    }

    const fallbackAttachments = Array.isArray(currentStepConfig?.attachments) && currentStepConfig.attachments.length > 0
      ? currentStepConfig.attachments
      : (Array.isArray(config.attachments) && config.attachments.length > 0 ? config.attachments : []);

    let subject;
    let htmlBody;
    let textBody;
    let attachments = [];

    if (template) {
      subject = template.subject || 'Thông báo từ Founder AI';
      htmlBody = template.body_html || template.html_content || '';
      textBody = template.body_text || template.text_content || '';
      attachments = Array.isArray(template.attachments) && template.attachments.length > 0
        ? template.attachments
        : fallbackAttachments;
    } else {
      subject = config.emailSubject || config.subject || currentStepConfig?.emailSubject || 'Thông báo từ Founder AI';
      htmlBody = config.emailBody || config.htmlContent || config.body || currentStepConfig?.emailBody || '';
      textBody = config.textContent || config.textBody || '';
      attachments = fallbackAttachments;

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
    } else {
      // Auto-map fallback khi templateMappings rỗng
      const combinedEmailText = `${subject || ''} ${htmlBody || ''} ${textBody || ''}`;
      const { variables } = deriveVariablesForText(combinedEmailText, {
        customer,
        logContext: { runId: 'email_send', nodeId: 'email_step' },
      });
      for (const [key, val] of Object.entries(variables)) {
        const strVal = String(val ?? '');
        replacements[`{{${key}}}`] = strVal;
        replacements[`{{ ${key} }}`] = strVal;
        replacements[`{${key}}`] = strVal;
      }
    }

    if (!replacements['{full_name}'] && !replacements['{{full_name}}']) {
      const defaultName = customer.full_name || customer.email || '';
      replacements['{full_name}'] = defaultName;
      replacements['{{full_name}}'] = defaultName;
      replacements['{{ full_name }}'] = defaultName;
    }
    if (!replacements['{email}'] && !replacements['{{email}}']) {
      const defaultEmail = customer.email || '';
      replacements['{email}'] = defaultEmail;
      replacements['{{email}}'] = defaultEmail;
      replacements['{{ email }}'] = defaultEmail;
    }
    if (!replacements['{courses}'] && !replacements['{{courses}}']) {
      const defaultCourses = Array.isArray(customer.interested_courses)
        ? customer.interested_courses.join(', ')
        : '';
      replacements['{courses}'] = defaultCourses;
      replacements['{{courses}}'] = defaultCourses;
      replacements['{{ courses }}'] = defaultCourses;
    }

    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      subject = subject.replace(regex, value);
      htmlBody = htmlBody.replace(regex, value);
      textBody = textBody.replace(regex, value);
    }

    if (!subject || subject.trim() === '') subject = 'Thông báo từ Founder AI';
    if (!htmlBody || htmlBody.trim() === '') htmlBody = textBody || 'Email từ Founder AI';
    if (!textBody || textBody.trim() === '') textBody = htmlBody.replace(/<[^>]*>/g, '');

    console.info(
      `[CampaignRun][Email] attempt run=${runId} campaign=${campaign.id} node=${actionNode?.id || 'unknown'} `
      + `to=${customer.email} template=${templateId || 'custom'} fromEmailId=${settings.id}`
    );

    let customerId = null;
    if (customer.email) {
      const customerRow = await campaignEmailSenderRepository.findCustomerByEmail(
        campaign.id_user, customer.email.toLowerCase()
      );
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
    const trackingBaseUrl = (String(process.env.TRACKING_BASE_URL || '').trim() || 'http://localhost:5000').replace(/\/+$/, '');

    /**
     * Theo yêu cầu nghiệp vụ mới:
     * - Ưu tiên gửi file dưới dạng attachment thật trong email.
     * - Không chèn block link tài liệu đính kèm vào body nữa.
     * Tracking open/click link trong body vẫn được giữ qua buildTrackedHtml.
     */
    const trackedHtmlContent = await emailSettingsController.buildTrackedHtml(
      htmlBody,
      trackingBaseUrl,
      trackingToken,
      campaign.id,
      customerId,
      runId,
      {
        enableClickTracking: shouldEnableEmailClickTracking,
        useShortLinkForClickTracking: true,
      }
    );

    const realMailAttachments = Array.isArray(attachments) && attachments.length > 0
      ? await emailSettingsController.buildMailAttachments(attachments)
      : [];

    // Resolve actual from address + brand domain before sending (for logging)
    const fromAddress = resolveFromAddress(settings);
    const brandDomain = settings.brand_domain || extractBrandDomain(settings.email);
    const envelopeFrom = resolveEnvelopeFrom(settings, trackingToken);

    // Giữ chỗ quota atomic ngay trước provider call (PR-Q4a Wave 2). Đặt muộn nhất có thể để
    // không phải release cho các nhánh throw/return sớm hơn (template thiếu, settings thiếu,
    // unsubscribed/hard-bounced) — những nhánh đó chưa từng giữ reservation nào.
    const logicalStep = Number.isInteger(sendMeta?.emailStep) ? sendMeta.emailStep : 1;
    const reservationKey = buildCampaignReservationKey({
      runId,
      nodeId: actionNode?.id,
      channel: 'email',
      recipient: customer?.email || '',
      logicalStep,
    });
    const requestFingerprint = computeRequestFingerprint({
      channel: 'email',
      recipient: customer?.email || '',
      sourceType: 'campaign_email',
      quantity: 1,
      // subject/content/templateId/attachments để fingerprint bắt được trường hợp key trùng nhưng
      // nội dung đổi giữa 2 lần thử (retry sau smtp_rate_limited_retry_scheduled có thể cách nhau
      // nhiều giờ). Thiếu attachments thì đổi file đính kèm cùng key vẫn lặng lẽ replay kết quả cũ
      // thay vì 409 IDEMPOTENCY_KEY_REUSED (review độc lập bắt lỗi này). Dùng attachments dạng mô
      // tả (key/name/size/contentType), không phải realMailAttachments đã đọc buffer thật — đủ để
      // phát hiện đổi file, không tốn chi phí hash nội dung mỗi lần gửi.
      subject,
      content: htmlBody,
      templateId: templateId || null,
      attachments,
    });

    let reservation;
    try {
      reservation = await reserveSendQuota({
        userId: campaign.id_user,
        channel: 'email',
        quantity: 1,
        reservationKey,
        requestFingerprint,
        sourceType: 'campaign_email',
        sourceRef: { runId, nodeId: logNodeIdForDb, stepIndex: logEmailStepForDb },
      });
    } catch (quotaErr) {
      // Chỉ quota-exceeded (403 RESOURCE_LIMIT_EXCEEDED) mới map sang kết quả "failed sạch" để
      // campaignRun.service.js:3457-3484 pause-and-resume. Lỗi hạ tầng (503 SEND_QUOTA_UNAVAILABLE)
      // hoặc conflict (409 CONCURRENT_SEND_IN_PROGRESS/IDEMPOTENCY_KEY_REUSED) phải throw ra ngoài
      // như hành vi cũ của checkSendQuota() khi DB lỗi — nuốt thành "hết hạn mức" sẽ chặn nhầm
      // retry-wrapper phía trên (executeWithTimeoutRetry) vốn tự retry lỗi mạng/kết nối.
      if (quotaErr.code !== 'RESOURCE_LIMIT_EXCEEDED') {
        throw quotaErr;
      }
      return {
        to: customer?.email || '',
        status: 'failed',
        errorType: 'plan_send_limit_exceeded',
        error: quotaErr.message,
        period: quotaErr.limitType === 'daily' || quotaErr.limitType === 'monthly' ? quotaErr.limitType : null,
        resetAt: quotaErr.resetAt
          ? (quotaErr.resetAt instanceof Date ? quotaErr.resetAt.toISOString() : String(quotaErr.resetAt))
          : null,
        limitType: quotaErr.limitType || null,
      };
    }

    const reservationActive = reservation.mode === 'enforce' || reservation.mode === 'test_enforce';

    if (reservationActive && reservation.status === 'consumed') {
      // Idempotent replay: cùng logical send đã consumed trước đó (vd. retry sau khi job stalled
      // trong BullMQ) — không gọi lại provider, trả kết quả y hệt lần trước. PHẢI đọc lại
      // snapshot.status thay vì hardcode 'success': hard bounce cũng consume (billable), nếu
      // replay luôn trả success thì campaign ledger/thống kê đánh dấu nhầm recipient thành công
      // (review độc lập bắt lỗi này).
      const snapshot = reservation.responseSnapshot || reservation.response_snapshot || {};
      if (snapshot.status === 'bounced') {
        // snapshot không lưu bounceReason gốc (tránh PII trong quota ledger — xem chỗ consume
        // bounce bên dưới); lý do đầy đủ đã có trong email_messages.bounce_reason qua persistSource.
        return {
          to: customer?.email || '',
          status: 'bounced',
          bounceType: snapshot.errorType === 'hard_bounce' ? 'hard' : 'soft',
          bounceReason: '',
          isReplay: true,
        };
      }
      return {
        to: customer?.email || '',
        status: 'success',
        messageId: snapshot.messageId || null,
        isReplay: true,
      };
    }

    if (reservationActive) {
      await markSendQuotaSending({ reservationId: reservation.id });
    }

    const releaseReservation = async (failureCode, reason) => {
      if (!reservationActive) return;
      try {
        await releaseSendQuota({ reservationId: reservation.id, failureCode, reason });
      } catch (e) {
        console.warn('[CampaignEmailSender] releaseSendQuota error:', e.message);
      }
    };
    const markUncertainReservation = async (failureCode, reason) => {
      if (!reservationActive) return;
      try {
        await markSendQuotaUncertain({ reservationId: reservation.id, failureCode, reason });
      } catch (e) {
        console.warn('[CampaignEmailSender] markSendQuotaUncertain error:', e.message);
      }
    };

    let info;
    try {
      const rawResult = await this.sendRawEmail({
        settings,
        from: fromAddress,
        replyTo: settings.reply_to || undefined,
        to: customer.email,
        envelope: envelopeFrom ? { from: envelopeFrom, to: [customer.email] } : undefined,
        subject: subject || 'Email từ Founder AI',
        text: textBody,
        html: trackedHtmlContent || `<p>${textBody}</p>`,
        attachments: realMailAttachments,
      });
      info = rawResult.info;
    } catch (smtpError) {
      const providerRateLimitError = isSmtpProviderRateLimitError(smtpError);
      const smtpConfigError = !providerRateLimitError && isSmtpAuthConfigError(smtpError);
      const bounceType = classifyBounceType(smtpError);
      const shouldMarkAsRecipientBounce = isRecipientAddressNotFoundError(smtpError);
      const bounceReason = String(smtpError?.message || '').slice(0, 500);
      const shortBounceReason = bounceReason.slice(0, 180);
      if (providerRateLimitError) {
        // Không ghi log rate-limit theo yêu cầu nghiệp vụ:
        // campaignRun sẽ tự xử lý đóng băng run 24h và chạy lại sau.
      } else if (smtpConfigError) {
        console.warn(
          `[CampaignRun][Email] smtp_config_error run=${runId} to=${customer.email} `
          + `reason=${shortBounceReason}`
        );
      } else if (shouldMarkAsRecipientBounce) {
        console.warn(
          `[CampaignRun][Email] bounced run=${runId} to=${customer.email} `
          + `type=${bounceType} reason=${shortBounceReason}`
        );
      } else {
        console.warn(
          `[CampaignRun][Email] smtp_delivery_error run=${runId} to=${customer.email} `
          + `reason=${shortBounceReason}`
        );
      }

      // Cập nhật email_message nếu đã được insert (sẽ insert trước khi throw bounce)
      // Ở đây chưa insert nên chỉ log thống kê SMTP settings và trả bounce result.
      // Ghi thống kê tạm thời để biết đã cố gửi
      await campaignEmailSenderRepository.incrementEmailSettingsSentCount(settings.id).catch(() => {});

      if (providerRateLimitError) {
        const retryConfig = this.resolveProviderRateLimitRetryConfig();
        const retryDelayLabel = this.formatRetryDelayLabel(retryConfig.delayMs);
        const currentRetryCount = Number.parseInt(retryMeta?.smtpLimitRetryCount, 10) || 0;
        const nextRetryCount = currentRetryCount + 1;
        const canRetry = nextRetryCount <= retryConfig.maxRetries;

        // SMTP từ chối trước khi nhận (definitive_no_send) — release ngay cả khi còn lượt retry:
        // lần retry theo lịch sẽ tự re-reserve đúng key (reservationKey không đổi theo attempt count).
        await releaseReservation('SMTP_PROVIDER_RATE_LIMITED', shortBounceReason);

        if (canRetry) {
          const retryScheduleAt = new Date(Date.now() + retryConfig.delayMs);
          // Không tạo job BullMQ delay ở đây: khi job chạy sau không đi qua campaignRun nên không mark step;
          // chiến dịch vẫn thấy step hiện tại pending → gửi lại cùng template (lỗi template 2 hai lần).
          // campaignRun đã lưu nextDueAt + retryCount qua ledger; scheduler/resume kích hoạt gửi lại đúng một lần.
          return {
            to: customer.email,
            status: 'failed',
            errorType: 'smtp_rate_limited_retry_scheduled',
            error: `SMTP provider đang giới hạn gửi; chiến dịch sẽ thử lại sau ${retryDelayLabel} (lần ${nextRetryCount}/${retryConfig.maxRetries}).`,
            retryScheduledAt: retryScheduleAt.toISOString(),
            retryAttemptCount: nextRetryCount,
          };
        }

        return {
          to: customer.email,
          status: 'failed',
          errorType: 'smtp_rate_limited',
            error: `SMTP provider đang giới hạn gửi và đã vượt số lần retry (${retryConfig.maxRetries}).`,
        };
      }

      // Lỗi auth/config SMTP → xóa transporter khỏi cache để lần gửi kế tiếp không tái dùng session lỗi.
      if (smtpConfigError) {
        this.invalidateTransporter(settings.id);
      }

      // Lỗi cấu hình SMTP (ví dụ 535) không phải bounce của người nhận.
      if (smtpConfigError) {
        await releaseReservation('SMTP_CONFIG_ERROR', shortBounceReason);
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
            nodeId: logNodeIdForDb,
            emailStep: logEmailStepForDb,
            fromAddress,
            brandDomain,
          });
          await campaignEmailSenderRepository.markEmailMessageFailed(failedTrackingToken, bounceReason);
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

      // Chỉ đánh dấu bounce khi có dấu hiệu rõ ràng email người nhận không tồn tại.
      if (!shouldMarkAsRecipientBounce) {
        // Không thể chứng minh SMTP server đã nhận hay chưa nhận trước khi lỗi — theo mục 8
        // plan Wave 2, đây là nhóm "unknown", phải uncertain chứ không được coi là chắc chắn
        // chưa gửi (release). Đây là thay đổi hành vi thật so với code cũ (PR-Q4a).
        await markUncertainReservation('SMTP_DELIVERY_ERROR_AMBIGUOUS', shortBounceReason);
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
            nodeId: logNodeIdForDb,
            emailStep: logEmailStepForDb,
            fromAddress,
            brandDomain,
          });
          await campaignEmailSenderRepository.markEmailMessageFailed(failedTrackingToken, bounceReason);
        } catch (logErr) {
          console.error('[sendEmailToCustomer] Lỗi ghi log SMTP delivery error:', logErr.message);
        }

        return {
          to: customer.email,
          status: 'failed',
          errorType: 'smtp_delivery',
          error: bounceReason,
        };
      }

      // Hard bounce: đánh dấu khách hàng để bỏ qua lần gửi tiếp theo
      if (bounceType === 'hard' && customerId) {
        await campaignEmailSenderRepository.markCustomerHardBounced(customerId)
          .catch((e) => console.error('[sendEmailToCustomer] Lỗi cập nhật hard bounce:', e.message));
        console.info(`[CampaignRun][Email] mark_hard_bounce run=${runId} customerId=${customerId}`);
      }

      // Ghi log email_message với status bounced. Theo policy Wave 2 (mục 8): hard bounce phát
      // sinh SAU khi provider đã nhận request là "billable_bounce" — vẫn consume + debit ví như
      // gửi thành công (baseline sản phẩm hiện tại đã tính bounce vào quota, giữ nguyên).
      const bouncedAt = new Date();
      if (reservationActive) {
        try {
          await consumeSendQuota({
            reservationId: reservation.id,
            // Dùng field allowlisted (status/errorType trong ALLOWED_RESPONSE_SNAPSHOT_FIELDS ở
            // sendQuota.repository.js) — bounceType KHÔNG nằm trong allowlist nên bị
            // sanitizeResponseSnapshot() lặng lẽ lọc mất, làm nhánh replay bên trên không còn cách
            // nào phân biệt bounce với success (finding đã sửa trước đó).
            //
            // KHÔNG đưa bounceReason vào field 'error': assertNoPiiOrSecret() quét đệ quy toàn bộ
            // snapshot sau sanitize (kể cả field allowlisted) và bounceReason SMTP thật thường
            // chứa nguyên email người nhận (vd. "550 5.1.1 <user@example.com> User unknown") —
            // consumeSendQuota() sẽ throw PII_DETECTED, bị catch bên dưới rồi chuyển nhầm reservation
            // sang uncertain thay vì consumed cho MỌI hard bounce thật (review độc lập bắt lỗi này).
            // Lý do bounce đầy đủ đã có sẵn trong email_messages.bounce_reason qua persistSource,
            // không cần lặp lại (và không an toàn để lặp lại) trong quota snapshot.
            responseSnapshot: {
              status: 'bounced',
              errorType: bounceType === 'hard' ? 'hard_bounce' : 'soft_bounce',
              provider: 'smtp',
            },
            persistSource: async (client) => {
              await emailSettingsSmtpService.logEmailSentWithClient(client, {
                userId: campaign.id_user,
                campaignId: campaign.id,
                customerId,
                emailTemplateId: null,
                fromEmailId: settings.id,
                to: customer.email,
                subject,
                trackedHtmlContent: null,
                plainTextContent: textBody,
                trackingToken,
                info: { messageId: null },
                sentAt: bouncedAt,
                setting: settings,
                runId,
                nodeId: logNodeIdForDb,
                emailStep: logEmailStepForDb,
                fromAddress,
                brandDomain,
                quotaReservationId: reservation.id,
              });
              await campaignEmailSenderRepository.markEmailMessageBounced(
                trackingToken,
                bouncedAt,
                bounceReason,
                { bounceType, bounceCode: null, bounceDetectedVia: 'smtp' },
                client
              );
            },
          });
        } catch (consumeErr) {
          console.warn('[CampaignEmailSender] consumeSendQuota (bounce) failed after provider attempt:', consumeErr.message);
          await markUncertainReservation('CONSUME_DB_FAILED', consumeErr.message);
        }
      } else {
        try {
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
            trackingToken,
            info: { messageId: null },
            sentAt: bouncedAt,
            setting: settings,
            runId,
            nodeId: logNodeIdForDb,
            emailStep: logEmailStepForDb,
            fromAddress,
            brandDomain,
            debitWallet: true,
          });
          // Cập nhật email_message vừa insert sang status bounced
          await campaignEmailSenderRepository.markEmailMessageBounced(
            trackingToken,
            bouncedAt,
            bounceReason,
            { bounceType, bounceCode: null, bounceDetectedVia: 'smtp' }
          );
        } catch (logErr) {
          console.error('[sendEmailToCustomer] Lỗi ghi log bounce:', logErr.message);
        }
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

    // Không chặn: đây là counter thống kê không tính billing (khác consumeSendQuota() bên dưới).
    // Nếu để throw không bắt, reservation đã 'sending' (provider đã accept) sẽ không bao giờ được
    // consume hay uncertain — kẹt 'sending' vĩnh viễn cho tới sweeper PR-Q5 (review độc lập bắt lỗi này).
    await campaignEmailSenderRepository.incrementEmailSettingsSentCount(settings.id).catch((e) => {
      console.warn('[CampaignEmailSender] incrementEmailSettingsSentCount error (khong chan luong consume):', e.message);
    });

    const sentAt = new Date();
    const shouldSaveMessageLog = config.saveMessageLog !== false;
    if (reservationActive) {
      // Reservation đã "sending" — provider vừa xác nhận nhận email (accepted). Luôn consume để
      // đóng lease dù có ghi log DB hay không (đã dùng quota thật, không được để trống quota).
      try {
        await consumeSendQuota({
          reservationId: reservation.id,
          providerReference: info?.messageId
            ? crypto.createHash('sha256').update(String(info.messageId)).digest('hex').slice(0, 32)
            : null,
          responseSnapshot: {
            status: 'success',
            messageId: info?.messageId || null,
            provider: 'smtp',
            sentAt: sentAt.toISOString(),
          },
          persistSource: shouldSaveMessageLog
            ? (client) => emailSettingsSmtpService.logEmailSentWithClient(client, {
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
                nodeId: logNodeIdForDb,
                emailStep: logEmailStepForDb,
                fromAddress,
                brandDomain,
                quotaReservationId: reservation.id,
              })
            : null,
        });
      } catch (consumeErr) {
        console.warn('[CampaignEmailSender] consumeSendQuota failed after successful provider send:', consumeErr.message);
        await markUncertainReservation('CONSUME_DB_FAILED', consumeErr.message);
      }
    } else if (shouldSaveMessageLog) {
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
          nodeId: logNodeIdForDb,
          emailStep: logEmailStepForDb,
          fromAddress,
          brandDomain,
          debitWallet: true,
        });
      } catch (logError) {
        console.error('[sendEmailToCustomer] Lỗi lưu log:', logError.message);
      }
    }

    return {
      to: customer.email,
      status: 'success',
      messageId: info?.messageId || null,
      from: fromAddress,
      fromDomain: brandDomain,
      replyTo: settings.reply_to || null,
      sentAt,
      subject: subject || 'Email từ Founder AI',
      tracking: {
        token: trackingToken,
        baseUrl: trackingBaseUrl,
      },
    };
  }
}

export default new CampaignEmailSenderService();
