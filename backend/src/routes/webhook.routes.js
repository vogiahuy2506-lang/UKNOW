import express from 'express';
import webhookController from '../controllers/webhook.controller.js';
import chatbotWebhookController from '../controllers/chatbotWebhook.controller.js';

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

/**
 * GET /api/webhooks/zalo-oa
 *
 * Zalo OA webhook verification (GET from Zalo when setting up webhook).
 */
router.get('/zalo-oa', chatbotWebhookController.verifyZaloOA.bind(chatbotWebhookController));

/**
 * POST /api/webhooks/zalo-oa
 *
 * Zalo OA webhook — receives incoming messages from Zalo Official Account.
 */
router.post('/zalo-oa', chatbotWebhookController.handleZaloOA.bind(chatbotWebhookController));

/**
 * GET /api/webhooks/facebook
 *
 * Facebook Messenger webhook verification.
 */
router.get('/facebook', chatbotWebhookController.verifyFacebook.bind(chatbotWebhookController));

/**
 * POST /api/webhooks/facebook
 *
 * Facebook Messenger webhook — receives incoming messages.
 */
router.post('/facebook', chatbotWebhookController.handleFacebook.bind(chatbotWebhookController));

/**
 * POST /api/webhooks/woocommerce/order
 *
 * Endpoint công khai – không yêu cầu JWT.
 * WooCommerce gọi khi có sự kiện đơn hàng.
 */
router.post('/woocommerce/order', webhookController.handleOrder.bind(webhookController));

export default router;
