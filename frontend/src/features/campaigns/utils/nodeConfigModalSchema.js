export const getUpstreamNodes = ({ currentNodeId, nodes = [], edges = [] }) => {
  if (!currentNodeId) return [];
  if (!nodes.length || !edges.length) return [];

  const reverseAdj = new Map();
  edges.forEach((edge) => {
    if (!reverseAdj.has(edge.target)) reverseAdj.set(edge.target, []);
    reverseAdj.get(edge.target).push(edge.source);
  });

  const visited = new Set();
  const stack = [currentNodeId];
  while (stack.length) {
    const current = stack.pop();
    const prevs = reverseAdj.get(current) || [];
    prevs.forEach((prevId) => {
      if (!visited.has(prevId)) {
        visited.add(prevId);
        stack.push(prevId);
      }
    });
  }

  return nodes.filter((node) => visited.has(node.id));
};

export const buildRunLogMap = (runLogs = []) =>
  runLogs.reduce((acc, log) => {
    if (log?.nodeId && log?.result?.output) acc[log.nodeId] = log;
    return acc;
  }, {});

export const getSchemaForNodeId = ({ nodeId, runLogMap = {}, nodes = [], buildSchemaFromRows }) => {
  if (!nodeId) return [];

  const log = runLogMap[nodeId] || null;
  const items = Array.isArray(log?.result?.output?.items) ? log.result.output.items : [];
  const schemaFromRun = Array.isArray(log?.result?.output?.schema)
    ? log.result.output.schema
    : buildSchemaFromRows(items);
  if (schemaFromRun && schemaFromRun.length) return schemaFromRun;

  const node = nodes.find((item) => String(item.id) === String(nodeId));
  const nodeType = node?.data?.nodeType || node?.type;

  if (nodeType === 'read_sheet') {
    const columns = Array.isArray(node?.data?.config?.columns) ? node.data.config.columns : [];
    if (columns.length) return columns.map((key) => ({ key, type: 'string' }));
  }

  if (nodeType === 'read_courses_db') {
    return [
      { key: 'id', type: 'number' },
      { key: 'courseCode', type: 'string' },
      { key: 'courseName', type: 'string' },
      { key: 'price', type: 'number' },
      { key: 'originalPrice', type: 'number' },
      { key: 'status', type: 'string' },
      { key: 'description', type: 'string' },
      { key: 'category', type: 'string' },
      { key: 'thumbnailUrl', type: 'string' },
      { key: 'createdAt', type: 'string' },
      { key: 'updatedAt', type: 'string' },
    ];
  }

  if (nodeType === 'read_landing_leads') {
    return [
      { key: 'leadId', type: 'number' },
      { key: 'id', type: 'number' },
      { key: 'fullName', type: 'string' },
      { key: 'lastName', type: 'string' },
      { key: 'firstName', type: 'string' },
      { key: 'email', type: 'string' },
      { key: 'phone', type: 'string' },
      { key: 'occupation', type: 'string' },
      { key: 'interestArea', type: 'string' },
      { key: 'marketingConsent', type: 'boolean' },
      { key: 'createdAt', type: 'string' },
    ];
  }

  if (nodeType === 'read_interested_customers') {
    return [
      { key: 'customerId', type: 'number' },
      { key: 'fullName', type: 'string' },
      { key: 'email', type: 'string' },
      { key: 'phone', type: 'string' },
      { key: 'gender', type: 'string' },
      { key: 'address', type: 'string' },
      { key: 'source', type: 'string' },
      { key: 'zaloId', type: 'string' },
      { key: 'courseId', type: 'number' },
      { key: 'courseName', type: 'string' },
      { key: 'courseCode', type: 'string' },
      { key: 'createdAt', type: 'string' },
    ];
  }

  if (nodeType === 'select_zalo_account') {
    return [
      { key: 'id', type: 'string' },
      { key: 'displayName', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'isActive', type: 'boolean' },
      { key: 'isDefault', type: 'boolean' },
    ];
  }

  if (nodeType === 'get_all_friends') {
    return [
      { key: 'uid', type: 'string' },
      { key: 'zalo_name', type: 'string' },
      { key: 'display_name', type: 'string' },
      { key: 'phoneNumber', type: 'string' },
    ];
  }

  if (nodeType === 'get_all_groups') {
    return [
      { key: 'groupId', type: 'string' },
      { key: 'groupName', type: 'string' },
      { key: 'version', type: 'string' },
    ];
  }

  return [];
};
