import db from '../../config/database.js';

class FounderaiSyncRepository {
  /**
   * Find journey attribution by matching order_id in event_data.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} customerId
   * @param {string} orderId
   * @returns {Promise<{id_campaign: number|null, id_run: number|null, id_email_message: number|null, id_zalo_message: number|null}|null>}
   */
  async findJourneyByOrderId(client, customerId, orderId) {
    const result = await client.query(
      `SELECT id_campaign, id_run, id_email_message, id_zalo_message
       FROM customer_journey
       WHERE id_customer = $1
         AND (
           COALESCE(event_data->>'order_id', '') = $2
           OR COALESCE(event_data->>'orderId', '') = $2
         )
       ORDER BY event_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [customerId, String(orderId)]
    );
    return result.rows[0] || null;
  }

  /**
   * Find most recent journey entry for a customer before a given date
   * that has at least one attribution id set.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} customerId
   * @param {string|Date} purchaseDate
   * @returns {Promise<{id_campaign: number|null, id_run: number|null, id_email_message: number|null, id_zalo_message: number|null}|null>}
   */
  async findRecentJourneyBefore(client, customerId, purchaseDate) {
    const result = await client.query(
      `SELECT id_campaign, id_run, id_email_message, id_zalo_message
       FROM customer_journey
       WHERE id_customer = $1
         AND event_at <= $2
         AND (
           id_run IS NOT NULL
           OR id_email_message IS NOT NULL
           OR id_zalo_message IS NOT NULL
           OR id_campaign IS NOT NULL
         )
       ORDER BY event_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [customerId, purchaseDate]
    );
    return result.rows[0] || null;
  }

