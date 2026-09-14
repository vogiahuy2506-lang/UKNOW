import crypto from 'crypto';
import db from '../config/database.js';
import formRepository, {
  MAX_FORM_RESPONDENT_EMAILS_PER_24H,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H,
} from '../repositories/form.repository.js';
import {
  normalizeFormFields,
  normalizeFormSettings,
  normalizeBookingConfig,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from '../utils/formDefinition.util.js';
import { validateFormSubmission } from '../utils/formSubmission.util.js';
import {
  todayVn,
  toAppointmentAt,
  validateSlot,
  listSlotCandidates,
  formatAppointmentVn,
} from '../utils/formBooking.util.js';
import { sendSystemEmail, SENDER_NAME } from '../utils/systemEmail.util.js';
import { logError } from '../utils/logger.util.js';
import { escapeHtml } from '../utils/htmlEscape.util.js';
import { mapFormSubmissionToCampaignItem } from '../utils/formCampaignItem.util.js';
import { clampLandingLeadsLimit } from '../utils/landingLeadsLimit.util.js';

const MAX_SLOTS_DAYS_PARAM = 31;
const DEFAULT_SLOTS_DAYS_PARAM = 7;

function createHttpError(message, statusCode = 400, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function isValidDateParam(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
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
  async createForm({ workspaceOwnerId, createdByUserId, title, description, fields, settings, bookingConfig }) {
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
    const safeBookingConfig = normalizeBookingConfig(bookingConfig);

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
      bookingConfig: safeBookingConfig,
    });
  }

  /**
   * Cập nhật biểu mẫu.
   * Nhận title, description, fields, settings, bookingConfig (PR-2a).
   * Vẫn bỏ qua hoàn toàn payment_config, theme, admin_disabled_at (PR-3/PR-4).
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

    if (payload.bookingConfig !== undefined) {
      updateData.bookingConfig = normalizeBookingConfig(payload.bookingConfig);
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
   * Lấy danh sách bài nộp của biểu mẫu có phân trang. `date` (YYYY-MM-DD, PR-2a việc 6a) lọc
   * theo lịch hẹn rơi vào ngày đó tính theo giờ Việt Nam.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {{ page?: number, pageSize?: number, date?: string|null }} pagination
   * @returns {Promise<object>}
   */
  async getSubmissions(id, workspaceOwnerId, pagination = {}) {
    const existing = await formRepository.findFormByIdAndOwner(id, workspaceOwnerId);
    if (!existing) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    // getVietnamDayRange (gọi trong repository) không tự kiểm định dạng — chuỗi rác như "abc" âm
    // thầm biến thành "hôm nay", "2026-02-31" âm thầm biến thành 03/03. Kiểm khứ hồi TRƯỚC khi gọi
    // (PR-2a review 14/09).
    const { date } = pagination;
    if (date !== undefined && date !== null && date !== '' && !isValidDateParam(date)) {
      throw createHttpError('Tham số date không hợp lệ (định dạng YYYY-MM-DD)', 400, 'INVALID_DATE');
    }

    return formRepository.listSubmissionsByForm(id, workspaceOwnerId, pagination);
  }

  /**
   * Huỷ một lượt đặt lịch/nộp bài (PR-2a việc 6b). Chỉ cho phép từ submitted/confirmed.
   * Bài không thuộc form này (kể cả form khác cùng chủ) hoặc form của chủ khác -> 404.
   *
   * Điều kiện trạng thái nguồn nằm NGAY TRONG câu UPDATE (nguyên tử) — PR-2a review 14/09: đọc
   * trạng thái rồi mới UPDATE riêng (không điều kiện) để hai request huỷ CÙNG một lượt đồng thời
   * có thể cả hai đều đọc thấy 'confirmed' trước khi cái nào update xong, khiến cả hai "thắng".
   * Postgres tự khoá theo dòng khi hai UPDATE cùng where id — request thứ hai chỉ thấy status đã
   * đổi SAU khi request đầu commit, nên chỉ đúng 1 trong 2 khớp điều kiện.
   *
   * @param {number} formId
   * @param {number} submissionId
   * @param {number} workspaceOwnerId
   * @returns {Promise<object>}
   */
  async cancelSubmission(formId, submissionId, workspaceOwnerId) {
    const form = await formRepository.findFormByIdAndOwner(formId, workspaceOwnerId);
    if (!form) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    const updated = await formRepository.updateSubmissionStatus(
      submissionId,
      formId,
      workspaceOwnerId,
      'cancelled',
      ['submitted', 'confirmed']
    );
    if (updated) {
      return updated;
    }

    // 0 dòng khớp — đọc lại để phân biệt 404 (không tồn tại/không thuộc form|chủ này) hay 409
    // (tồn tại nhưng status hiện tại không cho huỷ, kể cả vừa bị huỷ bởi request đồng thời khác).
    const existing = await formRepository.findSubmissionByIdAndForm(submissionId, formId, workspaceOwnerId);
    if (!existing) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }
    if (existing.status === 'cancelled') {
      throw createHttpError('Bài nộp này đã bị huỷ trước đó', 409, 'SUBMISSION_ALREADY_CANCELLED');
    }
    throw createHttpError('Không thể huỷ bài nộp ở trạng thái này', 409, 'SUBMISSION_CANCEL_NOT_ALLOWED');
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
      booking: form.bookingConfig?.enabled
        ? { enabled: true, daysAhead: form.bookingConfig.daysAhead }
        : null,
    };
  }

  /**
   * Danh sách khung giờ còn/đã hết chỗ trong `days` ngày kể từ `from` (mặc định hôm nay giờ VN),
   * cắt theo daysAhead của form. Đếm chỗ bằng MỘT truy vấn gom nhóm (repository), không phải một
   * truy vấn mỗi khung.
   *
   * @param {string} publicKey
   * @param {{ from?: string, days?: number|string }} params
   * @returns {Promise<{ slots: Array<{date: string, time: string, remaining: number|null}> }>}
   */
  async getPublicSlots(publicKey, { from, days } = {}) {
    const key = String(publicKey || '').trim();
    if (!key) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    const form = await formRepository.findFormByPublicKey(key);
    if (!form || !form.isPublished || form.adminDisabledAt) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }
    this.checkOwnerActivePlan(form);

    const bookingConfig = form.bookingConfig;
    if (!bookingConfig?.enabled) {
      throw createHttpError('Biểu mẫu này không bật đặt lịch hẹn', 400, 'BOOKING_NOT_ENABLED');
    }

    const now = new Date();
    const fromDate = isValidDateParam(from) ? from : todayVn(now);
    let daysNum = Number.parseInt(days, 10);
    if (!Number.isFinite(daysNum) || daysNum < 1) daysNum = DEFAULT_SLOTS_DAYS_PARAM;
    daysNum = Math.min(daysNum, MAX_SLOTS_DAYS_PARAM);

    const candidates = listSlotCandidates(bookingConfig, fromDate, daysNum, now);
    if (!candidates.length) {
      return { slots: [] };
    }

    const isoTimes = candidates
      .map((c) => toAppointmentAt(c.date, c.time).toISOString())
      .sort();
    const minIso = isoTimes[0];
    // Chặn trên KHÔNG bao gồm (điều kiện `<`) nên cộng thêm 1ms sau khung muộn nhất.
    const endIso = new Date(new Date(isoTimes[isoTimes.length - 1]).getTime() + 1).toISOString();

    const occupiedRows = await formRepository.listOccupiedCountsInRange(form.id, minIso, endIso);
    const occupiedMap = new Map(
      occupiedRows.map((row) => [new Date(row.appointmentAt).toISOString(), row.occupied])
    );

    const slotCapacity = bookingConfig.slotCapacity;
    const slots = candidates.map((c) => {
      const iso = toAppointmentAt(c.date, c.time).toISOString();
      const occupied = occupiedMap.get(iso) || 0;
      const remaining = slotCapacity === null ? null : Math.max(0, slotCapacity - occupied);
      return { date: c.date, time: c.time, remaining };
    });

    return { slots };
  }

  /**
   * Nộp biểu mẫu từ trang công khai. Có đặt lịch (PR-2a) thì tạo bài nộp trong MỘT giao dịch:
   * BEGIN → khoá tư vấn theo khung giờ (§4.3) → đếm chỗ đang chiếm → đủ chỗ thì INSERT, hết chỗ
   * thì 409 → COMMIT/ROLLBACK. Không đặt lịch thì giữ nguyên đường cũ (không giao dịch, không cần
   * khoá vì không có gì để tranh chấp).
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

    const bookingConfig = form.bookingConfig;
    const bookingEnabled = Boolean(bookingConfig?.enabled);
    let appointmentAt = null;
    let status = 'submitted';

    if (bookingEnabled) {
      const { appointmentDate, appointmentTime } = body || {};
      if (!appointmentDate || !appointmentTime) {
        throw createHttpError('Vui lòng chọn ngày và giờ hẹn', 400, 'MISSING_APPOINTMENT');
      }
      // validateSlot ném lỗi .statusCode=400 sẵn (formBooking.util.js) — để nguyên bay lên.
      const slotResult = validateSlot(bookingConfig, String(appointmentDate), String(appointmentTime), new Date());
      appointmentAt = slotResult.appointmentAt;
      // PR-2a: đặt lịch mà form CHƯA thu tiền (payment_config chưa làm ở PR-3) → confirmed ngay.
      status = 'confirmed';
    }

    // Sinh access_token và lưu bài nộp vào database (PR-1a để submitter_ip_hash NULL)
    const accessToken = crypto.randomBytes(32).toString('hex');

    let submission;
    if (bookingEnabled) {
      const appointmentAtIso = appointmentAt.toISOString();
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await formRepository.acquireFormSlotLock(client, form.id, appointmentAtIso);
        const occupied = await formRepository.countOccupiedForAppointment(form.id, appointmentAtIso, client);
        const capacity = bookingConfig.slotCapacity;
        if (capacity !== null && occupied >= capacity) {
          throw createHttpError('Khung giờ này vừa hết chỗ, vui lòng chọn khung khác', 409, 'FORM_SLOT_FULL');
        }
        submission = await formRepository.createSubmission({
          formId: form.id,
          workspaceOwnerId: form.workspaceOwnerId,
          accessToken,
          answers: validated.answers,
          respondentName: validated.respondentName,
          respondentEmail: validated.respondentEmail,
          respondentPhone: validated.respondentPhone,
          marketingConsent: validated.marketingConsent,
          status,
          appointmentAt,
          submitterIpHash: null,
        }, client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      submission = await formRepository.createSubmission({
        formId: form.id,
        workspaceOwnerId: form.workspaceOwnerId,
        accessToken,
        answers: validated.answers,
        respondentName: validated.respondentName,
        respondentEmail: validated.respondentEmail,
        respondentPhone: validated.respondentPhone,
        marketingConsent: validated.marketingConsent,
        status,
        submitterIpHash: null,
      });
    }

    // Thư báo cho chủ form nếu settings.notifyOwner được bật (fire-and-forget, không để người điền chờ)
    if (form.settings?.notifyOwner && form.ownerEmail) {
      const subject = `[${SENDER_NAME}] Bài nộp mới cho biểu mẫu: ${form.title}`;
      const html = `
        <h2>Có bài nộp mới</h2>
        <p>Biểu mẫu: <strong>${escapeHtml(form.title)}</strong></p>
        <p>Họ tên: ${escapeHtml(validated.respondentName || 'Chưa cung cấp')}</p>
        <p>Email: ${escapeHtml(validated.respondentEmail || 'Chưa cung cấp')}</p>
        <p>Số điện thoại: ${escapeHtml(validated.respondentPhone || 'Chưa cung cấp')}</p>
        ${appointmentAt ? `<p>Giờ hẹn: <strong>${escapeHtml(formatAppointmentVn(appointmentAt))}</strong></p>` : ''}
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

    // Thư xác nhận lịch hẹn cho người đặt (PR-2a việc 4) — chỉ khi có đặt lịch, có email, và
    // form bật settings.sendConfirmation (dùng CHUNG công tắc với thư xác nhận thường — tự chọn,
    // ghi trong báo cáo). Gửi sau khi đã COMMIT; chỉ ghi confirmation_sent_at khi gửi THÀNH CÔNG.
    //
    // Trần thư gửi người đặt (PLAN...#Trần thư gửi người đặt, bổ sung sau review PR-2a 14/09):
    // lịch vẫn đặt được (201) dù vượt trần — chỉ bỏ gửi thư. Vượt trần thì logError CHỈ kèm form
    // id, không ghi địa chỉ email ra log.
    if (bookingEnabled && validated.respondentEmail && form.settings?.sendConfirmation) {
      const formEmailCount = await formRepository.countFormRespondentEmailsLast24h(form.id);
      const recipientEmailCount = formEmailCount < MAX_FORM_RESPONDENT_EMAILS_PER_24H
        ? await formRepository.countConfirmationEmailsForRecipientLast24h(validated.respondentEmail)
        : 0;

      if (formEmailCount >= MAX_FORM_RESPONDENT_EMAILS_PER_24H) {
        logError(`[FormService] Bỏ gửi thư xác nhận cho form ${form.id} — đã vượt trần ${MAX_FORM_RESPONDENT_EMAILS_PER_24H} thư/24h`);
      } else if (recipientEmailCount >= MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H) {
        logError(`[FormService] Bỏ gửi thư xác nhận cho form ${form.id} — người nhận đã vượt trần ${MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H} thư xác nhận/24h`);
      } else {
        const subject = `[${SENDER_NAME}] Xác nhận lịch hẹn - ${form.title}`;
        const html = `
          <h2>Đã xác nhận lịch hẹn của bạn</h2>
          <p>Biểu mẫu: <strong>${escapeHtml(form.title)}</strong></p>
          <p>Giờ hẹn: <strong>${escapeHtml(formatAppointmentVn(appointmentAt))}</strong></p>
        `;

        void sendSystemEmail({
          to: validated.respondentEmail,
          subject,
          html,
        }).then(() => formRepository.markConfirmationSent(submission.id))
          .catch((emailErr) => {
            logError(`[FormService] Gửi thư xác nhận lịch hẹn thất bại cho submission ${submission.id}: ${emailErr.message}`);
          });
      }
    }

    return { accessToken: submission.accessToken, isBotTrap: false };
  }

  /**
   * Tìm form theo id + chủ workspace, ném lỗi rõ ràng (404) nếu không có — dùng CHUNG cho node
   * chiến dịch "Lấy dữ liệu từ biểu mẫu" (PR-6a) và API preview của nó, để cả hai đường đều báo
   * lỗi giống nhau khi form đã bị xoá / không thuộc workspace, thay vì trả rỗng lặng lẽ.
   *
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @returns {Promise<object>}
   */
  async getOwnedFormOrThrow(formId, workspaceOwnerId) {
    const form = await formRepository.findFormByIdAndOwner(formId, workspaceOwnerId);
    if (!form) {
      throw createHttpError(
        'Biểu mẫu đã bị xoá hoặc không thuộc quyền quản lý của bạn',
        404,
        'FORM_NOT_FOUND'
      );
    }
    return form;
  }

  /**
   * Dữ liệu cho node chiến dịch "Lấy dữ liệu từ biểu mẫu" (PR-6a): bài nộp đã đồng ý nhận tin,
   * chưa huỷ, ánh xạ thành item phẳng theo `fieldMap`/field.key (formCampaignItem.util.js).
   * `workspaceOwnerId` LUÔN là chủ workspace (kể cả chiến dịch do nhân viên tạo/chạy — xem
   * campaign.controller.js executionUserId = campaign_owner_id || workspaceContext.workspaceOwnerId),
   * KHÔNG phải người tạo chiến dịch, đúng cách `read_landing_leads` đã dùng `userId`.
   *
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {{ fieldMap?: object, limit?: number|string }} [options]
   * @returns {Promise<{ items: Array<object>, form: object }>}
   */
  async getCampaignDataForForm(formId, workspaceOwnerId, { fieldMap = {}, limit } = {}) {
    const form = await this.getOwnedFormOrThrow(formId, workspaceOwnerId);
    const safeLimit = clampLandingLeadsLimit(limit, 1000);
    const rows = await formRepository.listConsentedSubmissionsForCampaign(form.id, workspaceOwnerId, safeLimit);
    const items = rows.map((row) => mapFormSubmissionToCampaignItem(row, form.fields, fieldMap));
    return { items, form };
  }

  /**
   * Preview bài nộp cho khung cấu hình node (PR-6b dùng) — mô phỏng lead.controller.js
   * preview (`:68-90`): `{ items, columns, pagination: { total, limit, fetched } }`.
   * `columns` lấy từ `fields` HIỆN TẠI của form (không phải fieldMap) để PR-6b hiện nhãn cho
   * người dùng chọn ánh xạ.
   *
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {{ limit?: number|string }} [options]
   * @returns {Promise<{ items: Array<object>, columns: Array<object>, pagination: object }>}
   */
  async getCampaignPreviewForForm(formId, workspaceOwnerId, { limit } = {}) {
    const form = await this.getOwnedFormOrThrow(formId, workspaceOwnerId);
    const safeLimit = clampLandingLeadsLimit(limit, 1000);

    const [rows, total] = await Promise.all([
      formRepository.listConsentedSubmissionsForCampaign(form.id, workspaceOwnerId, safeLimit),
      formRepository.countConsentedSubmissionsForCampaign(form.id, workspaceOwnerId),
    ]);

    const items = rows.map((row) => mapFormSubmissionToCampaignItem(row, form.fields, {}));
    const columns = (Array.isArray(form.fields) ? form.fields : []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
    }));

    return {
      items,
      columns,
      pagination: {
        total,
        limit: safeLimit,
        fetched: items.length,
      },
    };
  }
}

export default new FormService();
