import landingPageRepository from '../../repositories/landingPage.repository.js';
import landingPageDomainRepository from '../../repositories/landingPageDomain.repository.js';
import landingPageDomainService from './landingPageDomain.service.js';
import landingPageVersionService from './landingPageVersion.service.js';
import cloudflareService from '../cloudflare.service.js';
import { linkAssetsToLandingPage } from '../landing/landingAsset.service.js';

import db from '../../config/database.js';
import formRepository from '../../repositories/form.repository.js';
import formService from '../form.service.js';
import { checkUserResourceLimit, enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';
import { extractFormEmbedKeys, listFormEmbedKeys } from '../../utils/landingEditGuard.util.js';
import {
  prepareLandingHtmlOnSave,
  resolveFrontendOriginFromEnv,
  resolvePublicApiBaseFromEnv,
  countFormSlots,
  hasMalformedFormSlot,
  listFormSlots,
  findInvalidFormSlotKinds,
  replaceFormSlotsWithEmbeds,
  appendBeforeBodyClose,
  buildFormEmbedSectionHtml,
  FORM_SLOT_KINDS,
  MAX_FORMS_PER_LANDING,
} from '../../utils/landingHtmlInjection.util.js';
import { buildStarterFormDraft, FORM_STARTER_KIND_LABELS } from '../../utils/formStarterTemplates.util.js';
import {
  mergeLeadFormIntoCustomConfig,
  toPublicLeadFormConfig,
  validateAdminLeadFormConfig,
} from '../../utils/landingLeadFormConfig.util.js';
import { buildFormFieldsFromLeadFormConfig } from '../../utils/landingLeadFormToFormFields.util.js';
import { auditLandingCaptureFields, buildCaptureFieldAuditWarning } from '../../utils/landingCaptureFieldAudit.util.js';
import { autoDeclareLandingCaptureFields } from '../../utils/landingCaptureFieldAutoDeclare.util.js';
import { getWorkspaceContext, getWorkspaceScope } from '../../utils/workspaceContext.util.js';
import {
  invalidateDomainResolverPayload,
  invalidateDomainResolverHost,
} from '../../middleware/domainResolver.js';

/** Slug dành cho landing React cố định `/l` — không quản lý qua bảng `landing_pages`. */
const RESERVED_SLUG_FIXED_LANDING = 'l';

/**
 * Convert DB row → admin DTO. Strip `customConfig` (raw JSONB), trả `leadFormConfig` đã chuẩn hoá.
 *
 * @param {object|null} row
 * @returns {object|null}
 */
/**
 * Câu 3 sếp hỏi 14/09 → PLAN_TU_KHAI_BAO_TRUONG_FORM_LANDING_2026-09-16.md — dùng chung cho
 * `create()`/`update()`: tự khai báo ô form chưa khai báo NGAY TRƯỚC khi lưu (đổi `name=` trong
 * HTML sang khoá `cf_*` hợp lệ + gộp khai báo mới vào `customConfig.leadForm`), để người dùng
 * không còn phải tự vào Cài đặt trang khai báo trước rồi mới nhờ AI sửa form.
 *
 * KHÔNG throw ra ngoài — auto-declare hỏng vì bất kỳ lý do gì (regex lệch, validator từ chối nhãn/
 * khoá bất ngờ...) chỉ được làm MẤT TÁC DỤNG của tính năng này, tuyệt đối không được làm hỏng cả
 * lượt lưu landing; `auditLandingCaptureFields` (gọi sau, không đổi) vẫn là lưới an toàn cuối cùng.
 *
 * @param {string} html
 * @param {{ leadForm: object }} customConfig SẼ bị sửa TẠI CHỖ (`leadForm` được gán đè) khi có
 *   trường mới khai báo thành công.
 * @returns {string} HTML đã đổi tên `name=` (hoặc HTML gốc nếu không có gì để tự khai báo)
 */
function applyLeadFormAutoDeclare(html, customConfig) {
  let autoDeclare;
  try {
    autoDeclare = autoDeclareLandingCaptureFields(html, customConfig.leadForm);
  } catch (e) {
    console.warn('[LandingPageAdmin] Tự khai báo trường form thất bại, giữ nguyên:', e.message);
    return html;
  }
  if (autoDeclare.newFields.length === 0) return html;
  try {
    customConfig.leadForm = validateAdminLeadFormConfig(
      {
        version: customConfig.leadForm.version,
        fixedFields: customConfig.leadForm.fixedFields,
        customFields: [...customConfig.leadForm.customFields, ...autoDeclare.newFields],
      },
      { existing: customConfig.leadForm }
    );
  } catch (e) {
    console.warn('[LandingPageAdmin] Gộp khai báo tự động thất bại, giữ nguyên:', e.message);
    return html;
  }
  return autoDeclare.html;
}

function toAdminLandingDto(row) {
  if (!row) return null;
  const { customConfig, ...rest } = row;
  return {
    ...rest,
    leadFormConfig: toPublicLeadFormConfig(customConfig),
  };
}

/**
 * PR-F (PLAN_TEN_MIEN_RIENG_VA_BIEU_MAU_LIEN_KET_LANDING_2026-10-03.md) — `custom_config.chosenFormId` là id biểu
 * mẫu KHÁCH CHỌN qua "Dùng biểu mẫu đã tạo". Phân biệt với form TỰ SINH ("Form cơ bản", tạo lúc lưu trang có chỗ
 * trống) bằng cờ ở phía LANDING, không ở `forms.settings`: `normalizeFormSettings` là whitelist (khoá lạ bị bỏ khi tạo)
 * và trình soạn Biểu mẫu ghi đè cả khối settings mỗi lần lưu — cờ nằm trong form sẽ mất ngay lần chủ sửa form đầu tiên.
 * Form tự sinh cũ (trước PR-F) không có cờ nên tự nhiên là "Form cơ bản". Cờ lệch (id không khớp form đang gắn) thì
 * coi như không có — tự lành, không cần dọn.
 *
 * @param {object|null|undefined} customConfig
 * @param {number|string} formId
 * @returns {boolean}
 */
function isChosenFormId(customConfig, formId) {
  const chosen = Number(customConfig?.chosenFormId);
  return Number.isFinite(chosen) && chosen > 0 && chosen === Number(formId);
}

/**
 * PR-6 — phần DTO về CÁC biểu mẫu đang nhúng trong landing (đọc từ bảng chỉ mục `landing_page_forms`), dùng cho GET / list / PUT.
 *
 * `linkedForms`: danh sách đầy đủ, đúng thứ tự vị trí trong HTML — mỗi phần tử
 * `{ id, title, publicKey, isPublished, kind, position, needsPaymentSetup }`:
 *   - `kind`: loại khi hệ thống tự tạo từ chỗ trống (consult|booking|payment|survey|blank); null = biểu mẫu chủ chọn / dữ liệu cũ.
 *   - `needsPaymentSetup` (cờ "cần bổ sung", QĐ4): biểu mẫu do hệ thống tạo từ chỗ trống `payment` mà CHƯA có `payment_config`
 *     bật (chủ chưa khai số tiền + tài khoản nhận tiền). TÍNH khi đọc từ (kind, payment_config) — không lưu cờ riêng nên chủ khai
 *     xong ở trình soạn Biểu mẫu là cờ tự hết, không cần ai dọn, và không đụng `forms.settings` (whitelist + trình soạn ghi đè).
 *
 * Các khoá đơn cũ (`linkedFormId`, `linkedFormTitle`, `linkedFormPublicKey`, `linkedFormSource`) GIỮ lại = biểu mẫu ĐẦU TIÊN của
 * trang, để trình soạn bản cũ còn mở lúc deploy lệch (PR-F) không vỡ. `linkedFormSource`: 'chosen' = biểu mẫu khách chọn qua
 * khoá cũ `linkedFormId` (cờ `custom_config.chosenFormId`, chỉ còn đường tương thích cũ ghi), 'basic' = còn lại, null = chưa có.
 *
 * @param {Array<{ id: number, title?: string, publicKey?: string, isPublished?: boolean, kind?: string|null, position?: number,
 *   paymentConfig?: object|null }>} rows đã sắp theo vị trí
 * @param {object|null|undefined} customConfig
 */
function toLinkedFormsDto(rows, customConfig) {
  const linkedForms = (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    title: row.title ?? null,
    publicKey: row.publicKey ?? null,
    isPublished: row.isPublished !== false,
    kind: row.kind ?? null,
    position: Number(row.position) || 0,
    needsPaymentSetup: row.kind === 'payment' && !(row.paymentConfig && row.paymentConfig.enabled === true),
  }));
  const first = linkedForms[0];
  return {
    linkedForms,
    linkedFormId: first ? first.id : null,
    linkedFormTitle: first ? first.title : null,
    linkedFormPublicKey: first ? first.publicKey : null,
    linkedFormSource: first ? (isChosenFormId(customConfig, first.id) ? 'chosen' : 'basic') : null,
  };
}

