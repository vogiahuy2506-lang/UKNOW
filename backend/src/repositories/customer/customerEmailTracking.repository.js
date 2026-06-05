import db from '../../config/database.js';

class CustomerEmailTrackingRepository {
  /**
   * Update email_messages on open event, returning message identifiers.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {string} token tracking token
   * @returns {Promise<{id, id_campaign, id_customer, id_run}|null>}
   */
  async updateEmailMessageOnOpen(client, token) {
    const result = await client.query(
      `UPDATE email_messages
       SET open_count = COALESCE(open_count, 0) + 1,
           first_opened_at = COALESCE(first_opened_at, CURRENT_TIMESTAMP),
           last_opened_at = CURRENT_TIMESTAMP,
           status = CASE
             WHEN status IN ('pending', 'queued', 'sent', 'delivered') THEN 'opened'
             ELSE status
           END
       WHERE tracking_token = $1
       RETURNING id, id_campaign, id_customer, id_run`,
      [token]
    );
    return result.rows[0] || null;
  }

  /**
   * Touch last_email_opened_at on the customer record.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async touchCustomerEmailOpenedAt(client, customerId) {
    await client.query(
      'UPDATE customers SET last_email_opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [customerId]
    );
  }

  /**
   * Upsert campaign_customers open stats.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} campaignId
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async upsertCampaignCustomerOpen(client, campaignId, customerId) {
    await client.query(
      `INSERT INTO campaign_customers (
        id_campaign, id_customer, joined_at,
        email_opened_count, has_opened,
        first_email_opened_at, last_email_opened_at,
        last_activity_at, updated_at
       )
       VALUES ($1, $2, CURRENT_TIMESTAMP, 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (id_campaign, id_customer)
       DO UPDATE SET
         email_opened_count = campaign_customers.email_opened_count + 1,
         has_opened = TRUE,
         first_email_opened_at = COALESCE(campaign_customers.first_email_opened_at, CURRENT_TIMESTAMP),
         last_email_opened_at = CURRENT_TIMESTAMP,
         last_activity_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [campaignId, customerId]
    );
  }

  /**
   * Upsert campaign_participations for a customer/campaign/run.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} customerId
   * @param {number} campaignId
   * @param {number|null} runId
   * @returns {Promise<void>}
   */
  async upsertCampaignParticipation(client, customerId, campaignId, runId) {
    await client.query(
      `INSERT INTO campaign_participations (id_customer, id_campaign, id_run, joined_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (id_customer, id_campaign)
       DO UPDATE SET id_run = COALESCE(EXCLUDED.id_run, campaign_participations.id_run)`,
      [customerId, campaignId, runId]
    );
  }

  /**
   * Increment campaigns.total_opened counter.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async incrementCampaignTotalOpened(client, campaignId) {
    await client.query(
      'UPDATE campaigns SET total_opened = COALESCE(total_opened, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [campaignId]
    );
  }

  /**
   * Check whether an email_opened journey event already exists for this message+customer.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} emailMessageId
   * @param {number} customerId
   * @returns {Promise<boolean>}
   */
  async hasJourneyEmailOpened(client, emailMessageId, customerId) {
    const result = await client.query(
      `SELECT 1 FROM customer_journey
       WHERE id_email_message = $1 AND id_customer = $2 AND event_type = 'email_opened'
       LIMIT 1`,
      [emailMessageId, customerId]
    );
    return result.rows.length > 0;
  }

  /**
   * Insert a customer_journey event.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {{customerId, campaignId, runId, eventType, eventChannel, emailMessageId, eventData}} params
   * @returns {Promise<void>}
   */
  async insertJourneyEvent(client, { customerId, campaignId, runId, eventType, eventChannel, emailMessageId, eventData }) {
    await client.query(
      `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP)`,
      [customerId, campaignId, runId, eventType, eventChannel, emailMessageId, JSON.stringify(eventData)]
    );
  }

  // ---------------------------------------------------------------------------
  // Unsubscribe
  // ---------------------------------------------------------------------------

