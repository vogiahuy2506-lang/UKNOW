import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';
import unifiedInboxRepository from '../../repositories/ai/unifiedInbox.repository.js';
import ragEngineService from './ragEngine.service.js';
import subAssistantService from './subAssistant.service.js';
import webChatAdapter from './channelAdapters/webChat.adapter.js';
import zaloOAAdapter from './channelAdapters/zaloOA.adapter.js';
import facebookAdapter from './channelAdapters/facebook.adapter.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';
import whatsappAdapter from './channelAdapters/whatsapp.adapter.js';
import telegramAdapter from './channelAdapters/telegram.adapter.js';
import businessProfileService from '../ai/businessProfile.service.js';
import { stripMarkdown } from '../../utils/aiResponseFormatter.util.js';
import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import { CHAT_REPLY_BUDGET } from '../../utils/aiReplyBudget.util.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import aiCreditMeter, {
  VISITOR_CHAT_UNAVAILABLE_MESSAGE,
  VISITOR_CHAT_ERROR_MESSAGE,
} from '../ai/aiCreditMeter.service.js';
import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';
import { extractContacts } from '../../utils/contactDetect.util.js';
import { buildContactAck } from '../../utils/contactAck.util.js';
import { buildChatbotSystemPrompt } from '../../utils/chatbotSystemPrompt.util.js';
import chatbotContactAlertRepository from '../../repositories/chatbot/chatbotContactAlert.repository.js';
import { handleAiUnavailable } from './aiUnavailableNotice.service.js';
import { classifyAiFailure } from '../../utils/aiUnavailable.util.js';

const ADAPTERS = {
  web: webChatAdapter,
  zalo_oa: zaloOAAdapter,
  facebook: facebookAdapter,
  zalo_personal: zaloPersonalAdapter,
  whatsapp: whatsappAdapter,
  telegram_personal: telegramAdapter,
};

const MAX_HISTORY_MESSAGES = 20;

/**
 * Kênh được `_logMessage` ghi vào `channel_messages` (conversationId = id `channel_conversations`).
 * Danh sách TƯỜNG MINH, kênh nào không có trong đây thì BỎ QUA — không còn nhánh `else` ghi bừa.
 * Hiện không có đường sống nào đi qua nhánh này: Zalo OA / Facebook / WhatsApp Cloud gọi `routeChatbotMessage`
 * (không gọi `_logMessage`, controller tự ghi `chatbot_messages`), Telegram và WhatsApp Baileys tự ghi tin.
 */
const CHANNEL_CONVERSATION_LOG_CHANNELS = new Set(['zalo_oa', 'facebook']);

