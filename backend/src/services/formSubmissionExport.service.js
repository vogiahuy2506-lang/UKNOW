import exportRepository from '../repositories/formSubmissionExport.repository.js';
import { canonicalLandingPageSlug } from '../utils/landingPageSlugCanonical.util.js';
import {
  CSV_EXPORT_MAX_ROWS,
  formatCsvDateTimeVn,
  formatExportFileStamp,
  slugifyForFilename,
} from '../utils/csvExport.util.js';
import { answerCellText, buildAnswerColumns, resolveCsvLang } from '../utils/formAnswerCsv.util.js';

/**
 * Xuất CSV bài nộp biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c): tab "Từ biểu mẫu" của màn "Khách để lại thông tin"
 * (mọi biểu mẫu của workspace, theo bộ lọc đang áp) và trang bài nộp từng biểu mẫu (cột = nhãn trường của biểu mẫu đó).
 *
 * Service chỉ CHUẨN BỊ lần xuất — kiểm bộ lọc, chốt khung id, dựng tiêu đề cột — rồi trả một "kế hoạch" cho controller: kế hoạch có sẵn
 * `loadRows` / `toCells` để `streamCsv` đọc DB và ghi xuống kết nối từng lô. Mọi lỗi (bộ lọc sai, biểu mẫu không thuộc workspace) ném
 * TRƯỚC khi gửi byte đầu tiên nên controller vẫn trả được JSON lỗi.
 */

const TEXT = Object.freeze({
  vi: {
    time: 'Thời gian',
    form: 'Biểu mẫu',
    respondent: 'Người nộp',
    email: 'Email',
    phone: 'Số điện thoại',
    landing: 'Nguồn landing',
    utmSource: 'UTM source',
    utmMedium: 'UTM medium',
    utmCampaign: 'UTM campaign',
    utmContent: 'UTM content',
    utmTerm: 'UTM term',
    status: 'Trạng thái',
    consent: 'Đồng ý nhận tin',
    appointment: 'Giờ hẹn',
    paymentCode: 'Mã thanh toán',
    paymentAmount: 'Số tiền',
    answerSuffix: '(câu trả lời)',
    consentYes: 'Có',
    consentNo: 'Không',
    consentUnknown: 'Chưa hỏi',
    consentWithdrawn: 'Đã rút lại',
    statuses: {
      submitted: 'Đã nhận',
      confirmed: 'Đã xác nhận',
      pending_payment: 'Chờ thanh toán',
      hold_expired: 'Hết hạn thanh toán',
      cancelled: 'Đã huỷ',
    },
  },
  en: {
    time: 'Time',
    form: 'Form',
    respondent: 'Respondent',
    email: 'Email',
    phone: 'Phone',
    landing: 'Landing source',
    utmSource: 'UTM source',
    utmMedium: 'UTM medium',
    utmCampaign: 'UTM campaign',
    utmContent: 'UTM content',
    utmTerm: 'UTM term',
    status: 'Status',
    consent: 'Marketing consent',
    appointment: 'Appointment',
    paymentCode: 'Payment code',
    paymentAmount: 'Amount',
    answerSuffix: '(answer)',
    consentYes: 'Yes',
    consentNo: 'No',
    consentUnknown: 'Not asked',
    consentWithdrawn: 'Withdrawn',
    statuses: {
      submitted: 'Received',
      confirmed: 'Confirmed',
      pending_payment: 'Awaiting payment',
      hold_expired: 'Payment expired',
      cancelled: 'Cancelled',
    },
  },
});

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

function blankToNull(value) {
  return value === undefined || value === null || value === '' ? null : value;
}

/** Cùng quy tắc với `getSubmissionDisplayStatus` ở frontend: giữ chỗ quá hạn không phải trạng thái lưu trong DB. */
function displayStatusOf(row, nowMs) {
  if (row.status === 'pending_payment' && row.holdExpiresAt && new Date(row.holdExpiresAt).getTime() <= nowMs) {
    return 'hold_expired';
  }
  return row.status || 'submitted';
}

function consentText(row, text) {
  if (row.consentWithdrawnAt) return text.consentWithdrawn;
  if (row.marketingConsent === true) return text.consentYes;
  if (row.marketingConsent === false) return text.consentNo;
  return text.consentUnknown;
}

/**
 * Bộ lọc của tab "Từ biểu mẫu": formId · landingPageSlug · from · to (ngày YYYY-MM-DD giờ VN) — cùng quy tắc với
 * `formService.listWorkspaceSubmissions` để file xuất khớp đúng danh sách đang nhìn thấy.
 */