  /**
   * Select email_message by tracking token (for unsubscribe flow).
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {string} token
   * @returns {Promise<{id, id_campaign, id_customer, id_run}|null>}
   */
  async findEmailMessageByToken(client, token) {
    const result = await client.query(
      `SELECT id, id_campaign, id_customer, id_run
       FROM email_messages
       WHERE tracking_token = $1
       LIMIT 1`,
      [token]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark email_messages status as 'unsubscribed' by token.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {string} token
   * @returns {Promise<void>}
   */
  async setEmailMessageUnsubscribed(client, token) {
    await client.query(
      `UPDATE email_messages
       SET status = 'unsubscribed'
       WHERE tracking_token = $1 AND status NOT IN ('unsubscribed')`,
      [token]
    );
  }

  /**
   * Mark customer as unsubscribed from email.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async unsubscribeCustomerEmail(client, customerId) {
    await client.query(
      `UPDATE customers
       SET email_subscribed = false,
           email_unsubscribed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND (email_subscribed IS DISTINCT FROM false)`,
      [customerId]
    );
  }

  /**
   * Check whether an email_unsubscribed journey event already exists.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} emailMessageId
   * @param {number} customerId
   * @returns {Promise<boolean>}
   */
  async hasJourneyEmailUnsubscribed(client, emailMessageId, customerId) {
    const result = await client.query(
      `SELECT 1 FROM customer_journey
       WHERE id_email_message = $1 AND id_customer = $2 AND event_type = 'email_unsubscribed'
       LIMIT 1`,
      [emailMessageId, customerId]
    );
    return result.rows.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Click tracking
  // ---------------------------------------------------------------------------

  /**
   * Select email_message by tracking token with FOR UPDATE lock (click flow).
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {string} token
   * @returns {Promise<{id, id_campaign, id_customer, id_run}|null>}
   */
  async findEmailMessageByTokenForUpdate(client, token) {
    const result = await client.query(
      `SELECT id, id_campaign, id_customer, id_run
       FROM email_messages
       WHERE tracking_token = $1
       FOR UPDATE`,
      [token]
    );
    return result.rows[0] || null;
  }

  /**
   * Update email_messages click counters by message id.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} emailMessageId
   * @returns {Promise<void>}
   */
  async updateEmailMessageOnClick(client, emailMessageId) {
    await client.query(
      `UPDATE email_messages
       SET click_count = COALESCE(click_count, 0) + 1,
           first_clicked_at = COALESCE(first_clicked_at, CURRENT_TIMESTAMP),
           status = CASE
             WHEN status IN ('pending', 'queued', 'sent', 'delivered', 'opened') THEN 'clicked'
             ELSE status
           END
       WHERE id = $1`,
      [emailMessageId]
    );
  }

  /**
   * Upsert campaign_customers click stats.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} campaignId
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async upsertCampaignCustomerClick(client, campaignId, customerId) {
    await client.query(
      `INSERT INTO campaign_customers (
        id_campaign, id_customer, joined_at,
        email_clicked_count, has_clicked,
        first_email_clicked_at, last_email_clicked_at,
        last_activity_at, updated_at
       )
       VALUES ($1, $2, CURRENT_TIMESTAMP, 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (id_campaign, id_customer)
       DO UPDATE SET
         email_clicked_count = campaign_customers.email_clicked_count + 1,
         has_clicked = TRUE,
         first_email_clicked_at = COALESCE(campaign_customers.first_email_clicked_at, CURRENT_TIMESTAMP),
         last_email_clicked_at = CURRENT_TIMESTAMP,
         last_activity_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [campaignId, customerId]
    );
  }

  /**
   * Increment campaigns.total_clicked counter.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async incrementCampaignTotalClicked(client, campaignId) {
    await client.query(
      'UPDATE campaigns SET total_clicked = COALESCE(total_clicked, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [campaignId]
    );
  }

  /**
   * Update email_messages open counters by message id (inferred open from click).
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} emailMessageId
   * @returns {Promise<void>}
   */
  async updateEmailMessageOnInferredOpen(client, emailMessageId) {
    await client.query(
      `UPDATE email_messages
       SET open_count = COALESCE(open_count, 0) + 1,
           first_opened_at = COALESCE(first_opened_at, CURRENT_TIMESTAMP),
           last_opened_at = CURRENT_TIMESTAMP,
           status = CASE
             WHEN status IN ('pending', 'queued', 'sent', 'delivered') THEN 'opened'
             ELSE status
           END
       WHERE id = $1`,
      [emailMessageId]
    );
  }

  /**
   * Update campaign_customers open stats for a specific customer (inferred open from click).
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} campaignId
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async updateCampaignCustomerInferredOpen(client, campaignId, customerId) {
    await client.query(
      `UPDATE campaign_customers
       SET email_opened_count = COALESCE(email_opened_count, 0) + 1,
           has_opened = TRUE,
           first_email_opened_at = COALESCE(first_email_opened_at, CURRENT_TIMESTAMP),
           last_email_opened_at = CURRENT_TIMESTAMP,
           last_activity_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_campaign = $1 AND id_customer = $2`,
      [campaignId, customerId]
    );
  }

  /**
   * Check whether an email_clicked journey event already exists for a specific link.
   * Runs inside a transaction — accepts client.
   *
   * @param {object} client pg transaction client
   * @param {number} emailMessageId
   * @param {number} customerId
   * @param {string} resolvedLinkKey
   * @returns {Promise<boolean>}
   */
  async hasJourneyEmailClicked(client, emailMessageId, customerId, resolvedLinkKey) {
    const result = await client.query(
      `SELECT 1
       FROM customer_journey
       WHERE id_email_message = $1
         AND id_customer = $2
         AND event_type = 'email_clicked'
         AND (
           COALESCE(event_data ->> 'linkKey', event_data ->> 'targetUrl', '') = $3
         )
       LIMIT 1`,
      [emailMessageId, customerId, resolvedLinkKey]
    );
    return result.rows.length > 0;
  }
}

export default new CustomerEmailTrackingRepository();
