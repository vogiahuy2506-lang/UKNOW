import { LANDING_LEADS_MAX_RECORDS } from '../constants/landingLeadsNodeLimits.js';

/**
 * Build execution order from flow graph with trigger-rooted traversal.
 * Only nodes reachable from trigger/start nodes are returned.
 *
 * @param {Array<object>} nodeList campaign nodes
 * @param {Array<object>} edgeList campaign edges
 * @returns {Array<object>} ordered executable nodes
 */
export const buildExecutionOrder = (nodeList, edgeList) => {
  const normalizeId = (id) => String(id ?? '');
  const nodeMap = new Map(nodeList.map((n) => [normalizeId(n.id), n]));
  const indegree = new Map(nodeList.map((n) => [normalizeId(n.id), 0]));
  const adjacency = new Map(nodeList.map((n) => [normalizeId(n.id), []]));

  edgeList.forEach((e) => {
    const sourceId = normalizeId(e.source);
    const targetId = normalizeId(e.target);
    if (indegree.has(targetId)) {
      indegree.set(targetId, indegree.get(targetId) + 1);
    }
    if (adjacency.has(sourceId)) {
      adjacency.get(sourceId).push(targetId);
    }
  });

  const triggerNodes = nodeList.filter((n) => {
    const t = n.data?.nodeType || n.type;
    return t && (t.includes('trigger') || t === 'start');
  });

  if (triggerNodes.length === 0) {
    return [];
  }

  const startNodes = triggerNodes;
  const queue = [...startNodes.map((n) => normalizeId(n.id))];
  const orderIds = [];

  while (queue.length) {
    const currentId = queue.shift();
    orderIds.push(currentId);

    const nexts = adjacency.get(currentId) || [];
    nexts.forEach((nextId) => {
      if (!indegree.has(nextId)) return;
      indegree.set(nextId, indegree.get(nextId) - 1);
      if (indegree.get(nextId) === 0) {
        queue.push(nextId);
      }
    });
  }

  const reachable = new Set();
  const stack = [...startNodes.map((n) => normalizeId(n.id))];
  while (stack.length) {
    const currentId = stack.pop();
    if (reachable.has(currentId)) continue;
    reachable.add(currentId);
    const nexts = adjacency.get(currentId) || [];
    nexts.forEach((id) => {
      if (!reachable.has(id)) stack.push(id);
    });
  }

  return orderIds
    .filter((id) => reachable.has(id))
    .map((id) => nodeMap.get(id))
    .filter(Boolean);
};

/**
 * Validate node configuration before preview execution.
 *
 * @param {object} node current node in execution order
 * @returns {{status: 'success'|'failed', message: string}}
 */
