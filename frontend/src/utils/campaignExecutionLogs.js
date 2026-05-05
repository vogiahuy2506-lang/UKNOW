/**
 * Normalize DB json payload to object for log rendering.
 *
 * @param {unknown} payload execution payload from API
 * @returns {object|null}
 */
export function parseExecutionPayload(payload) {
  if (payload == null) return null;
  if (typeof payload === 'object') return payload;
  if (typeof payload !== 'string') return null;
  try {
    return JSON.parse(payload);
  } catch {
    return { value: payload };
  }
}

/**
 * Build execution order index from campaign flow (trigger -> downstream).
 *
 * @param {Array<object>} flowNodes campaign flow nodes
 * @param {Array<object>} flowEdges campaign flow edges
 * @returns {Map<string, number>} node id => order index
 */
export function buildFlowOrderIndex(flowNodes = [], flowEdges = []) {
  const nodes = Array.isArray(flowNodes) ? flowNodes : [];
  const edges = Array.isArray(flowEdges) ? flowEdges : [];
  if (!nodes.length || !edges.length) return new Map();

  const normalizeId = (id) => String(id ?? '');
  const nodeMap = new Map(nodes.map((n) => [normalizeId(n.id), n]));
  const adjacency = new Map(nodes.map((n) => [normalizeId(n.id), []]));
  const indegree = new Map(nodes.map((n) => [normalizeId(n.id), 0]));

  edges.forEach((edge) => {
    const sourceId = normalizeId(edge?.source);
    const targetId = normalizeId(edge?.target);
    if (!adjacency.has(sourceId) || !indegree.has(targetId)) return;
    adjacency.get(sourceId).push(targetId);
    indegree.set(targetId, indegree.get(targetId) + 1);
  });

  const triggerNodes = nodes.filter((n) => {
    const type = n?.data?.nodeType || n?.type || '';
    return type.includes('trigger') || type === 'start';
  });
  if (!triggerNodes.length) return new Map();

  const startIds = triggerNodes.map((n) => normalizeId(n.id));
  const reachable = new Set();
  const reachStack = [...startIds];
  while (reachStack.length) {
    const currentId = reachStack.pop();
    if (reachable.has(currentId)) continue;
    reachable.add(currentId);
    const nextIds = adjacency.get(currentId) || [];
    nextIds.forEach((id) => {
      if (!reachable.has(id)) reachStack.push(id);
    });
  }

  const queue = [...startIds];
  const orderIds = [];
  while (queue.length) {
    const currentId = queue.shift();
    orderIds.push(currentId);
    const nextIds = adjacency.get(currentId) || [];
    nextIds.forEach((nextId) => {
      if (!indegree.has(nextId)) return;
      indegree.set(nextId, indegree.get(nextId) - 1);
      if (indegree.get(nextId) === 0) {
        queue.push(nextId);
      }
    });
  }

  const orderMap = new Map();
  orderIds
    .filter((id) => reachable.has(id) && nodeMap.has(id))
    .forEach((id, index) => {
      orderMap.set(id, index);
    });

  return orderMap;
}

/**
 * Lấy payload output chuẩn từ các format execution khác nhau.
 *
 * @param {object|null} payload payload execution gốc
 * @returns {object|null}
 */
const extractPayloadOutput = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const resultOutput = payload?.result?.output;
  return resultOutput && typeof resultOutput === 'object' ? resultOutput : null;
};

/**
 * Chuẩn hóa payload execution về một mặt bằng chung cho UI trang Run.
 *
 * Luồng hoạt động:
 * 1. Ưu tiên dùng payload root như hiện tại để giữ tương thích ngược.
 * 2. Nếu backend trả dữ liệu theo format `result.output`, chuyển về format root.
 * 3. Giữ lại message/meta từ cả 2 nguồn để tránh mất thông tin khi aggregate.
 *
 * @param {object|null} payload payload execution đã parse
 * @returns {object|null}
 */
