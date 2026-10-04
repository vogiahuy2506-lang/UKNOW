import aiCampaignDraftRepository from '../../repositories/ai/aiCampaignDraft.repository.js';
import emailTemplateRepository from '../../repositories/email/emailTemplate.repository.js';
import zaloTemplateRepository from '../../repositories/zalo/zaloTemplate.repository.js';
import campaignEmailSenderRepository from '../../repositories/campaign/campaignEmailSender.repository.js';
import campaignZaloSenderRepository from '../../repositories/campaign/campaignZaloSender.repository.js';
import chatbotTelegramRepository from '../../repositories/chatbot/chatbotTelegram.repository.js';
import { isAdapterCampaignChannelEnabled } from '../campaign/campaignChannelFlags.util.js';

const EMAIL_TYPES = new Set(['send_email', 'email', 'email_send']);
const ZALO_PERSONAL_TYPES = new Set(['send_zalo_personal', 'zalo_personal', 'zalo']);
const ZALO_GROUP_TYPES = new Set(['send_zalo_group', 'zalo_group']);
// P8a — kênh adapter (Telegram/WhatsApp): 1 bước `steps[0]`, chỉ nhận diện khi cờ kênh bật.
const TELEGRAM_TYPES = new Set(['send_telegram']);
const WHATSAPP_TYPES = new Set(['send_whatsapp']);
const ADAPTER_CHANNEL_TITLES = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
const WHATSAPP_SESSION_KEY_PATTERN = /^\d+-[A-Za-z0-9_-]{1,128}$/;
// Trần chờ ước tính cho thẻ xác nhận: quá hạn → `estimate: null` (thẻ vẫn hiện, không treo chờ Sheet).
const ESTIMATE_VIEW_TIMEOUT_MS = 25_000;

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

const extractText = (val) => {
  if (!val) return '';
  if (typeof val === 'object') return String(val.vi || val.en || Object.values(val)[0] || '');
  return String(val);
};

const findSourceNode = (config, nodes, channel) => {
  const sourceId = channel === 'email'
    ? config?.recipientNodeId
    : config?.zaloRecipientNodeId || config?.zaloGroupNodeId;
  return nodes.find((node) => String(node?.id || node?.tempId || '') === String(sourceId || '')) || null;
};

const sourceLabel = (config, nodes, channel) => {
  const source = findSourceNode(config, nodes, channel);
  return extractText(source?.nodeName || source?.node_name || source?.name || null);
};

// Giới hạn mặc định của node "khách trong DB" mà compiler dựng (campaignCompiler.service.js).
const DEFAULT_DB_AUDIENCE_LIMIT = 1000;

/**
 * Bộ lọc người nhận trên node nguồn "khách trong DB" (`interested_customers`): đã mua / quan tâm-chưa mua, theo khoá học, trừ
 * khoá đã mua, giới hạn số khách. Thẻ xác nhận trước đây chỉ ghi tên node ("Lấy dữ liệu khách hàng") nên người dùng không thể
 * thấy email sắp đi tới ai (rà soát C P1-3, 03/10/2026). null = không có bộ lọc nào (mọi khách có địa chỉ, ≤ mặc định).
 */
