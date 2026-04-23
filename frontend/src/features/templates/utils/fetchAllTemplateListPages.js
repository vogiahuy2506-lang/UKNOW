/**
 * Gọi API danh sách template (email hoặc Zalo) có phân trang cho đến khi hết trang.
 * Backend mặc định limit nhỏ (10) nên cần gộp nhiều request khi dùng cho dropdown/thư viện đầy đủ.
 *
 * Luồng hoạt động:
 * 1. Gọi trang 1 với limit lớn (perPage).
 * 2. Đọc pagination.totalPages, lặp các trang còn lại.
 * 3. Gộp mảng items trả về.
 *
 * @param {(params: { page: number, limit: number }) => Promise<import('axios').AxiosResponse>} apiGet - Hàm gọi GET (vd. api.get với params)
 * @param {{ perPage?: number }} [options] - Số bản ghi mỗi trang (mặc định 200)
 * @returns {Promise<Array>} Danh sách item đã gộp
 */
export async function fetchAllTemplateListPages(apiGet, options = {}) {
  const perPage = options.perPage ?? 200;
  let page = 1;
  const aggregated = [];
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await apiGet({ page, limit: perPage });
    const items = response.data?.data?.items;
    const pagination = response.data?.data?.pagination;
    if (Array.isArray(items)) {
      aggregated.push(...items);
    }
    totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    page += 1;
    if (page > 1000) break;
  }

  return aggregated;
}

export default fetchAllTemplateListPages;
