import businessProfileService from './businessProfile.service.js';
import { formatAssistantCapabilities } from './assistantCapabilities.js';
import { buildAdminContext } from './adminContext.service.js';
import aiLandingPageService from './aiLandingPage.service.js';
import uploadController from '../../controllers/upload.controller.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import { assertOwnedStorageKey } from '../../utils/storageKey.util.js';
import aiUsageMeter from './aiUsageMeter.service.js';
import aiPromptResources from './aiPromptResources.service.js';
import { runChat } from './aiChatTransport.service.js';
import { checkSheetForChannel } from './sheetRecipientCheck.service.js';
import {
  lastUserMessageContent,
  hasExplicitCustomerSource,
  looksLikeCampaignRequest,
  asksOnlyForGoogleSheet,
  isMultiDaySeriesRequest,
  looksLikeInlineSeriesDraft,
  countSuggestContentPlan,
  buildAssistantLanguageInstructions,
} from '../../utils/campaignIntent.util.js';
import {
  resolveAssistantLocaleContext,
  normalizeAssistantLocale,
  isLandingOrientedTurn,
} from '../../utils/assistantLocale.util.js';
import {
  evaluateNextGate,
  extractWizardState,
  findOriginalCampaignPrompt,
  buildCampaignPromptWithWizardState,
  buildDataSourceQuestion,
  buildLandingLeadsGate,
  computeWizardMeta,
  hasLandingLeadsSelection,
  isContentPlanRevisionText,
  mergeWizardState,
  normalizeWizardState,
  parseWizardMarker,
  isPlanTemplateDraftRequest,
  isWizardMarkerMessage,
  isPlanCancelText,
  createEmptyWizardState,
  normalizeChannel,
  shouldGuardCampaignResponse,
  withDeadEndNudge,
  PLAN_APPROVE_TEXT_RE,
} from './aiCampaignWizard.service.js';
import {
  extractCampaignBriefFromHistory,
  mergeCampaignBrief,
  isCampaignBriefReady,
  resolveCampaignBrief,
  clearCampaignBriefProductFacts,
  createEmptyCampaignBrief,
  analyzeFileSuitability,
  MAX_STORED_FILE_TEXT_CHARS,
} from './campaignBrief.service.js';
import {
  isQuickSendRequest,
  inferCampaignBriefFromText,
  inferQuickSendChannel,
  isCampaignScriptShaped,
  pickChannelByExplicitSignal,
} from '../../utils/campaignQuickSend.util.js';
import { runCompilerShadowCompare } from './campaignCompilerShadow.service.js';
import { applyLandingAudienceResolution } from './landingAudienceResolver.service.js';
import { isCompilableIntent, deriveIntent, detectLegacyAudienceFilters } from './campaignIntent.schema.js';
import { compileCampaign } from './campaignCompiler.service.js';
import { mergeCompiledWithContent, assertNoEmptyContent } from './campaignScriptMerge.service.js';
import { fillContentSlots } from './campaignSlotFiller.service.js';
import { isAdapterCampaignChannel } from '../campaign/campaignChannelFlags.util.js';
import aiCampaignDraftService from './aiCampaignDraft.service.js';
import { resolveActorZaloAccessibleIds } from '../campaign/campaignZaloAccess.service.js';
import { resolveLandingAudienceChoice } from '../../utils/campaignLandingAudience.util.js';
import { UNTRUSTED_CONTENT_RULE } from '../../utils/untrustedContent.util.js';

export const USER_CONFIRMS_FILE_RE = /vẫn\s*dùng|van\s*dung|cứ\s*tiếp\s*tục|cu\s*tiep\s*tuc|dùng\s*(?:file|tệp|này|luôn|đi)|tiếp\s*tục|tiep\s*tuc|làm\s*tiếp|lam\s*tiep|cứ\s*làm|cu\s*lam|proceed|continue/i;

export function isUserConfirmingFile(text = '') {
  const trimmed = String(text || '').trim();
  return USER_CONFIRMS_FILE_RE.test(trimmed) || PLAN_APPROVE_TEXT_RE.test(trimmed);
}

/**
 * Người dùng nói RÕ muốn "tạo và chạy ngay". Dùng chung cho cổng gửi nhanh và cổng `create_and_run` tổng quát.
 */
export const EXPLICIT_CREATE_AND_RUN_RE = /tạo\s*và\s*chạy|tao\s*va\s*chay|create\s*and\s*run|auto\s*-?\s*run|chạy\s*ngay\s*(?:chiến\s*dịch|chien\s*dich|campaign)|chay\s*ngay\s*(?:chien\s*dich|campaign)/i;

/**
 * Tin GÕ TAY mới nhất của người dùng: bỏ marker thẻ `[wizard]{…}` (JSON máy sinh) và prompt máy "Tạo chi tiết template cho ngày…".
 * Tệp đính kèm / nội dung Google Docs-Sheet đi vào Gemini bằng `parts`, KHÔNG nằm trong `content` của lịch sử nên không bao giờ
 * lọt vào đây — một câu "tạo và chạy" chèn trong PDF/Docs không thể tự bật chế độ chạy ngay.
 */
/**
 * Bộ lọc LỊCH SỬ: tin user là prompt máy "soạn template cho slot kế hoạch"? Ưu tiên cờ lưu cùng tin
 * (`data.internalPrompt === 'plan_template'`, ghi từ PR-B); dò chữ CHỈ còn ở đây, để tương thích tin cũ đã lưu không có cờ.
 * Lượt HIỆN TẠI không dùng hàm này — quyết định theo `planSlotKey` do client gửi tường minh.
 */
export function isMachinePlanTemplateMessage(message) {
  if (message?.data && typeof message.data === 'object' && message.data.internalPrompt === 'plan_template') return true;
  return isPlanTemplateDraftRequest(String(message?.content || ''));
}

export function lastHandTypedUserText(history = []) {
  const messages = Array.isArray(history) ? history : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    const content = String(message?.content || '');
    if (!content.trim()) continue;
    if (isWizardMarkerMessage(content) || isMachinePlanTemplateMessage(message)) continue;
    return content;
  }
  return '';
}

class AiCampaignService {
  _guardCampaignDataSourceResponse(response, history = [], locale = 'vi', gateState = null) {
    const lastUserText = lastUserMessageContent(history);
    if (
      looksLikeCampaignRequest(lastUserText)
      && asksOnlyForGoogleSheet(response)
      && !hasExplicitCustomerSource(lastUserText)
    ) {
      return buildDataSourceQuestion(locale, gateState);
    }
    return response;
  }

  _guardContentPlanResponse(response, history = [], brief = null, intent = null) {
    if (response?.type === 'content_plan') return response;
    if (intent === 'content_plan_request') return response;

    // Hard brake (phanh cứng chống lặp): từ 1 lần suggest_content_plan trở lên trong history thì không bọc lại
    if (countSuggestContentPlan(history) >= 1) return response;

    const lastUserText = lastUserMessageContent(history);
    const sourcePrompt = findOriginalCampaignPrompt(history);
    const quickSend = brief?.flowMode === 'quick_send'
      || isQuickSendRequest(sourcePrompt)
      || isQuickSendRequest(lastUserText);
    if (quickSend) return response;

    if (!isMultiDaySeriesRequest(lastUserText)) return response;

    if (response?.type === 'text' && looksLikeInlineSeriesDraft(response.content)) {
      return {
        type: 'suggest_content_plan',
        content: response.content,
        data: { userPrompt: lastUserText },
        missing_fields: [],
      };
    }
    return response;
  }

  /**
   * Quick-send must confirm before run. "gửi nhanh" alone is not create_and_run.
   * Never escalate quick-send into a content_plan series unless payload is script-shaped.
   */
  _guardQuickSendResponse(response, history = [], brief = null) {
    const lastUserText = lastUserMessageContent(history);
    const sourcePrompt = findOriginalCampaignPrompt(history);
    const quickSend = brief?.flowMode === 'quick_send'
      || isQuickSendRequest(sourcePrompt)
      || isQuickSendRequest(lastUserText);
    if (!quickSend || !response) return response;

    if (response.type === 'content_plan' || response.type === 'suggest_content_plan') {
      // Only retype when FE can actually prepare/create — never fake confirm from {days,...}.
      if (isCampaignScriptShaped(response.data)) {
        return {
          ...response,
          type: 'confirm_create',
          data: { ...response.data, autoRun: false },
        };
      }
      return {
        type: 'text',
        content: response.content
          || 'Mình sẽ soạn một email gửi một lần. Bạn cho thêm nguồn khách (hoặc xác nhận các bước còn thiếu) nhé.',
        missing_fields: [],
        data: null,
      };
    }

    if (response.type === 'create_and_run') {
      if (EXPLICIT_CREATE_AND_RUN_RE.test(lastUserText) || EXPLICIT_CREATE_AND_RUN_RE.test(sourcePrompt)) {
        return response;
      }
      return {
        ...response,
        type: 'confirm_create',
        data: response.data && typeof response.data === 'object'
          ? { ...response.data, autoRun: false }
          : response.data,
      };
    }

    return response;
  }

  /**
   * `create_and_run` là do MODEL tự quyết (rà soát C P1-4): wizard đã chốt xong (khách DB ≤1000 / nhóm Zalo / Telegram mặc định
   * "mọi người từng nhắn") mà model hiểu sai hoặc bị câu trong tệp dẫn thì chiến dịch được tạo + chạy ngay, người dùng không
   * thấy nội dung lẫn bộ lọc. Cổng TẤT ĐỊNH cho MỌI luồng: chỉ giữ `create_and_run` khi tin GÕ TAY mới nhất của người dùng nói
   * rõ "tạo và chạy" / "chạy ngay chiến dịch"; không thì hạ về `confirm_create` (vẫn có thẻ xem trước + nút xác nhận).
   * Giữ lại cũng không chạy thẳng: FE hiện thẻ xác nhận với nút "Tạo và chạy" và chỉ chạy khi người dùng bấm.
   */
  _guardCreateAndRunExplicit(response, history = [], locale = 'vi') {
    if (response?.type !== 'create_and_run') return response;
    if (EXPLICIT_CREATE_AND_RUN_RE.test(lastHandTypedUserText(history))) return response;
    return {
      ...response,
      type: 'confirm_create',
      // Câu của model ("Đang tạo và chạy…") sẽ nói dối trên thẻ chờ xác nhận.
      content: locale === 'en'
        ? 'The campaign draft is ready. Review the preview below, then confirm to create it.'
        : 'Mình đã soạn xong chiến dịch. Bạn xem lại bản xem trước bên dưới rồi bấm xác nhận để tạo nhé.',
      data: response.data && typeof response.data === 'object'
        ? { ...response.data, autoRun: false }
        : response.data,
    };
  }

  /**
   * M2: manual recipient source must never auto-run without private directRecipients overlay.
   * Always downgrade to confirm_create so FE opens prepare + recipient overlay.
   */
  _guardManualRecipientsNoAutoRun(response, gates = null) {
    if (response?.type !== 'create_and_run') return response;
    const data = response.data && typeof response.data === 'object' ? response.data : null;
    const manualFromGate = gates?.dataSource === 'manual';
    const manualFromScript = data?.wizardDataSource === 'manual'
      || (Array.isArray(data?.nodes) && data.nodes.some((node) => {
        const config = node?.config || {};
        return config.recipientSource === 'manual' || config.zaloRecipientSource === 'manual';
      }));
    if (!manualFromGate && !manualFromScript) return response;
    return {
      ...response,
      type: 'confirm_create',
      data: data
        ? { ...data, autoRun: false, wizardDataSource: data.wizardDataSource || 'manual' }
        : { autoRun: false, wizardDataSource: 'manual' },
    };
  }

  /**
   * @param {number} userId chủ không gian
   * @param {number[]|null} [zaloAccessibleIds] tài khoản Zalo nhân viên ĐƯỢC GIAO (null = chủ, không lọc). `zaloAccessRestricted`
   *   báo cho cổng wizard biết danh sách đã bị lọc: id sender đã chọn mà không nằm trong danh sách này là KHÔNG hợp lệ (cổng
   *   không được coi "danh sách rỗng" là "id nào cũng hợp lệ" như với chủ chưa kết nối tài khoản nào).
   */
  async _getWizardResources(userId, zaloAccessibleIds = null) {
    if (!userId) return { zaloAccounts: [], emailSenders: [], courses: [], telegramAccounts: [], whatsappAccounts: [], zaloAccessRestricted: false };
    const [zaloAccounts, emailSenders, courses, adapterAccounts] = await Promise.all([
      aiPromptResources.getZaloAccountsFull(userId, zaloAccessibleIds),
      aiPromptResources.getActiveEmailSenders(userId),
      aiPromptResources.getCourses(userId),
      // P8a — rỗng khi cờ Telegram/WhatsApp tắt (không chạm DB/Baileys).
      aiPromptResources.getAdapterChannelAccounts(userId),
    ]);
    return {
      zaloAccounts,
      emailSenders,
      courses,
      telegramAccounts: adapterAccounts.telegram,
      whatsappAccounts: adapterAccounts.whatsapp,
      zaloAccessRestricted: Array.isArray(zaloAccessibleIds),
    };
  }

  /**
   * P8a — kênh adapter chỉ có MỘT tài khoản dùng được thì đó là tài khoản gửi mặc định (người dùng không phải
   * chọn); nhiều hơn/không có thì trả null (wizard nhả cho LLM hỏi / hướng dẫn kết nối).
   * @returns {Promise<string|number|null>}
   */
  async _resolveOnlyAdapterAccountId(ownerId, channel) {
    const accounts = await aiPromptResources.getAdapterChannelAccounts(ownerId);
    const usable = (channel === 'telegram' ? accounts.telegram : accounts.whatsapp).filter((a) => a.usable);
    return usable.length === 1 ? usable[0].id : null;
  }

  // mergedGates: state đã merge persisted + derived (bước wizard-state DB); nếu không
  // truyền thì tự derive từ history — tương đương behavior cũ.
  // Return { response, gateAsked } để caller persist meta dead-end.
  _guardWizardGates(response, history = [], resources = {}, locale = 'vi', mergedGates = null, isPlanTemplateTurn = false) {
    if (isPlanTemplateTurn) return { response, gateAsked: null };
    if (!shouldGuardCampaignResponse(response)) return { response, gateAsked: null };

    const state = { ...(mergedGates || extractWizardState(history)) };
    state.isCampaignFlow = true;
    state.channel ||= normalizeChannel(
      response?.data?.campaignType
      || response?.data?.channel
      || response?.data?.days?.[0]?.channel
      || response?.data?.days?.[0]?.slots?.[0]?.channel
    );

    const nextGate = evaluateNextGate(state, resources, locale);
    if (!nextGate && response?.type === 'content_plan') {
      return {
        response: {
          ...response,
          data: {
            ...(response.data || {}),
            requiresApproval: true,
          },
        },
        gateAsked: null,
      };
    }
    if (response?.type === 'content_plan' && nextGate?.gate === 'planApproved') {
      return {
        response: {
          ...response,
          data: {
            ...(response.data || {}),
            requiresApproval: true,
          },
        },
        gateAsked: 'planApproved',
      };
    }
    if (nextGate?.response) {
      return { response: nextGate.response, gateAsked: nextGate.gate || null };
    }
    return { response, gateAsked: null };
  }

