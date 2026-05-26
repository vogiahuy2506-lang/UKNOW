import zaloOAAdapter from '../services/chatbot/channelAdapters/zaloOA.adapter.js';
import facebookAdapter from '../services/chatbot/channelAdapters/facebook.adapter.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import db from '../config/database.js';

class ChatbotWebhookController {
  // ── Zalo OA Webhook ───────────────────────────────────────────

  async verifyZaloOA(req, res) {
    try {
      const { verify_token, challenge } = req.query;
      const expectedToken = process.env.ZALO_OA_VERIFY_TOKEN || 'founderai';

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
    // Respond quickly to Zalo (within 5s timeout)
    res.send('ok');

    try {
      const event = zaloOAAdapter.parseWebhookEvent(req.body);
      if (!event.message || !event.senderId) {
        return;
      }

      // Find the user who owns this Zalo OA channel
      const channels = await db.query(
        `SELECT cc.*, u.id AS user_id FROM channel_connections cc
         JOIN users u ON u.id = cc.id_user
         WHERE cc.channel = 'zalo_oa' AND cc.is_active = true
         LIMIT 1`
      );

      if (!channels.rows.length) {
        console.warn('[ZaloOA] No active Zalo OA channel found');
        return;
      }

      const channel = channels.rows[0];
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

  // ── Facebook Messenger Webhook ──────────────────────────────────

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
    // Respond quickly to Facebook
    res.send('ok');

    try {
      const messages = facebookAdapter.parseWebhookEvent(req.body);
      if (!messages.length) return;

      // Find the user who owns this Facebook channel
      const channels = await db.query(
        `SELECT cc.*, u.id AS user_id FROM channel_connections cc
         JOIN users u ON u.id = cc.id_user
         WHERE cc.channel = 'facebook' AND cc.is_active = true
         LIMIT 1`
      );

      if (!channels.rows.length) {
        console.warn('[Facebook] No active Facebook channel found');
        return;
      }

      const channel = channels.rows[0];

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
          visitorInfo: { source: 'facebook' },
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
}

export default new ChatbotWebhookController();
