import leadRepository from '../../repositories/lead.repository.js';
import landingPageRepository from '../../repositories/landingPage.repository.js';
import landingPageEventRepository from '../../repositories/landingPageEvent.repository.js';
import { clampLandingLeadsLimit, MAX_LANDING_LEADS_LIMIT } from '../../utils/landingLeadsLimit.util.js';
import { buildLandingLeadsAdminXlsxBuffer } from '../../utils/landingLeadsXlsxExport.util.js';
import { canonicalLandingPageSlug } from '../../utils/landingPageSlugCanonical.util.js';
import {
  buildTrustedCustomFieldsSnapshot,
  customFieldsSnapshotToPrimitives,
  isInterestAreaVisible,
  isOccupationVisible,
  normalizeInterestAreaValue,
  normalizeOccupationValue,
  normalizePersistedLeadForm,
  sanitizeCustomFieldsSnapshotForAdmin,
  toPublicLeadFormConfig,
} from '../../utils/landingLeadFormConfig.util.js';
import { normalizeLandingLeadsCustomFilters } from '../../utils/landingLeadCustomFilters.util.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Chuẩn hóa số điện thoại: bỏ khoảng trắng, giữ ký tự số và dấu + đầu chuỗi nếu có.
 *
 * @param {string} raw
 * @returns {string}
 */
const normalizePhone = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  const noSpaces = s.replace(/\s+/g, '');
  return noSpaces;
};

/**
 * Map một dòng DB sang item dùng trong chiến dịch (email/Zalo): thêm `leadId`, `fullName`.
 *
 * @param {object} row
 * @returns {object}
 */
export const mapLeadRowToCampaignItem = (row) => {
  const lastName = String(row.lastName ?? row.last_name ?? '').trim();
  const firstName = String(row.firstName ?? row.first_name ?? '').trim();
  const fullName = `${lastName} ${firstName}`.trim();
  const id = row.id ?? row.leadId;
  return {
    leadId: id,
    id,
    lastName,
    firstName,
    fullName,
    email: String(row.email || '').trim().toLowerCase(),
    phone: normalizePhone(row.phone),
    occupation: String(row.occupation || '').trim(),
    interestArea: String(row.interestArea ?? row.interest_area ?? '').trim(),
    marketingConsent: Boolean(row.marketingConsent ?? row.marketing_consent),
    landingPageSlug: String(row.landingPageSlug ?? row.landing_page_slug ?? '').trim() || null,
    createdAt: row.createdAt || row.created_at,
    customFields: customFieldsSnapshotToPrimitives(row.customFields ?? row.custom_fields),
  };
};

export const mapLeadRowToAdminItem = (row) => {
  const item = mapLeadRowToCampaignItem(row);
  return {
    ...item,
    customFields: sanitizeCustomFieldsSnapshotForAdmin(row.customFields ?? row.custom_fields),
  };
};

/**
 * Chuẩn hóa trường lọc dạng mảng chuỗi từ config node / JSON DB.
 * Một số bản lưu có thể để chuỗi JSON thay vì mảng — khi đó filter cũ coi như rỗng hoặc sai.
 *
 * Luồng hoạt động:
 * 1. Nếu đã là mảng → trim từng phần tử, bỏ rỗng.
 * 2. Nếu là chuỗi không rỗng → thử JSON.parse; nếu ra mảng thì xử lý như bước 1.
 * 3. Còn lại → mảng rỗng.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeLeadFilterStringArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x ?? '').trim()).filter(Boolean);
      }
    } catch {
      // Không coi chuỗi đơn lẻ là một giá trị filter (tránh khớp nhầm)
    }
  }
  return [];
}

/**
 * Chuẩn hóa danh sách slug landing (lowercase để khớp `landing_page_slug`).
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeLeadFilterSlugArray(raw) {
  return normalizeLeadFilterStringArray(raw)
    .map((s) => s.toLowerCase())
    .filter(Boolean);
}

/**
 * Bật/tắt lọc khoảng ngày từ config (hỗ trợ 'true', '1').
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
function normalizeLeadUseDateRange(raw) {
  if (raw === true || raw === 1) return true;
  const s = String(raw || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function missingLandingError() {
  const err = new Error('Thiếu trang đích hợp lệ để ghi nhận lead');
  err.statusCode = 400;
  return err;
}

function hasCustomFilterPayload(raw) {
  if (raw == null || raw === '') return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return Boolean(trimmed) && trimmed !== '[]';
  }
  return true;
}

function buildSharedLeadFilters(config = {}, fieldTypeByKey) {
  return {
    useDateRange: normalizeLeadUseDateRange(config.landingLeadsUseDateRange),
    dateFrom: String(config.landingLeadsDateFrom || '').trim() || null,
    dateTo: String(config.landingLeadsDateTo || '').trim() || null,
    occupations: normalizeLeadFilterStringArray(config.landingLeadsOccupations),
    interests: normalizeLeadFilterStringArray(config.landingLeadsInterests),
    landingSlugs: normalizeLeadFilterSlugArray(config.landingLeadsSlugs),
    customFilters: normalizeLandingLeadsCustomFilters(config.landingLeadsCustomFilters, { fieldTypeByKey }),
    workspaceOwnerId: config.workspaceOwnerId || config.idUser || null,
  };
}

/**
 * Dịch vụ nghiệp vụ lead (form landing + preview/node).
 */
