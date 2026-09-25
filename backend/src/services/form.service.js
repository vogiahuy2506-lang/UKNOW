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
  normalizePaymentConfig,
  normalizeFormTheme,
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
import { buildVietQrString, generatePaymentCode } from '../utils/vietQr.util.js';
import { hashSubmitterIp } from '../utils/formIpHash.util.js';
import { VIETQR_BANKS } from '../constants/vietQrBanks.js';
import { sendSystemEmail, SENDER_NAME } from '../utils/systemEmail.util.js';
import { logError } from '../utils/logger.util.js';
import { escapeHtml } from '../utils/htmlEscape.util.js';
import { mapFormSubmissionToCampaignItem } from '../utils/formCampaignItem.util.js';
import { clampLandingLeadsLimit } from '../utils/landingLeadsLimit.util.js';
import { findStorageObjectByKey, activateFormAssetStorageObjects } from '../repositories/storage.repository.js';
import { markDeletedAfterUnlink, registerWrittenStorageObject } from './storage/storageObject.service.js';
import { STORAGE_POOL_TYPES } from '../utils/storageCapacity.util.js';
import { getStorageBackend } from './storage/storageBackend.js';
import { StorageQuotaExceededError } from './storage/storageQuota.service.js';
import { buildFormAssetUrl } from './formAsset.service.js';
import landingPageRepository from '../repositories/landingPage.repository.js';
import { canonicalLandingPageSlug } from '../utils/landingPageSlugCanonical.util.js';
import { buildFormUnsubscribeFooterHtml } from '../utils/formUnsubscribeFooter.util.js';
import { renderLeadUnsubscribeHtml } from '../utils/leadUnsubscribeHtml.util.js';

const MAX_SLOTS_DAYS_PARAM = 31;
const DEFAULT_SLOTS_DAYS_PARAM = 7;
// PR-3a mục 4: "quá 3 lượt giữ chỗ đang chờ cho cùng IP + form thì trả 429".
const MAX_PENDING_HOLDS_PER_IP_PER_FORM = 3;
// payment_code trùng unique index uq_form_submissions_payment_code -> sinh lại, tối đa 5 lần.
const MAX_PAYMENT_CODE_RETRIES = 5;
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024; // 2 MB (PR-5)

/**
 * Kiểm tra magic bytes của ảnh biên lai chuyển khoản (chỉ nhận JPEG, PNG, WebP).
 * Không tin MIME type hay phần mở rộng client gửi lên (PR-5).
 *
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string } | null}
 */
export function detectReceiptImageMagic(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' };
  }
  // WebP: RIFF (0..3) ... WEBP (8..11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }
  return null;
}

/**
 * Dựng mảng options thanh toán và chuỗi QR cho phương thức chính từ snapshot (V6).
 *
 * @param {object} paymentSnapshot
 * @param {number} paymentAmount
 * @param {string} paymentCode
 * @returns {{ options: Array<object>, primaryQrString: string|null }}
 */
export function buildPaymentOptionsAndPrimaryQr(paymentSnapshot, paymentAmount, paymentCode) {
  if (!paymentSnapshot) return { options: [], primaryQrString: null };
  const snapMethods = paymentSnapshot.methods || (paymentSnapshot.method ? [paymentSnapshot.method] : ['bank']);
  const primaryMethod = paymentSnapshot.method || snapMethods[0];

  let primaryQrString = null;
  const options = [];

  for (const m of snapMethods) {
    if (m === 'bank' && paymentSnapshot.bankBin && paymentSnapshot.accountNumber) {
      const bankQr = buildVietQrString({
        bin: paymentSnapshot.bankBin,
        accountNumber: paymentSnapshot.accountNumber,
        amount: paymentAmount,
        memo: paymentCode,
      });
      options.push({
        method: 'bank',
        bankBin: paymentSnapshot.bankBin,
        bankName: paymentSnapshot.bankName || paymentSnapshot.bankBin,
        accountNumber: paymentSnapshot.accountNumber,
        accountName: paymentSnapshot.accountName,
        qrString: bankQr,
      });
      if (primaryMethod === 'bank') {
        primaryQrString = bankQr;
      }
    } else if (m === 'momo') {
      const momoQr = (paymentSnapshot.momoQrBin && paymentSnapshot.momoQrAccount)
        ? buildVietQrString({
            bin: paymentSnapshot.momoQrBin,
            accountNumber: paymentSnapshot.momoQrAccount,
            amount: paymentAmount,
            memo: paymentCode,
          })
        : null;
      options.push({
        method: 'momo',
        momoPhone: paymentSnapshot.momoPhone,
        momoName: paymentSnapshot.momoName,
        qrString: momoQr,
      });
      if (primaryMethod === 'momo') {
        primaryQrString = momoQr;
      }
    }
  }

  return { options, primaryQrString };
}

/**
 * Công tắc tính năng biên lai chuyển khoản (PR-5 V5).
 * Mặc định TẮT trừ khi FORM_PAYMENT_RECEIPT_ENABLED='true'.
 *
 * @returns {boolean}
 */
export function isPaymentReceiptEnabled() {
  return process.env.FORM_PAYMENT_RECEIPT_ENABLED === 'true';
}
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/+$/, '');

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

function isPaymentCodeUniqueViolation(error) {
  return error?.code === '23505' && String(error?.constraint || '').includes('payment_code');
}

/**
 * INSERT bài nộp, sinh lại `payment_code` khi đụng unique index
 * `uq_form_submissions_payment_code` (PR-3a mục 4, tối đa `MAX_PAYMENT_CODE_RETRIES` lần).
 *
 * `inTransaction=true` (đường có đặt lịch, `queryable` là PoolClient đang BEGIN dở) dùng
 * SAVEPOINT cho mỗi lần thử: một INSERT lỗi ràng buộc UNIQUE sẽ làm cả transaction "aborted"
 * (mọi câu lệnh sau đó bị Postgres từ chối tới khi ROLLBACK) trừ khi có savepoint để lùi về —
 * không có bước này thì lần thử thứ 2 trở đi sẽ luôn lỗi "current transaction is aborted".
 * `inTransaction=false` (không đặt lịch, `queryable` là pool `db`) mỗi lần gọi tự auto-commit
 * độc lập nên không cần savepoint.
 *
 * @param {object} baseParams Tham số cho `formRepository.createSubmission`, CHƯA có paymentCode
 * @param {import('pg').PoolClient|typeof db} queryable
 * @param {boolean} needsPaymentCode
 * @param {boolean} inTransaction
 * @returns {Promise<object>}
 */