/** Lỗi 400 gọn. */
function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/** Một id biểu mẫu từ body: số nguyên dương hoặc chuỗi số. Khác → 400, không đoán ý. */
function parseFormIdValue(raw, fieldName) {
  const text = typeof raw === 'number' || typeof raw === 'string' ? String(raw).trim() : '';
  const formId = /^\d{1,15}$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(formId) || formId <= 0) {
    throw badRequest(`${fieldName} không hợp lệ (cần số nguyên dương${fieldName === 'linkedFormId' ? ' hoặc null' : ''}).`);
  }
  return formId;
}

/**
 * PR-6 — phần body của PUT /:id nói về biểu mẫu CÓ SẴN muốn gắn vào trang.
 *
 *  - `linkedFormIds: number[]` (mới): các biểu mẫu có sẵn cần có trên trang. Cái nào HTML đã nhúng thì giữ nguyên chỗ; cái chưa
 *    nhúng được nối vào CUỐI trang theo đúng thứ tự trong mảng. Mảng rỗng hợp lệ (= không gắn thêm gì).
 *  - `linkedFormId` (CŨ, PR-F, trình soạn bản cũ còn mở lúc deploy lệch): số = một biểu mẫu, thay đúng CHỖ TRỐNG TRẦN trong HTML
 *    (hành vi cũ); `null` = bỏ biểu mẫu khách chọn, quay về form cơ bản MỚI dựng từ leadFormConfig. Thiếu cả hai = không đổi gì.
 * Cả hai cùng có thì `linkedFormIds` thắng.
 *
 * @param {object} body
 * @returns {{ mode: 'none'|'list'|'legacySingle'|'legacyNull', ids: number[] }}
 */
function parseLinkedFormsInput(body) {
  const rawList = body?.linkedFormIds;
  if (rawList !== undefined) {
    if (!Array.isArray(rawList)) throw badRequest('linkedFormIds không hợp lệ (cần mảng id biểu mẫu).');
    if (rawList.length > MAX_FORMS_PER_LANDING) throw badRequest(`Một trang tối đa ${MAX_FORMS_PER_LANDING} biểu mẫu.`);
    const ids = [];
    for (const raw of rawList) {
      const id = parseFormIdValue(raw, 'linkedFormIds');
      if (!ids.includes(id)) ids.push(id);
    }
    return { mode: 'list', ids };
  }
  const rawLegacy = body?.linkedFormId;
  if (rawLegacy === undefined) return { mode: 'none', ids: [] };
  if (rawLegacy === null) return { mode: 'legacyNull', ids: [] };
  return { mode: 'legacySingle', ids: [parseFormIdValue(rawLegacy, 'linkedFormId')] };
}

/**
 * PR-6 — kiểm HTML sắp lưu về chỗ trống biểu mẫu, DÙNG CHUNG create()/update(); 400 trước khi tạo/ghi bất cứ thứ gì:
 *   - chỗ trống sai dạng (có nội dung con) hoặc có GIÁ TRỊ LOẠI LẠ (`data-founderai-form-slot="contact"`) — không âm thầm lưu
 *     một div rỗng vô dụng, không đoán loại;
 *   - tổng chỗ trống + khối nhúng vượt trần kỹ thuật `MAX_FORMS_PER_LANDING` (mỗi biểu mẫu là một iframe).
 * Không còn chặn "chỉ được đúng 1 chỗ trống" (user chốt 11/10: không giới hạn nghiệp vụ).
 *
 * @param {string} html
 */
function assertFormSlotsValid(html) {
  const invalidKinds = findInvalidFormSlotKinds(html);
  if (invalidKinds.length > 0) {
    throw badRequest(
      `Chỗ trống biểu mẫu có loại không hợp lệ (${invalidKinds.map((v) => `"${v}"`).join(', ')}). `
      + `Loại hợp lệ: ${FORM_SLOT_KINDS.join(', ')}.`
    );
  }
  if (hasMalformedFormSlot(html)) {
    throw badRequest('Trang có chỗ trống biểu mẫu sai dạng (có nội dung bên trong div data-founderai-form-slot).');
  }
  const total = countFormSlots(html) + listFormEmbedKeys(html).length;
  if (total > MAX_FORMS_PER_LANDING) {
    throw badRequest(
      `Trang có ${total} biểu mẫu (chỗ trống + khối nhúng), tối đa ${MAX_FORMS_PER_LANDING}. Hãy bớt biểu mẫu trước khi lưu.`
    );
  }
}

/**
 * Tiêu đề biểu mẫu tự tạo từ chỗ trống. Chỗ trống `consult` ĐẦU TIÊN giữ đúng tiêu đề cũ (tên trang) như trước PR-6; các loại khác
 * (và consult thứ hai trở đi) thêm hậu tố loại để phân biệt trong mục Biểu mẫu. Cắt phần tên cho vừa trần 200 ký tự.
 *
 * @param {string} baseTitle
 * @param {string} kind
 * @param {number} ordinal thứ tự trong CÙNG loại (1, 2, …)
 */
