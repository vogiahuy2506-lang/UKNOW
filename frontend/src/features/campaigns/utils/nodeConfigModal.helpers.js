import campaignBuilderApiService from '../services/campaignBuilderApi.service';

export const withDefaultNodeRef = (mapping = {}, defaultNodeId = '') => ({
  mode: mapping.mode || 'node',
  nodeId: mapping.nodeId || defaultNodeId || '',
  field: mapping.field || '',
  value: mapping.value || '',
});

export const buildDefaultCustomerFieldMap = (input = {}, defaultNodeId = '') => ({
  email: withDefaultNodeRef(input.email, defaultNodeId),
  phone: withDefaultNodeRef(input.phone, defaultNodeId),
  fullName: withDefaultNodeRef(input.fullName, defaultNodeId),
  gender: withDefaultNodeRef(input.gender, defaultNodeId),
  customerSource: {
    ...withDefaultNodeRef(input.customerSource, defaultNodeId),
    mode: input.customerSource?.mode || 'manual',
    value: input.customerSource?.value || 'campaign',
  },
  notes: withDefaultNodeRef(input.notes, defaultNodeId),
  zaloId: withDefaultNodeRef(input.zaloId, defaultNodeId),
  zaloPhone: withDefaultNodeRef(input.zaloPhone, defaultNodeId),
});

export const normalizeTemplateVariables = (tpl) => {
  const keys = new Set();
  const addKey = (key) => {
    const normalized = String(key || '').trim();
    if (normalized) keys.add(normalized);
  };

  const vars = tpl?.variables;
  if (Array.isArray(vars)) {
    vars.forEach((item) => addKey(item?.key ?? item));
  } else if (typeof vars === 'string') {
    try {
      const parsed = JSON.parse(vars);
      if (Array.isArray(parsed)) parsed.forEach((item) => addKey(item?.key ?? item));
    } catch {
      // ignore invalid JSON
    }
  }

  const textToScan = `${tpl?.subject || ''}\n${tpl?.bodyHtml || ''}\n${tpl?.bodyText || ''}`;
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(textToScan))) addKey(match[1]);

  return Array.from(keys);
};

export const fetchTemplateDetail = async (templateId) => {
  if (!templateId) return null;
  const response = await campaignBuilderApiService.getEmailTemplateById(templateId);
  return response.data?.data || null;
};

