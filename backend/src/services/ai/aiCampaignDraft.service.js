import aiCampaignDraftRepository from '../../repositories/ai/aiCampaignDraft.repository.js';

const NODE_REFERENCE_KEYS = [
  'saveCustomerNodeId', 'recipientNodeId', 'ccNodeId', 'bccNodeId',
  'zaloRecipientNodeId', 'zaloFriendNodeId', 'zaloGroupNodeId',
  'zaloFriendAccountNodeId', 'zaloGroupAccountNodeId',
];

function draftError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
}

class AiCampaignDraftService {
  async autoCreateEmailTemplates(nodes, userId) {
    for (const node of nodes) {
      const cfg = node.config || node.nodeConfig || {};
      const nodeType = node.nodeType || node.type || node.node_type || '';
      const isSendEmail = ['send_email', 'email', 'email_send'].includes(nodeType) ||
        ['send_email', 'email', 'email_send'].includes(node.nodeSubtype || node.subtype || '');
      if (!isSendEmail) continue;
      const createTemplate = async ({ subject, body, suffix = '' }) => {
        const name = node.nodeName || node.name || 'Email từ AI';
        const row = await aiCampaignDraftRepository.createEmailTemplate({
          userId,
          name: suffix ? `${name} ${suffix}` : name,
          code: `ai_${Date.now()}`,
          subject: subject || name,
          bodyHtml: body,
        });
        if (!row?.id) throw new Error('Không thể tạo email template từ nội dung nháp');
        return row.id;
      };

      if (!cfg.emailTemplateId && cfg.emailBody) {
        cfg.emailTemplateId = await createTemplate({ subject: cfg.emailSubject, body: cfg.emailBody });
        cfg.emailBody = '';
        cfg.emailSubject = '';
      }
      if (Array.isArray(cfg.emailSteps)) {
        for (let index = 0; index < cfg.emailSteps.length; index += 1) {
          const step = cfg.emailSteps[index] || {};
          if (!step.templateId && step.emailBody) {
            step.templateId = await createTemplate({ subject: step.emailSubject, body: step.emailBody, suffix: `#${index + 1}` });
            step.emailBody = '';
            step.emailSubject = '';
          }
          cfg.emailSteps[index] = step;
        }
      }
      node.config = cfg;
    }
  }

  async autoFillEmailChannels(nodes, userId) {
    try {
      const defaultChannelId = await aiCampaignDraftRepository.findDefaultEmailSettingId(userId);
      if (!defaultChannelId) return;

      for (const node of nodes) {
        const cfg = node.config || {};
        const nodeType = node.node_type || node.nodeType || node.type || '';
        const isSendEmail = ['send_email', 'email', 'email_send'].includes(nodeType) ||
          ['send_email', 'email', 'email_send'].includes(node.nodeSubtype || node.subtype || '');
        if (!isSendEmail) continue;
        if (!cfg.fromEmailId) {
          cfg.fromEmailId = defaultChannelId;
          node.config = cfg;
        }
      }
    } catch (e) {
      console.warn('[AI] Không lấy được email settings:', e.message);
    }
  }

  async autoFillZaloAccounts(nodes, userId) {
    try {
      const defaultAccountId = await aiCampaignDraftRepository.findDefaultZaloSettingId(userId);
      if (!defaultAccountId) return;

      const zaloNodeTypes = ['send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request', 'select_zalo_account'];
      for (const node of nodes) {
        const cfg = node.config || {};
        const nodeType = node.node_type || node.nodeType || node.type || '';
        if (!zaloNodeTypes.includes(nodeType)) continue;
        if (!cfg.zaloAccountId) {
          cfg.zaloAccountId = defaultAccountId;
          node.config = cfg;
        }
      }
    } catch (e) {
      console.warn('[AI] Không lấy được zalo settings:', e.message);
    }
  }