  /**
   * Find an existing journey event for a customer+eventType+orderId combination.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} customerId
   * @param {string} eventType
   * @param {string} orderId
   * @returns {Promise<{id: number}|null>}
   */
  async findJourneyOrderEvent(client, customerId, eventType, orderId) {
    const result = await client.query(
      `SELECT id
       FROM customer_journey
       WHERE id_customer = $1
         AND event_type = $2
         AND (
           COALESCE(event_data->>'order_id', '') = $3
           OR COALESCE(event_data->>'orderId', '') = $3
         )
       ORDER BY id DESC
       LIMIT 1`,
      [customerId, eventType, orderId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update an existing journey event row with attribution and event data.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} journeyId
   * @param {object} params
   * @param {number|null} params.campaignId
   * @param {number|null} params.runId
   * @param {number|null} params.emailMessageId
   * @param {number|null} params.zaloMessageId
   * @param {string} params.eventChannel
   * @param {string} params.eventDataJson
   * @param {string|null} params.purchaseDate
   * @returns {Promise<void>}
   */
  async updateJourneyOrderEvent(client, journeyId, {
    campaignId,
    runId,
    emailMessageId,
    zaloMessageId,
    eventChannel,
    eventDataJson,
    purchaseDate,
  }) {
    await client.query(
      `UPDATE customer_journey
       SET
         id_campaign = COALESCE($1, id_campaign),
         id_run = COALESCE($2, id_run),
         id_email_message = COALESCE($3, id_email_message),
         id_zalo_message = COALESCE($4, id_zalo_message),
         event_channel = COALESCE($5, event_channel),
         event_data = $6::jsonb,
         event_at = COALESCE($7, event_at)
       WHERE id = $8`,
      [
        campaignId || null,
        runId || null,
        emailMessageId || null,
        zaloMessageId || null,
        eventChannel,
        eventDataJson,
        purchaseDate || null,
        journeyId,
      ]
    );
  }

  /**
   * Insert a new journey order event.
   *
   * @param {import('pg').PoolClient} client
   * @param {object} params
   * @param {number} params.customerId
   * @param {number|null} params.campaignId
   * @param {number|null} params.runId
   * @param {string} params.eventType
   * @param {string} params.eventChannel
   * @param {number|null} params.emailMessageId
   * @param {number|null} params.zaloMessageId
   * @param {string} params.eventDataJson
   * @param {string} params.purchaseDate
   * @returns {Promise<void>}
   */
  async insertJourneyOrderEvent(client, {
    customerId,
    campaignId,
    runId,
    eventType,
    eventChannel,
    emailMessageId,
    zaloMessageId,
    eventDataJson,
    purchaseDate,
  }) {
    await client.query(
      `INSERT INTO customer_journey (
          id_customer, id_campaign, id_run, event_type, event_channel,
          id_email_message, id_zalo_message, event_data, event_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        customerId,
        campaignId || null,
        runId || null,
        eventType,
        eventChannel,
        emailMessageId || null,
        zaloMessageId || null,
        eventDataJson,
        purchaseDate || new Date().toISOString(),
      ]
    );
  }

  /**
   * Find all existing customer_purchases for a given customer + order_id.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} customerId
   * @param {string} orderId
   * @returns {Promise<{id: number, id_campaign: number|null, id_run: number|null, id_email_message: number|null}[]>}
   */
  async findPurchasesByOrderId(client, customerId, orderId) {
    const result = await client.query(
      `SELECT id, id_campaign, id_run, id_email_message
       FROM customer_purchases
       WHERE id_customer = $1
         AND order_id = $2
       ORDER BY id DESC`,
      [customerId, String(orderId)]
    );
    return result.rows;
  }

  /**
   * Enrich existing purchases (by customer + order_id) with attribution data,
   * only filling in NULL fields.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} customerId
   * @param {string} orderId
   * @param {object} attribution
   * @param {number|null} attribution.campaignId
   * @param {number|null} attribution.runId
   * @param {number|null} attribution.emailMessageId
   * @returns {Promise<number>} number of rows updated
   */
  async enrichPurchaseAttribution(client, customerId, orderId, { campaignId, runId, emailMessageId }) {
    const result = await client.query(
      `UPDATE customer_purchases
       SET
         id_campaign = COALESCE(id_campaign, $1::bigint),
         id_run = COALESCE(id_run, $2::integer),
         id_email_message = COALESCE(id_email_message, $3::bigint)
       WHERE id_customer = $4
         AND order_id = $5
         AND (
           (id_campaign IS NULL AND $1::bigint IS NOT NULL)
           OR (id_run IS NULL AND $2::integer IS NOT NULL)
           OR (id_email_message IS NULL AND $3::bigint IS NOT NULL)
         )`,
      [
        campaignId,
        runId,
        emailMessageId,
        customerId,
        String(orderId),
      ]
    );
    return result.rowCount || 0;
  }

  /**
   * Find an existing customer_purchase for a given customer + order_id + product_name.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} customerId
   * @param {string} orderId
   * @param {string} productName
   * @returns {Promise<{id: number, id_campaign: number|null}|null>}
   */
  async findPurchaseByOrderAndProduct(client, customerId, orderId, productName) {
    const result = await client.query(
      `SELECT id, id_campaign
       FROM customer_purchases
       WHERE id_customer = $1
         AND order_id = $2
         AND product_name = $3
       LIMIT 1`,
      [customerId, String(orderId), productName]
    );
    return result.rows[0] || null;
  }

  /**
   * Insert a new customer_purchase row. When hasOrderStatus is true the
   * order_status column is included; otherwise it is omitted.
   *
   * @param {import('pg').PoolClient} client
   * @param {boolean} hasOrderStatus
   * @param {object} params
   * @returns {Promise<void>}
   */
  async insertPurchase(client, hasOrderStatus, {
    customerId,
    courseId,
    productName,
    purchaseStage,
    lineTotal,
    currency,
    purchaseDate,
    orderId,
    orderStatus,
    paymentMethod,
    campaignId,
    runId,
    emailMessageId,
  }) {
    if (hasOrderStatus) {
      await client.query(
        `INSERT INTO customer_purchases (
            id_customer, id_course, product_name, product_type,
            amount, currency, purchase_date, order_id, order_status, payment_method,
            id_campaign, id_run, id_email_message
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          customerId,
          courseId,
          productName,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          String(orderId),
          orderStatus,
          paymentMethod,
          campaignId,
          runId,
          emailMessageId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO customer_purchases (
            id_customer, id_course, product_name, product_type,
            amount, currency, purchase_date, order_id, payment_method,
            id_campaign, id_run, id_email_message
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          customerId,
          courseId,
          productName,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          String(orderId),
          paymentMethod,
          campaignId,
          runId,
          emailMessageId,
        ]
      );
    }
  }

  /**
   * Insert a new customer_purchase row for syncOrder (single-order sync).
   * Includes id_campaign but no id_run / id_email_message.
   *
   * @param {import('pg').PoolClient} client
   * @param {boolean} hasOrderStatus
   * @param {object} params
   * @returns {Promise<void>}
   */
  async insertPurchaseSingle(client, hasOrderStatus, {
    customerId,
    courseId,
    productName,
    purchaseStage,
    lineTotal,
    currency,
    purchaseDate,
    orderId,
    orderStatus,
    paymentMethod,
    campaignId,
  }) {
    if (hasOrderStatus) {
      await client.query(
        `INSERT INTO customer_purchases (
            id_customer, id_course, product_name, product_type,
            amount, currency, purchase_date, order_id, order_status, payment_method, id_campaign
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          customerId,
          courseId,
          productName,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          String(orderId),
          orderStatus,
          paymentMethod,
          campaignId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO customer_purchases (
            id_customer, id_course, product_name, product_type,
            amount, currency, purchase_date, order_id, payment_method, id_campaign
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          customerId,
          courseId,
          productName,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          String(orderId),
          paymentMethod,
          campaignId,
        ]
      );
    }
  }

  /**
   * Update an existing customer_purchase row. When hasOrderStatus is true the
   * order_status column is updated; otherwise it is omitted.
   *
   * @param {import('pg').PoolClient} client
   * @param {boolean} hasOrderStatus
   * @param {number} purchaseId
   * @param {object} params
   * @returns {Promise<void>}
   */
  async updatePurchase(client, hasOrderStatus, purchaseId, {
    courseId,
    purchaseStage,
    lineTotal,
    currency,
    purchaseDate,
    orderStatus,
    paymentMethod,
    campaignId,
    runId,
    emailMessageId,
  }) {
    if (hasOrderStatus) {
      await client.query(
        `UPDATE customer_purchases
         SET
           id_course = COALESCE($1, id_course),
           product_type = COALESCE($2, product_type),
           amount = $3,
           currency = COALESCE($4, currency),
           purchase_date = COALESCE($5, purchase_date),
           order_status = COALESCE($6, order_status),
           payment_method = COALESCE($7, payment_method),
           id_campaign = COALESCE(id_campaign, $8),
           id_run = COALESCE(id_run, $9),
           id_email_message = COALESCE(id_email_message, $10)
         WHERE id = $11`,
        [
          courseId,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          orderStatus,
          paymentMethod,
          campaignId,
          runId,
          emailMessageId,
          purchaseId,
        ]
      );
    } else {
      await client.query(
        `UPDATE customer_purchases
         SET
           id_course = COALESCE($1, id_course),
           product_type = COALESCE($2, product_type),
           amount = $3,
           currency = COALESCE($4, currency),
           purchase_date = COALESCE($5, purchase_date),
           payment_method = COALESCE($6, payment_method),
           id_campaign = COALESCE(id_campaign, $7),
           id_run = COALESCE(id_run, $8),
           id_email_message = COALESCE(id_email_message, $9)
         WHERE id = $10`,
        [
          courseId,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          paymentMethod,
          campaignId,
          runId,
          emailMessageId,
          purchaseId,
        ]
      );
    }
  }

  /**
   * Update an existing customer_purchase row for syncOrder (single-order sync).
   * Updates id_campaign but no id_run / id_email_message parameters.
   *
   * @param {import('pg').PoolClient} client
   * @param {boolean} hasOrderStatus
   * @param {number} purchaseId
   * @param {object} params
   * @returns {Promise<void>}
   */
  async updatePurchaseSingle(client, hasOrderStatus, purchaseId, {
    courseId,
    purchaseStage,
    lineTotal,
    currency,
    purchaseDate,
    orderStatus,
    paymentMethod,
    campaignId,
  }) {
    if (hasOrderStatus) {
      await client.query(
        `UPDATE customer_purchases
         SET
           id_course = COALESCE($1, id_course),
           product_type = $2,
           amount = $3,
           currency = COALESCE($4, currency),
           purchase_date = COALESCE($5, purchase_date),
           order_status = $6,
           payment_method = COALESCE($7, payment_method),
           id_campaign = COALESCE(id_campaign, $8)
         WHERE id = $9`,
        [
          courseId,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          orderStatus,
          paymentMethod,
          campaignId,
          purchaseId,
        ]
      );
    } else {
      await client.query(
        `UPDATE customer_purchases
         SET
           id_course = COALESCE($1, id_course),
           product_type = $2,
           amount = $3,
           currency = COALESCE($4, currency),
           purchase_date = COALESCE($5, purchase_date),
           payment_method = COALESCE($6, payment_method),
           id_campaign = COALESCE(id_campaign, $7)
         WHERE id = $8`,
        [
          courseId,
          purchaseStage,
          lineTotal,
          currency,
          purchaseDate,
          paymentMethod,
          campaignId,
          purchaseId,
        ]
      );
    }
  }

  /**
   * Check whether a campaign belongs to a given user.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} campaignId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async campaignBelongsToUser(client, campaignId, userId) {
    const result = await client.query(
      'SELECT id FROM campaigns WHERE id = $1 AND id_user = $2 LIMIT 1',
      [campaignId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Fetch all customers enrolled in a campaign (id, email, phone).
   *
   * @param {import('pg').PoolClient} client
   * @param {number} campaignId
   * @returns {Promise<{id: number, email: string|null, phone: string|null}[]>}
   */
  async findCampaignCustomers(client, campaignId) {
    const result = await client.query(
      `SELECT c.id, c.email, c.phone
       FROM campaign_customers cc
       JOIN customers c ON c.id = cc.id_customer
       WHERE cc.id_campaign = $1`,
      [campaignId]
    );
    return result.rows;
  }

  /**
   * Update the uknow_status of a campaign_customer row.
   *
   * @param {import('pg').PoolClient} client
   * @param {string} newStatus
   * @param {number} campaignId
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async updateCampaignCustomerUknowStatus(client, newStatus, campaignId, customerId) {
    await client.query(
      `UPDATE campaign_customers
       SET uknow_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id_campaign = $2 AND id_customer = $3`,
      [newStatus, campaignId, customerId]
    );
  }
}

export default new FounderaiSyncRepository();
