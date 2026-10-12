import leadExportRepository from '../repositories/leadExport.repository.js';
import leadService, { mapLeadRowToAdminItem } from './lead/lead.service.js';
import { CUSTOM_FIELD_KEY_RE, FORBIDDEN_FIELD_KEYS } from '../utils/landingLeadFormConfig.util.js';
import { CSV_EXPORT_MAX_ROWS, formatCsvDateTimeVn, formatExportFileStamp } from '../utils/csvExport.util.js';
import { resolveCsvLang } from '../utils/formAnswerCsv.util.js';

/**
 * Xuất CSV khách từ landing page — tab "Từ landing page" của màn "Khách để lại thông tin" (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11,
 * PR-8c). Cột = cột của bản Excel sẵn có (`landingLeadsXlsxExport.util.js`) + MỌI trường tuỳ chỉnh có trong các khách được xuất; bộ lọc
 * đúng như danh sách (`GET /api/leads`): ngày · slug landing · nghề · lĩnh vực · bộ lọc trường tuỳ chỉnh.
 *
 * Như xuất bài nộp biểu mẫu, service chỉ CHUẨN BỊ (kiểm bộ lọc, chốt khung id, dựng tiêu đề) rồi trả kế hoạch cho `sendCsvExport`.
 */

const TEXT = Object.freeze({
  vi: {
    fullName: 'Họ và tên',
    email: 'Email',
    phone: 'Điện thoại',
    landing: 'Trang nguồn',
    occupation: 'Nghề',
    interest: 'Lĩnh vực quan tâm',
    consent: 'Đồng ý nhận tin',
    time: 'Thời gian đăng ký',
    consentYes: 'Có',
    consentNo: 'Không',
    consentUnknown: 'Chưa hỏi',
    consentWithdrawn: 'Đã rút lại',
  },
  en: {
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone',
    landing: 'Source page',
    occupation: 'Occupation',
    interest: 'Interest area',
    consent: 'Marketing consent',
    time: 'Signed up at',
    consentYes: 'Yes',
    consentNo: 'No',
    consentUnknown: 'Not asked',
    consentWithdrawn: 'Withdrawn',
  },
});

/** Giá trị hiển thị của một trường tuỳ chỉnh (ảnh chụp đã qua `sanitizeCustomFieldsSnapshotForAdmin`). */
function customFieldText(entry, lang) {
  if (!entry || typeof entry !== 'object') return '';
  const preferred = lang === 'en' ? [entry.displayEn, entry.displayVi] : [entry.displayVi, entry.displayEn];
  const shown = preferred.find((text) => typeof text === 'string' && text !== '');
  return shown ?? String(entry.value ?? '');
}

/**
 * Bộ lọc → bản gọn để ghi nhật ký (không kèm id workspace, bỏ giá trị rỗng).
 *
 * @param {object} config kết quả `parseLandingLeadFilters` (+ ngữ cảnh workspace)
 * @returns {object}
 */
export function summarizeLeadFiltersForAudit(config = {}) {
  const customFilters = Array.isArray(config.landingLeadsCustomFilters) ? config.landingLeadsCustomFilters : [];
  const summary = {};
  if (config.landingLeadsUseDateRange) {
    summary.dateFrom = config.landingLeadsDateFrom || null;
    summary.dateTo = config.landingLeadsDateTo || null;
  }
  if (config.landingLeadsOccupations?.length) summary.occupations = config.landingLeadsOccupations;
  if (config.landingLeadsInterests?.length) summary.interests = config.landingLeadsInterests;
  if (config.landingLeadsSlugs?.length) summary.slugs = config.landingLeadsSlugs;
  if (customFilters.length) summary.customFilters = customFilters.length;
  return summary;
}

/**
 * @param {object} config bộ lọc như `leadService.listAdminPaginated` + `workspaceOwnerId` + `isSuperAdmin`
 * @param {{ lang?: string, now?: Date, maxRows?: number }} [options]
 * @returns {Promise<import('./formSubmissionExport.service.js').ExportPlan>}
 */
export async function prepareLandingLeadsExport(config, options = {}) {
  const { now = new Date(), maxRows = CSV_EXPORT_MAX_ROWS } = options;
  const lang = resolveCsvLang(options.lang);
  const text = TEXT[lang];
  const workspaceOwnerId = config.workspaceOwnerId || config.idUser;

  const shared = await leadService.resolveSharedLeadFilters(config);
  const { ids, total } = await leadExportRepository.listLeadIdsForExport(shared, maxRows);

  // Cột trường tuỳ chỉnh: schema hiện tại trước (đúng thứ tự chủ đã sắp), rồi khoá còn sót trong bài cũ theo vần.
  const [currentSchemas, snapshotKeys] = await Promise.all([
    leadService.listCustomFieldDefinitions({ workspaceOwnerId, isSuperAdmin: config.isSuperAdmin }),
    leadExportRepository.listLeadCustomFieldKeys(workspaceOwnerId, ids),
  ]);
  const schemaLabelByKey = new Map(currentSchemas.filter((f) => f?.key).map((f) => [f.key, f.labelVi || null]));
  const snapshotLabelByKey = new Map(snapshotKeys.map((k) => [k.key, k.labelVi || null]));
  const validKey = (key) => CUSTOM_FIELD_KEY_RE.test(key) && !FORBIDDEN_FIELD_KEYS.has(key);
  const orderedKeys = [
    ...currentSchemas.map((f) => f.key).filter((key) => key && snapshotLabelByKey.has(key) && validKey(key)),
    ...snapshotKeys.map((k) => k.key).filter((key) => validKey(key) && !schemaLabelByKey.has(key)),
  ];
  const customColumns = orderedKeys.map((key) => ({
    key,
    header: `${schemaLabelByKey.get(key) || snapshotLabelByKey.get(key) || key} (${key})`,
  }));

  const fixedHeaders = [text.fullName, text.email, text.phone, text.landing, text.occupation, text.interest, text.consent, text.time];
  const consentOf = (item) => {
    if (item.consentWithdrawnAt) return text.consentWithdrawn;
    if (item.marketingConsent === true) return text.consentYes;
    if (item.marketingConsent === false) return text.consentNo;
    return text.consentUnknown;
  };

  return {
    filename: `khach-de-lai-thong-tin-landing-page-${formatExportFileStamp(now)}.csv`,
    headerCells: [...fixedHeaders, ...customColumns.map((column) => column.header)],
    ids,
    total,
    truncated: total > ids.length,
    loadRows: async (batchIds) => (await leadExportRepository.findLeadsForExport(workspaceOwnerId, batchIds)).map(mapLeadRowToAdminItem),
    rowId: (item) => item.id,
    toCells: (item) => [
      item.fullName,
      item.email,
      item.phone,
      item.landingPageSlug,
      item.occupation,
      item.interestArea,
      consentOf(item),
      formatCsvDateTimeVn(item.createdAt),
      ...customColumns.map((column) => customFieldText(item.customFields?.[column.key], lang)),
    ],
    audit: {
      exportType: 'landing_leads_csv',
      formId: null,
      filters: summarizeLeadFiltersForAudit(config),
      rowCount: ids.length,
      totalMatched: total,
      truncated: total > ids.length,
    },
  };
}

export default { prepareLandingLeadsExport, summarizeLeadFiltersForAudit };
