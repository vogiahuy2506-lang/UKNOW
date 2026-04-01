import leadRepository from '../../repositories/lead.repository.js';
import { clampLandingLeadsLimit } from '../../utils/landingLeadsLimit.util.js';

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
    createdAt: row.createdAt || row.created_at,
  };
};

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

    const row = await leadRepository.insertLead({
      lastName,
      firstName,
      email,
      phone,
      occupation,
      interestArea,
      marketingConsent,
    });
    if (!row) {
      const err = new Error('Không thể lưu thông tin');
      err.statusCode = 500;
      throw err;
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
    const useDateRange = Boolean(config.landingLeadsUseDateRange);
    const dateFrom = String(config.landingLeadsDateFrom || '').trim() || null;
    const dateTo = String(config.landingLeadsDateTo || '').trim() || null;
    const occupations = Array.isArray(config.landingLeadsOccupations)
      ? config.landingLeadsOccupations.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const interests = Array.isArray(config.landingLeadsInterests)
      ? config.landingLeadsInterests.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const limit = clampLandingLeadsLimit(config.landingLeadsLimit, 1000);

    const filterBase = {
      useDateRange,
      dateFrom,
      dateTo,
      occupations,
      interests,
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
      }),
    ]);

    const items = rows.map(mapLeadRowToCampaignItem);
    return { items, total };
  }
}

export default new LeadService();