class LeadService {
  /**
   * Chuẩn hóa bộ lọc chung; khi có custom filter thì tra type từ schema workspace.
   * Field đã xóa (không còn trong schema) vẫn chạy operator cũ.
   *
   * @param {object} config
   * @returns {Promise<object>}
   */
  async resolveSharedLeadFilters(config = {}) {
    let fieldTypeByKey;
    if (hasCustomFilterPayload(config.landingLeadsCustomFilters) && (config.workspaceOwnerId || config.idUser || config.userId)) {
      const defs = await this.listCustomFieldDefinitions({
        workspaceOwnerId: config.workspaceOwnerId || config.idUser || config.userId,
        isSuperAdmin: config.isSuperAdmin,
      });
      fieldTypeByKey = new Map(defs.map((d) => [d.key, d.type]));
    }
    return buildSharedLeadFilters(config, fieldTypeByKey);
  }

  /**
   * Validate và tạo lead từ payload public API.
   *
   * Luồng hoạt động:
   * 1. Kiểm tra các trường bắt buộc, định dạng email, đồng ý marketing.
   * 2. Chuẩn hóa phone.
   * 3. INSERT và trả về bản ghi (kèm item campaign map).
   *
   * @param {object} body
   * @returns {Promise<{ row: object, item: object }>}
   */
  async createPublicLead(body) {
    const lastName = String(body?.lastName ?? body?.last_name ?? '').trim();
    const firstName = String(body?.firstName ?? body?.first_name ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const phone = normalizePhone(body?.phone);
    const marketingConsent = Boolean(body?.marketingConsent ?? body?.marketing_consent);

    if (!lastName || !firstName) {
      const err = new Error('Vui lòng nhập đầy đủ Họ và Tên');
      err.statusCode = 400;
      throw err;
    }
    if (!email || !EMAIL_RE.test(email)) {
      const err = new Error('Email không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    if (!phone || phone.replace(/\D/g, '').length < 8) {
      const err = new Error('Số điện thoại không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    if (!marketingConsent) {
      const err = new Error('Cần đồng ý nhận thông tin từ Founder AI');
      err.statusCode = 400;
      throw err;
    }

    const landingPageSlug = canonicalLandingPageSlug(
      body?.landingPageSlug ?? body?.landing_page_slug ?? ''
    );
    if (!landingPageSlug) {
      throw missingLandingError();
    }

    const lp = await landingPageRepository.findPublishedBySlug(landingPageSlug);
    if (!lp || !lp.idUser) {
      throw missingLandingError();
    }

    const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', lp.id)) {
      const err = new Error('Landing page tạm ngừng');
      err.statusCode = 503;
      err.code = 'RESOURCE_LOCKED';
      throw err;
    }

    const idUser = lp.idUser;
    const leadForm = normalizePersistedLeadForm(lp.customConfig);
    const occupation = isOccupationVisible(leadForm)
      ? normalizeOccupationValue(body?.occupation)
      : '';
    const interestArea = isInterestAreaVisible(leadForm)
      ? normalizeInterestAreaValue(body?.interestArea ?? body?.interest_area)
      : '';
    const customFieldsSnapshot = buildTrustedCustomFieldsSnapshot(leadForm, body?.customFields);

    const utmSource = body?.utmSource != null ? String(body.utmSource).trim().slice(0, 255) || null : null;
    const utmMedium = body?.utmMedium != null ? String(body.utmMedium).trim().slice(0, 255) || null : null;
    const utmCampaign = body?.utmCampaign != null ? String(body.utmCampaign).trim().slice(0, 255) || null : null;
    const utmContent = body?.utmContent != null ? String(body.utmContent).trim().slice(0, 255) || null : null;
    const utmTerm = body?.utmTerm != null ? String(body.utmTerm).trim().slice(0, 255) || null : null;

    const row = await leadRepository.insertLead({
      lastName,
      firstName,
      email,
      phone,
      occupation,
      interestArea,
      marketingConsent,
      landingPageSlug,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      idUser,
      workspaceOwnerId: idUser,
      customFields: customFieldsSnapshot,
    });
    if (!row) {
      const err = new Error('Không thể lưu thông tin');
      err.statusCode = 500;
      throw err;
    }

    try {
      await landingPageEventRepository.insert({
        eventType: 'submit',
        landingPageSlug,
        idUser,
        targetUrl: null,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        visitorId: body?.visitorId != null ? String(body.visitorId).trim().slice(0, 64) : null,
        referrer: body?.referrer != null ? String(body.referrer).trim().slice(0, 2000) : null,
        userAgent: null,
      });
    } catch (e) {
      console.warn('[LeadService] Không ghi landing_page_events submit:', e?.message || e);
    }

    return { row, item: mapLeadRowToCampaignItem(row) };
  }

  /**
   * Lấy danh sách lead cho preview / node `read_landing_leads` theo config.
   *
   * @param {object} config
   * @returns {Promise<{ items: object[], total: number }>}
   */
  async getLeadsForCampaignConfig(config = {}) {
    const shared = await this.resolveSharedLeadFilters(config);
    const limit = clampLandingLeadsLimit(config.landingLeadsLimit, 1000);
    const filterBase = { ...shared, limit };

    const [rows, total] = await Promise.all([
      leadRepository.findFiltered(filterBase),
      leadRepository.countFiltered(shared),
    ]);

    const items = rows.map(mapLeadRowToCampaignItem);
    return { items, total };
  }

  /**
   * Danh sách lead landing cho trang quản trị: lọc giống node/read_landing_leads, có phân trang offset.
   *
   * @param {object} config
   * @returns {Promise<{ items: object[], total: number, page: number, pageSize: number, totalPages: number }>}
   */
  async listAdminPaginated(config = {}) {
    const shared = await this.resolveSharedLeadFilters(config);
    const page = Math.max(1, parseInt(String(config.page), 10) || 1);
    const pageSize = Math.max(1, parseInt(String(config.pageSize), 10) || 20);
    const offset = (page - 1) * pageSize;
    const limit = clampLandingLeadsLimit(pageSize, 100);

    const [rows, total] = await Promise.all([
      leadRepository.findFiltered({ ...shared, limit, offset }),
      leadRepository.countFiltered(shared),
    ]);

    const items = rows.map(mapLeadRowToAdminItem);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { items, total, page, pageSize, totalPages };
  }

  /**
   * Xuất toàn bộ lead khớp bộ lọc admin ra buffer Excel (tối đa `MAX_LANDING_LEADS_LIMIT` dòng).
   *
   * @param {object} config
   * @returns {Promise<{ buffer: Buffer, total: number, exportedCount: number, truncated: boolean }>}
   */
  async exportAdminFilteredXlsx(config = {}) {
    const shared = await this.resolveSharedLeadFilters(config);
    const total = await leadRepository.countFiltered(shared);
    const fetchLimit = Math.min(total, MAX_LANDING_LEADS_LIMIT);

    const rows =
      fetchLimit > 0
        ? await leadRepository.findFiltered({
            ...shared,
            limit: fetchLimit,
            offset: 0,
          })
        : [];

    const items = rows.map(mapLeadRowToAdminItem);
    const currentSchemas = await this.listCustomFieldDefinitions({
      workspaceOwnerId: config.workspaceOwnerId || config.idUser,
      isSuperAdmin: config.isSuperAdmin,
    });
    const buffer = await buildLandingLeadsAdminXlsxBuffer(items, { currentSchemas });

    return {
      buffer,
      total,
      exportedCount: items.length,
      truncated: total > items.length,
    };
  }

  /**
   * Schema custom field hiện tại trong workspace (không gồm field đã xóa).
   *
   * @param {{ workspaceOwnerId?: number|string, isSuperAdmin?: boolean }} scope
   * @returns {Promise<object[]>}
   */
  async listCustomFieldDefinitions(scope = {}) {
    const rows = await landingPageRepository.listLeadFormConfigsInScope({
      workspaceOwnerId: scope.workspaceOwnerId || scope.userId || scope.idUser,
      isSuperAdmin: scope.isSuperAdmin,
    });
    const byKey = new Map();
    for (const row of rows) {
      const cfg = toPublicLeadFormConfig(row.customConfig);
      for (const field of cfg.customFields) {
        if (!byKey.has(field.key)) {
          byKey.set(field.key, {
            key: field.key,
            type: field.type,
            labelVi: field.labelVi,
            labelEn: field.labelEn,
            options: field.options,
          });
        }
      }
    }
    return [...byKey.values()];
  }
}

export default new LeadService();
