import customerReadRepository from '../../repositories/customer/customerRead.repository.js';
import {
  CUSTOMER_EXPORT_MAX_ROWS,
  buildCustomerCsvHeader,
  buildCustomerCsvRow,
} from '../../utils/customerCsv.util.js';

/** Chỉ nhận chuỗi — `?search=a&search=b` ra mảng, không được lọt xuống SQL. */
const asString = (value) => (typeof value === 'string' ? value : undefined);

class CustomerExportService {
  /**
   * Chuẩn bị file CSV khách theo ĐÚNG bộ lọc của danh sách (cùng `buildCustomerListFilter`, luôn giới hạn trong
   * workspace). Tối đa {@link CUSTOMER_EXPORT_MAX_ROWS} dòng: lấy trần + 1 để biết có bị cắt hay không.
   *
   * @param {object} input
   * @param {number} input.userId workspace owner
   * @param {object} [input.filters] { status, search, source, consentSource, emailStatus, campaignId }
   * @param {string} input.purchaseOrderStatusExpr
   * @returns {Promise<{ header: string, lines: string[], rowCount: number, truncated: boolean }>}
   */
  async buildCustomerCsv({ userId, filters = {}, purchaseOrderStatusExpr }) {
    const rows = await customerReadRepository.getCustomerExportRows({
      userId,
      status: asString(filters.status),
      search: asString(filters.search),
      source: asString(filters.source),
      consentSource: asString(filters.consentSource),
      emailStatus: asString(filters.emailStatus),
      campaignId: asString(filters.campaignId),
      purchaseOrderStatusExpr,
      limit: CUSTOMER_EXPORT_MAX_ROWS + 1,
    });

    const truncated = rows.length > CUSTOMER_EXPORT_MAX_ROWS;
    const exported = truncated ? rows.slice(0, CUSTOMER_EXPORT_MAX_ROWS) : rows;
    return {
      header: buildCustomerCsvHeader(),
      lines: exported.map(buildCustomerCsvRow),
      rowCount: exported.length,
      truncated,
    };
  }
}

export default new CustomerExportService();
