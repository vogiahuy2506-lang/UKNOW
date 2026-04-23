import leadRepository from '../../repositories/lead.repository.js';
import landingPageEventRepository from '../../repositories/landingPageEvent.repository.js';
import { clampLandingLeadsLimit, MAX_LANDING_LEADS_LIMIT } from '../../utils/landingLeadsLimit.util.js';
import { buildLandingLeadsAdminXlsxBuffer } from '../../utils/landingLeadsXlsxExport.util.js';
import { canonicalLandingPageSlug } from '../../utils/landingPageSlugCanonical.util.js';

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

/**
 * Dịch vụ nghiệp vụ lead (form landing + preview/node).
 */
class LeadService {
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
    const occupation = String(body?.occupation ?? '').trim();
    const interestArea = String(body?.interestArea ?? body?.interest_area ?? '').trim();
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
    // Nghề nghiệp / lĩnh vực có thể để trống (khớp form landing công khai); DB vẫn nhận chuỗi rỗng (NOT NULL varchar).
    if (!marketingConsent) {
      const err = new Error('Cần đồng ý nhận thông tin từ UKnow');
      err.statusCode = 400;
      throw err;
    }

    // Chuẩn hóa slug: `/l` → `l`, tránh lọc admin (chọn `l`) không khớp DB
    const landingPageSlug = canonicalLandingPageSlug(
      body?.landingPageSlug ?? body?.landing_page_slug ?? ''
    );
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
    });
    if (!row) {
      const err = new Error('Không thể lưu thông tin');
      err.statusCode = 500;
      throw err;
    }

    if (landingPageSlug) {
      try {
        await landingPageEventRepository.insert({
          eventType: 'submit',
          landingPageSlug,
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
    const useDateRange = normalizeLeadUseDateRange(config.landingLeadsUseDateRange);
    const dateFrom = String(config.landingLeadsDateFrom || '').trim() || null;
    const dateTo = String(config.landingLeadsDateTo || '').trim() || null;
    const occupations = normalizeLeadFilterStringArray(config.landingLeadsOccupations);
    const interests = normalizeLeadFilterStringArray(config.landingLeadsInterests);
    const landingSlugs = normalizeLeadFilterSlugArray(config.landingLeadsSlugs);
    const limit = clampLandingLeadsLimit(config.landingLeadsLimit, 1000);

    const filterBase = {
      useDateRange,
      dateFrom,
      dateTo,
      occupations,
      interests,
      landingSlugs,
      limit,
    };

    const [rows, total] = await Promise.all([
      leadRepository.findFiltered(filterBase),
      leadRepository.countFiltered({
        useDateRange,
        dateFrom,
        dateTo,
        occupations,
        interests,
        landingSlugs,
      }),
    ]);

    const items = rows.map(mapLeadRowToCampaignItem);
    return { items, total };
  }

  /**
   * Danh sách lead landing cho trang quản trị: lọc giống node/read_landing_leads, có phân trang offset.
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa khoảng ngày / nghề / lĩnh vực từ query.
   * 2. Đếm tổng bản ghi khớp filter (không LIMIT).
   * 3. SELECT một trang với LIMIT + OFFSET.
   *
   * @param {object} config
   * @param {boolean} config.landingLeadsUseDateRange
   * @param {string} config.landingLeadsDateFrom
   * @param {string} config.landingLeadsDateTo
   * @param {string[]} config.landingLeadsOccupations
   * @param {string[]} config.landingLeadsInterests
   * @param {string[]} config.landingLeadsSlugs Slug landing (vd `l`); rỗng = không lọc theo slug
   * @param {number} config.page Trang (1-based)
   * @param {number} config.pageSize Số dòng mỗi trang (đã clamp ở controller)
   * @returns {Promise<{ items: object[], total: number, page: number, pageSize: number, totalPages: number }>}
   */
  async listAdminPaginated(config = {}) {
    const useDateRange = normalizeLeadUseDateRange(config.landingLeadsUseDateRange);
    const dateFrom = String(config.landingLeadsDateFrom || '').trim() || null;
    const dateTo = String(config.landingLeadsDateTo || '').trim() || null;
    const occupations = normalizeLeadFilterStringArray(config.landingLeadsOccupations);
    const interests = normalizeLeadFilterStringArray(config.landingLeadsInterests);
    const landingSlugs = normalizeLeadFilterSlugArray(config.landingLeadsSlugs);
    const page = Math.max(1, parseInt(String(config.page), 10) || 1);
    const pageSize = Math.max(1, parseInt(String(config.pageSize), 10) || 20);
    const offset = (page - 1) * pageSize;
    const limit = clampLandingLeadsLimit(pageSize, 100);

    const filterBase = {
      useDateRange,
      dateFrom,
      dateTo,
      occupations,
      interests,
      landingSlugs,
      limit,
      offset,
    };

    const [rows, total] = await Promise.all([
      leadRepository.findFiltered(filterBase),
      leadRepository.countFiltered({
        useDateRange,
        dateFrom,
        dateTo,
        occupations,
        interests,
        landingSlugs,
      }),
    ]);

    const items = rows.map(mapLeadRowToCampaignItem);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { items, total, page, pageSize, totalPages };
  }

  /**
   * Xuất toàn bộ lead khớp bộ lọc admin ra buffer Excel (tối đa `MAX_LANDING_LEADS_LIMIT` dòng).
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa filter giống `listAdminPaginated`.
   * 2. Đếm tổng → LIMIT = min(tổng, trần export).
   * 3. SELECT một lần (offset 0), map item, build workbook.
   *
   * @param {object} config Cùng các trường lọc như list admin (không cần page/pageSize)
   * @returns {Promise<{ buffer: Buffer, total: number, exportedCount: number, truncated: boolean }>}
   */
  async exportAdminFilteredXlsx(config = {}) {
    const useDateRange = normalizeLeadUseDateRange(config.landingLeadsUseDateRange);
    const dateFrom = String(config.landingLeadsDateFrom || '').trim() || null;
    const dateTo = String(config.landingLeadsDateTo || '').trim() || null;
    const occupations = normalizeLeadFilterStringArray(config.landingLeadsOccupations);
    const interests = normalizeLeadFilterStringArray(config.landingLeadsInterests);
    const landingSlugs = normalizeLeadFilterSlugArray(config.landingLeadsSlugs);

    const filterBase = {
      useDateRange,
      dateFrom,
      dateTo,
      occupations,
      interests,
      landingSlugs,
    };

    const total = await leadRepository.countFiltered(filterBase);
    const fetchLimit = Math.min(total, MAX_LANDING_LEADS_LIMIT);

    const rows =
      fetchLimit > 0
        ? await leadRepository.findFiltered({
            ...filterBase,
            limit: fetchLimit,
            offset: 0,
          })
        : [];

    const items = rows.map(mapLeadRowToCampaignItem);
    const buffer = await buildLandingLeadsAdminXlsxBuffer(items);

    return {
      buffer,
      total,
      exportedCount: items.length,
      truncated: total > items.length,
    };
  }
}

export default new LeadService();