export const validateNodeForRun = (node) => {
  const nodeType = node.data?.nodeType || node.type;
  const config = node.data?.config || {};
  const requireSourceNodeAndField = (source, nodeId, field, fieldLabel = 'cột dữ liệu') => {
    if (source !== 'node') return null;
    if (!String(nodeId || '').trim()) return 'Chưa chọn node dữ liệu';
    if (!String(field || '').trim()) return `Chưa chọn ${fieldLabel}`;
    return null;
  };

  if (nodeType === 'send_email' && !config.fromEmailId) {
    return { status: 'failed', message: 'Chưa chọn email gửi (SMTP)' };
  }

  if (nodeType === 'send_email' && config.recipientSource === 'manual' && !String(config.recipientEmails || '').trim()) {
    return { status: 'failed', message: 'Thiếu danh sách email người nhận' };
  }

  if (nodeType === 'send_email' && config.recipientSource === 'node') {
    if (!String(config.recipientNodeId || '').trim()) {
      return { status: 'failed', message: 'Chưa chọn node dữ liệu' };
    }
    if (!String(config.recipientField || '').trim()) {
      return { status: 'failed', message: 'Chưa chọn cột email' };
    }
  }

  if (nodeType === 'send_email') {
    const rawSteps = Array.isArray(config.emailSteps) ? config.emailSteps : [];
    const steps = rawSteps.length === 0 && config.emailTemplateId
      ? [{ templateId: config.emailTemplateId }]
      : rawSteps;
    if (!steps.length) {
      return { status: 'failed', message: 'Chưa chọn template email' };
    }
    const missingTpl = steps.find((s) => !String(s.templateId || '').trim());
    if (missingTpl) {
      return { status: 'failed', message: 'Thiếu template cho một email' };
    }
    if (config.sendMode === 'schedule') {
      const invalidDelay = steps.find((s) => (parseInt(s.delayValue || 0, 10) || 0) < 0);
      if (invalidDelay) {
        return { status: 'failed', message: 'Thời gian gửi không hợp lệ' };
      }
      const invalidFrom = steps.find((s) => s.delayFrom && !['start', 'prev'].includes(s.delayFrom));
      if (invalidFrom) {
        return { status: 'failed', message: 'Mốc thời gian gửi không hợp lệ' };
      }
    }
  }

  if (nodeType === 'send_email' && config.ccEnabled) {
    if (config.ccSource === 'manual' && !String(config.ccEmails || '').trim()) {
      return { status: 'failed', message: 'Thiếu danh sách email CC' };
    }
    if (config.ccSource === 'node') {
      if (!String(config.ccNodeId || '').trim()) {
        return { status: 'failed', message: 'Chưa chọn node dữ liệu (CC)' };
      }
      if (!String(config.ccField || '').trim()) {
        return { status: 'failed', message: 'Chưa chọn cột email (CC)' };
      }
    }
  }

  if (nodeType === 'send_email' && config.bccEnabled) {
    if (config.bccSource === 'manual' && !String(config.bccEmails || '').trim()) {
      return { status: 'failed', message: 'Thiếu danh sách email BCC' };
    }
    if (config.bccSource === 'node') {
      if (!String(config.bccNodeId || '').trim()) {
        return { status: 'failed', message: 'Chưa chọn node dữ liệu (BCC)' };
      }
      if (!String(config.bccField || '').trim()) {
        return { status: 'failed', message: 'Chưa chọn cột email (BCC)' };
      }
    }
  }

  if (nodeType === 'read_sheet' && !config.sheetUrl) {
    return { status: 'failed', message: 'Thiếu URL sheet' };
  }

  if (nodeType === 'read_interested_customers') {
    const limit = parseInt(config.interestedLimit, 10);
    if (Number.isFinite(limit) && limit < 1) {
      return { status: 'failed', message: 'Số bản ghi tối đa không hợp lệ' };
    }
  }

  if (nodeType === 'read_courses_db') {
    const limit = parseInt(config.coursesDbLimit, 10);
    if (Number.isFinite(limit) && limit < 1) {
      return { status: 'failed', message: 'Số bản ghi tối đa không hợp lệ' };
    }
    const selectedIds = Array.isArray(config.coursesDbSelectedIds) ? config.coursesDbSelectedIds : [];
    if (selectedIds.length === 0) {
      return { status: 'failed', message: 'Chưa chọn khóa học' };
    }
  }

  if (nodeType === 'read_landing_leads') {
    const limit = parseInt(config.landingLeadsLimit, 10);
    if (Number.isFinite(limit) && limit < 1) {
      return { status: 'failed', message: 'Số bản ghi tối đa không hợp lệ' };
    }
    if (Number.isFinite(limit) && limit > LANDING_LEADS_MAX_RECORDS) {
      return {
        status: 'failed',
        message: `Số bản ghi tối đa không được vượt quá ${LANDING_LEADS_MAX_RECORDS.toLocaleString('vi-VN')}`,
      };
    }
    if (config.landingLeadsUseDateRange) {
      const from = String(config.landingLeadsDateFrom || '').trim();
      const to = String(config.landingLeadsDateTo || '').trim();
      if (!from || !to) {
        return { status: 'failed', message: 'Chọn đủ «Từ ngày» và «Đến ngày» khi bật lọc theo ngày' };
      }
      if (from > to) {
        return { status: 'failed', message: '«Từ ngày» phải trước hoặc bằng «Đến ngày»' };
      }
    }
  }

  if (nodeType === 'save_customer') {
    const fieldMap = config.saveCustomerFieldMap || {};
    const hasSourceNode = Object.values(fieldMap).some(
      (m) => m?.mode === 'node' && String(m?.nodeId || config.saveCustomerNodeId || '').trim()
    );
    if (!hasSourceNode) {
      return { status: 'failed', message: 'Chưa chọn node dữ liệu cho các trường cần map' };
    }
    const hasContact = ['email', 'phone', 'zaloId'].some((key) => {
      const m = fieldMap[key] || {};
      if (m.mode === 'manual') return String(m.value || '').trim();
      if (m.mode === 'node') return String(m.field || '').trim();
      return '';
    });
    if (!hasContact) {
      return { status: 'failed', message: 'Cần map ít nhất 1 trường liên hệ (email/điện thoại/zalo)' };
    }
  }

  if (nodeType === 'select_zalo_account') {
    const poolOn = Boolean(config.zaloPoolMultiAccountEnabled);
    const poolIds = Array.isArray(config.zaloPoolAccountIds)
      ? config.zaloPoolAccountIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (poolOn) {
      if (poolIds.length === 0) {
        return { status: 'failed', message: 'Chế độ pool: cần chọn ít nhất một tài khoản Zalo' };
      }
    } else if (!String(config.zaloAccountId || '').trim()) {
      return { status: 'failed', message: 'Chưa chọn tài khoản Zalo' };
    }
  }

  if (nodeType === 'get_all_friends') {
    const count = parseInt(config.zaloFriendsCount, 10);
    const page = parseInt(config.zaloFriendsPage, 10);
    if (Number.isFinite(count) && count < 1) {
      return { status: 'failed', message: 'Số lượng bạn bè mỗi trang không hợp lệ' };
    }
    if (Number.isFinite(page) && page < 1) {
      return { status: 'failed', message: 'Số trang bạn bè không hợp lệ' };
    }
  }

  if (nodeType === 'send_zalo_personal') {
    const recipientType = String(config.zaloRecipientType || 'phone').trim() === 'uid'
      ? 'uid'
      : 'phone';
    const steps = Array.isArray(config.zaloPersonalTemplateSteps) ? config.zaloPersonalTemplateSteps : [];
    const hasTemplateSteps = steps.length > 0;
    if (!hasTemplateSteps && !String(config.zaloMessage || '').trim()) {
      return { status: 'failed', message: 'Thiếu nội dung tin nhắn Zalo hoặc template gửi' };
    }
    if (hasTemplateSteps) {
      const missingTpl = steps.find((s) => !String(s.templateId || '').trim());
      if (missingTpl) {
        return { status: 'failed', message: 'Thiếu template cho một bước gửi Zalo cá nhân' };
      }
      const missingMappingNode = steps.find((step) => {
        const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
        return mappings.some((mapping) => {
          const sourceType = String(mapping?.sourceType || 'manual').trim();
          if (sourceType !== 'node') return false;
          return !String(mapping?.nodeId || config.zaloRecipientNodeId || '').trim();
        });
      });
      if (missingMappingNode) {
        return { status: 'failed', message: 'Có biến template Zalo cá nhân chưa chọn node nguồn' };
      }
      const missingMappingField = steps.find((step) => {
        const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
        return mappings.some((mapping) => {
          const sourceType = String(mapping?.sourceType || 'manual').trim();
          if (sourceType !== 'node') return false;
          return !String(mapping?.field || '').trim();
        });
      });
      if (missingMappingField) {
        return { status: 'failed', message: 'Có biến template Zalo cá nhân chưa chọn cột dữ liệu' };
      }
      if (String(config.zaloPersonalSendMode || 'all').trim() === 'schedule') {
        const invalidDelay = steps.find((s) => (parseInt(s.delayValue || 0, 10) || 0) < 0);
        if (invalidDelay) {
          return { status: 'failed', message: 'Thời gian gửi Zalo cá nhân không hợp lệ' };
        }
        const invalidFrom = steps.find((s) => s.delayFrom && !['start', 'prev'].includes(s.delayFrom));
        if (invalidFrom) {
          return { status: 'failed', message: 'Mốc thời gian gửi Zalo cá nhân không hợp lệ' };
        }
      }
    }
    if (config.zaloRecipientSource === 'manual' && !String(config.zaloRecipientPhones || '').trim()) {
      return {
        status: 'failed',
        message: recipientType === 'uid'
          ? 'Thiếu danh sách UID người nhận'
          : 'Thiếu danh sách số điện thoại nhận tin',
      };
    }
    const sourceError = requireSourceNodeAndField(
      config.zaloRecipientSource,
      config.zaloRecipientNodeId,
      config.zaloRecipientField,
      recipientType === 'uid' ? 'cột UID' : 'cột số điện thoại'
    );
    if (sourceError) return { status: 'failed', message: sourceError };
  }

  if (nodeType === 'send_zalo_friend_request') {
    const contentMode = config.zaloFriendContentMode || 'manual';
    if (contentMode === 'manual' && !String(config.zaloFriendRequestMessage || '').trim()) {
      return { status: 'failed', message: 'Thiếu lời nhắn mời kết bạn' };
    }
    if (contentMode === 'template') {
      if (!String(config.zaloFriendTemplateId || '').trim()) {
        return { status: 'failed', message: 'Chưa chọn template lời mời kết bạn' };
      }
      const mappings = Array.isArray(config.zaloFriendTemplateMappings)
        ? config.zaloFriendTemplateMappings
        : [];
      const missingMappingNode = mappings.find((mapping) => {
        const sourceType = String(mapping?.sourceType || 'manual').trim();
        if (sourceType !== 'node') return false;
        return !String(mapping?.nodeId || config.zaloFriendNodeId || '').trim();
      });
      if (missingMappingNode) {
        return { status: 'failed', message: `Biến ${missingMappingNode.key || ''} chưa chọn node nguồn` };
      }
      const missingMappingField = mappings.find((mapping) => {
        const sourceType = String(mapping?.sourceType || 'manual').trim();
        if (sourceType !== 'node') return false;
        return !String(mapping?.field || '').trim();
      });
      if (missingMappingField) {
        return { status: 'failed', message: `Biến ${missingMappingField.key || ''} chưa chọn cột dữ liệu` };
      }
    }
    if (config.zaloFriendSource === 'manual' && !String(config.zaloFriendPhones || '').trim()) {
      return { status: 'failed', message: 'Thiếu danh sách số điện thoại mời kết bạn' };
    }
    const sourceError = requireSourceNodeAndField(
      config.zaloFriendSource,
      config.zaloFriendNodeId,
      config.zaloFriendField,
      'cột số điện thoại'
    );
    if (sourceError) return { status: 'failed', message: sourceError };
  }

  if (nodeType === 'send_zalo_group') {
    const steps = Array.isArray(config.zaloGroupTemplateSteps) ? config.zaloGroupTemplateSteps : [];
    const hasTemplateSteps = steps.length > 0;
    if (!hasTemplateSteps && !String(config.zaloGroupMessage || '').trim()) {
      return { status: 'failed', message: 'Thiếu nội dung tin nhắn nhóm Zalo hoặc template gửi' };
    }
    if (hasTemplateSteps) {
      const missingTpl = steps.find((s) => !String(s.templateId || '').trim());
      if (missingTpl) {
        return { status: 'failed', message: 'Thiếu template cho một bước gửi Zalo nhóm' };
      }
      const missingMappingNode = steps.find((step) => {
        const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
        return mappings.some((mapping) => {
          const sourceType = String(mapping?.sourceType || 'manual').trim();
          if (sourceType !== 'node') return false;
          return !String(mapping?.nodeId || config.zaloGroupNodeId || '').trim();
        });
      });
      if (missingMappingNode) {
        return { status: 'failed', message: 'Có biến template Zalo nhóm chưa chọn node nguồn' };
      }
      const missingMappingField = steps.find((step) => {
        const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
        return mappings.some((mapping) => {
          const sourceType = String(mapping?.sourceType || 'manual').trim();
          if (sourceType !== 'node') return false;
          return !String(mapping?.field || '').trim();
        });
      });
      if (missingMappingField) {
        return { status: 'failed', message: 'Có biến template Zalo nhóm chưa chọn cột dữ liệu' };
      }
      if (String(config.zaloGroupSendMode || 'all').trim() === 'schedule') {
        const invalidDelay = steps.find((s) => (parseInt(s.delayValue || 0, 10) || 0) < 0);
        if (invalidDelay) {
          return { status: 'failed', message: 'Thời gian gửi Zalo nhóm không hợp lệ' };
        }
        const invalidFrom = steps.find((s) => s.delayFrom && !['start', 'prev'].includes(s.delayFrom));
        if (invalidFrom) {
          return { status: 'failed', message: 'Mốc thời gian gửi Zalo nhóm không hợp lệ' };
        }
      }
    }
    if (config.zaloGroupSource === 'manual' && !String(config.zaloGroupIds || '').trim()) {
      return { status: 'failed', message: 'Thiếu danh sách group id' };
    }
    const sourceError = requireSourceNodeAndField(
      config.zaloGroupSource,
      config.zaloGroupNodeId,
      config.zaloGroupField,
      'cột group id'
    );
    if (sourceError) return { status: 'failed', message: sourceError };
  }

  return { status: 'success', message: 'Thực thi thành công' };
};
