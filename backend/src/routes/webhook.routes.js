import express from 'express';
import webhookController from '../controllers/webhook.controller.js';
import chatbotWebhookController from '../controllers/chatbotWebhook.controller.js';
import chatbotChannelWebhookController from '../controllers/chatbotChannelWebhook.controller.js';
import oauthController from '../controllers/oauth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * GET /api/webhooks/verify-domain
 *
 * Zalo domain verification - returns verification file content.
 * Zalo requires adding a verification file to the domain root.
 */
router.get('/verify-domain', (req, res) => {
  const { zalo_verification } = req.query;
  if (zalo_verification) {
    // Return the verification token as plain text (Zalo expects this format)
    res.set('Content-Type', 'text/html');
    return res.send(`<html><body>${zalo_verification}</body></html>`);
  }
  return res.status(400).send('Missing verification token');
});

/**
 * GET /.well-known/KlgV4OVxHJrppf8XXBaeArFAIJI_I6XjCJWu.html
 * GET /api/webhooks/KlgV4OVxHJrppf8XXBaeArFAIJI_I6XjCJWu.html
 *
 * Zalo HTML file verification endpoint
 */
router.get('/KlgV4OVxHJrppf8XXBaeArFAIJI_I6XjCJWu.html', (req, res) => {
  // Return a simple HTML page that Zalo can verify
  res.set('Content-Type', 'text/html');
  return res.send(`<!DOCTYPE html>
<html>
<head>
    <meta name="zalo-verification" content="KlgV4OVxHJrppf8XXBaeArFAIJI_I6XjCJWu" />
</head>
<body></body>
</html>`);
});

// ── Chatbot Webhooks (token-based routing) ─────────────────────

/**
 * GET/POST /api/webhooks/chatbot/zalo-oa/:token
 * Webhook cho Zalo OA của chatbot cụ thể
 */
router.get('/chatbot/zalo-oa/:token', chatbotChannelWebhookController.verifyZaloOA.bind(chatbotChannelWebhookController));
router.post('/chatbot/zalo-oa/:token', chatbotChannelWebhookController.handleZaloOA.bind(chatbotChannelWebhookController));

/**
 * GET/POST /api/webhooks/chatbot/facebook/:token
 * Webhook cho Facebook Messenger của chatbot cụ thể
 */
router.get('/chatbot/facebook/:token', chatbotChannelWebhookController.verifyFacebook.bind(chatbotChannelWebhookController));
router.post('/chatbot/facebook/:token', chatbotChannelWebhookController.handleFacebook.bind(chatbotChannelWebhookController));

// ── Legacy Webhooks (backwards compatibility) ─────────────────

/**
 * Legacy Zalo OA webhook
 * @deprecated
 */
router.get('/zalo-oa', chatbotWebhookController.verifyZaloOA.bind(chatbotWebhookController));
router.post('/zalo-oa', chatbotWebhookController.handleZaloOA.bind(chatbotWebhookController));

/**
 * Legacy Facebook webhook
 * @deprecated
 */
router.get('/facebook', chatbotWebhookController.verifyFacebook.bind(chatbotWebhookController));
router.post('/facebook', chatbotWebhookController.handleFacebook.bind(chatbotWebhookController));

/**
 * POST /api/webhooks/woocommerce/order
 *
 * Endpoint công khai – không yêu cầu JWT.
 * WooCommerce gọi khi có sự kiện đơn hàng.
 */
router.post('/woocommerce/order', webhookController.handleOrder.bind(webhookController));

// ── OAuth Routes (public - no auth) ──────────────────────────────

// Facebook OAuth callback (public)
router.get('/oauth/facebook/init', oauthController.initFacebookOAuth.bind(oauthController));
router.get('/oauth/callback/facebook', oauthController.handleFacebookCallback.bind(oauthController));
router.post('/oauth/facebook/complete', authMiddleware, oauthController.completeFacebookConnection.bind(oauthController));

// Zalo OA OAuth callback (public)
router.get('/oauth/zalo-oa/init', oauthController.initZaloOAuth.bind(oauthController));
router.get('/oauth/callback/zalo-oa', oauthController.handleZaloCallback.bind(oauthController));

export default router;