  normalizeNodes(nodes) {
    if (!Array.isArray(nodes)) return [];

    return nodes.map((node) => {
      const nodeSubtype = node.nodeSubtype || node.subtype || node.node_subtype || '';
      let nodeType = node.nodeType || node.type || node.node_type || '';

      if (['send_email', 'email', 'email_send', 'email_action'].includes(nodeType) ||
          ['send_email', 'email', 'email_send', 'email_action'].includes(nodeSubtype)) {
        nodeType = 'send_email';
      } else if (['send_zalo_personal', 'zalo_personal', 'zalo'].includes(nodeType) ||
                 ['send_zalo_personal', 'zalo_personal', 'zalo'].includes(nodeSubtype)) {
        nodeType = 'send_zalo_personal';
      } else if (['send_zalo_group', 'zalo_group'].includes(nodeType) ||
                 ['send_zalo_group', 'zalo_group'].includes(nodeSubtype)) {
        nodeType = 'send_zalo_group';
      } else if (['send_zalo_friend_request', 'zalo_friend'].includes(nodeType) ||
                 ['send_zalo_friend_request', 'zalo_friend'].includes(nodeSubtype)) {
        nodeType = 'send_zalo_friend_request';
      } else if (['wait_time', 'wait', 'delay', 'schedule'].includes(nodeType) ||
                 ['wait_time', 'wait', 'delay', 'schedule'].includes(nodeSubtype)) {
        nodeType = 'delay';
      } else if (['start', 'trigger', 'manual'].includes(nodeType) ||
                 ['start', 'trigger', 'manual'].includes(nodeSubtype)) {
        nodeType = 'trigger';
      } else if (nodeType === 'end') {
        nodeType = 'end';
      } else if (['condition', 'filter', 'branch', 'split'].includes(nodeType) ||
                 ['condition', 'filter', 'branch', 'split'].includes(nodeSubtype)) {
        nodeType = 'condition';
      } else if (['interested_customers', 'read_interested_customers', 'read_sheet', 'google_sheet',
                  'read_landing_leads', 'read_courses_db', 'read_products_db'].includes(nodeSubtype)) {
        nodeType = nodeSubtype;
      } else if (nodeType === 'data') {
        if (['interested_customers', 'read_interested_customers'].includes(nodeSubtype)) {
          nodeType = 'interested_customers';
        } else if (['tag_contact', 'tag'].includes(nodeSubtype)) {
          nodeType = 'tag_contact';
        } else if (['update_attribute', 'update_field'].includes(nodeSubtype)) {
          nodeType = 'update_attribute';
        } else if (['condition', 'filter', 'branch', 'split'].includes(nodeSubtype)) {
          nodeType = 'condition';
        } else if (['wait', 'wait_time', 'delay'].includes(nodeSubtype)) {
          nodeType = 'delay';
        }
      } else if (['zns', 'zalo_message'].includes(nodeType) ||
                 ['zns', 'zalo_message'].includes(nodeSubtype)) {
        nodeType = 'zns';
      } else if (nodeType === 'sms' || nodeSubtype === 'sms') {
        nodeType = 'sms';
      } else if (!nodeType) {
        nodeType = 'trigger';
      }

      const nodeId = node.tempId || node.id || `node_${Math.random().toString(36).substring(2, 11)}`;
      let config = node.config || node.settings || {};

      if (node.type === 'email' || node.subtype === 'email') {
        config = {
          emailSubject: node.subject || '',
          emailBody: node.bodyHtml || node.body || '',
          bodyText: node.bodyText || '',
          templateName: node.templateName || '',
          templateMappings: [],
          enableLinkTracking: true,
          saveMessageLog: true,
        };
      }

      if (node.type === 'wait' && node.duration) {
        config = {
          amount: node.duration.value || 1,
          unit: node.duration.unit || 'days',
        };
      }

      return {
        id: nodeId,
        tempId: nodeId,
        node_type: nodeType,
        node_subtype: nodeSubtype,
        node_name: node.name || node.nodeName || node.templateName || 'Node',
        node_description: node.description || node.nodeDescription || '',
        position_x: node.position?.x || node.positionX || node.position_x || 0,
        position_y: node.position?.y || node.positionY || node.position_y || 0,
        config,
      };
    });
  }