const normalizeExecutionPayloadForWorkspace = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const outputPayload = extractPayloadOutput(payload);
  if (!outputPayload) return payload;

  const normalized = { ...outputPayload };
  if (!Array.isArray(normalized.items) && Array.isArray(payload.items)) {
    normalized.items = payload.items;
  }
  if (!Array.isArray(normalized.schema) && Array.isArray(payload.schema)) {
    normalized.schema = payload.schema;
  }
  if (!normalized.message && payload.message) {
    normalized.message = payload.message;
  }
  if (!normalized.messageText && payload.messageText) {
    normalized.messageText = payload.messageText;
  }

  const rootMeta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : {};
  const outputMeta = outputPayload?.meta && typeof outputPayload.meta === 'object' ? outputPayload.meta : {};
  const mergedMeta = {
    ...rootMeta,
    ...outputMeta,
  };
  if (Object.keys(mergedMeta).length > 0) {
    normalized.meta = mergedMeta;
  }

  return normalized;
};

const getPayloadScore = (payload) => {
  const normalizedPayload = normalizeExecutionPayloadForWorkspace(payload);
  if (!normalizedPayload || typeof normalizedPayload !== 'object') return 0;
  const itemCount = Array.isArray(normalizedPayload.items) ? normalizedPayload.items.length : 0;
  const schemaCount = Array.isArray(normalizedPayload.schema) ? normalizedPayload.schema.length : 0;
  if (itemCount > 0 || schemaCount > 0) return 3;
  return Object.keys(normalizedPayload).length > 0 ? 2 : 1;
};

const SEND_NODE_SUBTYPES = new Set([
  'send_email',
  'send_zalo_personal',
  'send_zalo_friend_request',
  'send_zalo_group',
]);

const isSendNodeSubtype = (nodeSubtype = '') => SEND_NODE_SUBTYPES.has(String(nodeSubtype || '').trim().toLowerCase());

const normalizeExecutionStatus = (value) => String(value || '').trim().toLowerCase();
/**
 * Chuẩn hóa bộ đếm progress từ log execution về số hợp lệ.
 *
 * @param {unknown} value giá trị progressCurrent/progressTotal từ backend
 * @returns {number|null} số không âm hoặc null nếu không hợp lệ
 */
const parseProgressValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeSendEmailItem = (payload = {}) => {
  const to = payload?.to ?? payload?.recipient ?? '';
  const normalizedStatus = normalizeExecutionStatus(payload?.status);
  const hasBounceSignal = Boolean(payload?.bounced) || payload?.bounceType != null;
  const status = normalizedStatus || (payload?.error ? 'failed' : hasBounceSignal ? 'bounced' : 'success');
  const item = {
    to,
    status,
  };
  if (payload?.messageId != null) item.messageId = payload.messageId;
  if (payload?.from != null) item.from = payload.from;
  if (payload?.sentAt != null) item.sentAt = payload.sentAt;
  if (payload?.tracking != null) item.tracking = payload.tracking;
  if (payload?.subject != null) item.subject = payload.subject;
  if (payload?.variables != null) item.variables = payload.variables;
  if (payload?.error != null) item.error = payload.error;
  return item;
};

const normalizeSendNodeItem = (nodeSubtype, payload = {}) => {
  if (String(nodeSubtype || '').trim().toLowerCase() === 'send_email') {
    return normalizeSendEmailItem(payload);
  }
  // Bỏ messageText khỏi từng dòng: backend nhắc tiến độ ("Đã gửi 1/N") vào item để log; cột này trùng thông tin và làm bảng rối.
  const { messageText: _omitProgressMessageText, ...payloadRest } =
    payload && typeof payload === 'object' ? payload : {};
  const senderName = payloadRest?.senderName
    ?? payloadRest?.accountName
    ?? payloadRest?.fromName
    ?? null;
  const zaloName = payloadRest?.zaloName
    ?? payloadRest?.recipientName
    ?? payloadRest?.displayName
    ?? payloadRest?.name
    ?? null;
  const groupName = payloadRest?.groupName
    ?? payloadRest?.group_name
    ?? null;
  const sentAt = payloadRest?.sentAt
    ?? payloadRest?.sent_at
    ?? payloadRest?.createdAt
    ?? payloadRest?.created_at
    ?? null;
  return {
    ...payloadRest,
    senderName,
    zaloName,
    groupName,
    sentAt,
    status: payloadRest?.status || (payloadRest?.error ? 'failed' : 'success'),
  };
};

