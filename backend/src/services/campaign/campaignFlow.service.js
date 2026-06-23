class CampaignFlowService {
  /**
   * Infer primitive type from a JS value for schema preview.
   *
   * @param {unknown} value
   * @returns {string}
   */
  inferValueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Build schema array from first row in items.
   *
   * @param {Array<object>} rows
   * @returns {Array<{key: string, type: string}>}
   */
  buildSchemaFromRows(rows) {
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!first || typeof first !== 'object') return [];
    return Object.keys(first).map((key) => ({
      key,
      type: this.inferValueType(first[key]),
    }));
  }

  /**
   * Build success message for a node subtype.
   *
   * @param {string} nodeSubtype
   * @param {{ fetched?: number, total?: number, inserted?: number, updated?: number, skipped?: number, unchanged?: number }} stats
   * @returns {string}
   */
  buildNodeSuccessMessage(nodeSubtype, stats = {}) {
    const fetched = Number(stats.fetched || 0);
    const total = Number(stats.total || fetched);
    const inserted = Number(stats.inserted || 0);
    const updated = Number(stats.updated || 0);
    const skipped = Number(stats.skipped || 0);
    const unchanged = Number(stats.unchanged || 0);

    if (nodeSubtype === 'read_sheet') return `Đọc dữ liệu thành công (${fetched} dòng)`;
    if (nodeSubtype === 'read_interested_customers' || nodeSubtype === 'interested_customers') {
      return `Lấy khách để lại thông tin thành công (${fetched}/${total})`;
    }
    if (nodeSubtype === 'read_courses_db') return `Lấy khóa học đã chọn thành công (${fetched} khóa học)`;
    if (nodeSubtype === 'read_products_db') return `Lấy sản phẩm đã chọn thành công (${fetched} sản phẩm)`;
    if (nodeSubtype === 'read_landing_leads') {
      return `Lấy dữ liệu landing page thành công (${fetched} lead)`;
    }
    if (nodeSubtype === 'save_customer') {
      return `Lưu khách hàng xong (${inserted} mới, ${updated} cập nhật, ${unchanged} giữ nguyên, ${skipped} bỏ qua)`;
    }
    return 'Thực thi thành công';
  }

  /**
   * Normalize value for save_customer preview/log payload.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  normalizeSaveCustomerLogValue(value) {
    if (value == null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  }

  /**
   * Parse email list from comma/newline/semicolon text.
   *
   * @param {string} text
   * @returns {string[]}
   */
  parseEmailList(text) {
    return String(text || '')
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * Lấy giá trị field từ customer data theo config.
   *
   * @param {object} customerData
   * @param {object} fieldConfig
   * @returns {unknown}
   */
  getFieldValue(customerData, fieldConfig) {
    if (!fieldConfig) return null;

    const mode = fieldConfig.mode || 'manual';
    const field = String(fieldConfig.field || '').trim();
    const nodeId = String(fieldConfig.nodeId || '').trim();
    const value = fieldConfig.value;

    if (mode === 'node' && field) {
      const scopedData = nodeId && customerData?.__nodeData
        ? (customerData.__nodeData[nodeId] || customerData)
        : customerData;
      const fieldLower = field.toLowerCase();
      const aliasMap = {
        full_name: ['full_name', 'fullName', 'ten_khach'],
        fullname: ['full_name', 'fullName', 'ten_khach'],
        ten_khach: ['ten_khach', 'full_name', 'fullName'],
        phone: ['phone', 'dien_thoai'],
        dien_thoai: ['dien_thoai', 'phone'],
        email: ['email'],
      };
      const candidates = aliasMap[fieldLower] || [field];

      for (const candidate of candidates) {
        if (Object.prototype.hasOwnProperty.call(scopedData || {}, candidate)) {
          return scopedData[candidate];
        }
      }

      const lowerKeyMap = new Map(
        Object.keys(scopedData || {}).map((key) => [String(key).toLowerCase(), key])
      );
      for (const candidate of candidates) {
        const realKey = lowerKeyMap.get(String(candidate).toLowerCase());
        if (realKey) return scopedData[realKey];
      }

      return null;
    }

    if (mode === 'manual' && value) return value;
    return null;
  }

  /**
   * Build fixed-schema items for save_customer execution log.
   *
   * @param {Array<object>} rows source rows with __nodeData
   * @param {object} fieldMap save_customer field mapping config
   * @param {Array<object>} customFields custom field mapping config
   * @param {(row: object, config: object) => unknown} resolveFieldValue
   * @returns {Array<object>}
   */
  buildSaveCustomerLogItems(rows = [], fieldMap = {}, customFields = [], resolveFieldValue = null) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const safeFieldMap = fieldMap && typeof fieldMap === 'object' ? fieldMap : {};
    const safeCustomFields = Array.isArray(customFields) ? customFields : [];
    const getValue = typeof resolveFieldValue === 'function'
      ? resolveFieldValue
      : (row, config) => this.getFieldValue(row, config);

    return sourceRows.map((row) => {
      const customFieldObj = {};
      safeCustomFields.forEach((mapping) => {
        const key = String(mapping?.key || '').trim();
        if (!key) return;
        const mapped = this.normalizeSaveCustomerLogValue(getValue(row, mapping));
        if (mapped !== null) {
          customFieldObj[key] = mapped;
        }
      });

      const customerSource = this.normalizeSaveCustomerLogValue(
        getValue(row, safeFieldMap.customerSource)
      ) || 'campaign';

      return {
        email: this.normalizeSaveCustomerLogValue(getValue(row, safeFieldMap.email)),
        phone: this.normalizeSaveCustomerLogValue(getValue(row, safeFieldMap.phone)),
        fullName: this.normalizeSaveCustomerLogValue(getValue(row, safeFieldMap.fullName)),
        gender: this.normalizeSaveCustomerLogValue(getValue(row, safeFieldMap.gender)),
        customerSource,
        notes: this.normalizeSaveCustomerLogValue(getValue(row, safeFieldMap.notes)),
        zaloId: this.normalizeSaveCustomerLogValue(getValue(row, safeFieldMap.zaloId)),
        zaloPhone: this.normalizeSaveCustomerLogValue(getValue(row, safeFieldMap.zaloPhone)),
        customFields: Object.keys(customFieldObj).length ? customFieldObj : null,
      };
    });
  }

  /**
   * Build topological execution order map from graph connections.
   *
   * @param {Array<object>} nodes
   * @param {Array<object>} connections
   * @param {{ nodeIdKey: string, sourceKey: string, targetKey: string, fallbackKey?: string }} options
   * @returns {Map<string, number>}
   */
  buildExecutionOrderMap(nodes, connections, options) {
    const {
      nodeIdKey,
      sourceKey,
      targetKey,
      fallbackKey = nodeIdKey,
    } = options || {};
    const normalizeId = (id) => String(id ?? '');
    const nodeIds = nodes.map((node) => normalizeId(node?.[nodeIdKey] ?? node?.[fallbackKey]));
    const nodeIdSet = new Set(nodeIds);
    const adjacency = new Map(nodeIds.map((id) => [id, []]));
    const indegree = new Map(nodeIds.map((id) => [id, 0]));

    (connections || []).forEach((conn) => {
      const sourceId = normalizeId(conn?.[sourceKey]);
      const targetId = normalizeId(conn?.[targetKey]);
      if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) return;
      adjacency.get(sourceId).push(targetId);
      indegree.set(targetId, (indegree.get(targetId) || 0) + 1);
    });

    const triggerNodes = (nodes || []).filter((node) => {
      const subtype = String(node?.nodeSubtype || node?.node_subtype || '').toLowerCase();
      const type = String(node?.nodeType || node?.node_type || '').toLowerCase();
      return subtype.includes('trigger') || subtype === 'start' || type === 'trigger';
    });

    const triggerIds = triggerNodes.map((node) => normalizeId(node?.[nodeIdKey] ?? node?.[fallbackKey]));
    const fallbackRoots = nodeIds.filter((id) => (indegree.get(id) || 0) === 0);
    const startIds = triggerIds.length ? triggerIds : fallbackRoots;

    const reachable = new Set();
    const stack = [...startIds];
    while (stack.length) {
      const current = stack.pop();
      if (reachable.has(current)) continue;
      reachable.add(current);
      const nextList = adjacency.get(current) || [];
      nextList.forEach((nextId) => {
        if (!reachable.has(nextId)) stack.push(nextId);
      });
    }

    const reachableIndegree = new Map();
    reachable.forEach((id) => {
      reachableIndegree.set(id, 0);
    });
    reachable.forEach((sourceId) => {
      const nextList = adjacency.get(sourceId) || [];
      nextList.forEach((targetId) => {
        if (!reachable.has(targetId)) return;
        reachableIndegree.set(targetId, (reachableIndegree.get(targetId) || 0) + 1);
      });
    });

    const queue = [...startIds.filter(
      (id) => reachable.has(id) && (reachableIndegree.get(id) || 0) === 0
    )];
    if (!queue.length) {
      reachable.forEach((id) => {
        if ((reachableIndegree.get(id) || 0) === 0) queue.push(id);
      });
    }
    const visited = new Set();
    const orderedIds = [];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      orderedIds.push(current);
      const nextList = adjacency.get(current) || [];
      nextList.forEach((nextId) => {
        if (!reachable.has(nextId)) return;
        reachableIndegree.set(nextId, (reachableIndegree.get(nextId) || 0) - 1);
        if ((reachableIndegree.get(nextId) || 0) <= 0) {
          queue.push(nextId);
        }
      });
    }

    nodeIds.forEach((id) => {
      if (reachable.has(id) && !visited.has(id)) orderedIds.push(id);
    });

    const orderMap = new Map();
    orderedIds
      .filter((id) => reachable.has(id))
      .forEach((id, index) => {
        orderMap.set(id, index + 1);
      });
    return orderMap;
  }

  /**
   * Build a map from flow node id (frontend) to DB node id (campaign_nodes).
   *
   * @param {object|string|null} flowJson campaign.flow_json
   * @param {Array<object>} dbNodes rows from campaign_nodes
   * @returns {Map<string, string>}
   */
  buildFlowNodeIdMap(flowJson, dbNodes = []) {
    const map = new Map();
    const normalizeId = (id) => String(id ?? '');

    (dbNodes || []).forEach((node) => {
      map.set(normalizeId(node.id), normalizeId(node.id));
    });

    const flowObj = (() => {
      if (!flowJson) return null;
      if (typeof flowJson === 'object') return flowJson;
      if (typeof flowJson === 'string') {
        try {
          return JSON.parse(flowJson);
        } catch {
          return null;
        }
      }
      return null;
    })();
    const flowNodes = Array.isArray(flowObj?.nodes) ? flowObj.nodes : [];
    if (!flowNodes.length || !dbNodes.length) return map;

    const buildKey = (subtype, name) => `${String(subtype || '').trim().toLowerCase()}::${String(name || '').trim().toLowerCase()}`;
    const groupedFlow = new Map();
    flowNodes.forEach((node) => {
      const subtype = node?.data?.nodeType || node?.type || '';
      const name = node?.data?.label || '';
      const key = buildKey(subtype, name);
      if (!groupedFlow.has(key)) groupedFlow.set(key, []);
      groupedFlow.get(key).push(node);
    });

    const groupedDb = new Map();
    [...dbNodes]
      .sort((a, b) => Number(a?.execution_order || 0) - Number(b?.execution_order || 0))
      .forEach((node) => {
        const key = buildKey(node?.node_subtype, node?.node_name);
        if (!groupedDb.has(key)) groupedDb.set(key, []);
        groupedDb.get(key).push(node);
      });

    groupedFlow.forEach((flowList, key) => {
      const dbList = groupedDb.get(key) || [];
      flowList.forEach((flowNode, index) => {
        const dbNode = dbList[index];
        if (!dbNode) return;
        map.set(normalizeId(flowNode?.id), normalizeId(dbNode?.id));
      });
    });

    return map;
  }

  /**
   * Normalize config node reference ids to DB node ids.
   *
   * @param {object} config node config
   * @param {(id: unknown) => string} resolveNodeId resolver
   * @returns {object}
   */
  normalizeNodeReferenceConfig(config, resolveNodeId) {
    const safeConfig = config && typeof config === 'object' ? { ...config } : {};
    const remap = (value) => {
      if (value == null || String(value).trim() === '') return value;
      return resolveNodeId(value);
    };

    safeConfig.saveCustomerNodeId = remap(safeConfig.saveCustomerNodeId);
    safeConfig.recipientNodeId = remap(safeConfig.recipientNodeId);
    safeConfig.ccNodeId = remap(safeConfig.ccNodeId);
    safeConfig.bccNodeId = remap(safeConfig.bccNodeId);
    safeConfig.zaloRecipientNodeId = remap(safeConfig.zaloRecipientNodeId);
    safeConfig.zaloFriendNodeId = remap(safeConfig.zaloFriendNodeId);
    safeConfig.zaloGroupNodeId = remap(safeConfig.zaloGroupNodeId);
    safeConfig.zaloGroupAccountNodeId = remap(safeConfig.zaloGroupAccountNodeId);

    if (Array.isArray(safeConfig.emailSteps)) {
      safeConfig.emailSteps = safeConfig.emailSteps.map((step) => {
        const nextStep = { ...(step || {}) };
        if (Array.isArray(nextStep.templateMappings)) {
          nextStep.templateMappings = nextStep.templateMappings.map((mapping) => {
            const nextMapping = { ...(mapping || {}) };
            if (nextMapping?.nodeId) nextMapping.nodeId = remap(nextMapping.nodeId);
            return nextMapping;
          });
        }
        return nextStep;
      });
    }

    if (Array.isArray(safeConfig.zaloPersonalTemplateSteps)) {
      safeConfig.zaloPersonalTemplateSteps = safeConfig.zaloPersonalTemplateSteps.map((step) => {
        const nextStep = { ...(step || {}) };
        if (Array.isArray(nextStep.templateMappings)) {
          nextStep.templateMappings = nextStep.templateMappings.map((mapping) => {
            const nextMapping = { ...(mapping || {}) };
            if (nextMapping?.nodeId) nextMapping.nodeId = remap(nextMapping.nodeId);
            return nextMapping;
          });
        }
        return nextStep;
      });
    }

    if (Array.isArray(safeConfig.zaloFriendTemplateMappings)) {
      safeConfig.zaloFriendTemplateMappings = safeConfig.zaloFriendTemplateMappings.map((mapping) => {
        const nextMapping = { ...(mapping || {}) };
        if (nextMapping?.nodeId) nextMapping.nodeId = remap(nextMapping.nodeId);
        return nextMapping;
      });
    }

    if (Array.isArray(safeConfig.zaloGroupTemplateSteps)) {
      safeConfig.zaloGroupTemplateSteps = safeConfig.zaloGroupTemplateSteps.map((step) => {
        const nextStep = { ...(step || {}) };
        if (Array.isArray(nextStep.templateMappings)) {
          nextStep.templateMappings = nextStep.templateMappings.map((mapping) => {
            const nextMapping = { ...(mapping || {}) };
            if (nextMapping?.nodeId) nextMapping.nodeId = remap(nextMapping.nodeId);
            return nextMapping;
          });
        }
        return nextStep;
      });
    }

    return safeConfig;
  }

  /**
   * Kiểm tra flow có bật pool đa tài khoản Zalo (node chọn TK hoặc legacy trên node gửi).
   * Dùng để runtime bỏ qua bước lấy danh sách bạn bè khi không cần nguồn đó.
   *
   * @param {object|null|undefined} flowJson
   * @returns {boolean}
   */
  flowJsonHasZaloPersonalMultiAccount(flowJson) {
    const nodes = flowJson?.nodes;
    if (!Array.isArray(nodes)) return false;
    for (const n of nodes) {
      const cfg = n?.data?.config || {};
      const nodeType = String(n?.data?.nodeType || n?.type || '').trim();
      if (nodeType === 'select_zalo_account') {
        if (!cfg.zaloPoolMultiAccountEnabled) continue;
        const ids = Array.isArray(cfg.zaloPoolAccountIds) ? cfg.zaloPoolAccountIds : [];
        const hasIds = ids.map((id) => String(id || '').trim()).filter(Boolean).length > 0;
        if (hasIds) return true;
        continue;
      }
      if (nodeType === 'send_zalo_personal') {
        if (!cfg.zaloPersonalMultiAccountEnabled) continue;
        const ids = Array.isArray(cfg.zaloPersonalAccountIds) ? cfg.zaloPersonalAccountIds : [];
        const hasIds = ids.map((id) => String(id || '').trim()).filter(Boolean).length > 0;
        if (hasIds) return true;
      }
    }
    return false;
  }

  /**
   * @param {object} payload
   * @returns {boolean}
   */
  isCampaignContentUpdateRequest(payload = {}) {
    const editableContentFields = [
      'campaignName',
      'description',
      'campaignType',
      'landingPageUrl',
      'startDate',
      'endDate',
      'timezone',
      'flowJson',
      'nodes',
      'connections',
    ];
    return editableContentFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
  }
}

export default new CampaignFlowService();