  async processSmartChat({
    history = [],
    files = [],
    userId = null,
    resourceOwnerUserId = null,
    userRole = 'user',
    locale = 'vi',
    localeContext = null,
    model = null,
    persistedWizardState = null,
    intent = null,
    planSlotKey = null,
    helpRoute = null,
    routeSaysActionRequest = false,
    // PR-3 (LENH_GIAO_TRO_LY_AI_PR3_2026-09-28) Việc 2a — null = chủ/self (không chặn gì);
    // object = nhân viên, thiếu quyền khi permissions[key] !== true.
    employeePermissions = null,
    // C P3-3 — hàm async do controller truyền (trả kết quả checkUserResourceLimit cho tài nguyên `campaigns` hoặc null); không
    // truyền = không kiểm (spec, đường gọi khác). Service không tự chạm DB để cổng này không kéo theo hạ tầng vào mọi test.
    campaignSlotCheck = null,
    // PR-9 (B-4 / B-5 / C P2-5) — true = client MỚI tự gọi route sinh landing (luồng NDJSON, có tự kiểm hiển thị, nhận tệp của lượt)
    // nên lượt chat chỉ trả ý định `landing_page` + prompt đã chuẩn bị, KHÔNG sinh trang trong cùng request (trước đây runChat
    // ≤120 s + sinh ≤120 s nối tiếp → 524 Cloudflare, trừ credit khi khách không nhận được trang, logo/ảnh khách vừa gửi không
    // tới được trang). false = client cũ (tab chưa tải lại sau deploy) chưa biết gọi route sinh → giữ cách sinh trong lượt chat cũ
    // để không làm gãy; xoá nhánh này khi không còn client cũ.
    deferLandingGeneration = false,
  }) {
    let contextBlock = '';
    // Tenant resources (courses, templates, profile) belong to workspace owner;
    // chat metering/session stay on actor userId.
    const ownerId = resourceOwnerUserId || userId;
    const uiLocale = normalizeAssistantLocale(localeContext?.uiLocale || locale, 'vi');

    if (userRole === 'admin') {
      // Super admin: inject số liệu nền tảng real-time
      try {
        contextBlock = await buildAdminContext();
      } catch (e) {
        console.warn('[AI] Không lấy được admin context:', e.message);
      }

      const adminLocaleContext = localeContext || resolveAssistantLocaleContext({
        history,
        uiLocale,
        persistedConversationLocale: null,
        briefContentLocale: null,
      });
      const langInstr = buildAssistantLanguageInstructions(adminLocaleContext);
      const adminSystemPrompt = `Bạn là Founder AI AI - Trợ lý thông minh cho System Admin của nền tảng Founder AI, và chuyên phân tích tài liệu/dữ liệu doanh nghiệp.
Nhiệm vụ của bạn là phân tích số liệu, tư vấn chiến lược, trả lời câu hỏi về tình trạng hoạt động của nền tảng, và giải đáp/tổng hợp bất kỳ tài liệu nào được gửi kèm.

${contextBlock}

QUY TẮC:
- ${langInstr}
- Luôn dựa trên dữ liệu thực được cung cấp ở trên, không được bịa số liệu.
- Bạn hoàn toàn CÓ KHẢ NĂNG đọc, hiểu, phân tích, và tổng hợp thông tin từ bất kỳ tệp đính kèm nào (Word, Excel, PDF, CSV, hình ảnh, văn bản) mà người dùng gửi lên. Khi người dùng đính kèm tệp, nội dung của tệp đó đã được hệ thống trích xuất tự động và gắn kèm dưới dạng văn bản trực tiếp trong phần tin nhắn. Bạn hãy trả lời, phân tích, hoặc tổng hợp nội dung tệp theo đúng yêu cầu của người dùng.
- Trả lời súc tích, rõ ràng. Dùng bullet points khi liệt kê.
- Nếu người dùng hỏi về dữ liệu không có trong context (ví dụ: chi tiết từng user cụ thể), hãy nói rõ rằng bạn chỉ có số liệu tổng quan.
- Có thể đưa ra nhận xét, phân tích xu hướng, và gợi ý hành động dựa trên số liệu.

ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC JSON):
{
  "type": "text",
  "content": "Your answer here",
  "missing_fields": [],
  "data": null
}`;

      // 'all': hỏi-đáp nhiều lượt trên một tài liệu cần lại tệp cũ, mà nhánh admin không có brief để lưu bản trích (C P1-6:
      // tenant dùng mặc định 'current'). Super admin không xử lý danh sách người nhận của khách.
      return runChat({
        systemPrompt: adminSystemPrompt,
        history,
        files,
        userId,
        ownerUserId: ownerId,
        requestedModel: model,
        historyAttachments: 'all',
      });
    }

    // PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — nhân viên (userId ≠ chủ) chỉ thấy / được gợi ý tài khoản Zalo ĐƯỢC GIAO;
    // chủ → null. Một lần cho cả lượt: danh sách cho wizard, ngữ cảnh prompt và tài khoản mặc định đều theo đúng danh sách này.
    const zaloAccessibleIds = await resolveActorZaloAccessibleIds({ actorUserId: userId, ownerUserId: ownerId });
    const wizardResources = await this._getWizardResources(ownerId, zaloAccessibleIds);
    const lastUserText = lastUserMessageContent(history);

    // Wizard state: merge bản persist trong DB (sống sót qua reload) với bản derive
    // từ history của request này (marker tường minh luôn thắng).
    const persistedState = normalizeWizardState(persistedWizardState);
    const derivedState = extractWizardState(history, {
      routeSaysActionRequest,
      intent,
      abandonedAtMessageCount: persistedState.gates?.abandonedAtMessageCount,
      files,
    });
    const mergedGates = mergeWizardState(persistedState.gates, derivedState, { lastUserText });

    const isRevision = isContentPlanRevisionText(lastUserText);

    const hasAnyAttachedFile = Boolean(derivedState.hasAttachedFile);
    const hasAnyAttachedSpreadsheet = Boolean(derivedState.hasAttachedSpreadsheet);

    const campaignBriefContentLocale = isLandingOrientedTurn(history)
      ? null
      : (persistedState.brief?.contentLocale || null);
    let resolvedLocaleContext;
    if (localeContext) {
      resolvedLocaleContext = { ...localeContext };
      if (
        resolvedLocaleContext.contentLocaleSource !== 'explicit'
        && (campaignBriefContentLocale === 'vi' || campaignBriefContentLocale === 'en')
      ) {
        resolvedLocaleContext = {
          ...resolvedLocaleContext,
          contentLocale: campaignBriefContentLocale,
          contentLocaleSource: 'brief',
        };
      }
    } else {
      resolvedLocaleContext = resolveAssistantLocaleContext({
        history,
        uiLocale,
        persistedConversationLocale: persistedState.meta?.conversationLocale || null,
        briefContentLocale: campaignBriefContentLocale,
      });
    }
    // Cards / deterministic copy follow UI (locale arg); prose+artifact follow resolved context.
    const defaultContentLocale = resolvedLocaleContext.contentLocale;
    const conversationLocale = resolvedLocaleContext.conversationLocale;

    // PR-3 (LENH_GIAO_TRO_LY_AI_PR3_2026-09-28) Việc 2b — cổng tất định TRƯỚC khi gọi model: nhân
    // viên thiếu quyền bị từ chối ngay lượt đầu (không tốn credit, không dắt qua nhiều lượt hỏi
    // thêm rồi mới 403 ở nút tạo). Chủ/self (employeePermissions === null) không bao giờ bị chặn.
    if (employeePermissions !== null) {
      const missingPermission = (() => {
        if (derivedState.isCampaignFlow && employeePermissions.campaigns_create !== true) {
          return {
            key: 'campaigns_create',
            labelVi: 'Tạo chiến dịch',
            labelEn: 'Create campaigns',
            actionVi: 'dựng chiến dịch',
            actionEn: 'build the campaign',
          };
        }
        if (isLandingOrientedTurn(history) && employeePermissions.landing_pages !== true) {
          return {
            key: 'landing_pages',
            labelVi: 'Landing page',
            labelEn: 'Landing pages',
            actionVi: 'tạo landing page',
            actionEn: 'create the landing page',
          };
        }
        if (
          planSlotKey
          && employeePermissions.email_templates !== true
          && employeePermissions.zalo_templates !== true
        ) {
          return {
            key: 'email_templates,zalo_templates',
            labelVi: 'Mẫu tin nhắn',
            labelEn: 'Message templates',
            actionVi: 'lưu mẫu tin',
            actionEn: 'save the template',
          };
        }
        return null;
      })();

      if (missingPermission) {
        const empty = createEmptyWizardState();
        const deniedBrief = createEmptyCampaignBrief(defaultContentLocale);
        const content = uiLocale === 'en'
          ? `Your employee account doesn't have the "${missingPermission.labelEn}" permission yet, so I can't ${missingPermission.actionEn} for you right now. Ask your team owner to enable it in Settings › Employees ([see the guide](/huong-dan/nhan-vien)). In the meantime, I can still answer questions and draft content for you to review.`
          : `Tài khoản nhân viên của bạn chưa được cấp quyền "${missingPermission.labelVi}" nên mình chưa thể ${missingPermission.actionVi} giúp bạn. Bạn nhờ chủ nhóm vào Cài đặt › Nhân viên bật quyền này nhé ([xem hướng dẫn](/huong-dan/nhan-vien)). Trong lúc chờ, mình vẫn trả lời câu hỏi và soạn nội dung thử được.`;
        return {
          type: 'text',
          content,
          missing_fields: [],
          data: { permissionDenied: missingPermission.key },
          wizardShortCircuit: true,
          _wizard: {
            gates: empty.gates,
            brief: deniedBrief,
            gateAsked: null,
            meta: computeWizardMeta(persistedState.meta, null),
            planChanged: true,
            planReset: true,
          },
        };
      }
    }

    // C P3-3 — cổng hết suất chiến dịch, cùng khuôn cổng quyền ngay trên: tất định, TRƯỚC khi gọi model, không trừ credit
    // (wizardShortCircuit:true). Chỉ ở lượt MỞ luồng = lượt mà tin của người dùng chính là câu yêu cầu tạo chiến dịch (không phải
    // bấm thẻ wizard, không phải prompt máy của kế hoạch nhiều ngày, không phải câu về landing) — đi tiếp tới nút Tạo mới biết
    // hết suất là đường cụt tốn nhiều lượt AI. Mốc `latestCampaignMessageIndex === tin cuối` đúng cả khi router báo `làm_giúp`.
    if (
      typeof campaignSlotCheck === 'function'
      && derivedState.isCampaignFlow
      && derivedState.latestCampaignMessageIndex === history.length - 1
      && !planSlotKey
      && intent !== 'content_plan_request'
      && !isLandingOrientedTurn(history)
    ) {
      const slot = await campaignSlotCheck();
      if (slot && slot.allowed === false) {
        const limit = Number.isFinite(slot.limit) ? slot.limit : 0;
        const isEn = uiLocale === 'en';
        const content = limit === 0
          ? (isEn
            ? `Your current plan doesn't include campaigns, so I can't build one for you. You can upgrade your plan at [Billing](/app/billing) and ask me again. In the meantime, I can still answer questions and draft content for you to review.`
            : `Gói hiện tại của bạn chưa có tính năng tạo chiến dịch nên mình chưa thể dựng chiến dịch giúp bạn. Bạn nâng gói tại [Thanh toán](/app/billing) rồi nhờ mình lại nhé. Trong lúc chờ, mình vẫn trả lời câu hỏi và soạn nội dung thử được.`)
          : (isEn
            ? `You've used all ${limit}/${limit} campaign slots on your current plan, so I can't build a new campaign for you yet (you'd answer all my questions and only then be blocked at the Create button). Delete a campaign you no longer need, or upgrade your plan at [Billing](/app/billing), then ask me again. In the meantime, I can still answer questions and draft content for you to review.`
            : `Bạn đã dùng hết ${limit}/${limit} suất chiến dịch của gói hiện tại nên mình chưa thể dựng chiến dịch mới giúp bạn (nếu cứ đi tiếp, tới nút Tạo mới bị chặn và các lượt AI đã dùng là uổng). Bạn xoá bớt chiến dịch cũ không dùng nữa, hoặc nâng gói tại [Thanh toán](/app/billing), rồi nhờ mình lại nhé. Trong lúc chờ, mình vẫn trả lời câu hỏi và soạn nội dung thử được.`);
        const empty = createEmptyWizardState();
        return {
          type: 'text',
          content,
          missing_fields: [],
          data: { limitReached: 'campaigns', limit },
          wizardShortCircuit: true,
          _wizard: {
            gates: empty.gates,
            brief: createEmptyCampaignBrief(defaultContentLocale),
            gateAsked: null,
            meta: computeWizardMeta(persistedState.meta, null),
            planChanged: true,
            planReset: true,
          },
        };
      }
    }

    const sourcePrompt = findOriginalCampaignPrompt(history);
    const extracted = extractCampaignBriefFromHistory(history);
    let resolvedBriefContext = '';
    // Sản phẩm catalog đã giải từ brief (tên/giá/mô tả) — slot filling Zalo nhóm cần để viết đúng sản phẩm khách chọn.
    let resolvedBriefProducts = [];
    let briefStale = false;
    let briefForState;
    let contentLocaleNeedsPlanReset = false;

    let extractedAttachedFile = null;
    if (Array.isArray(files) && files.length > 0) {
      // Ưu tiên tài liệu chứa văn bản (.pdf, .docx, .txt...) trước ảnh để trích xuất brief đầy đủ
      const sortedFiles = [...files].sort((a, b) => {
        const aIsImg = String(a?.contentType || '').toLowerCase().startsWith('image/');
        const bIsImg = String(b?.contentType || '').toLowerCase().startsWith('image/');
        if (aIsImg && !bIsImg) return 1;
        if (!aIsImg && bIsImg) return -1;
        return 0;
      });

      for (const file of sortedFiles) {
        const hasId = file?.tempId || file?.storage_key || file?.storageKey;
        if (!hasId) continue;
        const mimeType = String(file.contentType || '').toLowerCase();
        if (mimeType.startsWith('image/')) {
          if (!extractedAttachedFile) {
            extractedAttachedFile = {
              originalName: file.originalName,
              contentType: file.contentType,
              text: '',
              isImage: true,
              hasProductData: null,
              summary: 'Ảnh — nội dung do AI đọc trực tiếp',
              userConfirmed: false,
              extractedAt: new Date().toISOString(),
            };
          }
          continue;
        }
        try {
          let buffer = null;
          if (file.tempId) {
            // eslint-disable-next-line no-await-in-loop
            buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
          } else if (file.storage_key || file.storageKey) {
            // Khoá do CLIENT gửi: chỉ đọc tệp của chủ workspace (C P1-1); khoá lạ ném 403 → catch bên dưới log + bỏ qua tệp.
            // eslint-disable-next-line no-await-in-loop
            buffer = await uploadController.readFileBufferByKey(
              assertOwnedStorageKey(file.storage_key || file.storageKey, ownerId),
            );
          }
          if (buffer) {
            // eslint-disable-next-line no-await-in-loop
            const fullText = await extractTextFromBuffer(buffer, file.originalName, file.contentType);
            if (fullText && fullText.trim()) {
              const isTruncated = fullText.length > MAX_STORED_FILE_TEXT_CHARS;
              const truncatedText = isTruncated ? fullText.slice(0, MAX_STORED_FILE_TEXT_CHARS) : fullText;
              const suitability = analyzeFileSuitability(truncatedText, file.originalName);
              extractedAttachedFile = {
                originalName: file.originalName,
                contentType: file.contentType,
                text: truncatedText,
                truncated: isTruncated,
                totalCharCount: fullText.length,
                extractedAt: new Date().toISOString(),
                hasProductData: suitability.hasProductData,
                summary: suitability.summary,
                userConfirmed: false,
              };
              break;
            }
          }
        } catch (err) {
          console.warn(`[AI] Could not extract text from file ${file.tempId || file.storage_key || file.storageKey}:`, err.message);
        }
      }
    }

    if (extracted.invalid) {
      // Latest marker authoritative — never fall back to older/persisted brief facts.
      briefForState = clearCampaignBriefProductFacts({
        contentMode: extracted.preferredContentMode,
        contentLocale: defaultContentLocale,
      });
    } else {
      const mergedBrief = mergeCampaignBrief(persistedState.brief, extracted.brief, {
        defaultContentLocale,
      });
      if (!mergedBrief.contentLocale) {
        mergedBrief.contentLocale = defaultContentLocale;
      }
      briefForState = mergedBrief;
    }

    if (extractedAttachedFile) {
      briefForState = {
        ...briefForState,
        attachedFile: extractedAttachedFile,
        hasAttachedFile: true,
      };
    } else if (persistedState.brief?.attachedFile) {
      const existing = persistedState.brief.attachedFile;
      const userConfirms = isUserConfirmingFile(lastUserText);
      briefForState = {
        ...briefForState,
        attachedFile: {
          ...existing,
          userConfirmed: existing.userConfirmed || userConfirms,
        },
        hasAttachedFile: true,
      };
    } else if (hasAnyAttachedFile && briefForState) {
      briefForState = { ...briefForState, hasAttachedFile: true };
    }

    // Explicit artifact-language directive updates brief content locale before resolve/gates.
    if (resolvedLocaleContext.contentLocaleSource === 'explicit' && briefForState) {
      const beforeLocale = briefForState.contentLocale || persistedState.brief?.contentLocale || null;
      const nextLocale = resolvedLocaleContext.contentLocale;
      if (beforeLocale !== nextLocale) {
        contentLocaleNeedsPlanReset = Boolean(
          persistedState.plan?.snapshot || mergedGates.hasContentPlan
        );
      }
      briefForState = { ...briefForState, contentLocale: nextLocale };
    }

    // PR-B quick-send: once schedule + optional inferred brief; multi-day already excluded.
    // Latest free-text campaign intent from extractWizardState wins over older quick-send.
    const quickSendActive = derivedState.latestIntentIsQuickSend === true;
    const intentPrompt = sourcePrompt || lastUserText;

    if (quickSendActive) {
      const scheduleFromMarker = Array.isArray(derivedState.markerGates)
        && derivedState.markerGates.includes('schedule');
      if (!scheduleFromMarker) {
        mergedGates.schedule = { mode: 'once' };
      }
      if (!mergedGates.channel) {
        mergedGates.channel = inferQuickSendChannel(intentPrompt);
      }
      briefForState = {
        ...(briefForState || createEmptyCampaignBrief(defaultContentLocale)),
        flowMode: 'quick_send',
      };
      if (!extracted.invalid && !isCampaignBriefReady(briefForState)) {
        const inferred = inferCampaignBriefFromText(intentPrompt, wizardResources.courses);
        if (inferred) {
          briefForState = mergeCampaignBrief(
            briefForState,
            { ...inferred, flowMode: 'quick_send', contentLocale: defaultContentLocale },
            { defaultContentLocale }
          );
          if (!briefForState.contentLocale) {
            briefForState.contentLocale = defaultContentLocale;
          }
        }
      }
      if (!briefForState.contentLocale) {
        briefForState.contentLocale = defaultContentLocale;
      }
    } else if (derivedState.latestIntentIsQuickSend === false && briefForState?.flowMode === 'quick_send') {
      // Explicit non-quick latest intent (e.g. switched to drip) — reset sticky flowMode.
      // latestIntentIsQuickSend === null (marker-only / truncated history) must keep persisted quick_send.
      briefForState = { ...briefForState, flowMode: 'standard' };
      if (!derivedState.markerGates?.includes('schedule')) {
        mergedGates.schedule = derivedState.schedule ?? mergedGates.schedule;
      }
    }

    if (!extracted.invalid && isCampaignBriefReady(briefForState)) {
      try {
        const resolved = await resolveCampaignBrief({
          brief: briefForState,
          ownerUserId: ownerId,
          sourcePrompt,
          catalogCourses: wizardResources.courses,
        });
        briefForState = resolved.brief;
        if (quickSendActive) briefForState.flowMode = 'quick_send';
        resolvedBriefContext = resolved.briefContext;
        resolvedBriefProducts = Array.isArray(resolved.resolvedProducts) ? resolved.resolvedProducts : [];
      } catch (e) {
        if (
          e.code === 'CAMPAIGN_PRODUCT_NOT_FOUND'
          || e.code === 'CAMPAIGN_BRIEF_INVALID'
          || e.code === 'CAMPAIGN_PRODUCT_NAME_REQUIRED'
          || e.code === 'CAMPAIGN_TOPIC_REQUIRED'
        ) {
          briefStale = e.code === 'CAMPAIGN_PRODUCT_NOT_FOUND';
          briefForState = clearCampaignBriefProductFacts(briefForState);
          if (quickSendActive) briefForState.flowMode = 'quick_send';
        } else {
          throw e;
        }
      }
    }

    // Keep brief off gates (top-level _wizard.brief only); pass a copy into evaluator.
    const gatesForPersist = { ...mergedGates };
    delete gatesForPersist.brief;

    if (
      gatesForPersist.dataSource === 'sheet' &&
      gatesForPersist.sheetUrl &&
      gatesForPersist.sheetCheck?.url !== gatesForPersist.sheetUrl
    ) {
      const channel = normalizeChannel(gatesForPersist.channel);
      const check = await checkSheetForChannel(gatesForPersist.sheetUrl, channel);
      if (check?.status && check.status !== 'unknown') {
        gatesForPersist.sheetCheck = check;
      }
    }

    const marker = isWizardMarkerMessage(lastUserText) ? parseWizardMarker(lastUserText) : null;
    const briefMarkerJustSet = marker?.gate === 'campaignBrief';
    const hadPlanBeforeBriefMarker = Boolean(
      gatesForPersist.hasContentPlan || persistedState.plan?.snapshot
    );
    const semanticBriefNeedsPlanReset = Boolean(
      contentLocaleNeedsPlanReset || (briefMarkerJustSet && hadPlanBeforeBriefMarker)
    );
    if (semanticBriefNeedsPlanReset) {
      gatesForPersist.hasContentPlan = false;
      gatesForPersist.planApproved = false;
    }

    const hasEffectiveAttachedFile = Boolean(hasAnyAttachedFile || briefForState?.attachedFile?.text);
    const gateState = {
      ...gatesForPersist,
      brief: briefForState,
      hasAttachedFile: hasEffectiveAttachedFile,
      hasAttachedSpreadsheet: hasAnyAttachedSpreadsheet,
    };

    // Đóng gói state cho controller persist (field nội bộ, bị strip trước khi trả client)
    const buildWizard = (gateAsked, planChange = null) => ({
      gates: gatesForPersist,
      brief: briefForState,
      gateAsked,
      meta: computeWizardMeta(persistedState.meta, gateAsked),
      ...(planChange
        || (isRevision || semanticBriefNeedsPlanReset
          ? { planChanged: true, planReset: true }
          : { planChanged: false })),
    });

    const gateResources = {
      ...wizardResources,
      briefStale,
      briefPreferredContentMode: briefForState?.contentMode || null,
      hasAttachedFile: hasEffectiveAttachedFile,
      hasAttachedSpreadsheet: hasAnyAttachedSpreadsheet,
    };
    // Rà soát C P2-7 — cổng chọn landing cần danh sách landing + số lead: chỉ tải khi cổng thực sự có thể hỏi (nguồn landing, Email/
    // Zalo cá nhân, chưa có lựa chọn). `null` (tra lỗi) được cổng coi là "chưa biết" và chặn, không phải "không có landing nào".
    if (
      gatesForPersist.isCampaignFlow
      && gatesForPersist.dataSource === 'landing'
      && (gatesForPersist.channel === 'email' || gatesForPersist.channel === 'zalo')
      && !hasLandingLeadsSelection(gatesForPersist)
    ) {
      gateResources.landingPicker = await aiPromptResources.getLandingPickerOptions(ownerId);
    }

    // Free-text cancel must beat deterministic re-ask (dead-end nudge says "gõ huỷ").
    if (
      gatesForPersist.isCampaignFlow
      && isPlanCancelText(lastUserText)
      && !isWizardMarkerMessage(lastUserText)
      && !planSlotKey
    ) {
      const empty = createEmptyWizardState();
      briefForState = createEmptyCampaignBrief(defaultContentLocale);
      return {
        type: 'text',
        content: conversationLocale === 'en'
          ? 'Stopped. The campaign wizard was cleared. Tell me if you want to start a new campaign.'
          : 'Đã dừng. Wizard chiến dịch đã được xoá. Bạn muốn bắt đầu chiến dịch mới thì cứ nói nhé.',
        missing_fields: [],
        data: null,
        wizardShortCircuit: true,
        _wizard: {
          gates: empty.gates,
          brief: briefForState,
          gateAsked: null,
          meta: computeWizardMeta(persistedState.meta, null),
          planChanged: true,
          planReset: true,
        },
      };
    }

    // Deterministic gates before Gemini for any campaign-flow turn (marker or free-text).
    // Guard: if this turn is landing-page-oriented, skip the campaign wizard gate entirely.
    // The AI will produce ask_landing_details or landing_page instead.
    if (gatesForPersist.isCampaignFlow
      && !planSlotKey
      && !isLandingOrientedTurn(history)) {
      const nextGate = evaluateNextGate(gateState, gateResources, locale);
      if (nextGate?.response) {
        const _wizard = buildWizard(nextGate.gate || null);
        return {
          ...withDeadEndNudge(nextGate.response, _wizard.meta, nextGate.gate || null, locale),
          wizardShortCircuit: true,
          _wizard,
        };
      }

      if (marker?.gate === 'schedule' && gatesForPersist.schedule?.mode === 'drip') {
        const basePrompt = findOriginalCampaignPrompt(history);
        return {
          type: 'suggest_content_plan',
          content: locale === 'en'
            ? 'Next I will draft a day-by-day sending plan for you.'
            : 'Tiếp theo mình sẽ lên kế hoạch gửi theo từng ngày cho bạn.',
          data: {
            userPrompt: buildCampaignPromptWithWizardState(
              gatesForPersist,
              basePrompt,
              locale,
              resolvedBriefContext
            ),
          },
          missing_fields: [],
          wizardShortCircuit: true,
          _wizard: buildWizard(null),
        };
      }
    }

    // Thu thập existing resources cho non-admin users (theo workspace owner)
    let existingResources = '';
    let landingPages = [];
    let forms = [];
    let firstZaloAccountId = null;
    if (ownerId) {
      try {
        const [emailTemplates, zaloAccounts, zaloGroups, zaloTemplates, recommendedType, customerStats, courses, _landingPages, _forms] =
          await Promise.all([
            aiPromptResources.getEmailTemplates(ownerId),
            aiPromptResources.getZaloAccounts(ownerId, zaloAccessibleIds),
            aiPromptResources.getZaloGroups(ownerId, zaloAccessibleIds),
            aiPromptResources.getZaloTemplates(ownerId),
            aiPromptResources.getRecommendedCampaignType(ownerId, zaloAccessibleIds),
            aiPromptResources.getCustomerStats(ownerId),
            aiPromptResources.getCourses(ownerId),
            aiPromptResources.getLandingPages(ownerId),
            aiPromptResources.getForms(ownerId),
          ]);

        landingPages = _landingPages;
        forms = _forms;
        const connectedZaloAccount = zaloAccounts.find(
          (a) => (a.status === 'connected' || !a.status) && a.isActive !== false && a.is_active !== false
        );
        firstZaloAccountId = connectedZaloAccount?.id ?? null;

        existingResources = `
=== TÀI NGUYÊN CÓ SẴN (được tải mới từ hệ thống tại thời điểm tin nhắn này — luôn phản ánh trạng thái hiện tại) ===
Kênh phù hợp: ${recommendedType === 'email' ? 'Email (B2B)' : recommendedType === 'zalo' ? 'Zalo (B2C)' : 'Đa kênh'}

📊 KHÁCH HÀNG TRONG DB:
- Tổng: ${customerStats.total} | Có email: ${customerStats.hasEmail} | Có Zalo/phone: ${customerStats.hasZalo}

📚 Khóa học / Sản phẩm (dùng id trong interestedCourseIds / notPurchasedCourseIds):
${courses.length > 0 ? courses.map(c => `  - ID: ${c.id} | "${c.name}"`).join('\n') : '  (chưa có khóa học trong hệ thống)'}

📧 Email Templates (emailTemplateId):
${emailTemplates.length > 0 ? emailTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Subject: ${t.subject}`).join('\n') : '  (chưa có — tự soạn nội dung inline)'}

💬 Zalo Message Templates (templateId trong zaloPersonalTemplateSteps):
${zaloTemplates.length > 0 ? zaloTemplates.map(t => `  - ID: ${t.id} | "${t.name}" | Preview: ${t.bodyText.slice(0, 80)}...`).join('\n') : '  (chưa có — dùng message inline)'}

🔑 Zalo Accounts (zaloAccountId):
${zaloAccounts.length > 0 ? zaloAccounts.map(a => `  - ID: ${a.id} | ${a.displayName}`).join('\n') : '  (chưa kết nối — đặt null)'}
Tài khoản Zalo mặc định: ${firstZaloAccountId ?? 'null'}${await aiPromptResources.getAdapterAccountsPromptBlock(ownerId)}

${zaloGroups.length > 0 ? `👥 Nhóm Zalo:\n${zaloGroups.map(g => `  - "${g.groupName}"`).join('\n')}` : ''}

🌐 Landing Pages (landingLeadsSlugs — dùng để lọc leads trong read_landing_leads):
${landingPages.length > 0 ? landingPages.map(lp => `  - slug: "${lp.slug}" | "${lp.title}"${lp.isPublished ? '' : ' (chưa publish)'}${lp.formId ? ` — trang này thu người đăng ký bằng Biểu mẫu formId=${lp.formId}, dùng data/read_form_submissions thay vì read_landing_leads` : ''}`).join('\n') : '  (chưa có landing page nào)'}

📝 Biểu mẫu (formId — dùng trong read_form_submissions, lấy người đã nộp và ĐỒNG Ý nhận tin):
${forms.length > 0 ? forms.map(f => `  - id: ${f.id} | "${f.title}"${f.consentEnabled ? ` (${f.consentedCount} người đã đồng ý)` : ' (form CHƯA hỏi đồng ý nhận tin — node sẽ không có ai)'}`).join('\n') : '  (chưa có biểu mẫu nào xuất bản)'}

NODE TYPES THỰC SỰ TỒN TẠI trong hệ thống (chỉ dùng các loại này):
• trigger/manual — điểm khởi đầu
• data/interested_customers — lấy khách từ DB (config: interestedCustomerType, interestedLimit, interestedCourseIds, notPurchasedCourseIds)
  - interestedCustomerType: "interested"=chưa mua | "purchased"=đã mua | "both"=tất cả
  - interestedCourseIds: [id1, id2] → chỉ lấy khách liên quan đến khóa học này
  - notPurchasedCourseIds: [id1, id2] → loại trừ khách ĐÃ mua các khóa này
• data/read_sheet — đọc Google Sheet (config: sheetUrl BẮT BUỘC)
• data/read_landing_leads — lấy leads từ landing page (config: landingLeadsSlugs: ["slug"] — lấy từ danh sách Landing Pages trong TÀI NGUYÊN)
• data/read_form_submissions — lấy người đã nộp biểu mẫu và ĐỒNG Ý nhận tin (config: formId — lấy từ danh sách Biểu mẫu trong TÀI NGUYÊN)
• data/select_zalo_account — chọn TK Zalo (BẮT BUỘC trong MỌI chiến dịch Zalo, đặt trước node gửi)
• data/get_all_friends — lấy danh sách bạn bè
• data/get_all_groups — lấy danh sách nhóm
• data/save_customer — lưu khách hàng
• action/send_email — gửi email (recipientSource, recipientNodeId, recipientField: "email", delayValue, delayUnit)
• action/send_zalo_personal — gửi Zalo cá nhân (zaloAccountId, zaloRecipientSource, zaloRecipientNodeId, zaloRecipientField: "phone"|"uid", delayValue, delayUnit)
• action/send_zalo_group — gửi Zalo nhóm (zaloAccountId, zaloGroupSource: "node", zaloGroupNodeId, zaloGroupField: "groupId", zaloGroupMessage, delayValue, delayUnit)
• action/send_zalo_friend_request — gửi lời mời kết bạn${aiPromptResources.getAdapterNodeTypesPromptLines()}${aiPromptResources.getBlockedZaloPromptNotice()}
• end/end — kết thúc

DELAY: KHÔNG tạo node wait/delay riêng. Delay đặt trong delayValue+delayUnit của action node tiếp theo.
DELAY ĐƠN VỊ (bắt buộc chuyển đúng):
- User nói "X phút" → delayValue: X, delayUnit: "minutes"
- User nói "X giờ" → delayValue: X, delayUnit: "hours"
- User nói "X ngày" → delayValue: X, delayUnit: "days"
- KHÔNG làm tròn "3 giờ" thành "1 ngày" hay "0 ngày"

ZALO NHÓM — LỌC THEO TÊN NHÓM:
- Hệ thống KHÔNG thể lọc nhóm theo tên trong node config
- CHỈ KHI zaloGroupIds ở phần ngữ cảnh RỖNG mà user đề cập tên nhóm cụ thể (vd: "nhóm Học viên K2023") → tạo chiến dịch bình thường với get_all_groups, thêm vào description: "⚠️ Vào Campaign Builder → node get_all_groups → chọn đúng nhóm '[tên nhóm]' trước khi chạy", và zaloSelectedGroupIds: [] (để trống, user tự chọn trong UI)
- zaloGroupIds ĐÃ CÓ giá trị (user đã chọn nhóm trong wizard) → KHÔNG thêm cảnh báo trên vào description; dùng đúng danh sách theo quy tắc ở phần ngữ cảnh

Luồng Zalo cá nhân ĐÚNG: trigger→select_zalo_account→interested_customers→send_zalo_personal (hoặc trigger→select_zalo_account→send_zalo_personal khi dataSource="zalo_contacts"). Luồng Zalo nhóm ĐÚNG: trigger→select_zalo_account→get_all_groups→send_zalo_group (KHÔNG dùng interested_customers cho nhóm hay cho danh bạ Zalo cá nhân).
`;
      } catch (e) {
        console.warn('[AI] Không lấy được existing resources:', e.message);
      }
    }

    // Luôn dùng full profile để AI thấy tất cả sản phẩm/thông tin mới nhất (workspace owner)
    if (ownerId) {
      try {
        contextBlock = await businessProfileService.getFormattedProfileForPrompt(ownerId);
      } catch (e) {
        console.warn('[AI] Không lấy được business profile:', e.message);
      }
    }

    let wizardContext = '';
    if (mergedGates && (mergedGates.channel || mergedGates.senderAccountId || mergedGates.dataSource || mergedGates.schedule)) {
      const lines = ['=== WIZARD ĐÃ CHỐT (BẮT BUỘC TUÂN THỦ) ==='];
      if (mergedGates.channel) {
        lines.push(`- channel: "${mergedGates.channel}"`);
      }
      if (mergedGates.senderAccountId) {
        if (mergedGates.channel === 'zalo' || mergedGates.channel === 'zalo_group') {
          lines.push(`- zaloSenderAccountId: ${mergedGates.senderAccountId} (BẮT BUỘC dùng ID này cho select_zalo_account.zaloAccountId và mọi node Zalo; KHÔNG dùng firstZaloAccountId khi có giá trị này)`);
        } else if (mergedGates.channel === 'email') {
          lines.push(`- emailSenderId: ${mergedGates.senderAccountId} (dùng ID này cho fromEmailId)`);
        }
      }
      if (mergedGates.dataSource) {
        lines.push(`- dataSource: "${mergedGates.dataSource}"`);
        if (mergedGates.dataSource === 'zalo_contacts') {
          const friendCount = Array.isArray(mergedGates.zaloFriendIds) ? mergedGates.zaloFriendIds.length : 0;
          lines.push(`- zaloFriendCount: ${friendCount}`);
        }
      }
      // Rà soát C P2-7: landing người dùng ĐÃ CHỌN ở cổng `landingLeads` — slug do hệ thống ghi, model không được tự chọn/để trống.
      if (Array.isArray(mergedGates.landingLeadsSlugs) && mergedGates.landingLeadsSlugs.length > 0) {
        lines.push(`- landingLeadsSlugs: [${mergedGates.landingLeadsSlugs.map((slug) => JSON.stringify(slug)).join(', ')}] (BẮT BUỘC dùng ĐÚNG mảng này cho config.landingLeadsSlugs của read_landing_leads; KHÔNG để trống, KHÔNG thêm slug khác)`);
      } else if (mergedGates.landingLeadsAll) {
        lines.push('- landingLeadsAll: true (người dùng đã CHỌN TẤT CẢ landing → read_landing_leads với config.landingLeadsSlugs: [])');
      }
      // C P1-6: thông tin về Google Sheet người nhận do HỆ THỐNG đọc tất định (checkSheetForChannel ở trên) — thay cho việc đính
      // 300 dòng tên/SĐT/email khách cuối vào prompt rồi bắt model tự đọc cột / đếm. Chỉ tên cột + số liệu, không có dòng dữ liệu.
      const sheetCheckForPrompt = gatesForPersist.sheetCheck;
      if (
        sheetCheckForPrompt?.status === 'ok'
        && gatesForPersist.sheetUrl
        && sheetCheckForPrompt.url === gatesForPersist.sheetUrl
      ) {
        const headerText = (Array.isArray(sheetCheckForPrompt.headers) ? sheetCheckForPrompt.headers : [])
          .slice(0, 20)
          .map((h) => JSON.stringify(String(h ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)))
          .join(', ');
        lines.push(
          `- sheetRecipients: hệ thống đã đọc Google Sheet người nhận ${gatesForPersist.sheetUrl} — nội dung bảng KHÔNG gửi cho bạn (dữ liệu cá nhân của khách): ${sheetCheckForPrompt.emailCount || 0} email hợp lệ, ${sheetCheckForPrompt.phoneCount || 0} SĐT hợp lệ${headerText ? `; các cột: ${headerText}` : ''}. Chỉ dùng đúng các số này khi nói về số người nhận; KHÔNG tự đếm, KHÔNG đoán, KHÔNG chép tên/SĐT/email người nhận.`,
        );
      }
      if (mergedGates.schedule) {
        if (mergedGates.schedule.mode === 'drip') {
          lines.push(`- schedule: drip (${mergedGates.schedule.days || 3} ngày, ${mergedGates.schedule.slotsPerDay || 1} tin/ngày)`);
        } else if (mergedGates.schedule.mode === 'once') {
          lines.push('- schedule: once (gửi 1 lần)');
        }
      }
      wizardContext = lines.join('\n') + '\n\n';
    }

    // PR-3 (LENH_GIAO_TRO_LY_AI_PR3_2026-09-28) Việc 2c — lưới mềm cho ca tất định 2b không bắt
    // được (vd "chạy chiến dịch X" cần campaigns_run). Chủ/self (null) không chèn gì.
    let employeePermissionsBlock = '';
    if (employeePermissions !== null) {
      const ALL_EMPLOYEE_PERMISSION_KEYS = ['campaigns_create', 'campaigns_run', 'landing_pages', 'email_templates', 'zalo_templates'];
      const missingKeys = ALL_EMPLOYEE_PERMISSION_KEYS.filter((key) => employeePermissions[key] !== true);
      const missingText = missingKeys.length > 0 ? missingKeys.join(', ') : 'đủ 5 quyền trên';
      employeePermissionsBlock = `=== QUYỀN NHÂN VIÊN ===
- Người dùng là NHÂN VIÊN của chủ nhóm. KHÔNG có quyền: ${missingText}
- Khi họ muốn làm việc thuộc quyền thiếu → type: "text", nói thẳng chưa có quyền và hướng nhờ chủ nhóm cấp; KHÔNG dẫn qua các bước hỏi thêm.

`;
    }

    const langInstr = buildAssistantLanguageInstructions(resolvedLocaleContext);
    const systemPrompt = `Bạn là Founder AI Coworker - Trợ lý Marketing thông minh, chuyên hỗ trợ tạo template tin nhắn, chiến dịch marketing, landing page, và phân tích tài liệu/dữ liệu doanh nghiệp.

## NGÔN NGỮ:
- ${langInstr}
- Field inventory: ASSISTANT PROSE = top-level response "content", free-form ask_more questions, help-style explanations. CUSTOMER ARTIFACTS = email subject/bodyHtml/bodyText, Zalo message text, landing HTML/copy, content_plan day/slot summaries and template bodies, campaign script message bodies. Do NOT treat every JSON key named "content" as customer artifact — top-level response content is assistant prose.

## NGUYÊN TẮC QUAN TRỌNG NHẤT:
- HỒ SƠ DOANH NGHIỆP VÀ TÀI NGUYÊN bên dưới được hệ thống TẢI TRỰC TIẾP TỪ DATABASE ngay trước mỗi tin nhắn — luôn phản ánh trạng thái MỚI NHẤT. Khi user nói "tôi vừa thêm sản phẩm", "tôi vừa cập nhật hồ sơ", v.v., hãy XÁC NHẬN bạn thấy thông tin đó trong phần hồ sơ bên dưới. KHÔNG BAO GIỜ nói "tôi không thể đọc thay đổi mới" hoặc "hồ sơ của tôi là thông tin cũ".
- KHÔNG BAO GIỜ tự bịa thông tin về sản phẩm, doanh nghiệp, tên công ty, giá cả, khuyến mãi.
- KHÔNG ĐƯỢC khẳng định đã chọn tài khoản gửi, đã tạo, hay đã gửi bất cứ thứ gì trong tin nhắn văn xuôi (type: "text"). Bạn không có công cụ gửi tin trực tiếp từ câu trả lời tự do.
- Gặp ý định gửi tin/tạo chiến dịch khi chưa qua wizard, hãy mời người dùng vào luồng hoặc hướng dẫn chọn kênh/tạo chiến dịch bằng câu ngắn, KHÔNG tự dựng quy trình bằng văn xuôi hay bịa tên tài khoản cụ thể (ví dụ: "thông qua tài khoản X có sẵn").
- Nếu có khối CAMPAIGN_BRIEF DATA: đó là nguồn sự thật về sản phẩm/chủ đề đã chọn. Ưu tiên (1) CAMPAIGN_BRIEF DATA → (2) prompt nguyên bản + file đính kèm → (3) hồ sơ doanh nghiệp chỉ cho brand/tone/context, KHÔNG thay selected product/topic.
- QUAN TRỌNG: LUÔN ƯU TIÊN lấy thông tin từ tệp đính kèm (như file danh sách sản phẩm, báo giá...) hoặc nội dung tin nhắn do người dùng gửi. Hồ sơ doanh nghiệp chỉ dùng để tham khảo thêm, tuyệt đối KHÔNG ĐƯỢC lấy sản phẩm từ hồ sơ doanh nghiệp đè lên hoặc thay thế thông tin sản phẩm người dùng vừa cung cấp.
- Bạn hoàn toàn CÓ KHẢ NĂNG đọc, hiểu, phân tích, và tổng hợp thông tin từ bất kỳ tệp đính kèm nào (Word, Excel, PDF, CSV, hình ảnh, văn bản) mà người dùng gửi lên. Khi người dùng đính kèm tệp ở TIN HIỆN TẠI, nội dung của tệp đó đã được hệ thống trích xuất tự động và gắn kèm dưới dạng văn bản trực tiếp trong phần tin nhắn. Bạn hãy trả lời, phân tích, hoặc tổng hợp nội dung tệp theo đúng yêu cầu của người dùng. NGOẠI LỆ: DANH SÁCH NGƯỜI NHẬN (bảng tính có email/SĐT khách, khi nguồn người nhận là Excel/Google Sheet) — hệ thống KHÔNG gắn nội dung bảng mà chỉ gắn khối tóm tắt "[Danh sách người nhận — …]" (số email/SĐT hợp lệ, tên cột, vài dòng ĐÃ CHE); đó là toàn bộ thông tin bạn có về danh sách, đừng đòi xem thêm dòng dữ liệu. Từ các lượt SAU hệ thống KHÔNG gửi lại nội dung tệp hay liên kết Google cũ (có thể chứa dữ liệu cá nhân của khách): chỉ dựa vào những gì đã nêu trong hội thoại và khối CAMPAIGN_BRIEF; không đoán nội dung, cần xem lại thì đề nghị người dùng đính kèm lại ở tin mới. Nếu tệp đính kèm có thông tin không rõ ràng, thiếu thông tin quan trọng, hoặc bạn không đọc được nội dung (do lỗi font, sai định dạng...), BẠN BẮT BUỘC PHẢI nói rõ lỗi nằm ở đâu và hướng dẫn người dùng cách chỉnh sửa lại file cho đúng chuẩn.
${UNTRUSTED_CONTENT_RULE}
- Nếu người dùng yêu cầu phân tích/tổng hợp thông tin chung hoặc thảo luận không liên quan trực tiếp đến việc tạo chiến dịch/template, hãy trả lời với type: "text" và đưa ra nội dung phân tích/tổng hợp đầy đủ, chi tiết và chuyên nghiệp trong trường "content".
- Nếu thiếu thông tin cần thiết để tạo template/chiến dịch/landing page → type: "ask_more", hỏi cụ thể những gì còn thiếu.
- Chỉ tạo nội dung template/chiến dịch/landing page khi đã có đủ thông tin từ người dùng.
- Với yêu cầu tạo chiến dịch, KHÔNG tự suy đoán nguồn khách hàng là Google Sheet chỉ vì user nhắc các cột như full_name, email, phone, tour_name, end_date. Nếu user chưa nói rõ "Google Sheet", "Excel", "file", "landing page", "khách hàng trong hệ thống/database" hoặc chưa chọn dataSource trong câu trả lời trước, BẮT BUỘC dùng type="ask_campaign_details" và hỏi câu "dataSource".

${wizardContext}${employeePermissionsBlock}${resolvedBriefContext ? resolvedBriefContext + '\n\n' : ''}${contextBlock ? contextBlock + '\n\n' : ''}${existingResources ? existingResources + '\n\n' : ''}## PHÂN LOẠI Ý ĐỊNH (intent):

### 1. type: "text"
Khi người dùng: chào hỏi, hỏi thông tin chung, thảo luận không liên quan đến tạo nội dung.

### 2. type: "ask_more"
Khi người dùng muốn tạo template/chiến dịch/landing page NHƯNG THIẾU thông tin:

Thông tin cần có để viết TEMPLATE EMAIL:
- Tên doanh nghiệp / sản phẩm / dịch vụ
- Mục tiêu email (chào mừng, khuyến mãi, nhắc nhở, thông báo...)
- Tông giọng (chuyên nghiệp, thân thiện, khẩn cấp...)
- Thông tin ưu đãi hoặc nội dung chính muốn truyền đạt

Thông tin cần có để viết TEMPLATE ZALO:
- Tên doanh nghiệp / sản phẩm / dịch vụ
- Mục tiêu tin nhắn
- Nội dung chính (ngắn gọn, dưới 4000 ký tự)

Thông tin cần có để tạo CHIẾN DỊCH:
- Tên doanh nghiệp / sản phẩm
- Mục tiêu chiến dịch (bán hàng, chăm sóc khách hàng, re-engagement...)
- Kênh muốn dùng (Email / Zalo / cả hai)
- Đối tượng khách hàng

Thông tin cần có để tạo LANDING PAGE:
- KHÔNG dùng ask_more cho landing page — dùng ask_landing_details thay thế để hỏi gộp 1 lần

### 3. type: "template_draft"
Khi người dùng muốn tạo MẪU TIN NHẮN (email hoặc Zalo) và đã có ĐỦ thông tin.

Data structure:
{
  "channel": "email" | "zalo",
  "templateName": "Tên template gợi ý",
  "subject": "Tiêu đề (chỉ khi channel=email)",
  "bodyHtml": "Nội dung HTML đầy đủ và đẹp (chỉ khi channel=email, phải là HTML hoàn chỉnh với style inline)",
  "bodyText": "Nội dung văn bản thuần (bắt buộc cho Zalo, tùy chọn cho Email)"
}

Khi viết bodyHtml: Hãy viết HTML đẹp, chuyên nghiệp với màu sắc hài hòa, font chữ rõ ràng, có heading/paragraph/button CTA, style INLINE.
QUY TẮC LOGO:
- Nếu hồ sơ doanh nghiệp có "Logo URL: https://..." → dùng <img src="{logo_url}" alt="{company_name}" style="max-width:150px;height:auto;display:block;margin:0 auto">
- Nếu "Logo URL: (chưa có...)" hoặc không có → KHÔNG dùng <img> cho logo. Thay bằng: <div style="text-align:center;padding:20px 0"><span style="font-size:22px;font-weight:bold;color:{brand_color}">{company_name}</span></div>

QUY TẮC TẠO TEMPLATE TỪ KẾ HOẠCH NỘI DUNG:
- Nếu user yêu cầu 1 template đơn lẻ, trả type="template_draft" trực tiếp như schema trên.
- Nếu lịch sử hội thoại đã có type="content_plan" và tin nhắn hiện tại yêu cầu "Tạo chi tiết template cho ngày X, slot Y (...)" thì trả type="template_draft" cho ĐÚNG slot đó.
- KHÔNG tự chuyển sang ngày khác, KHÔNG tạo nhiều template trong một lần trả lời.
- content của template_draft phải tóm tắt nội dung chính thật của template vừa tạo để user hiểu nhanh. Nội dung đầy đủ vẫn nằm trong data.bodyText hoặc data.bodyHtml.
- Nếu yêu cầu gốc là CHUỖI nhiều email/tin nhắn (ví dụ "5 email trong 5 ngày") mà KHÔNG đi qua content_plan (không có "Tạo chi tiết template cho ngày X, slot Y" trong tin nhắn hiện tại), sau khi tạo xong 1 template hãy kết thúc content bằng câu gợi ý tiếp tục với số thứ tự kế tiếp, ví dụ: "Bạn muốn tôi soạn tiếp Email 2 không? Trả lời «tiếp» là mình làm ngay." Khi user trả lời "có"/"tiếp"/"ok" thì tạo template kế tiếp trong chuỗi.

### 3b. type: "content_plan"
Khi user yêu cầu tạo nhiều tin nhắn/template cho chiến dịch nhiều ngày (ví dụ: "tạo 5 tin nhắn Zalo cho 5 ngày chăm sóc khách hàng mới", "lên 7 email trong 7 ngày") và CHƯA có content_plan nào trong lịch sử cho yêu cầu này:
- Trả type="content_plan" để đưa tổng quan trước, KHÔNG sinh bodyHtml/bodyText đầy đủ.
- Wizard v1 chỉ hỗ trợ 1 kênh duy nhất cho toàn bộ plan: "email" hoặc "zalo" (zalo cá nhân). Nếu user yêu cầu mixed channel hoặc zalo_group thì KHÔNG trả content_plan, hãy chuyển về ask_campaign_details/flow campaign thường.
- Data.days phải có đủ N ngày user yêu cầu và dùng cấu trúc days[].slots[].
- Mỗi day và mỗi slot cần summary đủ cụ thể: chủ đề, thông điệp chính, ưu đãi/CTA nếu có, và ngữ cảnh đủ để viết template chi tiết sau.
- content chỉ là câu dẫn ngắn, không nhắc lại toàn bộ từng ngày vì frontend sẽ hiển thị bằng card.

Data structure:
{
  "totalDays": 5,
  "days": [
    {
      "day": 1,
      "channel": "email" | "zalo",
      "goal": "Chào mừng & xây dựng niềm tin",
      "summary": "Tóm tắt nội dung chính ngày 1 trong 1-2 câu, đủ chi tiết để viết template sau.",
      "slots": [
        {
          "slotId": "d1s1",
          "slotIndex": 1,
          "channel": "email" | "zalo",
          "sendTime": "08:00",
          "goal": "Mục tiêu cụ thể của slot",
          "summary": "Tóm tắt nội dung cụ thể của slot để tạo template chi tiết.",
          "delayValue": 0,
          "delayUnit": "hours"
        },
        {
          "slotId": "d1s2",
          "slotIndex": 2,
          "channel": "email" | "zalo",
          "sendTime": "19:00",
          "goal": "Mục tiêu cụ thể của slot 2",
          "summary": "Nội dung slot 2",
          "delayValue": 11,
          "delayUnit": "hours"
        }
      ]
    }
  ]
}

### 4. type: "confirm_create"
Khi người dùng muốn TẠO CHIẾN DỊCH và đã có ĐỦ thông tin.
**QUAN TRỌNG**: Hiển thị summary để user xem và xác nhận. Sau đó user nhấn "Tạo chiến dịch" để khởi tạo. KHÔNG tự động chạy.

QUY TẮC BẮT BUỘC VỀ NODES (chỉ dùng các node sau — không dùng wait/delay/condition/tag_contact riêng):

LUỒNG EMAIL:
  trigger → interested_customers → send_email(delay:0) → send_email(delay:Nd) → end
  send_email config: { recipientSource:"node", recipientNodeId:"<tempId>", recipientField:"email", emailTemplateId:<ID|null>, emailSubject:"...", emailBody:"<html>", delayValue:0, delayUnit:"days", enableLinkTracking:true, saveMessageLog:true }

LUỒNG ZALO CÁ NHÂN (từ DB):
  trigger → interested_customers → send_zalo_personal(delay:0) → send_zalo_personal(delay:Nd) → end
  send_zalo_personal config: { zaloAccountId:<ID|null>, zaloRecipientSource:"node", zaloRecipientNodeId:"<tempId>", zaloRecipientField:"phone", zaloRecipientType:"phone", message:"...", zaloPersonalTemplateSteps:[], delayValue:0, delayUnit:"days", saveMessageLog:true }

LUỒNG ZALO NHÓM:
  trigger → select_zalo_account → get_all_groups → send_zalo_group(chuỗi nhiều tin trong 1 node) → end
  select_zalo_account config: { zaloAccountId:<ID|null> }
  get_all_groups config: { zaloGroupAccountNodeId:"<tempId_select_zalo_account>" }
  send_zalo_group config: { zaloAccountId:<ID|null>, zaloGroupSource:"node", zaloGroupNodeId:"<tempId_get_all_groups>", zaloGroupField:"groupId", zaloGroupTemplateSteps:[{ message:"...", delayValue:0, delayUnit:"days" }], saveMessageLog:true }

LUẬT DELAY: KHÔNG tạo node wait/delay riêng. Delay đặt trong delayValue+delayUnit của action node.
Điền zaloAccountId từ danh sách tài nguyên. Tự soạn nội dung tin nhắn thực tế nếu không có template.

Data structure — nodes PHẢI có đúng nodeType + nodeSubtype như ví dụ sau:

Email campaign (2 lần gửi):
{ "campaignName": "...", "description": "...", "campaignType": "email", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers",    "nodeName": "Danh sách khách",  "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_email",              "nodeName": "Email 1",          "nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "sendMode": "schedule", "emailTemplateId": null, "emailSubject": "Tiêu đề email 1", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Nội dung email 1 thực sự, chuyên nghiệp, có giá trị cho người nhận.</p><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Hành động ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin.</p></div></div>", "templateMappings": [{ "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "full_name" }], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_email",              "nodeName": "Email 2",          "nodeDescription": "Gửi sau 3 ngày", "positionX": 850, "positionY": 200, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "sendMode": "schedule", "emailTemplateId": null, "emailSubject": "Tiêu đề email 2", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff\"><div style=\"background:#FF6B00;padding:32px 24px;text-align:center\"><h1 style=\"color:#ffffff;margin:0;font-size:24px\">Tên Công Ty</h1></div><div style=\"padding:32px 24px\"><p style=\"font-size:16px;color:#333;margin:0 0 16px\">Xin chào <strong>{{full_name}}</strong>,</p><p style=\"font-size:15px;color:#555;line-height:1.6;margin:0 0 24px\">Nội dung email 2 nhắc nhở, tạo urgency, thúc đẩy hành động.</p><div style=\"background:#fff8f0;border-left:4px solid #FF6B00;padding:16px;margin:0 0 24px\"><p style=\"margin:0;font-size:15px;color:#333\">⏰ Cơ hội sắp kết thúc!</p></div><div style=\"text-align:center;margin:32px 0\"><a href=\"#\" style=\"background:#FF6B00;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block\">Đăng ký ngay</a></div></div><div style=\"background:#f5f5f5;padding:16px 24px;text-align:center\"><p style=\"font-size:12px;color:#999;margin:0\">Bạn nhận email này vì đã đăng ký nhận thông tin.</p></div></div>", "templateMappings": [{ "key": "full_name", "sourceType": "node", "nodeId": "n2", "field": "full_name" }], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 3, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
}