function parseWorkspaceFilters(query = {}) {
  const { formId, landingPageSlug, from, to } = query;

  let formIdFilter = null;
  if (formId !== undefined && formId !== null && formId !== '') {
    const parsed = Number.parseInt(String(formId), 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== String(formId).trim()) {
      throw createHttpError('Tham số formId không hợp lệ', 400, 'INVALID_FORM_ID');
    }
    formIdFilter = parsed;
  }

  const fromDate = blankToNull(from);
  const toDate = blankToNull(to);
  if ((fromDate && !isValidDateParam(fromDate)) || (toDate && !isValidDateParam(toDate))) {
    throw createHttpError('Tham số from/to không hợp lệ (định dạng YYYY-MM-DD)', 400, 'INVALID_DATE');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw createHttpError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc', 400, 'INVALID_DATE_RANGE');
  }
  const slugFilter = typeof landingPageSlug === 'string' ? canonicalLandingPageSlug(landingPageSlug) || null : null;
  return { formId: formIdFilter, landingPageSlug: slugFilter, from: fromDate, to: toDate };
}

/** Bảng chữ vi / en theo `lang` của request (mặc định vi). */
function resolveText(lang) {
  return TEXT[resolveCsvLang(lang)];
}

/**
 * @typedef {object} ExportPlan
 * @property {string} filename
 * @property {string[]} headerCells
 * @property {string[]} ids khung id đã chốt, đúng thứ tự xuất
 * @property {number} total tổng số bài khớp bộ lọc (có thể lớn hơn `ids.length`)
 * @property {boolean} truncated
 * @property {(ids: string[]) => Promise<object[]>} loadRows
 * @property {(row: object) => string|number} rowId
 * @property {(row: object) => unknown[]} toCells
 * @property {{ exportType: string, formId: number|null, filters: object, rowCount: number, totalMatched: number, truncated: boolean }} audit
 */

/**
 * Tab "Từ biểu mẫu": bài nộp của MỌI biểu mẫu trong workspace theo bộ lọc.
 *
 * @param {number|string} workspaceOwnerId lấy từ ngữ cảnh đã xác thực, không bao giờ từ query
 * @param {Record<string, unknown>} query formId · landingPageSlug · from · to
 * @param {{ lang?: string, now?: Date, maxRows?: number }} [options]
 * @returns {Promise<ExportPlan>}
 */
export async function prepareWorkspaceSubmissionsExport(workspaceOwnerId, query = {}, options = {}) {
  const { now = new Date(), maxRows = CSV_EXPORT_MAX_ROWS } = options;
  const text = resolveText(options.lang);
  const filters = parseWorkspaceFilters(query);

  if (filters.formId != null) {
    const owned = await exportRepository.listFormsForExport(workspaceOwnerId, [filters.formId]);
    if (owned.length === 0) throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');
  }

  const { ids, total } = await exportRepository.listSubmissionIdsForExport({ workspaceOwnerId, ...filters }, maxRows);
  const summary = await exportRepository.summarizeSubmissionIdsForExport(workspaceOwnerId, ids);
  const [forms, snapshotKeys] = await Promise.all([
    exportRepository.listFormsForExport(workspaceOwnerId, summary.formIds),
    exportRepository.listAnswerKeysForExport(workspaceOwnerId, ids),
  ]);

  const fixedColumns = [
    { header: text.time, cell: (row) => formatCsvDateTimeVn(row.createdAt) },
    { header: text.form, cell: (row) => row.formTitle },
    { header: text.respondent, cell: (row) => row.respondentName },
    { header: text.email, cell: (row) => row.respondentEmail },
    { header: text.phone, cell: (row) => row.respondentPhone },
    { header: text.landing, cell: (row) => row.landingPageSlug },
    { header: text.utmSource, cell: (row) => row.utmSource },
    { header: text.utmMedium, cell: (row) => row.utmMedium },
    { header: text.utmCampaign, cell: (row) => row.utmCampaign },
    { header: text.utmContent, cell: (row) => row.utmContent },
    { header: text.utmTerm, cell: (row) => row.utmTerm },
    { header: text.status, cell: (row, nowMs) => text.statuses[displayStatusOf(row, nowMs)] || row.status },
    { header: text.consent, cell: (row) => consentText(row, text) },
  ];
  const answerColumns = buildAnswerColumns({
    forms,
    snapshotKeys,
    fixedHeaders: fixedColumns.map((column) => column.header),
    answerSuffix: text.answerSuffix,
  });
  const nowMs = now.getTime();
  const lang = resolveCsvLang(options.lang);

  return {
    filename: `khach-de-lai-thong-tin-bieu-mau-${formatExportFileStamp(now)}.csv`,
    headerCells: [...fixedColumns.map((column) => column.header), ...answerColumns.map((column) => column.header)],
    ids,
    total,
    truncated: total > ids.length,
    loadRows: (batchIds) => exportRepository.findSubmissionsForExport(workspaceOwnerId, batchIds),
    rowId: (row) => row.id,
    toCells: (row) => [
      ...fixedColumns.map((column) => column.cell(row, nowMs)),
      // Cột của biểu mẫu khác để trống: mỗi cột câu trả lời thuộc đúng MỘT biểu mẫu.
      ...answerColumns.map((column) => (String(row.formId) === column.formId ? answerCellText(row.answers, column.key, lang) : '')),
    ],
    audit: {
      exportType: 'form_submissions_workspace',
      formId: filters.formId,
      filters: { ...filters },
      rowCount: ids.length,
      totalMatched: total,
      truncated: total > ids.length,
    },
  };
}

