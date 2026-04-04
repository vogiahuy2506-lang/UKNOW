import api from '../../../services/api.js';

/**
 * Chuẩn hóa query lọc lead landing (dùng chung list + export Excel).
 *
 * @param {object} params
 * @param {object} [opts]
 * @param {boolean} [opts.includePaging] Gắn page/pageSize (mặc định true)
 * @returns {Record<string, string|number>}
 */
function buildLandingLeadsFilterQuery(params = {}, opts = {}) {
  const includePaging = opts.includePaging !== false;
  const q = {
    landingLeadsUseDateRange:
      params.landingLeadsUseDateRange === true
      || params.landingLeadsUseDateRange === 'true'
      || params.landingLeadsUseDateRange === '1'
        ? 'true'
        : 'false',
    landingLeadsDateFrom: params.landingLeadsDateFrom || '',
    landingLeadsDateTo: params.landingLeadsDateTo || '',
    landingLeadsOccupations: JSON.stringify(
      Array.isArray(params.landingLeadsOccupations) ? params.landingLeadsOccupations : []
    ),
    landingLeadsInterests: JSON.stringify(
      Array.isArray(params.landingLeadsInterests) ? params.landingLeadsInterests : []
    ),
    landingLeadsSlugs: JSON.stringify(
      Array.isArray(params.landingLeadsSlugs) ? params.landingLeadsSlugs : []
    ),
  };
  if (includePaging) {
    q.page = params.page ?? 1;
    q.pageSize = params.pageSize ?? 20;
  }
  return q;
}

/**
 * Đọc thông báo lỗi từ body dạng Blob (khi request dùng responseType blob).
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function messageFromErrorBlob(blob) {
  try {
    const text = await blob.text();
    const j = JSON.parse(text);
    return j?.message || text || 'Yêu cầu thất bại';
  } catch {
    return 'Yêu cầu thất bại';
  }
}

/**
 * Gọi GET /api/leads — danh sách khách đăng ký từ form landing (có phân trang + lọc).
 *
 * @param {object} params
 * @param {number} [params.page]
 * @param {number} [params.pageSize]
 * @param {boolean} [params.landingLeadsUseDateRange]
 * @param {string} [params.landingLeadsDateFrom]
 * @param {string} [params.landingLeadsDateTo]
 * @param {string[]} [params.landingLeadsOccupations]
 * @param {string[]} [params.landingLeadsInterests]
 * @param {string[]} [params.landingLeadsSlugs] Slug landing; rỗng = mọi slug
 * @param {import('axios').AxiosRequestConfig} [options]
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
export async function fetchLandingLeadsAdminList(params = {}, options = {}) {
  const q = buildLandingLeadsFilterQuery(params, { includePaging: true });

  const { data } = await api.get('/leads', { params: q, ...options });
  if (!data?.success) {
    const err = new Error(data?.message || 'Không tải được danh sách');
    throw err;
  }
  return data.data;
}

/**
 * Tải GET /api/leads/export — file Excel theo cùng bộ lọc (đã áp dụng trên UI).
 *
 * Luồng hoạt động:
 * 1. Gọi API với `responseType: blob` và timeout dài hơn (file lớn).
 * 2. Nếu server trả JSON lỗi (content-type json), parse và ném lỗi.
 * 3. Tạo object URL và kích hoạt tải xuống; trả về cờ `truncated` từ header (giới hạn 10k dòng).
 *
 * @param {object} params Chỉ các trường lọc (giống list, không cần page)
 * @returns {Promise<{ truncated: boolean }>}
 */
export async function downloadLandingLeadsAdminExportXlsx(params = {}) {
  const q = buildLandingLeadsFilterQuery(params, { includePaging: false });

  try {
    const response = await api.get('/leads/export', {
      params: q,
      responseType: 'blob',
      timeout: 120000,
    });

    const ct = String(response.headers['content-type'] || '');
    if (ct.includes('application/json')) {
      const msg = await messageFromErrorBlob(response.data);
      throw new Error(msg);
    }

    const blob =
      response.data instanceof Blob ? response.data : new Blob([response.data]);

    const dispo = response.headers['content-disposition'] || '';
    let filename = 'landing-leads.xlsx';
    const m = /filename="?([^";\n]+)"?/i.exec(dispo);
    if (m?.[1]) {
      filename = m[1].trim();
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const truncated = String(response.headers['x-export-truncated'] || '').toLowerCase() === 'true';
    return { truncated };
  } catch (e) {
    const data = e?.response?.data;
    if (data instanceof Blob) {
      const msg = await messageFromErrorBlob(data);
      throw new Error(msg);
    }
    throw e;
  }
}
