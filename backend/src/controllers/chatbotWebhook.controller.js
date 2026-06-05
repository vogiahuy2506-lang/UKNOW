import zaloOAAdapter from '../services/chatbot/channelAdapters/zaloOA.adapter.js';
import facebookAdapter from '../services/chatbot/channelAdapters/facebook.adapter.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';

class ChatbotWebhookController {
  // ── Zalo OA Webhook (Token-based) ──────────────────────────────────

  /**
   * Verify Zalo OA webhook by channel token
   * GET /api/webhooks/zalo-oa/:token
   */
  async verifyZaloOAByToken(req, res) {
    try {
      const { token } = req.params;
      const { verify_token, challenge } = req.query;

      // Find channel by webhook token
      const channel = await chatbotRepository.findChannelByWebhookToken(token);

      if (!channel) {
        console.warn('[ZaloOA] Channel not found for token:', token);
        return res.status(404).send('Channel not found');
      }

      // Verify token matches
      const expectedToken = channel.credentials?.verify_token || 'uknow_zalo_oa_verify';
      if (verify_token === expectedToken) {
        return res.send(challenge);
      }
      return res.status(403).send('Invalid verify token');
    } catch (err) {
      console.error('[ZaloOA Webhook] Verify error:', err.message);
      return res.status(500).send('Internal error');
    }
  }

  async handleZaloOAByToken(req, res) {
    const { token } = req.params;

    // Respond quickly to Zalo (within 5s timeout)
    res.send('ok');

    try {
      // Find channel by webhook token
      const channel = await chatbotRepository.findChannelByWebhookToken(token);

      if (!channel) {
        console.warn('[ZaloOA] Channel not found for token:', token);
        return;
      }

      const event = zaloOAAdapter.parseWebhookEvent(req.body);
      if (!event.message || !event.senderId) {
        return;
      }

      const { message, senderId, messageId } = event;

      // Get or create conversation
      const conv = await chatbotRepository.getOrCreateChannelConversation({
        channelId: channel.id,
        userId: channel.user_id,
        externalId: senderId,
        visitorName: null,
        visitorInfo: { source: 'zalo_oa', message_id: messageId },
      });

      // Log visitor message
      await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
        role: 'visitor',
        content: message,
        message_type: 'text',
        external_id: messageId,
        external_ts: event.timestamp,
      });

      // Route to AI
      const result = await chatRouterService.routeMessage({
        channel: 'zalo_oa',
        userId: channel.user_id,
        message,
        conversationId: conv.id,
        visitorInfo: { source: 'zalo_oa', channel_id: channel.id },
      });