class ChatRouterService {
  /**
   * Route message with pre-fetched chatbot settings (for Zalo per-account settings).
   * Optimized: parallelizes independent operations.
   *
   * @param {object} params
   * @param {string} params.channel - 'zalo_personal'
   * @param {number} params.userId
   * @param {string} params.message - raw user message
   * @param {string} [params.conversationId] - internal conversation ID
   * @param {object} [params.visitorInfo] - visitor metadata
   * @param {object} params.chatbotSettings - pre-fetched chatbot settings for this account
   */
  async routeMessageWithSettings({ channel, userId, message, conversationId, chatbotSettings, visitorInfo = {}, beforeMessageId = null, throughMessageId = null, excludeMessageIds = [], chatbotId = null, sessionResetAt = null }) {
    const adapter = ADAPTERS[channel];
    if (!adapter) throw new Error(`Unknown channel: ${channel}`);

    console.log(`[ChatRouter] routeMessageWithSettings: channel=${channel}, userId=${userId}, chatbotId=${chatbotId ?? 'null'}, conversationId=${conversationId}, sessionResetAt=${sessionResetAt}`);

    // Skip if chatbot is disabled
    if (!chatbotSettings?.is_enabled) {
      console.warn(`[ChatRouter] SKIP — chatbot disabled (channel=${channel}, userId=${userId}, chatbotId=${chatbotId ?? 'null'}, conversationId=${conversationId})`);
      return { type: 'disabled', content: null };
    }

    const creditFeature = `chatbot_${channel}`;
    const creditPrep = await this._prepareChatCredit(userId, creditFeature);
    if (creditPrep.visitorMessage) {
      // Hết credit / hết gói: câu xin lỗi mang NHÃN `ai_unavailable` (không tính là AI trả lời), báo chủ qua email, và tối
      // đa 1 lần / khách / 6 giờ (G3b, A P1-6). Bị chặn do khách đã nhận rồi → content null, caller không gửi gì.
      const unavailable = await this._unavailableReply({
        ownerUserId: userId,
        channel,
        conversationId,
        reason: creditPrep.unavailableReason,
        content: creditPrep.visitorMessage,
      });
      return { type: unavailable.content ? 'text' : 'suppressed', ...unavailable };
    }

    // PARALLEL: Get history, subAssistant, and profileContext (all independent)
    const [history, subAssistant, profileContext] = await Promise.all([
      this._getHistory(channel, conversationId, MAX_HISTORY_MESSAGES, { beforeMessageId, throughMessageId, excludeMessageIds, sessionResetAt }),
      chatbotSettings.id_sub_assistant
        ? subAssistantService.getById(chatbotSettings.id_sub_assistant, userId)
        : Promise.resolve(null),
      businessProfileService.getFormattedProfileForPrompt(userId).catch(() => ''),
    ]);

    console.log(`[ChatRouter] Got ${history.length} history messages for conversationId=${conversationId}`);

    // Get linked KB id (depends on subAssistant, but fast)
    const linkedKbId = subAssistant ? await this._getLinkedKbId(subAssistant, userId) : null;

    // Build RAG context (uses cached embeddings, ~100-200ms typically).
    // When this is a per-chatbot call (chatbotId provided), prefer the chatbot's
    // local KB (custom_chatbot_chunks) — matches web path behaviour after the
    // sub_assistant indirection was dropped from custom_chatbots. Fall back to
    // the channel-level KB for legacy rows that still wire through
    // sub_assistants.
    const ragContext = await ragEngineService.buildContext(userId, message, {
      kbId: linkedKbId,
      customChatbotId: chatbotId,
    });

    const extractedContacts = extractContacts(message);
    let contactAck = null;
    if (extractedContacts.length > 0) {
      const ownerContact = await chatbotContactAlertRepository.getOwnerContact(userId);
      contactAck = buildContactAck(extractedContacts, ownerContact);
    }

    // Build system prompt with per-account settings
    const isFirstMessage = history.length === 0;
    const systemPrompt = this.buildSystemPrompt({
      subAssistant,
      settings: chatbotSettings,
      ragContext,
      profileContext,
      isFirstMessage,
      contactNote: contactAck?.note || null,
    });

    let aiResponse;
    let shouldChargeCredit = false;
    let unavailableReason = null;
    try {
      aiResponse = await this._callAI({
        userId,
        systemPrompt,
        history,
        message,
        model: chatbotSettings.ai_model || 'gemini-2.5-flash',
        temperature: parseFloat(chatbotSettings.temperature || 0.7),
        maxTokens: chatbotSettings.max_tokens || 2048,
      });
      shouldChargeCredit = true;
    } catch (error) {
      if (!aiUsageMeter.isLimitError(error) && !aiCreditMeter.isLimitError(error)) {
        // providerMessage = câu gốc của Google khi lõi đã đổi `message` sang câu tiếng Việt — log vẫn phải đọc được nguyên nhân thật.
        console.error(`[ChatRouter] AI generation failed (channel=${channel}, userId=${userId}, chatbotId=${chatbotId ?? 'null'}, conversationId=${conversationId}):`, error.providerMessage || error.message);
      } else {
        console.warn(`[ChatRouter] AI limit reached (channel=${channel}, userId=${userId}): ${error.message}`);
      }
      unavailableReason = classifyAiFailure(error);
    }

    if (unavailableReason) {
      // AI lỗi / chạm hạn mức giữa chừng: cùng cách xử lý như hết credit. Lời xác nhận liên hệ (nếu khách để lại SĐT/email)
      // vẫn phải đến được khách dù câu xin lỗi bị chặn vì đã gửi trong 6 giờ qua.
      const unavailable = await this._unavailableReply({
        ownerUserId: userId,
        channel,
        conversationId,
        reason: unavailableReason,
        content: VISITOR_CHAT_ERROR_MESSAGE,
        footer: contactAck?.footer || null,
      });
      await this._logMessage(channel, conversationId, userId, { role: 'visitor', content: message });
      if (unavailable.content) {
        await this._logMessage(channel, conversationId, userId, {
          role: 'bot',
          content: unavailable.content,
          metadata: { source: unavailable.source, reason: unavailable.reason },
        });
      }
      return { type: unavailable.content ? 'text' : 'suppressed', ...unavailable };
    }

    if (shouldChargeCredit) {
      await this._chargeChatCredit(userId, creditFeature, creditPrep.creditContext);
    }

    // Strip markdown formatting before sending (Zalo cannot render markdown)
    let cleanResponse = stripMarkdown(aiResponse.text);
    if (contactAck?.footer) {
      cleanResponse = `${cleanResponse.trim()}\n\n${contactAck.footer}`;
    }

    // Log messages
    await this._logMessage(channel, conversationId, userId, { role: 'visitor', content: message });
    await this._logMessage(channel, conversationId, userId, { role: 'bot', content: cleanResponse });

    return { type: 'text', content: cleanResponse };
  }

