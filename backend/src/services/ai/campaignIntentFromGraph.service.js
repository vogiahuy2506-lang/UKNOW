/**
 * Campaign Intent From Graph Service (Backtest - Việc 1)
 *
 * Nhiệm vụ: Rút ngược CampaignIntentV1 từ đồ thị (nodes, connections) đã lưu trong DB.
 * Hàm thuần túy, không I/O, phục vụ kiểm điểm bất động (Backtest) và đối chiếu.
 */

const KNOWN_TRIGGER_SUBTYPES = new Set(['manual', 'manual_trigger']);
const KNOWN_AUDIENCE_SUBTYPES = new Set([
  'read_sheet',
  'interested_customers',
  'read_landing_leads',
  'get_all_friends',
  'get_all_groups',
]);
const KNOWN_SEND_SUBTYPES = new Set([
  'send_email',
  'send_zalo_personal',
  'send_zalo_group',
]);
const KNOWN_SUPPORTED_SUBTYPES = new Set([
  ...KNOWN_TRIGGER_SUBTYPES,
  ...KNOWN_AUDIENCE_SUBTYPES,
  ...KNOWN_SEND_SUBTYPES,
  'select_zalo_account',
  'end',
]);

/**
 * Trích xuất subtype chuẩn của node (hỗ trợ cả snake_case từ DB và camelCase).
 * @param {object} node
 * @returns {string}
 */
function getNodeSubtype(node) {
  return String(node?.node_subtype || node?.nodeSubtype || node?.subtype || '').trim();
}

/**
 * Rút CampaignIntentV1 từ graph đã lưu.
 *
 * @param {Array<object>} nodes
 * @param {Array<object>} connections
 * @returns {{ intent: object|null, confidence: number, unsupported: string[] }}
 */