      if (result.type === 'text' && result.content) {
        await zaloOAAdapter.sendReply({
          conversationId: conv.id,
          message: result.content,
          userId: channel.user_id,
          channelId: channel.id,
          externalId: senderId,
        });

        // Log bot response
        await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
          role: 'bot',
          content: result.content,
          message_type: 'text',
        });
      }
    } catch (err) {
      console.error('[ZaloOA Webhook] Handle error:', err.message);
    }
  }

  // ── Facebook Messenger Webhook (Token-based) ───────────────────────

  /**
   * Verify Facebook webhook by channel token
   * GET /api/webhooks/facebook/:token
   */
  async verifyFacebookByToken(req, res) {
    try {
      const { token } = req.params;
      const { hub_mode, hub_verify_token, hub_challenge } = req.query;

      // Find channel by webhook token
      const channel = await chatbotRepository.findChannelByWebhookToken(token);

      if (!channel) {
        console.warn('[Facebook] Channel not found for token:', token);
        return res.status(404).send('Channel not found');
      }

      // Verify token matches
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

  async handleFacebookByToken(req, res) {
    const { token } = req.params;

    // Respond quickly to Facebook
    res.send('ok');

    try {
      // Find channel by webhook token
      const channel = await chatbotRepository.findChannelByWebhookToken(token);

      if (!channel) {
        console.warn('[Facebook] Channel not found for token:', token);
        return;
      }

      const messages = facebookAdapter.parseWebhookEvent(req.body);
      if (!messages.length) return;

      for (const msg of messages) {
        const conv = await chatbotRepository.getOrCreateChannelConversation({
          channelId: channel.id,
          userId: channel.user_id,
          externalId: msg.senderId,
          visitorName: null,
          visitorInfo: { source: 'facebook', message_id: msg.messageId },
        });

        // Log visitor message
        await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
          role: 'visitor',
          content: msg.message,
          message_type: 'text',
          external_id: msg.messageId,
          external_ts: msg.timestamp,
        });

        // Route to AI
        const result = await chatRouterService.routeMessage({
          channel: 'facebook',
          userId: channel.user_id,
          message: msg.message,
          conversationId: conv.id,
          visitorInfo: { source: 'facebook', channel_id: channel.id },
        });

        if (result.type === 'text' && result.content) {
          await facebookAdapter.sendReply({
            externalId: msg.senderId,
            message: result.content,
            userId: channel.user_id,
          });

          // Log bot response
          await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
            role: 'bot',
            content: result.content,
            message_type: 'text',
          });
        }
      }
    } catch (err) {
      console.error('[Facebook Webhook] Handle error:', err.message);
    }
  }

  // ── Legacy Webhooks (backwards compatibility) ───────────────────────

  /**
   * Legacy Zalo OA webhook - uses first active channel
   * @deprecated Use verifyZaloOAByToken instead
   */
  async verifyZaloOA(req, res) {
    try {
      const { verify_token, challenge } = req.query;
      const expectedToken = process.env.ZALO_OA_VERIFY_TOKEN || 'uknow_zalo_oa_verify';

      if (verify_token === expectedToken) {
        return res.send(challenge);
      }
      return res.status(403).send('Invalid verify token');
    } catch (err) {
      console.error('[ZaloOA Webhook] Verify error:', err.message);
      return res.status(500).send('Internal error');
    }
  }

  async handleZaloOA(req, res) {
    res.send('ok');

    try {
      const event = zaloOAAdapter.parseWebhookEvent(req.body);
      if (!event.message || !event.senderId) {
        return;
      }

      // Find the user who owns this Zalo OA channel
      const channel = await chatbotRepository.findFirstActiveChannelByType('zalo_oa');
      if (!channel) {
        console.warn('[ZaloOA] No active Zalo OA channel found');
        return;
      }

      const { message, senderId, messageId } = event;

      const conv = await chatbotRepository.getOrCreateChannelConversation({
        channelId: channel.id,
        userId: channel.user_id,
        externalId: senderId,
        visitorName: null,
        visitorInfo: { source: 'zalo_oa', message_id: messageId },
      });

      await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
        role: 'visitor',
        content: message,
        message_type: 'text',
        external_id: messageId,
        external_ts: event.timestamp,
      });

      const result = await chatRouterService.routeMessage({
        channel: 'zalo_oa',
        userId: channel.user_id,
        message,
        conversationId: conv.id,
        visitorInfo: { source: 'zalo_oa' },
      });

      if (result.type === 'text' && result.content) {
        await zaloOAAdapter.sendReply({
          conversationId: conv.id,
          message: result.content,
          userId: channel.user_id,
          channelId: channel.id,
          externalId: senderId,
        });

        await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
          role: 'bot',
          content: result.content,
          message_type: 'text',
        });
      }
    } catch (err) {
      console.error('[ZaloOA Webhook] Handle error:', err.message);
    }
  }

  async verifyFacebook(req, res) {
    try {
      const { hub_mode, hub_verify_token, hub_challenge } = req.query;
      const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN || 'founderai';

      if (hub_mode === 'subscribe' && hub_verify_token === verifyToken) {
        return res.send(hub_challenge);
      }
      return res.status(403).send('Invalid verify token');
    } catch (err) {
      console.error('[Facebook Webhook] Verify error:', err.message);
      return res.status(500).send('Internal error');
    }
  }

  async handleFacebook(req, res) {
    res.send('ok');

    try {
      const messages = facebookAdapter.parseWebhookEvent(req.body);
      if (!messages.length) return;

      const channel = await chatbotRepository.findFirstActiveChannelByType('facebook');
      if (!channel) {
        console.warn('[Facebook] No active Facebook channel found');
        return;
      }

      for (const msg of messages) {
        const conv = await chatbotRepository.getOrCreateChannelConversation({
          channelId: channel.id,
          userId: channel.user_id,
          externalId: msg.senderId,
          visitorName: null,
          visitorInfo: { source: 'facebook', message_id: msg.messageId },
        });

        await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
          role: 'visitor',
          content: msg.message,
          message_type: 'text',
          external_id: msg.messageId,
          external_ts: msg.timestamp,
        });

        const result = await chatRouterService.routeMessage({
          channel: 'facebook',
          userId: channel.user_id,
          message: msg.message,
          conversationId: conv.id,
          visitorInfo: { source: 'facebook' },
        });

        if (result.type === 'text' && result.content) {
          await facebookAdapter.sendReply({
            externalId: msg.senderId,
            message: result.content,
            userId: channel.user_id,
          });

          await chatbotRepository.addChannelMessage(conv.id, channel.user_id, channel.id, {
            role: 'bot',
            content: result.content,
            message_type: 'text',
          });
        }
      }
    } catch (err) {
      console.error('[Facebook Webhook] Handle error:', err.message);
    }
  }
}

export default new ChatbotWebhookController();
