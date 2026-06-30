import emailLogRepo from '../../repositories/admin/notificationEmailLog.repository.js';
import notificationRepo from '../../repositories/admin/notification.repository.js';

/**
 * SendGrid Webhook Controller
 * Handles email tracking events from SendGrid
 * 
 * SendGrid sends these event types:
 * - delivered: Email was delivered to recipient
 * - open: Email was opened by recipient
 * - click: Recipient clicked a link
 * - bounce: Email bounced
 * - dropped: Email was dropped
 * - deferred: Email delivery was deferred
 * - processed: Email was processed
 * - spamreport: Recipient marked as spam
 * - unsubscribe: Recipient unsubscribed
 */
export default {
  /**
   * Handle SendGrid webhook events
   * POST /api/webhooks/sendgrid
   */
  async handleSendGridWebhook(req, res) {
    try {
      const events = req.body;

      if (!Array.isArray(events)) {
        return res.status(400).json({ error: 'Expected array of events' });
      }

      console.log(`[SendGridWebhook] Received ${events.length} events`);

      const results = {
        processed: 0,
        errors: 0
      };

      for (const event of events) {
        try {
          await processSendGridEvent(event);
          results.processed++;
        } catch (err) {
          console.error(`[SendGridWebhook] Error processing event:`, err.message);
          results.errors++;
        }
      }

      res.status(200).json({ processed: results.processed, errors: results.errors });
    } catch (err) {
      console.error('[SendGridWebhook] Fatal error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * Verify SendGrid webhook signature
   * GET /api/webhooks/sendgrid/verify
   */
  verifySendGridWebhook(req, res) {
    const { 'sendgrid-verification': verification } = req.query;

    if (verification === process.env.SENDGRID_WEBHOOK_VERIFICATION) {
      return res.status(200).json({ valid: true });
    }

    res.status(401).json({ valid: false });
  }
};

/**
 * Process individual SendGrid event
 */
async function processSendGridEvent(event) {
  const { email, timestamp, event: eventType, sg_message_id, reason, ip, useragent } = event;

  if (!email || !sg_message_id) {
    return;
  }

  // Extract message_id (SendGrid adds suffix like .filter1234)
  const baseMessageId = sg_message_id.split('.')[0];

  // Find the email log by message_id
  let emailLog = await emailLogRepo.findByMessageId(sg_message_id);

  // If not found, try with base message ID
  if (!emailLog && baseMessageId) {
    emailLog = await emailLogRepo.findByMessageId(baseMessageId);
  }

  if (!emailLog) {
    // Try to find by email address as fallback
    console.log(`[SendGridWebhook] Log not found for message_id: ${sg_message_id}, email: ${email}`);
    return;
  }

  const metadata = { timestamp: new Date(timestamp * 1000) };
  if (reason) metadata.reason = reason;
  if (ip) metadata.ip = ip;
  if (useragent) metadata.useragent = useragent;

  switch (eventType) {
    case 'delivered':
      await emailLogRepo.markAsDelivered(emailLog.id, metadata.timestamp);
      break;

    case 'open':
      await emailLogRepo.markAsOpened(emailLog.id, metadata.timestamp);
      // Update notification stats
      await updateNotificationOpenCount(emailLog.notification_id);
      break;

    case 'click':
      // Log click event (could add click tracking table later)
      console.log(`[SendGridWebhook] Click tracked for ${email}, link: ${event.url}`);
      break;

    case 'bounce':
      await emailLogRepo.markAsBounced(emailLog.id, reason || 'Bounced');
      await updateNotificationFailedCount(emailLog.notification_id);
      break;

    case 'dropped':
      await emailLogRepo.markAsBounced(emailLog.id, reason || 'Dropped by SendGrid');
      await updateNotificationFailedCount(emailLog.notification_id);
      break;

    case 'deferred':
      // Could implement retry logic here
      console.log(`[SendGridWebhook] Email deferred for ${email}: ${reason}`);
      break;

    case 'processed':
      // Already handled when email is sent
      break;

    case 'spamreport':
      console.log(`[SendGridWebhook] Spam report for ${email}`);
      await emailLogRepo.updateStatus(emailLog.id, 'spam_reported', { error_message: 'Marked as spam by recipient' });
      break;

    case 'unsubscribe':
      console.log(`[SendGridWebhook] Unsubscribed: ${email}`);
      // Could update user preferences here
      break;

    default:
      console.log(`[SendGridWebhook] Unknown event type: ${eventType}`);
  }
}

/**
 * Update notification open count
 */
async function updateNotificationOpenCount(notificationId) {
  if (!notificationId) return;

  try {
    const stats = await notificationRepo.findById(notificationId);
    if (stats) {
      const openedCount = (stats.opened_count || 0) + 1;
      const openRate = stats.sent_count > 0
        ? Math.round((openedCount / stats.sent_count) * 10000) / 100
        : 0;

      await notificationRepo.updateById(notificationId, {
        opened_count: openedCount,
        open_rate: openRate
      });
    }
  } catch (err) {
    console.error(`[SendGridWebhook] Error updating open count:`, err.message);
  }
}

/**
 * Update notification failed count
 */
async function updateNotificationFailedCount(notificationId) {
  if (!notificationId) return;

  try {
    const stats = await notificationRepo.findById(notificationId);
    if (stats) {
      await notificationRepo.updateById(notificationId, {
        failed_count: (stats.failed_count || 0) + 1
      });
    }
  } catch (err) {
    console.error(`[SendGridWebhook] Error updating failed count:`, err.message);
  }
}
