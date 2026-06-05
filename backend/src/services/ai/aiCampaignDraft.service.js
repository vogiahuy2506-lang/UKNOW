import aiCampaignDraftRepository from '../../repositories/ai/aiCampaignDraft.repository.js';

class AiCampaignDraftService {
  async autoCreateEmailTemplates(nodes, userId) {
    for (const node of nodes) {
      const cfg = node.config || node.nodeConfig || {};
      const nodeType = node.nodeType || node.type || node.node_type || '';
      const isSendEmail = ['send_email', 'email', 'email_send'].includes(nodeType) ||
        ['send_email', 'email', 'email_send'].includes(node.nodeSubtype || node.subtype || '');
      if (!isSendEmail) continue;
      if (cfg.emailTemplateId || !cfg.emailBody) continue;

      try {
        const name = node.nodeName || node.name || 'Email từ AI';
        const row = await aiCampaignDraftRepository.createEmailTemplate({
          userId,
          name,
          code: `ai_${Date.now()}`,
          subject: cfg.emailSubject || name,
          bodyHtml: cfg.emailBody,
        });

        cfg.emailTemplateId = row.id;
        cfg.emailBody = '';
        cfg.emailSubject = '';
        node.config = cfg;
        console.log(`[AI] Auto-created email template id=${row.id} for node "${name}"`);
      } catch (e) {
        console.warn('[AI] Không tạo được email template tự động:', e.message);
      }
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
                  'read_landing_leads', 'read_courses_db'].includes(nodeSubtype)) {
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
}

export default new AiCampaignDraftService();