const audienceFilterOf = (sourceNode) => {
  const subtype = String(sourceNode?.nodeSubtype || sourceNode?.node_subtype || sourceNode?.subtype || '').toLowerCase();
  if (subtype !== 'interested_customers' && subtype !== 'read_interested_customers') return null;
  const config = sourceNode?.config || sourceNode?.nodeConfig || {};
  const ids = (value) => [...new Set((Array.isArray(value) ? value : []).map(asNumber).filter((id) => id != null && id > 0))];
  const courseIds = ids(config.interestedCourseIds);
  const excludedCourseIds = ids(config.notPurchasedCourseIds);
  const rawType = String(config.interestedCustomerType ?? '').trim().toLowerCase();
  const customerType = rawType === 'purchased' || rawType === 'interested' ? rawType : null;
  const rawLimit = Number(config.interestedLimit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit !== DEFAULT_DB_AUDIENCE_LIMIT ? rawLimit : null;
  if (!courseIds.length && !excludedCourseIds.length && !customerType && limit == null) return null;
  return { customerType, limit, courseIds, excludedCourseIds };
};

const manualRecipientCount = (value) => String(value || '')
  .split(/[\s,;\n]+/)
  .map((item) => item.trim())
  .filter(Boolean).length;

/**
 * Nhóm Zalo CỤ THỂ đã được chọn cho node gửi. Wizard/compiler luôn sinh `zaloGroupSource: 'node'`
 * + node get_all_groups, và khi người dùng đã chọn nhóm ở cổng zaloGroups thì compiler ghi
 * `zaloGroupIds`/`zaloSelectedGroupIds` (mảng) lên CHÍNH node gửi (campaignCompiler.service.js
 * :968-973; patch cũ aiCampaignDraft.service.js:557-565 cũng vậy). Runtime lọc get_all_groups theo
 * đúng các id này (campaignRun.service.js:4294) nên về bản chất đây là danh sách cố định — phải
 * được coi là `manual` để cổng Gửi nhanh (AiChatbotCards.jsx:2023) mở được. Sự cố 09/09 14:37:
 * "gửi ngay cho nhóm X" ra thẻ chỉ có "Tạo chiến dịch" vì nhánh dưới chỉ nhìn zaloGroupSource.
 * Chỉ đọc id trên node gửi (không tra sang node nguồn) để khớp handleQuickSendDraft phía frontend,
 * vốn cũng chỉ đọc config.zaloGroupIds của node gửi.
 */
const selectedGroupIdsOnNode = (config) => {
  const raw = Array.isArray(config?.zaloSelectedGroupIds) && config.zaloSelectedGroupIds.length > 0
    ? config.zaloSelectedGroupIds
    : config?.zaloGroupIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => String(value || '').trim()).filter((value, idx, arr) => value && arr.indexOf(value) === idx);
};

class CampaignConfirmationService {
  async assertResourceVersionsCurrent({ resourceVersions, userId, ownerUserId = null }) {
    if (!Array.isArray(resourceVersions)) return;
    // Mẫu tin thuộc CHỦ workspace (xem buildConfirmationView) — tra theo chủ, cùng id mà buildConfirmationView đã dùng khi
    // chụp `resourceVersions`; tra theo nhân viên thì mọi mẫu của chủ "biến mất" → PREPARE_STALE 409 oan.
    const templateOwnerId = ownerUserId != null ? ownerUserId : userId;
    for (const resource of resourceVersions) {
      const id = asNumber(resource?.id);
      if (!id || !resource?.updatedAt) continue;
      const template = resource.kind === 'email_template'
        ? await emailTemplateRepository.findById({ id, userId: templateOwnerId, isAdmin: false })
        : resource.kind === 'zalo_template'
          ? await zaloTemplateRepository.findById({ id, userId: templateOwnerId, isAdmin: false })
          : null;
      const expected = new Date(resource.updatedAt).getTime();
      const current = new Date(template?.updated_at || template?.updatedAt || 0).getTime();
      if (!template || !Number.isFinite(expected) || expected !== current) {
        const error = new Error('Mẫu tin đã thay đổi. Vui lòng xem lại bản xác nhận.');
        error.code = 'PREPARE_STALE';
        error.statusCode = 409;
        throw error;
      }
    }
  }