/**
 * Chuẩn hóa trạng thái hiển thị cho node gửi email theo kết quả từng item.
 *
 * Luồng hoạt động:
 * 1. Chỉ áp dụng cho node `send_email` để tránh ảnh hưởng node khác.
 * 2. Nếu có item bounce nhưng không có lỗi gửi thật sự (`failed`) thì trả về `warning`.
 * 3. Các trường hợp còn lại giữ nguyên trạng thái tổng hợp hiện tại.
 *
 * @param {object} group nhóm log đã được tổng hợp theo node
 * @returns {string} trạng thái dùng để hiển thị trong UI workspace
 */
const resolveNodeDisplayStatus = (group = {}) => {
  const currentStatus = normalizeExecutionStatus(group?.status) || 'info';
  const normalizedNodeSubtype = String(group?.nodeSubtype || '').trim().toLowerCase();
  if (normalizedNodeSubtype !== 'send_email') return currentStatus;

  const items = Array.isArray(group?.aggregatedItems) ? group.aggregatedItems : [];
  if (!items.length) return currentStatus;

  const itemStatuses = new Set(
    items
      .map((item) => normalizeExecutionStatus(item?.status))
      .filter(Boolean)
  );
  const hasFailedItem = itemStatuses.has('failed') || itemStatuses.has('error');
  const hasBouncedItem = itemStatuses.has('bounced') || itemStatuses.has('bounce');

  if (hasBouncedItem && !hasFailedItem) {
    return 'warning';
  }

  return currentStatus;
};

const extractExecutionMessage = (log, parsedPayload, fallback = '-') => (
  log?.executionData?.message
  || log?.executionData?.result?.output?.message
  || log?.executionData?.messageText
  || log?.executionData?.result?.output?.messageText
  || parsedPayload?.message
  || parsedPayload?.messageText
  || log?.errorMessage
  || fallback
);

const stringifyComparableItem = (item) => {
  if (item == null) return '';
  if (typeof item !== 'object') return String(item);
  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
};

/**
 * Merge aggregated items with incoming node items.
 *
 * Supports 2 backend progress formats:
 * - delta list: each log returns only new items => append
 * - snapshot list: each log returns full accumulated items => replace
 *
 * @param {Array<any>} aggregated existing aggregated items
 * @param {Array<any>} incoming incoming items from one execution log
 * @returns {Array<any>}
 */
const mergeAggregatedItems = (aggregated = [], incoming = []) => {
  if (!Array.isArray(incoming) || incoming.length === 0) return aggregated;
  if (!Array.isArray(aggregated) || aggregated.length === 0) return [...incoming];

  // Snapshot mode: incoming already contains old items as prefix -> replace to avoid duplicate rows.
  if (incoming.length >= aggregated.length) {
    const isAggregatedPrefixOfIncoming = aggregated.every(
      (item, index) => stringifyComparableItem(item) === stringifyComparableItem(incoming[index])
    );
    if (isAggregatedPrefixOfIncoming) {
      return [...incoming];
    }
  }

  // Out-of-order protection: ignore older/truncated snapshot.
  if (incoming.length < aggregated.length) {
    const isIncomingPrefixOfAggregated = incoming.every(
      (item, index) => stringifyComparableItem(item) === stringifyComparableItem(aggregated[index])
    );
    if (isIncomingPrefixOfAggregated) {
      return aggregated;
    }
  }

  // Delta mode: append new chunk.
  return [...aggregated, ...incoming];
};