async function insertSubmissionWithPaymentCodeRetry(baseParams, queryable, needsPaymentCode, inTransaction) {
  if (!needsPaymentCode) {
    return formRepository.createSubmission(baseParams, queryable);
  }

  let lastError;
  for (let attempt = 0; attempt < MAX_PAYMENT_CODE_RETRIES; attempt += 1) {
    const paymentCode = generatePaymentCode();
    if (inTransaction) await queryable.query('SAVEPOINT payment_code_attempt');
    try {
      const submission = await formRepository.createSubmission({ ...baseParams, paymentCode }, queryable);
      if (inTransaction) await queryable.query('RELEASE SAVEPOINT payment_code_attempt');
      return submission;
    } catch (error) {
      if (inTransaction) await queryable.query('ROLLBACK TO SAVEPOINT payment_code_attempt');
      if (!isPaymentCodeUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

// ─── Theme / ảnh biểu mẫu (PR-4a, "Bổ sung 15/09 khi soạn lệnh PR-4") ─────────────────────

/**
 * Lớp kiểm THỨ HAI cho `bannerKey`/`logoKey` — `normalizeFormTheme` (util, thuần) chỉ kiểm định
 * dạng + owner id đúng khớp trong CHÍNH đường dẫn khoá; hàm này query DB để xác nhận khoá có
 * THẬT trong `storage_objects`, đúng `owner_user_id` (nguồn sự thật, phòng khi dữ liệu lệch dù
 * chuỗi khoá trùng khớp), đúng `category='form_asset'`, và còn ở trạng thái dùng được
 * (`temp`/`active` — không phải `deleted`/`cleanup_pending`/`orphaned`).
 *
 * @param {string} key
 * @param {number} workspaceOwnerId
 */
async function assertFormAssetKeyOwned(key, workspaceOwnerId) {
  const record = await findStorageObjectByKey(key);
  if (
    !record
    || Number(record.owner_user_id) !== Number(workspaceOwnerId)
    || record.category !== 'form_asset'
    || !['temp', 'active'].includes(record.state)
  ) {
    throw createHttpError('Ảnh không hợp lệ hoặc không thuộc kho lưu trữ của bạn', 400, 'INVALID_FORM_THEME');
  }
}

/**
 * @param {object} theme Kết quả `normalizeFormTheme` (đã qua lớp kiểm định dạng)
 * @param {number} workspaceOwnerId
 */
async function assertFormThemeAssetKeysOwned(theme, workspaceOwnerId) {
  if (theme.bannerKey) await assertFormAssetKeyOwned(theme.bannerKey, workspaceOwnerId);
  if (theme.logoKey) await assertFormAssetKeyOwned(theme.logoKey, workspaceOwnerId);
}

/**
 * Chiếu `theme` sang dạng AN TOÀN cho API công khai — whitelist thủ công (không spread nguyên
 * object) để KHÔNG BAO GIỜ lộ `bannerKey`/`logoKey` thô (khách ẩn danh không có lý do biết khoá
 * kho nội bộ), chỉ trả `bannerUrl`/`logoUrl` đã tính từ khoá. Dùng cho `getPublicForm` và
 * `getSubmissionStatus` (trang trạng thái công khai — khớp giao diện form gốc).
 *
 * @param {object|null} theme
 * @returns {object}
 */
function buildPublicFormTheme(theme) {
  if (!theme || typeof theme !== 'object') return {};
  const out = {};
  if (theme.preset) out.preset = theme.preset;
  if (theme.primaryColor) out.primaryColor = theme.primaryColor;
  if (theme.backgroundColor) out.backgroundColor = theme.backgroundColor;
  if (theme.fontFamily) out.fontFamily = theme.fontFamily;
  if (theme.layout) out.layout = theme.layout;
  if (theme.bannerHeight) out.bannerHeight = theme.bannerHeight;
  if (theme.bannerKey) out.bannerUrl = buildFormAssetUrl(theme.bannerKey);
  if (theme.logoKey) out.logoUrl = buildFormAssetUrl(theme.logoKey);
  return out;
}

/**
 * Bản CHỦ FORM (private) của phép chiếu theme — GIỮ nguyên `bannerKey`/`logoKey` (trình soạn
 * cần biết khoá hiện tại để biết "đang chọn ảnh nào", không chỉ để hiển thị) và BỔ SUNG
 * `bannerUrl`/`logoUrl` tính sẵn cho tiện xem trước — không sửa `form` gốc (trả object mới).
 *
 * @param {object} form Kết quả từ formRepository (có field `theme`)
 * @returns {object}
 */
function augmentFormThemeWithUrls(form) {
  if (!form) return form;
  const theme = form.theme || {};
  const augmented = { ...theme };
  if (theme.bannerKey) augmented.bannerUrl = buildFormAssetUrl(theme.bannerKey);
  if (theme.logoKey) augmented.logoUrl = buildFormAssetUrl(theme.logoKey);
  return { ...form, theme: augmented };
}

/**
 * PR-4a review 15/09 (Việc 1) — giải phóng MỘT khoá, nhưng CHỈ khi không còn form nào của cùng
 * workspace còn tham chiếu nó (`form.repository.js` `isFormAssetKeyReferenced`). Hai form khác
 * nhau (nhân bản form, hoặc chủ động chọn lại cùng ảnh) có thể trỏ cùng một khoá — đổi/xoá ở MỘT
 * form không được kéo theo giải phóng khoá form KIA còn đang dùng. Gọi SAU KHI form đang xử lý
 * đã ghi/xoá xong ở DB (nên bản thân nó không tự khớp nhầm với khoá cũ của chính mình).
 *
 * Lỗi (cả bước kiểm tham chiếu lẫn bước giải phóng) chỉ LOG, không ném lại — request chính (lưu
 * hoặc xoá form) đã thành công, đừng biến một sự cố dọn dẹp kho thành lỗi 500 cho người dùng.
 *
 * @param {string} key
 * @param {number} workspaceOwnerId
 */
async function releaseFormAssetKeyIfUnreferenced(key, workspaceOwnerId) {
  try {
    const stillReferenced = await formRepository.isFormAssetKeyReferenced(workspaceOwnerId, key);
    if (stillReferenced) return;
    await markDeletedAfterUnlink({ storageKey: key });
  } catch (error) {
    logError(`[FormService] Không giải phóng được ảnh biểu mẫu cũ (${key}):`, error?.message || error);
  }
}

/**
 * Vòng đời khoá kho ảnh SAU KHI đã ghi `forms.theme` thành công (Bổ sung 15/09 mục 3):
 * kích hoạt khoá MỚI (chuyển `active`, `reference_type 'form'`, `reference_id` = id form — mẫu
 * `activateLandingAssetStorageObjects`), giải phóng khoá CŨ không còn dùng
 * (`releaseFormAssetKeyIfUnreferenced`).
 *
 * So sánh theo full-replace: `theme` là đối tượng thay thế toàn bộ mỗi lần được gửi (xem
 * docstring `normalizeFormTheme`), nên "khoá cũ" luôn lấy từ `oldTheme` (trước khi lưu) và
 * "khoá mới" từ `newTheme` (sau khi lưu) — không cần biết payload có đề cập khoá đó hay không.
 *
 * Việc 1 review 15/09 — so khoá theo TẬP HỢP {bannerKey, logoKey}, KHÔNG so từng cặp
 * banner↔banner/logo↔logo: gỡ banner (bannerKey cũ = K) trong khi logoKey CỦA CHÍNH FORM NÀY vẫn
 * đang là K thì K vẫn còn dùng (chỉ đổi vai trò trong theme, không phải bỏ hẳn) — so cặp
 * banner↔banner cũ sẽ giải phóng nhầm K dù logo vẫn cần nó.
 *
 * @param {object} params
 * @param {object|null} params.oldTheme Theme TRƯỚC khi lưu (`null`/`{}` khi tạo form mới)
 * @param {object} params.newTheme Theme SAU khi lưu (đã chuẩn hoá, khớp DB)
 * @param {number} params.workspaceOwnerId
 * @param {number} params.formId
 */
async function syncFormThemeAssetLifecycle({ oldTheme, newTheme, workspaceOwnerId, formId }) {
  const oldBanner = oldTheme?.bannerKey || null;
  const newBanner = newTheme?.bannerKey || null;
  const oldLogo = oldTheme?.logoKey || null;
  const newLogo = newTheme?.logoKey || null;

  const keysToActivate = [];
  if (newBanner && newBanner !== oldBanner) keysToActivate.push(newBanner);
  if (newLogo && newLogo !== oldLogo) keysToActivate.push(newLogo);
  if (keysToActivate.length > 0) {
    await activateFormAssetStorageObjects({
      storageKeys: keysToActivate,
      ownerUserId: workspaceOwnerId,
      formId,
    });
  }

  const newKeySet = new Set([newBanner, newLogo].filter(Boolean));
  const oldKeySet = new Set([oldBanner, oldLogo].filter(Boolean));
  for (const key of oldKeySet) {
    if (newKeySet.has(key)) continue; // vẫn dùng ở slot khác của CHÍNH form này
    await releaseFormAssetKeyIfUnreferenced(key, workspaceOwnerId);
  }
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
    const forms = await formRepository.listFormsByOwner(workspaceOwnerId);
    return forms.map(augmentFormThemeWithUrls);
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
    return augmentFormThemeWithUrls(form);
  }

  /**
   * Tạo biểu mẫu mới.
   *
   * @param {object} params
   * @returns {Promise<object>}
   */
  async createForm({ workspaceOwnerId, createdByUserId, title, description, fields, settings, theme, bookingConfig, paymentConfig, landingPageId = null }) {
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
    const safeTheme = normalizeFormTheme(theme, { workspaceOwnerId });
    await assertFormThemeAssetKeysOwned(safeTheme, workspaceOwnerId);
    const safeBookingConfig = normalizeBookingConfig(bookingConfig);
    const safePaymentConfig = normalizePaymentConfig(paymentConfig);

    // 12 bytes ngẫu nhiên -> 16 ký tự base64url
    const publicKey = crypto.randomBytes(12).toString('base64url');

    const created = await formRepository.createForm({
      workspaceOwnerId,
      createdByUserId,
      publicKey,
      title: trimmedTitle,
      description: trimmedDesc,
      fields: normalizedFields,
      settings: safeSettings,
      theme: safeTheme,
      bookingConfig: safeBookingConfig,
      paymentConfig: safePaymentConfig,
      landingPageId,
    });

    // PR-4a mục 3: kích hoạt khoá ảnh (nếu có) SAU khi đã ghi forms.theme thành công — form mới
    // nên "khoá cũ" luôn rỗng, chỉ có nhánh kích hoạt, không có nhánh giải phóng.
    await syncFormThemeAssetLifecycle({
      oldTheme: null,
      newTheme: safeTheme,
      workspaceOwnerId,
      formId: created.id,
    });

    return augmentFormThemeWithUrls(created);
  }

  /**
   * Cập nhật biểu mẫu.
   * Nhận title, description, fields, settings, bookingConfig (PR-2a), paymentConfig (PR-3a —
   * chốt "chỉ chủ workspace" nằm ở form.controller.js, TRƯỚC khi payload.paymentConfig tới đây).
   * Vẫn bỏ qua hoàn toàn theme, admin_disabled_at (PR-4/PR-3a super admin).
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

    let safeTheme;
    if (payload.theme !== undefined) {
      safeTheme = normalizeFormTheme(payload.theme, { workspaceOwnerId });
      await assertFormThemeAssetKeysOwned(safeTheme, workspaceOwnerId);
      updateData.theme = safeTheme;
    }

    if (payload.bookingConfig !== undefined) {
      updateData.bookingConfig = normalizeBookingConfig(payload.bookingConfig);
    }

    if (payload.paymentConfig !== undefined) {
      updateData.paymentConfig = normalizePaymentConfig(payload.paymentConfig);
    }

    const updated = await formRepository.updateForm(id, workspaceOwnerId, updateData);

    // PR-4a mục 3: chỉ đụng vòng đời ảnh khi theme THỰC SỰ được gửi trong payload này — không
    // gửi theme (payload.theme === undefined) nghĩa là giữ nguyên, không có gì để đổi/giải phóng.
    if (payload.theme !== undefined) {
      await syncFormThemeAssetLifecycle({
        oldTheme: existing.theme,
        newTheme: safeTheme,
        workspaceOwnerId,
        formId: id,
      });
    }

    return augmentFormThemeWithUrls(updated);
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

    const updated = await formRepository.updateFormPublish(id, workspaceOwnerId, isPublished);
    return augmentFormThemeWithUrls(updated);
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

    // PR-4a mục 3 (Việc 1 review 15/09): xoá form -> giải phóng khoá ảnh (nếu có) SAU khi DB đã
    // xoá xong — nhưng CHỈ khoá nào không còn form nào KHÁC của workspace này còn tham chiếu
    // (releaseFormAssetKeyIfUnreferenced). Set khử trùng lặp trường hợp bannerKey === logoKey.
    const keysToRelease = new Set([existing.theme?.bannerKey, existing.theme?.logoKey].filter(Boolean));
    for (const key of keysToRelease) {
      await releaseFormAssetKeyIfUnreferenced(key, workspaceOwnerId);
    }
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
      // PR-3a "Bổ sung 15/09": cho huỷ thêm từ pending_payment (chủ muốn nhả chỗ ngay, không đợi
      // hold_expires_at trôi qua).
      ['submitted', 'confirmed', 'pending_payment']
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
   * Chủ form xác nhận đã nhận tiền cho một bài nộp `pending_payment` (PR-3a mục 5).
   *
   * Bài có `appointment_at` (đặt lịch + thu tiền): BEGIN → khoá tư vấn theo khung giờ (§4.3,
   * CHÍNH khoá đã dùng khi tạo bài nộp) → đếm lại chỗ đang chiếm KHÔNG TÍNH chính bài này → hết
   * chỗ (ai đó khác đã lấy trong lúc chờ) → 409 FORM_SLOT_TAKEN, bài GIỮ NGUYÊN pending_payment;
   * còn chỗ → UPDATE nguyên tử `WHERE status='pending_payment'`.
   * Bài KHÔNG có lịch hẹn: không cần khoá — một UPDATE nguyên tử `WHERE status='pending_payment'`
   * đã đủ atomic ở mức Postgres row-lock cho ca "xác nhận 2 lần đồng thời" (request thứ hai chỉ
   * thấy status mới SAU khi request đầu commit).
   *
   * @param {number} formId
   * @param {number} submissionId
   * @param {number} workspaceOwnerId
   * @param {number} confirmedByUserId
   * @returns {Promise<object>}
   */
  async confirmPayment(formId, submissionId, workspaceOwnerId, confirmedByUserId) {
    const form = await formRepository.findFormByIdAndOwner(formId, workspaceOwnerId);
    if (!form) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    const existing = await formRepository.findSubmissionByIdAndForm(submissionId, formId, workspaceOwnerId);
    if (!existing) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }
    if (existing.status !== 'pending_payment') {
      throw createHttpError('Bài nộp này không ở trạng thái chờ thanh toán', 409, 'SUBMISSION_NOT_PENDING_PAYMENT');
    }

    if (existing.appointmentAt) {
      const appointmentAtIso = new Date(existing.appointmentAt).toISOString();
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await formRepository.acquireFormSlotLock(client, formId, appointmentAtIso);
        const bookingConfig = form.bookingConfig;
        const capacity = bookingConfig?.slotCapacity ?? null;
        if (capacity !== null) {
          const occupied = await formRepository.countOccupiedForAppointmentExcluding(
            formId,
            appointmentAtIso,
            submissionId,
            client
          );
          if (occupied >= capacity) {
            throw createHttpError('Khung giờ này đã hết chỗ, không thể xác nhận', 409, 'FORM_SLOT_TAKEN');
          }
        }
        const confirmed = await formRepository.confirmSubmissionPayment(
          submissionId,
          formId,
          workspaceOwnerId,
          confirmedByUserId,
          client
        );
        if (!confirmed) {
          // Đã đổi trạng thái bởi request khác giữa lúc pre-check và UPDATE (đồng thời).
          throw createHttpError('Bài nộp này không còn ở trạng thái chờ thanh toán', 409, 'SUBMISSION_NOT_PENDING_PAYMENT');
        }
        await client.query('COMMIT');
        this.notifyPaymentConfirmed(form, confirmed);
        return confirmed;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const confirmed = await formRepository.confirmSubmissionPayment(submissionId, formId, workspaceOwnerId, confirmedByUserId);
    if (!confirmed) {
      throw createHttpError('Bài nộp này không còn ở trạng thái chờ thanh toán', 409, 'SUBMISSION_NOT_PENDING_PAYMENT');
    }
    this.notifyPaymentConfirmed(form, confirmed);
    return confirmed;
  }

  /**
   * Thư "đã xác nhận thanh toán" cho người đặt (PR-3a mục 5) — fire-and-forget SAU KHI COMMIT,
   * cùng trần thư/công tắc sendConfirmation với các thư khác của form.
   *
   * @param {object} form
   * @param {object} confirmedSubmission
   */
  async notifyPaymentConfirmed(form, confirmedSubmission) {
    if (!confirmedSubmission.respondentEmail || !form.settings?.sendConfirmation) return;

    // PR-7b — chân thư "Rút lại đồng ý": lấy RIÊNG qua getSubmissionConsentInfo (không nằm trong
    // RETURNING của confirmSubmissionPayment, vốn đi thẳng ra API confirmPayment cho chủ form —
    // xem docstring getSubmissionConsentInfo).
    let footerHtml = '';
    try {
      const consentInfo = await formRepository.getSubmissionConsentInfo(confirmedSubmission.id);
      if (consentInfo) footerHtml = buildFormUnsubscribeFooterHtml(consentInfo);
    } catch (err) {
      logError(`[FormService] Lỗi lấy thông tin đồng ý cho submission ${confirmedSubmission.id}: ${err.message}`);
    }

    const html = `
      <h2>Đã xác nhận thanh toán</h2>
      <p>Biểu mẫu: <strong>${escapeHtml(form.title)}</strong></p>
      ${confirmedSubmission.appointmentAt ? `<p>Giờ hẹn: <strong>${escapeHtml(formatAppointmentVn(new Date(confirmedSubmission.appointmentAt)))}</strong></p>` : ''}
      <p>Mã giao dịch: <strong>${escapeHtml(confirmedSubmission.paymentCode || '')}</strong></p>
      ${footerHtml}
    `;
    void this.sendFormRespondentEmail({
      formId: form.id,
      submissionId: confirmedSubmission.id,
      toEmail: confirmedSubmission.respondentEmail,
      subject: `[${SENDER_NAME}] Đã xác nhận thanh toán - ${form.title}`,
      html,
      logLabel: 'thư xác nhận thanh toán',
    }).catch((err) => {
      logError(`[FormService] Gửi thư xác nhận thanh toán thất bại cho submission ${confirmedSubmission.id}: ${err.message}`);
    });
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
      // PR-4a mục 5: whitelist thủ công + URL tính từ khoá — KHÔNG trả bannerKey/logoKey thô
      // cho khách ẩn danh (buildPublicFormTheme).
      theme: buildPublicFormTheme(form.theme),
      settings: {
        consentEnabled: form.settings?.consentEnabled ?? false,
        submitButtonText: form.settings?.submitButtonText || 'Gửi thông tin',
        successMessage: form.settings?.successMessage || 'Cảm ơn bạn đã gửi thông tin!',
        redirectUrl: form.settings?.redirectUrl || null,
      },
      booking: form.bookingConfig?.enabled
        ? { enabled: true, daysAhead: form.bookingConfig.daysAhead }
        : null,
      // PR-3a mục "Public GET form thêm payment" — KHÔNG trả bankBin/accountNumber/accountName
      // trước khi nộp bài (chỉ biết số tiền + có thu tiền hay không, để hiện UI form đúng).
      payment: form.paymentConfig?.enabled
        ? {
            enabled: true,
            amount: form.paymentConfig.amount,
            method: form.paymentConfig.method || (form.paymentConfig.methods ? form.paymentConfig.methods[0] : 'bank'),
            methods: form.paymentConfig.methods || (form.paymentConfig.method ? [form.paymentConfig.method] : ['bank']),
          }
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
   * Thu tiền (PR-3a) → status='pending_payment' bất kể có đặt lịch hay không (đặt lịch mà CHƯA
   * trả tiền thì lịch chưa thật sự "chốt" — khác PR-2a lúc payment_config chưa tồn tại). Đếm lượt
   * đang chờ thanh toán của CÙNG submitter_ip_hash+form: có đặt lịch thì đếm TRONG CÙNG giao dịch
   * + khoá của luồng đặt lịch (Bổ sung 15/09, không mở khoá riêng); không đặt lịch thì đếm trước
   * khi INSERT (không có gì để khoá).
   *
   * @param {string} publicKey
   * @param {object} body
   * @param {string} ipKey Giá trị IP đã chuẩn hoá theo `clientIpKey` (rateLimiter.middleware.js)
   *   — KHÔNG phải `req.ip` thô, để "cùng IP" ở chốt chống giữ chỗ hàng loạt khớp đúng cách
   *   limiter nhóm IP (đặc biệt IPv6 theo khối).
   * @returns {Promise<{ accessToken: string|null, isBotTrap?: boolean, payment?: object|null }>}
   */
  async submitPublicForm(publicKey, body = {}, ipKey = '') {
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

    // PR-7a — nguồn landing + UTM (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md mục PR-7, "Bổ sung
    // 15/09" mục 2). Khác `lead.service.js` (từ chối khi landing không hợp lệ): bài nộp Biểu mẫu
    // LUÔN được nhận — slug thuộc landing của chủ khác, không tồn tại, chưa xuất bản, hay lỗi tra
    // cứu đều chỉ rơi về `landingPageSlug = null`, không bao giờ làm hỏng bài nộp.
    const rawLandingSlug = canonicalLandingPageSlug(
      body?.landingPageSlug ?? body?.landing_page_slug ?? ''
    );
    let landingPageSlug = null;
    if (rawLandingSlug) {
      try {
        const lp = await landingPageRepository.findPublishedBySlug(rawLandingSlug);
        if (lp && Number(lp.workspaceOwnerId) === Number(form.workspaceOwnerId)) {
          landingPageSlug = rawLandingSlug;
        }
      } catch (lookupErr) {
        logError(`[FormService] Lỗi tra cứu landing page slug "${rawLandingSlug}": ${lookupErr.message}`);
      }
    }
    const trimUtmField = (v) => (v != null ? String(v).trim().slice(0, 255) || null : null);
    const utmSource = trimUtmField(body?.utmSource);
    const utmMedium = trimUtmField(body?.utmMedium);
    const utmCampaign = trimUtmField(body?.utmCampaign);
    const utmContent = trimUtmField(body?.utmContent);
    const utmTerm = trimUtmField(body?.utmTerm);

    // Xác thực câu trả lời
    const validated = validateFormSubmission(form.fields, body.answers, body);

    const bookingConfig = form.bookingConfig;
    const bookingEnabled = Boolean(bookingConfig?.enabled);
    const paymentConfig = form.paymentConfig;
    const paymentEnabled = Boolean(paymentConfig?.enabled);
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
      status = 'confirmed';
    }

    // Chỉ băm/lưu IP khi form thu tiền — đây là chốt CHỐNG GIỮ CHỖ HÀNG LOẠT của PR-3a
    // (§4 mục 4), không phải hành vi chung cho mọi form. Form không thu tiền GIỮ NGUYÊN
    // submitter_ip_hash = NULL như PR-1a (forms.test.js đã khoá hành vi này).
    let submitterIpHash = null;
    let paymentSnapshot = null;
    let holdExpiresAt = null;

    if (paymentEnabled) {
      submitterIpHash = hashSubmitterIp(ipKey);
      status = 'pending_payment';
      holdExpiresAt = new Date(Date.now() + paymentConfig.holdMinutes * 60 * 1000);

      const methods = paymentConfig.methods || (paymentConfig.method ? [paymentConfig.method] : ['bank']);
      const primaryMethod = paymentConfig.method || methods[0];

      paymentSnapshot = {
        methods,
        method: primaryMethod,
        amount: paymentConfig.amount,
      };

      if (methods.includes('bank')) {
        const bankInfo = VIETQR_BANKS[paymentConfig.bankBin] || null;
        paymentSnapshot.bankBin = paymentConfig.bankBin;
        paymentSnapshot.bankName = bankInfo?.name || paymentConfig.bankBin;
        paymentSnapshot.accountNumber = paymentConfig.accountNumber;
        paymentSnapshot.accountName = paymentConfig.accountName;
      }

      if (methods.includes('momo')) {
        paymentSnapshot.momoPhone = paymentConfig.momoPhone;
        paymentSnapshot.momoName = paymentConfig.momoName;
        paymentSnapshot.momoQrMode = paymentConfig.momoQrMode;
        if (paymentConfig.momoQrBin && paymentConfig.momoQrAccount) {
          paymentSnapshot.momoQrBin = paymentConfig.momoQrBin;
          paymentSnapshot.momoQrAccount = paymentConfig.momoQrAccount;
          if (paymentConfig.momoQrRefLabel) {
            paymentSnapshot.momoQrRefLabel = paymentConfig.momoQrRefLabel;
          }
        }
      }

      if (!bookingEnabled) {
        // Không đặt lịch -> không có giao dịch/khoá nào đang mở, đếm trước khi INSERT.
        const pendingCount = await formRepository.countPendingHoldsForIpAndForm(form.id, submitterIpHash);
        if (pendingCount >= MAX_PENDING_HOLDS_PER_IP_PER_FORM) {
          throw createHttpError(
            'Bạn đang có quá nhiều lượt giữ chỗ chưa thanh toán cho biểu mẫu này. Vui lòng hoàn tất hoặc chờ hết hạn giữ chỗ trước khi thử lại.',
            429,
            'FORM_TOO_MANY_PENDING_HOLDS'
          );
        }
      }
    }

    // Sinh access_token và lưu bài nộp vào database
    const accessToken = crypto.randomBytes(32).toString('hex');
    const baseSubmissionParams = {
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
      submitterIpHash,
      paymentAmount: paymentEnabled ? paymentConfig.amount : null,
      paymentSnapshot,
      holdExpiresAt,
      landingPageSlug,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
    };

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
        if (paymentEnabled) {
          // Đếm TRONG CÙNG giao dịch + khoá của luồng đặt lịch (Bổ sung 15/09) — không mở khoá
          // riêng cho chốt IP.
          const pendingCount = await formRepository.countPendingHoldsForIpAndForm(form.id, submitterIpHash, client);
          if (pendingCount >= MAX_PENDING_HOLDS_PER_IP_PER_FORM) {
            throw createHttpError(
              'Bạn đang có quá nhiều lượt giữ chỗ chưa thanh toán cho biểu mẫu này. Vui lòng hoàn tất hoặc chờ hết hạn giữ chỗ trước khi thử lại.',
              429,
              'FORM_TOO_MANY_PENDING_HOLDS'
            );
          }
        }
        submission = await insertSubmissionWithPaymentCodeRetry(baseSubmissionParams, client, paymentEnabled, true);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      submission = await insertSubmissionWithPaymentCodeRetry(baseSubmissionParams, db, paymentEnabled, false);
    }

    let qrString = null;
    let paymentOptions = [];
    if (paymentEnabled && paymentSnapshot) {
      const res = buildPaymentOptionsAndPrimaryQr(
        paymentSnapshot,
        paymentConfig.amount,
        submission.paymentCode
      );
      paymentOptions = res.options;
      qrString = res.primaryQrString;
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
        ${paymentEnabled ? `<p>Trạng thái: <strong>Chờ thanh toán</strong> — mã <strong>${escapeHtml(submission.paymentCode)}</strong>, số tiền <strong>${escapeHtml(paymentConfig.amount.toLocaleString('vi-VN'))}đ</strong></p>` : ''}
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

    // Thư xác nhận lịch hẹn cho người đặt (PR-2a việc 4) — CHỈ khi lịch đã thật sự 'confirmed'
    // (form không thu tiền; nếu có thu tiền thì status là 'pending_payment', đi nhánh thư
    // hướng dẫn chuyển khoản bên dưới, không gửi thư "đã xác nhận" trong khi còn chờ tiền).
    if (bookingEnabled && status === 'confirmed' && validated.respondentEmail && form.settings?.sendConfirmation) {
      await this.sendFormRespondentEmail({
        formId: form.id,
        formTitle: form.title,
        submissionId: submission.id,
        toEmail: validated.respondentEmail,
        subject: `[${SENDER_NAME}] Xác nhận lịch hẹn - ${form.title}`,
        html: `
          <h2>Đã xác nhận lịch hẹn của bạn</h2>
          <p>Biểu mẫu: <strong>${escapeHtml(form.title)}</strong></p>
          <p>Giờ hẹn: <strong>${escapeHtml(formatAppointmentVn(appointmentAt))}</strong></p>
          ${buildFormUnsubscribeFooterHtml({ marketingConsent: validated.marketingConsent, unsubscribeToken: submission.unsubscribeToken })}
        `,
        logLabel: 'thư xác nhận lịch hẹn',
      });
    }

    // Thư hướng dẫn chuyển khoản cho người đặt (PR-3a mục 5) — cùng công tắc/trần thư với thư
    // xác nhận lịch hẹn ở trên (dùng CHUNG bộ đếm — hai nhánh loại trừ nhau vì status chỉ có thể
    // là MỘT trong hai giá trị 'confirmed' xor 'pending_payment' khi bookingEnabled||paymentEnabled).
    if (paymentEnabled && validated.respondentEmail && form.settings?.sendConfirmation) {
      const statusUrl = `${FRONTEND_URL}/f/${encodeURIComponent(key)}/s/${encodeURIComponent(accessToken)}`;
      const holdMinutesText = escapeHtml(String(paymentConfig.holdMinutes));
      const methodsList = paymentSnapshot.methods || [paymentSnapshot.method];
      const hasBothMethods = methodsList.includes('bank') && methodsList.includes('momo');

      let methodsDetailHtml = '';
      if (hasBothMethods) {
        methodsDetailHtml = `
          <div style="margin: 12px 0; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #1e293b;">Cách 1: Chuyển khoản ngân hàng</p>
            <p style="margin: 2px 0;">Ngân hàng: <strong>${escapeHtml(paymentSnapshot.bankName)}</strong></p>
            <p style="margin: 2px 0;">Số tài khoản: <strong>${escapeHtml(paymentSnapshot.accountNumber)}</strong></p>
            <p style="margin: 2px 0;">Chủ tài khoản: <strong>${escapeHtml(paymentSnapshot.accountName)}</strong></p>
          </div>
          <div style="margin: 12px 0; padding: 12px; background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 8px;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #831843;">Cách 2: Chuyển ví MoMo</p>
            <p style="margin: 2px 0;">Ví MoMo: <strong>${escapeHtml(paymentSnapshot.momoPhone)}</strong></p>
            <p style="margin: 2px 0;">Tên: <strong>${escapeHtml(paymentSnapshot.momoName)}</strong></p>
          </div>
        `;
      } else if (paymentSnapshot.method === 'momo') {
        methodsDetailHtml = `
          <p>Ví MoMo: <strong>${escapeHtml(paymentSnapshot.momoPhone)}</strong></p>
          <p>Tên: <strong>${escapeHtml(paymentSnapshot.momoName)}</strong></p>
        `;
      } else {
        methodsDetailHtml = `
          <p>Ngân hàng: <strong>${escapeHtml(paymentSnapshot.bankName)}</strong></p>
          <p>Số tài khoản: <strong>${escapeHtml(paymentSnapshot.accountNumber)}</strong></p>
          <p>Chủ tài khoản: <strong>${escapeHtml(paymentSnapshot.accountName)}</strong></p>
        `;
      }

      await this.sendFormRespondentEmail({
        formId: form.id,
        formTitle: form.title,
        submissionId: submission.id,
        toEmail: validated.respondentEmail,
        subject: `[${SENDER_NAME}] Hướng dẫn chuyển khoản - ${form.title}`,
        html: `
          <h2>Vui lòng chuyển khoản để giữ chỗ</h2>
          <p>Biểu mẫu: <strong>${escapeHtml(form.title)}</strong></p>
          ${appointmentAt ? `<p>Giờ hẹn: <strong>${escapeHtml(formatAppointmentVn(appointmentAt))}</strong></p>` : ''}
          ${methodsDetailHtml}
          <p>Số tiền: <strong>${escapeHtml(paymentConfig.amount.toLocaleString('vi-VN'))}đ</strong></p>
          <p>Nội dung chuyển khoản (bắt buộc ghi đúng): <strong>${escapeHtml(submission.paymentCode)}</strong></p>
          <p>Hạn giữ chỗ: <strong>${holdMinutesText} phút</strong> kể từ lúc đặt.</p>
          <p>Theo dõi trạng thái tại: <a href="${escapeHtml(statusUrl)}">${escapeHtml(statusUrl)}</a></p>
          ${buildFormUnsubscribeFooterHtml({ marketingConsent: validated.marketingConsent, unsubscribeToken: submission.unsubscribeToken })}
        `,
        logLabel: 'thư hướng dẫn chuyển khoản',
      });
    }

    return {
      accessToken: submission.accessToken,
      isBotTrap: false,
      payment: paymentEnabled
        ? {
            ...(paymentSnapshot.method === 'momo'
              ? {
                  method: 'momo',
                  amount: paymentConfig.amount,
                  code: submission.paymentCode,
                  momoPhone: paymentSnapshot.momoPhone,
                  momoName: paymentSnapshot.momoName,
                  qrString,
                  holdExpiresAt: submission.holdExpiresAt,
                }
              : {
                  method: 'bank',
                  amount: paymentConfig.amount,
                  code: submission.paymentCode,
                  bankBin: paymentSnapshot.bankBin,
                  bankName: paymentSnapshot.bankName,
                  accountNumber: paymentSnapshot.accountNumber,
                  accountName: paymentSnapshot.accountName,
                  qrString,
                  holdExpiresAt: submission.holdExpiresAt,
                }),
            options: paymentOptions,
          }
        : null,
    };
  }

  /**
   * Gửi MỘT thư cho người điền form (xác nhận lịch hẹn HOẶC hướng dẫn chuyển khoản) — gom logic
   * trần thư dùng CHUNG (PLAN...#Trần thư gửi người đặt) để hai nhánh gọi không viết trùng.
   * Vượt trần thì logError CHỈ kèm form id, không ghi địa chỉ email ra log. Fire-and-forget —
   * không throw, không chặn response 201 cho người điền.
   *
   * @param {{ formId: number, formTitle: string, submissionId: number, toEmail: string, subject: string, html: string, logLabel: string }} params
   */
  async sendFormRespondentEmail({ formId, submissionId, toEmail, subject, html, logLabel }) {
    const formEmailCount = await formRepository.countFormRespondentEmailsLast24h(formId);
    const recipientEmailCount = formEmailCount < MAX_FORM_RESPONDENT_EMAILS_PER_24H
      ? await formRepository.countConfirmationEmailsForRecipientLast24h(toEmail)
      : 0;

    if (formEmailCount >= MAX_FORM_RESPONDENT_EMAILS_PER_24H) {
      logError(`[FormService] Bỏ gửi ${logLabel} cho form ${formId} — đã vượt trần ${MAX_FORM_RESPONDENT_EMAILS_PER_24H} thư/24h`);
      return;
    }
    if (recipientEmailCount >= MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H) {
      logError(`[FormService] Bỏ gửi ${logLabel} cho form ${formId} — người nhận đã vượt trần ${MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H} thư xác nhận/24h`);
      return;
    }

    void sendSystemEmail({ to: toEmail, subject, html })
      .then(() => formRepository.markConfirmationSent(submissionId))
      .catch((emailErr) => {
        logError(`[FormService] Gửi ${logLabel} thất bại cho submission ${submissionId}: ${emailErr.message}`);
      });
  }

  /**
   * Xử lý rút lại đồng ý tiếp thị cho MỘT bài nộp Biểu mẫu thông qua public unsubscribe link
   * (PR-7b, mô phỏng `lead.service.js` `withdrawLeadConsent`). Không chặn theo trạng thái form
   * (ẩn/tắt bởi super admin, chủ hết gói) — quyền rút đồng ý của người nộp không phụ thuộc trạng
   * thái vận hành của form.
   *
   * @param {object} params
   * @param {string} params.token
   * @param {string} [params.privacyPolicyUrl]
   * @returns {Promise<{ statusCode: number, html: string }>}
   */
  async withdrawSubmissionConsent({ token, privacyPolicyUrl }) {
    const cleanToken = String(token || '').trim();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const renderHtml = (opts) => renderLeadUnsubscribeHtml({ ...opts, privacyPolicyUrl });

    if (!cleanToken || !UUID_RE.test(cleanToken)) {
      return {
        statusCode: 404,
        html: renderHtml({
          title: 'Liên kết không hợp lệ / Invalid Link',
          headingVi: 'Liên kết không hợp lệ',
          textVi: 'Liên kết rút lại đồng ý không hợp lệ hoặc đã hết hạn.',
          headingEn: 'Invalid link',
          textEn: 'The consent withdrawal link is invalid or has expired.',
        }),
      };
    }

    const submission = await formRepository.findSubmissionByUnsubscribeToken(cleanToken);
    if (!submission) {
      return {
        statusCode: 404,
        html: renderHtml({
          title: 'Liên kết không tồn tại / Link Not Found',
          headingVi: 'Liên kết không tồn tại',
          textVi: 'Không tìm thấy bài nộp tương ứng với liên kết này.',
          headingEn: 'Link not found',
          textEn: 'We could not find any submission matching this link.',
        }),
      };
    }

    const alreadyWithdrawn = submission.marketingConsent === false && submission.consentWithdrawnAt != null;
    if (alreadyWithdrawn) {
      return {
        statusCode: 200,
        html: renderHtml({
          title: 'Đã rút lại đồng ý / Consent Already Withdrawn',
          headingVi: 'Yêu cầu đã được ghi nhận trước đó',
          textVi: 'Bạn đã rút lại đồng ý nhận thông tin tiếp thị trước đó. Chúng tôi sẽ không gửi thông tin tiếp thị đến bạn.',
          headingEn: 'Request already recorded',
          textEn: 'You had already withdrawn your marketing consent previously. We will not send marketing communications to you.',
        }),
      };
    }

    await formRepository.withdrawSubmissionConsentById(submission.id);

    return {
      statusCode: 200,
      html: renderHtml({
        title: 'Rút lại đồng ý thành công / Consent Withdrawn',
        headingVi: 'Rút lại đồng ý thành công',
        textVi: 'Bạn đã rút lại đồng ý nhận thông tin tiếp thị thành công. Chúng tôi đã ghi nhận và sẽ không gửi thông tin tiếp thị đến bạn.',
        headingEn: 'Consent withdrawn successfully',
        textEn: 'You have successfully withdrawn your marketing consent. We will no longer send marketing communications to you.',
      }),
    };
  }

  /**
   * Trang trạng thái công khai cho người đặt (PR-3a mục 4): `GET /api/public/forms/:publicKey/
   * submissions/:accessToken`. Token sai hoặc không thuộc form đó → 404 (giống mọi 404 public
   * khác). KHÔNG trả tên/email/SĐT người đặt. `payment` (kèm `qrString` dựng lại từ
   * payment_snapshot LƯU LÚC ĐẶT, không đọc payment_config hiện tại của form — chủ đổi STK sau
   * đó không được ảnh hưởng QR đã gửi cho khách) chỉ có khi còn `pending_payment` VÀ chưa hết hạn.
   *
   * @param {string} publicKey
   * @param {string} accessToken
   * @returns {Promise<object>}
   */
  async getSubmissionStatus(publicKey, accessToken) {
    const key = String(publicKey || '').trim();
    const token = String(accessToken || '').trim();
    if (!key || !token) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    const form = await formRepository.findFormByPublicKey(key);
    if (!form || !form.isPublished || form.adminDisabledAt) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }
    // PR-3b (Bổ sung 15/09): KHÔNG chặn theo checkOwnerActivePlan ở đây — khách đã đặt/chuyển
    // khoản phải xem được trạng thái bài nộp của MÌNH dù chủ hết gói sau đó (tiền đã đi, khách
    // cần biết đã xác nhận hay chưa). Vẫn giữ chặn khi form bị ẩn (!isPublished) hoặc bị super
    // admin tắt (adminDisabledAt) — hai điều kiện phía trên.

    const submission = await formRepository.findSubmissionByAccessTokenAndForm(token, form.id);
    if (!submission) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    const holdExpiresAt = submission.holdExpiresAt ? new Date(submission.holdExpiresAt) : null;
    const holdExpired = submission.status === 'pending_payment' && (!holdExpiresAt || holdExpiresAt.getTime() <= Date.now());

    let payment = null;
    if (submission.status === 'pending_payment' && !holdExpired && submission.paymentSnapshot) {
      const snap = submission.paymentSnapshot;
      const { options: paymentOptions, primaryQrString: qrString } = buildPaymentOptionsAndPrimaryQr(
        snap,
        submission.paymentAmount,
        submission.paymentCode
      );
      const primaryMethod = snap.method || (snap.methods ? snap.methods[0] : 'bank');

      if (primaryMethod === 'momo') {
        payment = {
          method: 'momo',
          amount: submission.paymentAmount,
          code: submission.paymentCode,
          momoPhone: snap.momoPhone,
          momoName: snap.momoName,
          qrString,
          holdExpiresAt: submission.holdExpiresAt,
          options: paymentOptions,
        };
      } else {
        payment = {
          method: 'bank',
          amount: submission.paymentAmount,
          code: submission.paymentCode,
          bankBin: snap.bankBin,
          bankName: snap.bankName,
          accountNumber: snap.accountNumber,
          accountName: snap.accountName,
          qrString,
          holdExpiresAt: submission.holdExpiresAt,
          options: paymentOptions,
        };
      }
    }

    return {
      status: submission.status,
      formTitle: form.title,
      // PR-4a mục 5: trang trạng thái công khai khớp giao diện form gốc — cùng phép chiếu
      // whitelist+URL với getPublicForm, không lộ bannerKey/logoKey.
      theme: buildPublicFormTheme(form.theme),
      appointmentAt: submission.appointmentAt,
      holdExpiresAt: submission.holdExpiresAt,
      holdExpired,
      payment,
      payerReportedPaidAt: submission.payerReportedPaidAt || null,
      receiptRequired: isPaymentReceiptEnabled(),
      hasReceipt: Boolean(submission.paymentReceiptKey),
      receiptWaived: Boolean(submission.paymentReceiptWaivedReason),
    };
  }

  /**
   * Tải ảnh biên lai chuyển khoản cho bài nộp pending_payment (PR-5).
   * Chốt: form tồn tại + isPublished + không adminDisabledAt; token khớp;
   * lượt pending_payment và payer_reported_paid_at IS NULL;
   * magic bytes JPEG/PNG/WebP, tối đa 2 MB; tối đa 5 lần upload.
   * Xử lý quota chủ form hết dung lượng -> ghi nhận waived_reason 'owner_storage_full'.
   *
   * @param {string} publicKey
   * @param {string} accessToken
   * @param {object} file Express.Multer.File
   * @returns {Promise<{ receiptStored: boolean, reason?: string }>}
   */
  async uploadPaymentReceipt(publicKey, accessToken, file) {
    if (!isPaymentReceiptEnabled()) {
      throw createHttpError('Tính năng tải ảnh biên lai hiện đang tắt', 404, 'FEATURE_DISABLED');
    }

    const key = String(publicKey || '').trim();
    const token = String(accessToken || '').trim();
    if (!key || !token) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    const form = await formRepository.findFormByPublicKey(key);
    if (!form || !form.isPublished || form.adminDisabledAt) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    const submission = await formRepository.findSubmissionByAccessTokenAndForm(token, form.id);
    if (!submission) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    if (submission.status !== 'pending_payment') {
      throw createHttpError('Bài nộp không ở trạng thái chờ thanh toán', 409, 'SUBMISSION_NOT_PENDING');
    }

    if (submission.payerReportedPaidAt) {
      throw createHttpError('Bài nộp đã được xác nhận chuyển khoản, không thể tải thêm ảnh', 409, 'PAYMENT_ALREADY_REPORTED');
    }

    if (Number(submission.paymentReceiptUploadCount || 0) >= 5) {
      throw createHttpError('Bạn đã vượt quá số lần tải ảnh cho phép (tối đa 5 lần)', 409, 'RECEIPT_UPLOAD_LIMIT_EXCEEDED');
    }

    if (!file || !file.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw createHttpError('Vui lòng chọn ảnh chuyển khoản', 400, 'RECEIPT_FILE_REQUIRED');
    }

    if (file.buffer.length > MAX_RECEIPT_BYTES) {
      throw createHttpError('Ảnh vượt dung lượng tối đa 2 MB', 400, 'FILE_TOO_LARGE');
    }

    const detected = detectReceiptImageMagic(file.buffer);
    if (!detected) {
      throw createHttpError('Chỉ nhận ảnh JPEG, PNG hoặc WebP', 400, 'INVALID_IMAGE_TYPE');
    }

    const storageKey = `uploads/${form.workspaceOwnerId}/forms/receipts/${submission.id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${detected.ext}`;

    await getStorageBackend().put(storageKey, file.buffer, { contentType: detected.mime });

    try {
      await registerWrittenStorageObject({
        poolType: STORAGE_POOL_TYPES.WORKSPACE,
        ownerUserId: form.workspaceOwnerId,
        actorUserId: form.workspaceOwnerId,
        storageKey,
        category: 'form_receipt',
        state: 'active',
        sizeBytes: file.buffer.length,
        referenceType: 'form_payment_receipt',
        referenceId: submission.id,
      });
    } catch (err) {
      // Dọn file vừa ghi vào kho
      await getStorageBackend().delete(storageKey).catch(() => {});

      if (err instanceof StorageQuotaExceededError) {
        // Chủ form hết dung lượng -> miễn gửi ảnh cho khách
        await formRepository.updateSubmissionPaymentReceipt(submission.id, {
          paymentReceiptKey: null,
          paymentReceiptWaivedReason: 'owner_storage_full',
        });
        return { receiptStored: false, reason: 'OWNER_STORAGE_FULL' };
      }
      throw err;
    }

    // V3: Cập nhật DB sang khoá mới TRƯỚC, dọn ảnh cũ SAU
    const oldStorageKey = submission.paymentReceiptKey;

    await formRepository.updateSubmissionPaymentReceipt(submission.id, {
      paymentReceiptKey: storageKey,
      paymentReceiptWaivedReason: null,
    });

    // Nếu trước đó đã có ảnh cũ -> dọn ảnh cũ khỏi storage VÀ đánh dấu xoá trong storage_objects
    if (oldStorageKey && oldStorageKey !== storageKey) {
      await getStorageBackend().delete(oldStorageKey).catch(() => {});
      await markDeletedAfterUnlink({ storageKey: oldStorageKey }).catch(() => {});
    }

    return { receiptStored: true };
  }

  /**
   * Khách báo đã chuyển khoản cho lượt đặt pending_payment (PR-2, PR-5).
   * Điều kiện server (PR-5): bắt buộc đã tải ảnh (paymentReceiptKey) hoặc được miễn (paymentReceiptWaivedReason) nếu tính năng bật.
   * Gia hạn giữ chỗ (nếu còn hạn) tối đa 24h, không vượt quá appointment_at.
   * Gửi email thông báo cho chủ form (bất kể settings.notifyOwner).
   * Idempotent: bấm lại trả 200 trạng thái hiện tại, không đổi hạn giữ chỗ, không gửi thư lần hai.
   *
   * @param {string} publicKey
   * @param {string} accessToken
   * @returns {Promise<object>}
   */
  async reportPaymentSent(publicKey, accessToken) {
    const key = String(publicKey || '').trim();
    const token = String(accessToken || '').trim();
    if (!key || !token) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    const form = await formRepository.findFormByPublicKey(key);
    if (!form || !form.isPublished || form.adminDisabledAt) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    const requireReceipt = isPaymentReceiptEnabled();

    // 1. Thử cập nhật nguyên tử nếu lượt đang pending_payment, chưa từng báo, và ĐÃ CÓ BIÊN LAI (nếu bật tính năng)
    const updated = await formRepository.updatePayerReportedPaid(token, form.id, requireReceipt);

    if (updated) {
      // Bấm lần đầu thành công -> gửi thư báo chủ form (bất kể settings.notifyOwner)
      if (form.ownerEmail) {
        const subject = `[${SENDER_NAME}] Khách báo đã chuyển khoản - Mã ${updated.paymentCode || ''}`;
        const appointmentText = updated.appointmentAt
          ? formatAppointmentVn(updated.appointmentAt)
          : 'Không có lịch hẹn';
        const amountText = updated.paymentAmount
          ? `${Number(updated.paymentAmount).toLocaleString('vi-VN')}đ`
          : '0đ';
        const reportedAtText = new Date().toLocaleString('vi-VN');
        const submissionsUrl = `${FRONTEND_URL}/app/forms/${form.id}/submissions`;

        const receiptNoteHtml = updated.paymentReceiptKey
          ? `<p style="margin-top:12px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e40af;">
               <strong>Khách đã gửi ảnh chuyển khoản — xem ở trang Bài nộp.</strong><br/>
               <small style="color:#4b5563;">Ảnh chỉ để tham khảo, hãy kiểm tra app ngân hàng trước khi bấm Đã nhận tiền.</small>
             </p>`
          : updated.paymentReceiptWaivedReason
            ? `<p style="margin-top:12px;padding:10px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;color:#92400e;">
                 <em>Bên nhận đã hết dung lượng lưu trữ — khách được miễn gửi ảnh chuyển khoản. Vui lòng kiểm tra app ngân hàng trước khi bấm Đã nhận tiền.</em>
               </p>`
            : '';

        const html = `
          <h2>Khách hàng báo đã chuyển khoản</h2>
          <p>Biểu mẫu: <strong>${escapeHtml(form.title)}</strong></p>
          <p>Mã thanh toán: <strong>${escapeHtml(updated.paymentCode || '')}</strong></p>
          <p>Số tiền: <strong>${escapeHtml(amountText)}</strong></p>
          <p>Người đặt: ${escapeHtml(updated.respondentName || 'Chưa cung cấp')}</p>
          <p>Số điện thoại: ${escapeHtml(updated.respondentPhone || 'Chưa cung cấp')}</p>
          <p>Giờ hẹn: <strong>${escapeHtml(appointmentText)}</strong></p>
          <p>Thời gian báo: ${escapeHtml(reportedAtText)}</p>
          ${receiptNoteHtml}
          <p><a href="${submissionsUrl}" style="display:inline-block;padding:10px 16px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Xem danh sách bài nộp để xác nhận</a></p>
        `;

        void sendSystemEmail({
          to: form.ownerEmail,
          subject,
          html,
        }).catch((emailErr) => {
          logError(`[FormService] Gửi thư báo khách chuyển khoản thất bại cho form ${form.id}: ${emailErr.message}`);
        });
      }

      return {
        status: updated.status,
        holdExpiresAt: updated.holdExpiresAt,
        payerReportedPaidAt: updated.payerReportedPaidAt,
      };
    }

    // 2. Không có dòng trả về -> đọc lại bài nộp để phân biệt nguyên nhân:
    // "chưa gửi ảnh" (409 RECEIPT_REQUIRED), "đã báo rồi" (200), "không còn chờ tiền" (409) hoặc "không tìm thấy" (404)
    const existing = await formRepository.findSubmissionByAccessTokenAndForm(token, form.id);
    if (!existing) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    if (existing.status !== 'pending_payment') {
      throw createHttpError('Bài nộp không ở trạng thái chờ thanh toán', 409, 'SUBMISSION_NOT_PENDING');
    }

    // Kiểm tra chốt receipt: chỉ khi tính năng ĐANG BẬT
    if (requireReceipt) {
      if (!existing.payerReportedPaidAt && !existing.paymentReceiptKey && !existing.paymentReceiptWaivedReason) {
        throw createHttpError('Vui lòng tải ảnh chuyển khoản trước khi xác nhận', 409, 'RECEIPT_REQUIRED');
      }
    }

    // Đã ở trạng thái pending_payment và payer_reported_paid_at không null (nghĩa là đã báo rồi) -> idempotent 200
    return {
      status: existing.status,
      holdExpiresAt: existing.holdExpiresAt,
      payerReportedPaidAt: existing.payerReportedPaidAt,
    };
  }

  /**
   * Lấy khoá tệp ảnh biên lai chuyển khoản (chỉ chủ workspace quản lý form) — PR-5.
   *
   * @param {number} formId
   * @param {number} submissionId
   * @param {number} workspaceOwnerId
   * @returns {Promise<{ storageKey: string }>}
   */
  async getSubmissionReceipt(formId, submissionId, workspaceOwnerId) {
    const form = await formRepository.findFormByIdAndOwner(formId, workspaceOwnerId);
    if (!form) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }

    const submission = await formRepository.findSubmissionReceiptForOwner(submissionId, formId);
    if (!submission) {
      throw createHttpError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
    }

    if (!submission.paymentReceiptKey) {
      throw createHttpError('Bài nộp chưa có ảnh chuyển khoản', 404, 'RECEIPT_NOT_FOUND');
    }

    return { storageKey: submission.paymentReceiptKey };
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

  // ─── Super admin (PR-3a mục 9) ────────────────────────────────────────────────────────

  /**
   * @param {{ q?: string, page?: number, pageSize?: number }} params
   * @returns {Promise<object>}
   */
  async adminListForms(params) {
    return formRepository.adminListForms(params);
  }

  /**
   * @param {number} id
   * @param {boolean} disabled
   * @returns {Promise<object>}
   */
  async adminSetFormDisabled(id, disabled) {
    const form = await formRepository.adminFindFormById(id);
    if (!form) {
      throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
    }
    return formRepository.adminSetFormDisabled(id, disabled);
  }
}

export default new FormService();