  async _prepareChatCredit(userId, feature) {
    try {
      const creditContext = await aiCreditMeter.assertAvailable(userId);
      return { creditContext };
    } catch (error) {
      if (aiCreditMeter.isLimitError(error)) {
        console.warn(`[ChatRouter] Owner ${userId} out of AI credits (feature=${feature})`);
        return { visitorMessage: VISITOR_CHAT_UNAVAILABLE_MESSAGE, unavailableReason: classifyAiFailure(error) };
      }
      throw error;
    }
  }

  /**
   * Câu xin lỗi gửi cho khách khi bot không trả lời được (hết credit / hết gói / chạm hạn mức / AI lỗi) — G3b, A P1-6.
   * Một chỗ duy nhất quyết: có gửi không (tối đa 1 lần / khách / 6 giờ), nhãn gì (`source: 'ai_unavailable'`), và có báo
   * chủ không (email, nguội 24 giờ). Không bao giờ ném lỗi — DB/SMTP hỏng thì vẫn gửi câu xin lỗi như cũ.
   *
   * @param {{ ownerUserId: number, channel: string, conversationId: string|number|null, reason: string, content: string, footer?: string|null }} p
   * @returns {Promise<{ content: string|null, source: string, reason: string }>} content null = đã xin lỗi khách này trong 6 giờ, KHÔNG gửi nữa
   */
  async _unavailableReply({ ownerUserId, channel, conversationId, reason, content, footer = null }) {
    const notice = await handleAiUnavailable({ ownerUserId, reason, channel, conversationId });
    const text = [notice.send ? String(content || '').trim() : '', footer ? String(footer).trim() : '']
      .filter(Boolean)
      .join('\n\n');
    return { content: text || null, source: notice.source, reason: notice.reason };
  }

  async _chargeChatCredit(userId, feature, creditContext) {
    await aiCreditMeter.consume(userId, { feature, creditContext });
  }

  /**
   * Build system prompt shared by ALL channels (web, zalo_oa, zalo_personal,
   * facebook, telegram_personal, whatsapp, whatsapp_baileys).
   *
   * Thân hàm nằm ở `utils/chatbotSystemPrompt.util.js` (A P2-5: đường web `customChatService`
   * dùng chung đúng khung này) — method giữ lại để mọi caller/test cũ không đổi.
   *
   * @param {object} params xem `buildChatbotSystemPrompt`
   * @returns {string}
   */
  buildSystemPrompt(params) {
    return buildChatbotSystemPrompt(params);
  }