export const fetchInterestedCourseOptions = async ({
  selectedIds = [],
  customerType = 'interested',
  dataSource = 'database',
  courseQuery = '',
  courseStatuses = [],
}) => {
  const params = new URLSearchParams();
  params.set('limit', '1');
  const validSelected = (Array.isArray(selectedIds) ? selectedIds : [])
    .map((value) => parseInt(value, 10))
    .filter((value, idx, arr) => Number.isFinite(value) && arr.indexOf(value) === idx);
  if (validSelected.length > 0) {
    params.set('courseIds', validSelected.join(','));
  }
  if (customerType && customerType !== 'interested') {
    params.set('customerType', customerType);
  }
  if (String(courseQuery || '').trim()) {
    params.set('courseQuery', String(courseQuery || '').trim());
  }
  const normalizedStatuses = (Array.isArray(courseStatuses) ? courseStatuses : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
  if (normalizedStatuses.length > 0) {
    params.set('courseStatuses', normalizedStatuses.join(','));
  }
  const response = await campaignBuilderApiService.getInterestedCustomersByQuery(params.toString(), dataSource);
  return Array.isArray(response.data?.data?.courses) ? response.data.data.courses : [];
};

export const fetchInterestedCustomerCoursesLocal = async ({ config = {} } = {}) => {
  const interestedLimit = Number.isFinite(parseInt(config.interestedLimit, 10))
    ? parseInt(config.interestedLimit, 10)
    : 1000;
  const limit = Math.max(1, Math.min(interestedLimit, 5000));
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const customerType = config.interestedCustomerType || 'interested';
  if (customerType !== 'interested') {
    params.set('customerType', customerType);
  }
  const selectedCourseIds = (Array.isArray(config.interestedCourseIds) ? config.interestedCourseIds : [])
    .map((value) => parseInt(value, 10))
    .filter((value, idx, arr) => Number.isFinite(value) && arr.indexOf(value) === idx);
  if (selectedCourseIds.length > 0) {
    params.set('courseIds', selectedCourseIds.join(','));
  }
  if (String(config.interestedCourseQuery || '').trim()) {
    params.set('courseQuery', String(config.interestedCourseQuery || '').trim());
  }
  const normalizedStatuses = (Array.isArray(config.interestedCourseStatuses) ? config.interestedCourseStatuses : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
  if (normalizedStatuses.length > 0) {
    params.set('courseStatuses', normalizedStatuses.join(','));
  }
  const dataSource = config.interestedDataSource || 'database';
  const response = await campaignBuilderApiService.getInterestedCustomersByQuery(params.toString(), dataSource);
  return response.data?.data || { items: [], pagination: { total: 0, limit } };
};

/**
 * Load Zalo account options used by campaign nodes.
 *
 * @returns {Promise<Array<{id: string, displayName: string, status: string, isActive: boolean, isDefault: boolean}>>}
 */
export const fetchZaloAccountOptions = async () => {
  const response = await campaignBuilderApiService.getZaloAccounts();
  const items = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
  return items.map((account) => ({
    id: String(account.id || ''),
    displayName: String(account.displayName || account.name || account.zaloName || 'Tài khoản Zalo'),
    status: String(account.status || 'disconnected'),
    isActive: account.isActive !== false,
    isDefault: account.isDefault === true,
  }));
};

/**
 * Resolve selection mode with backward compatibility from legacy selected IDs.
 *
 * @param {string|undefined|null} mode explicit mode from config
 * @param {Array<any>} selectedIds legacy selected IDs
 * @returns {'all'|'fixed'|'all_exclude'}
 */
const resolveSelectionMode = (mode, selectedIds = []) => {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'fixed' || normalized === 'all_exclude') {
    return normalized;
  }
  const hasLegacySelection = Array.isArray(selectedIds) && selectedIds.length > 0;
  return hasLegacySelection ? 'fixed' : 'all';
};

export const createNodeConfigFormData = ({
  config = {},
  label = '',
  normalizeEmailSteps = false,
}) => ({
  label: label || '',
  description: config.description || '',
  sheetUrl: config.sheetUrl || '',
  sheetName: config.sheetName || 'Sheet1',
  headerRow: config.headerRow || 1,
  dataStartRow: config.dataStartRow || 2,
  columns: config.columns || [],
  /** Danh sách tên cột giữ lại khi chạy node (rỗng = giữ tất cả) */
  dataSelectedColumns: Array.isArray(config.dataSelectedColumns) ? config.dataSelectedColumns : [],
  /**
   * Giới hạn dòng khi chạy thử read_sheet trên Builder (preview API).
   * Rỗng = mặc định 100 dòng; `all` = tối đa theo server.
   */
  builderSheetPreviewRowLimit: config.builderSheetPreviewRowLimit ?? '',
  interestedLimit: config.interestedLimit || 1000,
  interestedCourseIds: Array.isArray(config.interestedCourseIds) ? config.interestedCourseIds : [],
  interestedCourseStatuses: Array.isArray(config.interestedCourseStatuses) ? config.interestedCourseStatuses : [],
  interestedCourseQuery: config.interestedCourseQuery || '',
  interestedCustomerType: config.interestedCustomerType || 'interested',
  interestedSelectionMode: resolveSelectionMode(
    config.interestedSelectionMode,
    Array.isArray(config.interestedSelectedCustomerIds) ? config.interestedSelectedCustomerIds : []
  ),
  interestedSelectedCustomerIds: Array.isArray(config.interestedSelectedCustomerIds)
    ? config.interestedSelectedCustomerIds
    : [],
  interestedExcludedCustomerIds: Array.isArray(config.interestedExcludedCustomerIds)
    ? config.interestedExcludedCustomerIds
    : [],
  interestedDataSource: config.interestedDataSource || 'database',
  coursesDbSearchTerm: config.coursesDbSearchTerm || '',
  coursesDbLimit: config.coursesDbLimit || 1000,
  coursesDbStatuses: Array.isArray(config.coursesDbStatuses) ? config.coursesDbStatuses : [],
  coursesDbSelectedIds: Array.isArray(config.coursesDbSelectedIds) ? config.coursesDbSelectedIds : [],
  mappingTemplateId: config.mappingTemplateId || '',
  mappings: config.mappings || [{ variableName: '', sourceType: 'column', columnName: '', formula: '' }],
  saveCustomerNodeId: config.saveCustomerNodeId || '',
  saveCustomerUpsertBy: config.saveCustomerUpsertBy || 'email_or_phone',
  saveCustomerFieldMap: buildDefaultCustomerFieldMap(config.saveCustomerFieldMap || {}, config.saveCustomerNodeId || ''),
  saveCustomerCustomFields: Array.isArray(config.saveCustomerCustomFields)
    ? config.saveCustomerCustomFields.map((item) => ({
        ...item,
        nodeId: item?.nodeId || config.saveCustomerNodeId || '',
      }))
    : [],
  emailTemplateId: config.emailTemplateId || '',
  emailSubject: config.emailSubject || '',
  fromEmailId: config.fromEmailId || '',
  maxSendEnabled: config.maxSendEnabled || false,
  maxSendCount: config.maxSendCount || 100,
  recipientMode: 'multiple',
  sendMode: config.sendMode || 'all',
  recipientSource: config.recipientSource || 'manual',
  recipientColumn: config.recipientColumn || '',
  recipientEmails: config.recipientEmails || '',
  recipientNodeId: config.recipientNodeId || '',
  recipientField: config.recipientField || '',
  recipientFormula: config.recipientFormula || '',
  sendAllAtOnce: config.sendAllAtOnce || false,
  sendDelayMs: config.sendDelayMs || 0,
  emailSteps: normalizeEmailSteps
    ? (config.emailSteps || []).map((item) => ({
        delayFrom: item.delayFrom || 'start',
        enableLinkTracking: item.enableLinkTracking !== false,
        ...item,
      }))
    : config.emailSteps || [],
  ccEnabled: config.ccEnabled || false,
  ccSource: config.ccSource || 'manual',
  ccEmails: config.ccEmails || '',
  ccNodeId: config.ccNodeId || '',
  ccField: config.ccField || '',
  bccEnabled: config.bccEnabled || false,
  bccSource: config.bccSource || 'manual',
  bccEmails: config.bccEmails || '',
  bccNodeId: config.bccNodeId || '',
  bccField: config.bccField || '',
  variableMapping: config.variableMapping || {},
  saveMessageLog: config.saveMessageLog !== false,
  zaloAccountId: config.zaloAccountId || '',
  zaloAccountName: config.zaloAccountName || '',
  /** Pool đa TK: cấu hình tại node «Chọn tài khoản Zalo» */
  zaloPoolMultiAccountEnabled: Boolean(config.zaloPoolMultiAccountEnabled),
  zaloPoolAccountIds: Array.isArray(config.zaloPoolAccountIds) ? config.zaloPoolAccountIds : [],
  /** Legacy (trước khi chuyển pool sang node chọn TK) — vẫn đọc để tương thích khi chạy server */
  zaloPersonalMultiAccountEnabled: Boolean(config.zaloPersonalMultiAccountEnabled),
  zaloPersonalAccountIds: Array.isArray(config.zaloPersonalAccountIds) ? config.zaloPersonalAccountIds : [],
  zaloFriendMultiAccountEnabled: Boolean(config.zaloFriendMultiAccountEnabled),
  zaloFriendAccountIds: Array.isArray(config.zaloFriendAccountIds) ? config.zaloFriendAccountIds : [],
  zaloRecipientType: config.zaloRecipientType || 'phone',
  zaloRecipientSource: config.zaloRecipientSource || 'manual',
  zaloRecipientPhones: config.zaloRecipientPhones || '',
  zaloRecipientNodeId: config.zaloRecipientNodeId || '',
  zaloRecipientField: config.zaloRecipientField || '',
  zaloPersonalSendMode: config.zaloPersonalSendMode || 'all',
  zaloPersonalTemplateSteps: Array.isArray(config.zaloPersonalTemplateSteps)
    ? config.zaloPersonalTemplateSteps.map((item) => ({
        delayFrom: item.delayFrom || 'start',
        enableLinkTracking: item.enableLinkTracking !== false,
        ...item,
      }))
    : [],
  zaloMessage: config.zaloMessage || '',
  zaloFriendSource: config.zaloFriendSource || 'manual',
  zaloFriendPhones: config.zaloFriendPhones || '',
  zaloFriendNodeId: config.zaloFriendNodeId || '',
  zaloFriendField: config.zaloFriendField || '',
  zaloFriendContentMode: config.zaloFriendContentMode || 'manual',
  zaloFriendRequestMessage: config.zaloFriendRequestMessage || '',
  zaloFriendTemplateId: config.zaloFriendTemplateId || '',
  zaloFriendTemplateBody: config.zaloFriendTemplateBody || '',
  zaloFriendTemplateMappings: Array.isArray(config.zaloFriendTemplateMappings)
    ? config.zaloFriendTemplateMappings.map((mapping) => ({
        ...mapping,
        sourceType: mapping?.sourceType === 'recipient_field'
          ? 'node'
          : (mapping?.sourceType || 'manual'),
        nodeId: mapping?.nodeId || config.zaloFriendNodeId || '',
        field: mapping?.field || '',
        value: mapping?.value || '',
      }))
    : [],
  zaloGroupSource: config.zaloGroupSource || 'manual',
  zaloGroupIds: config.zaloGroupIds || '',
  zaloGroupNodeId: config.zaloGroupNodeId || '',
  zaloGroupField: config.zaloGroupField || '',
  zaloGroupSendMode: config.zaloGroupSendMode || 'all',
  zaloGroupTemplateSteps: Array.isArray(config.zaloGroupTemplateSteps)
    ? config.zaloGroupTemplateSteps.map((item) => ({
        delayFrom: item.delayFrom || 'start',
        enableLinkTracking: item.enableLinkTracking !== false,
        ...item,
      }))
    : [],
  zaloGroupMessage: config.zaloGroupMessage || '',
  zaloFriendsCount: config.zaloFriendsCount || 200,
  zaloFriendsPage: config.zaloFriendsPage || 1,
  zaloFriendSelectionMode: resolveSelectionMode(
    config.zaloFriendSelectionMode,
    Array.isArray(config.zaloSelectedFriendIds) ? config.zaloSelectedFriendIds : []
  ),
  zaloSelectedFriendIds: Array.isArray(config.zaloSelectedFriendIds) ? config.zaloSelectedFriendIds : [],
  zaloExcludedFriendIds: Array.isArray(config.zaloExcludedFriendIds) ? config.zaloExcludedFriendIds : [],
  zaloFriendAccountNodeId: config.zaloFriendAccountNodeId || '',
  zaloSelectedGroupIds: Array.isArray(config.zaloSelectedGroupIds) ? config.zaloSelectedGroupIds : [],
  zaloGroupSelectionSnapshotLocked: Boolean(config.zaloGroupSelectionSnapshotLocked),
  zaloGroupAccountNodeId: config.zaloGroupAccountNodeId || '',
  triggerType: config.triggerType || 'object',
  object: config.object || 'Quote',
  condition: config.condition || 'updated',
  hasExtraCondition: config.hasExtraCondition || false,
  extraCondition: config.extraCondition || 'new_value_match',
  applyFields: config.applyFields || ['Hợp đồng'],
  logicType: config.logicType || 'AND',
  conditions: config.conditions || [{ field: 'Hợp đồng', operator: 'not_empty', value: '' }],
  landingLeadsUseDateRange: Boolean(config.landingLeadsUseDateRange),
  landingLeadsDateFrom: config.landingLeadsDateFrom || '',
  landingLeadsDateTo: config.landingLeadsDateTo || '',
  landingLeadsOccupations: Array.isArray(config.landingLeadsOccupations) ? config.landingLeadsOccupations : [],
  landingLeadsInterests: Array.isArray(config.landingLeadsInterests) ? config.landingLeadsInterests : [],
  landingLeadsSlugs: Array.isArray(config.landingLeadsSlugs) ? config.landingLeadsSlugs : [],
  landingLeadsLimit: config.landingLeadsLimit || 1000,
});

/**
 * Validate Google Sheet connection and sync columns into form data.
 *
 * @param {Object} params action params
 * @param {Function} params.onCheckSheetConnection callback injected from parent
 * @param {Object} params.formData current node form data
 * @param {Function} params.setFormData React state setter for form data
 * @param {Function} params.setIsCheckingSheet React state setter for loading state
 * @param {{success: Function, error: Function}} params.toastNotifier toast facade
 * @returns {Promise<Array|null>} resolved columns or null when failed
 */
export const handleNodeSheetConnectionCheck = async ({
  onCheckSheetConnection,
  formData,
  setFormData,
  setIsCheckingSheet,
  toastNotifier,
}) => {
  if (!onCheckSheetConnection) return null;
  if (!String(formData?.sheetUrl || '').trim()) {
    toastNotifier.error('Vui lòng nhập URL Google Sheet');
    return null;
  }

  try {
    setIsCheckingSheet(true);
    const data = await onCheckSheetConnection(formData);
    const columns = Array.isArray(data?.columns) ? data.columns : [];
    setFormData((prev) => ({ ...prev, columns }));
    toastNotifier.success(
      columns.length
        ? `Kết nối sheet. Đã lấy ${columns.length} cột`
        : 'Kết nối sheet OK.'
    );
    return columns;
  } catch (error) {
    // Keep error handling parity with previous inline logic.
    console.error('Check sheet connection error:', error);
    const msg =
      error.response?.data?.message ||
      error.message ||
      'Không thể kiểm tra kết nối Google Sheet';
    toastNotifier.error(typeof msg === 'string' ? msg : 'Không thể kiểm tra kết nối Google Sheet');
    return null;
  } finally {
    setIsCheckingSheet(false);
  }
};

/**
 * Load course preview list for `read_courses_db` node configuration.
 *
 * @param {Object} params action params
 * @param {Object} params.formData current node form data
 * @param {Function} params.setIsLoadingCoursesPreview React state setter for loading flag
 * @param {Function} params.setCoursesPreviewItems React state setter for course list
 * @param {{success: Function, error: Function}} params.toastNotifier toast facade
 * @returns {Promise<void>}
 */
export const handleNodeCoursesPreviewLoad = async ({
  formData,
  setIsLoadingCoursesPreview,
  setCoursesPreviewItems,
  toastNotifier,
}) => {
  try {
    setIsLoadingCoursesPreview(true);
    const selectedStatuses = (Array.isArray(formData?.coursesDbStatuses) ? formData.coursesDbStatuses : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
    const params = {
      limit: formData?.coursesDbLimit || 1000,
    };
    if (formData?.coursesDbSearchTerm) {
      params.search = formData.coursesDbSearchTerm;
    }
    if (selectedStatuses.length > 0) {
      params.status = selectedStatuses.join(',');
    }

    const response = await campaignBuilderApiService.getCourses(params);
    const courses = response.data?.data?.courses || [];
    setCoursesPreviewItems(courses);
    toastNotifier.success(`Đã tải ${courses.length} khóa học`);
  } catch (error) {
    console.error('Load courses preview error:', error);
    const msg = error.response?.data?.message || error.message || 'Không thể tải danh sách khóa học';
    toastNotifier.error(typeof msg === 'string' ? msg : 'Không thể tải danh sách khóa học');
    setCoursesPreviewItems([]);
  } finally {
    setIsLoadingCoursesPreview(false);
  }
};

/**
 * Select a mapping template and build variable mappings.
 *
 * @param {Object} params action params
 * @param {string|number} params.templateId selected template id from UI
 * @param {Function} params.setMappingTemplate React state setter for selected template
 * @param {Function} params.setFormData React state setter for node form data
 * @returns {Promise<void>}
 */
export const handleMappingTemplateSelect = async ({
  templateId,
  setMappingTemplate,
  setFormData,
}) => {
  const id = parseInt(templateId, 10);
  if (!id) {
    setMappingTemplate(null);
    setFormData((prev) => ({ ...prev, mappingTemplateId: '', mappings: prev.mappings }));
    return;
  }

  const tpl = await fetchTemplateDetail(id);
  setMappingTemplate(tpl);

  const variables = normalizeTemplateVariables(tpl);
  setFormData((prev) => {
    const existing = new Map((prev.mappings || []).map((m) => [m.variableName, m]));
    const nextMappings = variables.length
      ? variables.map((v) => existing.get(v) || { variableName: v, sourceType: 'column', columnName: v, formula: '' })
      : prev.mappings;
    return {
      ...prev,
      mappingTemplateId: id,
      mappings: nextMappings,
    };
  });
};

/**
 * Save node configuration with node-type specific pre-checks.
 *
 * @param {Object} params action params
 * @param {string} params.nodeType current node type
 * @param {Object} params.formData current node form data
 * @param {Function} params.onSave save callback from modal parent
 * @param {Function} params.handleCheckSheetConnection local sheet-check handler
 * @param {Function} params.setIsLoadingTestPreview React state setter for loading flag
 * @param {{success: Function, error: Function}} params.toastNotifier toast facade
 * @param {number|string|null} params.campaignId current campaign id
 * @returns {Promise<void>}
 */
export const handleNodeConfigSaveClick = async ({
  nodeType,
  formData,
  onSave,
  handleCheckSheetConnection,
  setIsLoadingTestPreview,
  toastNotifier,
  campaignId,
}) => {
  if (nodeType === 'read_sheet') {
    const columns = await handleCheckSheetConnection();
    if (columns) {
      onSave({ ...formData, columns });
      return;
    }
    toastNotifier.error('Đã lưu cấu hình node, nhưng kết nối sheet đang lỗi. Vui lòng kiểm tra lại.');
    onSave(formData);
    return;
  }

  if (nodeType === 'read_interested_customers') {
    try {
      setIsLoadingTestPreview(true);
      const data = await fetchInterestedCustomerCoursesLocal({
        campaignId,
        config: {
          ...formData,
          interestedLimit: 10,
        },
      });
      const totalItems = data?.pagination?.total || 0;
      toastNotifier.success(`Kết nối OK. Tìm thấy ${totalItems} khách hàng phù hợp`);
      onSave(formData);
    } catch (error) {
      console.error('Test config error:', error);
      const msg = error.response?.data?.message || error.message || 'Không thể kiểm tra cấu hình';
      toastNotifier.error(typeof msg === 'string' ? msg : 'Không thể kiểm tra cấu hình');
    } finally {
      setIsLoadingTestPreview(false);
    }
    return;
  }

  if (nodeType === 'read_courses_db') {
    onSave(formData);
    return;
  }

  if (nodeType === 'read_landing_leads') {
    try {
      setIsLoadingTestPreview(true);
      const response = await campaignBuilderApiService.previewLandingLeads({
        landingLeadsUseDateRange: formData.landingLeadsUseDateRange,
        landingLeadsDateFrom: formData.landingLeadsDateFrom,
        landingLeadsDateTo: formData.landingLeadsDateTo,
        landingLeadsOccupations: JSON.stringify(formData.landingLeadsOccupations || []),
        landingLeadsInterests: JSON.stringify(formData.landingLeadsInterests || []),
        landingLeadsSlugs: JSON.stringify(formData.landingLeadsSlugs || []),
        landingLeadsLimit: 50,
      });
      const total = response?.data?.data?.pagination?.total ?? 0;
      toastNotifier.success(`Kết nối OK. Có ${total} lead phù hợp (xem trước tối đa 50 dòng)`);
      onSave(formData);
    } catch (error) {
      console.error('Landing leads preview error:', error);
      const msg = error.response?.data?.message || error.message || 'Không thể kiểm tra cấu hình';
      toastNotifier.error(typeof msg === 'string' ? msg : 'Không thể kiểm tra cấu hình');
    } finally {
      setIsLoadingTestPreview(false);
    }
    return;
  }

  if (nodeType === 'get_all_groups') {
    const selectedGroupIds = (Array.isArray(formData?.zaloSelectedGroupIds)
      ? formData.zaloSelectedGroupIds
      : []
    )
      .map((value) => String(value || '').trim())
      .filter((value, idx, arr) => value && arr.indexOf(value) === idx);

    if (selectedGroupIds.length === 0) {
      toastNotifier.error('Vui lòng chọn ít nhất 1 nhóm Zalo trước khi lưu');
      return;
    }

    onSave({
      ...formData,
      zaloSelectedGroupIds: selectedGroupIds,
      zaloGroupSelectionSnapshotLocked: Boolean(formData?.zaloGroupSelectionSnapshotLocked),
    });
    return;
  }

  onSave(formData);
};