export function deriveIntentFromGraph(nodes = [], connections = []) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const unsupported = [];

  if (nodeList.length === 0) {
    return {
      intent: null,
      confidence: 0,
      unsupported: ['empty_graph'],
    };
  }

  // 1. Kiểm tra các node không thuộc danh mục hỗ trợ
  for (const node of nodeList) {
    const subtype = getNodeSubtype(node);
    if (!subtype) {
      unsupported.push('unknown_node_subtype');
    } else if (!KNOWN_SUPPORTED_SUBTYPES.has(subtype)) {
      unsupported.push(subtype);
    }
  }

  // 2. Tìm Send / Action Node để xác định channel & schedule
  const sendNodes = nodeList.filter((n) => KNOWN_SEND_SUBTYPES.has(getNodeSubtype(n)));
  if (sendNodes.length === 0) {
    unsupported.push('no_send_node');
  } else if (sendNodes.length > 1) {
    unsupported.push('multiple_send_nodes');
  }

  if (unsupported.length > 0) {
    return {
      intent: null,
      confidence: 0,
      unsupported: [...new Set(unsupported)],
    };
  }

  const sendNode = sendNodes[0];
  const sendSubtype = getNodeSubtype(sendNode);
  const cfg = sendNode.config || sendNode.settings || {};

  let channel = null;
  let sender = null;
  let schedule = null;

  // 3. Xử lý theo từng loại Send Node
  if (sendSubtype === 'send_email') {
    channel = 'email';
    const fromEmailId = cfg.fromEmailId != null ? Number(cfg.fromEmailId) : null;
    if (fromEmailId != null && Number.isInteger(fromEmailId)) {
      sender = { type: 'email_account', id: fromEmailId };
    }

    const emailSteps = Array.isArray(cfg.emailSteps) ? cfg.emailSteps : [];
    const isDrip = emailSteps.length > 1 || emailSteps.some((s) => Number(s.delayValue || 0) > 0);
    if (isDrip) {
      schedule = {
        type: 'drip',
        days: Math.max(1, emailSteps.length),
        slotsPerDay: 1,
      };
    } else {
      schedule = { type: 'once' };
    }
  } else if (sendSubtype === 'send_zalo_personal') {
    channel = 'zalo';
    // Tìm sender account từ select_zalo_account node hoặc trực tiếp từ config
    const selectNode = nodeList.find((n) => getNodeSubtype(n) === 'select_zalo_account');
    const selectCfg = selectNode?.config || selectNode?.settings || {};
    const zaloAccountId = selectCfg.zaloAccountId != null
      ? Number(selectCfg.zaloAccountId)
      : (cfg.zaloAccountId != null ? Number(cfg.zaloAccountId) : null);

    if (zaloAccountId != null && Number.isInteger(zaloAccountId)) {
      sender = { type: 'zalo_account', id: zaloAccountId };
    }

    const steps = Array.isArray(cfg.zaloPersonalTemplateSteps) ? cfg.zaloPersonalTemplateSteps : [];
    const isDrip = cfg.zaloPersonalSendMode === 'schedule' || steps.length > 1;
    if (isDrip) {
      schedule = {
        type: 'drip',
        days: Math.max(1, steps.length),
        slotsPerDay: 1,
      };
    } else {
      schedule = { type: 'once' };
    }
  } else if (sendSubtype === 'send_zalo_group') {
    channel = 'zalo_group';
    const selectNode = nodeList.find((n) => getNodeSubtype(n) === 'select_zalo_account');
    const selectCfg = selectNode?.config || selectNode?.settings || {};
    const zaloAccountId = selectCfg.zaloAccountId != null
      ? Number(selectCfg.zaloAccountId)
      : (cfg.zaloAccountId != null ? Number(cfg.zaloAccountId) : null);

    if (zaloAccountId != null && Number.isInteger(zaloAccountId)) {
      sender = { type: 'zalo_account', id: zaloAccountId };
    }

    const steps = Array.isArray(cfg.zaloGroupTemplateSteps) ? cfg.zaloGroupTemplateSteps : [];
    const isDrip = steps.length > 1;
    if (isDrip) {
      schedule = {
        type: 'drip',
        days: Math.max(1, steps.length),
        slotsPerDay: 1,
      };
    } else {
      schedule = { type: 'once' };
    }
  }

  // 4. Tìm Audience Node
  let audience = null;
  const audienceNode = nodeList.find((n) => KNOWN_AUDIENCE_SUBTYPES.has(getNodeSubtype(n)));
  const recipientKind = channel === 'email' ? 'email' : 'phone';

  if (audienceNode) {
    const audSubtype = getNodeSubtype(audienceNode);
    const audCfg = audienceNode.config || audienceNode.settings || {};

    if (audSubtype === 'read_sheet') {
      audience = {
        type: 'sheet',
        url: audCfg.sheetUrl || '',
        recipientKind,
      };
    } else if (audSubtype === 'interested_customers') {
      audience = {
        type: 'db',
        recipientKind,
      };
    } else if (audSubtype === 'read_landing_leads') {
      audience = {
        type: 'landing',
        slugs: Array.isArray(audCfg.landingPageSlugs) ? audCfg.landingPageSlugs : [],
        recipientKind,
      };
    } else if (audSubtype === 'get_all_friends') {
      audience = {
        type: 'zalo_contacts',
        recipientKind: 'phone',
      };
    } else if (audSubtype === 'get_all_groups') {
      audience = {
        type: 'zalo_contacts',
        groupIds: Array.isArray(audCfg.groupIds) ? audCfg.groupIds : [],
        recipientKind: 'phone',
      };
    }
  } else {
    // Nếu không có audience node nhưng recipientSource là manual
    const recipientSource = cfg.recipientSource || cfg.zaloRecipientSource || cfg.zaloGroupSource;
    if (recipientSource === 'manual') {
      audience = {
        type: 'manual',
        recipientKind,
      };
    }
  }

  const intent = {
    version: 1,
    ...(channel ? { channel } : {}),
    ...(sender ? { sender } : {}),
    ...(audience ? { audience } : {}),
    ...(schedule ? { schedule } : {}),
  };

  return {
    intent,
    confidence: 1.0,
    unsupported: [],
  };
}

export default {
  deriveIntentFromGraph,
};