  /**
   * Backward-compatible alias. Cũ gọi `_buildSystemPrompt(args)` vẫn hoạt
   * động (chatbot default undefined → rơi vào fallback 'Tro li AI'). Giữ
   * để không phá unit test cũ hoặc caller nào gọi qua tên cũ.
   */
  _buildSystemPrompt(args) {
    return this.buildSystemPrompt(args);
  }

  async _callAI({ userId, systemPrompt, history, message, model, temperature, maxTokens }) {
    // Map DB role to Gemini role:
    // - 'visitor' (user message) → 'user'
    // - 'bot' or 'agent' (AI/bot response) → 'model'
    const chatHistory = history.map(m => ({
      role: (m.role === 'bot' || m.role === 'agent') ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    chatHistory.push({ role: 'user', parts: [{ text: message }] });

    console.log(`[ChatRouter] _callAI: sending ${chatHistory.length} messages (${chatHistory.filter(m => m.role === 'model').length} from model, ${chatHistory.filter(m => m.role === 'user').length} from user)`);

    const modelName = await resolveAllowedModel(userId, model);

    const systemInstruction = { parts: [{ text: systemPrompt }] };
    const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
      contents: chatHistory,
      systemInstruction,
      model: modelName,
      requestedMaxOutputTokens: maxTokens,
    });
    const fallbackModel = await aiUsageMeter.resolveFallbackModel();

    // Đi qua lõi dùng chung (G2.1, 03/10/2026): thử lại 429/5xx/lỗi mạng, model dự phòng do super admin chọn, huỷ fetch
    // THẬT khi hết ngân sách 25 giây. Bản cũ gọi `fetch` thô — chỉ thử lại khi model từ chối thinkingBudget, và
    // `Promise.race` 30 giây không huỷ fetch nên Google trả lời muộn vẫn tính tiền mà sổ không có. Sự cố 24/09 (503 sau
    // 1,4 giây) làm MỌI khách Zalo/Telegram nhận ngay câu xin lỗi dù model dự phòng đã được chọn.
    // thinkingBudget 0 + nới trần khi model chỉ-thinking từ chối: lõi đã gánh (cùng hành vi cũ). topP null = giữ
    // nguyên cấu hình cũ của đường này (không gửi topP).
    console.log(`[ChatRouter] _callAI: posting to Gemini (model=${modelName}, fallback=${fallbackModel || 'none'}, history=${chatHistory.length})`);
    const t0 = Date.now();
    const result = await generateGeminiContent({
      contents: chatHistory,
      systemInstruction,
      model: modelName,
      fallbackModel,
      temperature,
      topP: null,
      maxOutputTokens,
      thinkingBudget: 0,
      ...CHAT_REPLY_BUDGET,
    });
    const textResponse = result.text;
    console.log(`[ChatRouter] _callAI: response after ${Date.now() - t0}ms (model=${result.modelUsed}), candidates=${result.raw?.candidates?.length || 0}, text-len=${textResponse.length}`);

    // Ghi token TRƯỚC khi kiểm câu trả lời rỗng: Google đã tính tiền lượt này dù model trả về không có chữ (chặn MAX_TOKENS,
    // bộ lọc an toàn…). Bản cũ ném lỗi trước `record` nên lượt rỗng tốn tiền mà sổ không có. Lượt rỗng vẫn KHÔNG trừ credit
    // (caller chỉ đặt shouldChargeCredit sau khi _callAI trả về bình thường). Ghi theo model THẬT đã trả lời (có thể là dự phòng).
    await aiUsageMeter.record(userId, result.usage, {
      feature: 'chatbot_reply',
      model: result.modelUsed || modelName,
    });
    if (!textResponse) throw new Error('AI returned empty response');
    return { text: textResponse };
  }

  async _getHistory(channel, conversationId, limit, options = {}) {
    if (!conversationId) return [];
    try {
      if (channel === 'web') {
        return chatbotRepository.getWebChatMessages(conversationId, { limit });
      }
      if (channel === 'zalo_personal') {
        return this._getZaloPersonalHistory(conversationId, limit, options);
      }
      if (channel === 'telegram_personal') {
        return this._getTelegramPersonalHistory(conversationId, limit, options);
      }
      return chatbotRepository.getChannelMessages(conversationId, { limit });
    } catch {
      return [];
    }
  }

  async _getTelegramPersonalHistory(conversationId, limit = 20, options = {}) {
    const normalizedOptions = typeof options === 'number' ? { beforeMessageId: options } : (options || {});
    const { beforeMessageId = null, throughMessageId = null, excludeMessageIds = [], sessionResetAt = null } = normalizedOptions;

    try {
      const db = (await import('../../config/database.js')).default;
      let query = `SELECT id, role, content, created_at
         FROM telegram_personal_messages
         WHERE id_conversation = $1`;
      const params = [conversationId];

      if (sessionResetAt) {
        params.push(sessionResetAt);
        query += ` AND created_at >= $${params.length}`;
      }
      if (beforeMessageId) {
        params.push(beforeMessageId);
        query += ` AND id < $${params.length}`;
      }
      if (throughMessageId) {
        params.push(throughMessageId);
        query += ` AND id <= $${params.length}`;
      }
      const excludedIds = Array.isArray(excludeMessageIds)
        ? excludeMessageIds.map(Number).filter(Number.isInteger)
        : [];
      if (excludedIds.length > 0) {
        params.push(excludedIds);
        // `id NOT IN ($n)` với $n là MẢNG làm Postgres ném "invalid input syntax for type integer"
        // ở mọi lượt (Telegram luôn truyền excludeMessageIds), rồi catch trả [] → bot mất trí nhớ và
        // chào lại ở mọi câu (03/10/2026, lỗi từ 22/09). Khuôn đúng: `<> ALL($n::integer[])`.
        query += ` AND id <> ALL($${params.length}::integer[])`;
      }

      // 20 tin MỚI nhất (DESC + LIMIT) rồi đảo về cũ → mới; `created_at ASC LIMIT` lấy 20 tin CŨ nhất.
      params.push(limit);
      query += ` ORDER BY id DESC LIMIT $${params.length}`;

      const { rows } = await db.query(query, params);
      // Map role: visitor → user, bot/agent → model (matches Gemini mapping).
      return rows.reverse().map((row) => ({
        role: row.role,
        content: row.content || '',
        id: row.id,
        createdAt: row.created_at,
      }));
    } catch (err) {
      // error (không phải warn): trả [] làm bot mất trí nhớ im lặng — lỗi này phải lộ ra trong log.
      console.error('[ChatRouter] _getTelegramPersonalHistory failed:', err.message);
      return [];
    }
  }

  async _getZaloPersonalHistory(conversationId, limit = 50, options = {}) {
    try {
      const normalizedOptions = typeof options === 'number' ? { beforeMessageId: options } : (options || {});
      const { beforeMessageId = null, throughMessageId = null, excludeMessageIds = [], sessionResetAt = null } = normalizedOptions;
      console.log(`[ChatRouter] _getZaloPersonalHistory: convId=${conversationId}, limit=${limit}, beforeMessageId=${beforeMessageId}, throughMessageId=${throughMessageId}, sessionResetAt=${sessionResetAt}`);
      const db = (await import('../../config/database.js')).default;
      let query = `SELECT id, role, content, metadata, created_at as createdAt
         FROM zalo_personal_messages
         WHERE id_conversation = $1`;
      const params = [conversationId];

      if (sessionResetAt) {
        params.push(sessionResetAt);
        query += ` AND created_at >= $${params.length}`;
      }
      if (beforeMessageId) {
        params.push(beforeMessageId);
        query += ` AND id < $${params.length}`;
      }
      if (throughMessageId) {
        params.push(throughMessageId);
        query += ` AND id <= $${params.length}`;
      }
      const excludedIds = Array.isArray(excludeMessageIds)
        ? excludeMessageIds.map(Number).filter(Number.isInteger)
        : [];
      if (excludedIds.length > 0) {
        params.push(excludedIds);
        query += ` AND id <> ALL($${params.length}::integer[])`;
      }
      params.push(limit);
      query += ` ORDER BY id DESC LIMIT $${params.length}`;

      const { rows } = await db.query(query, params);
      
      console.log(`[ChatRouter] _getZaloPersonalHistory: found ${rows.length} messages`);
      if (rows.length > 0) {
        console.log(`[ChatRouter] History range: oldestRole=${rows[rows.length - 1].role}, newestRole=${rows[0].role}`);
      }
      
      return rows.reverse().map(row => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
      }));
    } catch (e) {
      console.warn('[ChatRouter] _getZaloPersonalHistory error:', e.message, e.stack);
      return [];
    }
  }

  async _logMessage(channel, conversationId, userId, { role, content, metadata = undefined }) {
    if (!conversationId || !content) return;
    try {
      if (channel === 'web') {
        await chatbotRepository.addWebChatMessage(conversationId, userId, { role, content, ...(metadata ? { metadata } : {}) });
      } else if (channel === 'zalo_personal') {
        // For Zalo Personal, messages are already logged by zaloInbox.service
        // and zaloPersonalAdapter.sendReply() -> insertAgentMessage()
        // So we skip logging here to avoid duplicate entries
        console.log(`[ChatRouter] Skipping _logMessage for zalo_personal (already logged by zaloInbox)`);
      } else if (CHANNEL_CONVERSATION_LOG_CHANNELS.has(channel)) {
        // Chỉ kênh mà `conversationId` THẬT SỰ là id của `channel_conversations` mới ghi `channel_messages` ở đây.
        const channelId = await chatbotRepository.getChannelIdFromConversation(conversationId);
        if (channelId) {
          await chatbotRepository.addChannelMessage(conversationId, userId, channelId, {
            role,
            content,
            message_type: 'text',
            ...(metadata ? { metadata } : {}),
          });
        }
      } else {
        // telegram_personal / whatsapp (Baileys) / kênh lạ: đường của chúng đã tự ghi tin đúng bảng
        // (internal.routes.js recordTelegramMessage, whatsappBaileysInbox.persistMessage). `conversationId` ở đây
        // là id của bảng KHÁC (vd telegram_personal_conversations) — dùng nó tra `channel_conversations`
        // sẽ ghi tin của khách shop này vào hội thoại WhatsApp/Telegram cùng số id của shop khác (A P0-1).
        console.log(`[ChatRouter] Skipping _logMessage for ${channel} (đã tự ghi ở nơi khác)`);
      }
    } catch (e) {
      console.warn('[ChatRouter] Failed to log message:', e.message);
    }
  }

  // ── Public helpers ──────────────────────────────────────────────

  async _getLinkedKbId(subAssistant, userId) {
    try {
      const kbs = await knowledgeBaseRepository.findAllByUser(userId);
      const linked = kbs.find(
        kb => String(kb.id_sub_assistant) === String(subAssistant.id) && kb.is_active !== false
      );
      return linked?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Zalo OA / Facebook / WhatsApp Cloud (Studio). Trả `{ content }`; khi là câu xin lỗi (hết credit / AI lỗi) thêm
   * `source: 'ai_unavailable'` + `reason` để caller GẮN NHÃN vào tin bot nó ghi (G3b), và `content: null` nếu khách này đã
   * nhận câu xin lỗi trong 6 giờ qua (caller không gửi gì).
   */
  async routeChatbotMessage({ chatbotId, message, conversationId, beforeMessageId = null, throughMessageId = null, excludeMessageIds = [] }) {
    let ownerId = null;
    try {
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot) {
        throw new Error('Chatbot not found');
      }

      ownerId = chatbot.id_user;

      if (conversationId && await unifiedInboxRepository.isAiPaused(conversationId, 'channel')) {
        console.log(`[ChatRouter] AI paused for channel conversation ${conversationId}`);
        return { content: null, paused: true };
      }

      const creditPrep = await this._prepareChatCredit(ownerId, 'chatbot_widget');
      if (creditPrep.visitorMessage) {
        return this._unavailableReply({
          ownerUserId: ownerId,
          channel: 'studio_channel',
          conversationId,
          reason: creditPrep.unavailableReason,
          content: creditPrep.visitorMessage,
        });
      }

      const historyRows = await chatbotRepository.getConversationHistory(conversationId, MAX_HISTORY_MESSAGES, {
        beforeMessageId,
        throughMessageId,
        excludeMessageIds,
      });

      const chatHistory = (historyRows || []).reverse().map(m => ({
        role: m.role === 'bot' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // Bug 2.3 — custom_chatbot owns its KB locally (custom_chatbot_chunks), so
      // RAG queries that KB directly via chatbot_id. We no longer traverse
      // sub_assistant → knowledge_bases for the Studio path — the sub_assistant
      // indirection was removed (migration 166 dropped custom_chatbots.id_sub_assistant).
      // Hồ sơ + sản phẩm ĐANG BÁN của chủ (giống đường kênh :89-95) chạy song song với RAG — thiếu thì chatbot web/Studio
      // không biết tên/giá sản phẩm. Lỗi hồ sơ không được làm hỏng câu trả lời → rơi về ''.
      const [ragContext, profileContext] = await Promise.all([
        ragEngineService.buildContext(ownerId, message, {
          customChatbotId: chatbot.id,
        }).catch((err) => {
          console.warn('[ChatRouter] routeChatbotMessage: RAG buildContext failed:', err.message);
          return '';
        }),
        Promise.resolve()
          .then(() => businessProfileService.getFormattedProfileForPrompt(ownerId))
          .catch(() => ''),
      ]);

      // Build system prompt qua chatRouter.buildSystemPrompt chung để đồng bộ khung với các kênh khác
      // (anti-hallucination, luật "không tự nhận là WhatsApp/Zalo/...", chống lộ chỉ dẫn). Bản cũ chú thích ở đây nói
      // prompt có luật 'LUON xung ten la ${name}' — luật xưng tên đã BỎ có chủ ý ở c5d7bcdf (22/09), prompt chỉ còn dòng
      // định danh trung tính "trợ lý ảo của doanh nghiệp". `chatbot.description` hiện không được truyền vào khung.
      const ownSettings = {
        welcome_message: chatbot.welcome_message,
        // custom_chatbots.response_style có thật (migration 185) — thiếu/không hợp lệ thì
        // buildSystemPrompt tự rơi về 'friendly'.
        response_style: chatbot.response_style,
        system_instruction: chatbot.system_instruction,
      };
      const ownSubAssistant = chatbot.description
        ? {
            name: chatbot.name,
            greeting_msg: null,
            description: chatbot.description,
          }
        : null;
      const systemPrompt = this.buildSystemPrompt({
        subAssistant: ownSubAssistant,
        settings: ownSettings,
        chatbot: { name: chatbot.name },
        ragContext,
        profileContext,
        isFirstMessage: chatHistory.length === 0,
      });

      const response = await this._callAI({
        userId: ownerId,
        systemPrompt,
        history: chatHistory,
        message,
        model: await resolveAllowedModel(ownerId, process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
        temperature: chatbot.temperature || 0.7,
        maxTokens: chatbot.max_tokens || 2048,
      });

      await this._chargeChatCredit(ownerId, 'chatbot_widget', creditPrep.creditContext);

      return { content: stripMarkdown(response.text) };
    } catch (err) {
      console.error('[ChatRouter] routeChatbotMessage error:', err);
      // Chưa biết chủ (không tìm thấy chatbot) thì không có gì để báo/giới hạn — giữ câu lỗi như cũ.
      if (ownerId == null) return { content: VISITOR_CHAT_ERROR_MESSAGE };
      return this._unavailableReply({
        ownerUserId: ownerId,
        channel: 'studio_channel',
        conversationId,
        reason: classifyAiFailure(err),
        content: VISITOR_CHAT_ERROR_MESSAGE,
      });
    }
  }
}

export default new ChatRouterService();

