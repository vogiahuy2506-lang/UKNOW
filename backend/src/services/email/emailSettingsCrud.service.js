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
      smtpHost: item.smtp_host,
      smtpPort: item.smtp_port,
      useTls: item.use_tls,
      dailyLimit: item.daily_limit,
      hourlyLimit: item.hourly_limit,
      dailySentCount: item.daily_sent_count,
      totalSentCount: item.total_sent_count,
      isVerified: item.is_verified,
      status: item.status,
      creatorName: item.creator_name || null,
      createdBy: item.creator_name ? { name: item.creator_name } : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  mapDetail(item) {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
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
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  mapMutationResult(item) {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      smtpHost: item.smtp_host,
      smtpPort: item.smtp_port,
      useTls: item.use_tls,
      dailyLimit: item.daily_limit,
      hourlyLimit: item.hourly_limit,
      isVerified: item.is_verified,
      status: item.status,
    };
  }

  mapActiveItem(item) {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      smtpHost: item.smtp_host,
      smtpPort: item.smtp_port,
      isVerified: item.is_verified,
      status: item.status,
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

    // Validate email format (any domain allowed)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      throw createServiceError('Địa chỉ email không hợp lệ', 400);
    }

    // Nếu có SMTP settings từ form, dùng chúng; nếu không, dùng default SendGrid
    const smtpHost = payload.smtpHost?.trim() || this.DEFAULT_SMTP.host;
    const smtpPort = payload.smtpPort || this.DEFAULT_SMTP.port;
    const smtpUsername = payload.smtpUsername?.trim() || this.DEFAULT_SMTP.username;
    const smtpPassword = payload.smtpPassword?.trim() || this.DEFAULT_SMTP.password;
    const useTls = payload.useTls !== undefined ? payload.useTls : this.DEFAULT_SMTP.useTls;

    const item = await emailSettingsRepository.create(userId, {
      name: payload.name,
      email: payload.email,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      useTls,
      dailyLimit: payload.dailyLimit ?? 1000,
      hourlyLimit: payload.hourlyLimit ?? 100,
    });

    return this.mapMutationResult(item);
  }

  async update({ userId, roleCode, id, payload }) {
    const current = await emailSettingsRepository.getById(userId, id, { roleCode });
    if (!current) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }

    const item = await emailSettingsRepository.update(userId, id, payload, { roleCode });
    return this.mapMutationResult(item);
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
