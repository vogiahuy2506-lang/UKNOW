import zaloOAAdapter from '../services/chatbot/channelAdapters/zaloOA.adapter.js';
import facebookAdapter from '../services/chatbot/channelAdapters/facebook.adapter.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import chatbotRateLimitService from '../services/chatbot/chatbotRateLimit.service.js';
import chatbotChannelRepository from '../repositories/ai/chatbotChannel.repository.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import unifiedInboxRepository from '../repositories/ai/unifiedInbox.repository.js';

class ChatbotChannelWebhookController {
  // ── Zalo OA Webhook ───────────────────────────────────────────

  /**
   * Verify Zalo OA webhook
   * GET /api/webhooks/chatbot/zalo-oa/:token
   */
  async verifyZaloOA(req, res) {
    try {
      const { token } = req.params;
      const { verify_token, challenge } = req.query;

      const channel = await chatbotChannelRepository.findByWebhookToken(token);

      if (!channel) {
        console.warn('[ZaloOA] Channel not found for token');
        return res.status(404).send('Channel not found');
      }

      const verifyToken = channel.credentials?.verify_token || 'uknow_zalo_oa_verify';
      if (verify_token === verifyToken) {
        return res.send(challenge);
      }
      return res.status(403).send('Invalid verify token');
    } catch (err) {
      console.error('[ZaloOA Webhook] Verify error:', err.message);
      return res.status(500).send('Internal error');
    }
  }

