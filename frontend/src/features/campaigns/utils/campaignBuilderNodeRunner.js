/**
 * Create node runner helpers used by Campaign Builder preview execution.
 *
 * @param {Object} deps dependency bag
 * @param {string|number|null} deps.campaignId campaign id from route params
 * @param {Object} deps.apiService campaign builder API service
 * @param {Function} deps.buildSchemaFromRows schema builder helper
 * @param {Function} deps.applyMappingsForRow row mapping helper
 * @param {Function} deps.normalizeKey normalize key helper
 * @param {Function} deps.parseEmailList parse comma/newline email list helper
 * @param {Function} deps.renderTemplateString template renderer helper
 * @param {Function} deps.resolveColumnKey resolve source column key helper
 * @param {Function} deps.readPreviewSessionData read preview session storage
 * @param {Function} deps.writePreviewSessionData write preview session storage
 * @param {Object} deps.toastNotifier toast object with error method
 * @param {Function} deps.isRunCancelledError cancellation detector
 * @param {Function} deps.sleep async delay helper
 * @returns {{checkSheetConnection: Function, buildRunResultForNode: Function}}
 */
export const createCampaignNodeRunner = (deps) => {
  const {
    campaignId,
    apiService,
    buildSchemaFromRows,
    applyMappingsForRow,
    normalizeKey,
    parseEmailList,
    renderTemplateString,
    resolveColumnKey,
    readPreviewSessionData,
    writePreviewSessionData,
    toastNotifier,
    isRunCancelledError,
    sleep,
  } = deps;

  const fetchSheetPreview = async (config, signal) => {
    const normalizedSheetName = String(config.sheetName || 'Sheet1').trim() || 'Sheet1';
    const parsedHeaderRow = Number.parseInt(config.headerRow, 10);
    const parsedDataStartRow = Number.parseInt(config.dataStartRow, 10);
    const payload = {
      sheetUrl: config.sheetUrl,
      sheetName: normalizedSheetName,
      headerRow: Number.isFinite(parsedHeaderRow) ? Math.max(1, parsedHeaderRow) : 1,
      dataStartRow: Number.isFinite(parsedDataStartRow) ? Math.max(1, parsedDataStartRow) : 2,
      limit: 100,
    };
    const response = await apiService.previewGoogleSheet(payload, { signal });
    return response.data?.data;
  };

  const checkSheetConnection = async (config) => {
    const normalizedSheetName = String(config.sheetName || 'Sheet1').trim() || 'Sheet1';
    const parsedHeaderRow = Number.parseInt(config.headerRow, 10);
    const payload = {
      sheetUrl: config.sheetUrl,
      sheetName: normalizedSheetName,
      headerRow: Number.isFinite(parsedHeaderRow) ? Math.max(1, parsedHeaderRow) : 1,
    };
    const response = await apiService.checkGoogleSheet(payload);
    return response.data?.data;
  };

  const fetchInterestedCustomerCourses = async (config = {}, signal) => {
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
      .map((v) => parseInt(v, 10))
      .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
    if (selectedCourseIds.length > 0) {
      params.set('courseIds', selectedCourseIds.join(','));
    }
    const courseQuery = String(config.interestedCourseQuery || '').trim();
    if (courseQuery) {
      params.set('courseQuery', courseQuery);
    }
    const selectedStatuses = (Array.isArray(config.interestedCourseStatuses) ? config.interestedCourseStatuses : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
    if (selectedStatuses.length > 0) {
      params.set('courseStatuses', selectedStatuses.join(','));
    }
    const dataSource = config.interestedDataSource || 'database';
    const response = await apiService.getInterestedCustomersByQuery(
      params.toString(),
      dataSource,
      { signal }
    );
    return response.data?.data || { items: [], pagination: { total: 0, limit } };
  };

  const getTemplateDetail = async (templateId, cache, signal) => {
    const templateIdNum = parseInt(templateId, 10);
    if (!templateIdNum) return null;
    if (cache.has(templateIdNum)) return cache.get(templateIdNum);
    const response = await apiService.getEmailTemplateById(templateIdNum, { signal });
    const tpl = response.data?.data || null;
    cache.set(templateIdNum, tpl);
    return tpl;
  };

  /**
   * Lấy đầy đủ nội dung template Zalo để preview giữ đúng hành vi gửi thật.
   *
   * Luồng hoạt động:
   * 1. Dùng cache theo `templateId` để tránh gọi API lặp lại trong một lượt preview.
   * 2. Đọc cả phần text và danh sách attachment của template.
   * 3. Trả về object thống nhất để node preview có thể gửi kèm file khi cần.
   *
   * @param {string|number} templateId id template Zalo
   * @param {Map<number, {message: string, attachments: Array<object>}>} cache bộ nhớ đệm theo template
   * @param {AbortSignal|undefined} signal tín hiệu hủy request
   * @returns {Promise<{message: string, attachments: Array<object>}>}
   */
  const getZaloTemplateContent = async (templateId, cache, signal) => {
    const templateIdNum = parseInt(templateId, 10);
    if (!templateIdNum) return { message: '', attachments: [] };
    if (cache.has(templateIdNum)) return cache.get(templateIdNum);
    const response = await apiService.getZaloTemplateById(templateIdNum, { signal });
    const template = response.data?.data || {};
    const content = {
      message: String(template?.bodyText || template?.bodyHtml || '').trim(),
      attachments: Array.isArray(template?.attachments) ? template.attachments : [],
    };
    cache.set(templateIdNum, content);
    return content;
  };

  const fetchZaloAccounts = async (signal) => {
    const response = await apiService.getZaloAccounts({ signal });
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
   * Ensure selected Zalo account is ready for sending.
   * If account is disconnected, auto-restore session then re-check status.
   *
   * @param {string} accountId
   * @param {AbortSignal|undefined} signal
   * @returns {Promise<{id:string, displayName:string, status:string, isActive:boolean, isDefault:boolean}>}
   */
  const resolveReadyZaloAccountForRun = async (accountId, signal) => {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) {
      throw new Error('Chưa chọn tài khoản Zalo');
    }

    const findAccountById = (accounts) => accounts.find((item) => item.id === normalizedAccountId) || null;
    const isAccountReady = (account) => !!account && account.status === 'connected' && account.isActive;

    const firstAccounts = await fetchZaloAccounts(signal);
    let selected = findAccountById(firstAccounts);
    if (!selected) {
      throw new Error('Tài khoản Zalo đã chọn không còn tồn tại');
    }
    if (isAccountReady(selected)) return selected;

    try {
      await apiService.restoreZaloAccountSession(normalizedAccountId, { signal });
    } catch (error) {
      const restoredMessage = error?.response?.data?.message || '';
      if (restoredMessage) {
        throw new Error(`Không thể tự khôi phục session tài khoản Zalo: ${restoredMessage}`);
      }
      throw new Error('Không thể tự khôi phục session tài khoản Zalo');
    }

    const secondAccounts = await fetchZaloAccounts(signal);
    selected = findAccountById(secondAccounts);
    if (isAccountReady(selected)) {
      return selected;
    }
    throw new Error('Tài khoản Zalo đã chọn chưa sẵn sàng gửi tin sau khi khôi phục session');
  };

  /**
   * Parse text list (newline/comma/semicolon) and dedupe values.
   *
   * @param {string|unknown} text
   * @returns {string[]}
   */
  const parseListText = (text) => Array.from(
    new Set(
      String(text || '')
        .split(/[\n,;]/g)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
  const resolveSelectionMode = (mode, selectedIds = []) => {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'fixed' || normalized === 'all_exclude') return normalized;
    return Array.isArray(selectedIds) && selectedIds.length > 0 ? 'fixed' : 'all';
  };
  // Đồng bộ delay với Campaign Run để Build phản ánh sát hành vi thực thi thực tế.
  const EMAIL_API_DELAY_MIN_MS = 50;
  const EMAIL_API_DELAY_MAX_MS = 250;
  const ZALO_API_DELAY_MIN_MS = 25;
  const ZALO_API_DELAY_MAX_MS = 125;
  const ZALO_GROUP_TEMPLATE_DELAY_MIN_MS = 250;
  const ZALO_GROUP_TEMPLATE_DELAY_MAX_MS = 1250;
  const getRandomDelayMsByRange = (minMs, maxMs) => Math.floor(
    Math.random() * (maxMs - minMs + 1)
  ) + minMs;
  const getDelayRangeByChannel = (channel = 'email') => {
    const normalizedChannel = String(channel || '').trim().toLowerCase();
    if (normalizedChannel === 'zalo_group_template') {
      return { minMs: ZALO_GROUP_TEMPLATE_DELAY_MIN_MS, maxMs: ZALO_GROUP_TEMPLATE_DELAY_MAX_MS };
    }
    if (normalizedChannel === 'zalo') {
      return { minMs: ZALO_API_DELAY_MIN_MS, maxMs: ZALO_API_DELAY_MAX_MS };
    }
    return { minMs: EMAIL_API_DELAY_MIN_MS, maxMs: EMAIL_API_DELAY_MAX_MS };
  };
  const buildAbortError = () => {
    const error = new Error('Run cancelled');
    error.name = 'AbortError';
    error.code = 'ERR_CANCELED';
    return error;
  };
  const assertNotAborted = (signal) => {
    if (signal?.aborted) {
      throw buildAbortError();
    }
  };
  const sleepWithAbort = async (ms, signal) => {
    const waitMs = Math.max(0, Number.parseInt(ms, 10) || 0);
    if (waitMs <= 0) return;
    assertNotAborted(signal);
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, waitMs);
      const onAbort = () => {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onAbort);
        reject(buildAbortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    assertNotAborted(signal);
  };
  /**
   * Wait random delay before making next preview API request.
   *
   * @param {string} label short context label for debugging
   * @param {AbortSignal|undefined} signal
   * @returns {Promise<number>}
   */
  const waitRandomPreviewApiDelay = async (label = 'preview_api', signal, options = {}) => {
    const { channel = 'email' } = options;
    const { minMs, maxMs } = getDelayRangeByChannel(channel);
    const delayMs = getRandomDelayMsByRange(minMs, maxMs);
    console.info(`[CampaignBuilder][PreviewDelay] ${label}: ${delayMs}ms`);
    await sleepWithAbort(delayMs, signal);
    return delayMs;
  };
  /**
   * Chờ ngẫu nhiên giữa 2 lần gửi trong cùng step theo đúng dải delay của Campaign Run.
   *
   * Luồng hoạt động:
   * 1. Xác định kênh gửi (email/zalo/zalo_group_template).
   * 2. Sinh khoảng nghỉ ngẫu nhiên theo dải delay tương ứng của kênh.
   * 2. Sleep có hỗ trợ AbortSignal để dừng run ngay khi người dùng cancel.
   * 3. Trả về delay thực tế để debug khi cần.
   *
   * @param {string} label ngữ cảnh để log debug
   * @param {AbortSignal|undefined} signal tín hiệu hủy
   * @param {string} channel kênh delay cần áp dụng
   * @returns {Promise<number>}
   */
  const waitRandomTemplateStepDelay = async (label = 'template_step', signal, channel = 'email') => {
    const { minMs, maxMs } = getDelayRangeByChannel(channel);
    const delayMs = getRandomDelayMsByRange(minMs, maxMs);
    console.info(`[CampaignBuilder][TemplateStepDelay] ${label}: ${delayMs}ms`);
    await sleepWithAbort(delayMs, signal);
    return delayMs;
  };
  const resolveDisplayName = (...candidates) => {
    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (value) return value;
    }
    return null;
  };
  /**
   * Bổ sung metadata log cho item gửi Zalo ở chế độ preview.
   *
   * Luồng hoạt động:
   * 1. Ưu tiên metadata đã có từ API (`sentAt`, `senderName`, ...).
   * 2. Fallback về dữ liệu account/entry để luôn có đủ thông tin hiển thị log.
   * 3. Đồng bộ key giữa preview và campaign-run để UI hiển thị nhất quán.
   *
   * @param {object} input dữ liệu ngữ cảnh
   * @returns {{sentAt: string, senderName: string|null, zaloName: string|null, groupName: string|null}}
   */
  const buildPreviewZaloLogMeta = ({
    item = {},
    account = null,
    entry = null,
    fallbackRecipient = '',
    fallbackGroupId = '',
  } = {}) => {
    const row = entry?.row || entry || {};
    const senderName = resolveDisplayName(
      item?.senderName,
      account?.displayName,
      account?.name
    );
    const zaloName = resolveDisplayName(
      item?.zaloName,
      item?.recipientName,
      item?.displayName,
      row?.full_name,
      row?.fullName,
      row?.display_name,
      row?.displayName,
      row?.name,
      fallbackRecipient
    );
    const groupName = resolveDisplayName(
      item?.groupName,
      row?.groupName,
      row?.group_name,
      row?.title,
      fallbackGroupId
    );
    return {
      sentAt: item?.sentAt || new Date().toISOString(),
      senderName,
      zaloName,
      groupName,
    };
  };

  /**
   * Collect value list from manual text or node source.
   *
   * @param {object} input source options
   * @returns {string[]}
   */
  const collectListFromSource = (ctx, input = {}) => {
    const sourceMode = String(input.sourceMode || 'manual').trim();
    if (sourceMode === 'manual') {
      return parseListText(input.manualValue || '');
    }
    const sourceNodeId = String(input.sourceNodeId || '').trim();
    const sourceField = String(input.sourceField || '').trim();
    if (!sourceNodeId || !sourceField) return [];
    const source = ctx.nodeResultsById?.[sourceNodeId] || null;
    if (!source) return [];
    const items = Array.isArray(source?.output?.items) ? source.output.items : [];
    const values = [];
    items.forEach((item) => {
      const raw = item?.[sourceField];
      if (Array.isArray(raw)) {
        raw.forEach((val) => values.push(...parseListText(val)));
      } else {
        values.push(...parseListText(raw));
      }
    });
    return Array.from(new Set(values));
  };

  const collectRecipientEntriesFromSource = (ctx, input = {}) => {
    const sourceMode = String(input.sourceMode || 'manual').trim();
    if (sourceMode === 'manual') {
      return parseListText(input.manualValue || '').map((value) => ({ value, phone: value, row: null }));
    }
    const sourceNodeId = String(input.sourceNodeId || '').trim();
    const sourceField = String(input.sourceField || '').trim();
    if (!sourceNodeId || !sourceField) return [];
    const source = ctx.nodeResultsById?.[sourceNodeId] || null;
    if (!source) return [];
    const items = Array.isArray(source?.output?.items) ? source.output.items : [];
    const rows = [];
    items.forEach((item) => {
      const raw = item?.[sourceField];
      const values = Array.isArray(raw) ? raw.flatMap((value) => parseListText(value)) : parseListText(raw);
      values.forEach((value) => rows.push({ value, phone: value, row: item || null }));
    });
    const dedupMap = new Map();
    rows.forEach((entry) => {
      const key = String(entry?.value || '').trim();
      if (!key) return;
      if (!dedupMap.has(key)) dedupMap.set(key, { ...entry, value: key, phone: key });
    });
    return Array.from(dedupMap.values());
  };

  const ensureSelectedZaloAccount = (ctx, preferredSourceNodeId = '') => {
    const sourceNodeId = String(preferredSourceNodeId || '').trim();
    if (sourceNodeId) {
      const sourceResult = ctx.nodeResultsById?.[sourceNodeId] || null;
      const sourceItems = Array.isArray(sourceResult?.output?.items) ? sourceResult.output.items : [];
      const sourceAccount = sourceItems[0] || null;
      if (sourceAccount?.id) {
        return {
          id: String(sourceAccount.id),
          displayName: String(sourceAccount.displayName || sourceAccount.name || 'Tài khoản Zalo'),
          status: String(sourceAccount.status || 'connected'),
          isActive: sourceAccount.isActive !== false,
          isDefault: sourceAccount.isDefault === true,
        };
      }
    }
    const selectedAccount = ctx.selectedZaloAccount || null;
    if (!selectedAccount?.id) {
      throw new Error('Chưa có tài khoản Zalo gửi. Vui lòng thêm node "Chọn tài khoản Zalo" phía trước.');
    }
    return selectedAccount;
  };

  /**
   * Resolve template variables for one Zalo recipient/group entry.
   *
   * @param {object} ctx runtime context
   * @param {Array} mappings template mappings
   * @param {object|null} entry current recipient/group entry
   * @param {string} fallbackNodeId default node id used for mapping
   * @returns {object}
   */
  const resolveZaloTemplateVariables = (ctx, mappings = [], entry = null, fallbackNodeId = '') => {
    const variables = {};
    (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
      const key = String(mapping?.key || '').trim();
      if (!key) return;
      const sourceType = String(mapping?.sourceType || 'manual').trim() === 'node' ? 'node' : 'manual';
      if (sourceType !== 'node') {
        variables[key] = mapping?.value ?? '';
        return;
      }

      const field = String(mapping?.field || '').trim();
      if (!field) {
        variables[key] = '';
        return;
      }
      const nodeId = String(mapping?.nodeId || fallbackNodeId || '').trim();
      if (!nodeId) {
        variables[key] = entry?.row?.[field] ?? '';
        return;
      }
      const source = ctx.nodeResultsById?.[nodeId] || null;
      const items = Array.isArray(source?.output?.items) ? source.output.items : [];
      const firstRow = items[0] || null;
      const selectedRow = nodeId === String(fallbackNodeId || '').trim()
        ? (entry?.row || firstRow)
        : firstRow;
      variables[key] = selectedRow?.[field] ?? '';
    });
    return variables;
  };

  const renderZaloTemplateMessage = ({
    templateText,
    mappings,
    ctx,
    entry,
    fallbackNodeId = '',
  }) => renderTemplateString(
    String(templateText || ''),
    resolveZaloTemplateVariables(ctx, mappings, entry, fallbackNodeId)
  ).trim();
  const getNodeRecipientProgressMap = (ctx, nodeId, channel) => {
    if (!ctx.recipientProgressByNode) {
      ctx.recipientProgressByNode = new Map();
    }
    const mapKey = `${String(channel)}:${String(nodeId)}`;
    if (!ctx.recipientProgressByNode.has(mapKey)) {
      ctx.recipientProgressByNode.set(mapKey, new Map());
    }
    return ctx.recipientProgressByNode.get(mapKey);
  };
  const getRecipientNextStepIndex = (progressMap, recipientKey) => {
    const safeKey = String(recipientKey || '').trim().toLowerCase();
    if (!safeKey) return 0;
    return Number.parseInt(progressMap.get(safeKey) || 0, 10) || 0;
  };
  const markRecipientStepCompleted = (progressMap, recipientKey, completedStepIndex) => {
    const safeKey = String(recipientKey || '').trim().toLowerCase();
    if (!safeKey) return;
    progressMap.set(safeKey, Math.max(0, Number.parseInt(completedStepIndex, 10) || 0));
  };

  const buildRunResultForNode = async (node, ctx, options = {}) => {
    const nodeType = node.data?.nodeType || node.type;
    const config = node.data?.config || {};
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const signal = options?.signal;

    if (nodeType === 'read_sheet') {
      const data = await fetchSheetPreview(config, signal);
      const rows = Array.isArray(data?.items) ? data.items : [];
      ctx.sheetRows = rows;
      return {
        input: {
          operation: 'Get Row(s)',
          sheetUrl: config.sheetUrl || '',
          sheetName: config.sheetName || 'Sheet1',
          headerRow: config.headerRow || 1,
          dataStartRow: config.dataStartRow || 2,
          recipientColumn: config.recipientColumn || '',
          mapping: config.mapping || {},
        },
        output: {
          items: rows,
          schema: buildSchemaFromRows(rows),
          meta: {
            fetched: rows.length,
            spreadsheetId: data?.meta?.spreadsheetId,
            sheetName: data?.meta?.sheetName,
            csvUrl: data?.meta?.csvUrl,
          },
        },
      };
    }
    if (nodeType === 'read_interested_customers') {
      console.log('Running node with config:', {
        interestedSelectedCustomerIds: config.interestedSelectedCustomerIds,
        fullConfig: config,
      });

      const data = await fetchInterestedCustomerCourses(config, signal);
      let rows = Array.isArray(data?.items) ? data.items : [];

      const selectedCustomerIds = Array.isArray(config.interestedSelectedCustomerIds)
        ? config.interestedSelectedCustomerIds.map((itemId) => parseInt(itemId, 10)).filter((itemId) => Number.isFinite(itemId))
        : [];
      const excludedCustomerIds = Array.isArray(config.interestedExcludedCustomerIds)
        ? config.interestedExcludedCustomerIds.map((itemId) => parseInt(itemId, 10)).filter((itemId) => Number.isFinite(itemId))
        : [];
      const selectionMode = resolveSelectionMode(config.interestedSelectionMode, selectedCustomerIds);

      if (selectionMode === 'fixed' && selectedCustomerIds.length > 0) {
        rows = rows.filter((row) => {
          const customerId = parseInt(row.customerId, 10);
          return selectedCustomerIds.includes(customerId);
        });
      } else if (selectionMode === 'all_exclude' && excludedCustomerIds.length > 0) {
        const excludedSet = new Set(excludedCustomerIds);
        rows = rows.filter((row) => {
          const customerId = parseInt(row.customerId, 10);
          return !excludedSet.has(customerId);
        });
      }

      ctx.sheetRows = rows;
      return {
        input: {
          operation: 'Get Interested Customers',
          campaignId: Number.isFinite(parseInt(campaignId, 10)) ? parseInt(campaignId, 10) : null,
          customerType: config.interestedCustomerType || 'interested',
          limit: Number.isFinite(parseInt(config.interestedLimit, 10))
            ? parseInt(config.interestedLimit, 10)
            : 1000,
          courseIds: (Array.isArray(config.interestedCourseIds) ? config.interestedCourseIds : [])
            .map((v) => parseInt(v, 10))
            .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx),
          courseQuery: String(config.interestedCourseQuery || '').trim(),
          selectedCustomerIds,
          excludedCustomerIds,
          selectionMode,
        },
        output: {
          ok: true,
          items: rows,
          schema: buildSchemaFromRows(rows),
          meta: {
            totalItems: data?.pagination?.total || 0,
            fetched: rows.length,
            limit: data?.pagination?.limit || rows.length,
            filtered: (selectionMode === 'fixed' && selectedCustomerIds.length > 0)
              || (selectionMode === 'all_exclude' && excludedCustomerIds.length > 0),
          },
        },
      };
    }

    if (nodeType === 'read_courses_db') {
      const selectedCourseIds = Array.isArray(config.coursesDbSelectedIds)
        ? config.coursesDbSelectedIds.map((itemId) => parseInt(itemId, 10)).filter((itemId) => Number.isFinite(itemId))
        : [];
      const selectedStatuses = (Array.isArray(config.coursesDbStatuses) ? config.coursesDbStatuses : [])
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item, idx, arr) => item && arr.indexOf(item) === idx);

      if (selectedCourseIds.length === 0) {
        throw new Error('Chưa chọn khóa học');
      }

      const params = {
        limit: config.coursesDbLimit || 1000,
      };

      if (config.coursesDbSearchTerm) {
        params.search = config.coursesDbSearchTerm;
      }
      if (selectedStatuses.length > 0) {
        params.status = selectedStatuses.join(',');
      }

      const response = await apiService.getCourses(params, { signal });
      let courses = response.data?.data?.courses || [];

      courses = courses.filter((course) => {
        const courseId = parseInt(course.id, 10);
        return selectedCourseIds.includes(courseId);
      });

      ctx.coursesRows = courses;

      return {
        input: {
          operation: 'Get Courses from Database',
          searchTerm: config.coursesDbSearchTerm || '',
          limit: config.coursesDbLimit || 1000,
          statuses: selectedStatuses,
          selectedCourseIds,
        },
        output: {
          ok: true,
          items: courses,
          schema: buildSchemaFromRows(courses),
          meta: {
            totalItems: response.data?.data?.pagination?.total || courses.length,
            fetched: courses.length,
            limit: config.coursesDbLimit || 1000,
            statuses: selectedStatuses,
            filtered: selectedCourseIds.length > 0,
          },
        },
      };
    }

    if (nodeType === 'select_zalo_account') {
      const selectedId = String(config.zaloAccountId || '').trim();
      const selected = await resolveReadyZaloAccountForRun(selectedId, signal);

      ctx.selectedZaloAccount = selected;
      return {
        input: {
          zaloAccountId: selected.id,
        },
        output: {
          items: [selected],
          schema: buildSchemaFromRows([selected]),
          meta: {
            selected: true,
          },
        },
      };
    }

    if (nodeType === 'get_all_friends') {
      const selectedAccount = ensureSelectedZaloAccount(ctx, config.zaloFriendAccountNodeId || '');
      const count = Number.isFinite(parseInt(config.zaloFriendsCount, 10))
        ? parseInt(config.zaloFriendsCount, 10)
        : 200;
      const page = Number.isFinite(parseInt(config.zaloFriendsPage, 10))
        ? parseInt(config.zaloFriendsPage, 10)
        : 1;
      const response = await apiService.getPreviewZaloFriends({
        accountId: selectedAccount.id,
        count,
        page,
      }, { signal });
      const allItems = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
      const selectedFriendIds = (Array.isArray(config.zaloSelectedFriendIds) ? config.zaloSelectedFriendIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const excludedFriendIds = (Array.isArray(config.zaloExcludedFriendIds) ? config.zaloExcludedFriendIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const selectionMode = resolveSelectionMode(config.zaloFriendSelectionMode, selectedFriendIds);
      const selectedSet = new Set(selectedFriendIds);
      const excludedSet = new Set(excludedFriendIds);
      const extractFriendId = (item) => String(
        item?.uid
        || item?.id
        || item?.userId
        || ''
      ).trim();
      let items = allItems;
      if (selectionMode === 'fixed' && selectedSet.size > 0) {
        items = allItems.filter((item) => selectedSet.has(extractFriendId(item)));
      } else if (selectionMode === 'all_exclude' && excludedSet.size > 0) {
        items = allItems.filter((item) => !excludedSet.has(extractFriendId(item)));
      }
      return {
        input: {
          accountId: selectedAccount.id,
          accountSourceNodeId: String(config.zaloFriendAccountNodeId || '').trim() || null,
          count,
          page,
          selectedFriendIds,
          excludedFriendIds,
          selectionMode,
        },
        output: {
          items,
          schema: buildSchemaFromRows(items),
          meta: {
            totalItems: items.length,
            filtered: (selectionMode === 'fixed' && selectedSet.size > 0)
              || (selectionMode === 'all_exclude' && excludedSet.size > 0),
          },
        },
      };
    }

    if (nodeType === 'get_all_groups') {
      const selectedAccount = ensureSelectedZaloAccount(ctx, config.zaloGroupAccountNodeId || '');
      const response = await apiService.getPreviewZaloGroups({
        accountId: selectedAccount.id,
      }, { signal });
      const allItems = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
      const selectedGroupIds = (Array.isArray(config.zaloSelectedGroupIds) ? config.zaloSelectedGroupIds : [])
        .map((value) => String(value || '').trim())
        .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
      const selectedSet = new Set(selectedGroupIds);
      const items = selectedSet.size > 0
        ? allItems.filter((item) => selectedSet.has(String(item?.groupId || '').trim()))
        : allItems;
      return {
        input: {
          accountId: selectedAccount.id,
          accountSourceNodeId: String(config.zaloGroupAccountNodeId || '').trim() || null,
          selectedGroupIds,
        },
        output: {
          items,
          schema: buildSchemaFromRows(items),
          meta: {
            totalItems: items.length,
            filtered: selectedSet.size > 0,
          },
        },
      };
    }

    if (nodeType === 'mapping_data') {
      const rows = Array.isArray(ctx.sheetRows) ? ctx.sheetRows : [];
      const mappings = config.mappings || [];
      const previewRows = rows.slice(0, 100).map((row, idx) => ({
        __row: idx + 1,
        ...applyMappingsForRow(row, mappings),
      }));
      const variables = mappings.map((m) => m.variableName).filter(Boolean);
      ctx.mapping = {
        templateId: config.mappingTemplateId || null,
        mappings,
      };
      return {
        input: {
          mappingTemplateId: config.mappingTemplateId || null,
          mappings,
        },
        output: {
          ok: true,
          variables,
          items: previewRows,
          schema: buildSchemaFromRows(previewRows),
          meta: {
            totalItems: rows.length,
            previewed: previewRows.length,
            variablesCount: variables.length,
          },
        },
      };
    }

    if (nodeType === 'save_customer') {
      const fieldMap = config.saveCustomerFieldMap || {};
      const resolveNodeIdForMapping = (mapping) => String(mapping?.nodeId || config.saveCustomerNodeId || '').trim();
      const resolveNodeItems = (mapping) => {
        const nodeId = resolveNodeIdForMapping(mapping);
        const source = nodeId ? (ctx.nodeResultsById?.[nodeId] || null) : null;
        return {
          nodeId,
          items: Array.isArray(source?.output?.items) ? source.output.items : [],
        };
      };
      const candidateMappings = [
        fieldMap.email,
        fieldMap.phone,
        fieldMap.fullName,
        fieldMap.zaloId,
      ];
      const primarySource = candidateMappings
        .map((mapping) => resolveNodeItems(mapping))
        .find((entry) => entry.nodeId && entry.items.length > 0);
      const sourceNodeId = primarySource?.nodeId || String(config.saveCustomerNodeId || '').trim();
      const sourceItems = primarySource?.items || (sourceNodeId ? (Array.isArray(ctx.nodeResultsById?.[sourceNodeId]?.output?.items) ? ctx.nodeResultsById[sourceNodeId].output.items : []) : []);
      if (!sourceItems.length) {
        throw new Error('Chưa có dữ liệu từ node đã chọn');
      }
      const items = sourceItems;
      const customFields = Array.isArray(config.saveCustomerCustomFields)
        ? config.saveCustomerCustomFields
        : [];

      const resolveMappedValue = (mapping, row, rowIdx) => {
        if (!mapping) return null;
        if (mapping.mode === 'manual') {
          const v = mapping.value ?? '';
          return String(v).trim() ? v : null;
        }
        const { items: mappingItems } = resolveNodeItems(mapping);
        const mappingRow = mappingItems.length ? (mappingItems[rowIdx] || mappingItems[0] || {}) : row;
        const key = String(mapping.field || '').trim();
        if (!key) return null;
        const value = mappingRow?.[key];
        return value === undefined ? null : value;
      };

      const campaignIdNum = Number.isFinite(parseInt(campaignId, 10)) ? parseInt(campaignId, 10) : null;

      if (!items.length) {
        return {
          input: {
            sourceNodeId,
            upsertBy: config.saveCustomerUpsertBy || 'email_or_phone',
            campaignId: campaignIdNum,
          },
          output: {
            items: [],
            schema: [],
            meta: {
              totalItems: 0,
              inserted: 0,
              updated: 0,
              skipped: 0,
            },
          },
        };
      }

      const mappedCustomers = items.map((row, rowIdx) => {
        const customFieldObj = {};
        customFields.forEach((cf) => {
          const key = String(cf?.key || '').trim();
          if (!key) return;
          const value = cf?.mode === 'manual'
            ? (String(cf?.value ?? '').trim() ? cf.value : null)
            : (() => {
              const { items: cfItems } = resolveNodeItems(cf);
              const cfRow = cfItems.length ? (cfItems[rowIdx] || cfItems[0] || {}) : row;
              return cfRow?.[String(cf?.field || '').trim()] ?? null;
            })();
          if (value !== null && value !== undefined && String(value).trim() !== '') {
            customFieldObj[key] = value;
          }
        });

        return {
          email: resolveMappedValue(fieldMap.email, row, rowIdx),
          phone: resolveMappedValue(fieldMap.phone, row, rowIdx),
          fullName: resolveMappedValue(fieldMap.fullName, row, rowIdx),
          gender: resolveMappedValue(fieldMap.gender, row, rowIdx),
          customerSource: resolveMappedValue(fieldMap.customerSource, row, rowIdx),
          notes: resolveMappedValue(fieldMap.notes, row, rowIdx),
          zaloId: resolveMappedValue(fieldMap.zaloId, row, rowIdx),
          zaloPhone: resolveMappedValue(fieldMap.zaloPhone, row, rowIdx),
          customFields: Object.keys(customFieldObj).length ? customFieldObj : null,
        };
      });

      const previewData = readPreviewSessionData();
      const existingByKey = new Map(
        (previewData.customers || []).map((item) => {
          const key = `${String(item.email || '').trim().toLowerCase()}|${String(item.phone || '').trim()}`;
          return [key, item];
        })
      );
      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      mappedCustomers.forEach((customer) => {
        const email = String(customer.email || '').trim().toLowerCase();
        const phone = String(customer.phone || '').trim();
        if (!email && !phone) {
          skipped += 1;
          return;
        }
        const key = `${email}|${phone}`;
        if (existingByKey.has(key)) {
          existingByKey.set(key, { ...existingByKey.get(key), ...customer });
          updated += 1;
        } else {
          existingByKey.set(key, customer);
          inserted += 1;
        }
      });

      writePreviewSessionData({
        ...previewData,
        customers: Array.from(existingByKey.values()),
      });

      return {
        input: {
          sourceNodeId,
          upsertBy: config.saveCustomerUpsertBy || 'email_or_phone',
          campaignId: campaignIdNum,
        },
        output: {
          items: mappedCustomers.slice(0, 100),
          schema: buildSchemaFromRows(mappedCustomers.slice(0, 1)),
          meta: {
            totalItems: mappedCustomers.length,
            inserted,
            updated,
            skipped,
          },
        },
      };
    }

    if (nodeType === 'send_email') {
      const rows = Array.isArray(ctx.sheetRows) ? ctx.sheetRows : [];
      const maxSendEnabled = !!config.maxSendEnabled;
      const maxSend = Math.max(1, parseInt(config.maxSendCount || 100, 10));
      const recipientMode = 'multiple';
      const sendAllAtOnce = config.sendMode !== 'schedule';
      const steps = Array.isArray(config.emailSteps) ? config.emailSteps : [];
      const unitToMs = (unit) => {
        if (unit === 'hours') return 60 * 60 * 1000;
        if (unit === 'days') return 24 * 60 * 60 * 1000;
        return 60 * 1000;
      };

      let recipients = [];
      if (config.recipientSource === 'manual') {
        recipients = parseEmailList(config.recipientEmails);
      } else if (config.recipientSource === 'node') {
        const source = ctx.nodeResultsById?.[config.recipientNodeId] || null;
        if (!source) {
          throw new Error('Chưa có dữ liệu từ node đã chọn');
        }
        const items = Array.isArray(source?.output?.items) ? source.output.items : [];
        const field = String(config.recipientField || '').trim();
        if (!field) throw new Error('Chưa chọn cột email');
        items.forEach((item) => {
          const value = item?.[field];
          if (Array.isArray(value)) {
            value.forEach((v) => recipients.push(...parseEmailList(v)));
          } else {
            recipients.push(...parseEmailList(value));
          }
        });
      } else {
        recipients = rows
          .map((r) => {
            const k = resolveColumnKey(r, config.recipientColumn);
            return String(r?.[k] ?? '').trim();
          })
          .filter(Boolean);
      }

      const limitedRecipients = maxSendEnabled ? recipients.slice(0, maxSend) : recipients;
      const uniqueRecipients = Array.from(new Set(
        limitedRecipients.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      ));
      const emailProgressMap = getNodeRecipientProgressMap(ctx, node.id, 'email');
      const sendResults = [];

      const resolveExtraList = (enabled, source, emails, nodeId, field) => {
        if (!enabled) return [];
        if (source === 'manual') return parseEmailList(emails);
        if (source === 'node') {
          const sourceResult = ctx.nodeResultsById?.[nodeId] || null;
          if (!sourceResult) return [];
          const items = Array.isArray(sourceResult?.output?.items) ? sourceResult.output.items : [];
          const list = [];
          items.forEach((item) => {
            const value = item?.[field];
            if (Array.isArray(value)) {
              value.forEach((v) => list.push(...parseEmailList(v)));
            } else {
              list.push(...parseEmailList(value));
            }
          });
          return list;
        }
        return [];
      };

      const ccList = resolveExtraList(config.ccEnabled, config.ccSource, config.ccEmails, config.ccNodeId, config.ccField);
      const bccList = resolveExtraList(config.bccEnabled, config.bccSource, config.bccEmails, config.bccNodeId, config.bccField);

      const recipientRowMap = (() => {
        if (config.recipientSource !== 'node') return new Map();
        const source = ctx.nodeResultsById?.[config.recipientNodeId] || null;
        const items = Array.isArray(source?.output?.items) ? source.output.items : [];
        const field = String(config.recipientField || '').trim();
        const map = new Map();
        items.forEach((item) => {
          const key = String(item?.[field] ?? '').trim();
          if (key) map.set(key, item);
        });
        return map;
      })();

      const campaignIdNum = Number.isFinite(parseInt(campaignId, 10))
        ? parseInt(campaignId, 10)
        : null;

      /**
       * Append missing UTM params while preserving existing query/fragment.
       *
       * @param {string} url
       * @param {string|number|null} customerId
       * @returns {string}
       */
      const addUtmToUrl = (url, customerId = null) => {
        const rawUrl = String(url || '').trim();
        if (!rawUrl) return rawUrl;

        const hashIndex = rawUrl.indexOf('#');
        const baseUrl = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
        const hashPart = hashIndex >= 0 ? rawUrl.slice(hashIndex) : '';

        const queryIndex = baseUrl.indexOf('?');
        const currentQuery = queryIndex >= 0 ? baseUrl.slice(queryIndex + 1) : '';
        const existingParams = new URLSearchParams(currentQuery);
        const newParams = new URLSearchParams();

        if (!existingParams.has('utm_source')) {
          newParams.set('utm_source', 'email_campaign');
        }
        if (campaignIdNum && !existingParams.has('utm_campaign')) {
          newParams.set('utm_campaign', String(campaignIdNum));
        }

        const customerIdNum = Number.isFinite(parseInt(customerId, 10))
          ? parseInt(customerId, 10)
          : null;
        if (customerIdNum && !existingParams.has('utm_customer')) {
          newParams.set('utm_customer', String(customerIdNum));
        }

        const appendedQuery = newParams.toString();
        if (!appendedQuery) return rawUrl;

        const hasQuestionMark = baseUrl.includes('?');
        const needsAmpersand = hasQuestionMark && !/[?&]$/.test(baseUrl);
        const queryPrefix = hasQuestionMark ? (needsAmpersand ? '&' : '') : '?';
        return `${baseUrl}${queryPrefix}${appendedQuery}${hashPart}`;
      };

      const resolveTemplateVariables = (recipientEmail, step, recipientRow = null) => {
        const vars = {};
        const mappings = step?.templateMappings || [];
        const recipientCustomerId = recipientRow?.customerId || recipientRow?.id || recipientRow?.id_customer || null;

        mappings.forEach((m) => {
          const key = normalizeKey(m.key || m.variableName);
          if (!key) return;
          if (m.sourceType === 'manual') {
            let value = m.value ?? '';
            if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
              value = addUtmToUrl(value, recipientCustomerId);
            }
            vars[key] = value;
            return;
          }
          if (m.sourceType === 'node' && m.nodeId && m.field) {
            const source = ctx.nodeResultsById?.[m.nodeId] || null;
            const items = Array.isArray(source?.output?.items) ? source.output.items : [];
            let selected = items[0] || null;
            if (recipientEmail && config.recipientSource === 'node' && m.nodeId === config.recipientNodeId) {
              selected = recipientRowMap.get(recipientEmail) || selected;
            }
            let value = selected?.[m.field] ?? '';
            const fieldLower = String(m.field || '').toLowerCase();
            const isLikelyUrl = fieldLower.includes('url')
              || fieldLower.includes('link')
              || fieldLower.includes('permalink');
            const valueStr = String(value || '').trim();
            const isUrl = /^https?:\/\//i.test(valueStr);

            if ((isLikelyUrl || isUrl) && valueStr) {
              value = addUtmToUrl(valueStr, recipientCustomerId);
            }

            vars[key] = value;
          }
        });
        return vars;
      };

      const sendStepToRecipient = async (to, step, stepIndex = 0, options = {}) => {
        const { skipApiDelay = false } = options;
        const rowForRecipient = config.recipientSource === 'column'
          ? rows.find((r) => String(r?.[resolveColumnKey(r, config.recipientColumn)] ?? '').trim() === to) || null
          : config.recipientSource === 'node'
            ? recipientRowMap.get(to) || null
            : rows[0] || null;

        const mappedVars = applyMappingsForRow(rowForRecipient, ctx.mapping?.mappings || []);
        const tpl = await getTemplateDetail(step.templateId, ctx.templateCache, signal);
        if (!tpl) {
          return {
            to,
            status: 'failed',
            error: 'Không tìm thấy template email',
            subject: '',
            variables: {},
          };
        }

        const extraVars = resolveTemplateVariables(to, step);
        const mergedVars = { ...mappedVars, ...extraVars };
        const subject = renderTemplateString(config.emailSubject || tpl.subject || '', mergedVars);
        const htmlContent = renderTemplateString(tpl.bodyHtml || '', mergedVars);
        const content = renderTemplateString(tpl.bodyText || '', mergedVars) || subject;
        // Builder luôn preview-only nên không truyền khóa campaign/customer để tránh backend ghi dữ liệu ngoài ý muốn.
        const normalizedCustomerId = null;
        const canAttachCampaignId = null;
        // Builder chỉ dùng để preview: luôn không lưu message log vào DB.
        const shouldSaveMessageLog = false;

        try {
          if (!skipApiDelay) {
            await waitRandomPreviewApiDelay(`email_send_to_${String(to || '').trim() || 'unknown'}`, signal, {
              channel: 'email',
            });
          }
          const resp = await apiService.sendPreviewEmail({
            fromEmailId: config.fromEmailId,
            to,
            cc: ccList,
            bcc: bccList,
            subject,
            content,
            htmlContent,
            attachments: Array.isArray(tpl.attachments) ? tpl.attachments : [],
            campaignId: canAttachCampaignId,
            emailTemplateId: step.templateId,
            saveMessageLog: shouldSaveMessageLog,
            customerId: normalizedCustomerId,
            // Builder luôn gửi ở chế độ preview để không tạo tracking/unsubscribe và không ghi DB.
            previewMode: true,
            // Giữ tương thích ngược cho backend cũ đang đọc cờ `isPreview`.
            isPreview: true,
            // Cờ ngữ cảnh Build để backend chặn tuyệt đối các nhánh ghi dữ liệu.
            builderMode: true,
            runId: null,
          }, { signal });
          const trackingWarnings = resp.data?.data?.tracking?.warnings || [];
          if (trackingWarnings.length) {
            toastNotifier.error(trackingWarnings[0], { id: 'tracking-base-url-warning' });
          }
          return {
            to,
            status: 'success',
            messageId: resp.data?.data?.messageId,
            from: resp.data?.data?.from,
            sentAt: resp.data?.data?.sentAt,
            tracking: resp.data?.data?.tracking || null,
            subject,
            variables: mergedVars,
            stepIndex: stepIndex + 1,
          };
        } catch (err) {
          if (isRunCancelledError(err)) {
            throw err;
          }
          const responseData = err?.response?.data?.data || {};
          const msg = err?.response?.data?.message || err?.message || 'Gửi email thất bại';

          // Bỏ qua (unsubscribed hoặc hard bounce)
          if (responseData.skipped) {
            const skipLabels = {
              unsubscribed: 'Đã hủy đăng ký — bỏ qua',
              hard_bounced: 'Hard bounce — bỏ qua',
            };
            return {
              to,
              status: 'skipped',
              reason: responseData.reason || 'unsubscribed',
              error: skipLabels[responseData.reason] || msg,
              subject,
              variables: mergedVars,
              stepIndex: stepIndex + 1,
            };
          }

          // Lỗi cấu hình SMTP (ví dụ 535) phải hiển thị failed, không tính bounced.
          if (responseData.failed || responseData.errorType === 'smtp_config') {
            return {
              to,
              status: 'failed',
              errorType: responseData.errorType || 'smtp_config',
              error: responseData.error || msg,
              subject,
              variables: mergedVars,
              stepIndex: stepIndex + 1,
            };
          }

          // Bounce từ SMTP
          if (responseData.bounced) {
            return {
              to,
              status: 'bounced',
              bounceType: responseData.bounceType || 'soft',
              bounceReason: responseData.bounceReason || msg,
              error: msg,
              subject,
              variables: mergedVars,
              stepIndex: stepIndex + 1,
            };
          }

          return {
            to,
            status: 'failed',
            error: msg,
            subject,
            variables: mergedVars,
            stepIndex: stepIndex + 1,
          };
        }
      };

      const emitSendEmailProgress = () => {
        if (!onProgress) return;
        const totalAttempts = uniqueRecipients.length * steps.length;
        const sentCount = sendResults.filter((item) => item?.status === 'success').length;
        const skippedCount = sendResults.filter((item) => item?.status === 'skipped').length;
        const bouncedCount = sendResults.filter((item) => item?.status === 'bounced').length;
        onProgress({
          status: 'info',
          message: `Đang gửi email (${sendResults.length}/${totalAttempts})`,
          result: {
            input: {
              fromEmailId: config.fromEmailId,
              recipientSource: config.recipientSource,
            },
            output: {
              items: [...sendResults],
              schema: buildSchemaFromRows(sendResults),
              meta: {
                attempted: sendResults.length,
                sent: sentCount,
                skipped: skippedCount,
                bounced: bouncedCount,
                totalAttempts,
                limitedTo: maxSendEnabled ? maxSend : null,
              },
            },
          },
        });
      };

      /**
       * Chờ đúng lịch gửi cho từng step email trong Builder theo mốc chung.
       *
       * Luồng hoạt động:
       * 1. Tính delay từ cấu hình step (`delayValue`, `delayUnit`).
       * 2. Chọn mốc gốc theo `delayFrom` (`start` hoặc `prev`).
       * 3. Sleep đến target time của step hiện tại rồi trả về target để step sau tái sử dụng.
       *
       * @param {object} input
       * @param {number} input.scheduleStartAt Mốc bắt đầu chung của cả lượt gửi.
       * @param {number} input.previousStepTargetAt Mốc target của step trước đó.
       * @param {object} input.step Step cấu hình email hiện tại.
       * @returns {Promise<number>} target time (ms) của step hiện tại.
       */
      const waitForScheduledEmailStep = async ({ scheduleStartAt, previousStepTargetAt, step }) => {
        const delayMs = Math.max(0, parseInt(step?.delayValue || 0, 10)) * unitToMs(step?.delayUnit || 'minutes');
        const delayFrom = String(step?.delayFrom || 'start').trim() === 'prev' ? 'prev' : 'start';
        const baseTime = delayFrom === 'prev' ? previousStepTargetAt : scheduleStartAt;
        const targetTime = baseTime + delayMs;
        const waitMs = Math.max(0, targetTime - Date.now());
        if (waitMs > 0) {
          await sleepWithAbort(waitMs, signal);
        }
        return targetTime;
      };

      const unsubscribedRecipients = new Set();
      const applyEmailResultForRecipient = (recipient, stepIndex, result) => {
        sendResults.push(result);
        if (result?.status === 'success') {
          markRecipientStepCompleted(emailProgressMap, recipient, stepIndex + 1);
        } else if (
          result?.status === 'skipped'
          && String(result?.reason || '').trim().toLowerCase() === 'unsubscribed'
        ) {
          unsubscribedRecipients.add(recipient);
          markRecipientStepCompleted(emailProgressMap, recipient, steps.length);
        }
        emitSendEmailProgress();
      };
      /**
       * Gửi một step email theo thứ tự từng recipient có giãn cách 5-10 giây.
       *
       * Luồng hoạt động:
       * 1. Lọc recipient còn hợp lệ cho step hiện tại theo progress map.
       * 2. Gửi lần lượt từng recipient để kiểm soát nhịp gửi trong một template.
       * 3. Chèn delay ngẫu nhiên 5-10 giây giữa 2 lần gửi liên tiếp.
       *
       * @param {object} step cấu hình step email hiện tại
       * @param {number} stepIndex chỉ số step
       * @returns {Promise<void>}
       */
      const runEmailStepWave = async (step, stepIndex) => {
        const recipientsForStep = uniqueRecipients.filter((recipient) => {
          if (unsubscribedRecipients.has(recipient)) return false;
          return getRecipientNextStepIndex(emailProgressMap, recipient) <= stepIndex;
        });
        if (recipientsForStep.length <= 0) return;
        for (let index = 0; index < recipientsForStep.length; index += 1) {
          const recipient = recipientsForStep[index];
          if (index > 0) {
            // eslint-disable-next-line no-await-in-loop
            await waitRandomTemplateStepDelay(`email_step_${stepIndex + 1}`, signal, 'email');
          }
          // eslint-disable-next-line no-await-in-loop
          const result = await sendStepToRecipient(recipient, step, stepIndex, { skipApiDelay: true });
          applyEmailResultForRecipient(recipient, stepIndex, result);
        }
      };

      if (sendAllAtOnce) {
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
          // eslint-disable-next-line no-await-in-loop
          await runEmailStepWave(steps[stepIndex], stepIndex);
        }
      } else {
        const scheduleStartAt = Date.now();
        let previousStepTargetAt = scheduleStartAt;
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
          const step = steps[stepIndex];
          // eslint-disable-next-line no-await-in-loop
          previousStepTargetAt = await waitForScheduledEmailStep({
            scheduleStartAt,
            previousStepTargetAt,
            step,
          });
          // eslint-disable-next-line no-await-in-loop
          await runEmailStepWave(step, stepIndex);
        }
      }

      return {
        input: {
          fromEmailId: config.fromEmailId,
          recipientSource: config.recipientSource,
          recipientColumn: config.recipientColumn || null,
          recipientEmails: config.recipientSource === 'manual' ? config.recipientEmails : null,
          recipientNodeId: config.recipientSource === 'node' ? config.recipientNodeId : null,
          recipientField: config.recipientSource === 'node' ? config.recipientField : null,
          recipientMode,
          sendMode: config.sendMode || 'all',
          emailSteps: steps,
          ccEnabled: !!config.ccEnabled,
          ccSource: config.ccSource || null,
          ccEmails: config.ccSource === 'manual' ? config.ccEmails : null,
          ccNodeId: config.ccSource === 'node' ? config.ccNodeId : null,
          ccField: config.ccSource === 'node' ? config.ccField : null,
          bccEnabled: !!config.bccEnabled,
          bccSource: config.bccSource || null,
          bccEmails: config.bccSource === 'manual' ? config.bccEmails : null,
          bccNodeId: config.bccSource === 'node' ? config.bccNodeId : null,
          bccField: config.bccSource === 'node' ? config.bccField : null,
          usedMappingTemplateId: ctx.mapping?.templateId || null,
          maxSendEnabled,
          maxSendCount: maxSendEnabled ? maxSend : null,
        },
        output: {
          items: sendResults,
          schema: buildSchemaFromRows(sendResults),
          meta: {
            attempted: sendResults.length,
            sent: sendResults.filter((r) => r.status === 'success').length,
            totalAttempts: limitedRecipients.length * steps.length,
            limitedTo: maxSendEnabled ? maxSend : null,
          },
        },
      };
    }

    if (nodeType === 'send_zalo_personal') {
      const selectedAccount = ensureSelectedZaloAccount(ctx);
      const recipientType = String(config.zaloRecipientType || 'phone').trim().toLowerCase() === 'uid'
        ? 'uid'
        : 'phone';
      const recipientEntries = collectRecipientEntriesFromSource(ctx, {
        sourceMode: config.zaloRecipientSource || 'manual',
        manualValue: config.zaloRecipientPhones || '',
        sourceNodeId: config.zaloRecipientNodeId || '',
        sourceField: config.zaloRecipientField || (recipientType === 'uid' ? 'uid' : 'phone'),
      });
      const recipients = recipientEntries.map((entry) => String(entry?.value || '').trim()).filter(Boolean);
      const uniqueRecipients = Array.from(new Set(recipients.map((item) => String(item || '').trim()).filter(Boolean)));
      const zaloProgressMap = getNodeRecipientProgressMap(ctx, node.id, 'zalo_personal');
      const templateSteps = Array.isArray(config.zaloPersonalTemplateSteps) ? config.zaloPersonalTemplateSteps : [];
      const sendMode = String(config.zaloPersonalSendMode || 'all').trim();
      const unitToMs = (unit) => {
        if (unit === 'hours') return 60 * 60 * 1000;
        if (unit === 'days') return 24 * 60 * 60 * 1000;
        return 60 * 1000;
      };

      if (templateSteps.length > 0) {
        const templateContentCache = ctx.zaloTemplateContentCache || new Map();
        ctx.zaloTemplateContentCache = templateContentCache;
        const steps = [];
        for (const step of templateSteps) {
          // eslint-disable-next-line no-await-in-loop
          const templateContent = await getZaloTemplateContent(step.templateId, templateContentCache, signal);
          if (!templateContent.message) {
            throw new Error('Template Zalo không có nội dung để gửi');
          }
          steps.push({
            ...step,
            message: templateContent.message,
            attachments: Array.isArray(templateContent.attachments) ? templateContent.attachments : [],
          });
        }
        const totalAttempts = uniqueRecipients.length * steps.length;
        const results = [];
        const emitProgress = () => {
          if (!onProgress) return;
          const current = results.length;
          const latest = results[current - 1] || null;
          onProgress({
            status: latest?.status === 'failed' ? 'warning' : 'info',
            message: `Đang gửi tin Zalo cá nhân (${current}/${totalAttempts})`,
            result: {
              input: { accountId: selectedAccount.id },
              output: {
                items: [...results],
                schema: buildSchemaFromRows(results),
                meta: {
                  attempted: current,
                  totalItems: totalAttempts,
                },
              },
            },
          });
        };

        const runStepForRecipient = async (step, stepIndex, recipient, options = {}) => {
          const { skipApiDelay = false } = options;
          const entry = recipientEntries.find((item) => String(item?.value || '').trim() === recipient) || null;
          if (!entry) return;
          const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
          const renderedMessage = mappings.length > 0
            ? renderZaloTemplateMessage({
              templateText: step.message,
              mappings,
              ctx,
              entry,
              fallbackNodeId: config.zaloRecipientNodeId || '',
            })
            : String(step.message || '').trim();
          if (!skipApiDelay) {
            await waitRandomPreviewApiDelay(`zalo_personal_single_step_${stepIndex + 1}`, signal, {
              channel: 'zalo',
            });
          }
          // eslint-disable-next-line no-await-in-loop
          const response = await apiService.sendPreviewZaloPersonal({
            accountId: selectedAccount.id,
            recipients: [recipient],
            recipientType,
            message: renderedMessage,
            attachments: Array.isArray(step.attachments) ? step.attachments : [],
          }, { signal });
          const stepItems = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
          const variables = resolveZaloTemplateVariables(
            ctx,
            mappings,
            entry,
            config.zaloRecipientNodeId || ''
          );
          stepItems.forEach((item) => {
            const meta = buildPreviewZaloLogMeta({
              item,
              account: selectedAccount,
              entry,
              fallbackRecipient: recipient,
            });
            results.push({
              ...item,
              ...meta,
              templateId: step.templateId || null,
              stepIndex: stepIndex + 1,
              message: renderedMessage,
              attachments: Array.isArray(item?.attachments) ? item.attachments : step.attachments,
              attachmentsCount: Number(item?.attachmentsCount || step.attachments?.length || 0),
              variables,
            });
            emitProgress();
          });
          if (stepItems.some((item) => item?.status === 'success')) {
            markRecipientStepCompleted(zaloProgressMap, recipient, stepIndex + 1);
          }
        };

        /**
         * Chờ đúng mốc gửi của từng template theo mốc chung của cả đợt.
         *
         * Luồng hoạt động:
         * 1. Tính delay theo đơn vị phút/giờ/ngày.
         * 2. Xác định mốc gốc theo `delayFrom` (từ lúc chạy hoặc từ step trước).
         * 3. Chờ đến đúng target time trước khi gửi step hiện tại.
         *
         * @param {object} params
         * @param {number} params.scheduleStartAt Mốc bắt đầu chung của lượt chạy.
         * @param {number} params.previousStepTargetAt Mốc target của step trước đó.
         * @param {object} params.step Cấu hình step hiện tại.
         * @returns {Promise<number>} target time của step hiện tại.
         */
        const waitForScheduledStep = async ({ scheduleStartAt, previousStepTargetAt, step }) => {
          const delayMs = Math.max(0, parseInt(step?.delayValue || 0, 10)) * unitToMs(step?.delayUnit || 'minutes');
          const delayFrom = String(step?.delayFrom || 'start').trim() === 'prev' ? 'prev' : 'start';
          const baseTime = delayFrom === 'prev' ? previousStepTargetAt : scheduleStartAt;
          const targetTime = baseTime + delayMs;
          const waitMs = Math.max(0, targetTime - Date.now());
          if (waitMs > 0) {
            await sleepWithAbort(waitMs, signal);
          }
          return targetTime;
        };

        /**
         * Gửi một step Zalo cá nhân theo thứ tự và giãn cách 5-10 giây.
         *
         * Luồng hoạt động:
         * 1. Lấy danh sách recipient còn cần chạy step hiện tại.
         * 2. Gửi tuần tự từng recipient để tránh bắn dồn quá nhanh.
         * 3. Chèn delay ngẫu nhiên 5-10 giây giữa các lần gửi trong cùng step.
         *
         * @param {object} step cấu hình step hiện tại
         * @param {number} stepIndex chỉ số step
         * @returns {Promise<void>}
         */
        const runZaloStepWave = async (step, stepIndex) => {
          const recipientsForStep = uniqueRecipients.filter(
            (recipient) => getRecipientNextStepIndex(zaloProgressMap, recipient) <= stepIndex
          );
          if (recipientsForStep.length <= 0) return;
          for (let index = 0; index < recipientsForStep.length; index += 1) {
            if (index > 0) {
              // eslint-disable-next-line no-await-in-loop
              await waitRandomTemplateStepDelay(`zalo_personal_step_${stepIndex + 1}`, signal, 'zalo');
            }
            // eslint-disable-next-line no-await-in-loop
            await runStepForRecipient(step, stepIndex, recipientsForStep[index], { skipApiDelay: true });
          }
        };

        if (sendMode === 'schedule') {
          const scheduleStartAt = Date.now();
          let previousStepTargetAt = scheduleStartAt;
          for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
            const step = steps[stepIndex];
            // eslint-disable-next-line no-await-in-loop
            previousStepTargetAt = await waitForScheduledStep({
              scheduleStartAt,
              previousStepTargetAt,
              step,
            });
            // eslint-disable-next-line no-await-in-loop
            await runZaloStepWave(step, stepIndex);
          }
        } else {
          for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
            // eslint-disable-next-line no-await-in-loop
            await runZaloStepWave(steps[stepIndex], stepIndex);
          }
        }

        return {
          input: {
            accountId: selectedAccount.id,
            accountName: selectedAccount.displayName,
            recipientType,
            recipientSource: config.zaloRecipientSource || 'manual',
            recipientPhones: config.zaloRecipientSource === 'manual' ? config.zaloRecipientPhones || '' : null,
            recipientNodeId: config.zaloRecipientSource === 'node' ? config.zaloRecipientNodeId || null : null,
            recipientField: config.zaloRecipientSource === 'node' ? config.zaloRecipientField || null : null,
            sendMode,
            templateSteps,
          },
          output: {
            items: results,
            schema: buildSchemaFromRows(results),
            meta: {
              attempted: results.length,
              sent: results.filter((item) => item.status === 'success').length,
              failed: results.filter((item) => item.status === 'failed').length,
              totalItems: totalAttempts,
            },
          },
        };
      }

      const message = String(config.zaloMessage || '').trim();
      await waitRandomPreviewApiDelay('zalo_personal_bulk_single_message', signal, {
        channel: 'zalo',
      });
      const pendingRecipients = uniqueRecipients.filter(
        (recipient) => getRecipientNextStepIndex(zaloProgressMap, recipient) < 1
      );
      const response = await apiService.sendPreviewZaloPersonal({
        accountId: selectedAccount.id,
        recipients: pendingRecipients,
        recipientType,
        message,
      }, { signal });
      const allItems = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
      const results = [];
      for (let idx = 0; idx < allItems.length; idx += 1) {
        const item = allItems[idx];
        const fallbackRecipient = String(item?.recipient || item?.to || pendingRecipients[idx] || '').trim();
        const entry = recipientEntries.find(
          (entryItem) => String(entryItem?.value || '').trim() === fallbackRecipient
        ) || null;
        const meta = buildPreviewZaloLogMeta({
          item,
          account: selectedAccount,
          entry,
          fallbackRecipient,
        });
        results.push({
          ...item,
          ...meta,
        });
        if (item?.status === 'success') {
          markRecipientStepCompleted(
            zaloProgressMap,
            String(item?.recipient || item?.to || pendingRecipients[idx] || '').trim(),
            1
          );
        }
        if (onProgress) {
          onProgress({
            status: item?.status === 'failed' ? 'warning' : 'info',
            message: `Đang gửi tin Zalo cá nhân (${idx + 1}/${allItems.length})`,
            result: {
              input: {
                accountId: selectedAccount.id,
              },
              output: {
                items: [...results],
                schema: buildSchemaFromRows(results),
                meta: {
                  attempted: idx + 1,
                  totalItems: allItems.length,
                },
              },
            },
          });
        }
      }

      return {
        input: {
          accountId: selectedAccount.id,
          accountName: selectedAccount.displayName,
          recipientType,
          recipientSource: config.zaloRecipientSource || 'manual',
          recipientPhones: config.zaloRecipientSource === 'manual' ? config.zaloRecipientPhones || '' : null,
          recipientNodeId: config.zaloRecipientSource === 'node' ? config.zaloRecipientNodeId || null : null,
          recipientField: config.zaloRecipientSource === 'node' ? config.zaloRecipientField || null : null,
          message,
        },
        output: {
          items: results,
          schema: buildSchemaFromRows(results),
          meta: {
            attempted: results.length,
            sent: results.filter((item) => item.status === 'success').length,
            failed: results.filter((item) => item.status === 'failed').length,
            totalItems: pendingRecipients.length,
          },
        },
      };
    }

    if (nodeType === 'send_zalo_friend_request') {
      const selectedAccount = ensureSelectedZaloAccount(ctx);
      const recipientEntries = collectRecipientEntriesFromSource(ctx, {
        sourceMode: config.zaloFriendSource || 'manual',
        manualValue: config.zaloFriendPhones || '',
        sourceNodeId: config.zaloFriendNodeId || '',
        sourceField: config.zaloFriendField || '',
      });
      const recipientPhones = recipientEntries.map((entry) => entry.phone);
      const contentMode = String(config.zaloFriendContentMode || 'manual').trim();
      let templateBody = String(config.zaloFriendTemplateBody || '').trim();
      if (contentMode === 'template' && !templateBody && config.zaloFriendTemplateId) {
        const templateResp = await apiService.getZaloTemplateById(config.zaloFriendTemplateId, { signal });
        templateBody = String(
          templateResp.data?.data?.bodyText
            || templateResp.data?.data?.bodyHtml
            || ''
        ).trim();
      }

      const allItems = [];
      const renderFriendTemplateMessage = (entry) => {
        if (contentMode !== 'template') {
          return String(config.zaloFriendRequestMessage || '').trim();
        }
        const mappings = Array.isArray(config.zaloFriendTemplateMappings)
          ? config.zaloFriendTemplateMappings
          : [];
        const vars = {};
        mappings.forEach((mapping) => {
          const key = String(mapping?.key || '').trim();
          if (!key) return;
          const sourceType = mapping?.sourceType === 'recipient_field'
            ? 'node'
            : String(mapping?.sourceType || 'manual').trim();
          if (sourceType === 'node') {
            const field = String(mapping?.field || '').trim();
            if (!field) {
              vars[key] = '';
              return;
            }
            const nodeId = String(mapping?.nodeId || config.zaloFriendNodeId || '').trim();
            if (!nodeId) {
              vars[key] = entry?.row?.[field] ?? '';
              return;
            }
            const source = ctx.nodeResultsById?.[nodeId] || null;
            const items = Array.isArray(source?.output?.items) ? source.output.items : [];
            const firstRow = items[0] || null;
            const sameRecipientNode = nodeId && String(config.zaloFriendNodeId || '').trim() === nodeId;
            const selectedRow = sameRecipientNode ? (entry?.row || firstRow) : firstRow;
            vars[key] = selectedRow?.[field] ?? '';
            return;
          }
          vars[key] = mapping?.value ?? '';
        });
        return renderTemplateString(templateBody, vars).trim();
      };

      for (const entry of recipientEntries) {
        const renderedMessage = renderFriendTemplateMessage(entry);
        // eslint-disable-next-line no-await-in-loop
        await waitRandomPreviewApiDelay('zalo_friend_request_single', signal, {
          channel: 'zalo',
        });
        // eslint-disable-next-line no-await-in-loop
        const response = await apiService.sendPreviewZaloFriendRequest({
          accountId: selectedAccount.id,
          recipients: [entry.phone],
          message: renderedMessage,
        }, { signal });
        const items = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
        allItems.push(...items.map((item) => ({
          ...item,
          requestMessage: renderedMessage,
        })));
      }

      const results = [];
      for (let idx = 0; idx < allItems.length; idx += 1) {
        const item = allItems[idx];
        results.push(item);
        if (onProgress) {
          onProgress({
            status: item?.status === 'failed' ? 'warning' : 'info',
            message: `Đang gửi lời mời kết bạn (${idx + 1}/${allItems.length})`,
            result: {
              input: {
                accountId: selectedAccount.id,
              },
              output: {
                items: [...results],
                schema: buildSchemaFromRows(results),
                meta: {
                  attempted: idx + 1,
                  totalItems: allItems.length,
                },
              },
            },
          });
        }
      }

      return {
        input: {
          accountId: selectedAccount.id,
          accountName: selectedAccount.displayName,
          recipientSource: config.zaloFriendSource || 'manual',
          recipientPhones: config.zaloFriendSource === 'manual' ? config.zaloFriendPhones || '' : null,
          recipientNodeId: config.zaloFriendSource === 'node' ? config.zaloFriendNodeId || null : null,
          recipientField: config.zaloFriendSource === 'node' ? config.zaloFriendField || null : null,
          requestMessage: contentMode === 'manual' ? String(config.zaloFriendRequestMessage || '').trim() : null,
          contentMode,
          templateId: contentMode === 'template' ? config.zaloFriendTemplateId || null : null,
        },
        output: {
          items: results,
          schema: buildSchemaFromRows(results),
          meta: {
            attempted: results.length,
            sent: results.filter((item) => item.status === 'success').length,
            failed: results.filter((item) => item.status === 'failed').length,
            totalItems: recipientPhones.length,
          },
        },
      };
    }

    if (nodeType === 'send_zalo_group') {
      const selectedAccount = ensureSelectedZaloAccount(ctx);
      const groupEntries = collectRecipientEntriesFromSource(ctx, {
        sourceMode: config.zaloGroupSource || 'manual',
        manualValue: config.zaloGroupIds || '',
        sourceNodeId: config.zaloGroupNodeId || '',
        sourceField: config.zaloGroupField || '',
      });
      const groupIds = groupEntries.map((entry) => String(entry?.value || '').trim()).filter(Boolean);
      const templateSteps = Array.isArray(config.zaloGroupTemplateSteps) ? config.zaloGroupTemplateSteps : [];
      const sendMode = String(config.zaloGroupSendMode || 'all').trim();
      const unitToMs = (unit) => {
        if (unit === 'hours') return 60 * 60 * 1000;
        if (unit === 'days') return 24 * 60 * 60 * 1000;
        return 60 * 1000;
      };

      if (templateSteps.length > 0) {
        const templateContentCache = ctx.zaloGroupTemplateContentCache || new Map();
        ctx.zaloGroupTemplateContentCache = templateContentCache;
        const steps = [];
        for (const step of templateSteps) {
          // eslint-disable-next-line no-await-in-loop
          const templateContent = await getZaloTemplateContent(step.templateId, templateContentCache, signal);
          if (!templateContent.message) {
            throw new Error('Template Zalo không có nội dung để gửi');
          }
          steps.push({
            ...step,
            message: templateContent.message,
            attachments: Array.isArray(templateContent.attachments) ? templateContent.attachments : [],
          });
        }
        const totalAttempts = groupIds.length * steps.length;
        const results = [];
        const emitProgress = () => {
          if (!onProgress) return;
          const current = results.length;
          const latest = results[current - 1] || null;
          onProgress({
            status: latest?.status === 'failed' ? 'warning' : 'info',
            message: `Đang gửi tin nhắn nhóm Zalo (${current}/${totalAttempts})`,
            result: {
              input: { accountId: selectedAccount.id },
              output: {
                items: [...results],
                schema: buildSchemaFromRows(results),
                meta: {
                  attempted: current,
                  totalItems: totalAttempts,
                },
              },
            },
          });
        };

        const runSingleStep = async (step, stepIndex) => {
          const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
          for (let index = 0; index < groupEntries.length; index += 1) {
            const entry = groupEntries[index];
            const groupId = String(entry?.value || '').trim();
            if (!groupId) continue;
            if (index > 0) {
              // eslint-disable-next-line no-await-in-loop
              await waitRandomTemplateStepDelay(`zalo_group_step_${stepIndex + 1}`, signal, 'zalo_group_template');
            }
            const renderedMessage = mappings.length > 0
              ? renderZaloTemplateMessage({
                templateText: step.message,
                mappings,
                ctx,
                entry,
                fallbackNodeId: config.zaloGroupNodeId || '',
              })
              : String(step.message || '').trim();
            // eslint-disable-next-line no-await-in-loop
            const response = await apiService.sendPreviewZaloGroup({
              accountId: selectedAccount.id,
              groupIds: [groupId],
              message: renderedMessage,
              attachments: Array.isArray(step.attachments) ? step.attachments : [],
            }, { signal });
            const stepItems = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
            const variables = resolveZaloTemplateVariables(
              ctx,
              mappings,
              entry,
              config.zaloGroupNodeId || ''
            );
            stepItems.forEach((item) => {
              const meta = buildPreviewZaloLogMeta({
                item,
                account: selectedAccount,
                entry,
                fallbackGroupId: groupId,
              });
              results.push({
                ...item,
                ...meta,
                templateId: step.templateId || null,
                stepIndex: stepIndex + 1,
                message: renderedMessage,
                attachments: Array.isArray(item?.attachments) ? item.attachments : step.attachments,
                attachmentsCount: Number(item?.attachmentsCount || step.attachments?.length || 0),
                variables: mappings.length > 0 ? variables : {},
              });
              emitProgress();
            });
          }
        };
        /**
         * Chờ đúng mốc gửi cho step Zalo group theo cấu hình delay.
         *
         * @param {object} params thông tin lịch gửi
         * @param {number} params.scheduleStartAt mốc bắt đầu chung của lượt chạy
         * @param {number} params.previousStepTargetAt target time của step trước
         * @param {object} params.step cấu hình step hiện tại
         * @returns {Promise<number>} target time của step hiện tại
         */
        const waitForScheduledGroupStep = async ({ scheduleStartAt, previousStepTargetAt, step }) => {
          const delayMs = Math.max(0, parseInt(step?.delayValue || 0, 10)) * unitToMs(step?.delayUnit || 'minutes');
          const delayFrom = String(step?.delayFrom || 'start').trim() === 'prev' ? 'prev' : 'start';
          const baseTime = delayFrom === 'prev' ? previousStepTargetAt : scheduleStartAt;
          const targetTime = baseTime + delayMs;
          const waitMs = Math.max(0, targetTime - Date.now());
          if (waitMs > 0) {
            await sleepWithAbort(waitMs, signal);
          }
          return targetTime;
        };

        if (sendMode === 'schedule') {
          const scheduleStartAt = Date.now();
          let previousStepTargetAt = scheduleStartAt;
          for (let index = 0; index < steps.length; index += 1) {
            const step = steps[index];
            // eslint-disable-next-line no-await-in-loop
            previousStepTargetAt = await waitForScheduledGroupStep({
              scheduleStartAt,
              previousStepTargetAt,
              step,
            });
            // eslint-disable-next-line no-await-in-loop
            await runSingleStep(step, index);
          }
        } else {
          for (let index = 0; index < steps.length; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await runSingleStep(steps[index], index);
          }
        }

        return {
          input: {
            accountId: selectedAccount.id,
            accountName: selectedAccount.displayName,
            groupSource: config.zaloGroupSource || 'manual',
            groupIds: config.zaloGroupSource === 'manual' ? config.zaloGroupIds || '' : null,
            groupNodeId: config.zaloGroupSource === 'node' ? config.zaloGroupNodeId || null : null,
            groupField: config.zaloGroupSource === 'node' ? config.zaloGroupField || null : null,
            sendMode,
            templateSteps,
          },
          output: {
            items: results,
            schema: buildSchemaFromRows(results),
            meta: {
              attempted: results.length,
              sent: results.filter((item) => item.status === 'success').length,
              failed: results.filter((item) => item.status === 'failed').length,
              totalItems: totalAttempts,
            },
          },
        };
      }

      const message = String(config.zaloGroupMessage || '').trim();
      await waitRandomPreviewApiDelay('zalo_group_bulk_single_message', signal, {
        channel: 'zalo',
      });
      const response = await apiService.sendPreviewZaloGroup({
        accountId: selectedAccount.id,
        groupIds,
        message,
      }, { signal });
      const allItems = Array.isArray(response.data?.data?.items) ? response.data.data.items : [];
      const results = [];
      for (let idx = 0; idx < allItems.length; idx += 1) {
        const item = allItems[idx];
        const fallbackGroupId = String(item?.groupId || groupIds[idx] || '').trim();
        const entry = groupEntries.find(
          (entryItem) => String(entryItem?.value || '').trim() === fallbackGroupId
        ) || null;
        const meta = buildPreviewZaloLogMeta({
          item,
          account: selectedAccount,
          entry,
          fallbackGroupId,
        });
        results.push({
          ...item,
          ...meta,
        });
        if (onProgress) {
          onProgress({
            status: item?.status === 'failed' ? 'warning' : 'info',
            message: `Đang gửi tin nhắn nhóm Zalo (${idx + 1}/${allItems.length})`,
            result: {
              input: {
                accountId: selectedAccount.id,
              },
              output: {
                items: [...results],
                schema: buildSchemaFromRows(results),
                meta: {
                  attempted: idx + 1,
                  totalItems: allItems.length,
                },
              },
            },
          });
        }
      }

      return {
        input: {
          accountId: selectedAccount.id,
          accountName: selectedAccount.displayName,
          groupSource: config.zaloGroupSource || 'manual',
          groupIds: config.zaloGroupSource === 'manual' ? config.zaloGroupIds || '' : null,
          groupNodeId: config.zaloGroupSource === 'node' ? config.zaloGroupNodeId || null : null,
          groupField: config.zaloGroupSource === 'node' ? config.zaloGroupField || null : null,
          message,
        },
        output: {
          items: results,
          schema: buildSchemaFromRows(results),
          meta: {
            attempted: results.length,
            sent: results.filter((item) => item.status === 'success').length,
            failed: results.filter((item) => item.status === 'failed').length,
            totalItems: groupIds.length,
          },
        },
      };
    }

    return {
      input: config,
      output: { ok: true },
    };
  };

  return {
    checkSheetConnection,
    buildRunResultForNode,
  };
};