/**
 * Tính thống kê gửi cho các node gửi (email/zalo) từ danh sách item đã tổng hợp.
 *
 * Luồng hoạt động:
 * 1. Chuẩn hóa trạng thái từng item về lowercase để đếm nhất quán giữa nhiều nguồn log.
 * 2. Xem `failed/error` là lỗi gửi; các trạng thái còn lại được tính là đã gửi thành công.
 * 3. Trả về bộ đếm dùng cho UI hiển thị nhanh ở phần log node.
 *
 * @param {Array<object>} items danh sách item output của node gửi
 * @returns {{sentCount: number, failedCount: number}} bộ đếm gửi thành công và gửi lỗi
 */
const buildSendNodeMetaStats = (items = []) => {
  const sourceItems = Array.isArray(items) ? items : [];
  const failedCount = sourceItems.reduce((count, item) => {
    const status = normalizeExecutionStatus(item?.status);
    return status === 'failed' || status === 'error' ? count + 1 : count;
  }, 0);

  return {
    sentCount: Math.max(0, sourceItems.length - failedCount),
    failedCount,
  };
};

/** Đồng bộ với campaignBuilderRuntime: không hiển thị cột tiến độ messageText trong bảng kết quả. */
const KEYS_OMIT_FROM_EXECUTION_SCHEMA = new Set(['messageText']);

/**
 * Build schema rows from tabular items.
 *
 * @param {Array<object>} rows input rows
 * @returns {Array<{key: string, type: string}>}
 */
const buildSchemaFromRows = (rows = []) => {
  const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!first || typeof first !== 'object') return [];
  return Object.keys(first)
    .filter((key) => !KEYS_OMIT_FROM_EXECUTION_SCHEMA.has(key))
    .map((key) => ({
      key,
      type: Array.isArray(first[key]) ? 'array' : typeof first[key],
    }));
};

/**
 * Convert execution rows into node-level logs for shared workspace UI.
 *
 * @param {Array<object>} executionLogs raw logs from API
 * @param {{ flowOrderByNodeId?: Map<string, number> }} options build options
 * @returns {Array<object>}
 */