  /**
   * Handle incoming Zalo OA message
   * POST /api/webhooks/chatbot/zalo-oa/:token
   */
  async handleZaloOA(req, res) {
    const { token } = req.params;

    // Respond quickly to Zalo
    res.send('ok');

    try {
      const channel = await chatbotChannelRepository.findByWebhookToken(token);

      if (!channel) {
        console.warn('[ZaloOA] Channel not found for token');
        return;
      }

      const event = zaloOAAdapter.parseWebhookEvent(req.body);
      if (!event.message || !event.senderId) {
        return;
      }

      const { message, senderId, messageId } = event;
      const chatbotId = channel.id_chatbot;

      // Guard: chatbot must exist and be active
      if (!chatbotId) {
        console.warn('[ChatbotChannel] No chatbot linked to channel', channel.id);
        return;
      }
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot || !chatbot.is_active) {
        console.warn(`[ChatbotChannel] Chatbot ${chatbotId} not found or inactive — skipping`);
        return;
      }

      // Create conversation
      const conv = await chatbotChannelRepository.getOrCreateConversation({
        chatbotId,
        channelId: channel.id,
        externalId: senderId,
        source: 'zalo_oa',
      });

      // Log visitor message
      await chatbotChannelRepository.addMessage(conv.id, {
        role: 'visitor',
        content: message,
        message_type: 'text',
        external_id: messageId,
      });

      const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
      if (await resourceIsLocked('chatbots', chatbotId)) {
        console.log(`[ZaloOA] Chatbot ${chatbotId} locked — message saved, no reply`);
        return;
      }

      const rate = await chatbotRateLimitService.checkBeforeAi({
        channel: 'zalo_oa',
        ownerUserId: chatbot.id_user,
        chatbotId,
        senderKey: senderId,
      });
      if (!rate.allowed) {
        await zaloOAAdapter.sendReply({
          conversationId: conv.id,
          message: rate.staticReply,
          channelId: channel.id,
          externalId: senderId,
        });
        await chatbotChannelRepository.addMessage(conv.id, {
          role: 'bot',
          content: rate.staticReply,
          message_type: 'text',
        });
        return;
      }

      // Handoff: owner paused AI for this conversation — save visitor msg only, no AI.
      if (await unifiedInboxRepository.isAiPaused(conv.id, 'channel')) {
        console.log(`[ZaloOA] AI paused for conversation ${conv.id} — skipping reply`);
        return;
      }

      // Route to chatbot AI
      const result = await chatRouterService.routeChatbotMessage({
        chatbotId,
        message,
        conversationId: conv.id,
      });

      if (result.content) {
        // Send reply
        await zaloOAAdapter.sendReply({
          conversationId: conv.id,
          message: result.content,
          channelId: channel.id,
          externalId: senderId,
        });

        // Log bot response
        await chatbotChannelRepository.addMessage(conv.id, {
          role: 'bot',
          content: result.content,
          message_type: 'text',
        });
      }

      // Update last activity
      await chatbotChannelRepository.updateLastActivity(channel.id);
    } catch (err) {
      console.error('[ZaloOA Webhook] Handle error:', err.message);
    }
  }

  // ── Facebook Messenger Webhook ───────────────────────────────

  /**
   * Verify Facebook webhook
   * GET /api/webhooks/chatbot/facebook/:token
   */
  async verifyFacebook(req, res) {
    try {
      const { token } = req.params;
      const { hub_mode, hub_verify_token, hub_challenge } = req.query;

      const channel = await chatbotChannelRepository.findByWebhookToken(token);

      if (!channel) {
        console.warn('[Facebook] Channel not found for token');
        return res.status(404).send('Channel not found');
      }

      const verifyToken = channel.credentials?.verify_token || 'founderai';
      if (hub_mode === 'subscribe' && hub_verify_token === verifyToken) {
        return res.send(hub_challenge);
      }
      return res.status(403).send('Invalid verify token');
    } catch (err) {
      console.error('[Facebook Webhook] Verify error:', err.message);
      return res.status(500).send('Internal error');
    }
  }

  /**
   * Handle incoming Facebook message
   * POST /api/webhooks/chatbot/facebook/:token
   */
  async handleFacebook(req, res) {
    const { token } = req.params;

    res.send('ok');

    try {
      const channel = await chatbotChannelRepository.findByWebhookToken(token);

      if (!channel) {
        console.warn('[Facebook] Channel not found for token');
        return;
      }

      const messages = facebookAdapter.parseWebhookEvent(req.body);
      if (!messages.length) return;

      const chatbotId = channel.id_chatbot;

      // Guard: chatbot must exist and be active
      if (!chatbotId) {
        console.warn('[ChatbotChannel] No chatbot linked to channel', channel.id);
        return;
      }
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot || !chatbot.is_active) {
        console.warn(`[ChatbotChannel] Chatbot ${chatbotId} not found or inactive — skipping`);
        return;
      }

      for (const msg of messages) {
        // Create conversation
        const conv = await chatbotChannelRepository.getOrCreateConversation({
          chatbotId,
          channelId: channel.id,
          externalId: msg.senderId,
          source: 'facebook',
        });

        // Log visitor message
        await chatbotChannelRepository.addMessage(conv.id, {
          role: 'visitor',
          content: msg.message,
          message_type: 'text',
          external_id: msg.messageId,
        });

        const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
        if (await resourceIsLocked('chatbots', chatbotId)) {
          console.log(`[Facebook] Chatbot ${chatbotId} locked — message saved, no reply`);
          continue;
        }

        const rate = await chatbotRateLimitService.checkBeforeAi({
          channel: 'facebook',
          ownerUserId: chatbot.id_user,
          chatbotId,
          senderKey: msg.senderId,
        });
        if (!rate.allowed) {
          await facebookAdapter.sendReply({
            externalId: msg.senderId,
            message: rate.staticReply,
            channelId: channel.id,
          });
          await chatbotChannelRepository.addMessage(conv.id, {
            role: 'bot',
            content: rate.staticReply,
            message_type: 'text',
          });
          continue;
        }

        if (await unifiedInboxRepository.isAiPaused(conv.id, 'channel')) {
          console.log(`[Facebook] AI paused for conversation ${conv.id} — skipping reply`);
          continue;
        }

        // Route to chatbot AI
        const result = await chatRouterService.routeChatbotMessage({
          chatbotId,
          message: msg.message,
          conversationId: conv.id,
        });

        if (result.content) {
          // Send reply
          await facebookAdapter.sendReply({
            externalId: msg.senderId,
            message: result.content,
            channelId: channel.id,
          });

          // Log bot response
          await chatbotChannelRepository.addMessage(conv.id, {
            role: 'bot',
            content: result.content,
            message_type: 'text',
          });
        }
      }

      // Update last activity
      await chatbotChannelRepository.updateLastActivity(channel.id);
    } catch (err) {
      console.error('[Facebook Webhook] Handle error:', err.message);
    }
  }
}

export default new ChatbotChannelWebhookController();
