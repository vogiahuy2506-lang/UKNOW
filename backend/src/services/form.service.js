import crypto from 'crypto';
import formRepository from '../repositories/form.repository.js';
import {
  normalizeFormFields,
  normalizeFormSettings,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from '../utils/formDefinition.util.js';
import { validateFormSubmission } from '../utils/formSubmission.util.js';
import { sendSystemEmail, SENDER_NAME } from '../utils/systemEmail.util.js';
import { logError } from '../utils/logger.util.js';
import { escapeHtml } from '../utils/htmlEscape.util.js';

function createHttpError(message, statusCode = 400, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

class FormService {
  /**
   * Kiểm tra điều kiện gói dịch vụ của chủ workspace đối với form public.
   * Cùng quy tắc với requireActivePlan trong authorization.middleware.js:
   * - Chưa đăng ký gói / không có active_plan_id -> 503
   * - Đã hết hạn subscription_expires_at + grace_period_days -> 503
   *
   * @param {object} form
   */
  checkOwnerActivePlan(form) {
    const planId = form?.ownerActivePlanId;
    if (!planId) {
      throw createHttpError('Form tạm ngưng hoạt động', 503, 'FORM_OWNER_PLAN_INACTIVE');
    }

    const expiryRaw = form?.ownerSubscriptionExpiresAt;
    if (expiryRaw) {
      const expiresAt = new Date(expiryRaw);
      if (!Number.isNaN(expiresAt.getTime())) {
        const graceDays = Number(form?.ownerGracePeriodDays) || 0;
        const graceUntil = new Date(expiresAt);
        graceUntil.setUTCDate(graceUntil.getUTCDate() + graceDays);
        if (Date.now() > graceUntil.getTime()) {
          throw createHttpError('Form tạm ngưng hoạt động', 503, 'FORM_OWNER_PLAN_EXPIRED');
        }
      }
    }
  }

  /**
   * Lấy danh sách biểu mẫu của workspace owner.
   *
   * @param {number} workspaceOwnerId
   * @returns {Promise<Array<object>>}
   */
  async listForms(workspaceOwnerId) {
    return formRepository.listFormsByOwner(workspaceOwnerId);
  }

  /**
   * Lấy chi tiết một biểu mẫu theo ID và workspace owner.
   * Nếu không tìm thấy hoặc thuộc về owner khác -> 404 (không dùng 403).
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @returns {Promise<object>}
   */
  async getForm(id, workspaceOwnerId) {
    const form = await formRepository.findFormByIdAndOwner(id, workspaceOwnerId);
    if (!form) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }
    return form;
  }

  /**
   * Tạo biểu mẫu mới.
   *
   * @param {object} params
   * @returns {Promise<object>}
   */
  async createForm({ workspaceOwnerId, createdByUserId, title, description, fields, settings }) {
    const trimmedTitle = String(title || '').trim();
    if (!trimmedTitle) {
      throw createHttpError('Tiêu đề biểu mẫu không được để trống', 400, 'INVALID_FORM_TITLE');
    }
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      throw createHttpError(`Tiêu đề biểu mẫu không được vượt quá ${MAX_TITLE_LENGTH} ký tự`, 400, 'INVALID_FORM_TITLE');
    }

    let trimmedDesc = null;
    if (description !== undefined && description !== null) {
      trimmedDesc = String(description).trim();
      if (trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
        throw createHttpError(`Mô tả biểu mẫu không được vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự`, 400, 'INVALID_FORM_DESCRIPTION');
      }
    }

    const normalizedFields = normalizeFormFields(fields || []);
    const safeSettings = normalizeFormSettings(settings);

    // 12 bytes ngẫu nhiên -> 16 ký tự base64url
    const publicKey = crypto.randomBytes(12).toString('base64url');

    return formRepository.createForm({
      workspaceOwnerId,
      createdByUserId,
      publicKey,
      title: trimmedTitle,
      description: trimmedDesc,
      fields: normalizedFields,
      settings: safeSettings,
    });
  }

  /**
   * Cập nhật biểu mẫu.
   * CHỈ nhận title, description, fields, settings.
   * Các trường booking_config, payment_config, theme, admin_disabled_at hoàn toàn bị bỏ qua.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async updateForm(id, workspaceOwnerId, payload = {}) {
    const existing = await formRepository.findFormByIdAndOwner(id, workspaceOwnerId);
    if (!existing) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    const updateData = {};

    if (payload.title !== undefined) {
      const trimmedTitle = String(payload.title || '').trim();
      if (!trimmedTitle) {
        throw createHttpError('Tiêu đề biểu mẫu không được để trống', 400, 'INVALID_FORM_TITLE');
      }
      if (trimmedTitle.length > MAX_TITLE_LENGTH) {
        throw createHttpError(`Tiêu đề biểu mẫu không được vượt quá ${MAX_TITLE_LENGTH} ký tự`, 400, 'INVALID_FORM_TITLE');
      }
      updateData.title = trimmedTitle;
    }

    if (payload.description !== undefined) {
      if (payload.description !== null) {
        const trimmedDesc = String(payload.description).trim();
        if (trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
          throw createHttpError(`Mô tả biểu mẫu không được vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự`, 400, 'INVALID_FORM_DESCRIPTION');
        }
        updateData.description = trimmedDesc;
      } else {
        updateData.description = null;
      }
    }

    if (payload.fields !== undefined) {
      updateData.fields = normalizeFormFields(payload.fields);
    }

    if (payload.settings !== undefined) {
      updateData.settings = normalizeFormSettings(payload.settings);
    }

    return formRepository.updateForm(id, workspaceOwnerId, updateData);
  }

  /**
   * Bật/tắt trạng thái xuất bản của biểu mẫu.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {boolean} isPublished
   * @returns {Promise<object>}
   */
  async publishForm(id, workspaceOwnerId, isPublished) {
    const existing = await formRepository.findFormByIdAndOwner(id, workspaceOwnerId);
    if (!existing) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    return formRepository.updateFormPublish(id, workspaceOwnerId, isPublished);
  }

  /**
   * Xóa biểu mẫu.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @returns {Promise<void>}
   */
  async deleteForm(id, workspaceOwnerId) {
    const existing = await formRepository.findFormByIdAndOwner(id, workspaceOwnerId);
    if (!existing) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    await formRepository.deleteForm(id, workspaceOwnerId);
  }

  /**
   * Lấy danh sách bài nộp của biểu mẫu có phân trang.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {{ page?: number, pageSize?: number }} pagination
   * @returns {Promise<object>}
   */
  async getSubmissions(id, workspaceOwnerId, pagination) {
    const existing = await formRepository.findFormByIdAndOwner(id, workspaceOwnerId);
    if (!existing) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    return formRepository.listSubmissionsByForm(id, workspaceOwnerId, pagination);
  }

  /**
   * Lấy thông tin công khai của biểu mẫu cho người điền qua public_key.
   * Chỉ form is_published=true, admin_disabled_at IS NULL, và chủ còn hạn gói.
   * Không trả id, email, SĐT của chủ.
   *
   * @param {string} publicKey
   * @returns {Promise<object>}
   */
  async getPublicForm(publicKey) {
    const key = String(publicKey || '').trim();
    if (!key) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    const form = await formRepository.findFormByPublicKey(key);
    if (!form || !form.isPublished || form.adminDisabledAt) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    // Kiểm tra gói dịch vụ của chủ form
    this.checkOwnerActivePlan(form);

    // Trả về payload an toàn cho người dùng cuối
    return {
      publicKey: form.publicKey,
      title: form.title,
      description: form.description,
      fields: form.fields,
      theme: form.theme || {},
      settings: {
        consentEnabled: form.settings?.consentEnabled ?? false,
        submitButtonText: form.settings?.submitButtonText || 'Gửi thông tin',
        successMessage: form.settings?.successMessage || 'Cảm ơn bạn đã gửi thông tin!',
        redirectUrl: form.settings?.redirectUrl || null,
      },
    };
  }

  /**
   * Nộp biểu mẫu từ trang công khai.
   *
   * @param {string} publicKey
   * @param {object} body
   * @param {string} clientIp
   * @returns {Promise<{ accessToken: string|null, isBotTrap?: boolean }>}
   */
  async submitPublicForm(publicKey, body = {}, clientIp = '') {
    // Honeypot: trường bẫy bot có giá trị thì trả thành công giả, không lưu
    const honeypot = body?._hp_website;
    if (honeypot && String(honeypot).trim().length > 0) {
      return { accessToken: null, isBotTrap: true };
    }

    const key = String(publicKey || '').trim();
    if (!key) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    const form = await formRepository.findFormByPublicKey(key);
    if (!form || !form.isPublished || form.adminDisabledAt) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    // Kiểm tra gói dịch vụ của chủ form
    this.checkOwnerActivePlan(form);

    // Xác thực câu trả lời
    const validated = validateFormSubmission(form.fields, body.answers, body);

    // Sinh access_token và lưu bài nộp vào database (PR-1a để submitter_ip_hash NULL)
    const accessToken = crypto.randomBytes(32).toString('hex');

    const submission = await formRepository.createSubmission({
      formId: form.id,
      workspaceOwnerId: form.workspaceOwnerId,
      accessToken,
      answers: validated.answers,
      respondentName: validated.respondentName,
      respondentEmail: validated.respondentEmail,
      respondentPhone: validated.respondentPhone,
      marketingConsent: validated.marketingConsent,
      status: 'submitted',
      submitterIpHash: null,
    });

    // Thư báo cho chủ form nếu settings.notifyOwner được bật (fire-and-forget, không để người điền chờ)
    if (form.settings?.notifyOwner && form.ownerEmail) {
      const subject = `[${SENDER_NAME}] Bài nộp mới cho biểu mẫu: ${form.title}`;
      const html = `
        <h2>Có bài nộp mới</h2>
        <p>Biểu mẫu: <strong>${escapeHtml(form.title)}</strong></p>
        <p>Họ tên: ${escapeHtml(validated.respondentName || 'Chưa cung cấp')}</p>
        <p>Email: ${escapeHtml(validated.respondentEmail || 'Chưa cung cấp')}</p>
        <p>Số điện thoại: ${escapeHtml(validated.respondentPhone || 'Chưa cung cấp')}</p>
        <p>Thời gian: ${escapeHtml(new Date().toLocaleString('vi-VN'))}</p>
      `;

      void sendSystemEmail({
        to: form.ownerEmail,
        subject,
        html,
      }).catch((emailErr) => {
        logError(`[FormService] Gửi thư báo chủ form thất bại cho form ${form.id}: ${emailErr.message}`);
      });
    }

    return { accessToken: submission.accessToken, isBotTrap: false };
  }
}

export default new FormService();
