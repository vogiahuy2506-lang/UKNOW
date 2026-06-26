import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';
import ragEngineService from './ragEngine.service.js';
import subAssistantService from './subAssistant.service.js';
import webChatAdapter from './channelAdapters/webChat.adapter.js';
import zaloOAAdapter from './channelAdapters/zaloOA.adapter.js';
import facebookAdapter from './channelAdapters/facebook.adapter.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';
import businessProfileService from '../ai/businessProfile.service.js';
import { stripMarkdown } from '../../utils/aiResponseFormatter.util.js';
import { extractGeminiUsage } from '../../utils/geminiClient.util.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';

const ADAPTERS = {
  web: webChatAdapter,
  zalo_oa: zaloOAAdapter,
  facebook: facebookAdapter,
  zalo_personal: zaloPersonalAdapter,
};

const MAX_HISTORY_MESSAGES = 20;

class ChatRouterService {
  /**
   * Route an incoming message through the unified AI pipeline.
   * @param {object} params
   * @param {string} params.channel - 'web' | 'zalo_oa' | 'facebook' | 'zalo_personal'
   * @param {number} params.userId
   * @param {string} params.message - raw user message
   * @param {string} [params.conversationId] - internal conversation ID
   * @param {object} [params.visitorInfo] - visitor metadata
   * @param {Array} [params.attachments] - files/images
   */
  async routeMessage({ channel, userId, message, conversationId, visitorInfo = {}, attachments = [] }) {
    const adapter = ADAPTERS[channel];
    if (!adapter) throw new Error(`Unknown channel: ${channel}`);

    // 1. Get chatbot settings
    const settings = await chatbotRepository.getSettings(userId, channel);
    if (!settings?.is_enabled) {
      return { type: 'disabled', content: null };
    }

    // 2. Get sub-assistant info
    let subAssistant = null;
    if (settings.id_sub_assistant) {
      subAssistant = await subAssistantService.getById(settings.id_sub_assistant, userId);
    }

    // 3. Get conversation history for context
    const history = await this._getHistory(channel, conversationId, MAX_HISTORY_MESSAGES);

    // 4. Build RAG context from KB (use sub-assistant's linked KB or all KBs)
    const linkedKbId = subAssistant ? await this._getLinkedKbId(subAssistant, userId) : null;
    const ragContext = await ragEngineService.buildContext(userId, message, {
      kbId: linkedKbId,
    });

    // 5. Get business profile as fallback context
    let profileContext = '';
    try {
      profileContext = await businessProfileService.getFormattedProfileForPrompt(userId);
    } catch (e) {
      console.warn('[ChatRouter] No business profile context:', e.message);
    }

    // 6. Build system prompt
    const isFirstMessage = history.length === 0;
    const systemPrompt = this._buildSystemPrompt({
      subAssistant,
      settings,
      ragContext,
      profileContext,
      isFirstMessage,
    });

    let aiResponse;
    try {
      aiResponse = await this._callAI({
        userId,
        systemPrompt,
        history,
        message,
        model: settings.ai_model || 'gemini-2.5-flash',
        temperature: parseFloat(settings.temperature || 0.7),
        maxTokens: settings.max_tokens || 2048,
      });
    } catch (error) {
      if (!aiUsageMeter.isLimitError(error)) throw error;
      aiResponse = { text: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.' };
    }

    // 8. Strip markdown formatting before sending (Zalo cannot render markdown)
    const cleanResponse = stripMarkdown(aiResponse.text);
    await this._logMessage(channel, conversationId, userId, { role: 'visitor', content: message });
    await this._logMessage(channel, conversationId, userId, { role: 'bot', content: cleanResponse });

    if (adapter.sendReply) {
      await adapter.sendReply({ conversationId, message: cleanResponse, attachments });
    }

    return { type: 'text', content: cleanResponse };
  }

  /**
   * Route message with pre-fetched chatbot settings (for Zalo per-account settings).
   * @param {object} params
   * @param {string} params.channel - 'zalo_personal'
   * @param {number} params.userId
   * @param {string} params.message - raw user message
   * @param {string} [params.conversationId] - internal conversation ID
   * @param {object} [params.visitorInfo] - visitor metadata
   * @param {object} params.chatbotSettings - pre-fetched chatbot settings for this account
   */
  async routeMessageWithSettings({ channel, userId, message, conversationId, chatbotSettings, visitorInfo = {} }) {
    const adapter = ADAPTERS[channel];
    if (!adapter) throw new Error(`Unknown channel: ${channel}`);

    console.log(`[ChatRouter] routeMessageWithSettings: channel=${channel}, userId=${userId}, conversationId=${conversationId}, message="${String(message).substring(0, 50)}"`);

    // Skip if chatbot is disabled
    if (!chatbotSettings?.is_enabled) {
      return { type: 'disabled', content: null };
    }

    // Get sub-assistant info if configured
    let subAssistant = null;
    if (chatbotSettings.id_sub_assistant) {
      subAssistant = await subAssistantService.getById(chatbotSettings.id_sub_assistant, userId);
    }

    // Get conversation history for context
    const history = await this._getHistory(channel, conversationId, MAX_HISTORY_MESSAGES);
    console.log(`[ChatRouter] Got ${history.length} history messages for conversationId=${conversationId}`);

    // Build RAG context from KB
    const linkedKbId = subAssistant ? await this._getLinkedKbId(subAssistant, userId) : null;
    const ragContext = await ragEngineService.buildContext(userId, message, {
      kbId: linkedKbId,
    });

    // Get business profile as fallback context
    let profileContext = '';
    try {
      profileContext = await businessProfileService.getFormattedProfileForPrompt(userId);
    } catch (e) {
      console.warn('[ChatRouter] No business profile context:', e.message);
    }

    // Build system prompt with per-account settings
    const isFirstMessage = history.length === 0;
    const systemPrompt = this._buildSystemPrompt({
      subAssistant,
      settings: chatbotSettings,
      ragContext,
      profileContext,
      isFirstMessage,
    });

    let aiResponse;
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
    } catch (error) {
      if (!aiUsageMeter.isLimitError(error)) throw error;
      aiResponse = { text: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.' };
    }
    // Strip markdown formatting before sending (Zalo cannot render markdown)
    const cleanResponse = stripMarkdown(aiResponse.text);

    // Log messages
    await this._logMessage(channel, conversationId, userId, { role: 'visitor', content: message });
    await this._logMessage(channel, conversationId, userId, { role: 'bot', content: cleanResponse });

    return { type: 'text', content: cleanResponse };
  }

  _buildSystemPrompt({ subAssistant, settings, ragContext, profileContext, isFirstMessage }) {
    const name = subAssistant?.name || settings?.sub_assistant_name || 'Tro li AI';
    const welcomeMessage = settings.welcome_message || subAssistant?.greeting_msg || 'Xin chao! Toi co the giup gi cho ban?';
    const style = settings.response_style || 'friendly';

    const styleInstructions = {
      friendly: 'Than thien, gan gui, dung emoji phu hop.',
      professional: 'Chuyen nghiep, ngan gon, suc tich.',
      casual: 'Than thien nhung thoai mai, co the dung tieng long nhe.',
    };

    let prompt = `Ban la ${name} — mot tro li AI thong minh.

## CACH HOAT DONG
- Tra loi cau hoi dua tren Knowledge Base duoc huấn luyen ben duoi
- Luon uu tien thong tin tu Knowledge Base
- Neu cau hoi khong lien quan den Knowledge Base, tra loi dua tren Business Profile hoac kien thuc chung
- KHONG bia dat thong tin khong co trong Knowledge Base hoac Business Profile
- Neu khong tim thay thong tin phu hop, hay noi ro va goi y lien he voi doanh nghiep

## PHONG CACH TRA LOI
${styleInstructions[style] || styleInstructions.friendly}`;

    // Nếu là tin nhắn đầu tiên, thêm lời chào vào prompt
    if (isFirstMessage) {
      prompt += `

## TIN NHAN DAU TIEN
Khi nguoi dung bat dau cuoc tro chuyen, hay bat dau bang loi chao sau: "${welcomeMessage}"`;
    }

    prompt += `

## XU LY TIN NHAN DAC BIET
- Khi nhan duoc tin nhan "[Sticker] Người dùng gửi một sticker": Hãy phản hồi một cách thân thiện như thể người dùng đang gửi biểu cảm cảm xúc. Ví dụ: "Ôi bạn dễ thương quá 😄", "Mình hiểu rồi, bạn có gì muốn hỏi không?", "Sticker đẹp quá! Bạn cần mình giúp gì không?"
- Khi nhan duoc tin nhan "[Hình ảnh] Người dùng gửi một hình ảnh": Phản hồi lịch sự, cho biết bạn đã nhận được hình ảnh và hỏi người dùng cần hỗ trợ gì về nội dung hình ảnh đó.
- Nếu tin nhắn là emoji thuần túy: Trả lời tự nhiên như đang trò chuyện thông thường.
- Với mọi loại tin nhắn đặc biệt, hãy phản hồi một cách tự nhiên và thân thiện, không cần phân tích sâu.

${ragContext ? ragContext + '\n\n' : ''}${profileContext ? profileContext + '\n\n' : ''}
## QUY TAC QUAN TRONG
- LUON tra loi bang VAN BAN THUAN, KHONG dung bat ky dinh dang markdown nao
- Khong dung **bold**, *italic*, __underline__, ~~strikethrough~~, \`code\`, \`\`\`code block\`\`\`
- Khong dung # heading, - bullet list, 1. numbered list
- Neu can danh sach, chi dung dau gach ngang (-) hoac so thu tu (1, 2, 3)
- Neu can nhan manh thong tin quan trong, chi CAN VIET HOA hoac THEM DAU HAI CHAM
- So dien thoai / email: format chuan Viet Nam
- Tra loi ngắn gọn, rõ ràng, dễ đọc
- Neu co link, HIEN THI LINK URL day du dang van ban thuan (VD: Ten trang: https://example.com)
- Khong dung link markdown dang [ten](https://example.com)
- Neu khong biet, noi "Toi khong chắc chắn, vui long lien he ho tro"`;

    // Thêm custom system instruction neu co
    if (settings.system_instruction?.trim()) {
      prompt += `\n\n## HUONG DAN TUY CHINH\n${settings.system_instruction.trim()}`;
    }

    return prompt;
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
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const systemInstruction = { parts: [{ text: systemPrompt }] };
    const { maxOutputTokens } = await aiUsageMeter.reserve(userId, {
      contents: chatHistory,
      systemInstruction,
      model: modelName,
      requestedMaxOutputTokens: maxTokens,
    });

    const response = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction,
          contents: chatHistory,
          generationConfig: {
            temperature,
            maxOutputTokens,
          },
        }),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI call timeout (30s)')), 30000)),
    ]);

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini API error: ${response.status}`);
    }
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error('AI returned empty response');

    await aiUsageMeter.record(userId, extractGeminiUsage(data), {
      feature: 'chatbot_reply',
      model: modelName,
    });
    return { text: textResponse };
  }

  async _getHistory(channel, conversationId, limit) {
    if (!conversationId) return [];
    try {
      if (channel === 'web') {
        return chatbotRepository.getWebChatMessages(conversationId, { limit });
      }
      if (channel === 'zalo_personal') {
        return this._getZaloPersonalHistory(conversationId, limit);
      }
      return chatbotRepository.getChannelMessages(conversationId, { limit });
    } catch {
      return [];
    }
  }

  async _getZaloPersonalHistory(conversationId, limit = 50) {
    try {
      console.log(`[ChatRouter] _getZaloPersonalHistory: convId=${conversationId}, limit=${limit}`);
      const db = (await import('../../config/database.js')).default;
      const { rows } = await db.query(
        `SELECT id, role, content, metadata, created_at as createdAt
         FROM zalo_personal_messages
         WHERE id_conversation = $1
         ORDER BY created_at ASC
         LIMIT $2`,
        [conversationId, limit]
      );
      
      console.log(`[ChatRouter] _getZaloPersonalHistory: found ${rows.length} messages`);
      if (rows.length > 0) {
        console.log(`[ChatRouter] First message: role=${rows[0].role}, content="${String(rows[0].content).substring(0, 50)}"`);
        console.log(`[ChatRouter] Last message: role=${rows[rows.length-1].role}, content="${String(rows[rows.length-1].content).substring(0, 50)}"`);
      }
      
      return rows.map(row => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
      }));
    } catch (e) {
      console.warn('[ChatRouter] _getZaloPersonalHistory error:', e.message, e.stack);
      return [];
    }
  }

  async _logMessage(channel, conversationId, userId, { role, content }) {
    if (!conversationId || !content) return;
    try {
      if (channel === 'web') {
        await chatbotRepository.addWebChatMessage(conversationId, userId, { role, content });
      } else if (channel === 'zalo_personal') {
        // For Zalo Personal, messages are already logged by zaloInbox.service
        // and zaloPersonalAdapter.sendReply() -> insertAgentMessage()
        // So we skip logging here to avoid duplicate entries
        console.log(`[ChatRouter] Skipping _logMessage for zalo_personal (already logged by zaloInbox)`);
      } else {
        // For other channels (zalo_oa, facebook), use channel_messages
        const channelId = await chatbotRepository.getChannelIdFromConversation(conversationId);
        if (channelId) {
          await chatbotRepository.addChannelMessage(conversationId, userId, channelId, {
            role,
            content,
            message_type: 'text',
          });
        }
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

  async getWelcomeMessage(userId, channel) {
    const settings = await chatbotRepository.getSettings(userId, channel);
    if (!settings?.is_enabled) return null;
    if (settings.welcome_message) return settings.welcome_message;
    if (settings.id_sub_assistant) {
      const sa = await subAssistantService.getById(settings.id_sub_assistant, userId);
      if (sa?.greeting_msg) return sa.greeting_msg;
    }
    return 'Xin chao! Toi co the giup gi cho ban?';
  }

  async routeChatbotMessage({ chatbotId, message, conversationId }) {
    try {
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot) {
        throw new Error('Chatbot not found');
      }

      const historyRows = await chatbotRepository.getConversationHistory(conversationId, MAX_HISTORY_MESSAGES);

      const chatHistory = (historyRows || []).reverse().map(m => ({
        role: m.role === 'bot' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const systemPrompt = `Ban la ${chatbot.name || 'Tro li AI'}.

## MO TA
${chatbot.description || 'Mot tro li AI huu ich.'}

## HUONG DAN
${chatbot.system_instruction || 'Hay tra loi cau hoi mot cach huu ich va than thien.'}

## QUY TAC
- Tra loi bang tieng Viet
- Khong dung markdown bold/italic
- Neu khong biet, hay noi ro`;

      const response = await this._callAI({
        userId: chatbot.id_user,
        systemPrompt,
        history: chatHistory,
        message,
        model: await resolveAllowedModel(userId, process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
        temperature: chatbot.temperature || 0.7,
        maxTokens: chatbot.max_tokens || 2048,
      });

      return { content: stripMarkdown(response.text) };
    } catch (err) {
      console.error('[ChatRouter] routeChatbotMessage error:', err);
      return { content: 'Xin loi, da xay ra loi. Vui long thu lai.' };
    }
  }
}

export default new ChatRouterService();