export function buildWorkspaceLogsFromExecution(executionLogs = [], options = {}) {
  const sourceLogs = Array.isArray(executionLogs) ? executionLogs : [];
  if (!sourceLogs.length) return [];
  const flowOrderByNodeId = options?.flowOrderByNodeId instanceof Map ? options.flowOrderByNodeId : new Map();

  const sortedByTime = [...sourceLogs].sort((a, b) => {
    const timeA = new Date(a?.createdAt || 0).getTime();
    const timeB = new Date(b?.createdAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });

  const grouped = new Map();
  sortedByTime.forEach((log) => {
    const nodeId = log?.nodeId != null ? String(log.nodeId) : null;
    const nodeKey = nodeId || `${log?.nodeOrder ?? 'na'}:${log?.nodeName || log?.nodeSubtype || log?.actionType || 'node'}`;
    const groupKey = String(nodeKey);
    const parsedRawPayload = parseExecutionPayload(log?.nodeResultJson ?? log?.executionData ?? null);
    const parsedPayload = normalizeExecutionPayloadForWorkspace(parsedRawPayload);
    const nodeSubtype = String(log?.nodeSubtype || log?.actionType || '');
    const normalizedNodeSubtype = nodeSubtype.trim().toLowerCase();
    const createdAt = log?.createdAt ? new Date(log.createdAt) : new Date();

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        id: `node-${groupKey}`,
        nodeId,
        nodeOrder: log?.nodeOrder ?? null,
        flowOrder: nodeId && flowOrderByNodeId.has(nodeId) ? flowOrderByNodeId.get(nodeId) : null,
        nodeName: log?.nodeName || log?.nodeSubtype || log?.actionType || 'Node',
        nodeSubtype,
        timestamp: createdAt,
        latestAt: createdAt,
        status: log?.status || 'info',
        message: extractExecutionMessage(log, parsedPayload),
        aggregatedItems: [],
        aggregatedSchema: [],
        latestPayload: null,
        latestPayloadScore: -1,
        latestProgressCurrent: null,
        latestProgressTotal: null,
      });
    }

    const group = grouped.get(groupKey);
    group.latestAt = createdAt;
    group.message = extractExecutionMessage(log, parsedPayload, group.message);
    if (group.status !== 'failed') {
      group.status = log?.status || group.status;
    }
    if (log?.status === 'failed') {
      group.status = 'failed';
    }
    const progressCurrent = parseProgressValue(log?.progressCurrent);
    const progressTotal = parseProgressValue(log?.progressTotal);
    if (progressCurrent != null) group.latestProgressCurrent = progressCurrent;
    if (progressTotal != null) group.latestProgressTotal = progressTotal;

    if (parsedPayload && typeof parsedPayload === 'object') {
      if (Array.isArray(parsedPayload.items)) {
        const nextItems =
          isSendNodeSubtype(normalizedNodeSubtype)
            ? parsedPayload.items.map((item) => normalizeSendNodeItem(normalizedNodeSubtype, item))
            : parsedPayload.items;
        group.aggregatedItems = mergeAggregatedItems(group.aggregatedItems, nextItems);
        if (Array.isArray(parsedPayload.schema) && parsedPayload.schema.length > 0) {
          const schemaSansMessageText = parsedPayload.schema.filter(
            (col) => col && String(col.key) !== 'messageText'
          );
          group.aggregatedSchema = schemaSansMessageText;
        }
      } else if (isSendNodeSubtype(normalizedNodeSubtype)) {
        group.aggregatedItems = mergeAggregatedItems(group.aggregatedItems, [
          normalizeSendNodeItem(normalizedNodeSubtype, parsedPayload),
        ]);
      }

      const payloadScore = getPayloadScore(parsedPayload);
      if (payloadScore >= group.latestPayloadScore) {
        group.latestPayload = parsedPayload;
        group.latestPayloadScore = payloadScore;
      }
    }
  });

  return Array.from(grouped.values())
    .sort((a, b) => {
      const flowA = Number.isFinite(Number(a.flowOrder)) ? Number(a.flowOrder) : Number.MAX_SAFE_INTEGER;
      const flowB = Number.isFinite(Number(b.flowOrder)) ? Number(b.flowOrder) : Number.MAX_SAFE_INTEGER;
      if (flowA !== flowB) return flowA - flowB;

      const orderA = Number.isFinite(Number(a.nodeOrder)) ? Number(a.nodeOrder) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b.nodeOrder)) ? Number(b.nodeOrder) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;

      return a.timestamp.getTime() - b.timestamp.getTime();
    })
    .map((group) => {
      let displayMessage = group.message;
      // Ở trang Run, node gửi chỉ cần hiển thị message ngắn gọn để tránh rối UI.
      if (isSendNodeSubtype(group.nodeSubtype)) {
        displayMessage = 'Đã gửi';
      }
      const output =
        group.aggregatedItems.length > 0
          ? {
              ...(group.latestPayload || {}),
              items: group.aggregatedItems,
              schema:
                group.aggregatedSchema.length > 0
                  ? group.aggregatedSchema
                  : buildSchemaFromRows(group.aggregatedItems),
              meta: {
                ...(group.latestPayload?.meta || {}),
                totalItems: group.aggregatedItems.length,
                ...(isSendNodeSubtype(group.nodeSubtype)
                  ? buildSendNodeMetaStats(group.aggregatedItems)
                  : {}),
              },
            }
          : group.latestPayload || {};

      return {
        id: group.id,
        status: resolveNodeDisplayStatus(group),
        nodeName: group.nodeName,
        message: displayMessage,
        timestamp: group.latestAt,
        result: {
          input: null,
          output,
        },
      };
    });
}