function buildSlotFormTitle(baseTitle, kind, ordinal) {
  if (kind === 'consult' && ordinal === 1) return baseTitle;
  const suffix = ` - ${FORM_STARTER_KIND_LABELS[kind] || kind}${ordinal > 1 ? ` (${ordinal})` : ''}`;
  return `${baseTitle.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
}

/**
 * CRUD landing page HTML theo phạm vi quyền user.
 */
class LandingPageAdminService {
  /**
   * @param {string} slug
   */
  assertNotReservedSlug(slug) {
    if (String(slug || '').trim().toLowerCase() === RESERVED_SLUG_FIXED_LANDING) {
      const err = new Error(
        'Slug "l" dành cho landing cố định tại đường dẫn /l; không tạo/sửa qua CMS này.'
      );
      err.statusCode = 400;
      throw err;
    }
  }

  /**
   * Định dạng slug khi GHI — create(), update() và restoreFreeLink() dùng CHUNG một bản: slug dành riêng "l" → 400,
   * sai định dạng → 400. Slug rỗng/null hợp lệ (slug không bắt buộc).
   *
   * @param {string|null} slug đã chuẩn hoá (trim + chữ thường)
   */
  assertSlugFormat(slug) {
    this.assertNotReservedSlug(slug);
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Slug không hợp lệ (chữ thường, số, dấu - và _; bắt đầu bằng chữ hoặc số)');
      err.statusCode = 400;
      throw err;
    }
  }

  /**
   * Slug mới đã thuộc landing KHÁC → 409. Slug trùng slug hiện tại của chính trang (hoặc rỗng) thì bỏ qua.
   * update() và restoreFreeLink() dùng chung.
   *
   * @param {string|null} slug slug muốn ghi (đã chuẩn hoá)
   * @param {string|null} currentSlug slug đang có của trang
   */
  async assertSlugNotTaken(slug, currentSlug) {
    if (slug && slug !== currentSlug) {
      const clash = await landingPageRepository.findBySlugAny(slug);
      if (clash) {
        const err = new Error('Slug đã được dùng cho landing khác');
        err.statusCode = 409;
        throw err;
      }
    }
  }

  /**
   * Lấy danh sách landing trong phạm vi quyền của user hiện tại.
   *
   * @param {object} authUser
   * @returns {Promise<object[]>}
   */
  async list(authUser) {
    const rows = await landingPageRepository.listByScope(getWorkspaceScope(authUser));
    const visible = rows.filter((r) => String(r.slug || '').trim().toLowerCase() !== RESERVED_SLUG_FIXED_LANDING);
    // PR-F/PR-6 — các biểu mẫu nhúng trong từng landing (bảng chỉ mục `landing_page_forms`), MỘT câu truy vấn cho cả danh
    // sách. Lỗi ở đây chỉ làm mất phần phụ này, không được làm hỏng cả danh sách landing.
    const linkedByLanding = new Map();
    try {
      const linkedRows = await formRepository.listLinkedByLandingPageIds(visible.map((r) => r.id));
      for (const linked of linkedRows) {
        const key = String(linked.landingPageId);
        if (!linkedByLanding.has(key)) linkedByLanding.set(key, []);
        linkedByLanding.get(key).push(linked);
      }
    } catch (e) {
      console.warn('[LandingPageAdmin.list] Không tra được biểu mẫu gắn landing:', e.message);
    }
    return visible.map((r) => ({
      ...toAdminLandingDto(r),
      ...toLinkedFormsDto(linkedByLanding.get(String(r.id)), r.customConfig),
    }));
  }

  /**
   * @param {number} id
   * @param {object} authUser
   * @returns {Promise<object>}
   */
  async getById(id, authUser) {
    const row = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!row) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    // PR-5b-2b mục 7 — link "Mở Biểu mẫu của trang này" từ trình soạn landing. Chủ thật của
    // landing (không phải authUser — super admin xem landing của khách khác vẫn phải tra đúng
    // chủ đó, mẫu resourceOwnerId ở update()).
    const context = getWorkspaceContext(authUser);
    const landingOwnerId = context.isSuperAdmin
      ? Number(row.workspaceOwnerId || row.idUser)
      : context.workspaceOwnerId;
    const linkedForms = await formRepository.listByLandingPageId(id, landingOwnerId);
    return { ...toAdminLandingDto(row), ...toLinkedFormsDto(linkedForms, row.customConfig) };
  }

  /**
   * PR-6 — tạo biểu mẫu thật cho TỪNG chỗ trống cần tạo mới (theo thứ tự), mỗi cái theo loại của chỗ trống, rồi XUẤT BẢN ngay
   * (landing chạy ngay, không bắt chủ vào bật từng cái). Dùng chung create()/update().
   *
   *  - `consult`: GIỮ hành vi cũ — trường dựng từ `leadFormConfig` (họ tên/email/SĐT + nghề nghiệp/lĩnh vực + câu hỏi thêm AI/chủ
   *    đã khai), KHÔNG dùng mẫu consult của frontend (mất trường AI gợi ý).
   *  - loại khác: mẫu backend `formStarterTemplates.util.js` (== mẫu frontend, có test hợp đồng). `payment` = `payment_config
   *    null` (QĐ4: không bao giờ tự điền tiền / tài khoản); `booking` = khung giờ mẫu.
   *  Cài đặt luôn `consentEnabled: true, notifyOwner: true` như biểu mẫu tạo từ landing trước nay.
   *
   * Lỗi giữa chừng → xoá các biểu mẫu ĐÃ tạo trong lượt này (chưa có bài nộp nào) rồi ném lại: không để mồ côi.
   *
   * @param {{ kinds: string[], workspaceOwnerId: number, createdByUserId: number, baseTitle: string, leadForm: object }} params
   * @returns {Promise<Array<{ form: object, kind: string }>>} cùng thứ tự `kinds`
   */
  async createFormsForSlots({ kinds, workspaceOwnerId, createdByUserId, baseTitle, leadForm }) {
    const created = [];
    const perKindCount = {};
    try {
      for (const kind of kinds) {
        perKindCount[kind] = (perKindCount[kind] || 0) + 1;
        const title = buildSlotFormTitle(baseTitle, kind, perKindCount[kind]);
        let form;
        if (kind === 'consult') {
          form = await formService.createForm({
            workspaceOwnerId,
            createdByUserId,
            title,
            fields: buildFormFieldsFromLeadFormConfig(leadForm),
            settings: { consentEnabled: true, notifyOwner: true },
          });
        } else {
          const draft = buildStarterFormDraft(kind);
          form = await formService.createForm({
            workspaceOwnerId,
            createdByUserId,
            title,
            fields: draft.fields,
            settings: draft.settings,
            bookingConfig: draft.bookingConfig,
            paymentConfig: draft.paymentConfig,
          });
        }
        created.push({ form, kind });
        await formService.publishForm(form.id, workspaceOwnerId, true);
      }
      return created;
    } catch (error) {
      await this.deleteCreatedForms(created, workspaceOwnerId);
      throw error;
    }
  }

  /** Dọn các biểu mẫu vừa tạo mà landing không lưu được (chưa có bài nộp). Lỗi dọn chỉ ghi log. */
  async deleteCreatedForms(created, workspaceOwnerId) {
    for (const { form } of created) {
      await formService.deleteForm(form.id, workspaceOwnerId).catch((cleanupErr) => {
        console.warn('[LandingPageAdmin] Không xoá được biểu mẫu mồ côi sau lỗi lưu landing:', cleanupErr.message);
      });
    }
  }

  /**
   * PR-6 — GHI LẠI bảng chỉ mục `landing_page_forms` của một landing từ HTML ĐÃ LƯU (nguồn sự thật = các khối nhúng trong
   * HTML): với mỗi khoá nhúng theo thứ tự xuất hiện, tra biểu mẫu CÙNG workspace (khoá của workspace khác / khoá bịa bị bỏ),
   * vị trí = thứ tự trong HTML. Chạy trong transaction lưu landing (`queryable` = client) nên chỉ mục không bao giờ lệch HTML
   * đã commit.
   *
   * @param {{ landingId: number, ownerId: number, html: string, createdKinds?: Map<string, string>, queryable: object }} params
   *   `createdKinds`: publicKey → loại, cho biểu mẫu vừa tạo từ chỗ trống trong lượt lưu này (loại còn lại giữ như dòng cũ).
   */
  async syncLandingFormIndex({ landingId, ownerId, html, createdKinds = new Map(), queryable }) {
    const keys = listFormEmbedKeys(html);
    const found = await formRepository.findIdsByPublicKeysAndOwner(keys, ownerId, queryable);
    const idByKey = new Map(found.map((row) => [row.publicKey, Number(row.id)]));
    const entries = [];
    for (const key of keys) {
      const formId = idByKey.get(key);
      if (formId) entries.push({ formId, kind: createdKinds.get(key) ?? null });
    }
    return formRepository.replaceLandingForms(landingId, entries, queryable);
  }

  /**
   * @param {object} body
   * @param {{ id: number|string, role_code?: string }} authUser
   * @returns {Promise<object>}
   */
  async create(body, authUser) {
    const context = getWorkspaceContext(authUser);

    const limitCheck = await checkUserResourceLimit({
      userId: context.workspaceOwnerId,
      roleCode: authUser?.role,
      resourceKey: 'landingPages',
    });
    if (!limitCheck.allowed) {
      const err = new Error(limitCheck.message || 'Đã đạt giới hạn landing page cho tài khoản hiện tại');
      err.statusCode = 400;
      err.limitReached = true;
      throw err;
    }

    const slugRaw = body?.slug;
    const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : null;
    const domainType = body?.domainType === 'custom' ? 'custom' : 'system';
    const domainSubtype = domainType === 'custom'
      ? (body?.domainSubtype === 'apex' ? 'apex' : 'subdomain')
      : null;
    this.assertSlugFormat(slug);
    if (slug) {
      const existing = await landingPageRepository.findBySlugAny(slug);
      if (existing) {
        const err = new Error('Slug đã tồn tại');
        err.statusCode = 409;
        throw err;
      }
    }
    /** Merge `body.leadFormConfig` vào customConfig JSONB (giữ key khác nếu có). */
    const customConfig = mergeLeadFormIntoCustomConfig(
      {},
      body?.leadFormConfig
    );

    // PR-5b-2a — chỗ trống Biểu mẫu (không phụ thuộc AI_LANDING_FORM_MODE — người dùng có thể dán
    // tay <div data-founderai-form-slot></div>). Sai dạng / loại lạ / vượt trần kỹ thuật → 400, không lưu gì, không tạo gì.
    // PR-6: một trang có NHIỀU chỗ trống, mỗi chỗ có loại (`data-founderai-form-slot="booking"`; trần = consult) → mỗi chỗ tạo
    // MỘT biểu mẫu đúng loại, thay đúng chỗ đó bằng khối nhúng, theo thứ tự.
    // Landing CHƯA có id lúc này (insert bên dưới) nên tạo form TRƯỚC, ghi chỉ mục `landing_page_forms` NGAY TRONG transaction
    // insert landing (client.query bên dưới) — lỡ bước nào sau đó hỏng thì form (tạo qua pool, khác connection nên không tự
    // rollback theo) mồ côi tạm thời, dọn ở nhánh catch. Landing trong DB, nếu có, LUÔN mang HTML đã resolve — không bao
    // giờ lưu chỗ trống trơ (khách mở ra thấy khoảng trống im lặng).
    const rawHtml = body?.htmlContent ?? '';
    assertFormSlotsValid(rawHtml);
    const slots = listFormSlots(rawHtml);
    /** @type {Array<{ form: object, kind: string }>} */
    let createdForms = [];
    let htmlContent;
    let captureFieldWarning;
    try {
      let htmlWithFormResolved = rawHtml;
      if (slots.length > 0) {
        const baseTitle = String(body?.title || '').trim().slice(0, 200) || slug || 'Biểu mẫu landing';
        createdForms = await this.createFormsForSlots({
          kinds: slots.map((s) => s.kind),
          workspaceOwnerId: context.workspaceOwnerId,
          createdByUserId: context.actorUserId,
          baseTitle,
          leadForm: customConfig.leadForm,
        });
        htmlWithFormResolved = replaceFormSlotsWithEmbeds(
          rawHtml,
          createdForms.map(({ form }) => buildFormEmbedSectionHtml({
            publicKey: form.publicKey,
            origin: resolveFrontendOriginFromEnv(),
          }))
        );
      }

      // PLAN_TU_KHAI_BAO_TRUONG_FORM_LANDING_2026-09-16.md — tự khai báo ô form chưa khai báo
      // TRƯỚC khi ghi HTML cuối cùng, để "thêm ô Chức vụ" ra đủ trường VÀ dữ liệu được lưu ngay,
      // không bắt người dùng tự khai báo tay trước.
      htmlWithFormResolved = applyLeadFormAutoDeclare(htmlWithFormResolved, customConfig);

      /** Khi lưu: gỡ khối script cũ, đổi href http(s) sang link tracking, chèn lp-track.js + founderai-capture.js. */
      htmlContent = prepareLandingHtmlOnSave(htmlWithFormResolved, {
        slug,
        frontendOrigin: resolveFrontendOriginFromEnv(),
        apiBase: resolvePublicApiBaseFromEnv(),
      });

      // Câu 3 sếp hỏi 14/09 ("dữ liệu điền vào form sẽ lưu về chỗ nào?") — soi form
      // data-founderai-capture đối chiếu customFields đã khai báo, CHỈ cảnh báo không chặn lưu
      // (chuyên mục/form có ô lạ vẫn là trạng thái tạm hợp lệ, và đường AI dựng landing gọi save
      // liên tục — chặn ở đây là vỡ luồng đó). create() trước đây KHÔNG có kênh cảnh báo nào.
      captureFieldWarning = buildCaptureFieldAuditWarning(
        auditLandingCaptureFields(htmlContent, customConfig.leadForm)
      );
    } catch (prepError) {
      await this.deleteCreatedForms(createdForms, context.workspaceOwnerId);
      throw prepError;
    }
    const createdKinds = new Map(createdForms.map(({ form, kind }) => [form.publicKey, kind]));

    const client = await db.getClient();
    let lp;
    try {
      await client.query('BEGIN');
      await enforceResourceLimitTx(client, {
        userId: context.workspaceOwnerId,
        roleCode: authUser?.role,
        resourceKey: 'landingPages',
      });
      lp = await landingPageRepository.insert({
        slug,
        title: body?.title,
        htmlContent,
        isPublished: Boolean(body?.isPublished),
        idUser: context.workspaceOwnerId,
        workspaceOwnerId: context.workspaceOwnerId,
        createdBy: context.actorUserId,
        domainType,
        domainSubtype,
        customConfig,
      }, client);
      // PR-6: chỉ mục landing ↔ biểu mẫu ghi từ HTML ĐÃ LƯU, cùng transaction với INSERT landing.
      await this.syncLandingFormIndex({
        landingId: lp.id,
        ownerId: context.workspaceOwnerId,
        html: htmlContent,
        createdKinds,
        queryable: client,
      });
      await linkAssetsToLandingPage({
        html: htmlContent,
        ownerUserId: context.workspaceOwnerId,
        landingPageId: lp.id,
        client,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      // Form đã tạo (pool) nhưng landing chưa từng tồn tại (transaction rollback) → mồ côi,
      // dọn ngay thay vì để lại các Biểu mẫu không gắn landing nào, không ai biết tới.
      await this.deleteCreatedForms(createdForms, context.workspaceOwnerId);
      throw error;
    } finally {
      client.release();
    }

    const dto = toAdminLandingDto(lp);
    if (captureFieldWarning) {
      dto.warning = captureFieldWarning;
    }

    // Tự động cấp subdomain slug.founderai.biz qua Cloudflare (chỉ khi user chọn system domain
    // VÀ đã nhập slug). Nếu slug rỗng, không cấp subdomain miễn phí — landing phải gắn custom domain.
    // Lỗi CF không làm fail toàn bộ request.
    if (domainType === 'system' && slug) {
      const domainResult = await landingPageDomainService.autoProvisionSubdomain(lp.id, slug);
      return {
        ...dto,
        customDomain: domainResult.hostname,
        cfManaged: domainResult.cfManaged,
        customDomainProvisioned: domainResult.ok === true,
        customDomainMessage: domainResult.message || null,
      };
    }
    return dto;
  }

  /**
   * @param {number} id
   * @param {object} body
   * @param {{ id: number|string, role_code?: string }} authUser
   * @returns {Promise<object>}
   */
  async update(id, body, authUser) {
    const context = getWorkspaceContext(authUser);
    const scope = getWorkspaceScope(authUser);
    const slugRaw = body?.slug;
    const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : null;
    this.assertSlugFormat(slug);
    const current = await landingPageRepository.findByIdInScope(id, scope);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const resourceOwnerId = context.isSuperAdmin
      ? Number(current.workspaceOwnerId || current.idUser)
      : context.workspaceOwnerId;
    if (String(current.slug || '').trim().toLowerCase() === RESERVED_SLUG_FIXED_LANDING) {
      const err = new Error('Không được sửa bản ghi slug "l" — đây là landing hệ thống.');
      err.statusCode = 403;
      throw err;
    }
    await this.assertSlugNotTaken(slug, current.slug);

    /** Merge `body.leadFormConfig` vào customConfig hiện tại (giữ key khác nếu có). */
    const nextCustomConfig = mergeLeadFormIntoCustomConfig(
      current.customConfig,
      body?.leadFormConfig
    );

    // PR-5b-2a — chỗ trống Biểu mẫu (không phụ thuộc AI_LANDING_FORM_MODE — người dùng có thể dán
    // tay <div data-founderai-form-slot></div>). Sai dạng / loại lạ / vượt trần kỹ thuật → 400, không lưu gì.
    // PR-6: một trang có NHIỀU chỗ trống, mỗi chỗ có loại (`data-founderai-form-slot="booking"`; trần = consult):
    //  - chỗ trống CÓ GIÁ TRỊ LOẠI → luôn tạo biểu mẫu MỚI đúng loại;
    //  - chỗ trống TRẦN → tái dùng biểu mẫu consult/chưa rõ loại đã gắn trang này mà HTML không còn nhúng (trang AI viết lại
    //    cả trang, hoặc trình soạn bản cũ vẫn giữ chỗ trống): KHÔNG đẻ form mồ côi, KHÔNG ghi đè trường (chủ có thể đã tự sửa
    //    form trong trình soạn Biểu mẫu), nháp tắt xuất bản thì xuất bản lại; không có để tái dùng thì tạo biểu mẫu consult mới;
    //  - biểu mẫu CÓ SẴN chủ chọn (`linkedFormIds`) → nối vào cuối trang nếu HTML chưa nhúng.
    // Landing ĐÃ có id (khác create()) nhưng biểu mẫu mới vẫn tạo qua pool trước khi lưu → lưu hỏng thì dọn ở nhánh catch.
    const rawHtml = body?.htmlContent ?? '';
    assertFormSlotsValid(rawHtml);
    const slots = listFormSlots(rawHtml);
    const embeddedKeys = extractFormEmbedKeys(rawHtml);

    // PR-6 — biểu mẫu CÓ SẴN muốn gắn: `linkedFormIds` (mới) hoặc `linkedFormId` (cũ, PR-F). Bước này CHỈ ĐỌC + kiểm
    // (403/404/400) — chưa ghi gì, nên lỗi ở đây không để lại dấu vết. Không còn 409 "đã gắn trang khác": một biểu mẫu dùng
    // được cho nhiều landing.
    const linkInput = parseLinkedFormsInput(body);
    const requestedForms = await this.loadLinkableForms({ ids: linkInput.ids, resourceOwnerId, context });

    // slotPlan[i] = chỗ trống thứ i + biểu mẫu sẽ vào đó (null = phải tạo mới).
    const slotPlan = slots.map((slot) => ({ slot, form: null }));
    /** Biểu mẫu có sẵn cần nối vào cuối trang (HTML chưa nhúng, không có chỗ trống dành riêng). */
    const toAppend = [];
    if (linkInput.mode === 'legacySingle') {
      // Hợp đồng PR-F: biểu mẫu chọn thay đúng CHỖ TRỐNG TRẦN. Không có chỗ trống và cũng chưa nhúng → gắn xong khách vẫn không
      // thấy form, còn trợ lý AI lại coi "người đăng ký landing" là bài nộp của biểu mẫu → 0 người nhận trong im lặng. Báo
      // lỗi rõ thay vì gắn suông.
      const [chosen] = requestedForms;
      if (!embeddedKeys.has(chosen.publicKey)) {
        const target = slotPlan.find((p) => p.slot.bare);
        if (!target) {
          throw badRequest(
            'Trang chưa có vị trí để hiển thị biểu mẫu đã chọn (thiếu chỗ trống data-founderai-form-slot trong HTML).'
          );
        }
        target.form = chosen;
      }
    } else if (linkInput.mode === 'list') {
      for (const form of requestedForms) {
        if (!embeddedKeys.has(form.publicKey)) toAppend.push(form);
      }
      if (slots.length + listFormEmbedKeys(rawHtml).length + toAppend.length > MAX_FORMS_PER_LANDING) {
        throw badRequest(`Trang có quá nhiều biểu mẫu (tối đa ${MAX_FORMS_PER_LANDING}). Hãy bớt biểu mẫu trước khi lưu.`);
      }
    }

    // Chỗ trống TRẦN còn trống → tái dùng biểu mẫu đã gắn trang này (consult / chưa rõ loại) mà HTML không còn nhúng.
    if (slotPlan.some((p) => p.slot.bare && !p.form)) {
      const requestedIds = new Set(requestedForms.map((f) => Number(f.id)));
      const reuseQueue = (await formRepository.listByLandingPageId(id, resourceOwnerId)).filter(
        (f) =>
          !embeddedKeys.has(f.publicKey)
          && !requestedIds.has(Number(f.id))
          && !f.adminDisabledAt
          && (f.kind == null || f.kind === 'consult')
          // Đường cũ `linkedFormId: null` = chủ BỎ biểu mẫu đã chọn để quay về form cơ bản mới → không tái dùng đúng form đó.
          && !(linkInput.mode === 'legacyNull' && isChosenFormId(nextCustomConfig, f.id))
      );
      for (const p of slotPlan) {
        if (p.form || !p.slot.bare) continue;
        const reused = reuseQueue.shift();
        if (reused) p.form = reused;
      }
    }
    const slotsToCreate = slotPlan.filter((p) => !p.form);
    // Biểu mẫu có sẵn (chọn tay hoặc tái dùng) còn NHÁP → xuất bản trong cùng transaction lưu landing: khối nhúng vào form nháp
    // = khách bấm vào thấy "không tìm thấy biểu mẫu".
    const existingForms = [...requestedForms, ...slotPlan.filter((p) => p.form).map((p) => p.form)];
    const formsToPublish = existingForms.filter((f, index) => !f.isPublished && existingForms.findIndex((g) => g.id === f.id) === index);

    // PR-F — cờ "biểu mẫu do khách chọn" nằm ở custom_config của landing (xem isChosenFormId), CHỈ do đường tương thích cũ
    // (`linkedFormId`) ghi; ghi cùng câu UPDATE landing.
    if (linkInput.mode === 'legacySingle') {
      nextCustomConfig.chosenFormId = Number(requestedForms[0].id);
    } else if (linkInput.mode === 'legacyNull') {
      delete nextCustomConfig.chosenFormId;
    }

    /** @type {Array<{ form: object, kind: string }>} */
    let createdForms = [];
    let htmlContent;
    let captureFieldWarning;
    try {
      if (slotsToCreate.length > 0) {
        const baseTitle = String(body?.title || current.title || '').trim().slice(0, 200)
          || slug || current.slug || 'Biểu mẫu landing';
        createdForms = await this.createFormsForSlots({
          kinds: slotsToCreate.map((p) => p.slot.kind),
          workspaceOwnerId: resourceOwnerId,
          createdByUserId: context.actorUserId,
          baseTitle,
          leadForm: nextCustomConfig.leadForm,
        });
        slotsToCreate.forEach((p, index) => {
          p.form = createdForms[index].form;
        });
      }
      const embedOf = (form) => buildFormEmbedSectionHtml({
        publicKey: form.publicKey,
        origin: resolveFrontendOriginFromEnv(),
      });
      let htmlWithFormResolved = slotPlan.length > 0
        ? replaceFormSlotsWithEmbeds(rawHtml, slotPlan.map((p) => embedOf(p.form)))
        : rawHtml;
      if (toAppend.length > 0) {
        htmlWithFormResolved = appendBeforeBodyClose(htmlWithFormResolved, toAppend.map(embedOf).join('\n'));
      }

      // Câu 3 sếp hỏi 14/09 — xem chú thích cùng đoạn ở create() phía trên.
      htmlWithFormResolved = applyLeadFormAutoDeclare(htmlWithFormResolved, nextCustomConfig);

      htmlContent = prepareLandingHtmlOnSave(htmlWithFormResolved, {
        slug,
        frontendOrigin: resolveFrontendOriginFromEnv(),
        apiBase: resolvePublicApiBaseFromEnv(),
      });

      // Câu 3 sếp hỏi 14/09 — xem chú thích cùng đoạn ở create() phía trên.
      captureFieldWarning = buildCaptureFieldAuditWarning(
        auditLandingCaptureFields(htmlContent, nextCustomConfig.leadForm)
      );
    } catch (prepError) {
      await this.deleteCreatedForms(createdForms, resourceOwnerId);
      throw prepError;
    }
    const createdKinds = new Map(createdForms.map(({ form, kind }) => [form.publicKey, kind]));

    // ── Tên miền ──────────────────────────────────────────────────────────────────────────────
    // update() là đường LƯU NỘI DUNG trang, KHÔNG phải đường đăng ký tên miền riêng. Đường thật là
    // PUT /:id/custom-domain → landingPageDomainService.setHostname, tự đặt domain_type='custom' qua repository
    // (không đi qua đây) và dọn subdomain miễn phí đúng lúc; remove() tự đặt lại 'system'.
    // Trước đây body.domainType='custom' ở đây làm backend gỡ subdomain miễn phí mà KHÔNG đăng ký hostname nào →
    // trang mất link (production 03/10/2026: landing 50, 76, 88, 105). Nay: yêu cầu đổi sang 'custom' qua đường
    // này bị BỎ QUA (giữ domain_type hiện tại).
    const currentDomainType = current.domainType || 'system';
    const requestedDomainType = body?.domainType;
    if (requestedDomainType === 'custom' && currentDomainType !== 'custom') {
      console.warn(
        `[LandingPageAdmin.update] landing ${id}: bỏ qua domainType='custom' trong body — tên miền riêng chỉ đăng ký qua PUT /:id/custom-domain`
      );
    }
    // Hàng domain hiện có: quyết định theo LOẠI HÀNG (cf_managed), không theo body hay domain_type.
    const currentDomainRow = await landingPageDomainRepository.findByLandingPageId(id).catch(() => null);
    const hasCustomDomainRow = Boolean(currentDomainRow) && !currentDomainRow.cfManaged;
    const slugChanged = Boolean(slug) && slug !== current.slug;

    // custom → system (không còn giao diện nào gửi; giữ cho client API): cấp subdomain miễn phí TRƯỚC khi đổi
    // domain_type. upsertForLanding là ON CONFLICT (landing_page_id) nên hàng miễn phí THAY hàng tên miền riêng
    // trong MỘT câu lệnh — không có cửa sổ "mất cả hai", không cần removeSubdomain trước. Không có slug thì không
    // cấp được subdomain → bỏ qua yêu cầu, giữ nguyên 'custom' (đổi sang system lúc này sẽ để trang không còn link).
    let nextDomainType = currentDomainType;
    let domainTypeToWrite = null; // null = không đổi domain_type / domain_subtype (kể cả subdomain/apex của trang custom)
    if (requestedDomainType === 'system' && currentDomainType === 'custom') {
      if (slug) {
        // persistPendingOnFailure:false — cấp thất bại (Cloudflare lỗi) KHÔNG được upsert hàng pending đè hàng tên miền
        // riêng đang chạy (giống remove()); rowAfter bên dưới vẫn là hàng riêng → giữ 'custom'.
        await landingPageDomainService.autoProvisionSubdomain(id, slug, { persistPendingOnFailure: false }).catch((e) =>
          console.warn('[LandingPageAdmin.update] autoProvisionSubdomain on switch→system failed:', e.message)
        );
        const rowAfter = await landingPageDomainRepository.findByLandingPageId(id).catch(() => null);
        if (rowAfter?.cfManaged) {
          nextDomainType = 'system';
          domainTypeToWrite = 'system';
          if (currentDomainRow?.hostname) invalidateDomainResolverHost(currentDomainRow.hostname);
        } else {
          console.warn(
            `[LandingPageAdmin.update] landing ${id}: chưa cấp được subdomain miễn phí — giữ domain_type='custom'`
          );
        }
      } else {
        console.warn(`[LandingPageAdmin.update] landing ${id}: bỏ qua domainType='system' — trang chưa có slug để cấp subdomain`);
      }
    }

    // PR-6 — lưu landing + ghi lại chỉ mục `landing_page_forms` + xuất bản các biểu mẫu có sẵn còn nháp: MỘT transaction. Hỏng ở
    // bước nào thì hoàn tác cả ba (landing giữ HTML cũ, chỉ mục không lệch, biểu mẫu không bị xuất bản oan). KHÔNG BAO GIỜ xoá
    // biểu mẫu/bài nộp có sẵn — chỉ biểu mẫu MỚI dựng dở lượt này (createdForms, chưa có bài nộp nào) mới bị dọn khi lưu hỏng.
    const client = await db.getClient();
    let updated;
    try {
      await client.query('BEGIN');
      updated = await landingPageRepository.updateByIdInScope(id, {
        slug,
        title: body?.title,
        htmlContent,
        isPublished: body?.isPublished !== undefined ? Boolean(body.isPublished) : current.isPublished,
        idUser: resourceOwnerId,
        domainType: domainTypeToWrite,
        domainSubtype: null,
        customConfig: nextCustomConfig,
      }, scope, client);
      if (!updated) {
        const err = new Error('Không tìm thấy landing page');
        err.statusCode = 404;
        throw err;
      }
      for (const form of formsToPublish) {
        await formRepository.publishInTx(form.id, resourceOwnerId, client);
      }
      await this.syncLandingFormIndex({
        landingId: id,
        ownerId: resourceOwnerId,
        html: htmlContent,
        createdKinds,
        queryable: client,
      });
      await client.query('COMMIT');
    } catch (writeError) {
      await client.query('ROLLBACK').catch(() => {});
      await this.deleteCreatedForms(createdForms, resourceOwnerId);
      throw writeError;
    } finally {
      client.release();
    }

    await linkAssetsToLandingPage({
      html: htmlContent,
      ownerUserId: resourceOwnerId,
      landingPageId: id,
    });

    // Nếu HTML thay đổi và bản hiện tại đã có HTML, chụp lại phiên bản cũ lên GCS sau khi update DB thành công
    let snapshotWarning = null;
    if (current.htmlContent && current.htmlContent !== htmlContent) {
      const snapRes = await landingPageVersionService.createSnapshotIfChanged({
        landingPageId: id,
        workspaceOwnerId: resourceOwnerId,
        actorUserId: context.actorUserId,
        oldHtml: current.htmlContent,
        title: current.title,
        source: body?.versionSource || 'manual',
      }).catch((snapErr) => {
        console.warn('[LandingPageAdmin.update] createSnapshotIfChanged failed:', snapErr.message);
        return null;
      });
      if (snapRes?.warning) {
        snapshotWarning = snapRes.warning;
      }
    }

    // Đồng bộ DNS — CHỈ động tới hàng subdomain MIỄN PHÍ; hàng tên miền riêng (cf_managed=false) KHÔNG BAO GIỜ bị
    // xoá hay ghi đè ở đây (removeSubdomain xoá hàng bất kể loại, autoProvisionSubdomain upsert đè hàng theo
    // landing_page_id — gọi với trang có tên miền riêng là mất tên miền của khách):
    //  - custom → system: đã cấp subdomain miễn phí ở trên (domainTypeToWrite === 'system').
    //  - đổi slug, trang dùng tên miền miễn phí và KHÔNG có hàng tên miền riêng: gỡ hàng miễn phí cũ (nếu có) rồi cấp lại
    //    theo slug mới — hành vi cũ.
    //  - đổi slug, trang 'custom' hoặc có hàng tên miền riêng: không đụng domain (slug chỉ là đường dẫn nội bộ).
    if (slugChanged && domainTypeToWrite === null && nextDomainType === 'system' && !hasCustomDomainRow) {
      if (currentDomainRow?.cfManaged) {
        await landingPageDomainService.removeSubdomain(id).catch((e) =>
          console.warn('[LandingPageAdmin.update] removeSubdomain failed:', e.message)
        );
      }
      await landingPageDomainService.autoProvisionSubdomain(id, slug).catch((e) =>
        console.warn('[LandingPageAdmin.update] autoProvisionSubdomain failed:', e.message)
      );
    }

    // Invalidate L1 domain resolver caches & find domain hostname
    let activeHostname = null;
    try {
      invalidateDomainResolverPayload(id, current.slug);
      if (slug && slug !== current.slug) {
        invalidateDomainResolverPayload(id, slug);
      }
      const domainRow = await landingPageDomainRepository.findByLandingPageId(id).catch(() => null);
      if (domainRow?.hostname) {
        activeHostname = domainRow.hostname;
        invalidateDomainResolverHost(domainRow.hostname);
      }
    } catch (e) {
      console.warn('[LandingPageAdmin.update] cache invalidation failed:', e.message);
    }

    // Trigger non-blocking Cloudflare purge for updated page (both slug and hostname)
    cloudflareService.purgeLandingCache({
      slug: slug || current.slug,
      hostname: activeHostname,
    }).catch((e) =>
      console.warn('[LandingPageAdmin.update] Cloudflare purge failed:', e.message)
    );

    const dto = toAdminLandingDto(updated);
    // PR-F — trình soạn cần biết biểu mẫu đang gắn SAU lần lưu này (có thể vừa tự sinh / vừa đổi) để khỏi phải tải lại trang.
    const linkedNow = await formRepository.listByLandingPageId(id, resourceOwnerId).catch(() => []);
    Object.assign(dto, toLinkedFormsDto(linkedNow, updated.customConfig));
    // Gộp — không ghi đè: cảnh báo snapshot (bản GCS trước khi ghi đè) và cảnh báo ô form lạ là
    // hai chuyện độc lập, cả hai có thể cùng xảy ra trong một lần lưu.
    const combinedWarning = [snapshotWarning, captureFieldWarning].filter(Boolean).join(' ');
    if (combinedWarning && dto) {
      dto.warning = combinedWarning;
    }
    return dto;
  }

  /**
   * Cấp lại link miễn phí `<slug>.founderai.biz` cho trang `domain_type='custom'` mà không còn hàng tên miền nào
   * (production 03/10/2026: landing 50, 76, 88, 105 — gốc là lỗi "Lưu tên miền" cũ, đã chặn). Khách tự bấm "Dùng lại
   * link miễn phí" trong Cài đặt trang; PLAN_DUNG_LAI_LINK_MIEN_PHI_2026-10-03.md.
   *
   * Quy tắc:
   *  - Trang đang có hàng tên miền RIÊNG (`cf_managed=false`, kể cả chờ xác minh) → 409, KHÔNG xoá/ghi đè hàng đó (đường
   *    gỡ là DELETE /:id/custom-domain, tự cấp lại link miễn phí). Endpoint này không bao giờ đụng hàng tên miền riêng.
   *  - Trang đã có link miễn phí đang chạy và `domain_type='system'` → 200, không làm gì (gọi lại không hại).
   *  - Slug: body có thì dùng ĐÚNG luật của update() (assertSlugFormat: định dạng + slug dành riêng "l";
   *    assertSlugNotTaken: trùng trang khác → 409); không có thì dùng slug hiện tại; vẫn rỗng → 400.
   *  - Thứ tự: ghi slug (nếu đổi) → cấp subdomain → đổi domain_type. Lỗi giữa chừng không làm trang tệ hơn trước
   *    (domain_type vẫn 'custom', không hàng = như cũ). Cloudflare lỗi vẫn ghi hàng `pending_verification`
   *    `cf_managed=true` như trang mới tạo (trang này không có hàng tên miền riêng phải giữ) rồi đổi sang 'system'.
   *  - Slug đổi thì HTML lưu sẵn được chuẩn bị lại với slug mới (prepareLandingHtmlOnSave — script theo dõi / thu form
   *    mang `data-slug`; trang slug rỗng trước đó chưa có script nào), như mọi lần lưu trang.
   *
   * @param {number} id
   * @param {{ slug?: string }} body
   * @param {{ id: number|string, role_code?: string }} authUser
   * @returns {Promise<{ id: number, slug: string|null, domainType: string, restored: boolean, provisioned: boolean,
   *   message: string|null, domain: object }>}
   */
  async restoreFreeLink(id, body, authUser) {
    const context = getWorkspaceContext(authUser);
    const scope = getWorkspaceScope(authUser);
    const slugRaw = body?.slug;
    const bodySlug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : null;
    this.assertSlugFormat(bodySlug);
    const current = await landingPageRepository.findByIdInScope(id, scope);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const currentSlug = String(current.slug || '').trim().toLowerCase();
    if (currentSlug === RESERVED_SLUG_FIXED_LANDING) {
      const err = new Error('Không được sửa bản ghi slug "l" — đây là landing hệ thống.');
      err.statusCode = 403;
      throw err;
    }
    const resourceOwnerId = context.isSuperAdmin
      ? Number(current.workspaceOwnerId || current.idUser)
      : context.workspaceOwnerId;

    const row = await landingPageDomainRepository.findByLandingPageId(id);
    if (row && !row.cfManaged) {
      const err = new Error('Trang đang dùng tên miền riêng — hãy gỡ tên miền riêng trước, trang sẽ tự quay về link miễn phí.');
      err.statusCode = 409;
      throw err;
    }
    const currentDomainType = current.domainType || 'system';

    // Đã có link miễn phí đang chạy và đã ở chế độ miễn phí → không có gì để cấp lại.
    if (row?.status === 'active' && currentDomainType === 'system') {
      return {
        id: Number(id),
        slug: currentSlug || null,
        domainType: 'system',
        restored: false,
        provisioned: true,
        message: null,
        domain: await landingPageDomainService.getForLanding(id, authUser),
      };
    }

    const slug = bodySlug || currentSlug;
    if (!slug) {
      const err = new Error('Cần đặt đường dẫn (slug) trước khi dùng lại link miễn phí.');
      err.statusCode = 400;
      throw err;
    }
    await this.assertSlugNotTaken(slug, currentSlug);

    // 1) Ghi slug (nếu đổi) — cùng câu UPDATE với HTML đã chuẩn bị lại cho slug mới.
    let page = current;
    if (slug !== currentSlug) {
      const written = await landingPageRepository.updateByIdInScope(id, {
        slug,
        title: current.title,
        htmlContent: prepareLandingHtmlOnSave(current.htmlContent, {
          slug,
          frontendOrigin: resolveFrontendOriginFromEnv(),
          apiBase: resolvePublicApiBaseFromEnv(),
        }),
        isPublished: current.isPublished,
        idUser: resourceOwnerId,
        domainType: null,
        domainSubtype: null,
      }, scope);
      if (!written) {
        const err = new Error('Không tìm thấy landing page');
        err.statusCode = 404;
        throw err;
      }
      page = written;
    }

    // 2) Cấp subdomain miễn phí. Hàng miễn phí cũ lệch hostname (slug đã đổi) thì gỡ trước như update() để không mồ côi
    // bản ghi DNS cũ; hàng đã chạy đúng hostname thì giữ (chỉ còn thiếu domain_type — lần gọi trước dừng giữa chừng);
    // hàng chờ (cấp lỗi lần trước) cùng hostname thì cấp lại đè lên.
    const wantedHost = landingPageDomainService.freeHostnameFor(slug);
    const rowHost = String(row?.hostname || '').toLowerCase();
    const rowIsLive = row?.status === 'active' && rowHost === wantedHost;
    let provision = null;
    if (!rowIsLive) {
      if (row && rowHost !== wantedHost) {
        await landingPageDomainService.removeSubdomain(id).catch((e) =>
          console.warn('[LandingPageAdmin.restoreFreeLink] removeSubdomain failed:', e.message)
        );
      }
      provision = await landingPageDomainService.autoProvisionSubdomain(id, slug);
    }
    const rowAfter = await landingPageDomainRepository.findByLandingPageId(id);
    if (!rowAfter?.cfManaged) {
      // Cấp lỗi VÀ không ghi nổi hàng pending: không có hàng nào để trang trỏ tới → giữ nguyên domain_type, báo lỗi.
      const err = new Error(
        `Chưa cấp được link miễn phí ${provision?.hostname || wantedHost}. ${provision?.message || ''}`.trim()
      );
      err.statusCode = 502;
      throw err;
    }

    // 3) Đổi domain_type → 'system' (domain_subtype về NULL theo repository). Chỉ sau khi đã có hàng miễn phí.
    if (currentDomainType !== 'system') {
      const switched = await landingPageRepository.updateByIdInScope(id, {
        slug,
        title: page.title,
        htmlContent: page.htmlContent,
        isPublished: page.isPublished,
        idUser: resourceOwnerId,
        domainType: 'system',
        domainSubtype: null,
      }, scope);
      if (!switched) {
        const err = new Error('Không tìm thấy landing page');
        err.statusCode = 404;
        throw err;
      }
      page = switched;
    }

    try {
      invalidateDomainResolverPayload(id, current.slug);
      if (slug !== currentSlug) invalidateDomainResolverPayload(id, slug);
      if (rowAfter.hostname) invalidateDomainResolverHost(rowAfter.hostname);
    } catch (e) {
      console.warn('[LandingPageAdmin.restoreFreeLink] cache invalidation failed:', e.message);
    }
    cloudflareService.purgeLandingCache({ slug, hostname: rowAfter.hostname }).catch((e) =>
      console.warn('[LandingPageAdmin.restoreFreeLink] Cloudflare purge failed:', e.message)
    );

    const provisioned = rowAfter.status === 'active';
    return {
      id: Number(id),
      slug: page.slug || slug,
      domainType: page.domainType || 'system',
      restored: true,
      provisioned,
      message: provisioned ? null : (provision?.message || null),
      domain: await landingPageDomainService.getForLanding(id, authUser),
    };
  }

  /**
   * PR-6 — tải + kiểm CHỈ ĐỌC các biểu mẫu CÓ SẴN muốn gắn vào landing (`linkedFormIds` / `linkedFormId`), trước khi ghi bất
   * cứ thứ gì: nhân viên cần quyền `forms` (403) vì thao tác này đọc/gắn biểu mẫu của mục Biểu mẫu; biểu mẫu phải thuộc ĐÚNG
   * chủ workspace của landing (404); chưa bị quản trị khoá (400). KHÔNG còn 409 "đang dùng ở trang khác": một biểu mẫu dùng
   * được cho nhiều landing (bài nộp ghi `landingPageSlug` của từng trang nên vẫn phân biệt được nguồn).
   *
   * @param {{ ids: number[], resourceOwnerId: number, context: object }} params
   * @returns {Promise<object[]>} biểu mẫu (đúng thứ tự `ids`)
   */
  async loadLinkableForms({ ids, resourceOwnerId, context }) {
    if (ids.length === 0) return [];
    if (context.contextType === 'employee' && !context.isSuperAdmin && context.permissions?.forms !== true) {
      const err = new Error('Bạn không có quyền dùng biểu mẫu (mục Biểu mẫu) nên không gắn được biểu mẫu vào trang.');
      err.statusCode = 403;
      throw err;
    }
    const forms = [];
    for (const formId of ids) {
      const form = await formRepository.findFormByIdAndOwner(formId, resourceOwnerId);
      if (!form) {
        const err = new Error('Không tìm thấy biểu mẫu.');
        err.statusCode = 404;
        throw err;
      }
      if (form.adminDisabledAt) {
        throw badRequest('Biểu mẫu này đang bị quản trị viên khoá nên không dùng được.');
      }
      forms.push(form);
    }
    return forms;
  }

  /**
   * @param {number} id
   * @param {object} authUser
   * @returns {Promise<boolean>}
   */
  async remove(id, authUser) {
    const scope = getWorkspaceScope(authUser);
    const current = await landingPageRepository.findByIdInScope(id, scope);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    if (String(current.slug || '').trim().toLowerCase() === RESERVED_SLUG_FIXED_LANDING) {
      const err = new Error('Không được xóa landing slug "l" — đây là landing hệ thống.');
      err.statusCode = 403;
      throw err;
    }

    // Lấy domain record trước khi xóa
    let activeHostname = null;
    try {
      const domainRow = await landingPageDomainRepository.findByLandingPageId(id).catch(() => null);
      if (domainRow?.hostname) {
        activeHostname = domainRow.hostname;
      }
    } catch {
      // ignore
    }

    // Xóa subdomain Cloudflare trước khi xóa bản ghi (lỗi CF không fail request)
    await landingPageDomainService.removeSubdomain(id).catch((e) =>
      console.warn('[LandingPageAdmin.remove] removeSubdomain failed:', e.message)
    );

    const ok = await landingPageRepository.deleteByIdInScope(id, scope);
    if (!ok) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }

    // Invalidate L1 domain resolver cache
    try {
      invalidateDomainResolverPayload(id, current.slug);
      if (activeHostname) {
        invalidateDomainResolverHost(activeHostname);
      }
    } catch (e) {
      console.warn('[LandingPageAdmin.remove] cache invalidation failed:', e.message);
    }

    // Trigger non-blocking Cloudflare purge
    cloudflareService.purgeLandingCache({
      slug: current.slug,
      hostname: activeHostname,
    }).catch((e) =>
      console.warn('[LandingPageAdmin.remove] Cloudflare purge failed:', e.message)
    );

    return true;
  }


  /**
   * Lấy danh sách các phiên bản của landing page
   */
  async listVersions(id, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.listVersions(id, current.workspaceOwnerId || current.idUser);
  }

  /**
   * Xem trước nội dung HTML của một phiên bản
   */
  async previewVersion(id, versionId, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.getVersionHtml(
      versionId,
      id,
      current.workspaceOwnerId || current.idUser
    );
  }

  /**
   * Xóa một phiên bản lịch sử
   */
  async deleteVersion(id, versionId, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    return landingPageVersionService.deleteVersion(
      versionId,
      id,
      current.workspaceOwnerId || current.idUser
    );
  }

  /**
   * Lấy cấu hình Google Sheets sync của landing page.
   * DTO an toàn — không lộ secret.
   *
   * @param {number} id
   * @param {object} authUser
   */
  async getSheetsSync(id, authUser) {
    const current = await landingPageRepository.findByIdInScope(id, getWorkspaceScope(authUser));
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const cfg = (current.customConfig && current.customConfig.googleSheetsSync) || {};
    const webhookUrl = String(cfg.webhookUrl || '').trim();
    const sheetName = String(cfg.sheetName || '').trim();
    const hasSecret = Boolean(cfg.secret);
    return {
      enabled: Boolean(cfg.enabled),
      webhookUrl,
      sheetName,
      hasSecret,
      lastSyncAt: current.customConfig?.googleSheetsLastSyncAt || null,
      lastError: current.customConfig?.googleSheetsLastError || null,
    };
  }

  /**
   * Cập nhật cấu hình Google Sheets sync — lưu vào customConfig.googleSheetsSync.
   * Validate URL (chỉ https hoặc localhost).
   *
   * @param {number} id
   * @param {{enabled?: boolean, webhookUrl?: string, sheetName?: string, secret?: string|null}} body
   * @param {object} authUser
   */
  async updateSheetsSync(id, body, authUser) {
    const scope = getWorkspaceScope(authUser);
    const current = await landingPageRepository.findByIdInScope(id, scope);
    if (!current) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }

    const enabled = body?.enabled === true;
    const rawUrl = String(body?.webhookUrl || '').trim();
    const sheetName = String(body?.sheetName || '').trim().slice(0, 100);
    const incomingSecret = body?.secret;
    const removeSecret = incomingSecret === null || incomingSecret === '';

    let safeUrl = '';
    if (enabled) {
      if (!rawUrl) {
        const err = new Error('Bật sync thì phải nhập Webhook URL của Google Apps Script');
        err.statusCode = 400;
        throw err;
      }
      try {
        const u = new URL(rawUrl);
        const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        if (u.protocol !== 'https:' && !isLocal) {
          throw new Error('Webhook URL phải là https:// (Google Apps Script luôn dùng https)');
        }
        if (!/(^|\.)googleusercontent\.com$|(^|\.)script\.google\.com$|(^|\.)googleapis\.com$/.test(u.hostname) && !isLocal) {
          throw new Error('URL phải thuộc script.google.com hoặc *.googleusercontent.com (Google Apps Script)');
        }
        safeUrl = u.toString();
      } catch (e) {
        const err = new Error(e.message || 'Webhook URL không hợp lệ');
        err.statusCode = 400;
        throw err;
      }
    }

    // Merge vào customConfig hiện tại - không ghi đè các key khác
    const existingCustom = (current.customConfig && typeof current.customConfig === 'object')
      ? { ...current.customConfig }
      : {};
    delete existingCustom.__proto__;

    const nextSheetsSync = {
      enabled,
      webhookUrl: enabled ? safeUrl : '',
      sheetName,
    };
    if (removeSecret) {
      delete nextSheetsSync.secret;
    } else if (typeof incomingSecret === 'string' && incomingSecret.length > 0) {
      nextSheetsSync.secret = String(incomingSecret).slice(0, 200);
    } else if (existingCustom.googleSheetsSync?.secret) {
      nextSheetsSync.secret = existingCustom.googleSheetsSync.secret;
    }
    // Khi tắt → xóa hẳn để payload gọn
    if (!enabled) {
      delete existingCustom.googleSheetsSync;
    } else {
      existingCustom.googleSheetsSync = nextSheetsSync;
    }

    const updated = await landingPageRepository.updateByIdInScope(id, {
      customConfig: existingCustom,
    }, scope);
    if (!updated) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }

    return {
      enabled,
      webhookUrl: enabled ? safeUrl : '',
      sheetName,
      hasSecret: Boolean(nextSheetsSync.secret),
    };
  }
}

export default new LandingPageAdminService();