  async buildConfirmationView({ script, userId, ownerUserId = null, includeEstimate = false }) {
    // MỌI tài khoản gửi (Email, Zalo, Telegram, WhatsApp) và mẫu tin (Email/Zalo) thuộc CHỦ workspace — nhân viên dùng chung,
    // khác userId thao tác. Bằng chứng quy ước: các endpoint thường của nhân viên đều tra theo `workspaceOwnerId`
    // (emailSettings/emailTemplate/zaloSettings/zaloTemplate.controller: `getWorkspaceContext(req.user).workspaceOwnerId`),
    // chiến dịch lưu `id_user = workspace_owner_id = chủ` (campaignCrud.repository.insertCampaignTx) nên lúc chạy tra tài khoản
    // theo chủ (campaignEmailSender: `campaign.id_user`; campaignRun → getCampaignZaloAccount), và wizard liệt kê tài khoản
    // cho model theo chủ (aiCampaign._getWizardResources(ownerId)).
    // Các repo (findEmailSettingsById, findCampaignZaloAccount, emailTemplate/zaloTemplate.findById) chỉ lọc `id_user = $x`
    // chứ không tự đổi nhân viên → chủ, nên phải truyền id chủ ở đây. Trước đây Email/Zalo/mẫu dùng `userId` (nhân viên) →
    // luôn `missing_sender`/`template_not_found` → INVALID_DRAFT_RESOURCES (C P1-7). Telegram/WhatsApp vốn đã đúng.
    const channelOwnerId = ownerUserId != null ? ownerUserId : userId;
    const nodes = Array.isArray(script?.nodes) ? script.nodes : [];
    const issues = [];
    const resourceVersions = [];
    const steps = [];

    const addIssue = ({ code, nodeId: issueNodeId, stepIndex = null }) => {
      issues.push({ code, nodeId: issueNodeId, stepIndex, messageKey: `aiChatbot.confirmation.${code}` });
    };

    // Bộ lọc người nhận kèm TÊN khoá học (tra theo chủ workspace — cùng danh sách trợ lý đưa cho LLM). Tra tên lỗi thì vẫn
    // hiện bộ lọc bằng id: thẻ xác nhận không được vỡ vì một lần tra tên.
    const audienceFilterCache = new Map();
    const resolveAudienceFilter = async (sourceNode) => {
      const raw = audienceFilterOf(sourceNode);
      if (!raw) return null;
      const cacheKey = JSON.stringify(raw);
      if (audienceFilterCache.has(cacheKey)) return audienceFilterCache.get(cacheKey);

      const nameById = new Map();
      const allIds = [...new Set([...raw.courseIds, ...raw.excludedCourseIds])];
      if (allIds.length > 0) {
        try {
          const { default: aiPromptResources } = await import('./aiPromptResources.service.js');
          const courses = await aiPromptResources.getCourses(channelOwnerId);
          for (const course of courses || []) {
            if (course?.id != null && course.name) nameById.set(Number(course.id), String(course.name));
          }
        } catch (error) {
          console.warn('[CampaignConfirmation] Không tra được tên khoá học của bộ lọc người nhận:', error?.message || error);
        }
      }
      const named = (courseIds) => courseIds.map((id) => ({ id, name: nameById.get(id) || null }));
      const view = {
        customerType: raw.customerType,
        limit: raw.limit,
        courses: named(raw.courseIds),
        excludedCourses: named(raw.excludedCourseIds),
      };
      audienceFilterCache.set(cacheKey, view);
      return view;
    };

    const resolveSender = async (channel, config, issueNodeId) => {
      if (channel === 'email') {
        const id = asNumber(config?.fromEmailId) || await aiCampaignDraftRepository.findDefaultEmailSettingId(channelOwnerId);
        const sender = id ? await campaignEmailSenderRepository.findEmailSettingsById(id, channelOwnerId) : null;
        if (!sender) {
          addIssue({ code: 'missing_sender', nodeId: issueNodeId });
          return { id: null, label: null };
        }
        return { id: sender.id, label: sender.sender_name || sender.from_name || sender.email || `Email #${sender.id}` };
      }

      if (channel === 'telegram') {
        const telegramId = asNumber(config?.telegramAccountId);
        const account = telegramId ? await chatbotTelegramRepository.getAccountById(telegramId, { userId: channelOwnerId }) : null;
        if (!account || account.is_active === false) {
          addIssue({ code: 'missing_sender', nodeId: issueNodeId });
          return { id: null, label: null };
        }
        return { id: account.id, label: account.username || account.first_name || account.phone || `Telegram #${account.id}` };
      }

      if (channel === 'whatsapp') {
        const sessionKey = String(config?.whatsappSessionKey ?? '').trim();
        if (!WHATSAPP_SESSION_KEY_PATTERN.test(sessionKey) || !sessionKey.startsWith(`${Number(channelOwnerId)}-`)) {
          addIssue({ code: 'missing_sender', nodeId: issueNodeId });
          return { id: null, label: null };
        }
        let label = sessionKey;
        try {
          const { getSession } = await import('../chatbot/whatsappBaileys.service.js');
          label = getSession(sessionKey)?.userName || sessionKey;
        } catch {
          // Không đọc được tên phiên → dùng mã phiên làm nhãn; quyền sở hữu đã kiểm ở trên.
        }
        return { id: sessionKey, label };
      }

      const id = asNumber(config?.zaloAccountId) || await aiCampaignDraftRepository.findDefaultZaloSettingId(channelOwnerId);
      const sender = id ? await campaignZaloSenderRepository.findCampaignZaloAccount(id, channelOwnerId, false) : null;
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
        ? await emailTemplateRepository.findById({ id, userId: channelOwnerId, isAdmin: false })
        : await zaloTemplateRepository.findById({ id, userId: channelOwnerId, isAdmin: false });
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
      } else if (TELEGRAM_TYPES.has(type) && isAdapterCampaignChannelEnabled('telegram')) {
        channel = 'telegram';
        multiStepField = 'steps';
      } else if (WHATSAPP_TYPES.has(type) && isAdapterCampaignChannelEnabled('whatsapp')) {
        channel = 'whatsapp';
        multiStepField = 'steps';
      }
      if (!channel) continue;
      const isAdapterChannel = channel === 'telegram' || channel === 'whatsapp';

      const sender = await resolveSender(channel, config, currentNodeId);
      const rawSteps = Array.isArray(config[multiStepField]) ? config[multiStepField] : [];
      const useMultiStep = rawSteps.length > 0;
      const effectiveSteps = useMultiStep ? rawSteps : [null];
      for (const [stepIndex, configuredStep] of effectiveSteps.entries()) {
        let content;
        if (configuredStep) {
          const hasTemplateId = configuredStep.templateId !== undefined && configuredStep.templateId !== null && String(configuredStep.templateId).trim() !== '';
          if (hasTemplateId) {
            content = await hydrateTemplate(channel === 'email' ? 'email' : 'zalo', configuredStep.templateId, currentNodeId, stepIndex);
            if (!content) continue;
          } else {
            const subject = channel === 'email' ? String(configuredStep.emailSubject || config.emailSubject || '') : '';
            const body = channel === 'email'
              ? plainText(configuredStep.emailBody || configuredStep.bodyText || '')
              : String(configuredStep.message || '').trim();
            if (!body) {
              addIssue({ code: 'missing_message_content', nodeId: currentNodeId, stepIndex });
              continue;
            }
            content = {
              templateId: null,
              templateName: null,
              subject,
              bodyText: body,
              attachments: attachmentMetadata(configuredStep.attachments || (channel === 'zalo_group' ? config.zaloGroupAttachments : config.attachments)),
            };
          }
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
        const selectedGroupIds = channel === 'zalo_group' && config.zaloGroupSource !== 'manual'
          ? selectedGroupIdsOnNode(config)
          : [];
        const manual = isAdapterChannel
          ? (config.recipientSource === 'manual' || config.recipientSource === 'telegram_groups')
          : channel === 'email'
          ? config.recipientSource === 'manual'
          : channel === 'zalo_group'
            ? (config.zaloGroupSource === 'manual' || selectedGroupIds.length > 0)
            : config.zaloRecipientSource === 'manual';
        const recipientList = isAdapterChannel
          ? config.recipientKeys
          : channel === 'email'
          ? config.recipientEmails
          : channel === 'zalo_group'
            ? (selectedGroupIds.length > 0 ? selectedGroupIds : config.zaloGroupIds)
            : config.zaloRecipientPhones;
        if (manual && manualRecipientCount(recipientList) === 0) {
          addIssue({ code: 'manual_recipients_required', nodeId: currentNodeId, stepIndex });
        }
        // Bộ lọc người nhận của node nguồn "khách trong DB" (không có khi nhập tay / không có bộ lọc).
        const audienceFilters = manual
          ? null
          : await resolveAudienceFilter(findSourceNode(config, nodes, channel === 'email' || isAdapterChannel ? 'email' : 'zalo'));
        steps.push({
          key: `${currentNodeId}:${stepIndex}`,
          nodeId: currentNodeId,
          stepIndex,
          channel,
          title: extractText(node?.nodeName || node?.node_name || node?.name || (isAdapterChannel ? ADAPTER_CHANNEL_TITLES[channel] : channel === 'email' ? 'Email' : 'Zalo')),
          content,
          timing: {
            anchor: stepConfig?.delayFrom === 'previous' || stepConfig?.delayFrom === 'prev' ? 'prev' : 'start',
            value: Number(stepConfig?.delayValue || 0),
            unit: stepConfig?.delayUnit || 'days',
          },
          sender,
          recipients: {
            mode: manual ? 'manual' : 'source',
            type: channel === 'zalo_personal' ? (config.zaloRecipientType || 'phone') : null,
            count: manual ? manualRecipientCount(recipientList) : null,
            sourceLabel: manual ? null : sourceLabel(config, nodes, channel === 'email' || isAdapterChannel ? 'email' : 'zalo'),
            ...(audienceFilters ? { filters: audienceFilters } : {}),
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

    const view = {
      version: 1,
      campaign: {
        name: extractText(script?.campaignName || script?.name || ''),
        description: extractText(script?.description || ''),
        type: script?.campaignType || script?.type || null,
      },
      totals: { sendSteps: steps.length },
      readyToCreate: issues.length === 0,
      blockingIssues: issues,
      resourceVersions: uniqueVersions,
      steps,
    };
    // Ước tính chỉ để HIỆN trên thẻ (cảnh báo, KHÔNG đổi readyToCreate) — các nơi dựng thẻ chỉ để kiểm quyền sở hữu
    // (tạo/ghi nháp) không cần và không nên tốn đếm người nhận, nên phải xin rõ bằng `includeEstimate`.
    if (includeEstimate) {
      view.estimate = issues.length === 0 ? await this.estimateForView({ script, ownerUserId: channelOwnerId }) : null;
    }
    return view;
  }

  /**
   * Ước tính thời gian gửi của kịch bản CHƯA lưu (bắt đầu = bây giờ). Mọi lỗi / quá hạn → null: thẻ xác nhận không được
   * vỡ vì một lần ước tính. Có lỗi dữ kiện (chưa đủ người nhận, thiếu tài khoản) thì thẻ đã có `blockingIssues`, không ước tính.
   *
   * Người nhận từ Google Sheet: endpoint prepare chỉ nhận `script` (số người nhận trong `sheetCheck` của lượt chat không đi theo
   * request) nên đếm bằng đường sẵn có của bộ ước tính — đọc Sheet MỘT lần (cache trong lần ước tính), có timeout.
   */
  async estimateForView({ script, ownerUserId }) {
    try {
      const { estimateForScript } = await import('../campaign/campaignEstimate.service.js');
      let timer;
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ESTIMATE_VIEW_TIMEOUT_MS); });
      try {
        return await Promise.race([
          estimateForScript({
            script: { nodes: script?.nodes, connections: script?.connections, flowJson: script?.flowJson ?? null },
            ownerUserId,
            startAt: new Date(),
          }),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      console.warn('[CampaignConfirmation] Không ước tính được thời gian gửi:', error?.message || error);
      return null;
    }
  }
}

export default new CampaignConfirmationService();