  canonicalizeScript(script) {
    if (!script || !Array.isArray(script.nodes) || !Array.isArray(script.connections)) {
      throw draftError('INVALID_DRAFT', 'Script không hợp lệ. Cần có nodes và connections.');
    }
    const cloned = structuredClone(script);
    const seenIds = new Set();
    cloned.nodes = cloned.nodes.map((node, index) => {
      const next = { ...node };
      const id = String(next.tempId || next.id || `ai-node-${index + 1}`).trim();
      if (!id || seenIds.has(id)) throw draftError('DUPLICATE_NODE_ID', `Node ID bị trùng hoặc không hợp lệ: ${id || index + 1}`);
      seenIds.add(id);
      next.id = id;
      next.tempId = id;
      next.config = { ...(next.config || next.nodeConfig || next.settings || {}) };
      const subtype = String(next.nodeSubtype || next.node_subtype || next.subtype || '').toLowerCase();
      if (next.config.zaloAccountNodeId) {
        if (subtype === 'get_all_groups') next.config.zaloGroupAccountNodeId = next.config.zaloGroupAccountNodeId || next.config.zaloAccountNodeId;
        if (subtype === 'get_all_friends') next.config.zaloFriendAccountNodeId = next.config.zaloFriendAccountNodeId || next.config.zaloAccountNodeId;
        delete next.config.zaloAccountNodeId;
      }
      return next;
    });
    cloned.connections = cloned.connections.map((connection) => ({
      sourceNodeId: String(connection?.sourceNodeId || connection?.source || connection?.from || '').trim(),
      targetNodeId: String(connection?.targetNodeId || connection?.target || connection?.to || '').trim(),
      connectionType: connection?.connectionType || 'default',
      connectionLabel: connection?.connectionLabel || '',
    }));
    for (const connection of cloned.connections) {
      if (!seenIds.has(connection.sourceNodeId) || !seenIds.has(connection.targetNodeId)) {
        throw draftError('DANGLING_CONNECTION', 'Kết nối đang trỏ tới node không tồn tại.');
      }
    }

    const assertReference = (value) => {
      if (value == null || String(value).trim() === '') return;
      if (!seenIds.has(String(value))) throw draftError('DANGLING_REFERENCE', 'Cấu hình đang trỏ tới node không tồn tại.');
    };
    const assertMappings = (mappings) => (Array.isArray(mappings) ? mappings.forEach((mapping) => assertReference(mapping?.nodeId)) : null);
    for (const node of cloned.nodes) {
      const config = node.config;
      NODE_REFERENCE_KEYS.forEach((key) => assertReference(config[key]));
      assertMappings(config.templateMappings);
      assertMappings(config.zaloFriendTemplateMappings);
      ['emailSteps', 'zaloPersonalTemplateSteps', 'zaloGroupTemplateSteps'].forEach((key) => {
        (Array.isArray(config[key]) ? config[key] : []).forEach((step) => assertMappings(step?.templateMappings));
      });
      Object.values(config.saveCustomerFieldMap || {}).forEach((mapping) => assertReference(mapping?.nodeId));
      (Array.isArray(config.saveCustomerCustomFields) ? config.saveCustomerCustomFields : []).forEach((mapping) => assertReference(mapping?.nodeId));
    }
    return cloned;
  }

  async prepareScript(script, userId) {
    const canonical = this.canonicalizeScript(script);
    const nodes = this.normalizeNodes(canonical.nodes);
    await this.autoFillEmailChannels(nodes, userId);
    await this.autoFillZaloAccounts(nodes, userId);
    return { ...canonical, nodes };
  }
}

export default new AiCampaignDraftService();
