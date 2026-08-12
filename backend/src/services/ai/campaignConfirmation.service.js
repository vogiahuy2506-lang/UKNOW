import aiCampaignDraftRepository from '../../repositories/ai/aiCampaignDraft.repository.js';
import emailTemplateRepository from '../../repositories/email/emailTemplate.repository.js';
import zaloTemplateRepository from '../../repositories/zalo/zaloTemplate.repository.js';
import campaignEmailSenderRepository from '../../repositories/campaign/campaignEmailSender.repository.js';
import campaignZaloSenderRepository from '../../repositories/campaign/campaignZaloSender.repository.js';

const EMAIL_TYPES = new Set(['send_email', 'email', 'email_send']);
const ZALO_PERSONAL_TYPES = new Set(['send_zalo_personal', 'zalo_personal', 'zalo']);
const ZALO_GROUP_TYPES = new Set(['send_zalo_group', 'zalo_group']);

const asNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const plainText = (value) => String(value || '')
  .replace(/<\s*br\s*\/?>/gi, '\n')
  .replace(/<\/?p\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\n\s*\n\s*\n+/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const attachmentMetadata = (value) => parseJsonArray(value)
  .map((attachment) => ({
    name: String(attachment?.displayName || attachment?.originalName || attachment?.name || '').slice(0, 255),
    contentType: String(attachment?.contentType || attachment?.mimeType || attachment?.type || '').slice(0, 120),
  }))
  .filter((attachment) => attachment.name || attachment.contentType);

const nodeType = (node) => String(
  node?.node_subtype || node?.nodeSubtype || node?.subtype || node?.node_type || node?.nodeType || node?.type || '',
).toLowerCase();

const nodeId = (node, index) => String(node?.id || node?.tempId || `preview-node-${index + 1}`);

const sourceLabel = (config, nodes, channel) => {
  const sourceId = channel === 'email'
    ? config?.recipientNodeId
    : config?.zaloRecipientNodeId || config?.zaloGroupNodeId;
  const source = nodes.find((node) => String(node?.id || node?.tempId || '') === String(sourceId || ''));
  return source?.nodeName || source?.node_name || source?.name || null;
};

const manualRecipientCount = (value) => String(value || '')
  .split(/[\s,;\n]+/)
  .map((item) => item.trim())
  .filter(Boolean).length;

class CampaignConfirmationService {
  async buildConfirmationView({ script, userId }) {
    const nodes = Array.isArray(script?.nodes) ? script.nodes : [];
    const issues = [];
    const resourceVersions = [];
    const steps = [];

    const addIssue = ({ code, nodeId: issueNodeId, stepIndex = null }) => {
      issues.push({ code, nodeId: issueNodeId, stepIndex, messageKey: `aiChatbot.confirmation.${code}` });
    };

    const resolveSender = async (channel, config, issueNodeId) => {
      if (channel === 'email') {
        const id = asNumber(config?.fromEmailId) || await aiCampaignDraftRepository.findDefaultEmailSettingId(userId);
        const sender = id ? await campaignEmailSenderRepository.findEmailSettingsById(id, userId) : null;
        if (!sender) {
          addIssue({ code: 'missing_sender', nodeId: issueNodeId });
          return { id: null, label: null };
        }
        return { id: sender.id, label: sender.sender_name || sender.from_name || sender.email || `Email #${sender.id}` };
      }

      const id = asNumber(config?.zaloAccountId) || await aiCampaignDraftRepository.findDefaultZaloSettingId(userId);
      const sender = id ? await campaignZaloSenderRepository.findCampaignZaloAccount(id, userId, false) : null;
      if (!sender || !sender.is_active) {
        addIssue({ code: 'missing_sender', nodeId: issueNodeId });
        return { id: null, label: null };
      }
      return { id: sender.id, label: sender.display_name || `Zalo #${sender.id}` };
    };

    const hydrateTemplate = async (channel, templateId, issueNodeId, stepIndex) => {
      const id = asNumber(templateId);
      if (!id) {
        addIssue({ code: 'invalid_template_step', nodeId: issueNodeId, stepIndex });
        return null;
      }
      const template = channel === 'email'
        ? await emailTemplateRepository.findById({ id, userId, isAdmin: false })
        : await zaloTemplateRepository.findById({ id, userId, isAdmin: false });
      if (!template) {
        addIssue({ code: 'template_not_found', nodeId: issueNodeId, stepIndex });
        return null;
      }
      resourceVersions.push({
        kind: channel === 'email' ? 'email_template' : 'zalo_template',
        id: template.id,
        updatedAt: template.updated_at || template.updatedAt || null,
      });
      return {
        templateId: template.id,
        templateName: template.template_name || template.name || null,
        subject: template.subject || '',
        bodyText: plainText(template.body_text || template.body_html || ''),
        attachments: attachmentMetadata(template.attachments),
      };
    };

    for (const [index, node] of nodes.entries()) {
      const type = nodeType(node);
      const config = node?.config || node?.nodeConfig || node?.settings || {};
      const currentNodeId = nodeId(node, index);
      let channel = null;
      let multiStepField = null;
      if (EMAIL_TYPES.has(type)) {
        channel = 'email';
        multiStepField = 'emailSteps';
      } else if (ZALO_PERSONAL_TYPES.has(type)) {
        channel = 'zalo_personal';
        multiStepField = 'zaloPersonalTemplateSteps';
      } else if (ZALO_GROUP_TYPES.has(type)) {
        channel = 'zalo_group';
        multiStepField = 'zaloGroupTemplateSteps';
      }
      if (!channel) continue;

      const sender = await resolveSender(channel, config, currentNodeId);
      const rawSteps = Array.isArray(config[multiStepField]) ? config[multiStepField] : [];
      const useMultiStep = rawSteps.length > 0;
      const effectiveSteps = useMultiStep ? rawSteps : [null];
      for (const [stepIndex, configuredStep] of effectiveSteps.entries()) {
        let content;
        if (configuredStep) {
          content = await hydrateTemplate(channel === 'email' ? 'email' : 'zalo', configuredStep.templateId, currentNodeId, stepIndex);
          if (!content) continue;
        } else if (channel === 'email' && asNumber(config.emailTemplateId)) {
          content = await hydrateTemplate('email', config.emailTemplateId, currentNodeId, 0);
          if (!content) continue;
        } else {
          const subject = channel === 'email' ? String(config.emailSubject || '') : '';
          const body = channel === 'email'
            ? plainText(config.emailBody || config.bodyText || '')
            : String(channel === 'zalo_group' ? config.zaloGroupMessage || '' : config.message || '').trim();
          if (!body) {
            addIssue({ code: 'missing_message_content', nodeId: currentNodeId, stepIndex: useMultiStep ? stepIndex : 0 });
            continue;
          }
          content = {
            templateId: null,
            templateName: null,
            subject,
            bodyText: body,
            attachments: attachmentMetadata(channel === 'zalo_group' ? config.zaloGroupAttachments : config.attachments),
          };
        }

        const stepConfig = configuredStep || config;
        const manual = channel === 'email'
          ? config.recipientSource === 'manual'
          : channel === 'zalo_group'
            ? config.zaloGroupSource === 'manual'
            : config.zaloRecipientSource === 'manual';
        const recipientList = channel === 'email'
          ? config.recipientEmails
          : channel === 'zalo_group'
            ? config.zaloGroupIds
            : config.zaloRecipientPhones;
        steps.push({
          key: `${currentNodeId}:${stepIndex}`,
          nodeId: currentNodeId,
          stepIndex,
          channel,
          title: node?.nodeName || node?.node_name || node?.name || (channel === 'email' ? 'Email' : 'Zalo'),
          content,
          timing: {
            anchor: stepConfig?.delayFrom === 'previous' || stepConfig?.delayFrom === 'prev' ? 'prev' : 'start',
            value: Number(stepConfig?.delayValue || 0),
            unit: stepConfig?.delayUnit || 'days',
          },
          sender,
          recipients: {
            mode: manual ? 'manual' : 'source',
            count: manual ? manualRecipientCount(recipientList) : null,
            sourceLabel: manual ? null : sourceLabel(config, nodes, channel === 'email' ? 'email' : 'zalo'),
          },
        });
      }
    }

    if (steps.length === 0 && issues.length === 0) addIssue({ code: 'no_send_steps', nodeId: null });
    const seenVersions = new Set();
    const uniqueVersions = resourceVersions.filter((item) => {
      const key = `${item.kind}:${item.id}`;
      if (seenVersions.has(key)) return false;
      seenVersions.add(key);
      return true;
    });

    return {
      version: 1,
      campaign: {
        name: script?.campaignName || script?.name || '',
        description: script?.description || '',
        type: script?.campaignType || script?.type || null,
      },
      totals: { sendSteps: steps.length },
      readyToCreate: issues.length === 0,
      blockingIssues: issues,
      resourceVersions: uniqueVersions,
      steps,
    };
  }
}

export default new CampaignConfirmationService();
