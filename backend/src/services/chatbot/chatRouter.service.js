import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';
import ragEngineService from './ragEngine.service.js';
import subAssistantService from './subAssistant.service.js';
import webChatAdapter from './channelAdapters/webChat.adapter.js';
import zaloOAAdapter from './channelAdapters/zaloOA.adapter.js';
import facebookAdapter from './channelAdapters/facebook.adapter.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';
import businessProfileService from '../ai/businessProfile.service.js';

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
      const profile = await businessProfileService.getProfile(userId);
      if (profile) {
        profileContext = businessProfileService.formatProfileForPrompt(profile);
      }
    } catch (e) {
      console.warn('[ChatRouter] No business profile context:', e.message);
    }

    // 6. Build system prompt
    const systemPrompt = this._buildSystemPrompt({
      subAssistant,
      settings,
      ragContext,
      profileContext,
    });

    // 7. Call AI
    const aiResponse = await this._callAI({
      systemPrompt,
      history,
      message,
      model: settings.ai_model || 'gemini-2.5-flash',
      temperature: parseFloat(settings.temperature || 0.7),
      maxTokens: settings.max_tokens || 2048,
    });

    // 8. Log and send via adapter
    await this._logMessage(channel, conversationId, userId, { role: 'visitor', content: message });
    await this._logMessage(channel, conversationId, userId, { role: 'bot', content: aiResponse.text });

    if (adapter.sendReply) {
      await adapter.sendReply({ conversationId, message: aiResponse.text, attachments });
    }

    return { type: 'text', content: aiResponse.text };
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

    // Build RAG context from KB
    const linkedKbId = subAssistant ? await this._getLinkedKbId(subAssistant, userId) : null;
    const ragContext = await ragEngineService.buildContext(userId, message, {
      kbId: linkedKbId,
    });

    // Get business profile as fallback context
    let profileContext = '';
    try {
      const profile = await businessProfileService.getProfile(userId);
      if (profile) {
        profileContext = businessProfileService.formatProfileForPrompt(profile);
      }
    } catch (e) {
      console.warn('[ChatRouter] No business profile context:', e.message);
    }

    // Build system prompt with per-account settings
    const systemPrompt = this._buildSystemPrompt({
      subAssistant,
      settings: chatbotSettings,
      ragContext,
      profileContext,
    });

    // Call AI with per-account settings
    console.log(`[ChatRouter] Calling AI: model=${chatbotSettings.ai_model || 'gemini-2.5-flash'}, temp=${chatbotSettings.temperature}`);
    console.log(`[ChatRouter] GEMINI_MODEL env=`, process.env.GEMINI_MODEL);
    console.log(`[ChatRouter] GEMINI_API_KEY env=`, process.env.GEMINI_API_KEY ? '***' + process.env.GEMINI_API_KEY.slice(-4) : 'NOT SET');
    const aiResponse = await this._callAI({
      systemPrompt,
      history,
      message,
      model: chatbotSettings.ai_model || 'gemini-2.5-flash',
      temperature: parseFloat(chatbotSettings.temperature || 0.7),
      maxTokens: chatbotSettings.max_tokens || 2048,
    });
    console.log(`[ChatRouter] AI response:`, JSON.stringify(aiResponse));

    // Log messages
    await this._logMessage(channel, conversationId, userId, { role: 'visitor', content: message });
    await this._logMessage(channel, conversationId, userId, { role: 'bot', content: aiResponse.text });

    // Send reply via adapter
    if (adapter.sendReply) {
      await adapter.sendReply({ conversationId, message: aiResponse.text });
    }

    return { type: 'text', content: aiResponse.text };
  }

  _buildSystemPrompt({ subAssistant, settings, ragContext, profileContext }) {
    // Ưu tiên: subAssistant.name > settings.sub_assistant_name > default
    const name = subAssistant?.name || settings?.sub_assistant_name || 'Trợ lý AI';
    const greeting = settings.welcome_message || subAssistant?.greeting_msg || 'Xin chào! Tôi có thể giúp gì cho bạn?';
    const style = settings.response_style || 'friendly';

    const styleInstructions = {
      friendly: 'Thân thiện, gần gũi, dùng emoji phù hợp.',
      professional: 'Chuyên nghiệp, ngắn gọn, súc tích.',
      casual: 'Thân thiện nhưng thoải mái, có thể dùng tiếng lóng nhẹ.',
    };

    let prompt = `Bạn là ${name} — một trợ lý AI thông minh.

## CÁCH HOẠT ĐỘNG
- Trả lời câu hỏi dựa trên Knowledge Base được huấn luyện bên dưới
- Luôn ưu tiên thông tin từ Knowledge Base
- Nếu câu hỏi không liên quan đến Knowledge Base, trả lời dựa trên Business Profile hoặc kiến thức chung
- KHÔNG bịa đặt thông tin không có trong Knowledge Base hoặc Business Profile
- Nếu không tìm thấy thông tin phù hợp, hãy nói rõ và gợi ý liên hệ với doanh nghiệp

## PHONG CÁCH TRẢ LỜI
${styleInstructions[style] || styleInstructions.friendly}

${ragContext ? ragContext + '\n\n' : ''}${profileContext ? profileContext + '\n\n' : ''}
## QUY TẮC QUAN TRỌNG
- Trả lời bằng tiếng Việt, trừ khi người dùng hỏi bằng ngôn ngữ khác
- Nếu thông tin có trong KB: "Theo như tài liệu của chúng tôi..."
- Nếu thông tin KHÔNG có trong KB: "Tôi không tìm thấy thông tin này trong cơ sở dữ liệu của chúng tôi. Bạn vui lòng liên hệ [TÊN CÔNG TY] để được hỗ trợ."
- KHÔNG dùng markdown **bold** hay *italic* — dùng text thuần
- Số điện thoại / email: format chuẩn Việt Nam`;

    // Thêm custom system instruction nếu có
    if (settings.system_instruction?.trim()) {
      prompt += `\n\n## HƯỚNG DẪN TÙY CHỈNH\n${settings.system_instruction.trim()}`;
    }

    return prompt;
  }

  async _callAI({ systemPrompt, history, message, model, temperature, maxTokens }) {
    const chatHistory = history.map(m => ({
      role: m.role === 'bot' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    chatHistory.push({ role: 'user', parts: [{ text: message }] });

    const modelName = process.env.GEMINI_MODEL || model;
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: chatHistory,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI call timeout (30s)')), 30000)),
    ]);

    const data = await response.json();
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error('AI returned empty response');

    return { text: textResponse };
  }

  async _getHistory(channel, conversationId, limit) {
    if (!conversationId) return [];
    try {
      if (channel === 'web') {
        return chatbotRepository.getWebChatMessages(conversationId, { limit });
      }
      return chatbotRepository.getChannelMessages(conversationId, { limit });
    } catch {
      return [];
    }
  }

  async _logMessage(channel, conversationId, userId, { role, content }) {
    if (!conversationId || !content) return;
    try {
      if (channel === 'web') {
        await chatbotRepository.addWebChatMessage(conversationId, userId, { role, content });
      } else {
        // For channel messages, we need to get the channel ID from the conversation
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

  /**
   * Get the primary linked KB ID from a sub-assistant.
   * Returns the first active KB linked to the sub-assistant.
   */
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
    return 'Xin chào! Tôi có thể giúp gì cho bạn?';
  }

  /**
   * Route message for a custom chatbot (Studio)
   * This is used by chatbot channel webhooks
   */
  async routeChatbotMessage({ chatbotId, message, conversationId }) {
    try {
      // Get chatbot info
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot) {
        throw new Error('Chatbot not found');
      }

      // Get conversation history
      const historyRows = await chatbotRepository.getConversationHistory(conversationId, MAX_HISTORY_MESSAGES);

      // Reverse to get chronological order
      const chatHistory = (historyRows || []).reverse().map(m => ({
        role: m.role === 'bot' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // Build system prompt
      const systemPrompt = `Bạn là ${chatbot.name || 'Trợ lý AI'}.

## MÔ TẢ
${chatbot.description || 'Một trợ lý AI hữu ích.'}

## HƯỚNG DẪN
${chatbot.system_instruction || 'Hãy trả lời câu hỏi một cách hữu ích và thân thiện.'}

## QUY TẮC
- Trả lời bằng tiếng Việt
- Không dùng markdown bold/italic
- Nếu không biết, hãy nói rõ`;

      // Call AI
      const response = await this._callAI({
        systemPrompt,
        history: chatHistory,
        message,
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        temperature: chatbot.temperature || 0.7,
        maxTokens: chatbot.max_tokens || 2048,
      });

      return { content: response.text };
    } catch (err) {
      console.error('[ChatRouter] routeChatbotMessage error:', err);
      return { content: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.' };
    }
  }
}

export default new ChatRouterService();