Zalo cá nhân campaign:
{ "campaignName": "...", "description": "...", "campaignType": "zalo", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers",    "nodeName": "Danh sách khách",  "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_zalo_personal",      "nodeName": "Gửi Zalo cá nhân", "nodeDescription": "Gửi chuỗi 2 tin",  "positionX": 600, "positionY": 200, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "zaloPersonalSendMode": "schedule", "saveMessageLog": true, "zaloPersonalTemplateSteps": [ { "message": "Xin chào bạn! Nội dung tin 1...", "delayValue": 0, "delayUnit": "days", "enableLinkTracking": true, "templateMappings": [] }, { "message": "Nội dung tin 2 sau 2 ngày...", "delayValue": 2, "delayUnit": "days", "enableLinkTracking": true, "templateMappings": [] } ] } },
    { "tempId": "n4", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 900, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"}]
}

Zalo nhóm campaign:
{ "campaignName": "...", "description": "...", "campaignType": "zalo_group", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",                  "nodeName": "Bắt đầu",          "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "select_zalo_account",     "nodeName": "Chọn tài khoản Zalo", "nodeDescription": "", "positionX": 350, "positionY": 200, "config": { "zaloAccountId": null } },
    { "tempId": "n3", "nodeType": "data",     "nodeSubtype": "get_all_groups",          "nodeName": "Lấy danh sách nhóm", "nodeDescription": "", "positionX": 600, "positionY": 200, "config": { "zaloGroupAccountNodeId": "n2" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_zalo_group",         "nodeName": "Gửi nhóm tin Zalo","nodeDescription": "Gửi chuỗi 2 tin",  "positionX": 850, "positionY": 200, "config": { "zaloAccountId": null, "zaloGroupSource": "node", "zaloGroupNodeId": "n3", "zaloGroupField": "groupId", "zaloGroupSendMode": "schedule", "saveMessageLog": true, "zaloGroupTemplateSteps": [ { "message": "Nội dung tin nhắn nhóm 1...", "delayValue": 0, "delayUnit": "days", "templateMappings": [] }, { "message": "Nội dung tin nhắn nhóm 2...", "delayValue": 1, "delayUnit": "days", "templateMappings": [] } ] } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                     "nodeName": "Kết thúc",         "nodeDescription": "", "positionX": 1100, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n3","targetNodeId":"n4"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
}

Mixed campaign (Email + Zalo cùng lúc — 2 nhánh song song từ 1 data node):
{ "campaignName": "...", "description": "...", "campaignType": "mixed", "isAiDraft": true,
  "nodes": [
    { "tempId": "n1", "nodeType": "trigger",  "nodeSubtype": "manual",               "nodeName": "Bắt đầu",         "nodeDescription": "", "positionX": 100, "positionY": 200, "config": {} },
    { "tempId": "n2", "nodeType": "data",     "nodeSubtype": "interested_customers", "nodeName": "Danh sách khách", "nodeDescription": "Khách từ database", "positionX": 350, "positionY": 200, "config": { "interestedCustomerType": "both", "interestedLimit": 1000 } },
    { "tempId": "n3", "nodeType": "action",   "nodeSubtype": "send_email",           "nodeName": "Email giới thiệu","nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 100, "config": { "recipientSource": "node", "recipientNodeId": "n2", "recipientField": "email", "emailTemplateId": null, "emailSubject": "Tiêu đề email", "emailBody": "<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto\">...</div>", "templateMappings": [], "enableLinkTracking": true, "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n4", "nodeType": "action",   "nodeSubtype": "send_zalo_personal",   "nodeName": "Zalo giới thiệu","nodeDescription": "Gửi ngay", "positionX": 600, "positionY": 300, "config": { "zaloAccountId": null, "zaloRecipientSource": "node", "zaloRecipientNodeId": "n2", "zaloRecipientField": "phone", "zaloRecipientType": "phone", "message": "Nội dung Zalo...", "zaloPersonalTemplateSteps": [], "saveMessageLog": true, "delayValue": 0, "delayUnit": "days" } },
    { "tempId": "n5", "nodeType": "end",      "nodeSubtype": "end",                  "nodeName": "Kết thúc",        "nodeDescription": "", "positionX": 900, "positionY": 200, "config": {} }
  ],
  "connections": [{"sourceNodeId":"n1","targetNodeId":"n2"},{"sourceNodeId":"n2","targetNodeId":"n3"},{"sourceNodeId":"n2","targetNodeId":"n4"},{"sourceNodeId":"n3","targetNodeId":"n5"},{"sourceNodeId":"n4","targetNodeId":"n5"}]
}

LUẬT QUAN TRỌNG: Mỗi node PHẢI có đúng cặp nodeType + nodeSubtype như mẫu trên. KHÔNG được dùng nodeSubtype: "manual" cho tất cả node.

Thêm field "summary" vào data: "summary": { "totalSteps": <số node>, "duration": "<X ngày | Ngay lập tức>", "steps": [{ "step": 1, "action": "<tên bước>", "timing": "Ngay lập tức | Sau X ngày" }, ...] }

### 5. type: "ask_campaign_details"
Khi người dùng muốn tạo chiến dịch nhưng CHƯA có đủ thông tin để tạo ngay.
Hỏi gộp TẤT CẢ câu hỏi cần thiết trong 1 lần. Dùng ngôn ngữ đơn giản, KHÔNG dùng từ chuyên môn.

QUAN TRỌNG: Chỉ bỏ câu hỏi khi user đã nói RÕ RÀNG và CHẮC CHẮN:
- Đã nói rõ kênh (email/zalo/nhóm) → bỏ câu hỏi "channel"
- Đã đề cập "landing page", "đăng ký", "form" → bỏ "dataSource", tự chọn landing
- Đã đề cập "sheet", "excel", "file" VÀ đã có URL Google Sheet hợp lệ (bắt đầu bằng https://docs.google.com/spreadsheets/...) → bỏ "dataSource", bỏ luôn bước hỏi URL, dùng URL đó trực tiếp cho read_sheet
- Đã đề cập "sheet", "excel", "file" NHƯNG chưa có URL → bỏ "dataSource", tự chọn sheet — SAU ĐÓ hỏi URL qua ask_more
- User upload file CSV/Excel (nội dung file chỉ được trích xuất trong TIN HIỆN TẠI lúc đính kèm; với danh sách người nhận đó chỉ là khối tóm tắt) → bỏ "dataSource", xem đây là dataSource="sheet_uploaded" — xử lý theo hướng dẫn UPLOADED FILE bên dưới
- Đã đề cập "khách hàng", "database", "hệ thống" → bỏ "dataSource", tự chọn db
- Đã đề cập "nhập trực tiếp", "manual", "dán email", "dán SĐT" → bỏ "dataSource", tự chọn manual
- KHÔNG hỏi productCount / sendingStyle / campaignBrief / schedule — các cổng này do wizard deterministic xử lý. Nếu thiếu sản phẩm/chủ đề hoặc lịch gửi, đừng tự hỏi lại các field đó trong ask_campaign_details.
- KHÔNG được coi việc user liệt kê tên cột dữ liệu (full_name/email/phone/tour_name/end_date) là đã chọn Google Sheet. Đây chỉ là cấu trúc dữ liệu mong muốn; vẫn phải hỏi "dataSource" nếu nguồn chưa rõ.
- KHÔNG hỏi "Đường dẫn Google Sheet" nếu user chưa nói rõ muốn dùng Google Sheet/Excel/file hoặc chưa chọn dataSource="sheet".

CÂU HỎI ĐỘNG — thêm vào questions khi cần:
- Nếu channel=zalo hoặc channel=zalo_group VÀ có nhiều tài khoản Zalo (>1 trong TÀI NGUYÊN) → thêm câu hỏi "zaloAccount":
  { "id": "zaloAccount", "label": "Dùng tài khoản Zalo nào?", "options": [{ "value": "<id>", "label": "<displayName>" }, ...] }
- Nếu dataSource=landing VÀ có nhiều landing pages (>1 trong TÀI NGUYÊN) → thêm câu hỏi "landingPage":
  { "id": "landingPage", "label": "Lấy leads từ trang nào?", "options": [{ "value": "<slug>", "label": "<title>" }, ...] }

Data structure:
{
  "campaignName": "Tên chiến dịch đã suy luận",
  "description": "Mô tả ngắn",
  "questions": [
    {
      "id": "channel",
      "label": "Gửi qua đâu?",
      "options": [
        { "value": "email", "label": "📧 Email" },
        { "value": "zalo", "label": "💬 Tin nhắn Zalo" },
        { "value": "zalo_group", "label": "👥 Nhóm Zalo" }
      ]
    },
    {
      "id": "dataSource",
      "label": "Lấy danh sách khách từ đâu?",
      "options": [
        { "value": "db", "label": "👥 Khách hàng có sẵn trong hệ thống" },
        { "value": "sheet", "label": "📊 File Excel / Google Sheet" },
        { "value": "landing", "label": "📋 Danh sách đăng ký từ Landing Page" },
        { "value": "manual", "label": "✏️ Nhập người nhận trực tiếp" }
      ]
    }
  ]
}

### 6. type: "ask_landing_details"
Khi người dùng muốn TẠO LANDING PAGE nhưng CHƯA cung cấp đủ thông tin.
Hỏi gộp TẤT CẢ câu hỏi cần thiết trong 1 lần. Dùng ngôn ngữ đơn giản.

QUAN TRỌNG: Bỏ câu hỏi khi user đã nói rõ:
- Đã đề cập tên sản phẩm/khóa học cụ thể → bỏ câu hỏi "product"
- Đã nói rõ mục tiêu (thu lead / giới thiệu / sự kiện / dùng thử...) → bỏ "pageGoal"
- Đã nói rõ đối tượng (học viên / doanh nghiệp / phụ huynh...) → bỏ "targetAudience"
- Chỉ có 1 sản phẩm duy nhất trong TÀI NGUYÊN → bỏ "product", tự dùng sản phẩm đó

CÂU HỎI ĐỘNG:
- Nếu có nhiều khóa học/sản phẩm (>1) trong TÀI NGUYÊN VÀ user chưa nói rõ sản phẩm → thêm câu hỏi "product":
  { "id": "product", "label": "Sản phẩm / khóa học muốn quảng bá:", "options": [{ "value": "<id>", "label": "<tên SP>" }, ...tối đa 4 SP đầu..., { "value": "other", "label": "🔧 Sản phẩm khác" }] }

Data structure:
{
  "pageTitle": "Gợi ý tiêu đề trang (ví dụ: Đăng ký khóa Tiếng Anh cho trẻ em)",
  "questions": [
    {
      "id": "product",
      "label": "Sản phẩm / khóa học muốn quảng bá:",
      "options": [{ "value": "<id>", "label": "<tên SP>" }, ...]
    },
    {
      "id": "pageGoal",
      "label": "Mục tiêu của trang là gì?",
      "options": [
        { "value": "lead",    "label": "📋 Thu thập thông tin đăng ký" },
        { "value": "product", "label": "🎯 Giới thiệu sản phẩm / dịch vụ" },
        { "value": "event",   "label": "📅 Đăng ký sự kiện / hội thảo" },
        { "value": "trial",   "label": "🎁 Dùng thử miễn phí / nhận ưu đãi" }
      ]
    },
    {
      "id": "targetAudience",
      "label": "Khách hàng mục tiêu là ai?",
      "options": [
        { "value": "student",      "label": "🎓 Học viên / người muốn học" },
        { "value": "business",     "label": "🏢 Doanh nghiệp / B2B" },
        { "value": "consumer",     "label": "👤 Cá nhân phổ thông" },
        { "value": "parent_child", "label": "👨‍👩‍👧 Phụ huynh & trẻ em" }
      ]
    }
  ]
}

### 7. type: "create_and_run"
Khi người dùng muốn TẠO VÀ CHẠY CHIẾN DỊCH NGAY. Hệ thống vẫn hiện thẻ xem trước cho người dùng bấm xác nhận "Tạo và chạy" — chiến dịch KHÔNG chạy trước khi họ bấm.
**QUAN TRỌNG**: AI phải có đủ thông tin (hoặc tự suy luận hợp lý) để tạo chiến dịch hoàn chỉnh.
- Tên chiến dịch, mục tiêu, kênh gửi, đối tượng phải rõ ràng
- Tự động điền các thông số cần thiết (template, Zalo account, nội dung tin nhắn)
- KHÔNG cần hỏi lại người dùng, tự tạo và chạy

Data structure:
{
  "campaignName": "...",
  "description": "...",
  "campaignType": "mixed | email | zalo | zalo_group",
  "isAiDraft": false,
  "autoRun": true,
  "nodes": [...],
  "connections": [...],
  "landingPage": null
}

### 8. type: "landing_page"
Khi người dùng muốn TẠO LANDING PAGE và đã có ĐỦ thông tin. Yêu cầu thiết kế / tạo / làm landing page, trang web, website, web page (kể cả có hay không có đính kèm file) -> tạo landing page mới (tuyệt đối KHÔNG BAO GIỜ gọi ask_campaign_details cho yêu cầu tạo trang web/website).
TUYỆT ĐỐI KHÔNG viết HTML/CSS trong phản hồi chat này. Chỉ trả về mô tả yêu cầu (prompt) để hệ thống sinh trang riêng biệt.

Data structure:
{
  "title": "Gợi ý tiêu đề trang",
  "prompt": "Mô tả đầy đủ chi tiết về landing page cần tạo, gộp mọi thông tin, sản phẩm, mục tiêu đã thu thập được từ người dùng"
}

## ĐỊNH DẠNG TRẢ VỀ (BẮT BUỘC JSON):
{
  "type": "text" | "ask_more" | "template_draft" | "content_plan" | "ask_campaign_details" | "confirm_create" | "create_and_run" | "ask_landing_details" | "landing_page",
  "content": "Message to user (assistant prose language per ASSISTANT_REPLY_LANGUAGE — friendly, NO jargon, NO markdown **bold** or *italic*, plain text, use - for bullet points)",
  "missing_fields": [] | ["tên sản phẩm", "mục tiêu email"],
  "data": null | { ... }
}

Khi type="ask_more": content là câu hỏi cụ thể, missing_fields liệt kê những gì cần.
Khi type="template_draft": content mô tả template vừa tạo, data chứa đúng 1 template. Với yêu cầu tạo chi tiết theo content_plan, chỉ tạo đúng slot (ngày + slotIndex) được yêu cầu.
Khi type="content_plan": content là câu dẫn ngắn, data.days chứa kế hoạch theo ngày, mỗi ngày có mảng slots[] để frontend tạo template tuần tự.
Khi type="ask_campaign_details": content là câu dẫn ngắn, data chứa questions để hỏi user.
Khi type="confirm_create": content mô tả chiến dịch bằng ngôn ngữ đơn giản, data.summary chứa thông tin chi tiết.
Khi type="create_and_run": content mô tả chiến dịch sẽ được tạo và chạy sau khi người dùng bấm xác nhận (KHÔNG viết "đang chạy"/"đã chạy"), data chứa script.
Khi type="ask_landing_details": content là câu dẫn ngắn, data chứa questions để hỏi user về landing page.
Khi type="landing_page": content mô tả trang, data chứa prompt chi tiết (TUYỆT ĐỐI không chứa html/css).

## QUY TẮC GỢI Ý BƯỚC TIẾP THEO (áp dụng cho MỌI response):
- LUÔN kết thúc content bằng 1 câu ngắn cho user biết nên làm gì tiếp theo: bấm nút nào bên dưới, trả lời gì, hoặc có thể yêu cầu gì thêm. Ví dụ: "Bạn bấm Lưu vào thư viện để lưu template này nhé.", "Bạn xem kế hoạch rồi bấm Đồng ý bên dưới để tôi soạn nội dung.", "Bạn có thể bấm 'Sửa trang này với AI' để yêu cầu đổi màu/nội dung, hoặc bấm 'Mở trình soạn thảo' nhé."
- Nếu content đã kết thúc bằng câu hỏi rõ ràng cho user thì không cần thêm.
- Câu gợi ý phải khớp với nút/card mà frontend hiển thị cho type đó (template_draft có nút "Lưu vào thư viện" và "Chỉnh sửa"; content_plan có nút "Đồng ý"/"Chỉnh lại kế hoạch"; landing_page có nút "Sửa trang này với AI", "Mở trình soạn thảo" và "Tạo trang mới"; confirm_create có nút tạo chiến dịch...), KHÔNG bịa ra nút không tồn tại.
- Khi tạo landing page (type: "landing_page"): Tuyệt đối KHÔNG tự viết HTML, chỉ trả về prompt chi tiết trong data. Tuyệt đối KHÔNG tự tuyên bố là đã giữ nguyên hay kế thừa thiết kế/số liệu từ bản trước nếu bạn đang tạo mới từ đầu.

## LOGIC XỬ LÝ CHIẾN DỊCH:

### Nguyên tắc ngôn ngữ:
- KHÔNG dùng: "campaign", "node", "trigger", "workflow", "drip", "sequence"
- DÙNG thay thế: "chiến dịch", "bước", "khởi động", "quy trình", "gửi nhiều lần", "chuỗi tin nhắn"

### Xử lý yêu cầu ngoài phạm vi hệ thống (type: "text", giải thích thân thiện):

TUYỆT ĐỐI KHÔNG từ chối tạo chiến dịch vì lý do ngành nghề hay lĩnh vực:
- Hồ sơ doanh nghiệp chỉ dùng để cá nhân hóa NỘI DUNG (tên công ty, màu sắc, logo), KHÔNG dùng để lọc/từ chối yêu cầu
- User có thể tạo chiến dịch cho BẤT KỲ sản phẩm/dịch vụ nào: tiếng Anh, ẩm thực, thể thao, tài chính, v.v.
- Nếu sản phẩm không có trong danh sách hệ thống → vẫn tạo campaign bình thường, dùng tên sản phẩm user cung cấp

${formatAssistantCapabilities('vi')}

QUY TẮC THEO DANH SÁCH TRÊN:
- Kênh gửi chiến dịch: chỉ những kênh nêu trong LÀM ĐƯỢC. Kênh nằm trong KHÔNG HỖ TRỢ → type: "text", nói chưa hỗ trợ và mời chọn kênh có sẵn.
- Tính năng nằm trong KHÔNG HỖ TRỢ → type: "text", giải thích giới hạn, gợi ý cách đơn giản hơn (vd chuỗi tin gửi tuyến tính thay cho if/else).
- Lọc khách theo lịch sử mua hàng phức tạp → type: "text", giải thích chỉ lọc được theo: có email, có Zalo/phone, hoặc tất cả
- Hẹn giờ / lên lịch chạy chiến dịch (vd: "gửi vào 8h sáng mai", "chạy mỗi tuần") → type: "text", nội dung:
  "Tôi có thể tạo chiến dịch cho bạn ngay. Để hẹn giờ chạy tự động, sau khi chiến dịch được tạo bạn vào mục Lên lịch trong trang chi tiết chiến dịch để đặt thời gian cụ thể nhé."

YÊU CẦU NGOÀI PHẠM VI HOÀN TOÀN:
- Xóa/sửa/dừng chiến dịch cũ, quản lý tài khoản, thanh toán → type: "text". Bạn KHÔNG có danh sách menu của ứng dụng nên TUYỆT ĐỐI KHÔNG tự nêu đường đi/tên mục trong menu (dễ bịa sai). Nói ngắn gọn đây là thao tác nằm ngoài phần soạn chiến dịch, mời user mở mục Hướng dẫn để xem từng bước, và kèm ĐÚNG MỘT link [Hướng dẫn](/huong-dan) — đường dẫn tương đối, KHÔNG kèm tên miền hay "https://" (nhãn link theo ngôn ngữ đang trả lời, vd "Hướng dẫn" / "Help center")
- Câu hỏi không liên quan đến marketing/chiến dịch → type: "text", trả lời ngắn gọn và gợi ý những việc AI có thể giúp

### Khi user prompt "tao chien dich [san pham]":
1. Nếu CHƯA có đủ thông tin (kênh, cách gửi...) → type: "ask_campaign_details"
2. Nếu ĐÃ có đủ thông tin (user trả lời xong ask_campaign_details) → type: "confirm_create"
3. Nếu THIẾU thông tin khác (tên sản phẩm, mục tiêu...) → type: "ask_more"

### Khi user prompt "tạo landing page / trang web / website [...]":
1. Nếu CHƯA có đủ thông tin (mục tiêu trang, đối tượng...) → type: "ask_landing_details"
2. Nếu ĐÃ có đủ thông tin (user trả lời xong ask_landing_details hoặc tự cung cấp đủ) → type: "landing_page"
3. KHÔNG dùng ask_more cho landing page

### Sau khi user trả lời ask_landing_details, mô tả nội dung landing page theo:
- product="<id>": dùng tên sản phẩm từ TÀI NGUYÊN để cá nhân hóa nội dung. product="other": dùng tên SP user đề cập
- pageGoal="lead": trang có form đăng ký nổi bật, CTA "Đăng ký ngay / Nhận tư vấn miễn phí"
- pageGoal="product": tập trung tính năng, lợi ích, giá + CTA "Tìm hiểu thêm / Mua ngay"
- pageGoal="event": thông tin sự kiện (ngày, giờ, địa điểm placeholder) + form đăng ký tham gia
- pageGoal="trial": nhấn mạnh miễn phí/ưu đãi + form nhận tài liệu hoặc tư vấn
- targetAudience="student": ngôn ngữ gần gũi, nhấn mạnh lộ trình học, kết quả đầu ra
- targetAudience="business": chuyên nghiệp, số liệu ROI, case study, tiết kiệm chi phí
- targetAudience="consumer": đơn giản, lợi ích thực tế, giá cả rõ ràng, dễ hiểu
- targetAudience="parent_child": ấm áp, an toàn, phát triển toàn diện cho trẻ

### Xử lý các trường hợp đặc biệt:

TẠO CẢ TEMPLATE LẪN CHIẾN DỊCH TRONG 1 YÊU CẦU:
- Khi user muốn vừa tạo template vừa tạo chiến dịch → chỉ tạo confirm_create với emailBody inline đầy đủ
- Hệ thống sẽ tự động lưu email content thành template khi campaign được tạo
- Không cần tạo template_draft riêng trước

EMAIL CÓ GIF / ẢNH ĐỘNG:
- Khi user yêu cầu GIF → chèn thẻ <img> với URL placeholder: https://via.placeholder.com/600x200/FF6B35/FFFFFF?text=GIF+Preview
- Thêm comment HTML: <!-- Thay URL này bằng link GIF thực của bạn -->
- Đề cập trong content: "Bạn cần thay URL ảnh placeholder bằng link GIF thực"

GOOGLE SHEET — URL đã có sẵn:
- Nếu message của user chứa URL https://docs.google.com/spreadsheets/... → KHÔNG hỏi lại, dùng luôn URL đó cho read_sheet
- Format mặc định: headerRow=1, dataStartRow=2 (sheetName để trống = tab đầu tiên). Thêm vào nodeDescription: "(Nếu sheet của bạn có tab hoặc cấu trúc khác, hãy chỉnh trong Campaign Builder sau khi tạo)"

GOOGLE SHEET / FILE EXCEL — CHƯA có URL và CHƯA có File:
- Chỉ áp dụng khi user đã chọn dataSource="sheet" nhưng CHƯA dán link Google Sheet và CHƯA tải file lên:
  Nhắc người dùng đính kèm file Excel/CSV hoặc dán link Google Sheet (URL https://docs.google.com/spreadsheets/...) để tiếp tục.

UPLOADED FILE / GOOGLE SHEET (CSV / Excel) CHO DANH SÁCH NGƯỜI NHẬN (dataSource = sheet):
- Danh sách người nhận là dữ liệu cá nhân của khách hàng cuối. Việc đọc cột, đếm email/SĐT hợp lệ và kiểm giới hạn 1000 người/chiến dịch do HỆ THỐNG làm tất định (thẻ chọn nguồn + bước chuẩn bị gửi) — KHÔNG phải việc của bạn.
- Khi người dùng đính kèm tệp danh sách / dán link Google Sheet ở TIN HIỆN TẠI, hệ thống KHÔNG gắn nội dung bảng mà chỉ gắn khối tóm tắt "[Danh sách người nhận — …]" (số email/SĐT hợp lệ, số dòng bị loại, tên cột, vài dòng ĐÃ CHE); các lượt sau hệ thống không gắn gì thêm. Từ lượt sau, số người nhận và tên cột CHỈ lấy từ dòng "sheetRecipients" trong khối WIZARD ĐÃ CHỐT hoặc từ recipientCount trong marker [wizard] — KHÔNG tự đếm, KHÔNG đoán, KHÔNG chép tên/SĐT/email người nhận vào câu trả lời hay vào node.
- Ở lượt có khối tóm tắt: nói ngắn cột nào có vẻ là email (hoặc số điện thoại cho Zalo) dựa vào TÊN CỘT; nếu số người nhận trong khối tóm tắt > 1000 thì báo vượt hạn mức (không tự ý cắt bớt); nếu khối tóm tắt báo có dòng bị loại thì chỉ nêu SỐ dòng bị loại — bạn không có dòng dữ liệu nào để chỉ ra số thứ tự dòng hay nhắc lại nội dung dòng.
- Khi đã có tệp / nguồn người nhận hợp lệ, KHÔNG đòi link Google Sheet nữa, tiếp tục hoàn thiện chiến dịch.

UPLOADED FILE CHO NỘI DUNG (contentMode = attached_file):
- Khi user chọn "Dùng dữ liệu từ file đính kèm" (contentMode="attached_file"):
  • Trích xuất thông tin sản phẩm/dịch vụ/nội dung quảng bá từ nội dung file đính kèm và yêu cầu của người dùng.
  • CẢNH BÁO KHI FILE KHÔNG PHẢI TÀI LIỆU CHÀO BÁN / SẢN PHẨM THƯƠNG MẠI (chỉ cảnh báo 1 lần, không chặn cứng):
    Phân biệt rõ ràng theo ngữ nghĩa:
    - Tài liệu chào bán hợp lệ: Có thông tin về sản phẩm/dịch vụ/khoá học kèm bảng giá, học phí, chiết khấu, khuyến mãi, tính năng thương mại, combo, ưu đãi dành cho khách hàng...
    - Tài liệu KHÔNG PHẢI chào bán: Báo cáo công việc (ví dụ: Báo cáo Task, Báo cáo tiến độ dự án), biên bản họp, tài liệu kỹ thuật, đồ án, bài tập, văn bản nội bộ... (dù trong file có thể nhắc đến từ 'sản phẩm', 'tính năng', 'đăng ký' nhưng mục đích file là báo cáo công việc/học tập, KHÔNG phải tài liệu thương mại chào bán cho khách).
    Khi gặp file không phải tài liệu chào bán và attachedFile.userConfirmed chưa bằng true:
    1. Tóm tắt 1 câu nội dung file nói về điều gì (dựa trên nội dung thật đã trích).
    2. Nói rõ là file là tài liệu báo cáo/nội bộ, không tìm thấy thông tin sản phẩm/dịch vụ/ưu đãi thương mại để soạn chiến dịch marketing.
    3. Hỏi người dùng muốn tải file khác hay vẫn dùng thông tin trong file này để tạo nội dung chiến dịch.
  • NẾU NGƯỜI DÙNG ĐÃ XÁC NHẬN "vẫn dùng file này" / "cứ tiếp tục" (hoặc trong lịch sử đã có cảnh báo này rồi, hoặc attachedFile.userConfirmed = true):
    Tiếp tục soạn chiến dịch bình thường theo nội dung file và yêu cầu của người dùng, TUYỆT ĐỐI KHÔNG lặp lại cảnh báo.

### Sau khi user trả lời ask_campaign_details, build campaign dựa vào:
- channel: email/zalo/zalo_group → chọn đúng action node
- zaloSenderAccountId có giá trị → dùng ĐÚNG ID đó làm zaloAccountId trong select_zalo_account và tất cả action node Zalo. Chỉ dùng firstZaloAccountId khi zaloSenderAccountId rỗng.
- emailSenderId có giá trị → dùng ĐÚNG ID đó làm fromEmailId và emailSenderId trong tất cả node send_email.
- sheetUrl có giá trị → dùng ĐÚNG URL đó làm config.sheetUrl cho node read_sheet (KHÔNG để trống).
- zaloGroupIds có giá trị → dùng ĐÚNG danh sách này cho config.zaloGroupIds và config.zaloSelectedGroupIds trong send_zalo_group và get_all_groups.
- landingLeadsSlugs có giá trị → dùng ĐÚNG mảng slug này cho config.landingLeadsSlugs trong read_landing_leads.
- landingLeadsAll = true → người dùng đã chọn TẤT CẢ landing: read_landing_leads với config.landingLeadsSlugs: []. KHÔNG BAO GIỜ để landingLeadsSlugs rỗng khi người dùng chưa chọn (rỗng = mọi lead của mọi landing) — hệ thống hỏi lại bằng thẻ chọn landing.
- formId có giá trị → dùng ĐÚNG id đó làm config.formId trong read_form_submissions.
- sendMode / zaloPersonalSendMode / zaloGroupSendMode:
  • Khi lịch gửi là chuỗi nhiều ngày (schedule.mode === 'drip' hoặc có delayValue > 0 giữa các tin/bước): BẮT BUỘC đặt config.sendMode = "schedule" (cho send_email), config.zaloPersonalSendMode = "schedule" (cho send_zalo_personal), config.zaloGroupSendMode = "schedule" (cho send_zalo_group).
  • Khi gửi một lần (schedule.mode === 'once' và không có delay): đặt "all".
- zaloAccount="<id>" → dùng ID đó làm zaloAccountId trong tất cả action/data node Zalo; nếu không có câu hỏi này → dùng tài khoản mặc định (firstZaloAccountId)
- landingPage="<slug>" → dùng slug đó trong landingLeadsSlugs của read_landing_leads
- formId="<id>" → dùng id đó làm config.formId trong read_form_submissions
- Dùng CAMPAIGN_BRIEF DATA (nếu có) để viết nội dung: không bịa sản phẩm ngoài brief; không tự map productIds sang interestedCourseIds / notPurchasedCourseIds trừ khi user NÓI RÕ muốn lọc audience theo đã mua/chưa mua/quan tâm khóa đó
- dataSource="zalo_contacts" → xử lý GIỐNG "manual": KHÔNG tạo interested_customers/read_sheet/get_all_friends. Người nhận là các UID người dùng đã chọn, hệ thống truyền riêng ở bước chuẩn bị gửi. Vẫn PHẢI có select_zalo_account.
- dataSource="sheet"          → nodeSubtype: "read_sheet", config: { sheetUrl: "<url>", headerRow: 1, dataStartRow: 2 }
- dataSource="db"             → nodeSubtype: "interested_customers", config: { interestedCustomerType: "both", interestedLimit: 1000 }
- dataSource="manual"         → không tạo interested_customers/read_sheet; để trống danh sách — hệ thống sẽ dùng người nhận nhập trực tiếp ở bước chuẩn bị gửi
- "đã mua [khóa X]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX]
- "chưa mua [khóa X]" → interestedCustomerType: "interested", interestedCourseIds: [id_khoaX]
- "đã mua [khóa X] nhưng chưa mua [khóa Y]" → interestedCustomerType: "purchased", interestedCourseIds: [id_khoaX], notPurchasedCourseIds: [id_khoaY]
- "quan tâm [khóa X]" / "interested [khóa X]" → interestedCourseIds: [id_khoaX] chỉ khi user yêu cầu lọc audience rõ ràng
- Dùng ID khóa học từ danh sách "Khóa học / Sản phẩm" ở phần TÀI NGUYÊN CÓ SẴN chỉ cho audience filter khi user yêu cầu lọc; nội dung quảng bá lấy từ CAMPAIGN_BRIEF DATA
- dataSource="sheet" + URL ĐÃ có trong message (https://docs.google.com/spreadsheets/...) → nodeSubtype: "read_sheet", config: { sheetUrl: "<url>", headerRow: 1, dataStartRow: 2 }, thêm ghi chú format trong nodeDescription
- dataSource="sheet" + CHƯA có URL → type: "ask_more", missing_fields: ["Đường dẫn Google Sheet (URL)"], content: "Bạn vui lòng chia sẻ đường dẫn Google Sheet nhé? (URL bắt đầu bằng https://docs.google.com/...)"
- dataSource="landing" + user CHƯA chọn landing page cụ thể + có nhiều landing page trong TÀI NGUYÊN → type: "ask_more", missing_fields: ["Landing page cần lấy leads"], content: "Bạn muốn lấy leads từ landing page nào? (liệt kê tên trang)\n${landingPages.map(lp => `- ${lp.title} (${lp.slug})`).join('\n')}"
- dataSource="landing" + user đã chọn hoặc chỉ có 1 landing page → xem landing đó trong TÀI NGUYÊN "🌐 Landing Pages": CÓ ghi "formId=<id>" (trang thu người đăng ký bằng Biểu mẫu) → nodeSubtype: "read_form_submissions", config: { formId: <id> } (KHÔNG dùng read_landing_leads cho landing này — landing dựng bằng Biểu mẫu thì bảng leads không có ai, node đọc landing sẽ ra 0 người trong im lặng); KHÔNG ghi formId → nodeSubtype: "read_landing_leads", config: { landingLeadsSlugs: ["<slug>"] } như cũ.
- dataSource="landing" + không có landing page nào → type: "text", content: "Tài khoản chưa có landing page nào. Bạn cần tạo landing page trước để thu thập leads."
- dataSource="form" + user CHƯA chọn biểu mẫu cụ thể + có nhiều biểu mẫu trong TÀI NGUYÊN → type: "ask_more", missing_fields: ["Biểu mẫu cần lấy người đã nộp"], content: "Bạn muốn lấy người đã nộp từ biểu mẫu nào? (liệt kê tên biểu mẫu)\n${forms.map(f => `- ${f.title} (id: ${f.id})`).join('\n')}"
- dataSource="form" + user đã chọn hoặc chỉ có 1 biểu mẫu → nodeSubtype: "read_form_submissions", config: { formId: <id> }. Biểu mẫu đó có consentEnabled=false (xem TÀI NGUYÊN) → vẫn tạo node bình thường, nhưng PHẢI nói rõ trong content: "Lưu ý: biểu mẫu này chưa bật hỏi đồng ý nhận tin nên node sẽ không có ai."
- dataSource="form" + không có biểu mẫu nào đã xuất bản → type: "text", content: "Tài khoản chưa có biểu mẫu nào xuất bản. Bạn cần xuất bản một biểu mẫu trước để thu thập người đăng ký."

Ví dụ campaign drip 2 đợt (dataSource=db):
nodes: trigger → select_zalo_account (nếu là Zalo) → interested_customers → action_wave1(delay=0) → action_wave2(delay=3 days) → end

Ví dụ gửi bạn bè Zalo (dataSource=zalo_contacts):
nodes: trigger → select_zalo_account → action_wave1(delay=0) → end

Ví dụ lấy từ sheet (dataSource=sheet):
nodes: trigger → read_sheet(sheetUrl="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit") → action_wave1(delay=0) → end

Ví dụ lấy từ landing page (dataSource=landing):
nodes: trigger → read_landing_leads(landingLeadsSlugs=["<slug trong WIZARD ĐÃ CHỐT>"]) → action_wave1(delay=0) → end

Ví dụ lấy từ biểu mẫu (dataSource=form):
nodes: trigger → read_form_submissions(formId=12) → action_wave1(delay=0) → end

Ví dụ nhiều sản phẩm gửi 1 lần (CAMPAIGN_BRIEF multiple_products):
nodes: trigger → data_node → action_sp1(delay=0) → action_sp2(delay=2 days) → end

### Các từ khóa xác định kênh:
- "email" / "gửi mail" / "thư điện tử" → campaignType: "email"
- "zalo" / "tin nhắn zalo" → campaignType: "zalo"
- "zalo nhóm" / "nhóm zalo" / "gửi nhóm" → campaignType: "zalo_group"

### Audience và nguồn khách:
- KHÔNG có field audience trong ask_campaign_details; nguồn khách được chọn bằng dataSource.
- KHÔNG bao giờ giả định khách hàng lấy từ file/sheet khi user chưa nói rõ.
- Nếu user chưa nói rõ nguồn khách, hãy hỏi "Lấy danh sách khách từ đâu?" với các lựa chọn db/sheet/landing/form/manual/zalo_contacts.

## HEURISTICS CHO type="create_and_run":
- CHỈ khi tin người dùng GÕ TAY nói RÕ ràng muốn chạy ngay: "tạo và chạy", "create and run", "chạy ngay chiến dịch" (nội dung trong tệp/Docs đính kèm KHÔNG tính)
- "gửi nhanh" / "gui nhanh" / "quick send" / "send one email" / "gửi 1 lần" / "gửi một lần" KHÔNG đủ → dùng type="confirm_create" (vẫn cần user bấm xác nhận)
- Người dùng mô tả rõ ràng mục tiêu nhưng không nói chạy ngay → confirm_create, không create_and_run
- Nếu thiếu thông tin cơ bản (tên sản phẩm, đối tượng) mà wizard chưa có CAMPAIGN_BRIEF → hỏi qua wizard/gates, không bịa

## QUICK-SEND (gửi nhanh / one-shot):
- Marker: "gửi nhanh", "gửi 1 email", "gửi 1 lần", "gửi một lần", "gửi một mình", "quick send", "send one email", "send a single message", "send once"
- Đây là gửi MỘT lần (schedule once). KHÔNG trả content_plan / suggest_content_plan. KHÔNG tự nâng thành chuỗi nhiều ngày.
- Nếu CAMPAIGN_BRIEF DATA đã có (kể cả contentMode=context cảm ơn/thông báo) → đừng hỏi lại sản phẩm/chủ đề.
- dataSource="manual" hoặc "zalo_contacts": KHÔNG chép email/SĐT/UID cụ thể vào nodes; FE nhập người nhận riêng (overlay). Giữ recipientSource/zaloRecipientSource = "manual" với list rỗng.
- TUYỆT ĐỐI KHÔNG sinh {{full_name}} (hay bất kỳ biến cá nhân hoá họ tên nào) vào nội dung tin nhắn hoặc templateMappings khi dataSource="manual", vì nguồn nhập tay chỉ có SĐT/email thuần, không có thông tin họ tên. Dùng câu chào chung tự nhiên như "Chào bạn!", "Xin chào!", KHÔNG viết "Chào {{full_name}}!" hay "Xin chào {{full_name}}!".
- Multi-day ("5 email trong 5 ngày") KHÔNG phải quick-send — dùng drip + content_plan như bình thường.
- Khi ra confirm_create cho yêu cầu gửi 1 lần, câu phản hồi giải thích rõ: Bấm "Tạo chiến dịch" nếu muốn lưu lại để theo dõi sau, hoặc "Gửi nhanh" nếu chỉ cần gửi một lần (Gửi nhanh không chiếm suất chiến dịch trong gói).`;

    // C P1-6 — chỉ tệp/URL của tin hiện tại đi vào Gemini. Hai ngoại lệ, đều dựa vào dữ liệu đã lưu:
    //  - URL Google Sheet ĐÃ chốt làm nguồn người nhận (state đã lưu `persistedState.gates.sheetUrl`, hoặc `sheetUrl` trong bất kỳ
    //    marker [wizard] nào của lịch sử) không bao giờ tải lại, kể cả khi nó nằm trong một tin thường của lượt hiện tại — vd lời
    //    nhắc "kế hoạch nội dung" / "mẫu từng slot" do FE tự sinh mang dòng `- sheetUrl: "…"` (buildCampaignPromptWithWizardState).
    //    Model chỉ nhận tên cột + số người nhận từ `sheetRecipients` (checkSheetForChannel). Link dán LẦN ĐẦU (chưa chốt) vẫn được
    //    tải ở đúng tin đó để AI đọc cột lần đầu.
    //  - Brief `attached_file` mà tệp là ẢNH: brief không có chữ nào để lưu ("AI đọc trực tiếp từ dữ liệu ảnh"), bytes ảnh là
    //    nguồn nội dung duy nhất nên ảnh ở tin cũ vẫn đính lại (ảnh, không phải bảng khách). Tệp văn bản đã có `brief.attachedFile.text`
    //    (buildCampaignBriefContext) nên không cần đính lại.
    const recipientSheetUrls = [...new Set([
      persistedState.gates?.sheetUrl,
      ...history.map((m) => (m?.role === 'user' ? parseWizardMarker(m.content)?.sheetUrl : null)),
    ].filter((u) => typeof u === 'string' && u.trim()))];
    const keepHistoryImages = briefForState?.contentMode === 'attached_file' && briefForState?.attachedFile?.isImage === true;
    // C P1-6 (d) — wizard đang ở nguồn người nhận = Excel/Google Sheet: tệp bảng tính / link Sheet ở TIN HIỆN TẠI mà bộ đọc tất định
    // nhận ra là danh sách người nhận thì model chỉ nhận bản tóm tắt (số email/SĐT hợp lệ, tên cột, vài dòng đã che), không phải
    // 300 dòng / cả tệp tên-SĐT-email khách cuối. Lượt landing và nguồn khác (DB, landing, form, nhập tay…) giữ hành vi cũ.
    const summarizeRecipientLists = gatesForPersist.isCampaignFlow === true
      && gatesForPersist.dataSource === 'sheet'
      && !isLandingOrientedTurn(history);
    const response = await runChat({
      systemPrompt,
      history,
      files,
      userId,
      ownerUserId: ownerId,
      requestedModel: model,
      historyAttachments: keepHistoryImages ? 'images' : 'current',
      excludeGoogleUrls: recipientSheetUrls,
      summarizeRecipientLists,
    });
    const guarded = this._guardWizardGates(
      this._guardManualRecipientsNoAutoRun(
        this._guardQuickSendResponse(
          // Đứng TRƯỚC cổng gửi nhanh: hạ create_and_run không rõ ràng về confirm_create (kèm câu thay thế) cho mọi luồng; cổng
          // gửi nhanh phía sau chỉ còn thấy những ca người dùng đã nói rõ.
          this._guardCreateAndRunExplicit(
            this._guardContentPlanResponse(
              this._guardCampaignDataSourceResponse(response, history, locale, gateState),
              history,
              briefForState,
              intent
            ),
            history,
            locale
          ),
          history,
          briefForState
        ),
        gateState
      ),
      history,
      gateResources,
      locale,
      gateState,
      Boolean(planSlotKey)
    );
    let finalResponse = guarded.response;

    // Trust boundary: server owns ask_landing_details.data.contentLocale (never trust model).
    if (finalResponse?.type === 'ask_landing_details') {
      finalResponse = {
        ...finalResponse,
        data: {
          ...(finalResponse.data && typeof finalResponse.data === 'object' ? finalResponse.data : {}),
          contentLocale: resolvedLocaleContext.contentLocale,
        },
      };
    }

    /**
     * Gắn planSlotKey cho template_draft của một slot trong kế hoạch nội dung.
     * Giá trị này được lưu xuống `ai_chat_messages.data` và là DANH TÍNH duy nhất để
     * dựng lại luồng soạn sau khi người dùng tải lại trang.
     */
    if (finalResponse?.type === 'template_draft' && finalResponse.data) {
      if (!finalResponse.data.planSlotKey) {
        // Chỉ nhận cờ tường minh từ client; không suy ngược từ chữ của prompt nữa.
        if (planSlotKey) finalResponse.data.planSlotKey = planSlotKey;
      }
    }

    // PR-B: Enforce user's selected schedule on content_plan and confirm_create
    let planChange = null;
    if (finalResponse?.type === 'content_plan' && finalResponse.data) {
      const schedule = gateState?.schedule;
      if (schedule?.mode === 'drip' && schedule?.days) {
        const expectedDays = Number(schedule.days);
        if (Number.isFinite(expectedDays) && expectedDays > 0 && Array.isArray(finalResponse.data.days)) {
          if (finalResponse.data.days.length > expectedDays) {
            finalResponse.data.days = finalResponse.data.days.slice(0, expectedDays);
            finalResponse.data.totalDays = expectedDays;
            if (typeof finalResponse.content === 'string') {
              const notice = locale === 'en'
                ? ` (Plan automatically adjusted to ${expectedDays} day(s) according to your schedule preference.)`
                : ` (Kế hoạch đã được tự động điều chỉnh còn đúng ${expectedDays} ngày theo lựa chọn của bạn.)`;
              if (!finalResponse.content.includes('tự động điều chỉnh') && !finalResponse.content.includes('automatically adjusted')) {
                finalResponse.content = finalResponse.content.trim() + notice;
              }
            }
          }
        }
      }
      gatesForPersist.hasContentPlan = true;
      gatesForPersist.planApproved = false;
      planChange = {
        planChanged: true,
        planSnapshot: finalResponse.data,
        planSourcePrompt: findOriginalCampaignPrompt(history),
        planRequiresApproval: finalResponse.data?.requiresApproval !== false,
      };
    }

    // Rà soát C P2-7 — lưới CUỐI cho nguồn "lead của landing" (cổng `landingLeads` đã chặn ở trên nếu nguồn là landing mà chưa chọn; đây là
    // lớp thứ hai cho ca model tự dựng node `read_landing_leads` ngoài wizard). Đã chọn → ghi đúng lựa chọn lên mọi node lead landing
    // (đè slug model tự điền, đổi nguồn "khách DB" thành lead landing nếu model bỏ qua dataSource). CHƯA chọn mà node có slug rỗng
    // (= mọi lead của mọi landing) → KHÔNG xác nhận, hỏi lại thẻ chọn landing.
    let gateAskedFinal = guarded.gateAsked;
    if ((finalResponse?.type === 'confirm_create' || finalResponse?.type === 'create_and_run') && finalResponse.data) {
      const landingScript = finalResponse.data.script && Array.isArray(finalResponse.data.script.nodes)
        ? finalResponse.data.script
        : finalResponse.data;
      const landingChoice = resolveLandingAudienceChoice(landingScript, gateState);
      if (landingChoice.status === 'needs_choice') {
        const landingPicker = await aiPromptResources.getLandingPickerOptions(ownerId);
        const landingGate = buildLandingLeadsGate(landingPicker, gateState, locale);
        finalResponse = landingGate.response;
        gateAskedFinal = landingGate.gate;
      } else if (landingChoice.status === 'applied') {
        console.log(`[AI] Landing: ghi lựa chọn của người dùng lên ${landingChoice.updatedNodes} node read_landing_leads, đổi ${landingChoice.convertedNodes} node khách DB`);
      }
    }

    if ((finalResponse?.type === 'confirm_create' || finalResponse?.type === 'create_and_run') && finalResponse.data) {
      const targetScript = finalResponse.data.script || finalResponse.data;
      if (targetScript && Array.isArray(targetScript.nodes) && Array.isArray(targetScript.connections)) {
        // PLAN_COMPILER_GD5_DON_DEP_2026-09-08 PR-1 mục 1.1: targetScript.compilerApplied
        // === true nghĩa là graph này đã đến từ compileCampaign() (có thể mang qua từ một
        // lượt trước trong cùng phiên) — campaignCompilerPatchNoop.spec.js chứng minh 11
        // nhánh [AI Patch] cũ là no-op tuyệt đối trên graph đó, nên bỏ qua an toàn (Bẫy 7:
        // xoá if này thì test phải rớt).
        if (targetScript.compilerApplied === true) {
          console.log('[AI Patch] skip: compilerApplied');
        } else {
          console.log(
            '[AI Patch][gate] senderAccountId=',
            gateState?.senderAccountId,
            'channel=',
            gateState?.channel,
            'gateKeys=',
            Object.keys(gateState || {})
          );
          aiCampaignDraftService.patchDeterministicCampaignScript(targetScript, {
            senderAccountId: gateState?.senderAccountId,
            dataSource: gateState?.dataSource,
            sheetUrl: gateState?.sheetUrl,
            zaloGroupIds: gateState?.zaloGroupIds,
            zaloFriendIds: gateState?.zaloFriendIds,
            // Chỉ truyền khi CÓ slug đã chọn: mảng rỗng là truthy trong bản vá (`if (effectiveLandingSlug)`) và sẽ xoá slug model điền.
            landingPageSlug: gateState?.landingPageSlug
              || (Array.isArray(gateState?.landingLeadsSlugs) && gateState.landingLeadsSlugs.length > 0 ? gateState.landingLeadsSlugs : undefined),
            defaultZaloAccountId: firstZaloAccountId,
            channel: gateState?.channel,
            schedule: gateState?.schedule,
          });
        }

        // Giai đoạn 2 - Việc 2.3: Shadow compare graph của compiler với script cũ
        runCompilerShadowCompare({
          legacyScript: targetScript,
          gateState,
          brief: briefForState || null,
        });

        // PR-10 (C P2-2): quyết định của compiler ở lượt này, đặt vào `data.compiler = { applied, reason }` sau khối try/catch dưới — để biết (bằng
        // SQL trên ai_chat_messages.data) compiler có thật sự dựng graph không và vì sao không, thay vì chỉ có dòng console.log mất mỗi lần deploy.
        // reason: intent_incomplete | flow_disabled | audience_filters | slot_filling | slot_filling_failed | merge | merge_failed | empty_content | merge_error
        let compilerDecision = null;

        // Giai đoạn 4 & PLAN_BAT_CO_ZALO_GROUP: Bật cờ compiler theo từng luồng
        try {
          const enabledFlows = (process.env.COMPILER_ENABLED_FLOWS || '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          const slotFillingFlows = (process.env.COMPILER_SLOT_FILLING_FLOWS || '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          // CẢNH BÁO TÊN BIẾN: hàm này đã có sẵn tham số `intent` — đó là CHUỖI phân loại ý
          // định (so với 'content_plan_request' ở dòng 397), KHÔNG phải CampaignIntentV1.
          // Bản đầu dùng nhầm biến đó nên `isCompilableIntent` luôn trả false và compiler
          // KHÔNG BAO GIỜ chạy — một no-op im lặng, log ra lý do trông rất hợp lý.
          // Phải tự dựng intent có cấu trúc, giống cách runCompilerShadowCompare làm bên trong.
          // P8a — kênh adapter chưa có tài khoản được chốt mà workspace chỉ có ĐÚNG 1 tài khoản dùng được → dùng nó.
          let gateStateForIntent = gateState;
          if (isAdapterCampaignChannel(gateState?.channel) && gateState?.senderAccountId == null) {
            const onlyAccountId = await this._resolveOnlyAdapterAccountId(ownerId, gateState.channel);
            if (onlyAccountId != null) gateStateForIntent = { ...gateState, senderAccountId: onlyAccountId };
          }
          const { intent: campaignIntent } = deriveIntent(gateStateForIntent, briefForState || null, { files });

          const compilableCheck = isCompilableIntent(campaignIntent);
          // Script LLM có bộ lọc người nhận (đã mua/chưa mua/quan tâm khoá, loại khách, giới hạn) mà compiler chưa biểu diễn
          // được: compiler sẽ dựng lại thành "mọi khách ≤1000" và thẻ xác nhận không cho thấy. Chỉ xét nguồn "khách trong DB".
          const legacyAudienceFilters = campaignIntent.audience?.type === 'db'
            ? detectLegacyAudienceFilters(targetScript)
            : { hasFilters: false, reasons: [] };
          const isCompilerActive =
            enabledFlows.includes(campaignIntent.channel) || slotFillingFlows.includes(campaignIntent.channel);

          if (!compilableCheck.ok) {
            console.log(`[CampaignCompiler] Giữ script LLM cũ — intent khuyết trường: ${compilableCheck.missing.join(', ')}${compilableCheck.reasons ? ` (${Object.entries(compilableCheck.reasons).map(([k, v]) => `${k}: ${v}`).join('; ')})` : ''}`);
            compilerDecision = { applied: false, reason: 'intent_incomplete' };
          } else if (!isCompilerActive) {
            // Luồng chưa bật cờ
            compilerDecision = { applied: false, reason: 'flow_disabled' };
          } else if (legacyAudienceFilters.hasFilters) {
            compilerDecision = { applied: false, reason: 'audience_filters' };
            // Giữ script LLM (rà soát C P1-3): đây là đường an toàn như trước khi có compiler.
            console.log(
              `[CampaignCompiler] Giữ script LLM cũ — script có bộ lọc người nhận compiler chưa biểu diễn được (audience.filters): ${legacyAudienceFilters.reasons.join(', ')}`
            );
          } else {
            // Dùng `campaignIntent` (object CampaignIntentV1 dựng ở trên), KHÔNG phải `intent`
            // — xem CẢNH BÁO TÊN BIẾN cách đây vài dòng. Truyền nhầm `intent` ở đây làm
            // compileCampaign ném "Cannot compile incomplete intent: missing intent", bị catch
            // bên dưới nuốt thành log "Giữ script LLM cũ", nên compiler KHÔNG BAO GIỜ chạy.
            // Đo trên production 06/09: cờ zalo_group bật từ 31/08 nhưng audit_logs không có
            // một dòng via='ai_compiler' nào trong 7 ngày — đây chính là nguyên nhân.
            //
            // PR-5b-2b — audience landing có ĐÚNG 1 slug và slug đó có Biểu mẫu gắn (PR-5b-2a) →
            // biên dịch bằng read_form_submissions thay vì read_landing_leads (quyết định đầy đủ ở
            // landingAudienceResolver.service.js, test trực tiếp ở đó — không cần dựng cả pipeline
            // chat để kiểm). GHI CHÚ: deriveIntent (campaignIntent.schema.js) hiện KHÔNG populate
            // audience.slugs cho landing từ gateState (lỗ có trước PR-6c, ngoài phạm vi PR này) nên
            // nhánh này hiện chưa có đường thực tế nào tới được — vẫn nối đúng chỗ theo yêu cầu
            // plan, sẽ tự chạy khi lỗ đó được vá riêng.
            const compilableIntent = await applyLandingAudienceResolution(campaignIntent, ownerId);
            const compiledGraph = compileCampaign(compilableIntent);

            let slotFillingSucceeded = false;
            // Giai đoạn 4: LLM Content Slot Filling
            if (
              slotFillingFlows.includes(campaignIntent.channel) &&
              Array.isArray(compiledGraph.contentSlots) &&
              compiledGraph.contentSlots.length > 0
            ) {
              try {
                const fillRes = await fillContentSlots({
                  compiledGraph,
                  campaignIntent,
                  brief: briefForState || null,
                  // Câu yêu cầu THẬT + sản phẩm đã giải + hồ sơ DN: trước đây `userPrompt` bị fillContentSlots bỏ qua và
                  // brief thật không có `topic` nên tin Zalo nhóm bị viết "mù" (sự cố 20–26/09/2026).
                  userPrompt: intentPrompt || lastUserText || '',
                  resolvedProducts: resolvedBriefProducts,
                  businessProfileText: contextBlock,
                  // `userId` / `requestedModel` là tham số Ở MỨC NGOÀI của fillContentSlots. Bản cũ lồng chúng trong `options: {…}`
                  // mà hàm không đọc → luôn null: chọn model không theo người dùng và token `campaign_slots` không có chủ.
                  userId,
                  requestedModel: model,
                });

                const filledScript = fillRes.filledGraph || fillRes.script;
                if (fillRes.success && filledScript) {
                  assertNoEmptyContent(filledScript);

                  if (finalResponse.data?.script) {
                    finalResponse.data.script.nodes = filledScript.nodes;
                    finalResponse.data.script.connections = filledScript.connections;
                    finalResponse.data.script.compilerApplied = true;
                    finalResponse.data.script._via = 'ai_compiler_slot_filling';
                  }
                  if (Array.isArray(finalResponse.data?.nodes)) {
                    finalResponse.data.nodes = filledScript.nodes;
                    finalResponse.data.connections = filledScript.connections;
                    finalResponse.data.compilerApplied = true;
                    finalResponse.data._via = 'ai_compiler_slot_filling';
                  }
                  targetScript.nodes = filledScript.nodes;
                  targetScript.connections = filledScript.connections;
                  targetScript.compilerApplied = true;
                  targetScript._via = 'ai_compiler_slot_filling';

                  slotFillingSucceeded = true;
                  compilerDecision = { applied: true, reason: 'slot_filling' };
                  console.log(
                    `[CampaignCompiler] ✅ Đã áp dụng Slot Filling cho luồng ${campaignIntent.channel} (via: ai_compiler_slot_filling)`
                  );
                } else {
                  console.warn(
                    `[CampaignCompiler] Slot Filling không thành công (${fillRes.error || 'unknown'}), fail-open về mergeCompiledWithContent`
                  );
                }
              } catch (slotErr) {
                console.warn(
                  `[CampaignCompiler] Lỗi khi thực hiện Slot Filling: ${slotErr.message}, fail-open về mergeCompiledWithContent`
                );
              }
            }

            if (!slotFillingSucceeded && !enabledFlows.includes(campaignIntent.channel)) {
              // Luồng chỉ bật Slot Filling (không bật merge) mà Slot Filling không thành công → giữ script LLM.
              compilerDecision = { applied: false, reason: 'slot_filling_failed' };
            }

            if (!slotFillingSucceeded && enabledFlows.includes(campaignIntent.channel)) {
              const { script: mergedScript, unmatchedSlots } = mergeCompiledWithContent(compiledGraph, targetScript);

              if (unmatchedSlots.length > 0) {
                console.warn(`[CampaignCompiler] Giữ script LLM cũ — merge_failed có ${unmatchedSlots.length} slot chưa khớp`);
                compilerDecision = { applied: false, reason: 'merge_failed' };
              } else {
                assertNoEmptyContent(mergedScript);

                if (finalResponse.data?.script) {
                  finalResponse.data.script.nodes = mergedScript.nodes;
                  finalResponse.data.script.connections = mergedScript.connections;
                  finalResponse.data.script.compilerApplied = true;
                  finalResponse.data.script._via = 'ai_compiler';
                }
                if (Array.isArray(finalResponse.data?.nodes)) {
                  finalResponse.data.nodes = mergedScript.nodes;
                  finalResponse.data.connections = mergedScript.connections;
                  finalResponse.data.compilerApplied = true;
                  finalResponse.data._via = 'ai_compiler';
                }
                targetScript.nodes = mergedScript.nodes;
                targetScript.connections = mergedScript.connections;
                targetScript.compilerApplied = true;
                targetScript._via = 'ai_compiler';
                compilerDecision = { applied: true, reason: 'merge' };

                console.log(`[CampaignCompiler] ✅ Đã áp dụng graph Compiler cho luồng ${campaignIntent.channel} (via: ai_compiler)`);
              }
            }
          }
        } catch (compilerApplyErr) {
          const reason = compilerApplyErr.code === 'EMPTY_CONTENT' ? 'empty_content' : 'merge_error';
          console.warn(`[CampaignCompiler] Giữ script LLM cũ — lỗi ${reason}: ${compilerApplyErr.message}`);
          compilerDecision = { applied: false, reason };
        }
        if (compilerDecision && finalResponse.data && typeof finalResponse.data === 'object') {
          finalResponse.data.compiler = compilerDecision;
        }
      }

      const schedule = gateState?.schedule;
      let maxSteps = null;
      if (schedule?.mode === 'drip' && schedule?.days) {
        const days = Number(schedule.days);
        const slotsPerDay = Number(schedule.slotsPerDay) || 1;
        if (Number.isFinite(days) && days > 0) {
          maxSteps = days * slotsPerDay;
        }
      } else if (schedule?.mode === 'once') {
        maxSteps = 1;
      }

      if (maxSteps) {
        const nodes = Array.isArray(finalResponse.data?.nodes)
          ? finalResponse.data.nodes
          : (Array.isArray(finalResponse.data?.script?.nodes) ? finalResponse.data.script.nodes : null);

        if (Array.isArray(nodes)) {
          for (const node of nodes) {
            const cfg = node.config || node.nodeConfig || {};
            if (Array.isArray(cfg.emailSteps) && cfg.emailSteps.length > maxSteps) {
              cfg.emailSteps = cfg.emailSteps.slice(0, maxSteps);
            }
            if (Array.isArray(cfg.zaloPersonalTemplateSteps) && cfg.zaloPersonalTemplateSteps.length > maxSteps) {
              cfg.zaloPersonalTemplateSteps = cfg.zaloPersonalTemplateSteps.slice(0, maxSteps);
            }
            if (Array.isArray(cfg.zaloGroupTemplateSteps) && cfg.zaloGroupTemplateSteps.length > maxSteps) {
              cfg.zaloGroupTemplateSteps = cfg.zaloGroupTemplateSteps.slice(0, maxSteps);
            }
            node.config = cfg;
          }
        }
      }
    }

    if (finalResponse?.type === 'landing_page' && finalResponse.data) {
      const landingPrompt = String(
        finalResponse.data.prompt || finalResponse.content || lastUserText || ''
      ).trim();
      const landingContentLocale = resolvedLocaleContext?.contentLocale || locale || 'vi';
      if (deferLandingGeneration) {
        // Chỉ trả Ý ĐỊNH: prompt đã chuẩn bị + tên gợi ý + ngôn ngữ. Model không được viết html (prompt đã cấm), nếu lỡ có thì bỏ — trang
        // chỉ do route sinh (có chốt an toàn / tự kiểm) tạo ra. Controller gắn thêm danh sách tệp của lượt (đã promote) trước khi trả.
        const { html: _modelHtml, css: _modelCss, ...intentData } = finalResponse.data;
        finalResponse = {
          ...finalResponse,
          data: {
            ...intentData,
            prompt: landingPrompt,
            title: String(finalResponse.data.title || '').trim(),
            contentLocale: landingContentLocale,
            needsGeneration: true,
          },
        };
      } else {
        const generated = await aiLandingPageService.generate({
          userId: ownerId,
          actorUserId: userId,
          prompt: landingPrompt,
          titleHint: String(finalResponse.data.title || '').trim(),
          contentLocale: landingContentLocale,
        });
        finalResponse = {
          ...finalResponse,
          data: {
            ...finalResponse.data,
            title: generated.title,
            html: generated.html,
          },
        };
      }
    }

    const _wizard = buildWizard(gateAskedFinal, planChange);
    return {
      ...withDeadEndNudge(finalResponse, _wizard.meta, gateAskedFinal, locale),
      _wizard,
    };
  }
}

export default new AiCampaignService();
