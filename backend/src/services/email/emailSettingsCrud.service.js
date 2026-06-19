import emailSettingsRepository from '../../repositories/email/emailSettings.repository.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';

function createServiceError(message, statusCode, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

class EmailSettingsCrudService {
  mapListItem(item) {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      replyTo: item.reply_to || null,
      smtpHost: item.smtp_host,
      smtpPort: item.smtp_port,
      useTls: item.use_tls,
      dailyLimit: item.daily_limit,
      hourlyLimit: item.hourly_limit,
      dailySentCount: item.daily_sent_count,
      totalSentCount: item.total_sent_count,
      isVerified: item.is_verified,
      status: item.status,
      brandDomain: item.brand_domain || null,
      domainVerificationStatus: item.domain_verification_status || null,
      domainVerifiedAt: item.domain_verified_at || null,
      creatorName: item.creator_name || null,
      createdBy: item.creator_name ? { name: item.creator_name } : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      emailMode: item.email_mode || 'platform',
    };
  }

  mapDetail(item) {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      replyTo: item.reply_to || null,
      smtpHost: item.smtp_host,
      smtpPort: item.smtp_port,
      smtpUsername: item.smtp_username,
      useTls: item.use_tls,
      dailyLimit: item.daily_limit,
      hourlyLimit: item.hourly_limit,
      dailySentCount: item.daily_sent_count,
      totalSentCount: item.total_sent_count,
      isVerified: item.is_verified,
      status: item.status,
      brandDomain: item.brand_domain || null,
      domainVerificationStatus: item.domain_verification_status || null,
      domainDnsRecords: item.domain_dns_records || null,
      domainVerifiedAt: item.domain_verified_at || null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      emailMode: item.email_mode || 'platform',
    };
  }

  mapMutationResult(item) {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      replyTo: item.reply_to || null,
      platformPrefix: item.platform_prefix || 'no-reply',
      smtpHost: item.smtp_host,
      smtpPort: item.smtp_port,
      useTls: item.use_tls,
      dailyLimit: item.daily_limit,
      hourlyLimit: item.hourly_limit,
      isVerified: item.is_verified,
      status: item.status,
      brandDomain: item.brand_domain || null,
      domainVerificationStatus: item.domain_verification_status || null,
    };
  }

  mapActiveItem(item) {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      replyTo: item.reply_to || null,
      platformPrefix: item.platform_prefix || 'no-reply',
      smtpHost: item.smtp_host,
      smtpPort: item.smtp_port,
      isVerified: item.is_verified,
      status: item.status,
      brandDomain: item.brand_domain || null,
    };
  }

  async getAll({ userId, roleCode, page = 1, limit = 10, status }) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const result = await emailSettingsRepository.getPagedByUser(userId, {
      page: pageNum,
      limit: limitNum,
      status,
      roleCode,
    });

    return {
      items: result.rows.map((item) => this.mapListItem(item)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
      },
    };
  }

  async getById({ userId, roleCode, id }) {
    const item = await emailSettingsRepository.getById(userId, id, { roleCode });
    if (!item) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }
    return this.mapDetail(item);
  }

  // Default SMTP settings from environment
  DEFAULT_SMTP = {
    host: process.env.SENDGRID_SMTP_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.SENDGRID_SMTP_PORT, 10) || 587,
    username: process.env.SENDGRID_SMTP_USERNAME || 'apikey',
    password: process.env.SENDGRID_API_KEY || '',
    useTls: true,
  };

  isDefaultSmtpConfigured() {
    return !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim());
  }

  async create({ userId, roleCode, payload }) {
    const emailAccountLimitCheck = await checkUserResourceLimit({
      userId,
      roleCode,
      resourceKey: 'emailAccounts',
    });
    if (!emailAccountLimitCheck.allowed) {
      throw createServiceError(emailAccountLimitCheck.message, 400, { limitReached: true });
    }

    const replyTo = payload.replyTo?.trim() || payload.email?.trim();

    // Validate required fields
    if (!payload.name?.trim()) {
      throw createServiceError('Tên người gửi là bắt buộc', 400);
    }
    if (!replyTo) {
      throw createServiceError('Email Reply-To là bắt buộc', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(replyTo)) {
      throw createServiceError('Địa chỉ Reply-To không hợp lệ', 400);
    }

    const emailMode = payload.emailMode || (payload.email ? 'smtp' : 'platform');
    const platformDomain = process.env.DEFAULT_FROM_DOMAIN || 'digiso.vn';
    const useSmtp = emailMode === 'smtp';

    // Validate and sanitize platform prefix for platform mode
    const platformPrefix = useSmtp ? null : (() => {
      const prefix = String(payload.platformPrefix || 'no-reply').trim().toLowerCase();
      if (!prefix) throw createServiceError('Email prefix là bắt buộc', 400);
      if (!/^[a-zA-Z0-9._-]+$/.test(prefix)) {
        throw createServiceError('Email prefix chỉ được chứa chữ, số, dấu chấm, gạch dưới và gạch ngang', 400);
      }
      if (prefix.length > 50) {
        throw createServiceError('Email prefix tối đa 50 ký tự', 400);
      }
      return prefix;
    })();

    const fromEmail =
      emailMode === 'platform'
        ? `${platformPrefix}@${platformDomain}`
        : replyTo;

    const smtpHost = payload.smtpHost?.trim() || this.DEFAULT_SMTP.host;
    const smtpPort = payload.smtpPort || this.DEFAULT_SMTP.port;
    const smtpUsername = payload.smtpUsername?.trim() || this.DEFAULT_SMTP.username;
    const smtpPassword = payload.smtpPassword?.trim() || this.DEFAULT_SMTP.password;
    const useTls = payload.useTls !== undefined ? payload.useTls : this.DEFAULT_SMTP.useTls;

    const brandDomain = fromEmail.split('@')[1]?.toLowerCase() || null;

    const item = await emailSettingsRepository.create(userId, {
      name: payload.name,
      email: fromEmail,
      replyTo,
      platformPrefix,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      useTls,
      dailyLimit: payload.dailyLimit ?? 1000,
      hourlyLimit: payload.hourlyLimit ?? 100,
      emailMode,
      brandDomain,
      isVerified: useSmtp ? true : true, // platform and smtp both verified, only custom_domain needs DNS verification
    });

    return this.mapMutationResult(item);
  }

  async update({ userId, roleCode, id, payload }) {
    const current = await emailSettingsRepository.getById(userId, id, { roleCode });
    if (!current) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }

    const name = payload.name?.trim() || current.name;
    const replyTo = payload.replyTo?.trim() || current.reply_to || current.email;

    if (!name) {
      throw createServiceError('Tên người gửi là bắt buộc', 400);
    }
    if (!replyTo) {
      throw createServiceError('Email Reply-To là bắt buộc', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(replyTo)) {
      throw createServiceError('Địa chỉ Reply-To không hợp lệ', 400);
    }

    const emailMode = payload.emailMode || current.email_mode || 'platform';
    const platformDomain = process.env.DEFAULT_FROM_DOMAIN || 'digiso.vn';
    const useSmtp = emailMode === 'smtp';

    // Validate and sanitize platform prefix for platform mode
    const platformPrefix = useSmtp ? null : (() => {
      const prefix = String(payload.platformPrefix || current.platform_prefix || 'no-reply').trim().toLowerCase();
      if (!prefix) throw createServiceError('Email prefix là bắt buộc', 400);
      if (!/^[a-zA-Z0-9._-]+$/.test(prefix)) {
        throw createServiceError('Email prefix chỉ được chứa chữ, số, dấu chấm, gạch dưới và gạch ngang', 400);
      }
      if (prefix.length > 50) {
        throw createServiceError('Email prefix tối đa 50 ký tự', 400);
      }
      return prefix;
    })();

    const email =
      emailMode === 'platform'
        ? `${platformPrefix}@${platformDomain}`
        : replyTo;

    const brandDomain = email.split('@')[1]?.toLowerCase() || null;

    const item = await emailSettingsRepository.update(userId, id, {
      name,
      replyTo,
      email,
      platformPrefix,
      emailMode,
      smtpHost: payload.smtpHost,
      smtpPort: payload.smtpPort,
      smtpUsername: payload.smtpUsername,
      smtpPassword: payload.smtpPassword,
      useTls: payload.useTls,
      status: payload.status,
      brandDomain,
      isVerified: useSmtp ? true : true, // platform and smtp both verified
    }, { roleCode });
    return this.mapMutationResult(item);
  }

  /**
   * Get domain verification status for an email setting.
   */
  async getDomainVerificationStatus({ userId, roleCode, id }) {
    const item = await emailSettingsRepository.getDomainVerificationStatus(userId, id, { roleCode });
    if (!item) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }
    return {
      brandDomain: item.brand_domain,
      status: item.domain_verification_status,
      dnsRecords: item.domain_dns_records,
      verifiedAt: item.domain_verified_at,
    };
  }

  /**
   * Update domain verification status (called after DNS records are set up or verified).
   */
  async updateDomainVerificationStatus({ userId, roleCode, id, payload }) {
    const current = await emailSettingsRepository.getById(userId, id, { roleCode });
    if (!current) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }
    const item = await emailSettingsRepository.updateDomainVerification(id, payload);
    return item;
  }

  async delete({ userId, roleCode, id }) {
    const deleted = await emailSettingsRepository.delete(userId, id, { roleCode });
    if (!deleted) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }
    return true;
  }

  async getActiveSettings({ userId, roleCode }) {
    const rows = await emailSettingsRepository.getActiveByUser(userId, { roleCode });
    return rows.map((item) => this.mapActiveItem(item));
  }
}

export default new EmailSettingsCrudService();
