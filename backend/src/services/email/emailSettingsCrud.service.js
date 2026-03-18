import emailSettingsRepository from '../../repositories/email/emailSettings.repository.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';

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
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const { page = 1, limit = 10, status } = req.query;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const result = await emailSettingsRepository.getPagedByUser(userId, {
        page: pageNum,
        limit: limitNum,
        status,
        roleCode,
      });

      res.json({
        success: true,
        data: {
          items: result.rows.map((item) => this.mapListItem(item)),
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: result.total,
            totalPages: Math.ceil(result.total / limitNum),
          },
        },
      });
    } catch (error) {
      console.error('Get email settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  async getById(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const { id } = req.params;
      const item = await emailSettingsRepository.getById(userId, id, { roleCode });
      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cấu hình email',
        });
      }

      res.json({
        success: true,
        data: {
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
        },
      });
    } catch (error) {
      console.error('Get email setting error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  async create(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const {
        name,
        email,
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpPassword,
        useTls = true,
        dailyLimit = 1000,
        hourlyLimit = 100,
      } = req.body;

      const emailAccountLimitCheck = await checkUserResourceLimit({
        userId,
        roleCode,
        resourceKey: 'emailAccounts',
      });
      if (!emailAccountLimitCheck.allowed) {
        return res.status(400).json({
          success: false,
          message: emailAccountLimitCheck.message,
        });
      }

      const item = await emailSettingsRepository.create(userId, {
        name,
        email,
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpPassword,
        useTls,
        dailyLimit,
        hourlyLimit,
      });

      res.status(201).json({
        success: true,
        message: 'Tạo cấu hình email thành công',
        data: {
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
        },
      });
    } catch (error) {
      console.error('Create email setting error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  async update(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const { id } = req.params;
      const current = await emailSettingsRepository.getById(userId, id, { roleCode });
      if (!current) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cấu hình email',
        });
      }

      const item = await emailSettingsRepository.update(userId, id, req.body, { roleCode });
      res.json({
        success: true,
        message: 'Cập nhật cấu hình email thành công',
        data: {
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
        },
      });
    } catch (error) {
      console.error('Update email setting error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  async delete(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const { id } = req.params;
      const deleted = await emailSettingsRepository.delete(userId, id, { roleCode });
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cấu hình email',
        });
      }

      res.json({
        success: true,
        message: 'Xóa cấu hình email thành công',
      });
    } catch (error) {
      console.error('Delete email setting error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  async getActiveSettings(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const rows = await emailSettingsRepository.getActiveByUser(userId, { roleCode });
      res.json({
        success: true,
        data: rows.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
          smtpHost: item.smtp_host,
          smtpPort: item.smtp_port,
          isVerified: item.is_verified,
          status: item.status,
        })),
      });
    } catch (error) {
      console.error('Get active email settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }
}

export default new EmailSettingsCrudService();
