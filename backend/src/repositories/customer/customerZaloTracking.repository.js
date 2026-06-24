import db from '../../config/database.js';

class CustomerZaloTrackingRepository {
  async getCampaignUserId(client, campaignId) {
    const result = await client.query(
      `SELECT id_user
       FROM campaigns
       WHERE id = $1
       LIMIT 1`,
      [campaignId]
    );
    return result.rows[0]?.id_user ?? null;
  }

  async findCustomerByZaloUid(client, userId, zaloUid) {
    const result = await client.query(
      `SELECT id
       FROM customers
       WHERE id_user = $1
         AND zalo_id = $2
       ORDER BY id ASC
       LIMIT 1`,
      [userId, zaloUid]
    );
    return result.rows[0]?.id ?? null;
  }

  async createPlaceholderCustomerByZaloUid(client, userId, zaloUid) {
    const result = await client.query(
      `INSERT INTO customers
         (id_user, zalo_id, customer_source, utm_source, created_at, updated_at)
       VALUES
         ($1, $2, 'uknow_campaign', 'zalo_person_campaign', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, zaloUid]
    );
    return result.rows[0]?.id ?? null;
  }

  async findZaloMessageByToken(client, token) {
    const result = await client.query(
      `SELECT id, id_campaign, id_run, id_customer, group_id, channel
       FROM zalo_messages
       WHERE tracking_token = $1
       FOR UPDATE`,
      [token]
    );
    return result.rows[0] ?? null;
  }

  async incrementZaloMessageClickCount(client, messageId, metadata) {
    const result = await client.query(
      `UPDATE zalo_messages
       SET click_count = COALESCE(click_count, 0) + 1,
           first_clicked_at = COALESCE(first_clicked_at, CURRENT_TIMESTAMP),
           last_clicked_at = CURRENT_TIMESTAMP,
           tracking_metadata = COALESCE(tracking_metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING click_count`,
      [messageId, JSON.stringify(metadata)]
    );
    return Number(result.rows[0]?.click_count || 0);
  }

  async setZaloMessageCustomer(client, messageId, customerId) {
    await client.query(
      `UPDATE zalo_messages
       SET id_customer = COALESCE(id_customer, $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [messageId, customerId]
    );
  }

  async linkZaloUidToCustomer(client, customerId, zaloUid) {
    await client.query(
      `UPDATE customers
       SET zalo_id = CASE
                       WHEN zalo_id IS NULL OR zalo_id = '' THEN $1
                       ELSE zalo_id
                     END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [zaloUid, customerId]
    );
  }

  async insertZaloClickJourney(client, { customerId, campaignId, runId, channel, messageId, eventData }) {
    await client.query(
      `INSERT INTO customer_journey
         (id_customer, id_campaign, id_run, event_type, event_channel, id_zalo_message, event_data, event_at)
       VALUES
         ($1, $2, $3, 'zalo_clicked', $4, $5, $6::jsonb, CURRENT_TIMESTAMP)`,
      [customerId, campaignId, runId || null, channel, messageId, JSON.stringify(eventData)]
    );
  }

  async findExistingPersonalZaloClickJourney(client, { messageId, channel, customerId, linkKey }) {
    const result = await client.query(
      `SELECT id
       FROM customer_journey
       WHERE event_type = 'zalo_clicked'
         AND id_zalo_message = $1
         AND event_channel = $2
         AND id_customer IS NOT DISTINCT FROM $3
         AND COALESCE(event_data ->> 'linkKey', event_data ->> 'targetUrl', '') = $4
       LIMIT 1`,
      [messageId, channel, customerId, linkKey]
    );
    return result.rows.length > 0;
  }

  async insertZaloSentJourney({
    customerId,
    campaignId,
    runId,
    nodeId,
    eventChannel,
    zaloMessageId,
    eventData,
  }) {
    await db.query(
      `INSERT INTO customer_journey
         (id_customer, id_campaign, id_run, id_node, event_type, event_channel, id_zalo_message, event_data, event_at)
       VALUES
         ($1, $2, $3, $4, 'zalo_sent', $5, $6, $7::jsonb, CURRENT_TIMESTAMP)`,
      [customerId, campaignId, runId, nodeId, eventChannel, zaloMessageId, JSON.stringify(eventData)]
    );
  }
}

export default new CustomerZaloTrackingRepository();
