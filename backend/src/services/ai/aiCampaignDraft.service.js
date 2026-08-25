import aiCampaignDraftRepository from '../../repositories/ai/aiCampaignDraft.repository.js';
import campaignNodeRegistryService from '../campaign/campaignNodeRegistry.service.js';

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

  async autoCreateZaloTemplates(nodes, userId) {
    for (const node of nodes) {
      const cfg = node.config || node.nodeConfig || {};
      const nodeType = node.nodeType || node.type || node.node_type || '';
      const nodeSubtype = node.nodeSubtype || node.subtype || node.node_subtype || '';

      const isZaloPersonal = ['send_zalo_personal', 'zalo_personal', 'zalo'].includes(nodeType) ||
        ['send_zalo_personal', 'zalo_personal', 'zalo'].includes(nodeSubtype);
      const isZaloGroup = ['send_zalo_group', 'zalo_group'].includes(nodeType) ||
        ['send_zalo_group', 'zalo_group'].includes(nodeSubtype);

      if (!isZaloPersonal && !isZaloGroup) continue;

      const createTemplate = async ({ body, suffix = '' }) => {
        const name = node.nodeName || node.name || (isZaloGroup ? 'Zalo nhóm từ AI' : 'Zalo cá nhân từ AI');
        const templateName = suffix ? `${name} ${suffix}` : name;
        const row = await aiCampaignDraftRepository.createZaloTemplate({
          userId,
          name: templateName,
          code: `ai_zalo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          subject: templateName,
          bodyText: body,
        });
        if (!row?.id) throw new Error('Không thể tạo Zalo template từ nội dung nháp');
        return row.id;
      };

      if (isZaloPersonal) {
        if (Array.isArray(cfg.zaloPersonalTemplateSteps)) {
          for (let index = 0; index < cfg.zaloPersonalTemplateSteps.length; index += 1) {
            const step = cfg.zaloPersonalTemplateSteps[index] || {};
            const hasValidTemplateId = Number.isFinite(parseInt(step.templateId, 10)) && parseInt(step.templateId, 10) > 0;
            if (!hasValidTemplateId && step.message) {
              step.templateId = await createTemplate({
                body: step.message,
                suffix: cfg.zaloPersonalTemplateSteps.length > 1 ? `#${index + 1}` : '',
              });
            }
            cfg.zaloPersonalTemplateSteps[index] = step;
          }
        } else if (cfg.message || cfg.zaloPersonalMessage) {
          const body = cfg.message || cfg.zaloPersonalMessage;
          const templateId = await createTemplate({ body });
          cfg.zaloPersonalTemplateSteps = [
            {
              templateId,
              message: body,
              delayValue: cfg.delayValue || 0,
              delayUnit: cfg.delayUnit || 'days',
              enableLinkTracking: cfg.enableLinkTracking !== false,
              templateMappings: [],
            },
          ];
        }
      }

      if (isZaloGroup) {
        if (Array.isArray(cfg.zaloGroupTemplateSteps)) {
          for (let index = 0; index < cfg.zaloGroupTemplateSteps.length; index += 1) {
            const step = cfg.zaloGroupTemplateSteps[index] || {};
            const hasValidTemplateId = Number.isFinite(parseInt(step.templateId, 10)) && parseInt(step.templateId, 10) > 0;
            if (!hasValidTemplateId && step.message) {
              step.templateId = await createTemplate({
                body: step.message,
                suffix: cfg.zaloGroupTemplateSteps.length > 1 ? `#${index + 1}` : '',
              });
            }
            cfg.zaloGroupTemplateSteps[index] = step;
          }
        } else if (cfg.zaloGroupMessage || cfg.message) {
          const body = cfg.zaloGroupMessage || cfg.message;
          const templateId = await createTemplate({ body });
          cfg.zaloGroupTemplateSteps = [
            {
              templateId,
              message: body,
              delayValue: cfg.delayValue || 0,
              delayUnit: cfg.delayUnit || 'days',
              templateMappings: [],
            },
          ];
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

      const registryNode = campaignNodeRegistryService.nodeTypes[nodeSubtype];
      const defaultName = registryNode?.name || 'Node';
      const providedName = node.name || node.nodeName || node.templateName;
      const finalName = (!providedName || providedName === 'Node') ? defaultName : providedName;

      return {
        id: nodeId,
        tempId: nodeId,
        node_type: nodeType,
        node_subtype: nodeSubtype,
        node_name: finalName,
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

  patchDeterministicZaloScript(script, options = {}) {
    if (!script || !Array.isArray(script.nodes) || !Array.isArray(script.connections)) {
      return script;
    }

    const {
      senderAccountId = null,
      dataSource = null,
      defaultZaloAccountId = null,
    } = options;

    const targetZaloAccountId = senderAccountId || defaultZaloAccountId || null;
    const effectiveDataSource = dataSource || script.wizardDataSource || null;

    const getNodeSubtype = (node) => String(node?.node_subtype || node?.nodeSubtype || node?.subtype || '').toLowerCase();
    const getNodeType = (node) => String(node?.node_type || node?.nodeType || node?.type || '').toLowerCase();

    const isZaloSendNode = (node) => {
      const st = getNodeSubtype(node);
      const t = getNodeType(node);
      return ['send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request', 'zalo_personal', 'zalo_group', 'zalo_friend'].includes(st) ||
             ['send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request', 'zalo_personal', 'zalo_group'].includes(t);
    };

    const hasZaloSend = script.nodes.some(isZaloSendNode);

    // 1. Nếu dataSource là 'zalo_contacts' hoặc 'manual', loại bỏ các node lấy audience thừa
    if (effectiveDataSource === 'zalo_contacts' || effectiveDataSource === 'manual') {
      const isUnwantedAudienceNode = (node) => {
        const st = getNodeSubtype(node);
        const t = getNodeType(node);
        return ['interested_customers', 'read_interested_customers', 'read_sheet', 'google_sheet', 'read_landing_leads', 'get_all_friends'].includes(st) ||
               ['interested_customers', 'read_sheet', 'read_landing_leads', 'get_all_friends'].includes(t);
      };

      const unwantedNodes = script.nodes.filter(isUnwantedAudienceNode);
      for (const unwantedNode of unwantedNodes) {
        const unwantedId = String(unwantedNode.tempId || unwantedNode.id);
        console.log(`[AI Patch] Bỏ node ${getNodeSubtype(unwantedNode) || getNodeType(unwantedNode)} (${unwantedId}) vì dataSource="${effectiveDataSource}"`);

        const incoming = script.connections.filter(c => String(c.targetNodeId || c.target || c.to) === unwantedId);
        const outgoing = script.connections.filter(c => String(c.sourceNodeId || c.source || c.from) === unwantedId);

        script.nodes = script.nodes.filter(n => String(n.tempId || n.id) !== unwantedId);
        script.connections = script.connections.filter(c =>
          String(c.sourceNodeId || c.source || c.from) !== unwantedId &&
          String(c.targetNodeId || c.target || c.to) !== unwantedId
        );

        for (const inConn of incoming) {
          const srcId = String(inConn.sourceNodeId || inConn.source || inConn.from);
          for (const outConn of outgoing) {
            const tgtId = String(outConn.targetNodeId || outConn.target || outConn.to);
            if (srcId && tgtId && srcId !== tgtId) {
              const alreadyExists = script.connections.some(c =>
                String(c.sourceNodeId || c.source || c.from) === srcId &&
                String(c.targetNodeId || c.target || c.to) === tgtId
              );
              if (!alreadyExists) {
                script.connections.push({
                  sourceNodeId: srcId,
                  targetNodeId: tgtId,
                  connectionType: 'default',
                  connectionLabel: '',
                });
              }
            }
          }
        }

        for (const node of script.nodes) {
          const cfg = node.config || node.settings || {};
          if (String(cfg.zaloRecipientNodeId) === unwantedId || String(cfg.recipientNodeId) === unwantedId) {
            cfg.zaloRecipientSource = 'manual';
            cfg.recipientSource = 'manual';
            delete cfg.zaloRecipientNodeId;
            delete cfg.recipientNodeId;
            node.config = cfg;
          }
        }
      }
    }

    // 2. Nếu có node gửi Zalo, đảm bảo có select_zalo_account và đúng zaloAccountId
    if (hasZaloSend) {
      const isSelectZaloAccountNode = (node) => {
        return getNodeSubtype(node) === 'select_zalo_account' || getNodeType(node) === 'select_zalo_account';
      };

      let selectNode = script.nodes.find(isSelectZaloAccountNode);

      if (!selectNode) {
        const triggerNode = script.nodes.find(n => {
          const st = getNodeSubtype(n);
          const t = getNodeType(n);
          return ['trigger', 'manual', 'start'].includes(st) || ['trigger', 'manual', 'start'].includes(t);
        }) || script.nodes[0];

        const triggerId = triggerNode ? String(triggerNode.tempId || triggerNode.id) : null;
        const selectNodeId = `node_select_zalo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

        selectNode = {
          id: selectNodeId,
          tempId: selectNodeId,
          node_type: 'data',
          node_subtype: 'select_zalo_account',
          nodeType: 'data',
          nodeSubtype: 'select_zalo_account',
          node_name: 'Chọn tài khoản Zalo',
          nodeName: 'Chọn tài khoản Zalo',
          node_description: 'Tài khoản Zalo gửi tin',
          position_x: triggerNode ? ((triggerNode.position_x || triggerNode.positionX || 100) + 150) : 250,
          position_y: triggerNode ? (triggerNode.position_y || triggerNode.positionY || 200) : 200,
          config: {
            zaloAccountId: targetZaloAccountId ? Number(targetZaloAccountId) : null,
          },
        };

        console.log(`[AI Patch] Chèn node select_zalo_account (${selectNodeId}, zaloAccountId: ${targetZaloAccountId}) cho chiến dịch Zalo`);

        const triggerIndex = triggerNode ? script.nodes.indexOf(triggerNode) : -1;
        if (triggerIndex >= 0) {
          script.nodes.splice(triggerIndex + 1, 0, selectNode);
        } else {
          script.nodes.unshift(selectNode);
        }

        if (triggerId) {
          const triggerOutConns = script.connections.filter(c => String(c.sourceNodeId || c.source || c.from) === triggerId);
          script.connections = script.connections.filter(c => String(c.sourceNodeId || c.source || c.from) !== triggerId);

          script.connections.push({
            sourceNodeId: triggerId,
            targetNodeId: selectNodeId,
            connectionType: 'default',
            connectionLabel: '',
          });

          for (const outConn of triggerOutConns) {
            const oldTargetId = String(outConn.targetNodeId || outConn.target || outConn.to);
            if (oldTargetId && oldTargetId !== selectNodeId) {
              script.connections.push({
                sourceNodeId: selectNodeId,
                targetNodeId: oldTargetId,
                connectionType: 'default',
                connectionLabel: '',
              });
            }
          }
        }
      } else {
        const cfg = selectNode.config || selectNode.settings || {};
        if (targetZaloAccountId && (!cfg.zaloAccountId || senderAccountId)) {
          cfg.zaloAccountId = Number(targetZaloAccountId);
          selectNode.config = cfg;
          console.log(`[AI Patch] Cập nhật zaloAccountId=${targetZaloAccountId} cho node select_zalo_account`);
        }
      }

      for (const node of script.nodes) {
        if (isZaloSendNode(node)) {
          const cfg = node.config || node.settings || {};
          if (targetZaloAccountId && (!cfg.zaloAccountId || senderAccountId)) {
            cfg.zaloAccountId = Number(targetZaloAccountId);
            node.config = cfg;
          }
        }
      }
    }

    return script;
  }

  async prepareScript(script, userId, context = {}) {
    const defaultAccountId = await aiCampaignDraftRepository.findDefaultZaloSettingId(userId).catch(() => null);
    const patched = this.patchDeterministicZaloScript(script, {
      defaultZaloAccountId: defaultAccountId,
      ...context,
    });
    const canonical = this.canonicalizeScript(patched);
    const nodes = this.normalizeNodes(canonical.nodes);
    await this.autoFillEmailChannels(nodes, userId);
    await this.autoFillZaloAccounts(nodes, userId);
    return { ...canonical, nodes };
  }
}

export default new AiCampaignDraftService();
