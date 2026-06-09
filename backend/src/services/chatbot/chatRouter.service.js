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

/**
 * Strip markdown formatting from AI response text.
 * Zalo Personal cannot render markdown — this prevents asterisks and
 * other formatting characters from appearing as literal text.
 */
function stripMarkdown(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    // Italic: *text* or _text_
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/gs, '$1')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/gs, '$1')
    // Strikethrough: ~~text~~
    .replace(/~~(.+?)~~/gs, '$1')
    // Inline code: `code`
    .replace(/`(.+?)`/gs, '$1')
    // Code blocks: ```...``` or ```lang...```
    .replace(/```[\w]*\n?([\s\S]*?)```/gs, '$1')
    // Headers: # ## ### etc
    .replace(/^#{1,6}\s+/gm, '')
    // Unordered lists: - item or * item
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Ordered lists: 1. item
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Blockquotes: > quote
    .replace(/^>\s*/gm, '')
    // Horizontal rules: --- or *** or ___
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Markdown links: [text](url) — keep the full markdown link (for channels that support it)
    // Note: Plain text channels like Zalo will display this as literal text
    .replace(/!\[.*?\]\(.+?\)/g, '')
    // Plain URLs — keep them visible in the response
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
    const isFirstMessage = history.length === 0;
    const systemPrompt = this._buildSystemPrompt({
      subAssistant,
      settings,
      ragContext,
      profileContext,
      isFirstMessage,
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
    const isFirstMessage = history.length === 0;
    const systemPrompt = this._buildSystemPrompt({
      subAssistant,
      settings: chatbotSettings,
      ragContext,
      profileContext,
      isFirstMessage,
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

    // Strip markdown formatting before sending (Zalo cannot render markdown)
    const cleanResponse = stripMarkdown(aiResponse.text);

    // Log messages
    await this._logMessage(channel, conversationId, userId, { role: 'visitor', content: message });
    await this._logMessage(channel, conversationId, userId, { role: 'bot', content: cleanResponse });

    // Send reply via adapter
    if (adapter.sendReply) {
      await adapter.sendReply({
        conversationId,
        message: cleanResponse,
        conversationInfo: visitorInfo,
        // Zalo personal needs accountId to reply from the correct account
        accountId: visitorInfo?.accountId,
        userId,
      });
    }

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
- Neu co link, HIEN THI LINK URL trong cau tra loi (VD: https://example.com)
- Neu khong biet, noi "Toi khong chắc chắn, vui long lien he ho tro"`;

    // Thêm custom system instruction neu co
    if (settings.system_instruction?.trim()) {
      prompt += `\n\n## HUONG DAN TUY CHINH\n${settings.system_instruction.trim()}`;
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
      const db = (await import('../../config/database.js')).default;
      const { rows } = await db.query(
        `SELECT id, role, content, metadata, created_at as createdAt
         FROM zalo_personal_messages
         WHERE id_conversation = $1
         ORDER BY created_at ASC
         LIMIT $2`,
        [conversationId, limit]
      );
      
      return rows.map(row => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
      }));
    } catch (e) {
      console.warn('[ChatRouter] _getZaloPersonalHistory error:', e.message);
      return [];
    }
  }

  async _logMessage(channel, conversationId, userId, { role, content }) {
    if (!conversationId || !content) return;
    try {
      if (channel === 'web') {
        await chatbotRepository.addWebChatMessage(conversationId, userId, { role, content });
      } else {
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
      return { content: 'Xin loi, da xay ra loi. Vui long thu lai.' };
    }
  }
}

export default new ChatRouterService();