/**
 * Trang bài nộp của MỘT biểu mẫu: cột = nhãn trường của biểu mẫu đó. `query.date` là bộ lọc "ngày lịch hẹn" của trang (YYYY-MM-DD giờ VN).
 *
 * @param {number|string} workspaceOwnerId
 * @param {number|string} formId
 * @param {Record<string, unknown>} query date
 * @param {{ lang?: string, now?: Date, maxRows?: number }} [options]
 * @returns {Promise<ExportPlan>}
 */
export async function prepareFormSubmissionsExport(workspaceOwnerId, formId, query = {}, options = {}) {
  const { now = new Date(), maxRows = CSV_EXPORT_MAX_ROWS } = options;
  const text = resolveText(options.lang);

  const parsedFormId = Number.parseInt(String(formId), 10);
  if (!Number.isInteger(parsedFormId) || parsedFormId <= 0) {
    throw createHttpError('ID biểu mẫu không hợp lệ', 400, 'INVALID_ID');
  }
  const date = blankToNull(query.date);
  if (date && !isValidDateParam(date)) {
    throw createHttpError('Tham số date không hợp lệ (định dạng YYYY-MM-DD)', 400, 'INVALID_DATE');
  }

  const [form] = await exportRepository.listFormsForExport(workspaceOwnerId, [parsedFormId]);
  if (!form) throw createHttpError('Không tìm thấy biểu mẫu', 404, 'FORM_NOT_FOUND');

  const { ids, total } = await exportRepository.listSubmissionIdsForExport(
    { workspaceOwnerId, formId: parsedFormId, date },
    maxRows
  );
  const [summary, snapshotKeys] = await Promise.all([
    exportRepository.summarizeSubmissionIdsForExport(workspaceOwnerId, ids),
    exportRepository.listAnswerKeysForExport(workspaceOwnerId, ids),
  ]);

  // Cột lịch hẹn / thanh toán chỉ khi biểu mẫu đang bật hoặc có bài nộp mang giá trị đó (cùng ý với trang bài nộp).
  const showAppointment = Boolean(form.bookingConfig?.enabled) || summary.hasAppointment;
  const showPayment = Boolean(form.paymentConfig?.enabled) || summary.hasPayment;

  const fixedColumns = [
    { header: text.time, cell: (row) => formatCsvDateTimeVn(row.createdAt) },
    { header: text.respondent, cell: (row) => row.respondentName },
    { header: text.email, cell: (row) => row.respondentEmail },
    { header: text.phone, cell: (row) => row.respondentPhone },
    ...(showAppointment ? [{ header: text.appointment, cell: (row) => formatCsvDateTimeVn(row.appointmentAt) }] : []),
    { header: text.status, cell: (row, nowMs) => text.statuses[displayStatusOf(row, nowMs)] || row.status },
    ...(showPayment
      ? [
        { header: text.paymentCode, cell: (row) => row.paymentCode },
        { header: text.paymentAmount, cell: (row) => (row.paymentAmount == null ? '' : Number(row.paymentAmount)) },
      ]
      : []),
    { header: text.landing, cell: (row) => row.landingPageSlug },
    { header: text.utmSource, cell: (row) => row.utmSource },
    { header: text.utmMedium, cell: (row) => row.utmMedium },
    { header: text.utmCampaign, cell: (row) => row.utmCampaign },
    { header: text.utmContent, cell: (row) => row.utmContent },
    { header: text.utmTerm, cell: (row) => row.utmTerm },
    { header: text.consent, cell: (row) => consentText(row, text) },
  ];
  const answerColumns = buildAnswerColumns({
    forms: [form],
    snapshotKeys,
    fixedHeaders: fixedColumns.map((column) => column.header),
    answerSuffix: text.answerSuffix,
  });
  const nowMs = now.getTime();
  const lang = resolveCsvLang(options.lang);

  return {
    filename: `bai-nop-${slugifyForFilename(form.title)}-${formatExportFileStamp(now)}.csv`,
    headerCells: [...fixedColumns.map((column) => column.header), ...answerColumns.map((column) => column.header)],
    ids,
    total,
    truncated: total > ids.length,
    loadRows: (batchIds) => exportRepository.findSubmissionsForExport(workspaceOwnerId, batchIds),
    rowId: (row) => row.id,
    toCells: (row) => [
      ...fixedColumns.map((column) => column.cell(row, nowMs)),
      ...answerColumns.map((column) => answerCellText(row.answers, column.key, lang)),
    ],
    audit: {
      exportType: 'form_submissions_form',
      formId: parsedFormId,
      filters: { date },
      rowCount: ids.length,
      totalMatched: total,
      truncated: total > ids.length,
    },
  };
}

export default { prepareWorkspaceSubmissionsExport, prepareFormSubmissionsExport };
